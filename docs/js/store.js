// Settings and player statistics, persisted in localStorage (no backend, no cookies).
import { unlocked } from './achievements.js';

const KS = 'tavolo.settings.v1', KT = 'tavolo.stats.v1';

const load = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export const settings = Object.assign({ lang: 'auto', theme: 'auto', cb: false, zoom: 1, speed: 1, sound: true, still: false, last: {} }, load(KS));
export const saveSettings = () => save(KS, settings);

let stats = load(KT);
export const getStats = () => stats;
export const resetStats = () => { stats = {}; save(KT, stats); };

/** True when animations should be skipped: the system preference or the app's own setting. */
export const calm = () => settings.still || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

const LOG = '_log', LOG_MAX = 400;
/** Recent results, oldest first: [time, gameId, 'w' | 'l' | 't', difficulty]. */
export const getHistory = () => (Array.isArray(stats[LOG]) ? stats[LOG] : []);

export function exportData() {
  return JSON.stringify({ app: 'tavolo', version: 1, exported: new Date().toISOString(), stats }, null, 2);
}
/** Replaces the statistics with a previously exported file. Returns false when the file is not a Tavolo export. */
export function importData(text) {
  let d;
  try { d = JSON.parse(text); } catch { return false; }
  if (!d || d.app !== 'tavolo' || typeof d.stats !== 'object' || !d.stats || Array.isArray(d.stats)) return false;
  const clean = {};
  for (const [k, v] of Object.entries(d.stats)) {
    if (k === LOG) { if (Array.isArray(v)) clean[LOG] = v.filter(x => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string').slice(-LOG_MAX); }
    else if (v && typeof v === 'object' && Number.isFinite(v.played)) clean[k] = v;
  }
  stats = clean; save(KT, stats);
  return true;
}

export function record(gameId, result, opts = {}) {
  const before = new Set(unlocked(stats));
  const s = stats[gameId] || (stats[gameId] = { played: 0, won: 0, lost: 0, tied: 0, streak: 0, bestStreak: 0, bestScore: 0 });
  s.played++;
  if (result.outcome === 'win') { s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  else { s.streak = 0; if (result.outcome === 'lose') s.lost++; else s.tied++; }
  s.bestScore = Math.max(s.bestScore, result.score || 0);
  s.last = Date.now();
  const d = opts.difficulty;
  if (d) {
    const by = (s.diff ||= {})[d] ||= { played: 0, won: 0 };
    by.played++; if (result.outcome === 'win') by.won++;
  }
  const log = (stats[LOG] ||= []);
  log.push([s.last, gameId, result.outcome[0], d || '']);
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  save(KT, stats);
  const fresh = unlocked(stats).filter(id => !before.has(id));
  if (fresh.length && typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent('tavolo:achievement', { detail: fresh }));
  return fresh;
}
