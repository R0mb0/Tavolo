// Fishing engine (Scopa family): play a card to capture cards from the table.
import { buildDeck, shuffle, DECKS } from '../cards.js';

export function createFishingGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random;
  const R = def.rules, S = def.scoring;
  const teams = (def.players.teamsAt || []).includes(n);
  const teamOf = i => (teams ? i % 2 : i);
  const nTeams = teams ? 2 : n;
  const suits = DECKS[def.deck].suits;

  let deck = [], table = [], lastCap = null, dealer = Math.floor(rng() * n), seenR = {};
  const P = Array.from({ length: n }, () => ({ hand: [] }));
  const T = Array.from({ length: nTeams }, () => ({ pile: [], sweeps: 0, total: 0 }));

  const g = {
    kind: 'fishing', n, teams, nTeams, teamOf,
    phase: 'play', pending: false, current: 0, staged: null, lastEvent: null, summary: null, round: 0
  };

  const see = c => { seenR[c.r] = (seenR[c.r] || 0) + 1; };
  const dealHands = () => {
    for (let k = 0; k < def.setup.handSize; k++)
      for (let i = 0; i < n; i++) P[(dealer + 1 + i) % n].hand.push(deck.pop());
  };
  function startRound() {
    deck = shuffle(buildDeck(def.deck), rng);
    table = []; lastCap = null; seenR = {};
    T.forEach(t => { t.pile = []; t.sweeps = 0; });
    for (let k = 0; k < def.setup.tableCards; k++) { const c = deck.pop(); table.push(c); see(c); }
    dealHands();
    g.current = (dealer + 1) % n;
    g.round++; g.phase = 'play'; g.summary = null;
  }
  startRound();

  /** Capture options for a card in hand. Empty array = the card is simply laid on the table. */
  g.options = (id, i = g.current) => {
    const c = P[i].hand.find(x => x.id === id), me = teamOf(i), out = [];
    // Scopa d'assi: an Ace takes the whole table (not a sweep), unless an Ace is already lying there.
    if (R.aceTakesAll && c.r === 1 && table.length && !table.some(x => x.r === 1))
      return [{ take: table.map(x => x.id), steal: null, noSweep: true }];
    if (R.steal) T.forEach((tm, k) => {
      if (k !== me && tm.pile.length && tm.pile[tm.pile.length - 1].r === c.r) out.push({ take: [], steal: k });
    });
    if (R.sumTo) {                                         // Escoba: the card played and the cards taken add up to 15
      const rec = (start, left, acc) => {
        if (left === 0 && acc.length) out.push({ take: acc.slice(), steal: null });
        for (let k = start; k < table.length; k++) if (table[k].r <= left) {
          acc.push(table[k].id); rec(k + 1, left - table[k].r, acc); acc.pop();
        }
      };
      rec(0, R.sumTo - c.r, []);
      return out;
    }
    const singles = table.filter(x => x.r === c.r);
    singles.forEach(x => out.push({ take: [x.id], steal: null }));
    if (R.captureSums && !(R.singleFirst && singles.length)) {
      const rec = (start, left, acc) => {
        if (left === 0 && acc.length > 1) { out.push({ take: acc.slice(), steal: null }); return; }
        for (let k = start; k < table.length; k++) if (table[k].r <= left) {
          acc.push(table[k].id); rec(k + 1, left - table[k].r, acc); acc.pop();
        }
      };
      rec(0, c.r, []);
    }
    return out;
  };

  g.play = (id, opt) => {
    opt = opt || { take: [], steal: null };
    const p = g.current, h = P[p].hand;
    const c = h.splice(h.findIndex(x => x.id === id), 1)[0];
    see(c);
    const lastPlay = !deck.length && P.every(x => !x.hand.length);
    const sweep = !!R.sweeps && opt.take.length > 0 && opt.take.length === table.length && !lastPlay && !opt.noSweep;
    g.staged = { p, card: c, take: opt.take, steal: opt.steal, sweep };
    g.pending = true;
    g.lastEvent = opt.steal != null ? { type: 'steal', p, target: opt.steal }
      : sweep ? { type: 'sweep', p }
      : opt.take.length ? { type: 'capture', p, n: opt.take.length + 1 }
      : null;
  };

  g.advance = () => {
    const s = g.staged, t = teamOf(s.p);
    g.staged = null; g.pending = false;
    if (s.steal != null) {
      T[t].pile.push(...T[s.steal].pile, s.card); T[s.steal].pile = []; lastCap = t;
    } else if (s.take.length) {
      const tk = table.filter(c => s.take.includes(c.id));
      table = table.filter(c => !s.take.includes(c.id));
      T[t].pile.push(...tk, s.card); lastCap = t;
      if (s.sweep) T[t].sweeps++;
    } else table.push(s.card);
    g.current = (g.current + 1) % n;
    if (P.every(p => !p.hand.length)) { if (deck.length) dealHands(); else endRound(); }
  };

  function endRound() {
    if (R.lastCaptureTakesTable && lastCap != null) { T[lastCap].pile.push(...table); table = []; }
    if (S.type === 'mostCards') { g.phase = 'over'; return; }
    const rows = [], roundPts = Array(nTeams).fill(0);
    const unique = vals => { const m = Math.max(...vals); return vals.filter(v => v === m).length === 1 ? vals.indexOf(m) : -1; };
    const prim = S.primiera || {};
    const calc = {
      cards: () => T.map(t => t.pile.length),
      coins: () => T.map(t => t.pile.filter(c => c.s === S.coinSuit).length),
      settebello: () => T.map(t => (t.pile.some(c => c.id === S.settebello) ? 1 : 0)),
      golds: () => T.map(t => t.pile.filter(c => c.s === S.coinSuit).length),
      sevenGold: () => T.map(t => (t.pile.some(c => c.id === S.settebello) ? 1 : 0)),
      sevens: () => T.map(t => t.pile.filter(c => c.r === 7).length),
      primiera: () => T.map(t => suits.reduce((a, s) => a + Math.max(0, ...t.pile.filter(c => c.s === s).map(c => prim[c.r] || 0)), 0))
    };
    for (const key of S.items) {
      if (key === 'sweeps') {
        const vals = T.map(t => t.sweeps);
        vals.forEach((v, k) => { roundPts[k] += v; });
        rows.push({ key, vals, winner: -2 });
      } else {
        const vals = calc[key](), w = unique(vals);
        if (w >= 0) roundPts[w]++;
        rows.push({ key, vals, winner: w });
      }
    }
    T.forEach((t, k) => { t.total += roundPts[k]; });
    const totals = T.map(t => t.total);
    g.summary = { round: g.round, rows, roundPts, totals };
    g.phase = Math.max(...totals) >= S.target && unique(totals) >= 0 ? 'over' : 'roundEnd';
  }

  g.nextRound = () => { dealer = (dealer + 1) % n; startRound(); };

  const scoreOf = k => (S.type === 'mostCards' ? T[k].pile.length : T[k].total);

  g.view = () => ({
    showScore: S.type !== 'mostCards', showPile: true,
    players: P.map((p, i) => {
      const tm = T[teamOf(i)];
      return {
        hand: p.hand, handCount: p.hand.length, score: tm.total, pile: tm.pile.length, sweeps: tm.sweeps,
        pileTop: R.steal && tm.pile.length ? tm.pile[tm.pile.length - 1] : null
      };
    }),
    center: table.map(c => ({ card: c, p: null, hl: !!g.staged && g.staged.take.includes(c.id) })),
    deckCount: deck.length, trumpCard: null, trumpSuit: null, staged: g.staged
  });

  g.result = () => {
    const me = teamOf(0), scores = T.map((_, k) => scoreOf(k)), mine = scores[me];
    const other = Math.max(...scores.filter((_, k) => k !== me));
    return { outcome: mine > other ? 'win' : mine < other ? 'lose' : 'tie', score: mine, scores };
  };

  // ---------- bots ----------
  g.botMove = (level = diff) => {
    const i = g.current, hand = P[i].hand, moves = [];
    for (const c of hand) {
      const o = g.options(c.id, i);
      if (!o.length) moves.push({ id: c.id, opt: { take: [], steal: null }, c });
      else o.forEach(opt => moves.push({ id: c.id, opt, c }));
    }
    const out = m => ({ id: m.id, opt: m.opt });
    if (level === 'easy' && rng() < 0.5) return out(moves[Math.floor(rng() * moves.length)]);
    const smart = level === 'hard';
    const tsum = table.reduce((a, x) => a + x.r, 0);
    const unseen = r => Math.max(0, 4 - (seenR[r] || 0) - hand.filter(x => x.r === r).length);
    const pair = c => hand.filter(x => x.r === c.r).length > 1;
    // which card would clear a table worth `s`? (Scopa: the same value; Escoba: what is missing to 15)
    const clears = s => { const r = R.sumTo ? R.sumTo - s : s; return r >= 1 && r <= 10 ? r : 0; };

    const ev = m => {
      if (S.type === 'mostCards') {
        if (m.opt.steal != null) return 10 + T[m.opt.steal].pile.length;
        if (m.opt.take.length) return 3 + m.opt.take.length;
        return smart && pair(m.c) ? 1 : 0;
      }
      if (m.opt.take.length) {
        const tk = table.filter(x => m.opt.take.includes(x.id)), got = [m.c, ...tk];
        let v = got.length;
        for (const x of got) {
          if (x.s === S.coinSuit) v += 1.5;
          if (x.id === S.settebello) v += 12; else if (x.r === 7) v += 3; else if (x.r === 6) v += 1.5; else if (x.r === 1) v += 0.8;
        }
        const left = tsum - tk.reduce((a, x) => a + x.r, 0);
        if (tk.length === table.length) v += m.opt.noSweep ? 0 : 15;
        else if (clears(left)) v -= smart ? 2 * unseen(clears(left)) : 1;
        return v;
      }
      let v = -m.c.r * 0.05;
      if (m.c.s === S.coinSuit) v -= 2;
      if (m.c.r === 7) v -= 4;
      if (m.c.id === S.settebello) v -= 10;
      const ns = tsum + m.c.r;
      if (clears(ns)) v -= smart ? 2.5 * unseen(clears(ns)) : 3;
      if (smart && pair(m.c)) v += 1;
      return v;
    };
    let best = moves[0], top = -Infinity;
    for (const m of moves) { const v = ev(m) + rng() * 0.01; if (v > top) { top = v; best = m; } }
    return out(best);
  };

  g.hint = () => g.botMove('hard');

  return g;
}
