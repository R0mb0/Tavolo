// Rummy engine (Scala 40 family): draw, lay down sets and runs, lay off, discard.
import { buildDeck, shuffle } from '../cards.js';

const penalty = r => (r === 0 ? 25 : r === 1 ? 11 : r >= 11 ? 10 : r);   // value of a card left in hand
const plain = c => (c.r === 0 ? { id: c.id, r: 0, s: 'joker', deck: c.deck } : c);

/**
 * Is this group of cards a valid combination? Returns { type: 'set'|'run', cards (in order), points } or null.
 * Jokers (rank 0) stand for the missing card; in the result they carry `as` (rank) and `asSuit`.
 */
export function analyze(input, maxJokers = 1) {
  const cards = input.map(plain);
  if (cards.length < 3) return null;
  const jk = cards.filter(c => c.r === 0), nat = cards.filter(c => c.r !== 0);
  if (jk.length > maxJokers || nat.length < 2) return null;
  let best = null;
  const keep = m => { if (!best || m.points > best.points) best = m; };

  if (cards.length <= 4 && nat.every(c => c.r === nat[0].r) && new Set(nat.map(c => c.s)).size === nat.length)
    keep({ type: 'set', cards: [...nat, ...jk], points: penalty(nat[0].r) * cards.length, rank: nat[0].r });

  if (nat.every(c => c.s === nat[0].s)) {
    for (const high of [false, true]) {                      // Ace low (A-2-3) or Ace high (Q-K-A)
      const val = c => (c.r === 1 && high ? 14 : c.r);
      const vs = nat.map(val).sort((a, b) => a - b);
      if (new Set(vs).size !== vs.length) continue;
      let lo = vs[0], hi = vs[vs.length - 1], extra = jk.length - (hi - lo + 1 - vs.length);
      if (extra < 0) continue;
      const max = high ? 14 : 13, min = high ? 2 : 1;
      while (extra > 0 && hi < max) { hi++; extra--; }
      while (extra > 0 && lo > min) { lo--; extra--; }
      if (extra > 0) continue;
      const order = [], spare = jk.slice();
      let points = 0;
      for (let v = lo; v <= hi; v++) {
        points += v === 14 ? 11 : v === 1 ? 1 : v >= 11 ? 10 : v;
        order.push(nat.find(x => val(x) === v) || { ...spare.pop(), as: v === 14 ? 1 : v, asSuit: nat[0].s });
      }
      keep({ type: 'run', cards: order, points, suit: nat[0].s });
    }
  }
  return best;
}

