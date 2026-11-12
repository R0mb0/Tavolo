// Shedding engine (Danish family): play equal or higher on the pile, get rid of every card.
import { buildDeck, shuffle } from '../cards.js';

export function createSheddingGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const val = r => (r === 1 ? 14 : r);                 // Ace is high
  const wild = new Set(R.wild);                        // ranks playable on anything
  const deck = shuffle(buildDeck(def.deck), rng);
  let pile = [], act = null;
  const P = Array.from({ length: n }, () => ({ hand: [], up: [], down: [] }));
  for (const z of ['down', 'up', 'hand']) for (let k = 0; k < R.stack; k++) for (const p of P) p[z].push(deck.pop());
  const sortHand = p => p.hand.sort((a, b) => val(a.r) - val(b.r));
  P.forEach(sortHand);

  const g = {
    kind: 'shedding', n, teams: false, nTeams: n, teamOf: i => i,
    phase: 'play', pending: false, current: Math.floor(rng() * n), lastEvent: null, summary: null, winner: null
  };

  const cost = c => (wild.has(c.r) ? 20 + (c.r === R.burn ? 1 : 0) : val(c.r));   // cheap cards go first, specials last
  // Before the first turn everybody may exchange cards between the hand and the face-up table cards.
  let picked = null;
  const starter = g.current;
  if (R.swap) {
    for (let i = 1; i < n; i++) {
      if (diff === 'easy') continue;
      const all = [...P[i].hand, ...P[i].up].sort((a, b) => cost(b) - cost(a));   // bots keep their best cards for later
      P[i].up = all.slice(0, R.stack); P[i].hand = all.slice(R.stack); sortHand(P[i]);
    }
    g.swap = true; g.current = 0;
  }
  function swapPlay(id, opt) {
    const p = P[0];
    if (opt && opt.ready) { g.swap = false; picked = null; g.current = starter; return; }
    const z = x => (p.hand.some(c => c.id === x) ? 'hand' : 'up');
    if (!picked || z(picked) === z(id)) { picked = picked === id ? null : id; return; }
    const a = z(picked) === 'hand' ? picked : id, b = a === picked ? id : picked;
    const ia = p.hand.findIndex(c => c.id === a), ib = p.up.findIndex(c => c.id === b);
    [p.hand[ia], p.up[ib]] = [p.up[ib], p.hand[ia]];
    sortHand(p); picked = null;
  }

  const top = () => pile[pile.length - 1];
  const can = c => !pile.length || wild.has(c.r) || val(c.r) >= val(top().r);
  // Cards are played from the hand first, then the face-up table cards, then the face-down ones (blind).
  const zone = i => (P[i].hand.length ? 'hand' : P[i].up.length ? 'up' : 'down');
  const burns = () => {
    const t = top();
    return !!t && (t.r === R.burn || (pile.length >= 4 && pile.slice(-4).every(c => c.r === t.r)));
  };

  g.legal = (i = g.current) => {
    if (g.swap) return [...P[0].hand, ...P[0].up];
    const z = zone(i);
    return z === 'down' ? P[i].down.map((_, k) => ({ id: 'down-' + k })) : P[i][z].filter(can);
  };

  /** Several cards of the same value can be played together: one option per possible count. */
  g.options = (id, i = g.current) => {
    const z = zone(i);
    if (z === 'down' || g.swap) return [];
    const c = P[i][z].find(x => x.id === id), rest = P[i][z].filter(x => x.r === c.r && x !== c);
    if (!rest.length) return [];
    return [0, ...rest.map((_, k) => k + 1)].map(k => { const cards = [c, ...rest.slice(0, k)]; return { ids: cards.map(x => x.id), cards }; });
  };

  g.play = (id, opt) => {
    if (g.swap) { swapPlay(id, opt); return; }
    const i = g.current, p = P[i], z = zone(i);
    g.pending = true;
    if (opt && opt.pickup) { act = 'pickup'; g.lastEvent = { type: 'pickup', p: i }; return; }
    if (z === 'down') {
      const c = p.down.splice(+id.split('-')[1], 1)[0], ok = can(c);
      pile.push(c);
      act = ok ? 'placed' : 'pickup';
    } else {
      const ids = (opt && opt.ids) || [id];
      pile.push(...p[z].filter(c => ids.includes(c.id)));
      p[z] = p[z].filter(c => !ids.includes(c.id));
      act = 'placed';
    }
    g.lastEvent = act === 'pickup' ? { type: 'pickup', p: i } : burns() ? { type: 'burn', p: i } : null;
  };

  g.flyTarget = () => (act === 'pickup' ? g.current : null);

  g.advance = () => {
    const i = g.current, p = P[i];
    let again = false;
    g.pending = false; g.lastEvent = null;
    if (act === 'pickup') { p.hand.push(...pile); pile = []; }
    else if (burns()) { pile = []; again = true; }
    while (p.hand.length < R.stack && deck.length) p.hand.push(deck.pop());
    sortHand(p);
    if (!p.hand.length && !p.up.length && !p.down.length) { g.winner = i; g.phase = 'over'; return; }
    if (!again) g.current = (i + 1) % n;
  };

  g.view = () => ({
    showScore: false, showPile: false, source: zone(0), swap: !!g.swap, picked, note: g.swap ? 'play.swapHint' : null,
    players: P.map(p => ({ hand: p.hand, handCount: p.hand.length, up: p.up, down: p.down.length, score: 0 })),
    center: pile.slice(-4).map(c => ({ card: c, p: null, hl: false })), pileCount: pile.length,
    deckCount: deck.length, trumpCard: null, trumpSuit: null, staged: null,
    actions: g.swap ? ['ready'] : g.phase === 'play' && !g.pending && g.current === 0 && zone(0) !== 'down' && !g.legal(0).length ? ['pickup'] : []
  });

  g.result = () => ({
    outcome: g.winner === 0 ? 'win' : 'lose', score: 0,
    scores: P.map(p => p.hand.length + p.up.length + p.down.length)   // cards left
  });

  g.botMove = (level = diff, exact = false) => {
    if (g.swap) {                                        // hint: bring the best cards to the table, then start
      const p = P[0], lo = p.up.reduce((a, b) => (cost(b) < cost(a) ? b : a)), hi = p.hand.reduce((a, b) => (cost(b) > cost(a) ? b : a));
      return cost(hi) > cost(lo) ? { id: picked === hi.id ? lo.id : hi.id } : { id: null, opt: { ready: true } };
    }
    const i = g.current, z = zone(i), L = g.legal(i);
    if (!L.length) return { id: null, opt: { pickup: true } };
    const any = () => L[Math.floor(rng() * L.length)];
    if (z === 'down' || (level === 'easy' && rng() < 0.5)) return { id: any().id };
    let pick = L.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    if (level === 'hard' && pile.length >= 6) pick = L.find(c => c.r === R.burn) || pick;
    // a little unpredictability also keeps purely mechanical play from going round in circles
    if (!exact && rng() < (level === 'hard' ? 0.07 : 0.15)) pick = any();
    const os = g.options(pick.id, i);
    return os.length && !wild.has(pick.r) ? { id: pick.id, opt: { ids: os[os.length - 1].ids } } : { id: pick.id };
  };

  g.hint = () => g.botMove('hard', true);

  return g;
}
