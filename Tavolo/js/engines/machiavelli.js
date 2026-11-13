// Machiavelli engine: rummy without discards where every combination on the table can be rearranged.
import { buildDeck, shuffle } from '../cards.js';
import { analyze } from './rummy.js';

export function createMachiavelliGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const stock = [];
  for (let k = 0; k < R.decks; k++) stock.push(...buildDeck(def.deck).map(c => ({ ...c, id: `${c.id}-${k}` })));
  shuffle(stock, rng);
  const P = Array.from({ length: n }, () => ({ hand: stock.splice(-def.setup.handSize) }));
  let groups = [], snap = null, dirty = false, passes = 0;
  const g = { kind: 'machiavelli', n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', current: Math.floor(rng() * n), winner: null, summary: null };

  const valid = cs => cs.length >= 3 && !!analyze(cs, 0);
  const fail = reason => ({ ok: false, reason });
  const begin = () => { snap = { groups: groups.map(x => x.slice()), hand: P[g.current].hand.slice() }; dirty = false; };
  begin();
  const played = () => snap.hand.length - P[g.current].hand.length;
  function next() {
    g.current = (g.current + 1) % n;
    if (passes >= n) {                                   // nobody can move and the deck is empty
      const least = Math.min(...P.map(p => p.hand.length));
      g.winner = P.findIndex(p => p.hand.length === least); g.phase = 'over';
    }
    begin();
  }

  /** Move cards (from the hand or from the table) into a new combination ('new') or into combination number `target`. */
  g.move = (ids, target) => {
    if (g.phase !== 'play' || !ids.length) return fail('turn');
    const p = P[g.current], dest = target === 'new' ? [] : groups[target];
    if (!dest) return fail('invalid');
    const cards = [];
    for (const id of ids) {
      const h = p.hand.find(c => c.id === id);
      if (h) { p.hand = p.hand.filter(c => c !== h); cards.push(h); continue; }
      for (const gr of groups) {
        const k = gr.findIndex(c => c.id === id);
        if (k >= 0 && gr !== dest) { cards.push(gr.splice(k, 1)[0]); break; }
      }
    }
    if (!cards.length) return fail('invalid');
    dest.push(...cards);
    if (target === 'new') groups.push(dest);
    groups = groups.filter(x => x.length);
    dirty = true;
    return { ok: true };
  };

  /** Put hand and table back as they were at the start of the turn. */
  g.reset = () => { groups = snap.groups.map(x => x.slice()); P[g.current].hand = snap.hand.slice(); dirty = false; };

  g.endTurn = () => {
    if (g.phase !== 'play') return fail('turn');
    if (!groups.every(valid)) return fail('machFix');
    if (played() < 1) return fail('machPlayOne');
    passes = 0;
    if (!P[g.current].hand.length) { g.winner = g.current; g.phase = 'over'; return { ok: true }; }
    next();
    return { ok: true };
  };

  g.drawCard = () => {
    if (g.phase !== 'play') return fail('turn');
    if (dirty) return fail('machReset');
    if (stock.length) { P[g.current].hand.push(stock.pop()); passes = 0; } else passes++;
    next();
    return { ok: true };
  };

  const shown = cs => { const a = analyze(cs, 0); return a ? a.cards : cs.slice().sort((x, y) => x.s.localeCompare(y.s) || x.r - y.r); };
  g.view = () => ({
    players: P.map(p => ({ hand: p.hand, handCount: p.hand.length })),
    groups: groups.map(cs => ({ cards: shown(cs), valid: valid(cs) })),
    stock: stock.length, dirty, played: played(), canEnd: groups.every(valid) && played() > 0
  });

  g.result = () => ({ outcome: g.winner === 0 ? 'win' : 'lose', score: 0, scores: P.map(p => p.hand.length), lowWins: true });

  // ---------- bots and hints ----------
  // a combination inside `cards`; with `must`, one that contains that card
  function findMeld(cards, must) {
    const byRank = {}, bySuit = {};
    (must ? [must, ...cards.filter(c => c !== must)] : cards).forEach(c => {
      (byRank[c.r] ||= {})[c.s] ||= c;
      (bySuit[c.s] ||= {})[c.r] ||= c;
    });
    const ok = cs => !must || cs.includes(must);
    for (const r in byRank) { const cs = Object.values(byRank[r]); if (cs.length >= 3 && ok(cs)) return cs; }
    for (const s in bySuit) {
      const get = v => bySuit[s][v === 14 ? 1 : v];
      for (let v = 1; v <= 12; v++) {
        if (!get(v)) continue;
        let e = v;
        while (e < 14 && get(e + 1) && !(e + 1 === 14 && v === 1)) e++;
        const seq = [];
        for (let x = v; x <= e; x++) seq.push(get(x));
        if (seq.length >= 3 && ok(seq)) return seq;
        v = e;
      }
    }
    return null;
  }
  // table cards that can be taken away leaving their combination valid
  const spare = () => groups.flatMap((gr, gi) => (gr.length >= 4 && valid(gr) ? gr.filter(x => valid(gr.filter(c => c !== x))).map(x => ({ x, gi })) : []));
  // next useful thing to do with the cards in hand.
  // depth 1 also borrows one spare card from the table; depth 2 also splits runs and borrows two cards.
  function nextPlay(p, depth) {
    const deep = depth >= 1;
    const m = findMeld(p.hand);
    if (m) return { ids: m.map(c => c.id), target: 'new' };
    for (const c of p.hand) {
      const k = groups.findIndex(gr => valid([...gr, c]));
      if (k >= 0) return { ids: [c.id], target: k };
    }
    if (deep) for (const gr of groups) {
      if (gr.length < 4 || !valid(gr)) continue;
      for (const x of gr) {
        if (!valid(gr.filter(c => c !== x))) continue;        // the combination must survive without it
        const m2 = findMeld([x, ...p.hand], x);
        if (m2) return { ids: m2.map(c => c.id), target: 'new' };
      }
    }
    if (depth >= 2) {
      for (const c of p.hand) for (const gr of groups) {        // split a run around a twin of a card in hand
        const a = analyze(gr, 0);
        if (!a || a.type !== 'run') continue;
        const k = a.cards.findIndex(x => x.r === c.r && x.s === c.s), tail = a.cards.slice(k + 1);
        if (k >= 2 && tail.length >= 2 && valid([c, ...tail])) return { ids: [c.id, ...tail.map(x => x.id)], target: 'new' };
      }
      const sp = spare();
      for (const c of p.hand) for (let a = 0; a < sp.length; a++) for (let b = a + 1; b < sp.length; b++)
        if (sp[a].gi !== sp[b].gi && valid([c, sp[a].x, sp[b].x])) return { ids: [c.id, sp[a].x.id, sp[b].x.id], target: 'new' };
    }
    return null;
  }

  g.botStep = (level = diff) => {
    const i = g.current, p = P[i];
    const mv = level === 'easy' && !dirty && rng() < 0.35 ? null : nextPlay(p, level === 'hard' ? 2 : level === 'medium' ? 1 : 0);
    if (mv) { g.move(mv.ids, mv.target); return { type: mv.target === 'new' ? 'meld' : 'layoff', p: i }; }
    if (dirty && g.endTurn().ok) return { type: 'end', p: i };
    if (dirty) g.reset();
    g.drawCard();
    return { type: 'draw', from: 'stock', p: i };
  };

  g.hint = () => {
    const mv = nextPlay(P[g.current], 2);
    return mv ? { ids: mv.ids, group: mv.target } : dirty && groups.every(valid) ? { end: true } : { pile: 'stock' };
  };

  return g;
}
