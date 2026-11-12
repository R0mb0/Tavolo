// Trick-taking engine (Briscola, Tressette). Everything game-specific comes from the JSON definition.
import { buildDeck, shuffle, DECKS } from '../cards.js';

export function createTrickGame(def, opts) {
  const n = opts.players, diff = opts.difficulty, rng = opts.rng || Math.random;
  const R = def.rules;
  const order = R.rankOrder;
  const str = c => order.length - order.indexOf(c.r);
  const pts = c => R.cardPoints[c.r] || 0;
  const teams = (def.players.teamsAt || []).includes(n);
  const teamOf = i => (teams ? i % 2 : i);
  const nTeams = teams ? 2 : n;
  const suits = DECKS[def.deck].suits;
  const hasTrump = R.trump !== 'none';
  const target = (def.win && def.win.target) || 0;     // 0 = single deal, otherwise match points to reach
  const games = !target && opts.wins > 1 ? opts.wins : 0;   // or: a match won by the first side to win this many deals
  // Some games count in fractions (Tressette: thirds). Scores are kept in whole units and divided for display.
  const div = R.scoreDivisor || 1;
  const fmt = u => {
    if (div === 1) return String(u);
    const whole = Math.floor(u / div), frac = ['', '⅓', '⅔'][u % div] || '';
    return (whole || !frac ? whole : '') + frac;
  };

  let deck, trumpCard, trump, score, decl, first = Math.floor(rng() * n);
  const P = Array.from({ length: n }, () => ({ hand: [] }));
  const totals = Array(nTeams).fill(0);

  const g = {
    kind: 'trick', n, teams, nTeams, teamOf,
    phase: 'play', pending: false, current: 0, round: 0,
    trick: [], winner: null, lastEvent: null, summary: null, announce: null
  };

  function startRound() {
    deck = shuffle(buildDeck(def.deck, (def.setup.removeForPlayers || {})[n] || []), rng);
    trumpCard = hasTrump ? deck[0] : null;            // bottom of the deck, drawn last
    trump = hasTrump ? trumpCard.s : null;
    score = Array(nTeams).fill(0); decl = Array(nTeams).fill(0);
    P.forEach(p => { p.hand = []; });
    for (let k = 0; k < def.setup.handSize; k++)
      for (let i = 0; i < n; i++) P[(first + i) % n].hand.push(deck.pop());
    Object.assign(g, { phase: 'play', pending: false, current: first, trick: [], winner: null, lastEvent: null, summary: null, announce: null });
    g.round++;
    if (R.declarations) {
      // Tressette "accuse": A-2-3 of one suit, or three/four Aces, Twos or Threes.
      const list = [];
      P.forEach((p, i) => {
        let v = 0;
        for (const s of suits) if ([1, 2, 3].every(r => p.hand.some(c => c.s === s && c.r === r))) v += 3;
        for (const r of [1, 2, 3]) { const k = p.hand.filter(c => c.r === r).length; if (k >= 3) v += k; }
        if (v) { decl[teamOf(i)] += v; list.push({ p: i, pts: v }); }
      });
      if (list.length) g.announce = { type: 'declare', list };
    }
  }
  startRound();

  const beats = (c, best) => (c.s === best.s ? str(c) > str(best) : c.s === trump);
  const leaderOf = trick => trick.reduce((b, t) => (beats(t.card, b.card) ? t : b));
  const trickPts = trick => trick.reduce((a, t) => a + pts(t.card), 0);

  g.legal = (i = g.current) => {
    const hand = P[i].hand;
    if (R.followSuit && g.trick.length) {
      const same = hand.filter(c => c.s === g.trick[0].card.s);
      if (same.length) return same;
    }
    return hand.slice();
  };

  g.play = id => {
    const h = P[g.current].hand;
    const c = h.splice(h.findIndex(x => x.id === id), 1)[0];
    g.trick.push({ p: g.current, card: c });
    if (g.trick.length === n) {
      g.winner = leaderOf(g.trick).p;
      g.pending = true;
      g.lastEvent = { type: 'takes', p: g.winner, pts: fmt(trickPts(g.trick)) };
    } else {
      g.current = (g.current + 1) % n;
      g.lastEvent = null;
    }
  };

  g.advance = () => {
    const w = g.winner;
    score[teamOf(w)] += trickPts(g.trick);
    g.trick = []; g.pending = false; g.winner = null;
    if (deck.length) for (let i = 0; i < n; i++) P[(w + i) % n].hand.push(deck.pop());
    g.current = w;
    if (P.every(p => !p.hand.length)) endRound(teamOf(w));
  };

  function endRound(lastTeam) {
    const bonus = R.lastTrickPoints || 0;
    const cardUnits = score.slice();
    score[lastTeam] += bonus;
    if (games) {
      const top = Math.max(...score), w = score.filter(v => v === top).length === 1 ? score.indexOf(top) : -1;
      const roundPts = score.map((_, t) => (t === w ? 1 : 0));
      roundPts.forEach((v, t) => { totals[t] += v; });
      g.summary = { round: g.round, rows: [{ key: 'tricks', vals: score.map(fmt), winner: w }], roundPts, totals: totals.slice() };
      score.fill(0);
      g.phase = Math.max(...totals) >= games ? 'over' : 'roundEnd';
      return;
    }
    if (!target) { g.phase = 'over'; return; }
    const roundPts = score.map((s, t) => Math.floor(s / div) + decl[t]);
    const rows = [{ key: 'tricks', vals: cardUnits.map(fmt), winner: -1 }];
    if (bonus) rows.push({ key: 'last', vals: score.map((_, t) => (t === lastTeam ? bonus / div : 0)), winner: -2 });
    if (R.declarations) rows.push({ key: 'declare', vals: decl.slice(), winner: -2 });
    roundPts.forEach((v, t) => { totals[t] += v; });
    score.fill(0); decl.fill(0);                       // now part of the totals
    const top = Math.max(...totals);
    g.summary = { round: g.round, rows, roundPts, totals: totals.slice() };
    g.phase = top >= target && totals.filter(v => v === top).length === 1 ? 'over' : 'roundEnd';
  }

  g.nextRound = () => { first = (first + 1) % n; startRound(); };

  g.view = () => ({
    showScore: true, showPile: false,
    players: P.map((p, i) => {
      const t = teamOf(i);
      return { hand: p.hand, handCount: p.hand.length, sweeps: games ? totals[t] : 0, score: fmt(target ? (totals[t] + decl[t]) * div + score[t] : score[t]) };
    }),
    center: g.trick.map(t => ({ card: t.card, p: t.p, hl: g.pending && t.p === g.winner })),
    deckCount: deck.length, trumpCard: deck.length && hasTrump ? trumpCard : null, trumpSuit: trump, staged: null
  });

  g.result = () => {
    const scores = target || games ? totals.slice() : score.map(s => Math.floor(s / div));
    const me = teamOf(0), mine = scores[me], other = Math.max(...scores.filter((_, t) => t !== me));
    return { outcome: mine > other ? 'win' : mine < other ? 'lose' : 'tie', score: mine, scores };
  };

  // ---------- bots ----------
  const keep = c => pts(c) + (c.s === trump ? 6 + str(c) * 0.5 : str(c) * 0.1); // how much a card is worth keeping

  function heuristic(i, legal) {
    if (!g.trick.length) return legal.reduce((a, b) => (keep(b) < keep(a) ? b : a));
    const best = leaderOf(g.trick), tp = trickPts(g.trick), last = g.trick.length === n - 1;
    const mateWinning = teams && teamOf(best.p) === teamOf(i);
    let pick = null, top = -Infinity;
    for (const c of legal) {
      let v;
      if (beats(c, best.card)) v = (tp + pts(c)) * (last ? 1 : 0.7) - keep(c) * 0.6 - (mateWinning ? tp : 0);
      else if (mateWinning) v = pts(c) * (last ? 1 : 0.5) - keep(c) * 0.3;
      else v = -pts(c) - keep(c) * 0.3;
      if (v > top) { top = v; pick = c; }
    }
    return pick;
  }

  // Perfect play for the 2-player endgame: with the deck empty the opponent's hand is fully deducible.
  function solve(hands, lead, turn, me) {
    const hand = hands[turn];
    if (!hand.length) return { val: 0 };
    let best = null;
    for (const c of hand) {
      const nh = hands.map((h, k) => (k === turn ? h.filter(x => x !== c) : h));
      let val;
      if (!lead) val = solve(nh, c, 1 - turn, me).val;
      else {
        const w = beats(c, lead) ? turn : 1 - turn, p = pts(c) + pts(lead);
        val = (w === me ? p : -p) + solve(nh, null, w, me).val;
      }
      if (!best || (turn === me ? val > best.val : val < best.val)) best = { val, card: c };
    }
    return best;
  }

  g.botMove = (level = diff) => {
    const i = g.current, legal = g.legal(i);
    const rnd = () => legal[Math.floor(rng() * legal.length)];
    if (level === 'easy' && rng() < 0.55) return { id: rnd().id };
    if (level === 'medium' && rng() < 0.12) return { id: rnd().id };
    if (level === 'hard' && n === 2 && !deck.length && !R.followSuit) {
      const hands = [P[0].hand, P[1].hand];
      return { id: solve(hands, g.trick.length ? g.trick[0].card : null, i, i).card.id };
    }
    return { id: heuristic(i, legal).id };
  };

  g.hint = () => g.botMove('hard');

  return g;
}
