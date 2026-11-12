// Banking engine (Sette e mezzo): every player against the bank, hit or stand, closest to the limit wins.
import { buildDeck, shuffle } from '../cards.js';

export function createBankingGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const P = Array.from({ length: n }, () => ({ cards: [], state: 'play', chips: R.chips, delta: 0, nerve: 5 }));
  const bank = { cards: [] };
  let deck = [];
  const g = { kind: 'banking', n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', current: 0, round: 0, rounds: R.rounds, lastEvent: null };

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
    P.forEach(p => { p.cards = [deck.pop()]; p.state = 'play'; p.delta = 0; p.nerve = diff === 'easy' ? 4 + rng() * 2.5 : diff === 'medium' ? 5 : 5.5; });
    bank.cards = [deck.pop()];
    Object.assign(g, { phase: 'play', current: 0, lastEvent: null });
    g.round++;
  }
  deal();

  function next() {
    let i = g.current + 1;
    while (i < n && P[i].state !== 'play') i++;
    if (i < n) { g.current = i; return; }
    g.current = -1;
    if (P.every(p => p.state === 'bust')) settle(); else g.phase = 'bank';
  }

  g.hit = () => {
    const p = P[g.current];
    p.cards.push(deck.pop());
    if (total(p.cards) > R.limit) { p.state = 'bust'; g.lastEvent = { type: 'bust', p: g.current }; next(); }
    else g.lastEvent = { type: 'hit', p: g.current };
  };
  g.stand = () => { P[g.current].state = 'stand'; g.lastEvent = { type: 'stand', p: g.current }; next(); };

  g.botStep = () => { if (total(P[g.current].cards) < P[g.current].nerve) g.hit(); else g.stand(); };

  /** One action of the bank: draw below the standing value, otherwise stop and settle the hand. */
  g.bankStep = () => {
    if (total(bank.cards) < R.bankStands) { bank.cards.push(deck.pop()); g.lastEvent = { type: 'hit', p: -1 }; if (total(bank.cards) > R.limit) settle(); }
    else settle();
  };

  function settle() {
    const b = total(bank.cards), bankBust = b > R.limit;
    P.forEach(p => {
      const win = p.state !== 'bust' && (bankBust || total(p.cards) > b);
      p.delta = win ? (natural(p) ? 2 : 1) : -1;
      p.chips += p.delta;
    });
    g.phase = 'show'; g.lastEvent = null;
  }

  g.nextRound = () => { if (g.round >= g.rounds) g.phase = 'over'; else deal(); };

  g.view = () => {
    const open = g.phase === 'show' || g.phase === 'over';
    return {
      bank: { cards: bank.cards, hidden: g.phase === 'play', total: g.phase === 'play' ? null : total(bank.cards), bust: total(bank.cards) > R.limit },
      players: P.map((p, i) => ({
        cards: p.cards, hidden: i !== 0 && !open && p.state !== 'bust', total: i === 0 || open || p.state === 'bust' ? total(p.cards) : null,
        state: p.state, chips: p.chips, delta: open ? p.delta : 0
      })),
      current: g.current, phase: g.phase, round: g.round, rounds: g.rounds
    };
  };

  g.hint = () => (total(P[0].cards) < 5 ? 'hit' : 'stand');

  g.result = () => {
    const scores = P.map(p => p.chips), mine = scores[0], other = Math.max(...scores.slice(1));
    return { outcome: mine > other ? 'win' : mine < other ? 'lose' : 'tie', score: mine, scores };
  };

  return g;
}
