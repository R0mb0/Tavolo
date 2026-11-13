// Chinchón engine: a rummy played entirely in the hand. Draw, discard, and close when the cards
// that fit no combination are worth five points or less.
import { buildDeck, shuffle } from '../cards.js';

export function createChinchonGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const people = Math.min(Math.max(opts.humans | 0, 1), n);
  const P = Array.from({ length: n }, () => ({ hand: [], total: 0, out: false }));
  let stock = [], discard = [], first = Math.floor(rng() * n), picked = null, turned = 0;
  // `handOnly`: nothing is laid on the table, the table module shows a "close" button instead of "meld".
  const g = { kind: 'rummy', handOnly: true, n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', step: 'draw', current: 0, round: 0, summary: null };

  const val = c => (c.r <= 7 ? c.r : c.r + 2);             // Sota 10, Caballo 11, Rey 12
  const fail = reason => ({ ok: false, reason });

  // every combination hidden in a set of cards: three or four of a rank, three or more in a row of one suit
  function combos(cards) {
    const out = [], byRank = {}, bySuit = {};
    cards.forEach(c => { (byRank[c.r] ||= []).push(c); (bySuit[c.s] ||= []).push(c); });
    for (const r in byRank) {
      const cs = byRank[r];
      if (cs.length >= 3) { out.push(cs.slice()); if (cs.length === 4) for (const x of cs) out.push(cs.filter(c => c !== x)); }
    }
    for (const s in bySuit) {
      const cs = bySuit[s].slice().sort((a, b) => a.r - b.r);
      for (let i = 0; i < cs.length; i++) for (let j = i + 2; j < cs.length; j++)
        if (cs[j].r - cs[i].r === j - i) out.push(cs.slice(i, j + 1));
    }
    return out;
  }
  // best way to arrange a hand: the combinations that leave the fewest points unmatched
  function arrange(cards) {
    const all = combos(cards);
    let best = { dead: cards.reduce((a, c) => a + val(c), 0), melds: [] };
    const rec = (from, used, melds, covered) => {
      const dead = cards.reduce((a, c) => a + (used.has(c) ? 0 : val(c)), 0);
      if (dead < best.dead || (dead === best.dead && covered > best.covered)) best = { dead, melds: melds.slice(), covered };
      for (let k = from; k < all.length; k++) {
        const m = all[k];
        if (m.some(c => used.has(c))) continue;
        m.forEach(c => used.add(c)); melds.push(m);
        rec(k + 1, used, melds, covered + m.length);
        melds.pop(); m.forEach(c => used.delete(c));
      }
    };
    best.covered = 0;
    rec(0, new Set(), [], 0);
    return best;
  }
  const isChinchon = cards => cards.length === 7 && arrange(cards).melds.some(m => m.length === 7);
  // what is left after throwing away card `c`
  const after = (hand, c) => arrange(hand.filter(x => x !== c));

  function startRound() {
    stock = shuffle(buildDeck(def.deck), rng); discard = []; picked = null; turned = 0;
    P.forEach(p => { p.hand = []; });
    for (let k = 0; k < def.setup.handSize; k++) for (const p of P) if (!p.out) p.hand.push(stock.pop());
    discard.push(stock.pop());
    while (P[first].out) first = (first + 1) % n;
    Object.assign(g, { phase: 'play', step: 'draw', current: first, summary: null });
    g.round++;
  }
  startRound();
  g.nextRound = () => { first = (first + 1) % n; startRound(); };

  g.draw = src => {
    const p = P[g.current];
    if (g.phase !== 'play' || g.step !== 'draw') return fail('turn');
    if (src === 'discard') {
      if (!discard.length) return fail('noDiscardPick');
      const c = discard.pop(); p.hand.push(c); picked = c.id;
    } else {
      if (!stock.length) {                                   // the discards, except the top one, become the new deck
        // when the deck has run out too many times the deal is called off and everybody counts their cards
        if (turned >= R.reshuffles || discard.length < 2) { endRound(-1); return { ok: true }; }
        stock = shuffle(discard.splice(0, discard.length - 1), rng); turned++;
      }
      p.hand.push(stock.pop()); picked = null;
    }
    g.step = 'play';
    return { ok: true };
  };

  function next() {
    do g.current = (g.current + 1) % n; while (P[g.current].out);
    g.step = 'draw'; picked = null;
  }

  g.discard = id => {
    const p = P[g.current], c = p.hand.find(x => x.id === id);
    if (g.phase !== 'play' || g.step !== 'play' || !c) return fail('turn');
    if (id === picked) return fail('sameCard');
    p.hand = p.hand.filter(x => x !== c); discard.push(c);
    next();
    return { ok: true };
  };

  /** Throw away card `id` and close the deal: allowed when the unmatched cards left are worth `R.closeAt` or less. */
  g.close = id => {
    const i = g.current, p = P[i], c = p.hand.find(x => x.id === id);
    if (g.phase !== 'play' || g.step !== 'play' || !c) return fail('turn');
    if (id === picked) return fail('sameCard');
    if (after(p.hand, c).dead > R.closeAt) return fail('cantClose');
    p.hand = p.hand.filter(x => x !== c); discard.push(c);
    endRound(i);
    return { ok: true };
  };

  function endRound(closer) {
    const chinchon = closer >= 0 && isChinchon(P[closer].hand);
    const roundPts = P.map((p, i) => {
      if (p.out) return 0;
      const dead = arrange(p.hand).dead;
      return i === closer && dead === 0 ? -R.cleanBonus : dead;
    });
    roundPts.forEach((v, i) => { P[i].total += v; });
    if (chinchon) P.forEach((p, i) => { if (i !== closer) p.out = true; });      // a seven-card run wins the whole game
    else P.forEach(p => { if (p.total > R.target) p.out = true; });
    g.summary = { round: g.round, winner: closer, chinchon, roundPts, totals: P.map(p => p.total), hands: P.map(p => arrange(p.hand).melds.map(m => m.map(c => c.id))) };
    g.phase = P.slice(0, people).every(p => p.out) || P.filter(p => !p.out).length < 2 ? 'over' : 'roundEnd';
  }

  g.revert = () => {};
  g.view = () => {
    const p = P[g.current], arr = g.phase === 'play' ? arrange(p.hand) : { dead: 0, melds: [] };
    return {
      players: P.map(x => ({ hand: x.hand, handCount: x.hand.length, opened: false, total: x.total, out: x.out })),
      melds: [], top: discard[discard.length - 1] || null, pileCount: discard.length, stock: stock.length,
      step: g.step, mustUse: false, hasProv: false, provSum: 0, opening: 0,
      handOnly: true, dead: arr.dead, matched: arr.melds.flat().map(c => c.id),
      closable: g.phase === 'play' && g.step === 'play' ? p.hand.filter(c => c.id !== picked && after(p.hand, c).dead <= R.closeAt).map(c => c.id) : []
    };
  };

  g.result = () => {
    const scores = P.map(p => p.total), alive = P.filter(p => !p.out);
    if (alive.length) return { outcome: P[0].out ? 'lose' : 'win', score: 0, scores, lowWins: true, winner: P.indexOf(alive[0]) };
    const mine = scores[0], other = Math.min(...scores.slice(1));
    return { outcome: mine < other ? 'win' : mine > other ? 'lose' : 'tie', score: 0, scores, lowWins: true };
  };

  // ---------- bots and hints ----------
  // the card to throw away: the one that leaves the fewest unmatched points (the highest one among equals)
  function worst(hand) {
    let best = null;
    for (const c of hand) {
      if (c.id === picked) continue;
      const d = after(hand, c).dead;
      if (!best || d < best.d || (d === best.d && val(c) > val(best.c))) best = { c, d };
    }
    return best;
  }
  // is the top discard worth taking? Only if it lowers what the hand would be left with.
  function wantsTop(p) {
    const top = discard[discard.length - 1];
    if (!top) return false;
    const now = arrange(p.hand).dead, withTop = [...p.hand, top];
    const then = Math.min(...p.hand.map(c => arrange(withTop.filter(x => x !== c)).dead));
    return then < now - 1;
  }

  /** One bot action at a time: a draw, then a discard (or the closing discard). */
  g.botStep = (level = diff) => {
    const i = g.current, p = P[i];
    if (g.step === 'draw') {
      const from = level !== 'easy' && wantsTop(p) ? 'discard' : 'stock';
      const r = g.draw(from);
      if (!r.ok) g.draw(from === 'stock' ? 'discard' : 'stock');
      return { type: g.phase === 'play' ? 'draw' : 'end', from, p: i };
    }
    const w = (level === 'easy' && rng() < 0.25) || (level === 'medium' && rng() < 0.12) ? { c: p.hand.filter(c => c.id !== picked)[Math.floor(rng() * (p.hand.length - (picked ? 1 : 0)))] } : worst(p.hand);
    if (w.d == null) w.d = after(p.hand, w.c).dead;
    if (w.d <= R.closeAt) { g.close(w.c.id); return { type: 'close', p: i }; }
    g.discard(w.c.id);
    return { type: 'discard', p: i };
  };

  g.hint = () => {
    const p = P[g.current];
    if (g.step === 'draw') return { pile: wantsTop(p) ? 'discard' : 'stock' };
    const w = worst(p.hand);
    return { ids: [w.c.id], close: w.d <= R.closeAt };
  };

  return g;
}