export function createRummyGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  let stock = [], discard = [], melds = [], picked = null, mustUse = null, plan = [], turned = 0, first = Math.floor(rng() * n);
  const P = Array.from({ length: n }, () => ({ hand: [], opened: false, total: 0, out: false }));
  const g = { kind: 'rummy', n, teams: false, nTeams: n, teamOf: i => i, phase: 'play', step: 'draw', current: 0, round: 0, summary: null };

  function startRound() {
    stock = [];
    for (let k = 0; k < R.decks; k++) stock.push(...buildDeck(def.deck).map(c => ({ ...c, id: `${c.id}-${k}` })));
    for (let j = 0; j < R.jokers; j++) stock.push({ id: 'joker-' + j, r: 0, s: 'joker', deck: def.deck });
    shuffle(stock, rng);
    melds = []; picked = null; mustUse = null; turned = 0;
    P.forEach(p => { p.hand = []; p.opened = false; });
    for (let k = 0; k < def.setup.handSize; k++) for (const p of P) if (!p.out) p.hand.push(stock.pop());
    while (P[first].out) first = (first + 1) % n;
    discard = [stock.pop()];
    Object.assign(g, { phase: 'play', step: 'draw', current: first, summary: null });
    g.round++;
  }
  startRound();

  const fail = reason => ({ ok: false, reason });
  const provSum = () => melds.filter(m => m.prov).reduce((a, m) => a + m.points, 0);
  const take = (p, cards) => { p.hand = p.hand.filter(c => !cards.includes(c)); };

  g.draw = from => {
    const p = P[g.current];
    if (g.phase !== 'play' || g.step !== 'draw') return fail('turn');
    let c;
    if (from === 'discard') {
      if (!discard.length) return fail('noDiscardPick');
      c = discard.pop(); picked = c.id;
      if (!p.opened) mustUse = c.id;                          // allowed only to open with it in this same turn
    } else {
      if (!stock.length) {                                    // turn the discard pile into a new deck
        const top = discard.pop();
        stock = shuffle(discard, rng); discard = top ? [top] : [];
        // a deal nobody can close is called off once the discards have been turned over twice
        if (!stock.length || ++turned > (R.reshuffles || 2)) { endRound(-1); return { ok: true }; }
      }
      c = stock.pop(); picked = null;
    }
    p.hand.push(c); g.step = 'play'; plan = [];
    return { ok: true };
  };

  /** Lay down a new combination. Before opening, combinations are provisional until they reach the opening score. */
  g.meld = ids => {
    const p = P[g.current];
    if (g.phase !== 'play' || g.step !== 'play') return fail('turn');
    const cs = p.hand.filter(c => ids.includes(c.id));
    const a = cs.length === ids.length ? analyze(cs, R.maxJokers) : null;
    if (!a) return fail('invalid');
    if (p.hand.length - cs.length < 1) return fail('keepOne');
    take(p, cs);
    melds.push({ ...a, owner: g.current, prov: !p.opened });
    if (!p.opened && provSum() >= R.opening) { melds.forEach(m => { m.prov = false; }); p.opened = true; }
    return { ok: true };
  };

  /** Add cards to a combination on the table, or swap a joker for the card it stands for. */
  g.layoff = (idx, ids) => {
    const p = P[g.current], m = melds[idx];
    if (g.phase !== 'play' || g.step !== 'play' || !m) return fail('turn');
    if (!p.opened || m.prov) return fail('needOpen');
    const add = p.hand.filter(c => ids.includes(c.id));
    if (!add.length || add.length !== ids.length) return fail('invalid');
    const j = m.cards.find(c => c.r === 0), c = add[0];
    if (j && add.length === 1 && c.r !== 0) {
      const stands = m.type === 'run' ? c.s === j.asSuit && c.r === j.as : c.r === m.rank && !m.cards.some(x => x.r !== 0 && x.s === c.s);
      const a = stands ? analyze([...m.cards.filter(x => x !== j), c], R.maxJokers) : null;
      if (a && a.type === m.type) {
        take(p, add); p.hand.push(plain(j));
        melds[idx] = { ...a, owner: m.owner, prov: false };
        return { ok: true, swap: true };
      }
    }
    const a = analyze([...m.cards, ...add], R.maxJokers);
    if (!a || a.type !== m.type) return fail('invalid');
    if (p.hand.length - add.length < 1) return fail('keepOne');
    take(p, add);
    melds[idx] = { ...a, owner: m.owner, prov: false };
    return { ok: true };
  };

  /** Take back the provisional combinations of an opening that did not reach the required score. */
  g.revert = () => {
    const p = P[g.current];
    melds.filter(m => m.prov).forEach(m => p.hand.push(...m.cards.map(plain)));
    melds = melds.filter(m => !m.prov);
    plan = [];
  };

  /** Give back the discard taken to open when the opening does not work out; the turn starts again from the draw. */
  g.putBack = () => {
    const p = P[g.current], c = mustUse && p.hand.find(x => x.id === mustUse);
    if (g.phase !== 'play' || g.step !== 'play' || !mustUse) return fail('turn');
    g.revert();
    const card = c || p.hand.find(x => x.id === mustUse);
    if (!card) return fail('invalid');
    take(p, [card]); discard.push(card); picked = null; mustUse = null; plan = []; g.step = 'draw';
    return { ok: true };
  };

  g.discard = id => {
    const p = P[g.current];
    if (g.phase !== 'play' || g.step !== 'play') return fail('turn');
    if (melds.some(m => m.prov)) return fail('openFirst');
    const c = p.hand.find(x => x.id === id);
    if (!c) return fail('invalid');
    if (mustUse && (!p.opened || p.hand.some(x => x.id === mustUse))) return fail('mustOpen');
    if (id === picked && p.hand.length > 1) return fail('sameCard');
    take(p, [c]); discard.push(c); picked = null; mustUse = null; plan = [];
    if (!p.hand.length) endRound(g.current);
    else { do g.current = (g.current + 1) % n; while (P[g.current].out); g.step = 'draw'; }
    return { ok: true };
  };

  function endRound(winner) {
    const pen = P.map(p => p.hand.reduce((a, c) => a + penalty(c.r), 0));
    P.forEach((p, i) => { p.total += pen[i]; });
    const totals = P.map(p => p.total);
    g.summary = { round: g.round, winner, rows: [{ key: 'penalty', vals: pen, winner }], roundPts: pen, totals };
    // whoever reaches the target is out of the game; the last player left wins
    P.forEach(p => { if (p.total >= R.target) p.out = true; });
    g.phase = P[0].out || P.filter(p => !p.out).length < 2 ? 'over' : 'roundEnd';
  }

  g.nextRound = () => { first = (first + 1) % n; startRound(); };

  g.view = () => ({
    players: P.map(p => ({ hand: p.hand, handCount: p.hand.length, opened: p.opened, total: p.total, out: p.out })),
    melds, stock: stock.length, top: discard[discard.length - 1] || null,
    step: g.step, mustUse: !!mustUse, provSum: provSum(), opening: R.opening, hasProv: melds.some(m => m.prov)
  });

  g.result = () => {
    const scores = P.map(p => p.total), mine = scores[0], other = Math.min(...scores.slice(1));
    if (P.some(p => !p.out)) return { outcome: P[0].out ? 'lose' : 'win', score: 0, scores };
    return { outcome: mine < other ? 'win' : mine > other ? 'lose' : 'tie', score: 0, scores };   // everybody went over together
  };

  // ---------- finding combinations (bots and hints) ----------
  function candidates(cards) {
    const out = [], jk = cards.find(c => c.r === 0), nat = cards.filter(c => c.r !== 0);
    const byRank = {}, bySuit = {};
    nat.forEach(c => {
      (byRank[c.r] = byRank[c.r] || {})[c.s] = c;
      (bySuit[c.s] = bySuit[c.s] || {})[c.r] = c;
    });
    for (const r in byRank) {
      const cs = Object.values(byRank[r]);
      if (cs.length >= 3) out.push(cs); else if (cs.length === 2 && jk) out.push([...cs, jk]);
    }
    for (const s in bySuit) {
      const get = v => bySuit[s][v === 14 ? 1 : v];
      let v = 1;
      while (v <= 14) {
        if (!get(v)) { v++; continue; }
        let e = v;
        while (e < 14 && get(e + 1) && !(e + 1 === 14 && v === 1)) e++;
        const seq = [];
        for (let x = v; x <= e; x++) seq.push(get(x));
        if (seq.length >= 3) out.push(seq);
        else if (jk) {
          if (e + 2 <= 14 && get(e + 2) && !(e + 2 === 14 && v === 1)) out.push([...seq, jk, get(e + 2)]);
          else if (seq.length === 2) out.push([...seq, jk]);
        }
        v = e + 1;
      }
    }
    return out.map(cs => ({ cs, a: analyze(cs, R.maxJokers) })).filter(x => x.a);
  }

  // Greedy cover of a hand with combinations; a joker is spent only when it pays.
  function findMelds(cards) {
    const worth = x => x.a.points - (x.cs.some(c => c.r === 0) ? 6 : 0);
    let rest = cards.slice();
    const res = [];
    for (;;) {
      const cand = candidates(rest);
      if (!cand.length) break;
      const pick = cand.reduce((a, b) => (worth(b) > worth(a) ? b : a));
      res.push(pick);
      rest = rest.filter(c => !pick.cs.includes(c));
    }
    return res;
  }
  const sumPts = ms => ms.reduce((a, m) => a + m.a.points, 0);
  const sumLen = ms => ms.reduce((a, m) => a + m.cs.length, 0);
  // combinations the current player could lay now, always keeping one card to discard
  // (the plan is kept for the whole turn, so an opening started is always completed)
  function playable(p) {
    plan = plan.filter(m => m.cs.every(c => p.hand.some(h => h.id === c.id)));
    if (plan.length) return plan;
    const found = findMelds(p.hand).sort((a, b) => b.a.points - a.a.points);
    while (found.length && sumLen(found) > p.hand.length - 1) found.pop();
    plan = p.opened || provSum() + sumPts(found) >= R.opening ? found : [];
    return plan;
  }
  const fits = (m, c) => { const a = analyze([...m.cards, c], R.maxJokers); return !!a && a.type === m.type; };
  function layoffMove(p) {
    if (!p.opened || p.hand.length < 2) return null;
    for (const c of p.hand) {
      if (c.r === 0 && p.hand.length > 3) continue;           // jokers are worth keeping
      const idx = melds.findIndex(m => !m.prov && fits(m, c));
      if (idx >= 0) return { idx, id: c.id };
    }
    return null;
  }
  function worstCard(p, level) {
    const pool = p.hand.filter(c => c.id !== picked);
    const hand = pool.length ? pool : p.hand;
    if (level === 'easy' && rng() < 0.6) return hand[Math.floor(rng() * hand.length)];
    const useful = c => (c.r === 0 ? 100 : p.hand.reduce((a, o) => a + (o === c || o.r === 0 ? 0
      : o.r === c.r && o.s !== c.s ? 2 : o.s === c.s && Math.abs(o.r - c.r) === 1 ? 2 : o.s === c.s && Math.abs(o.r - c.r) === 2 ? 1 : 0), 0));
    return hand.reduce((a, b) => { const ua = useful(a), ub = useful(b); return ub < ua || (ub === ua && penalty(b.r) > penalty(a.r)) ? b : a; });
  }

  // would the top discard let this player open right now, as part of the opening?
  function opensWith(p, top) {
    const found = findMelds([...p.hand, top]).sort((a, b) => b.a.points - a.a.points);
    while (found.length && sumLen(found) > p.hand.length) found.pop();
    return sumPts(found) >= R.opening && found.some(m => m.cs.includes(top));
  }

  /** One bot action at a time (draw, lay down, lay off, discard) so the table can show each step. */
  g.botStep = (level = diff) => {
    const i = g.current, p = P[i];
    if (g.step === 'draw') {
      const top = discard[discard.length - 1];
      const wants = top && level !== 'easy' && (p.opened
        ? melds.some(m => fits(m, top)) || sumPts(findMelds([...p.hand, top])) > sumPts(findMelds(p.hand))
        : opensWith(p, top));
      const from = wants ? 'discard' : 'stock';
      g.draw(from);
      return { type: 'draw', from, p: i };
    }
    const found = playable(p);
    if (found.length && g.meld(found[0].cs.map(c => c.id)).ok) return { type: 'meld', p: i };
    if (melds.some(m => m.prov)) g.revert();
    if (mustUse && (!p.opened || p.hand.some(c => c.id === mustUse))) {   // the opening did not work out: give the card back
      g.putBack(); g.draw('stock');
      return { type: 'draw', from: 'stock', p: i };
    }
    if (level !== 'easy' || rng() < 0.5) {
      const mv = layoffMove(p);
      if (mv && g.layoff(mv.idx, [mv.id]).ok) return { type: 'layoff', p: i };
    }
    g.discard(worstCard(p, level).id);
    return { type: 'discard', p: i, out: g.phase !== 'play' };
  };

  /** Suggestion for the human player: what to tap next. */
  g.hint = () => {
    const p = P[g.current];
    if (g.step === 'draw') { const top = discard[discard.length - 1]; return { pile: !p.opened && top && opensWith(p, top) ? 'discard' : 'stock' }; }
    const found = playable(p);
    if (found.length) return { ids: found[0].cs.map(c => c.id) };
    if (mustUse && (!p.opened || p.hand.some(c => c.id === mustUse))) return { putBack: true };
    const mv = layoffMove(p);
    if (mv) return { ids: [mv.id], meld: mv.idx };
    return { ids: [worstCard(p, 'hard').id] };
  };

  return g;
}
