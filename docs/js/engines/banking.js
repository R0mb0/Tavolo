// Banking engine (Sette e mezzo): every player against the bank, hit or stand, closest to the limit wins.
import { buildDeck, shuffle } from '../cards.js';

export function createBankingGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const P = Array.from({ length: n }, () => ({ cards: [], state: 'play', chips: R.chips, delta: 0, nerve: 5 }));
  let deck = [], order = [], pos = 0;
  // The bank is one of the players and moves one seat on at every hand.
  const g = { kind: 'banking', n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', current: 0, round: 0, rounds: R.rounds, banker: Math.floor(rng() * n) - 1, lastEvent: null };

  // Total of a hand. The wild card takes the whole value (1-7) that brings the hand closest to the limit.
  const total = cards => {
    const wild = cards.some(c => c.id === R.wild);
    const sum = cards.filter(c => c.id !== R.wild).reduce((a, c) => a + (R.values[c.r] ?? c.r), 0);
    if (!wild) return sum;
    let v = 7;
    while (v > 1 && sum + v > R.limit) v--;
    return sum + v;
  };
  const natural = p => p.cards.length === 2 && total(p.cards) === R.limit;

  function deal() {
    deck = shuffle(buildDeck(def.deck), rng);
    g.banker = (g.banker + 1) % n;
    P.forEach(p => { p.cards = [deck.pop()]; p.state = 'play'; p.delta = 0; p.nerve = diff === 'easy' ? 4 + rng() * 2.5 : diff === 'medium' ? 5 : 5.5; });
    order = Array.from({ length: n - 1 }, (_, k) => (g.banker + 1 + k) % n); pos = 0;
    Object.assign(g, { phase: 'play', current: order[0], lastEvent: null });
    g.round++;
  }
  deal();

  function next() {
    pos++;
    if (pos < order.length) { g.current = order[pos]; return; }
    g.current = g.banker;
    if (order.every(i => P[i].state === 'bust')) settle(); else g.phase = 'bank';
  }

  // The same two actions serve the players and, in the bank phase, the banker.
  g.hit = () => {
    const i = g.current, p = P[i];
    p.cards.push(deck.pop());
    const bust = total(p.cards) > R.limit;
    g.lastEvent = { type: bust ? 'bust' : 'hit', p: i };
    if (!bust) return;
    p.state = 'bust';
    if (g.phase === 'bank') settle(); else next();
  };
  g.stand = () => {
    const i = g.current;
    P[i].state = 'stand'; g.lastEvent = { type: 'stand', p: i };
    if (g.phase === 'bank') settle(); else next();
  };

  g.botStep = () => { if (total(P[g.current].cards) < P[g.current].nerve) g.hit(); else g.stand(); };

  // what the banker can see of the players still in the hand: the cards dealt face up
  const shown = i => total(P[i].cards.slice(1));
  /** One action of a bot holding the bank: draw below the standing value, otherwise stop. */
  g.bankStep = () => {
    const b = total(P[g.banker].cards), live = order.filter(i => P[i].state !== 'bust');
    // a careful banker stops earlier when it already beats what everybody is showing
    const safe = diff === 'hard' && b >= 4 && live.every(i => shown(i) + 3 < b);
    if (b < R.bankStands && !safe) g.hit(); else g.stand();
  };

  function settle() {
    const bk = P[g.banker], b = total(bk.cards), bankBust = b > R.limit;
    bk.delta = 0;
    order.forEach(i => {
      const p = P[i], win = p.state !== 'bust' && (bankBust || total(p.cards) > b);
      p.delta = win ? (natural(p) ? 2 : 1) : -1;
      p.chips += p.delta; bk.delta -= p.delta;
    });
    bk.chips += bk.delta;
    g.phase = 'show'; g.current = -1;
  }

  g.nextRound = () => { if (g.round >= g.rounds) g.phase = 'over'; else deal(); };

  g.view = () => {
    const open = g.phase === 'show' || g.phase === 'over';
    return {
      players: P.map((p, i) => {
        const seen = i === 0 || open || p.state === 'bust' || (i === g.banker && g.phase === 'bank');
        return { cards: p.cards, hidden: !seen, total: seen ? total(p.cards) : null, state: p.state, chips: p.chips, delta: open ? p.delta : 0, banker: i === g.banker };
      }),
      current: g.current, banker: g.banker, phase: g.phase, round: g.round, rounds: g.rounds
    };
  };

  g.hint = () => (total(P[0].cards) < 5 ? 'hit' : 'stand');

  g.result = () => {
    const scores = P.map(p => p.chips), mine = scores[0], other = Math.max(...scores.slice(1));
    return { outcome: mine > other ? 'win' : mine < other ? 'lose' : 'tie', score: mine, scores };
  };

  return g;
}
