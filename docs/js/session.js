// Saving and resuming a game in progress.
// Engines are deterministic for a given random seed, so a game is stored as: seed + the list of actions applied to it.
// Resuming means dealing again with the same seed and replaying the actions.
import { ENGINES } from './engines/index.js';

const KEY = 'tavolo.resume.v1', VERSION = 1;
// every engine method that changes the state of a game
const ACTIONS = ['play', 'advance', 'nextRound', 'draw', 'meld', 'layoff', 'revert', 'discard', 'botStep', 'move', 'reset', 'endTurn',
  'drawCard', 'hit', 'stand', 'bet', 'putBack', 'bankStep', 'tap', 'moveTo', 'undo', 'newDeal', 'autoStep'];

function seeded(seed) {                                   // mulberry32, with a counter of the numbers drawn
  let a = seed >>> 0, n = 0;
  const rng = () => {
    n++;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.count = () => n;
  return rng;
}

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === VERSION && Array.isArray(s.log) ? s : null;
  } catch { return null; }
}
let current = null;                                       // the session being played, as it is stored
const persist = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or unavailable */ } };
/** Keeps something next to the saved game that cannot be rebuilt by replaying it (the game log, the last trick). */
export function setExtra(patch) {
  if (!current) return;
  current.extra = { ...(current.extra || {}), ...patch };
  persist(current);
}
export function clearSession() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

function build(def, opts, session) {
  const rng = seeded(session.seed), log = session.log;
  const g = ENGINES[def.engine](def, { ...opts, rng });
  for (const [name, at, args] of log) {                   // replay: same random numbers, same actions
    if (rng.count() > at) throw new Error('replay diverged');
    while (rng.count() < at) rng();
    g[name](...args);
  }
  const save = () => persist(session);
  current = session;
  let depth = 0;
  for (const name of ACTIONS) {
    const fn = g[name];
    if (typeof fn !== 'function') continue;
    g[name] = (...args) => {
      const at = rng.count();
      depth++;
      try { return fn(...args); } finally {
        depth--;
        if (!depth) { log.push([name, at, args]); save(); }   // only what the table asked for, not the engine's own inner calls
      }
    };
  }
  save();
  return g;
}

/** Creates a game. With `resume` (a stored session) the game continues from where it was left. */
export function newGame(def, opts, resume) {
  if (resume) {
    try { return build(def, opts, resume); } catch { clearSession(); }
  }
  return build(def, opts, { v: VERSION, id: def.id, opts, seed: (Math.random() * 4294967296) >>> 0, log: [] });
}
