// The shared game table: renders any engine's view and drives the turn loop (human + bots).
import { cardHTML } from './cards.js';
import { ENGINES } from './engines/index.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const NAMED_RANKS = [1, 8, 9, 10];
const MOVING = '.center [data-id], .staged [data-id], .hand [data-id]';
const still = matchMedia('(prefers-reduced-motion: reduce)');

export function startTable(root, def, opts, onExit) {
  const ctl = new AbortController();
  let alive = true, g, msg = null, pick = null, chooser = null;
  let freshSeat = null, flyTo = null, hintId = null;

  const names = () => Array.from({ length: opts.players }, (_, i) =>
    i === 0 ? t('play.you') : t('play.bot', { n: i }) + (g.teams && i === 2 ? ` (${t('play.partner')})` : ''));
  const teamNames = () => {
    const N = names();
    return g.teams ? [`${N[0]} + ${N[2]}`, `${N[1]} + ${N[3]}`] : N;
  };
  const label = c => `${NAMED_RANKS.includes(c.r) ? t('rank.' + c.r) : c.r} · ${t('suit.' + c.s)}`;
  const suitIcon = s => `<svg class="si s-${s}" aria-hidden="true"><use href="#s-${s}"/></svg>`;

  function eventText() {
    const e = g.lastEvent, N = names();
    if (!e) return null;
    if (e.type === 'takes') return t('play.takes', { name: N[e.p], pts: e.pts });
    if (e.type === 'sweep') return t('play.sweep', { name: N[e.p] });
    if (e.type === 'capture') return t('play.captures', { name: N[e.p], n: e.n });
    if (e.type === 'steal') return t('play.steals', { name: N[e.p], target: teamNames()[e.target] });
    return null;
  }

  function render() {
    if (!alive) return;
    const prev = new Map();
    if (!still.matches) root.querySelectorAll(MOVING).forEach(el => prev.set(el.dataset.id, { r: el.getBoundingClientRect(), html: el.outerHTML }));

    const v = g.view(), N = names(), st = v.staged;
    const playing = g.phase === 'play' && !g.pending;
    const myTurn = playing && g.current === 0;
    const badges = p =>
      (v.showPile ? `<span class="badge" title="${t('play.pile')}"><svg class="ic" aria-hidden="true"><use href="#i-pile"/></svg>${p.pile}</span>` : '') +
      (v.showScore ? `<span class="badge strong">${p.score} ${t('play.pts')}</span>` : '') +
      (p.sweeps ? `<span class="badge gold" title="${t('score.sweeps')}">✦ ${p.sweeps}</span>` : '');
    const top = p => (p.pileTop ? `<div class="piletop">${cardHTML(p.pileTop, { label: label(p.pileTop) })}</div>` : '');

    let opps = '';
    for (let i = 1; i < g.n; i++) {
      const p = v.players[i];
      const cls = (playing && g.current === i ? ' active' : '') + (st && st.steal != null && st.steal === g.teamOf(i) ? ' robbed' : '');
      opps += `<div class="opp${cls}" data-seat="${i}"><div class="opp-main"><div class="opp-name"><span class="avatar">${i}</span>${N[i]}</div>` +
        `<div class="opp-hand">${'<i class="mini"></i>'.repeat(p.handCount)}</div><div class="badges">${badges(p)}</div></div>${top(p)}</div>`;
    }

    const center = v.center.map(x =>
      `<div class="slot${x.hl ? ' hl' : ''}">${cardHTML(x.card, { label: label(x.card) })}` +
      (x.p != null ? `<span class="owner">${N[x.p]}</span>` : '') + '</div>').join('');
    const staged = st ? `<div class="slot staged${st.sweep ? ' sweep' : ''}">${cardHTML(st.card, { label: label(st.card) })}<span class="owner">${N[st.p]}</span></div>` : '';

    const side = `<div class="side">` +
      (v.deckCount ? `<div class="stack">${cardHTML(null)}<span class="count">${v.deckCount}</span></div>` : '') +
      (v.trumpCard ? `<div class="trump">${cardHTML(v.trumpCard, { label: label(v.trumpCard) })}<span class="owner">${t('play.trump')}</span></div>`
        : v.trumpSuit ? `<div class="trump-suit" title="${t('play.trump')}">${suitIcon(v.trumpSuit)}<span class="owner">${t('play.trump')}</span></div>` : '') +
      '</div>';

    const me = v.players[0];
    const hand = me.hand.map(c => cardHTML(c, { tag: 'button', label: label(c), disabled: !myTurn, cls: c.id === hintId ? 'hinted' : '' })).join('');
    const hintBtn = `<button type="button" class="icon hint" data-hint title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button>`;

    let overlay = '';
    if (chooser) {
      const byId = Object.fromEntries(v.center.map(x => [x.card.id, x.card]));
      overlay = `<div class="chooser"><div class="chooser-box"><h3>${t('play.choose')}</h3>` +
        chooser.opts.map((o, k) => `<button type="button" class="opt" data-opt="${k}">` +
          (o.steal != null ? `<span>${t('play.stealFrom', { name: teamNames()[o.steal] })}</span>`
            : o.take.map(id => cardHTML(byId[id], { label: label(byId[id]) })).join('')) + '</button>').join('') +
        `<button type="button" class="btn" data-opt="x">${t('common.cancel')}</button></div></div>`;
    }

    const status = msg ? msg() : myTurn ? t('play.yourTurn') : playing ? t('play.turnOf', { name: N[g.current] }) : '';
    root.innerHTML =
      `<div class="table"><div class="opps n${g.n - 1}">${opps}</div>` +
      `<div class="felt">${side}<div class="mid"><div class="center">${center}</div>${staged}</div></div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${status}</div>` +
      `<div class="me${myTurn ? ' active' : ''}" data-seat="0"><div class="me-info"><div class="badges">${badges(me)}</div>${top(me)}${hintBtn}</div>` +
      `<div class="hand${me.hand.length > 5 ? ' many' : ''}">${hand}</div></div>${overlay}</div>`;
    animate(prev);
  }

  // Moves cards from where they were to where they are now; captured cards fly to their new owner.
  function animate(prev) {
    const seat = freshSeat, dest = flyTo;
    freshSeat = null; flyTo = null;
    if (still.matches) return;
    const dur = 280 * settings.speed, ease = 'cubic-bezier(.2,.8,.2,1)';
    const mid = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const box = sel => root.querySelector(sel)?.getBoundingClientRect();
    const now = new Set();
    root.querySelectorAll(MOVING).forEach(el => {
      const id = el.dataset.id, r = el.getBoundingClientRect(), old = prev.get(id);
      now.add(id);
      let from, scale;
      if (old) { from = mid(old.r); scale = old.r.width / r.width; }
      else {
        const src = el.closest('.hand') ? box('.stack') : seat != null ? box(`[data-seat="${seat}"]`) : null;
        if (!src) return;
        from = mid(src); scale = 0.45;
      }
      const to = mid(r), dx = from.x - to.x, dy = from.y - to.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${scale})` }, { transform: 'none' }], { duration: dur, easing: ease });
    });
    const dst = dest != null ? box(`[data-seat="${dest}"]`) : null;
    if (dst) prev.forEach((o, id) => {
      if (now.has(id)) return;
      const gh = document.createElement('div');
      gh.className = 'ghost';
      gh.style.cssText = `left:${o.r.left}px;top:${o.r.top}px;--cw:${o.r.width}px`;
      gh.innerHTML = o.html;
      document.body.appendChild(gh);
      const a = mid(o.r), b = mid(dst);
      gh.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.x - a.x}px,${b.y - a.y}px) scale(.3)`, opacity: 0.15 }],
        { duration: dur * 1.4, easing: 'ease-in' }).onfinish = () => gh.remove();
    });
  }

  root.addEventListener('click', e => {
    const o = e.target.closest('[data-opt]');
    if (o && chooser) {
      const c = chooser; chooser = null;
      if (o.dataset.opt === 'x') { render(); return; }
      const res = pick; pick = null;
      res({ id: c.id, opt: c.opts[+o.dataset.opt] });
      return;
    }
    if (e.target.closest('[data-hint]') && pick && !chooser) { hintId = g.hint().id; render(); return; }
    const card = e.target.closest('.hand .card');
    if (card && pick && !card.disabled && !chooser) {
      const id = card.dataset.id;
      if (g.kind === 'fishing') {
        const os = g.options(id);
        if (os.length > 1) { chooser = { id, opts: os }; render(); return; }
        const res = pick; pick = null;
        res({ id, opt: os[0] });
      } else { const res = pick; pick = null; res({ id }); }
    }
  }, { signal: ctl.signal });

  const humanMove = () => new Promise(res => { pick = res; });

  async function showSummary() {
    const s = g.summary, TN = teamNames();
    const rows = s.rows.map(r => `<tr><th>${t('score.' + r.key)}</th>` +
      r.vals.map((v, k) => `<td class="${r.winner === k || (r.winner === -2 && v > 0) ? 'won' : ''}">${v}</td>`).join('') + '</tr>').join('');
    const body = `<table class="sum"><thead><tr><th></th>${TN.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}` +
      `<tr class="tot"><th>${t('round.points')}</th>${s.roundPts.map(v => `<td>+${v}</td>`).join('')}</tr>` +
      `<tr class="tot big"><th>${t('round.total')}</th>${s.totals.map(v => `<td>${v}</td>`).join('')}</tr></tbody></table>`;
    await dialog({ title: t('round.title', { n: s.round }), body, actions: [{ label: t('round.continue'), val: 1, primary: true }] });
    s.shown = true;
  }

  async function finish() {
    const r = g.result(), TN = teamNames();
    record(def.id, r);
    sfx(r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'take');
    const body = '<ul class="final">' + r.scores.map((sc, k) =>
      `<li class="${k === g.teamOf(0) ? 'mine' : ''}"><span>${TN[k]}</span><b>${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({
      title: t('end.' + r.outcome), body,
      actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }]
    });
    if (!alive) return;
    if (val === 'again') { newGame(); loop(); } else onExit();
  }

  function newGame() {
    g = ENGINES[def.engine](def, opts);
    msg = null; pick = null; chooser = null; freshSeat = null; flyTo = null; hintId = null;
  }

  async function loop() {
    const mine = g;
    while (alive && g === mine) {
      render();
      if ((g.phase === 'roundEnd' || g.phase === 'over') && g.summary && !g.summary.shown) { await showSummary(); continue; }
      if (g.phase === 'over') { finish(); return; }
      if (g.phase === 'roundEnd') { g.nextRound(); msg = null; continue; }
      if (g.pending) {
        await sleep(g.lastEvent ? 1300 : 800);
        if (!alive || g !== mine) return;
        const st = g.staged;
        flyTo = g.kind === 'trick' ? g.winner : st && (st.take.length || st.steal != null) ? st.p : null;
        if (flyTo != null) sfx('take');
        g.advance(); msg = null; continue;
      }
      let mv;
      if (g.current === 0) mv = await humanMove();
      else { await sleep(700); if (!alive || g !== mine) return; mv = g.botMove(); }
      if (!alive || g !== mine) return;
      freshSeat = g.current; hintId = null;
      g.play(mv.id, mv.opt);
      sfx(g.lastEvent && g.lastEvent.type === 'sweep' ? 'sweep' : 'card');
      const txt = eventText;
      msg = g.lastEvent ? () => txt() : null;
    }
  }

  newGame();
  loop();

  return {
    rerender: render,
    stop() { alive = false; ctl.abort(); },
    async quit() {
      if (g.phase === 'over') { onExit(); return; }
      const ok = await dialog({
        title: t('play.quit'), body: `<p>${t('play.quitHint')}</p>`,
        actions: [{ label: t('play.stay'), val: false, primary: true }, { label: t('play.leave'), val: true }]
      });
      if (ok && alive) onExit();
    }
  };
}
