// Table for patience games: stock, waste, foundations and columns. Tap a card and it moves to the best legal place.
import { cardHTML, suitHTML } from './cards.js';
import { ENGINES } from './engines/index.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const NAMED_RANKS = [1, 8, 9, 10];
const still = matchMedia('(prefers-reduced-motion: reduce)');

export function startSolitaire(root, def, opts, onExit) {
  const ctl = new AbortController();
  let alive = true, busy = false, hint = null, nope = null;
  const g = ENGINES[def.engine](def, opts);

  const label = c => `${(c.deck === 'french' ? [1, 11, 12, 13] : NAMED_RANKS).includes(c.r) ? t((c.deck === 'french' ? 'frank.' : 'rank.') + c.r) : c.r} · ${t('suit.' + c.s)}`;
  const hinted = loc => !!hint && hint.from === loc.from && (loc.from !== 'col' || (hint.c === loc.c && hint.i === loc.i));

  function render() {
    if (!alive) return;
    const prev = new Map();
    if (!still.matches) root.querySelectorAll('.sol [data-id]').forEach(el => prev.set(el.dataset.id, el.getBoundingClientRect()));
    const v = g.view();
    const up = (c, loc) => cardHTML(c, {
      tag: 'button', label: label(c),
      cls: (hinted(loc) ? 'hinted ' : '') + (nope === c.id ? 'nope' : ''),
      attrs: ` data-from="${loc.from}"` + (loc.from === 'col' ? ` data-c="${loc.c}" data-i="${loc.i}"` : '')
    });

    const stock = `<button type="button" class="pile stock${hinted({ from: 'stock' }) ? ' hinted' : ''}" data-from="stock" aria-label="${t('sol.stock')}"${v.canDraw ? '' : ' disabled'}>` +
      (v.stock ? `${cardHTML(null)}<span class="count">${v.stock}</span>` : `<span class="glyph">${v.canDraw ? '↻' : '✕'}</span>`) + '</button>';
    const waste = `<div class="waste">${v.waste.map((c, k) => (k === v.waste.length - 1 ? up(c, { from: 'waste' }) : cardHTML(c, { label: label(c) }))).join('')}</div>`;
    const found = v.found.map(f => (f.top ? cardHTML(f.top, { label: label(f.top) }) : `<div class="pile empty">${suitHTML(def.deck, f.suit)}</div>`)).join('');
    const cols = v.cols.map((col, c) => `<div class="col">` +
      (col.length ? col.map((x, i) => (x.up ? up(x.card, { from: 'col', c, i }) : cardHTML(null))).join('') : '<div class="pile empty"></div>') + '</div>').join('');

    const passes = v.passesLeft == null ? '' : `<span class="badge">↻ ${v.passesLeft}</span>`;
    root.innerHTML = `<div class="sol" style="--n:${v.cols.length}"><div class="sol-top"><div class="sol-stock">${stock}${waste}</div><div class="sol-found">${found}</div></div>` +
      `<div class="sol-cols">${cols}</div>` +
      `<div class="sol-bar"><span class="badge strong">${t('sol.moves', { n: g.moves })}</span>${passes}<span class="grow"></span>` +
      `<button type="button" class="icon hint" data-do="hint" title="${t('nav.hint')}" aria-label="${t('nav.hint')}"><svg><use href="#i-hint"/></svg></button>` +
      `<button type="button" class="btn" data-do="undo"${v.canUndo ? '' : ' disabled'}>${t('sol.undo')}</button>` +
      `<button type="button" class="btn" data-do="new">${t('sol.new')}</button></div></div>`;
    nope = null;

    if (still.matches) return;
    const from = root.querySelector('.stock')?.getBoundingClientRect();
    root.querySelectorAll('.sol [data-id]').forEach(el => {
      const r = el.getBoundingClientRect(), old = prev.get(el.dataset.id) || (prev.size && el.closest('.waste') ? from : null);
      if (!old) return;
      const dx = old.left - r.left, dy = old.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px,${dy}px)`, zIndex: 5 }, { transform: 'none', zIndex: 5 }], { duration: 220 * settings.speed, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  async function win() {
    const r = g.result();
    record(def.id, r);
    sfx('win');
    const val = await dialog({
      title: t('end.win'), body: `<p>${t('end.moves', { n: g.moves })}</p>`,
      actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }]
    });
    if (!alive) return;
    if (val === 'again') { g.newDeal(); render(); } else onExit();
  }

  async function settle() {
    if (g.phase === 'over') { win(); return; }
    if (!g.canAuto()) return;
    busy = true;
    while (alive && g.canAuto() && g.autoStep()) { sfx('card'); render(); await sleep(130); }
    busy = false;
    if (alive && g.phase === 'over') win();
  }

  root.addEventListener('click', async e => {
    if (busy) return;
    const act = e.target.closest('[data-do]');
    if (act) {
      const what = act.dataset.do;
      if (what === 'hint') { hint = g.hint(); render(); }
      if (what === 'undo') { hint = null; g.undo(); render(); }
      if (what === 'new') {
        if (g.moves > 0 && g.phase !== 'over') {
          const ok = await dialog({
            title: t('sol.newTitle'), body: `<p>${t('sol.newHint')}</p>`,
            actions: [{ label: t('common.cancel'), val: false, primary: true }, { label: t('sol.new'), val: true }]
          });
          if (!ok || !alive) return;
          record(def.id, { outcome: 'lose', score: 0 });
        }
        hint = null; g.newDeal(); render();
      }
      return;
    }
    const el = e.target.closest('[data-from]');
    if (!el || el.disabled) return;
    const loc = { from: el.dataset.from, c: +el.dataset.c, i: +el.dataset.i };
    hint = null;
    if (g.tap(loc)) { sfx('card'); render(); settle(); }
    else { nope = el.dataset.id; render(); }
  }, { signal: ctl.signal });

  render();

  return {
    rerender: render,
    stop() { alive = false; ctl.abort(); },
    async quit() {
      if (g.phase === 'over' || g.moves === 0) { onExit(); return; }
      const ok = await dialog({
        title: t('play.quit'), body: `<p>${t('play.quitHint')}</p>`,
        actions: [{ label: t('play.stay'), val: false, primary: true }, { label: t('play.leave'), val: true }]
      });
      if (ok && alive) onExit();
    }
  };
}
