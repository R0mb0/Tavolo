// Burraco engine: team rummy with wild cards (jokers and twos), two pots and burraco bonuses.
import { buildDeck, shuffle } from '../cards.js';

const value = c => (c.r === 0 ? 30 : c.r === 2 ? 20 : c.r === 1 ? 15 : c.r >= 8 ? 10 : 5);
const plain = c => ({ id: c.id, r: c.r, s: c.s, deck: c.deck });

/**
 * Valid Burraco combination? Sets: 3+ cards of one value (any suits). Runs: 3+ consecutive cards of one suit.
 * At most one wild card (joker or 2) per combination; a 2 can also be a natural card in a run of its own suit.
 */
export function analyzeBurraco(input) {
  const cards = input.map(plain);
  if (cards.length < 3) return null;
  const jokers = cards.filter(c => c.r === 0), twos = cards.filter(c => c.r === 2);
  if (jokers.length > 1) return null;
  const others = cards.filter(c => c.r !== 0 && c.r !== 2);
  if (jokers.length + twos.length <= 1 && others.length >= 2 && others.every(c => c.r === others[0].r)) {
    const w = jokers[0] || twos[0];
    return { type: 'set', rank: others[0].r, cards: [...others, ...(w ? [{ ...w, wild: true }] : [])], clean: !w };
  }
  for (const w of jokers.length ? [jokers[0]] : [null, ...twos]) {      // which card, if any, is the wild one
    const nat = cards.filter(c => c !== w);
    if (!nat.length || nat.some(c => c.r === 0) || !nat.every(c => c.s === nat[0].s)) continue;
    for (const high of [false, true]) {
      const val = c => (c.r === 1 && high ? 14 : c.r);
      const vs = nat.map(val).sort((a, b) => a - b);
      if (new Set(vs).size !== vs.length) continue;
      let lo = vs[0], hi = vs[vs.length - 1];
      const extra = (w ? 1 : 0) - (hi - lo + 1 - vs.length);
      if (extra < 0) continue;
      if (extra) { if (hi < (high ? 14 : 13)) hi++; else if (lo > (high ? 2 : 1)) lo--; else continue; }
      const order = [];
      for (let v = lo; v <= hi; v++) order.push(nat.find(x => val(x) === v) || { ...w, wild: true });
      return { type: 'run', suit: nat[0].s, cards: order, clean: !w };
    }
  }
  return null;
}

