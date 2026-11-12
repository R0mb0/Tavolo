// Briscola chiamata engine: five players, an auction for the right to call a card, a secret partner.
import { buildDeck, shuffle, DECKS } from '../cards.js';

export function createCalledGame(def, opts) {
  const n = 5, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const order = R.rankOrder, suits = DECKS[def.deck].suits;
  const str = c => order.length - order.indexOf(c.r);
  const pts = c => R.cardPoints[c.r] || 0;
  const deck = shuffle(buildDeck(def.deck), rng);
  const P = Array.from({ length: n }, () => ({ hand: deck.splice(-def.setup.handSize) }));
  const first = Math.floor(rng() * n), score = [0, 0], own = Array(n).fill(0), active = new Set([0, 1, 2, 3, 4]);
  let bid = -1, bidder = null, trump = null, calledId = null;

  const g = {
    kind: 'trick', n, teams: false, nTeams: 2, phase: 'play', stage: 'bid', pending: false, current: first,
    trick: [], winner: null, lastEvent: null, summary: null, caller: null, holder: null, revealed: false
  };
  g.teamOf = i => (i === g.caller || i === g.holder ? 0 : 1);
  g.teamList = () => [[...new Set([g.caller, g.holder])], [0, 1, 2, 3, 4].filter(i => g.teamOf(i) === 1)];
  g.flyTarget = () => (g.stage === 'play' ? g.winner : null);

  const beats = (c, best) => (c.s === best.s ? str(c) > str(best) : c.s === trump);
  const leaderOf = trick => trick.reduce((b, t) => (beats(t.card, b.card) ? t : b));
  const trickPts = trick => trick.reduce((a, t) => a + pts(t.card), 0);

  g.legal = () => (g.stage === 'play' ? P[g.current].hand.slice() : []);

  g.play = (id, opt) => {
    const i = g.current;
    if (g.stage === 'bid') {
      if (opt.choice === 'pass') { active.delete(i); g.lastEvent = { type: 'pass', p: i }; }
      else { bid = +opt.choice; bidder = i; g.lastEvent = { type: 'bid', p: i, rank: order[bid] }; }
      g.pending = true;
    } else if (g.stage === 'suit') {
      trump = opt.choice; calledId = `${order[bid]}-${trump}`;
      g.holder = P.findIndex(p => p.hand.some(c => c.id === calledId));
      g.lastEvent = { type: 'call', p: i, card: { id: calledId, r: order[bid], s: trump, deck: def.deck } };
      g.pending = true;
    } else {
      const h = P[i].hand, c = h.splice(h.findIndex(x => x.id === id), 1)[0];
      g.trick.push({ p: i, card: c });
      g.lastEvent = null;
      if (c.id === calledId && !g.revealed) { g.revealed = true; if (i !== g.caller) g.lastEvent = { type: 'partner', p: i }; }
      if (g.trick.length === n) {
        g.winner = leaderOf(g.trick).p; g.pending = true;
        if (!g.lastEvent) g.lastEvent = { type: 'takes', p: g.winner, pts: trickPts(g.trick) };
      } else g.current = (i + 1) % n;
    }
  };

  g.advance = () => {
    g.pending = false;
    if (g.stage === 'bid') {
      if (bidder != null && (bid === order.length - 1 || (active.size === 1 && active.has(bidder)))) {
        g.caller = bidder; g.current = bidder; g.stage = 'suit';
      } else { do g.current = (g.current + 1) % n; while (!active.has(g.current)); }
    } else if (g.stage === 'suit') { g.stage = 'play'; g.current = first; }
    else {
      const w = g.winner, p = trickPts(g.trick);
      score[g.teamOf(w)] += p; own[w] += p;
      g.trick = []; g.winner = null; g.current = w;
      if (P.every(x => !x.hand.length)) g.phase = 'over';
    }
    g.lastEvent = null;
  };

  // what the human is asked during the auction
  function ask() {
    if (g.stage === 'bid') {
      const options = order.map((r, k) => ({ id: String(k), card: { id: `${r}-${suits[0]}`, r, s: suits[0], deck: def.deck } })).filter((_, k) => k > bid);
      if (!(bidder == null && active.size === 1)) options.push({ id: 'pass', text: 'ask.pass' });
      return { title: 'ask.bid', options };
    }
    return g.stage === 'suit' ? { title: 'ask.suit', options: suits.map(s => ({ id: s, suit: s })) } : null;
  }

  g.view = () => ({
    showScore: g.stage === 'play', showPile: false,
    players: P.map((p, i) => ({ hand: p.hand, handCount: p.hand.length, score: own[i] })),
    center: g.trick.map(t => ({ card: t.card, p: t.p, hl: g.pending && t.p === g.winner })),
    deckCount: 0, trumpCard: calledId ? { id: calledId, r: order[bid], s: trump, deck: def.deck } : null, trumpSuit: trump, staged: null,
    ask: g.phase === 'play' && !g.pending && g.current === 0 ? ask() : null
  });

  g.result = () => {
    const callersWin = score[0] > R.total / 2, mine = g.teamOf(0);
    return { outcome: (mine === 0) === callersWin ? 'win' : 'lose', score: score[mine], scores: score.slice() };
  };

  // ---------- bots ----------
  const power = (hand, s) => hand.filter(c => c.s === s).reduce((a, c) => a + pts(c) / 3 + 1.5, 0);
  const bestSuit = hand => suits.reduce((a, s) => (power(hand, s) > power(hand, a) ? s : a));
  const lacks = (hand, s) => order.findIndex(r => !hand.some(c => c.s === s && c.r === r));     // best card of the suit not in hand

  function botBid(i) {
    const hand = P[i].hand, s = bestSuit(hand), force = power(hand, s);
    const limit = force < 5 ? -1 : Math.min(order.length - 1, lacks(hand, s) + Math.floor((force - 5) / 1.5));
    const k = bid + 1;
    if (bidder == null && active.size === 1) return String(Math.max(0, Math.min(k, order.length - 1)));   // somebody has to call
    return k <= limit && !(diff === 'easy' && rng() < 0.3) ? String(k) : 'pass';
  }
  function botSuit(i) {
    const hand = P[i].hand, ranked = suits.slice().sort((a, b) => power(hand, b) - power(hand, a));
    return ranked.find(s => !hand.some(c => c.s === s && c.r === order[bid])) || ranked[0];
  }
  // who does player i believe to be on their side? The partner is secret until the called card is played.
  function mate(i, j) {
    if (g.revealed || i === g.holder) return g.teamOf(i) === g.teamOf(j);
    if (i === g.caller) return false;
    return j !== g.caller;
  }
  const keep = c => pts(c) + (c.s === trump ? 6 + str(c) * 0.5 : str(c) * 0.1);
  function botCard(i, level) {
    const legal = P[i].hand;
    if (level === 'easy' && rng() < 0.5) return legal[Math.floor(rng() * legal.length)];
    if (!g.trick.length) return legal.reduce((a, b) => (keep(b) < keep(a) ? b : a));
    const best = leaderOf(g.trick), tp = trickPts(g.trick), last = g.trick.length === n - 1, friendly = mate(i, best.p);
    let pick = null, top = -Infinity;
    for (const c of legal) {
      let v;
      if (beats(c, best.card)) v = (tp + pts(c)) * (last ? 1 : 0.6) - keep(c) * 0.6 - (friendly ? tp : 0);
      else if (friendly) v = pts(c) * (last ? 1 : 0.4) - keep(c) * 0.3;
      else v = -pts(c) - keep(c) * 0.3;
      if (v > top) { top = v; pick = c; }
    }
    return pick;
  }

  g.botMove = (level = diff) => {
    const i = g.current;
    if (g.stage === 'bid') return { id: null, opt: { choice: botBid(i) } };
    if (g.stage === 'suit') return { id: null, opt: { choice: botSuit(i) } };
    return { id: botCard(i, level).id };
  };
  g.hint = () => g.botMove('hard');

  return g;
}
