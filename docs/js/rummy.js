// Table for rummy games (Scala 40, Burraco): deck and discard pile, combinations on the table, a large hand with selection.
import { cardHTML } from './cards.js';
import { newGame as createGame, clearSession, setExtra } from './session.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';
import { createLog } from './log.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds', 'joker'];

export function startRummy(root, def, opts, onExit, resume) {
  const ctl = new AbortController();
  let alive = true, busy = false, g, msg = null, hint = null, bySuit = true;
  const sel = new Set(), log = createLog(resume && resume.extra && resume.extra.log, items => setExtra({ log: items }));
  let seenRound = 0;
  // Two people on one device: the second one sits in seat 1. `me` is the seat the table is drawn for,
  // `ready` says that this person has taken the device (their cards stay face down until then).
  const humans = opts.humans === 2 ? 2 : 1, isHuman = i => i < humans;
  let me = 0, ready = humans === 1;

  const names = () => Array.from({ length: opts.players }, (_, i) => (humans === 2
    ? (i < 2 ? t('pass.player', { n: i + 1 }) : t('play.bot', { n: i - 1 }))
    : i === 0 ? t('play.you') : t('play.bot', { n: i }) + (g.teams && i === 2 ? ` (${t('play.partner')})` : '')));
  const who = () => (humans === 2 ? names()[me] : t('play.you'));
  const you = (key, vars) => log.add(t(key, { name: who(), ...vars }));
  const teamNames = () => { const N = names(); return g.teams ? [`${N[0]} + ${N[2]}`, `${N[1]} + ${N[3]}`] : N; };
  const potBadge = p => (p.pot ? `<span class="badge gold">✓ ${t('bur.pot')}</span>` : '');
  const label = c => (c.r === 0 ? t('rum.joker') : `${[1, 11, 12, 13].includes(c.r) ? t('frank.' + c.r) : c.r} · ${t('suit.' + c.s)}`);
  const mine = () => g.phase === 'play' && g.current === me && ready && !busy;
  const say = (key, vars) => { msg = () => t(key, vars); };

  function render() {
    if (!alive) return;
    if (opts.coach && mine() && !hint) hint = g.hint();      // practice game: the suggested move is always shown
    const v = g.view(), N = names(), own = v.players[me], myTurn = mine(), B = g.kind === 'burraco', myTeam = g.teamOf(me);
    const secret = humans === 2 && !(g.phase === 'play' && g.current === me && ready);   // nobody else may see this hand
    const canPlay = myTurn && v.step === 'play';

    let opps = '';
    for (let k = 1; k < g.n; k++) {
      const i = (me + k) % g.n, p = v.players[i];
      opps += `<div class="opp${g.phase === 'play' && g.current === i ? ' active' : ''}${p.out ? ' gone' : ''}"><div class="opp-main">` +
        `<div class="opp-name"><span class="avatar">${humans === 2 ? (isHuman(i) ? i + 1 : 'B') : i}</span>${N[i]}</div>` +
        `<div class="opp-hand"><i class="mini"></i><span class="badge">× ${p.handCount}</span></div>` +
        `<div class="badges"><span class="badge strong">${p.total} ${t('play.pts')}</span>${p.out ? `<span class="badge lost">${t('rum.gone')}</span>` : p.opened ? `<span class="badge gold">✓ ${t('rum.opened')}</span>` : ''}${potBadge(p)}</div></div></div>`;
    }

    const hl = k => (hint && hint.pile === k ? ' hinted' : '');
    const piles = `<div class="side"><button type="button" class="pile-btn${hl('stock')}" data-do="stock" aria-label="${t('play.deck')}"${myTurn && v.step === 'draw' ? '' : ' disabled'}>` +
      `<span class="stack">${cardHTML(null)}<span class="count">${v.stock}</span></span></button>` +
      `<button type="button" class="pile-btn${hl('discard')}" data-do="pile" aria-label="${t('rum.pile')}"${myTurn ? '' : ' disabled'}>` +
      (v.top ? cardHTML(v.top, { label: label(v.top) }) : '<span class="pile empty"></span>') +
      `<span class="owner">${t('rum.pile')}${v.pileCount > 1 ? ' × ' + v.pileCount : ''}</span></button></div>`;

    const meldBtn = (m, i) =>
      `<button type="button" class="meld${m.prov ? ' prov' : ''}${hint && hint.meld === i ? ' hinted' : ''}${m.cards.length >= 7 && B ? ' burraco' : ''}" data-meld="${i}"${canPlay && (!B || m.team === myTeam) ? '' : ' disabled'}>` +
      m.cards.map(c => cardHTML(c, { label: label(c) })).join('') + '</button>';
    const melds = !B ? v.melds.map(meldBtn).join('') : [myTeam, 1 - myTeam].map(tm =>
      `<div class="mgroup"><span class="mlabel">${teamNames()[tm]}</span>${v.melds.map((m, i) => (m.team === tm ? meldBtn(m, i) : '')).join('')}</div>`).join('');

    const order = c => (bySuit ? SUITS.indexOf(c.s) * 20 + c.r : (c.r || 99) * 10 + SUITS.indexOf(c.s));
    const hand = secret ? own.hand.map(() => cardHTML(null)).join('') : own.hand.slice().sort((a, b) => order(a) - order(b)).map(c => cardHTML(c, {
      tag: 'button', label: label(c), disabled: !canPlay,
      cls: (sel.has(c.id) ? 'sel ' : '') + (hint && hint.ids && hint.ids.includes(c.id) ? 'hinted' : '')
    })).join('');

    const status = msg ? msg() : !myTurn ? (g.phase === 'play' ? t('play.turnOf', { name: N[g.current] }) : '') : v.step === 'draw' ? t('rum.draw') : t('rum.play');
    const open = B ? potBadge(own) : own.opened ? `<span class="badge gold">✓ ${t('rum.opened')}</span>` : `<span class="badge strong">${t('rum.opening', { n: v.provSum, of: v.opening })}</span>`;
    const b = (act, key, on, cls = '') => `<button type="button" class="btn ${cls}" data-do="${act}"${on ? '' : ' disabled'}>${t(key)}</button>`;
    root.innerHTML =
      `<div class="table rum"><div class="opps n${g.n - 1}">${opps}</div>` +
      `<div class="felt">${piles}<div class="melds">${melds}</div></div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${status}</div>` +
      `<div class="rum-bar">${humans === 2 ? `<span class="badge strong">${N[me]}</span>` : ''}<span class="badge strong">${own.total} ${t('play.pts')}</span>${open}<span class="grow"></span>` +
      b('meld', 'rum.meld', canPlay && sel.size >= 3, 'primary') + b('discard', 'rum.discard', canPlay && sel.size === 1) +
      (v.hasProv && canPlay ? b('revert', 'rum.revert', true) : '') + (v.mustUse && canPlay ? b('putback', 'rum.putBack', true, hint && hint.putBack ? 'hinted' : '') : '') + b('sort', 'rum.sort', true) +
      `<button type="button" class="icon hint" data-do="hint" title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button>${log.button()}</div>` +
      `<div class="me${myTurn ? ' active' : ''}"><div class="hand many${own.hand.length > 10 ? ' huge' : ''}">${hand}</div></div></div>`;
  }

  const WHY = { invalid: 'rum.invalid', keepOne: 'rum.keepOne', needOpen: 'rum.needOpen', openFirst: 'rum.openFirst', noDiscardPick: 'rum.noPick', sameCard: 'rum.sameCard', mustOpen: 'rum.mustOpen', wildClose: 'bur.wildClose', needBurraco: 'bur.needBurraco', notYours: 'bur.notYours' };
  function done(res, sound = 'card') {
    hint = null;
    if (res.ok) { sel.clear(); msg = null; sfx(sound); if (res.pot) say('bur.takePot', { name: who() }); } else if (WHY[res.reason]) say(WHY[res.reason], { n: g.view().provSum, of: g.view().opening });
    return res.ok;
  }

  async function showSummary() {
    const s = g.summary, B = g.kind === 'burraco', N = B ? teamNames() : names();
    const title = s.winner >= 0 ? t('rum.out', { name: N[s.winner] }) : t('round.title', { n: s.round });
    const sign = v => (v > 0 ? '+' + v : v);
    const body = (B ? '' : `<p>${t('rum.lowWins')}</p>`) + `<table class="sum"><thead><tr><th></th>${N.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>` +
      (B ? s.rows.map(r => `<tr><th>${t('score.' + r.key)}</th>${r.vals.map(v => `<td class="${r.winner === -2 && v > 0 ? 'won' : ''}">${sign(v)}</td>`).join('')}</tr>`).join('') +
        `<tr class="tot"><th>${t('round.points')}</th>${s.roundPts.map(v => `<td>${sign(v)}</td>`).join('')}</tr>`
        : `<tr><th>${t('score.penalty')}</th>${s.roundPts.map((v, k) => `<td class="${k === s.winner ? 'won' : ''}">+${v}</td>`).join('')}</tr>`) +
      `<tr class="tot big"><th>${t('round.total')}</th>${s.totals.map(v => `<td>${v}</td>`).join('')}</tr></tbody></table>`;
    log.add(`${title} — ${N.map((x, k) => `${x} ${s.totals[k]}`).join(' · ')}`);
    await dialog({ title, body, actions: [{ label: t('round.continue'), val: 1, primary: true }] });
  }

  async function finish() {
    const r = g.result(), B = g.kind === 'burraco', N = B ? teamNames() : names();
    if (!opts.coach && humans === 1) record(def.id, r, opts);
    clearSession();
    // with two people there is no "you": the title names the winner
    const best = (r.lowWins ? Math.min : Math.max)(...r.scores), lead = r.scores.filter(x => x === best).length === 1 ? r.scores.indexOf(best) : -1;
    const title = humans === 2 ? (lead < 0 ? t('end.tie') : t('pass.wins', { name: N[lead] })) : t('end.' + r.outcome);
    sfx(humans === 2 || r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'take');
    const body = (B ? '' : `<p>${t('rum.lowWins')}</p>`) + '<ul class="final">' + r.scores.map((sc, k) => `<li class="${(humans === 2 ? k === lead : k === g.teamOf(0)) ? 'mine' : ''}"><span>${N[k]}</span><b>${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({ title, body, actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }] });
    if (!alive) return;
    if (val === 'again') { g = createGame(def, opts); sel.clear(); msg = null; log.clear(); seenRound = 0; me = 0; ready = humans === 1; run(); } else onExit();
  }

  // Drives everything that is not the human's own action: bot turns, end of round, end of game.
  async function run() {
    if (busy) return;
    busy = true;
    const game = g;
    while (alive && g === game) {
      if (g.round !== seenRound && g.phase === 'play') { seenRound = g.round; log.head(t('round.title', { n: g.round })); }
      if (g.phase !== 'play') {
        render(); sfx('take');
        await showSummary();
        if (!alive || g !== game) break;
        if (g.phase === 'over') { busy = false; finish(); return; }
        g.nextRound(); sel.clear(); msg = null;
        continue;
      }
      if (isHuman(g.current)) {
        if (humans === 2 && (me !== g.current || !ready)) {  // the device changes hands: cards stay face down until the next person is ready
          me = g.current; ready = false; sel.clear(); hint = null; render();
          await dialog({ title: t('pass.title', { name: names()[me] }), body: `<p>${t('pass.text')}</p>`, actions: [{ label: t('pass.ready'), val: 1, primary: true }] });
          if (!alive || g !== game) break;
          ready = true;
        }
        break;
      }
      render();
      await sleep(650);
      if (!alive || g !== game) break;
      const a = g.botStep(), name = names()[a.p];
      sfx('card');
      if (a.type === 'draw') say(a.from === 'discard' ? 'rum.bPick' : 'rum.bDraw', { name });
      else if (a.type === 'meld') say('rum.bMeld', { name });
      else if (a.type === 'layoff') say('rum.bLay', { name });
      else { msg = null; const top = g.view().top; if (a.type === 'discard' && top) log.add(t('rum.bDiscard', { name, card: label(top) })); }
      if (msg) log.add(msg());
      if (a.pot) { say('bur.takePot', { name }); log.add(msg()); }
    }
    busy = false;
    render();
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-log]')) { log.show(); return; }
    const d = e.target.closest('[data-do]');
    if (d && d.dataset.do === 'sort') { bySuit = !bySuit; render(); return; }
    if (!mine()) return;
    const v = g.view();
    if (d) {
      const what = d.dataset.do;
      if (what === 'hint') { hint = g.hint(); render(); return; }
      const one = sel.size === 1 ? v.players[me].hand.find(c => sel.has(c.id)) : null;
      const toss = () => { const ok = done(g.discard([...sel][0])); if (ok && one) you('rum.bDiscard', { card: label(one) }); };
      if (what === 'stock') { if (done(g.draw('stock'))) you('rum.bDraw'); }
      else if (what === 'pile') {
        if (v.step === 'draw') { if (done(g.draw('discard'))) you('rum.bPick'); }
        else if (sel.size === 1) { toss(); run(); return; }
        else say('rum.selectOne');
      } else if (what === 'meld') { if (done(g.meld([...sel]), 'take')) you('rum.bMeld'); }
      else if (what === 'discard') { toss(); run(); return; }
      else if (what === 'revert') { g.revert(); sel.clear(); msg = null; }
      else if (what === 'putback') { if (g.putBack().ok) { sel.clear(); msg = null; hint = null; } }
      render(); return;
    }
    const m = e.target.closest('[data-meld]');
    if (m) {
      if (!sel.size) say('rum.pickFirst'); else if (done(g.layoff(+m.dataset.meld, [...sel]), 'take')) you('rum.bLay');
      render(); return;
    }
    const c = e.target.closest('.hand button.card');
    if (c && !c.disabled) {
      const id = c.dataset.id;
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      if (!(hint && hint.ids && hint.ids.includes(id))) hint = null;   // a suggestion stays visible while you follow it
      msg = null; render();
    }
  }, { signal: ctl.signal });

  g = createGame(def, opts, resume);
  if (log.restored) seenRound = g.round;
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
      if (ok && alive) { clearSession(); onExit(); }
    }
  };
}
