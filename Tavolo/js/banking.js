// Table for banking games (Sette e mezzo): the bank at the top, each player's cards face up, hit or stand.
import { cardHTML } from './cards.js';
import { newGame as createGame, clearSession, setExtra } from './session.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings } from './store.js';
import { sfx } from './sfx.js';
import { createLog } from './log.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const frac = v => (v == null ? '?' : (Math.floor(v) || (v % 1 ? '' : 0)) + (v % 1 ? '½' : ''));

export function startBanking(root, def, opts, onExit, resume) {
  const ctl = new AbortController();
  let alive = true, busy = false, g, hint = null;
  const log = createLog(resume && resume.extra && resume.extra.log, items => setExtra({ log: items }));

  // Several people on one device: they take the first seats. `me` is the seat the table is drawn for,
  // `ready` says that this person has taken the device (their cards stay face down until then).
  const humans = Math.min(Math.max(opts.humans | 0, 1), opts.players), isHuman = i => i < humans;
  let me = 0, ready = humans === 1;
  const names = () => Array.from({ length: opts.players }, (_, i) => (humans > 1
    ? (i < humans ? t('pass.player', { n: i + 1 }) : t('play.bot', { n: i - humans + 1 }))
    : i === 0 ? t('play.you') : t('play.bot', { n: i })));
  const who = () => (humans > 1 ? names()[me] : t('play.you'));
  const avatar = i => (humans > 1 ? (isHuman(i) ? i + 1 : 'B') : i);
  // the device changes hands: cards stay face down until the next person is ready
  const handOver = async seat => {
    me = seat; ready = false; hint = null; render();
    await dialog({ title: t('pass.title', { name: names()[seat] }), body: `<p>${t('pass.text')}</p>`, actions: [{ label: t('pass.ready'), val: 1, primary: true }] });
    ready = true;
  };
  // with several people there is no "you": the title of the final dialog names the winner
  const verdict = (r, N) => {
    const best = (r.lowWins ? Math.min : Math.max)(...r.scores), lead = r.scores.filter(x => x === best).length === 1 ? r.scores.indexOf(best) : -1;
    return { lead, title: humans > 1 ? (lead < 0 ? t('end.tie') : t('pass.wins', { name: N[lead] })) : t('end.' + r.outcome) };
  };
  const label = c => `${[1, 8, 9, 10].includes(c.r) ? t('rank.' + c.r) : c.r} · ${t('suit.' + c.s)}`;
  const mine = () => (g.phase === 'play' || g.phase === 'bank') && g.current === me && ready && !busy;
  let seenRound = 0;
  // one line in the log for what just happened
  function note() {
    const e = g.lastEvent, N = names();
    if (g.round !== seenRound) { seenRound = g.round; log.head(`${t('sm.round', { n: g.round, of: g.rounds })} · ${t('sm.bank')}: ${N[g.banker]}`); }
    if (e) log.add(t(e.type === 'bet' ? 'sm.eBet' : e.type === 'hit' ? 'sm.eHit' : e.type === 'stand' ? 'sm.eStand' : 'sm.eBust', { name: N[e.p], n: e.k }));
    if (g.phase === 'show') log.add(g.view().players.map((p, i) => `${N[i]} ${p.delta > 0 ? '+' : ''}${p.delta}`).join(' · '));
  }

  function render() {
    if (!alive) return;
    if (opts.coach && mine() && !hint) hint = g.hint();      // practice game: the suggested move is always shown
    const myTurn = mine(), N = names();
    const v = g.view(humans > 1 && !myTurn ? -1 : me);   // with several people a face-down card is shown only to its owner, during their turn
    const cards = (cs, hidden) => cs.map((c, k) => (hidden && k === 0 ? cardHTML(null) : cardHTML(c, { label: label(c) }))).join('');
    const outcome = p => (p.delta ? `<span class="badge ${p.delta > 0 ? 'gold' : 'lost'}">${p.delta > 0 ? '+' : ''}${p.delta}</span>` : p.state === 'bust' ? `<span class="badge lost">${t('sm.bust')}</span>` : '');
    const bk = p => (p.banker ? `<span class="badge gold">${t('sm.bank')}</span>` : p.bet ? `<span class="badge" title="${t('sm.stake')}">${t('sm.stake')} ${p.bet}</span>` : '');
    const seat = (p, i) =>
      `<div class="opp bseat${v.current === i ? ' active' : ''}"><div class="opp-main"><div class="opp-name"><span class="avatar">${avatar(i)}</span>${N[i]}</div>` +
      `<div class="badges">${bk(p)}<span class="badge strong">${frac(p.total)}</span><span class="badge">● ${p.chips}</span>${outcome(p)}</div></div>` +
      `<div class="bcards">${cards(p.cards, p.hidden)}</div></div>`;

    const bank = v.banker !== me ? seat(v.players[v.banker], v.banker) : '';
    let opps = '';
    for (let k = 1; k < g.n; k++) { const i = (me + k) % g.n; if (i !== v.banker) opps += seat(v.players[i], i); }

    const own = v.players[me];
    const hand = t('sm.round', { n: v.round, of: v.rounds });
    const status = v.phase === 'show' ? hand : myTurn ? `${hand} · ${t(v.needBet ? 'sm.betTurn' : v.banker === me ? 'sm.bankTurn' : 'sm.turn')}`
      : v.current >= 0 ? t('play.turnOf', { name: N[v.current] }) : '';
    const b = (act, key, cls = '') => `<button type="button" class="btn ${cls}${hint === act ? ' hinted' : ''}" data-do="${act}"${myTurn ? '' : ' disabled'}>${t(key)}</button>`;
    const bar = v.phase === 'show'
      ? `<button type="button" class="btn primary big" data-do="next">${t(v.round >= v.rounds ? 'sm.final' : 'sm.next')}</button>`
      : (v.needBet && myTurn ? Array.from({ length: v.maxBet }, (_, k) => `<button type="button" class="btn${k ? '' : ' primary'}${hint === 'bet' + (k + 1) ? ' hinted' : ''}" data-do="bet" data-k="${k + 1}">${t('sm.stake')} ${k + 1}</button>`).join('')
        : b('hit', 'sm.hit', 'primary') + b('stand', 'sm.stand')) +
        `<button type="button" class="icon hint" data-do="hint" title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button>`;
    const bar2 = bar + log.button();

    root.innerHTML = `<div class="table bank"><div class="felt">${bank ? `<div class="bank-top">${bank}</div>` : ''}${opps ? `<div class="bank-opps">${opps}</div>` : ''}</div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${status}</div>` +
      `<div class="me${myTurn ? ' active' : ''}"><div class="me-info"><div class="badges">${humans > 1 ? `<span class="badge strong">${N[me]}</span>` : ''}${bk(own)}<span class="badge strong big">${frac(own.total)}</span><span class="badge">● ${own.chips}</span>${outcome(own)}</div>` +
      `</div><div class="hand bhand">${cards(own.cards, own.hidden)}</div></div>` +
      `<div class="rum-bar center">${bar2}</div></div>`;
  }

  async function finish() {
    const r = g.result(), N = names();
    if (!opts.coach && humans === 1) record(def.id, r, opts);
    clearSession();
    const { lead, title } = verdict(r, N);
    sfx(humans > 1 || r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'take');
    const body = '<ul class="final">' + r.scores.map((sc, k) => `<li class="${(humans > 1 ? k === lead : k === 0) ? 'mine' : ''}"><span>${N[k]}</span><b>● ${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({ title, body, actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }] });
    if (!alive) return;
    if (val === 'again') { g = createGame(def, opts); log.clear(); seenRound = 0; me = 0; ready = humans === 1; run(); } else onExit();
  }

  // bots and the bank play by themselves; the loop stops whenever the human has to act
  async function run() {
    if (busy) return;
    busy = true;
    const game = g;
    while (alive && g === game) {
      if (g.phase === 'over') { busy = false; render(); finish(); return; }
      if (g.phase === 'show') break;
      if (isHuman(g.current)) {
        if (humans > 1 && (me !== g.current || !ready)) await handOver(g.current);
        break;
      }
      render();
      await sleep(750);
      if (!alive || g !== game) break;
      if (g.phase === 'bank') g.bankStep(); else g.botStep();
      sfx('card'); note();
      if (g.phase === 'show') sfx(g.view().players[me].delta > 0 ? 'take' : 'card');
    }
    busy = false;
    render();
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-log]')) { log.show(); return; }
    const d = e.target.closest('[data-do]');
    if (!d || busy) return;
    const what = d.dataset.do;
    if (what === 'next' && g.phase === 'show') { g.nextRound(); hint = null; run(); return; }
    if (!mine()) return;
    if (what === 'hint') { hint = g.hint(); render(); return; }
    hint = null; sfx('card');
    if (what === 'bet') g.bet(+d.dataset.k); else if (what === 'hit') g.hit(); else if (what === 'stand') g.stand();
    note(); run();
  }, { signal: ctl.signal });

  g = createGame(def, opts, resume);
  if (log.restored) seenRound = g.round; else note();
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
