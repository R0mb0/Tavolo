// The shared game table: renders any engine's view and drives the turn loop (human + bots).
import { cardHTML, cardLabel } from './cards.js';
import { newGame as createGame, clearSession } from './session.js';
import { t } from './i18n.js';
import { dialog } from './ui.js';
import { record, settings, calm } from './store.js';
import { sfx } from './sfx.js';
import { createLog } from './log.js';

const sleep = ms => new Promise(r => setTimeout(r, ms * settings.speed));
const MOVING = '.center [data-id], .staged [data-id], .hand [data-id]';

export function startTable(root, def, opts, onExit, resume) {
  const ctl = new AbortController();
  let alive = true, g, msg = null, pick = null, chooser = null;
  let freshSeat = null, flyTo = null, hintId = null, last = null, seenRound = 0;
  const log = createLog();
  // Two people on one device: the second one sits in seat 1. `me` is the seat the table is drawn for,
  // `ready` says that this person has taken the device (their cards stay face down until then).
  const humans = opts.humans === 2 ? 2 : 1, isHuman = i => i < humans;
  let me = 0, ready = humans === 1;

  const names = () => Array.from({ length: opts.players }, (_, i) => (humans === 2
    ? (i < 2 ? t('pass.player', { n: i + 1 }) : t('play.bot', { n: i - 1 }))
    : i === 0 ? t('play.you') : t('play.bot', { n: i }) + (g.teams && i === 2 ? ` (${t('play.partner')})` : '')));
  const teamNames = () => {
    const N = names();
    if (g.teamList) return g.teamList().map(m => m.map(i => N[i]).join(' + '));
    return g.teams ? [`${N[0]} + ${N[2]}`, `${N[1]} + ${N[3]}`] : N;
  };
  const label = c => cardLabel(c, t);
  const suitIcon = s => `<svg class="si s-${s}" aria-hidden="true"><use href="#s-${s}"/></svg>`;

  function eventText() {
    const e = g.lastEvent, N = names();
    if (!e) return null;
    if (e.type === 'takes') return t('play.takes', { name: N[e.p], pts: e.pts });
    if (e.type === 'sweep') return t('play.sweep', { name: N[e.p] });
    if (e.type === 'capture') return t('play.captures', { name: N[e.p], n: e.n });
    if (e.type === 'steal') return t('play.steals', { name: N[e.p], target: teamNames()[e.target] });
    if (e.type === 'burn') return t('play.burn', { name: N[e.p] });
    if (e.type === 'pickup') return t('play.pickup', { name: N[e.p] });
    if (e.type === 'pass') return t('play.passes', { name: N[e.p] });
    if (e.type === 'bid') return t('play.bid', { name: N[e.p], rank: [1, 8, 9, 10].includes(e.rank) ? t('rank.' + e.rank) : e.rank });
    if (e.type === 'bidPts') return t('play.bidPts', { name: N[e.p], pts: e.pts });
    if (e.type === 'call') return t('play.calls', { name: N[e.p], card: label(e.card) }) + (g.view().need > 61 ? ' · ' + t('play.needPts', { pts: g.view().need }) : '');
    if (e.type === 'partner') return t('play.partnerIs', { name: N[e.p] });
    if (e.type === 'mmDraw') return t('play.mmDraw', { name: N[e.p], n: e.n });
    if (e.type === 'mmSeven') return t('play.mmSeven', { name: N[e.p], n: e.n });
    if (e.type === 'mmSkip') return t('play.mmSkip', { name: N[e.p] });
    if (e.type === 'mmWish') return t('play.mmWish', { name: N[e.p], suit: t('suit.' + e.suit) });
    return null;
  }

  function render() {
    if (!alive) return;
    const prev = new Map();
    if (!calm()) root.querySelectorAll(MOVING).forEach(el => prev.set(el.dataset.id, { r: el.getBoundingClientRect(), html: el.outerHTML }));

    const v = g.view(), N = names(), st = v.staged;
    const playing = g.phase === 'play' && !g.pending;
    const myTurn = playing && g.current === me && ready;
    const secret = humans === 2 && !myTurn;              // nobody else may see this hand
    const legal = myTurn && g.legal ? new Set(g.legal().map(c => c.id)) : null;
    const usable = id => myTurn && (!legal || legal.has(id));
    const badges = p =>
      (v.showPile ? `<span class="badge" title="${t('play.pile')}"><svg class="ic" aria-hidden="true"><use href="#i-pile"/></svg>${p.pile}</span>` : '') +
      (v.showScore ? `<span class="badge strong">${p.score} ${t('play.pts')}</span>` : '') +
      (p.sweeps ? `<span class="badge gold" title="${t('score.sweeps')}">✦ ${p.sweeps}</span>` : '');
    const top = p => (p.pileTop ? `<div class="piletop">${cardHTML(p.pileTop, { label: label(p.pileTop) })}</div>` : '');
    // Danish: a player's table cards (face up on face down)
    const tcards = p => (p.up ? `<div class="tcards" title="${t('play.tableCards')}">${p.up.map(c => cardHTML(c, { label: label(c) })).join('')}${p.down ? `<span class="downs"><i class="mini"></i>${p.down}</span>` : ''}</div>` : '');

    let opps = '';
    for (let k = 1; k < g.n; k++) {
      const i = (me + k) % g.n, p = v.players[i];
      const cls = (playing && g.current === i ? ' active' : '') + (st && st.steal != null && st.steal === g.teamOf(i) ? ' robbed' : '');
      opps += `<div class="opp${cls}" data-seat="${i}"><div class="opp-main"><div class="opp-name"><span class="avatar">${humans === 2 ? (isHuman(i) ? i + 1 : 'B') : i}</span>${N[i]}</div>` +
        `<div class="opp-hand">${p.handCount > 12 ? `<i class="mini"></i><span class="badge">× ${p.handCount}</span>` : '<i class="mini"></i>'.repeat(p.handCount)}</div>` +
        `<div class="badges">${badges(p)}</div>${tcards(p)}</div>${top(p)}</div>`;
    }

    const center = v.center.map(x =>
      `<div class="slot${x.hl ? ' hl' : ''}">${cardHTML(x.card, { label: label(x.card) })}` +
      (x.p != null ? `<span class="owner">${N[x.p]}</span>` : '') + '</div>').join('') +
      (v.pileCount > v.center.length ? `<span class="badge more">+${v.pileCount - v.center.length}</span>` : '');
    const staged = st ? `<div class="slot staged${st.sweep ? ' sweep' : ''}">${cardHTML(st.card, { label: label(st.card) })}<span class="owner">${N[st.p]}</span></div>` : '';

    const side = `<div class="side">` +
      (v.deckCount ? `<div class="stack">${cardHTML(null)}<span class="count">${v.deckCount}</span></div>` : '') +
      (v.trumpCard ? `<div class="trump">${cardHTML(v.trumpCard, { label: label(v.trumpCard) })}<span class="owner">${t('play.trump')}</span></div>`
        : v.trumpSuit ? `<div class="trump-suit" title="${t('play.trump')}">${suitIcon(v.trumpSuit)}<span class="owner">${t(v.trumpLabel || 'play.trump')}</span></div>` : '') +
      '</div>';

    const mine = v.players[me];
    const btn = (c, on) => cardHTML(c, { tag: 'button', label: label(c), disabled: !on, cls: (c.id === hintId ? 'hinted' : '') + (c.id === v.picked ? ' sel' : '') });
    const hand = secret ? mine.hand.map(() => cardHTML(null)).join('') : mine.hand.map(c => btn(c, usable(c.id))).join('');
    const myTable = mine.up ? `<div class="tcards mine" title="${t('play.tableCards')}">` +
      mine.up.map(c => btn(c, (v.source === 'up' || v.swap) && usable(c.id))).join('') +
      Array.from({ length: mine.down }, (_, k) => cardHTML(null, {
        tag: 'button', label: t('play.faceDown'), disabled: !(v.source === 'down' && myTurn), cls: hintId === 'down-' + k ? 'hinted' : '', attrs: ` data-id="down-${k}"`
      })).join('') + '</div>' : '';
    const lastBtn = g.kind === 'trick' || g.kind === 'fishing'
      ? `<button type="button" class="icon hint" data-last title="${t('play.last')}" aria-label="${t('play.last')}"${last ? '' : ' disabled'}><svg><use href="#i-last"/></svg></button>` : '';
    const hintBtn = `<button type="button" class="icon hint" data-hint title="${t('nav.hint')}" aria-label="${t('nav.hint')}"${myTurn ? '' : ' disabled'}><svg><use href="#i-hint"/></svg></button>`;
    const actions = (myTurn || g.swap ? v.actions || [] : []).map(a => `<button type="button" class="btn primary${hintId === a ? ' hinted' : ''}" data-move="${a}">${t('play.' + a + 'Btn')}</button>`).join('');

    let overlay = '';
    if (chooser) {
      const byId = Object.fromEntries(v.center.map(x => [x.card.id, x.card]));
      overlay = `<div class="chooser"><div class="chooser-box"><h3>${t(g.kind === 'shedding' ? 'play.howMany' : 'play.choose')}</h3>` +
        chooser.opts.map((o, k) => `<button type="button" class="opt" data-opt="${k}">` +
          (o.cards ? o.cards.map(c => cardHTML(c, { label: label(c) })).join('')
            : o.steal != null ? `<span>${t('play.stealFrom', { name: teamNames()[o.steal] })}</span>`
            : o.take.map(id => cardHTML(byId[id], { label: label(byId[id]) })).join('')) + '</button>').join('') +
        `<button type="button" class="btn" data-opt="x">${t('common.cancel')}</button></div></div>`;
    }

    if (!chooser && myTurn && v.ask) {                   // a question from the engine (auction, choice of suit)
      overlay = `<div class="chooser"><div class="chooser-box"><h3>${t(v.ask.title)}</h3><div class="asks">` +
        v.ask.options.map(o => `<button type="button" class="opt${hintId === 'c:' + o.id ? ' hinted' : ''}" data-choice="${o.id}">` +
          (o.card ? cardHTML(o.card, { label: label(o.card) }) : o.suit ? `${suitIcon(o.suit)}<span>${t('suit.' + o.suit)}</span>` : `<span>${o.label || t(o.text)}</span>`) + '</button>').join('') +
        '</div></div></div>';
    }

    const status = msg ? msg() : myTurn ? (humans === 2 ? t('play.turnOf', { name: N[me] }) : t(opts.coach ? 'learn.coach' : 'play.yourTurn')) : playing ? t('play.turnOf', { name: N[g.current] }) : '';
    const size = mine.hand.length > 10 ? ' many huge' : mine.hand.length > 5 ? ' many' : '';
    root.innerHTML =
      `<div class="table"><div class="opps n${g.n - 1}">${opps}</div>` +
      `<div class="felt">${side}<div class="mid"><div class="center">${center}</div>${staged}</div></div>` +
      `<div class="status${myTurn ? ' mine' : ''}" role="status" aria-live="polite">${v.note && !msg ? `<span class="note">${t(v.note)}</span>` : ''}${actions ? (msg || myTurn ? `<span class="note">${status}</span>` : '') + actions : status}</div>` +
      `<div class="me${myTurn ? ' active' : ''}" data-seat="${me}"><div class="me-info"><div class="badges">${humans === 2 ? `<span class="badge strong">${N[me]}</span>` : ''}${badges(mine)}</div>${top(mine)}${myTable}<div class="tools">${hintBtn}${lastBtn}${log.button()}</div></div>` +
      `<div class="hand${size}">${hand}</div></div>${overlay}</div>`;
    animate(prev);
  }

  // Moves cards from where they were to where they are now; captured cards fly to their new owner.
  function animate(prev) {
    const seat = freshSeat, dest = flyTo;
    freshSeat = null; flyTo = null;
    if (calm()) return;
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
      gh.className = 'fly';
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
    if (e.target.closest('[data-log]')) { log.show(); return; }
    if (e.target.closest('[data-last]') && last) {
      const N = names();
      dialog({
        title: t('play.last'),
        body: `<p>${t('play.lastBy', { name: N[last.by] })}</p><div class="man-ex lastcards">` +
          last.cards.map(x => `<div class="slot${x.p === last.by ? ' hl' : ''}">${cardHTML(x.card, { label: label(x.card) })}<span class="owner">${x.p != null ? N[x.p] : '·'}</span></div>`).join('') + '</div>',
        actions: [{ label: t('set.close'), val: 1, primary: true }]
      });
      return;
    }
    if (!pick || chooser) return;
    if (e.target.closest('[data-hint]')) {
      const h = g.hint();
      showHint(h);
      render(); return;
    }
    const ch = e.target.closest('[data-choice]');
    if (ch) { const res = pick; pick = null; res({ id: null, opt: { choice: ch.dataset.choice } }); return; }
    const mv = e.target.closest('[data-move]');
    if (mv) { const res = pick; pick = null; res({ id: null, opt: { [mv.dataset.move]: true } }); return; }
    const card = e.target.closest('.me button.card');
    if (card && !card.disabled) {
      const id = card.dataset.id, os = g.options ? g.options(id) : [];
      if (os.length > 1) { chooser = { id, opts: os }; render(); return; }
      const res = pick; pick = null;
      res({ id, opt: os[0] });
    }
  }, { signal: ctl.signal });

  const humanMove = () => new Promise(res => { pick = res; });
  const showHint = h => {
    const o = h.opt || {};
    hintId = h.id || (o.pickup ? 'pickup' : o.draw ? 'draw' : o.ready ? 'ready' : o.choice != null ? 'c:' + o.choice : null);
  };

  async function showSummary() {
    const s = g.summary, TN = s.players ? names() : teamNames(), sign = v => (v > 0 ? '+' + v : v);
    const rows = s.rows.map(r => `<tr><th>${t('score.' + r.key)}</th>` +
      r.vals.map((v, k) => `<td class="${r.winner === k || (r.winner === -2 && v > 0) ? 'won' : ''}">${r.text ? t(v) : v}</td>`).join('') + '</tr>').join('');
    let body = `<table class="sum"><thead><tr><th></th>${TN.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}` +
      `<tr class="tot"><th>${t('round.points')}</th>${s.roundPts.map(v => `<td class="${s.players && v > 0 ? 'won' : ''}">${sign(v)}</td>`).join('')}</tr>` +
      `<tr class="tot big"><th>${t('round.total')}</th>${s.totals.map(v => `<td>${v}</td>`).join('')}</tr></tbody></table>`;
    if (s.players) {                       // one line per player: easier to read with five of them
      const role = s.rows.find(r => r.key === 'role'), tr = s.rows.find(r => r.key === 'tricks');
      body = `<table class="sum byp"><thead><tr><th></th><th>${t('score.cards')}</th><th>${t('round.points')}</th><th>${t('round.total')}</th></tr></thead><tbody>` +
        TN.map((x, k) => `<tr class="${k === 0 ? 'me-row' : ''}"><th>${x}<small>${t(role.vals[k])}</small></th><td>${tr.vals[k]}</td>` +
          `<td class="${s.roundPts[k] > 0 ? 'won' : ''}">${sign(s.roundPts[k])}</td><td><b>${sign(s.totals[k])}</b></td></tr>`).join('') + '</tbody></table>' +
        (s.need > 61 ? `<p class="note">${t('play.needPts', { pts: s.need })}</p>` : '');
    }
    await dialog({ title: t('round.title', { n: s.round }), body, actions: [{ label: t('round.continue'), val: 1, primary: true }] });
    s.shown = true;
  }

  async function finish() {
    const r = g.result(), TN = r.players ? names() : teamNames();
    if (!opts.coach && humans === 1) record(def.id, r, opts);
    clearSession();
    // with two people there is no "you": the title names the winner
    const best = (r.lowWins ? Math.min : Math.max)(...r.scores), lead = r.scores.filter(x => x === best).length === 1 ? r.scores.indexOf(best) : -1;
    const title = humans === 2 ? (lead < 0 ? t('end.tie') : t('pass.wins', { name: TN[lead] })) : t('end.' + r.outcome);
    sfx(humans === 2 || r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'take');
    const note = g.kind === 'shedding' ? `<p>${t('end.cardsLeft')}</p>` : '';
    const body = note + '<ul class="final">' + r.scores.map((sc, k) =>
      `<li class="${humans === 2 ? (k === lead ? 'mine' : '') : k === (r.players ? 0 : g.teamOf(0)) ? 'mine' : ''}"><span>${TN[k]}</span><b>${sc}</b></li>`).join('') + '</ul>';
    const val = await dialog({
      title, body,
      actions: [{ label: t('end.again'), val: 'again', primary: true }, { label: t('end.home'), val: 'home' }]
    });
    if (!alive) return;
    if (val === 'again') { newGame(); loop(); } else onExit();
  }

  function newGame() {
    g = createGame(def, opts, resume); resume = null;
    msg = null; pick = null; chooser = null; freshSeat = null; flyTo = null; hintId = null; last = null; seenRound = 0; log.clear();
    me = 0; ready = humans === 1;
  }

  async function loop() {
    const mine = g;
    // the device changes hands: cards stay face down until the next person says they are ready
    const handOver = async seat => {
      me = seat; ready = false; hintId = null; render();
      await dialog({ title: t('pass.title', { name: names()[seat] }), body: `<p>${t('pass.text')}</p>`, actions: [{ label: t('pass.ready'), val: 1, primary: true }] });
      ready = true;
    };
    while (alive && g === mine) {
      if (g.round && g.round !== seenRound && g.phase === 'play') { seenRound = g.round; log.head(t('round.title', { n: g.round })); }
      // practice game: the suggested move is always shown
      if (opts.coach && hintId == null && g.phase === 'play' && !g.pending && g.current === 0 && !g.announce) showHint(g.hint());
      render();
      if (g.announce) {                      // e.g. Tressette declarations at the start of a deal
        const a = g.announce; g.announce = null;
        msg = () => t('play.declare', { list: a.list.map(x => `${names()[x.p]} +${x.pts}`).join(' · ') });
        log.add(msg()); render(); await sleep(2600);
        if (!alive || g !== mine) return;
        msg = null; continue;
      }
      if ((g.phase === 'roundEnd' || g.phase === 'over') && g.summary && !g.summary.shown) { await showSummary(); continue; }
      if (g.phase === 'over') { finish(); return; }
      if (g.phase === 'roundEnd') { g.nextRound(); msg = null; continue; }
      if (g.swap) {                          // Danish: exchange of cards before the first turn
        const mv = await humanMove();
        if (!alive || g !== mine) return;
        hintId = null; g.play(mv.id, mv.opt); sfx('card'); continue;
      }
      if (g.pending) {
        await sleep(g.lastEvent ? 1300 : 800);
        if (!alive || g !== mine) return;
        const st = g.staged;
        flyTo = g.flyTarget ? g.flyTarget() : g.kind === 'trick' ? g.winner : st && (st.take.length || st.steal != null) ? st.p : null;
        if (flyTo != null) {
          sfx('take');
          const vw = g.view();                             // remember what was just taken, for the review button
          if (g.kind === 'trick') last = { by: flyTo, cards: vw.center.map(x => ({ card: x.card, p: x.p })) };
          else if (st) last = { by: flyTo, cards: [{ card: st.card, p: st.p }, ...vw.center.filter(x => x.hl).map(x => ({ card: x.card, p: null }))] };
        }
        g.advance(); msg = null; continue;
      }
      let mv;
      if (isHuman(g.current)) {
        if (humans === 2 && (me !== g.current || !ready)) { await handOver(g.current); if (!alive || g !== mine) return; render(); }
        mv = await humanMove();
      } else { await sleep(700); if (!alive || g !== mine) return; mv = g.botMove(); }
      if (!alive || g !== mine) return;
      freshSeat = g.current; hintId = null;
      const cur = g.current, pv = g.view().players[cur], ids = (mv.opt && mv.opt.ids) || (mv.id ? [mv.id] : []);
      const played = [...pv.hand, ...(pv.up || [])].filter(c => ids.includes(c.id));
      g.play(mv.id, mv.opt);
      if (!played.length && String(mv.id).startsWith('down-')) played.push(...g.view().center.slice(-1).map(x => x.card));
      if (played.length) log.add(`<b>${names()[cur]}</b> ${played.map(label).join(', ')}`);
      if (g.lastEvent && eventText()) log.add(eventText());
      sfx(g.lastEvent && (g.lastEvent.type === 'sweep' || g.lastEvent.type === 'burn') ? 'sweep' : 'card');
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
      if (ok && alive) { clearSession(); onExit(); }
    }
  };
}
