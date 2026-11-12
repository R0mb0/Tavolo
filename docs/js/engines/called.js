// Briscola chiamata engine: five players, an auction for the right to call a card, a secret partner.
import { buildDeck, shuffle, DECKS } from '../cards.js';

export function createCalledGame(def, opts) {
  const n = 5, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const order = R.rankOrder, suits = DECKS[def.deck].suits;
  const str = c => order.length - order.indexOf(c.r);
  const pts = c => R.cardPoints[c.r] || 0;
  const P = Array.from({ length: n }, () => ({ hand: [] }));
  const deals = opts.wins || 1, totals = Array(n).fill(0);     // a match is a fixed number of deals
  const score = [0, 0], own = Array(n).fill(0), active = new Set();
  let first = Math.floor(rng() * n), bid = -1, bidder = null, trump = null, calledId = null, need = 0;
  const LAST = order.length - 1, BASE = R.total / 2 + 1, LADDER = [62, 65, 70, 75, 80, 90, 100, 110, 120];   // after the Two the auction goes on by points
  const susp = Array(n).fill(0);            // how much each player looks like the caller's partner

  const g = {
    kind: 'trick', n, teams: false, nTeams: 2, phase: 'play', stage: 'bid', pending: false, current: first,
    trick: [], winner: null, lastEvent: null, summary: null, caller: null, holder: null, revealed: false, round: 0
  };
  function startRound() {
    const deck = shuffle(buildDeck(def.deck), rng);
    P.forEach(p => { p.hand = deck.splice(-def.setup.handSize); });
    score.fill(0); own.fill(0); susp.fill(0); active.clear();
    for (let i = 0; i < n; i++) active.add(i);
    bid = -1; bidder = null; trump = null; calledId = null; need = BASE;
    Object.assign(g, { phase: 'play', stage: 'bid', pending: false, current: first, trick: [], winner: null, lastEvent: null, summary: null, caller: null, holder: null, revealed: false });
    g.round++;
  }
  startRound();
  g.nextRound = () => { first = (first + 1) % n; startRound(); };
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
      else if (String(opt.choice)[0] === 'p') { need = +String(opt.choice).slice(1); bid = LAST; bidder = i; g.lastEvent = { type: 'bidPts', p: i, pts: need }; }
      else { bid = +opt.choice; bidder = i; g.lastEvent = { type: 'bid', p: i, rank: order[bid] }; }
      g.pending = true;
    } else if (g.stage === 'suit') {
      trump = opt.choice; calledId = `${order[bid]}-${trump}`;
      g.holder = P.findIndex(p => p.hand.some(c => c.id === calledId));
      g.lastEvent = { type: 'call', p: i, card: { id: calledId, r: order[bid], s: trump, deck: def.deck } };
      g.pending = true;
    } else {
      const h = P[i].hand, c = h.splice(h.findIndex(x => x.id === id), 1)[0];
      if (g.trick.length && i !== g.caller) {           // feeding the caller looks friendly, beating the caller does not
        const best = leaderOf(g.trick);
        if (best.p === g.caller) susp[i] += beats(c, best.card) ? -2 : pts(c) >= 10 ? 3 : pts(c) > 0 ? 1 : 0;
        else if (pts(c) >= 10 && !beats(c, best.card)) susp[i] -= 1;   // giving points to a defender
      }
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
      if (bidder != null && (need >= R.total || (active.size === 1 && active.has(bidder)))) {
        g.caller = bidder; g.current = bidder; g.stage = 'suit';
      } else { do g.current = (g.current + 1) % n; while (!active.has(g.current)); }
    } else if (g.stage === 'suit') { g.stage = 'play'; g.current = first; }
    else {
      const w = g.winner, p = trickPts(g.trick);
      score[g.teamOf(w)] += p; own[w] += p;
      g.trick = []; g.winner = null; g.current = w;
      if (P.every(x => !x.hand.length)) endRound();
    }
    g.lastEvent = null;
  };

  // Traditional scoring: the caller wins or loses 2 points, the partner 1, each defender 1 the other way
  // (a caller playing alone 4). Taking all 120 points doubles everything.
  function endRound() {
    const won = score[0] >= need, k = (won ? 1 : -1) * (score[0] === R.total || score[1] === R.total ? 2 : 1);
    const alone = g.caller === g.holder;
    const roundPts = P.map((_, i) => (i === g.caller ? (alone ? 4 : 2) * k : i === g.holder ? k : -k));
    roundPts.forEach((v, i) => { totals[i] += v; });
    g.summary = {
      round: g.round, players: true, roundPts, totals: totals.slice(),
      rows: [{ key: 'role', vals: P.map((_, i) => (i === g.caller ? 'role.caller' : i === g.holder ? 'role.partner' : 'role.defender')), text: true, winner: -1 },
        { key: 'tricks', vals: P.map((_, i) => score[g.teamOf(i)]), winner: -1 }],
      need
    };
    g.phase = g.round >= deals ? 'over' : 'roundEnd';
  }

  // what the human is asked during the auction
  function ask() {
    if (g.stage === 'bid') {
      const options = order.map((r, k) => ({ id: String(k), card: { id: `${r}-${suits[0]}`, r, s: suits[0], deck: def.deck } })).filter((_, k) => k > bid);
      if (bid === LAST) options.push(...LADDER.filter(v => v > need).map(v => ({ id: 'p' + v, label: String(v) })));
      if (!(bidder == null && active.size === 1)) options.push({ id: 'pass', text: 'ask.pass' });
      return { title: bid === LAST ? 'ask.bidPts' : 'ask.bid', options };
    }
    return g.stage === 'suit' ? { title: 'ask.suit', options: suits.map(s => ({ id: s, suit: s })) } : null;
  }

  g.view = () => ({
    showScore: g.stage === 'play', showPile: false,
    players: P.map((p, i) => ({ hand: p.hand, handCount: p.hand.length, score: own[i] })),
    center: g.trick.map(t => ({ card: t.card, p: t.p, hl: g.pending && t.p === g.winner })),
    need, deckCount: 0, trumpCard: calledId ? { id: calledId, r: order[bid], s: trump, deck: def.deck } : null, trumpSuit: trump, staged: null,
    ask: g.phase === 'play' && !g.pending && g.current === 0 ? ask() : null
  });

  g.result = () => {
    const mine = totals[0];                               // points are zero-sum: finishing above zero is a win
    return { outcome: mine > 0 ? 'win' : mine < 0 ? 'lose' : 'tie', score: mine, scores: totals.slice(), players: true };
  };

  // ---------- bots ----------
  const power = (hand, s) => hand.filter(c => c.s === s).reduce((a, c) => a + pts(c) / 3 + 1.5, 0);
  const bestSuit = hand => suits.reduce((a, s) => (power(hand, s) > power(hand, a) ? s : a));
  const lacks = (hand, s) => order.findIndex(r => !hand.some(c => c.s === s && c.r === r));     // best card of the suit not in hand

  function botBid(i) {
    const hand = P[i].hand, s = bestSuit(hand), force = power(hand, s);
    const limit = force < 4.5 ? -1 : Math.min(order.length - 1, lacks(hand, s) + Math.floor(force - 4));
    const k = bid + 1;
    if (bidder == null && active.size === 1) return String(Math.max(0, Math.min(k, order.length - 1)));   // somebody has to call
    if (bid === LAST) {                                    // by points: only a really strong hand goes on
      const top = force < 7.5 || diff === 'easy' ? 0 : Math.min(80, BASE + Math.round((force - 7) * 5)), next = LADDER.find(v => v > need);
      return next && next <= top ? 'p' + next : 'pass';
    }
    return k <= limit && !(diff === 'easy' && rng() < 0.3) ? String(k) : 'pass';
  }
  function botSuit(i) {
    const hand = P[i].hand, ranked = suits.slice().sort((a, b) => power(hand, b) - power(hand, a));
    return ranked.find(s => !hand.some(c => c.s === s && c.r === order[bid])) || ranked[0];
  }
  // who does player i believe to be on their side? The partner is secret until the called card is played.
  function mate(i, j) {
    if (g.revealed || i === g.holder) return g.teamOf(i) === g.teamOf(j);
    if (i === g.caller) return susp[j] >= 3;
    return j !== g.caller && susp[j] <= -2;                 // a defender trusts only who has openly fought the caller
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
