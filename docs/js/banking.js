// Table for banking games (Sette e mezzo): the bank at the top, each player's cards face up, hit or stand.
import { cardHTML } from './cards.js';
import { ENGINES } from './engines/index.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const frac = v => (v == null ? '?' : (Math.floor(v) || (v % 1 ? '' : 0)) + (v % 1 ? '½' : ''));

export function startBanking(root, def, opts, onExit) {
  const ctl = new AbortController();
  let alive = true, busy = false, g, hint = null;

  const names = () => Array.from({ length: opts.players }, (_, i) => (i === 0 ? t('play.you') : t('play.bot', { n: i })));
  const label = c => `${[1, 8, 9, 10].includes(c.r) ? t('rank.' + c.r) : c.r} · ${t('suit.' + c.s)}`;
  const mine = () => g.phase === 'play' && g.current === 0 && !busy;

  function render() {
    if (!alive) return;
    const v = g.view(), N = names(), myTurn = mine();
    const cards = (cs, hidden) => cs.map((c, k) => (hidden && k === 0 ? cardHTML(null) : cardHTML(c, { label: label(c) }))).join('');
    const outcome = p => (p.delta ? `<span class="badge ${p.delta > 0 ? 'gold' : 'lost'}">${p.delta > 0 ? '+' : ''}${p.delta}</span>` : p.state === 'bust' ? `<span class="badge lost">${t('sm.bust')}</span>` : '');
    const seat = (p, name, i, cls = '') =>
      `<div class="opp bseat${g.phase === 'play' && v.current === i ? ' active' : ''}${cls}"><div class="opp-main"><div class="opp-name">${i > 0 ? `<span class="avatar">${i}</span>` : ''}${name}</div>` +
      `<div class="badges"><span class="badge strong">${frac(p.total)}</span>${p.chips != null ? `<span class="badge">● ${p.chips}</span>` : ''}${outcome(p)}</div></div>` +
      `<div class="bcards">${cards(p.cards, p.hidden)}</div></div>`;

    const bank = seat({ ...v.bank, state: v.bank.bust ? 'bust' : '', delta: 0, chips: null }, t('sm.bank'), -1, v.phase === 'bank' ? ' active' : '');
    let opps = '';
    for (let i = 1; i < g.n; i++) opps += seat(v.players[i], N[i], i);

    const me = v.players[0];
    const hand = t('sm.round', { n: v.round, of: v.rounds });
    const status = v.phase === 'show' ? hand : myTurn ? `${hand} · ${t('sm.turn')}`
      : v.phase === 'bank' ? t('play.turnOf', { name: t('sm.bank') }) : v.current > 0 ? t('play.turnOf', { name: N[v.current] }) : '';
    const b = (act, key, cls = '') => `<button type="button" class="btn ${cls}${hint === act ? ' hinted' : ''}" data-do="${act}"${myTurn ? '' : ' disabled'}>${t(key)}</button>`;
    const bar = v.phase === 'show'
      ? `<button type="button" class="btn primary big" data-do="next">${t(v.round >= v.rounds ? 'sm.final' : 'sm.next')}</button>`
      : b('hit', 'sm.hit', 'primary') + b('stand', 'sm.stand') +
        `<button type="button" class="icon hint" data-do="hint" title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button>`;

    root.innerHTML = `<div class="table bank"><div class="felt"><div class="bank-top">${bank}</div><div class="bank-opps">${opps}</div></div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${status}</div>` +
      `<div class="me${myTurn ? ' active' : ''}"><div class="me-info"><div class="badges"><span class="badge strong big">${frac(me.total)}</span><span class="badge">● ${me.chips}</span>${outcome(me)}</div>` +
      `</div><div class="hand bhand">${cards(me.cards, false)}</div></div>` +
      `<div class="rum-bar center">${bar}</div></div>`;
  }

  async function finish() {
    const r = g.result(), N = names();
    record(def.id, r);
    sfx(r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'take');
    const body = '<ul class="final">' + r.scores.map((sc, k) => `<li class="${k === 0 ? 'mine' : ''}"><span>${N[k]}</span><b>● ${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({ title: t('end.' + r.outcome), body, actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }] });
    if (!alive) return;
    if (val === 'again') { g = ENGINES[def.engine](def, opts); run(); } else onExit();
  }

  // bots and the bank play by themselves; the loop stops whenever the human has to act
  async function run() {
    if (busy) return;
    busy = true;
    const game = g;
    while (alive && g === game) {
      if (g.phase === 'over') { busy = false; render(); finish(); return; }
      if (g.phase === 'show' || (g.phase === 'play' && g.current === 0)) break;
      render();
      await sleep(750);
      if (!alive || g !== game) break;
      if (g.phase === 'bank') g.bankStep(); else g.botStep();
      sfx('card');
      if (g.phase === 'show') sfx(g.view().players[0].delta > 0 ? 'take' : 'card');
    }
    busy = false;
    render();
  }

  root.addEventListener('click', e => {
    const d = e.target.closest('[data-do]');
    if (!d || busy) return;
    const what = d.dataset.do;
    if (what === 'next' && g.phase === 'show') { g.nextRound(); hint = null; run(); return; }
    if (!mine()) return;
    if (what === 'hint') { hint = g.hint(); render(); return; }
    hint = null; sfx('card');
    if (what === 'hit') g.hit(); else if (what === 'stand') g.stand();
    run();
  }, { signal: ctl.signal });

  g = ENGINES[def.engine](def, opts);
  run();

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
