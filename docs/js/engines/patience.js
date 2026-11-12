// Patience engine (Klondike family): columns, foundations, stock and waste. Single player, no bots.
import { buildDeck, shuffle, DECKS } from '../cards.js';

const RED = new Set(['hearts', 'diamonds']);

export function createPatienceGame(def, opts) {
  const rng = opts.rng || Math.random, R = def.rules, lvl = def.levels[opts.difficulty];
  const suits = DECKS[def.deck].suits, top = Math.max(...DECKS[def.deck].ranks);
  let S, history = [];
  const g = { kind: 'patience', n: 1, phase: 'play', moves: 0 };

  g.newDeal = () => {
    const d = shuffle(buildDeck(def.deck), rng), cols = [];
    for (let c = 0; c < R.columns; c++) {
      const col = [];
      for (let k = 0; k <= c; k++) col.push({ card: d.pop(), up: k === c });
      cols.push(col);
    }
    S = { stock: d, waste: [], found: Object.fromEntries(suits.map(s => [s, []])), cols, passes: 0 };
    history = []; g.moves = 0; g.phase = 'play';
  };
  g.newDeal();

  const fitsCol = (card, col) => {
    if (!col.length) return card.r === top;
    const t = col[col.length - 1];
    if (!t.up || t.card.r !== card.r + 1) return false;
    return R.build === 'altColor' ? RED.has(t.card.s) !== RED.has(card.s) : t.card.s !== card.s;
  };
  const fitsFound = card => S.found[card.s].length === card.r - 1;
  const save = () => { history.push(JSON.stringify(S)); if (history.length > 400) history.shift(); };
  const after = () => {
    g.moves++;
    for (const col of S.cols) { const t = col[col.length - 1]; if (t && !t.up) t.up = true; }
    if (suits.every(s => S.found[s].length === top)) g.phase = 'over';
  };

  g.canDraw = () => S.stock.length > 0 || (S.waste.length > 0 && (lvl.passes < 0 || S.passes < lvl.passes - 1));
  g.draw = () => {
    if (!g.canDraw()) return false;
    save();
    if (S.stock.length) for (let k = 0; k < lvl.draw && S.stock.length; k++) S.waste.push(S.stock.pop());
    else { S.stock = S.waste.reverse(); S.waste = []; S.passes++; }
    g.moves++;
    return true;
  };

  // Where would the card (or run) at `loc` go? Foundation first, then a column. value = how useful the move is.
  function plan(loc) {
    let cards, remove;
    if (loc.from === 'waste') {
      if (!S.waste.length) return null;
      cards = [S.waste[S.waste.length - 1]]; remove = () => S.waste.pop();
    } else if (loc.from === 'col') {
      const col = S.cols[loc.c];
      if (!col || !col[loc.i] || !col[loc.i].up) return null;
      cards = col.slice(loc.i).map(x => x.card); remove = () => col.splice(loc.i);
    } else return null;
    const first = cards[0];
    if (cards.length === 1 && fitsFound(first)) return { value: 3, go() { remove(); S.found[first.s].push(first); } };
    let best = -1;
    for (let c = 0; c < S.cols.length; c++) {
      if (loc.from === 'col' && c === loc.c) continue;
      const col = S.cols[c];
      if (!fitsCol(first, col)) continue;
      if (col.length) { best = c; break; }
      if (loc.from === 'col' && loc.i === 0) continue;   // top-rank card already at the base of a column: pointless
      if (best < 0) best = c;
    }
    if (best < 0) return null;
    const value = loc.from === 'waste' ? 1 : loc.i > 0 && !S.cols[loc.c][loc.i - 1].up ? 2 : loc.i === 0 ? 1 : 0;
    return { value, go() { remove(); S.cols[best].push(...cards.map(card => ({ card, up: true }))); } };
  }

  /** Player action: tap the stock, the waste top or a face-up column card. Returns false if nothing can move. */
  g.tap = loc => {
    if (loc.from === 'stock') return g.draw();
    const p = plan(loc);
    if (!p) return false;
    save(); p.go(); after();
    return true;
  };

  g.undo = () => {
    if (!history.length) return false;
    S = JSON.parse(history.pop()); g.phase = 'play';
    return true;
  };

  g.hint = () => {
    const locs = [];
    if (S.waste.length) locs.push({ from: 'waste' });
    S.cols.forEach((col, c) => {
      const i = col.findIndex(x => x.up);
      if (i < 0) return;
      locs.push({ from: 'col', c, i });
      if (i !== col.length - 1) locs.push({ from: 'col', c, i: col.length - 1 });
    });
    let best = null, bv = 0;
    for (const l of locs) { const p = plan(l); if (p && p.value > bv) { bv = p.value; best = l; } }
    return best || (g.canDraw() ? { from: 'stock' } : null);
  };

  // Once every card is face up and the stock is empty the game plays itself out.
  g.canAuto = () => g.phase === 'play' && !S.stock.length && !S.waste.length && S.cols.every(col => col.every(x => x.up));
  g.autoStep = () => {
    for (let c = 0; c < S.cols.length; c++) {
      const col = S.cols[c];
      if (col.length && fitsFound(col[col.length - 1].card)) return g.tap({ from: 'col', c, i: col.length - 1 });
    }
    return false;
  };

  g.view = () => ({
    stock: S.stock.length, waste: S.waste.slice(-lvl.draw), cols: S.cols,
    found: suits.map(s => ({ suit: s, top: S.found[s][S.found[s].length - 1] || null })),
    canDraw: g.canDraw(), canUndo: history.length > 0,
    passesLeft: lvl.passes < 0 ? null : lvl.passes - 1 - S.passes
  });

  g.result = () => { const score = Math.max(10, 400 - g.moves); return { outcome: 'win', score, scores: [score] }; };

  return g;
}
