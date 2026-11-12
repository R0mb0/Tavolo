// The shared game table: renders any engine's view and drives the turn loop (human + bots).
import { cardHTML } from './cards.js';
import { ENGINES } from './engines/index.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record } from './store.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const NAMED_RANKS = [1, 8, 9, 10];

export function startTable(root, def, opts, onExit) {
  const ctl = new AbortController();
  let alive = true, g, msg = null, pick = null, chooser = null, fresh = null;

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
      opps += `<div class="opp${cls}"><div class="opp-main"><div class="opp-name"><span class="avatar">${i}</span>${N[i]}</div>` +
        `<div class="opp-hand">${'<i class="mini"></i>'.repeat(p.handCount)}</div><div class="badges">${badges(p)}</div></div>${top(p)}</div>`;
    }

    const center = v.center.map(x =>
      `<div class="slot${x.hl ? ' hl' : ''}${fresh === x.card.id ? ' pop' : ''}">${cardHTML(x.card, { label: label(x.card) })}` +
      (x.p != null ? `<span class="owner">${N[x.p]}</span>` : '') + '</div>').join('');
    const staged = st ? `<div class="slot staged pop${st.sweep ? ' sweep' : ''}">${cardHTML(st.card, { label: label(st.card) })}<span class="owner">${N[st.p]}</span></div>` : '';

    const side = `<div class="side">` +
      (v.deckCount ? `<div class="stack">${cardHTML(null)}<span class="count">${v.deckCount}</span></div>` : '') +
      (v.trumpCard ? `<div class="trump">${cardHTML(v.trumpCard, { label: label(v.trumpCard) })}<span class="owner">${t('play.trump')}</span></div>`
        : v.trumpSuit ? `<div class="trump-suit" title="${t('play.trump')}">${suitIcon(v.trumpSuit)}<span class="owner">${t('play.trump')}</span></div>` : '') +
      '</div>';

    const me = v.players[0];
    const hand = me.hand.map(c => cardHTML(c, { tag: 'button', label: label(c), disabled: !myTurn })).join('');

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
      `<div class="me${myTurn ? ' active' : ''}"><div class="me-info"><div class="badges">${badges(me)}</div>${top(me)}</div><div class="hand">${hand}</div></div>` +
      `${overlay}</div>`;
    fresh = null;
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
    msg = null; pick = null; chooser = null; fresh = null;
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
        g.advance(); msg = null; continue;
      }
      let mv;
      if (g.current === 0) mv = await humanMove();
      else { await sleep(700); if (!alive || g !== mine) return; mv = g.botMove(); }
      if (!alive || g !== mine) return;
      g.play(mv.id, mv.opt);
      fresh = mv.id;
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
