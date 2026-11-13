// Mau-Mau engine: get rid of your cards by matching the suit or the rank of the card on top of the pile.
import { buildDeck, shuffle, DECKS } from '../cards.js';

export function createMauMauGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const suits = DECKS[def.deck].suits;
  let deck = shuffle(buildDeck(def.deck), rng);
  const P = Array.from({ length: n }, () => ({ hand: deck.splice(-def.setup.handSize) }));
  const pile = [deck.pop()];
  let wish = null, debt = 0, skip = false, stage = null;       // stage 'wish': the human still has to name a suit

  const g = {
    kind: 'shedding', n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', pending: false,
    current: Math.floor(rng() * n), lastEvent: null, summary: null, winner: null, flyTarget: () => null
  };
  const top = () => pile[pile.length - 1];
  const sortHand = p => p.hand.sort((a, b) => suits.indexOf(a.s) - suits.indexOf(b.s) || a.r - b.r);
  P.forEach(sortHand);

  const fits = c => {
    const t = top();
    if (debt) return c.r === R.drawTwo;                          // a pending "draw two" is answered only with another one
    if (c.r === R.wild) return t.r !== R.wild;                   // never a wild card on a wild card
    return c.s === (wish || t.s) || (!wish && c.r === t.r);
  };
  g.legal = (i = g.current) => (stage ? [] : P[i].hand.filter(fits));
  g.options = () => [];

  function draw(p, k) {
    let got = 0;
    for (; got < k; got++) {
      if (!deck.length) {                                        // the pile, except its top card, becomes the new deck
        if (pile.length < 2) break;
        deck = shuffle(pile.splice(0, pile.length - 1), rng);
      }
      p.hand.push(deck.pop());
    }
    sortHand(p);
    return got;
  }

  g.play = (id, opt) => {
    opt = opt || {};
    const i = g.current, p = P[i];
    if (stage === 'wish') { wish = opt.choice; stage = null; g.lastEvent = { type: 'mmWish', p: i, suit: wish }; g.pending = true; return; }
    if (opt.draw) {
      const k = draw(p, debt || 1);
      debt = 0; g.lastEvent = { type: 'mmDraw', p: i, n: k }; g.pending = true;
      return;
    }
    const c = p.hand.splice(p.hand.findIndex(x => x.id === id), 1)[0];
    pile.push(c); wish = null; g.lastEvent = null;
    if (!p.hand.length) { g.winner = i; g.pending = true; return; }
    if (c.r === R.drawTwo) { debt += 2; g.lastEvent = { type: 'mmSeven', p: i, n: debt }; }
    else if (c.r === R.skip) { skip = true; g.lastEvent = { type: 'mmSkip', p: (i + 1) % n }; }
    else if (c.r === R.wild) {
      if (opt.choice) { wish = opt.choice; g.lastEvent = { type: 'mmWish', p: i, suit: wish }; }
      else { stage = 'wish'; return; }                           // the table asks which suit
    }
    g.pending = true;
  };

  g.advance = () => {
    g.pending = false; g.lastEvent = null;
    if (g.winner != null) { g.phase = 'over'; return; }
    g.current = (g.current + (skip ? 2 : 1)) % n;
    skip = false;
  };

  g.view = () => ({
    showScore: false, showPile: false, source: 'hand',
    players: P.map(p => ({ hand: p.hand, handCount: p.hand.length, score: 0 })),
    center: [{ card: top(), p: null }], pileCount: pile.length, deckCount: deck.length,
    trumpCard: null, trumpSuit: wish, trumpLabel: 'play.wish', staged: null,
    note: debt ? 'play.mmMust' : null,
    actions: g.phase === 'play' && !g.pending && !stage ? ['draw'] : [],
    ask: stage === 'wish' ? { title: 'ask.wish', options: suits.map(s => ({ id: s, suit: s })) } : null
  });

  g.result = () => ({ outcome: g.winner === 0 ? 'win' : 'lose', score: P[0].hand.length, scores: P.map(p => p.hand.length), lowWins: true });

  // ---------- bots ----------
  const count = (hand, s) => hand.filter(c => c.s === s && c.r !== R.wild).length;
  const bestSuit = hand => suits.reduce((a, s) => (count(hand, s) > count(hand, a) ? s : a));
  g.botMove = (level = diff) => {
    const i = g.current, hand = P[i].hand;
    if (stage === 'wish') return { id: null, opt: { choice: bestSuit(hand) } };
    const L = g.legal(i);
    if (!L.length || (debt && level === 'easy' && rng() < 0.5)) return { id: null, opt: { draw: true } };
    let c;
    if (level === 'easy') c = L[Math.floor(rng() * L.length)];
    else {
      const next = P[(i + 1) % n].hand.length;
      // keep the wild card for when nothing else fits; attack the next player when they are about to finish
      const val = x => (x.r === R.wild ? (L.length === 1 || hand.length <= 2 ? 5 : -5)
        : count(hand, x.s) * (level === 'hard' ? 1.5 : 1) + (x.r === R.drawTwo || x.r === R.skip ? (next <= 2 ? 6 : 1) : 0)) + rng() * 0.1;
      c = L.reduce((a, b) => (val(b) > val(a) ? b : a));
    }
    return { id: c.id, opt: c.r === R.wild ? { choice: bestSuit(hand.filter(x => x !== c)) } : undefined };
  };
  g.hint = () => {
    const mv = g.botMove('hard');
    return mv.id ? { id: mv.id } : mv;                           // the human names the suit in a second step
  };

  return g;
}