export function createBurracoGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random, R = def.rules;
  const teams = n === 4, teamOf = i => (teams ? i % 2 : i);
  let stock = [], discard = [], melds = [], pots = [], picked = null, first = Math.floor(rng() * n);
  const P = Array.from({ length: n }, () => ({ hand: [] }));
  const T = [{ pot: false, total: 0 }, { pot: false, total: 0 }];
  // semi-clean burraco: a run whose wild card sits beside at least seven natural cards in a row
  const semi = m => {
    if (m.type !== 'run' || !R.semiBonus) return false;
    let best = 0, cur = 0;
    for (const c of m.cards) { cur = c.wild ? 0 : cur + 1; best = Math.max(best, cur); }
    return best >= 7;
  };
  const g = { kind: 'burraco', n, teams, nTeams: 2, teamOf, phase: 'play', step: 'draw', current: 0, round: 0, summary: null };

  function startRound() {
    stock = [];
    for (let k = 0; k < R.decks; k++) stock.push(...buildDeck(def.deck).map(c => ({ ...c, id: `${c.id}-${k}` })));
    for (let j = 0; j < R.jokers; j++) stock.push({ id: 'joker-' + j, r: 0, s: 'joker', deck: def.deck });
    shuffle(stock, rng);
    melds = [];
    P.forEach(p => { p.hand = stock.splice(-def.setup.handSize); });
    pots = [stock.splice(-R.potSize), stock.splice(-R.potSize)];
    T.forEach(t => { t.pot = false; });
    discard = [stock.pop()];
    Object.assign(g, { phase: 'play', step: 'draw', current: first, summary: null });
    g.round++;
  }
  startRound();

  const fail = reason => ({ ok: false, reason });
  const take = (p, cards) => { p.hand = p.hand.filter(c => !cards.includes(c)); };
  const hasBurraco = t => melds.some(m => m.team === t && m.cards.length >= 7);
  // May the current player get rid of `k` cards by laying them down? `burr`: the team will then own a burraco.
  const isWild = c => c.r === 0 || c.r === 2;
  const target = opts.wins > 100 ? opts.wins : R.target;    // the match can be played to a higher score
  // `used`: the cards laid down, when known, to check that the one left is not a wild card (no closing on a wild card)
  function allowed(p, t, k, burr, used) {
    const left = p.hand.length - k;
    if (left === 0) return !T[t].pot;                      // only to pick up the pot straight away
    if (left === 1) {                                      // the last card must be a legal closing discard
      if (!T[t].pot) return true;
      const last = used && p.hand.find(c => !used.includes(c));
      return burr && !(last && isWild(last));
    }
    return true;
  }
  const maybePot = (p, t) => { if (!p.hand.length && !T[t].pot) { p.hand = pots.pop(); T[t].pot = true; return true; } return false; };

  g.draw = from => {
    const p = P[g.current];
    if (g.phase !== 'play' || g.step !== 'draw') return fail('turn');
    if (from === 'discard') {
      if (!discard.length) return fail('invalid');
      picked = discard.length === 1 ? discard[0].id : null;   // a single card taken cannot be thrown straight back
      p.hand.push(...discard); discard = [];              // the whole pile
    } else {
      if (!stock.length) { endRound(-1); return { ok: true }; }
      p.hand.push(stock.pop()); picked = null;
    }
    g.step = 'play';
    return { ok: true };
  };

  g.meld = ids => {
    const p = P[g.current], t = teamOf(g.current);
    if (g.phase !== 'play' || g.step !== 'play') return fail('turn');
    const cs = p.hand.filter(c => ids.includes(c.id));
    const a = cs.length === ids.length ? analyzeBurraco(cs) : null;
    if (!a) return fail('invalid');
    { const burr = hasBurraco(t) || a.cards.length >= 7; if (!allowed(p, t, cs.length, burr, cs)) return fail(p.hand.length === cs.length ? 'keepOne' : burr ? 'wildClose' : 'needBurraco'); }
    take(p, cs);
    melds.push({ ...a, team: t });
    return { ok: true, pot: maybePot(p, t) };
  };

  g.layoff = (idx, ids) => {
    const p = P[g.current], t = teamOf(g.current), m = melds[idx];
    if (g.phase !== 'play' || g.step !== 'play' || !m) return fail('turn');
    if (m.team !== t) return fail('notYours');
    const add = p.hand.filter(c => ids.includes(c.id));
    const a = add.length && add.length === ids.length ? analyzeBurraco([...m.cards, ...add]) : null;
    if (!a || a.type !== m.type || (a.type === 'set' ? a.rank !== m.rank : a.suit !== m.suit)) return fail('invalid');
    { const burr = hasBurraco(t) || a.cards.length >= 7; if (!allowed(p, t, add.length, burr, add)) return fail(p.hand.length === add.length ? 'keepOne' : burr ? 'wildClose' : 'needBurraco'); }
    take(p, add);
    melds[idx] = { ...a, team: t };
    return { ok: true, pot: maybePot(p, t) };
  };

  g.revert = () => {};

  g.discard = id => {
    const p = P[g.current], t = teamOf(g.current);
    if (g.phase !== 'play' || g.step !== 'play') return fail('turn');
    const c = p.hand.find(x => x.id === id);
    if (!c) return fail('invalid');
    if (p.hand.length === 1 && T[t].pot && !hasBurraco(t)) return fail('needBurraco');
    if (p.hand.length === 1 && T[t].pot && isWild(c)) return fail('wildClose');
    if (id === picked && p.hand.length > 1) return fail('sameCard');
    take(p, [c]); discard.push(c); picked = null;
    const pot = maybePot(p, t);
    if (!p.hand.length) { endRound(t); return { ok: true }; }
    g.current = (g.current + 1) % n; g.step = 'draw';
    return { ok: true, pot };
  };

  function endRound(closer) {
    const sum = cs => cs.reduce((a, c) => a + value(c), 0);
    const of = f => [0, 1].map(f);
    const rows = [
      { key: 'melded', vals: of(t => sum(melds.filter(m => m.team === t).flatMap(m => m.cards))), winner: -1 },
      { key: 'burracos', vals: of(t => melds.filter(m => m.team === t && m.cards.length >= 7).reduce((a, m) => a + (m.clean ? R.cleanBonus : semi(m) ? R.semiBonus : R.dirtyBonus), 0)), winner: -2 },
      { key: 'close', vals: of(t => (t === closer ? R.closeBonus : 0)), winner: -2 },
      { key: 'inHand', vals: of(t => -sum(P.filter((_, i) => teamOf(i) === t).flatMap(p => p.hand))), winner: -1 },
      { key: 'noPot', vals: of(t => (T[t].pot ? 0 : -R.potPenalty)), winner: -1 }
    ];
    const roundPts = of(t => rows.reduce((a, r) => a + r.vals[t], 0));
    T.forEach((tm, t) => { tm.total += roundPts[t]; });
    const totals = T.map(tm => tm.total);
    g.summary = { round: g.round, winner: closer, rows, roundPts, totals };
    g.phase = Math.max(...totals) >= target && totals[0] !== totals[1] ? 'over' : 'roundEnd';
  }

  g.nextRound = () => { first = (first + 1) % n; startRound(); };

  g.view = () => ({
    players: P.map((p, i) => ({ hand: p.hand, handCount: p.hand.length, opened: false, total: T[teamOf(i)].total, pot: T[teamOf(i)].pot })),
    melds, stock: stock.length, top: discard[discard.length - 1] || null, pileCount: discard.length,
    step: g.step, provSum: 0, opening: 0, hasProv: false
  });

  g.result = () => {
    const scores = T.map(tm => tm.total), mine = scores[teamOf(0)], other = scores[1 - teamOf(0)];
    return { outcome: mine > other ? 'win' : mine < other ? 'lose' : 'tie', score: mine, scores };
  };

  // ---------- bots and hints ----------
  function candidates(cards) {
    const out = [], wild = cards.find(c => c.r === 2) || cards.find(c => c.r === 0);
    const nat = cards.filter(c => c.r !== 0 && c.r !== 2), byRank = {}, bySuit = {};
    nat.forEach(c => { (byRank[c.r] = byRank[c.r] || []).push(c); (bySuit[c.s] = bySuit[c.s] || {})[c.r] = c; });
    for (const r in byRank) {
      const cs = byRank[r];
      if (cs.length >= 3) out.push(cs); else if (cs.length === 2 && wild) out.push([...cs, wild]);
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
        else if (wild) {
          if (e + 2 <= 14 && get(e + 2) && !(e + 2 === 14 && v === 1)) out.push([...seq, wild, get(e + 2)]);
          else if (seq.length === 2) out.push([...seq, wild]);
        }
        v = e + 1;
      }
    }
    return out.filter(cs => analyzeBurraco(cs));
  }
  function findMelds(cards) {
    const worth = cs => cs.length * 10 - (cs.some(c => c.r === 0 || c.r === 2) ? 12 : 0);
    let rest = cards.slice();
    const res = [];
    for (;;) {
      const cand = candidates(rest);
      if (!cand.length) break;
      const pick = cand.reduce((a, b) => (worth(b) > worth(a) ? b : a));
      res.push(pick);
      rest = rest.filter(c => !pick.includes(c));
    }
    return res;
  }
  const fitsMeld = (m, c) => {
    const a = analyzeBurraco([...m.cards, c]);
    return !!a && a.type === m.type && (a.type === 'set' ? a.rank === m.rank : a.suit === m.suit);
  };
  // first legal thing to lay down: a new combination, or a card added to one of the team's combinations
  function nextPlay(p, t) {
    for (const cs of findMelds(p.hand))
      if (allowed(p, t, cs.length, hasBurraco(t) || cs.length >= 7, cs)) return { ids: cs.map(c => c.id) };
    for (const c of p.hand) {
      const wild = isWild(c);
      const idx = melds.findIndex(m => m.team === t && fitsMeld(m, c) && (!wild || (m.clean && m.cards.length === 6)));
      if (idx >= 0 && allowed(p, t, 1, hasBurraco(t) || melds[idx].cards.length >= 6, [c])) return { ids: [c.id], meld: idx };
    }
    return null;
  }
  function worstCard(p, level) {
    const pool = p.hand.filter(c => c.r !== 0 && c.r !== 2 && c.id !== picked);
    const hand = pool.length ? pool : p.hand;
    if (level === 'easy' && rng() < 0.6) return hand[Math.floor(rng() * hand.length)];
    const useful = c => p.hand.reduce((a, o) => a + (o === c ? 0 : o.r === c.r ? 2 : o.s === c.s && Math.abs(o.r - c.r) === 1 ? 2 : o.s === c.s && Math.abs(o.r - c.r) === 2 ? 1 : 0), 0);
    return hand.reduce((a, b) => { const ua = useful(a), ub = useful(b); return ub < ua || (ub === ua && value(b) > value(a)) ? b : a; });
  }
  // Take the pile only when it is big or when one of its cards can really be laid down afterwards.
  function wantsPile(p, t, level) {
    if (!discard.length || level === 'easy') return false;
    if (discard.length >= 4) return true;
    const after = { hand: [...p.hand, ...discard] };
    if (allowed(after, t, 1, hasBurraco(t)) && discard.some(c => melds.some(m => m.team === t && fitsMeld(m, c)))) return true;
    return findMelds(after.hand).some(cs => cs.some(c => discard.includes(c)) && allowed(after, t, cs.length, hasBurraco(t) || cs.length >= 7));
  }

  g.botStep = (level = diff) => {
    const i = g.current, p = P[i], t = teamOf(i);
    if (g.step === 'draw') {
      const from = wantsPile(p, t, level) ? 'discard' : 'stock';
      g.draw(from);
      return { type: 'draw', from, p: i };
    }
    const mv = level === 'easy' && rng() < 0.3 ? null : nextPlay(p, t);
    if (mv) {
      const r = mv.meld != null ? g.layoff(mv.meld, mv.ids) : g.meld(mv.ids);
      if (r.ok) return { type: mv.meld != null ? 'layoff' : 'meld', p: i, pot: r.pot };
    }
    let r = g.discard(worstCard(p, level).id);
    for (const c of p.hand.slice()) { if (r.ok) break; r = g.discard(c.id); }
    if (!r.ok) { g.current = (g.current + 1) % n; g.step = 'draw'; }       // safety net: never stall the table
    return { type: 'discard', p: i, pot: r.pot };
  };

  g.hint = () => {
    const p = P[g.current], t = teamOf(g.current);
    if (g.step === 'draw') return { pile: wantsPile(p, t, 'hard') ? 'discard' : 'stock' };
    return nextPlay(p, t) || { ids: [worstCard(p, 'hard').id] };
  };

  return g;
}
