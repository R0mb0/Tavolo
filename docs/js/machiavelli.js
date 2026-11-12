// Table for Machiavelli: every card on the table can be picked up and placed in another combination.
import { cardHTML } from './cards.js';
import { newGame as createGame, clearSession } from './session.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];

export function startMachiavelli(root, def, opts, onExit, resume) {
  const ctl = new AbortController();
  let alive = true, busy = false, g, msg = null, hint = null, bySuit = true, drag = null, dragEnd = 0;
  const sel = new Set();

  const names = () => Array.from({ length: opts.players }, (_, i) => (i === 0 ? t('play.you') : t('play.bot', { n: i })));
  const label = c => `${[1, 11, 12, 13].includes(c.r) ? t('frank.' + c.r) : c.r} · ${t('suit.' + c.s)}`;
  const mine = () => g.phase === 'play' && g.current === 0 && !busy;
  const say = key => { msg = () => t(key); };

  function render() {
    if (!alive) return;
    const v = g.view(), N = names(), me = v.players[0], myTurn = mine();
    const cls = c => (sel.has(c.id) ? 'sel ' : '') + (hint && hint.ids && hint.ids.includes(c.id) ? 'hinted' : '');
    const btn = c => cardHTML(c, { tag: 'button', label: label(c), disabled: !myTurn, cls: cls(c) });

    let opps = '';
    for (let i = 1; i < g.n; i++)
      opps += `<div class="opp${g.phase === 'play' && g.current === i ? ' active' : ''}"><div class="opp-main">` +
        `<div class="opp-name"><span class="avatar">${i}</span>${N[i]}</div>` +
        `<div class="opp-hand"><i class="mini"></i><span class="badge">× ${v.players[i].handCount}</span></div></div></div>`;

    const pile = `<div class="side"><button type="button" class="pile-btn${hint && hint.pile ? ' hinted' : ''}" data-do="stock" aria-label="${t('play.deck')}"${myTurn ? '' : ' disabled'}>` +
      (v.stock ? `<span class="stack">${cardHTML(null)}<span class="count">${v.stock}</span></span>` : '<span class="pile empty"><span class="glyph">✕</span></span>') + '</button></div>';

    const groups = v.groups.map((gr, i) =>
      `<div class="meld mgrp${gr.valid ? '' : ' bad'}${hint && hint.group === i ? ' hinted' : ''}" data-gi="${i}">${gr.cards.map(btn).join('')}` +
      `<button type="button" class="plus" data-group="${i}" aria-label="${t('mach.add')}" title="${t('mach.add')}"${myTurn && sel.size ? '' : ' disabled'}>+</button></div>`).join('');

    const order = c => (bySuit ? SUITS.indexOf(c.s) * 20 + c.r : c.r * 10 + SUITS.indexOf(c.s));
    const hand = me.hand.slice().sort((a, b) => order(a) - order(b)).map(btn).join('');

    const status = msg ? msg() : !myTurn ? (g.phase === 'play' ? t('play.turnOf', { name: N[g.current] }) : '') : t('mach.turn');
    const b = (act, key, on, extra = '') => `<button type="button" class="btn ${extra}" data-do="${act}"${on ? '' : ' disabled'}>${t(key)}</button>`;
    root.innerHTML =
      `<div class="table rum mach"><div class="opps n${g.n - 1}">${opps}</div>` +
      `<div class="felt">${pile}<div class="melds">${groups}</div></div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${status}</div>` +
      `<div class="rum-bar">` + b('new', 'mach.new', myTurn && sel.size > 0, 'primary') +
      b('end', 'mach.end', myTurn && v.canEnd, hint && hint.end ? 'primary hinted' : 'primary') + b('reset', 'mach.undo', myTurn && v.dirty) +
      `<span class="grow"></span>` + b('sort', 'rum.sort', true) +
      `<button type="button" class="icon hint" data-do="hint" title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button></div>` +
      `<div class="me${myTurn ? ' active' : ''}"><div class="hand many${me.hand.length > 10 ? ' huge' : ''}">${hand}</div></div></div>`;
  }

  const WHY = { machFix: 'mach.fix', machPlayOne: 'mach.playOne', machReset: 'mach.reset' };
  function done(res, sound = 'card') {
    hint = null;
    if (res.ok) { sel.clear(); msg = null; sfx(sound); } else if (WHY[res.reason]) say(WHY[res.reason]);
    return res.ok;
  }

  async function finish() {
    const r = g.result(), N = names();
    record(def.id, r); clearSession();
    sfx(r.outcome === 'win' ? 'win' : 'lose');
    const body = `<p>${t('end.cardsLeft')}</p><ul class="final">` + r.scores.map((sc, k) => `<li class="${k === 0 ? 'mine' : ''}"><span>${N[k]}</span><b>${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({ title: t('end.' + r.outcome), body, actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }] });
    if (!alive) return;
    if (val === 'again') { g = createGame(def, opts); sel.clear(); msg = null; run(); } else onExit();
  }

  // bot turns and end of game
  async function run() {
    if (busy) return;
    busy = true;
    const game = g;
    while (alive && g === game && g.phase === 'play' && g.current !== 0) {
      render();
      await sleep(650);
      if (!alive || g !== game) break;
      const a = g.botStep(), name = names()[a.p];
      sfx('card');
      msg = a.type === 'draw' ? () => t('rum.bDraw', { name }) : a.type === 'meld' ? () => t('rum.bMeld', { name }) : a.type === 'layoff' ? () => t('rum.bLay', { name }) : null;
    }
    busy = false;
    render();
    if (alive && g === game && g.phase === 'over') finish();
  }

  // ---- drag and drop: a card (or the whole selection) onto a combination, or onto the felt for a new one ----
  const endDrag = () => {
    if (drag && drag.fl) { drag.fl.remove(); drag.els.forEach(x => { x.style.visibility = ''; }); }
    drag = null;
  };
  root.addEventListener('pointerdown', e => {
    if (!mine() || e.button) return;
    const el = e.target.closest('button.card');
    if (el && !el.disabled) drag = { el, id: e.pointerId, x: e.clientX, y: e.clientY };
  }, { signal: ctl.signal });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.fl) {
      if (Math.hypot(dx, dy) < 8) return;
      const id = drag.el.dataset.id;
      drag.ids = sel.has(id) ? [...sel] : [id];
      drag.els = drag.ids.map(k => root.querySelector(`button.card[data-id="${k}"]`)).filter(Boolean);
      const r = drag.el.getBoundingClientRect(), fl = document.createElement('div');
      fl.className = 'fly drag dragrow';
      fl.style.cssText = `left:${r.left}px;top:${r.top}px;--cw:${r.width}px`;
      fl.innerHTML = drag.els.map(x => x.outerHTML).join('');
      document.body.appendChild(fl);
      drag.els.forEach(x => { x.style.visibility = 'hidden'; });
      drag.fl = fl;
    }
    drag.fl.style.transform = `translate(${dx}px,${dy}px)`;
  }, { signal: ctl.signal });
  addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag, dragged = !!d.fl;
    endDrag();
    if (!dragged) return;
    dragEnd = Date.now();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const grp = under && under.closest('.mgrp'), felt = under && under.closest('.felt');
    if (grp) done(g.move(d.ids, +grp.dataset.gi), 'take'); else if (felt) done(g.move(d.ids, 'new'), 'take');
    render();
  }, { signal: ctl.signal });
  addEventListener('pointercancel', endDrag, { signal: ctl.signal });

  root.addEventListener('click', e => {
    if (Date.now() - dragEnd < 350) return;
    const d = e.target.closest('[data-do]');
    if (d && d.dataset.do === 'sort') { bySuit = !bySuit; render(); return; }
    if (!mine()) return;
    if (d) {
      const what = d.dataset.do;
      if (what === 'hint') { hint = g.hint(); render(); return; }
      if (what === 'new') done(g.move([...sel], 'new'), 'take');
      else if (what === 'reset') { g.reset(); sel.clear(); msg = null; hint = null; }
      else if (what === 'end') { if (done(g.endTurn())) { run(); return; } }
      else if (what === 'stock') { if (done(g.drawCard())) { run(); return; } }
      render(); return;
    }
    const grp = e.target.closest('[data-group]');
    if (grp) { done(g.move([...sel], +grp.dataset.group), 'take'); render(); return; }
    const c = e.target.closest('button.card');
    if (c && !c.disabled) {
      const id = c.dataset.id;
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      hint = null; msg = null; render();
    }
  }, { signal: ctl.signal });

  g = createGame(def, opts, resume);
  run();

  return {
    rerender: render,
    stop() { alive = false; endDrag(); ctl.abort(); },
    async quit() {
      if (g.phase === 'over') { onExit(); return; }
      const ok = await dialog({
        title: t('play.quit'), body: `<p>${t('play.quitHint')}</p>`,
        actions: [{ label: t('play.stay'), val: false, primary: true }, { label: t('play.leave'), val: true }]
      });
      if (ok && alive) { clearSession(); onExit(); }
    }
  };
}
