// App shell: routing (deck -> game -> setup -> table), settings, statistics, PWA glue.
import { setLang, t, gt, LANGS } from './i18n.js';
import { settings, saveSettings, getStats, resetStats } from './store.js';
import { cardHTML } from './cards.js';
import { startTable } from './table.js';
import { startSolitaire } from './solitaire.js';
import { startRummy } from './rummy.js';
import { startMachiavelli } from './machiavelli.js';
import { startBanking } from './banking.js';
import { dialog, esc } from './ui.js';
import { loadSession, clearSession } from './session.js';
import { manualHTML } from './manual.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const dark = matchMedia('(prefers-color-scheme: dark)');
let catalog = null, defs = {}, active = null, installEvt = null, fresh = false;

// ---------- settings ----------
function applySettings() {
  const root = document.documentElement;
  const theme = settings.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;
  root.dataset.cb = settings.cb ? '1' : '0';
  root.style.setProperty('--zoom', settings.zoom);
  $('meta[name=theme-color]').content = theme === 'dark' ? '#0c1714' : '#1f6f4f';
}
dark.addEventListener('change', applySettings);

function chrome() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const s = t(el.dataset.i18n);
    el.setAttribute('aria-label', s); el.title = s;
  }
  $('#btn-install').hidden = !installEvt;
  $('#btn-full').hidden = !document.documentElement.requestFullscreen;
}

function openSettings() {
  const seg = (name, items, cur) => `<div class="seg" role="group">` + items.map(([v, l]) =>
    `<button type="button" data-${name}="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('') + '</div>';
  const body = () =>
    `<label class="field"><span>${t('set.language')}</span><select id="set-lang"><option value="auto">${t('set.auto')}</option>` +
    Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${settings.lang === k ? ' selected' : ''}>${v}</option>`).join('') + '</select></label>' +
    `<div class="field"><span>${t('set.theme')}</span>${seg('theme', [['auto', t('set.auto')], ['light', t('set.light')], ['dark', t('set.dark')]], settings.theme)}</div>` +
    `<div class="field"><span>${t('set.zoom')}</span>${seg('zoom', [[1, '100%'], [1.15, '115%'], [1.3, '130%'], [1.5, '150%']], settings.zoom)}</div>` +
    `<div class="field"><span>${t('set.speed')}</span>${seg('speed', [[1.6, t('speed.slow')], [1, t('speed.normal')], [0.5, t('speed.fast')]], settings.speed)}</div>` +
    `<label class="field row"><span>${t('set.colorblind')}</span><input type="checkbox" id="set-cb"${settings.cb ? ' checked' : ''}></label>` +
    `<label class="field row"><span>${t('set.sound')}</span><input type="checkbox" id="set-sound"${settings.sound ? ' checked' : ''}></label>`;
  dialog({
    title: t('nav.settings'), body: body(), actions: [{ label: t('set.close'), val: 1, primary: true }],
    onReady(d) {
      const refresh = async langChanged => {
        saveSettings(); applySettings();
        if (langChanged) await setLang(settings.lang);
        d.querySelector('h2').textContent = t('nav.settings');
        d.querySelector('.dlg-body').innerHTML = body();
        d.querySelector('[data-act]').textContent = t('set.close');
        chrome();
        if (active) active.rerender(); else render();
      };
      d.addEventListener('change', e => {
        if (e.target.id === 'set-lang') { settings.lang = e.target.value; refresh(true); }
        if (e.target.id === 'set-cb') { settings.cb = e.target.checked; refresh(); }
        if (e.target.id === 'set-sound') { settings.sound = e.target.checked; saveSettings(); }
      });
      d.addEventListener('click', e => {
        const b = e.target.closest('[data-theme],[data-zoom],[data-speed]');
        if (!b) return;
        if (b.dataset.theme) settings.theme = b.dataset.theme;
        if (b.dataset.zoom) settings.zoom = +b.dataset.zoom;
        if (b.dataset.speed) settings.speed = +b.dataset.speed;
        refresh();
      });
    }
  });
}

// ---------- screens ----------
const route = () => location.hash.replace(/^#\/?/, '').split('/');
const go = h => { location.hash = '#/' + h; };
const solo = def => def.players.options.length === 1 && def.players.options[0] === 1;
const range = o => (o.length > 1 ? `${o[0]}–${o[o.length - 1]}` : `${o[0]}`);
const SAMPLE = {
  italian: [{ r: 1, s: 'denari' }, { r: 10, s: 'coppe' }, { r: 7, s: 'spade' }, { r: 3, s: 'bastoni' }],
  french: [{ r: 1, s: 'spades' }, { r: 13, s: 'hearts' }, { r: 12, s: 'diamonds' }, { r: 11, s: 'clubs' }]
};
const fan = id => `<div class="fan" aria-hidden="true">${SAMPLE[id].map(c => cardHTML({ ...c, id: `${c.r}-${c.s}`, deck: id })).join('')}</div>`;

function screenHome() {
  const s = loadSession(), saved = s && defs[s.id]
    ? `<a class="resume" href="#/play/${s.id}"><span>${t('resume.banner', { name: esc(gt(defs[s.id], 'name')) })}</span><b>${t('resume.go')} ›</b></a>` : '';
  return `<section class="screen"><h1>${t('home.title')}</h1><p class="lead">${t('home.sub')}</p>${saved}<div class="tiles decks">` +
    catalog.decks.map(d => `<a class="tile deck" href="#/deck/${d.id}">${fan(d.id)}<h2>${t(`deck.${d.id}.name`)}</h2>` +
      `<p>${t(`deck.${d.id}.desc`)}</p><span class="pill">${t('deck.games', { n: d.games.length + d.planned.length })}</span></a>`).join('') +
    '</div></section>';
}

function screenDeck(id) {
  const d = catalog.decks.find(x => x.id === id);
  if (!d) return screenHome();
  const st = getStats();
  return `<section class="screen"><h1>${t(`deck.${id}.name`)}</h1><p class="lead">${t('games.title')}</p><div class="tiles">` +
    d.games.map(gid => {
      const def = defs[gid], s = st[gid];
      return `<a class="tile game" href="#/game/${gid}"><h2>${esc(gt(def, 'name'))}</h2><p>${esc(gt(def, 'tagline'))}</p>` +
        `<div class="tile-meta"><span class="pill">${solo(def) ? t('games.solo') : t('games.players', { n: range(def.players.options) })}</span>` +
        (s ? `<span class="pill ghost">${t('games.record', { won: s.won, played: s.played })}</span>` : '') + '</div></a>';
    }).join('') +
    d.planned.map(n => `<div class="tile game soon"><h2>${esc(n)}</h2><span class="pill ghost">${t('games.soon')}</span></div>`).join('') +
    '</div></section>';
}

function optsFor(def) {
  const o = settings.last[def.id] || {};
  return {
    players: def.players.options.includes(o.players) ? o.players : def.players.default,
    difficulty: def.difficulty.includes(o.difficulty) ? o.difficulty : 'medium',
    wins: def.matchWins ? (def.matchWins.includes(o.wins) ? o.wins : def.matchWins[0]) : 1
  };
}

function screenSetup(id) {
  const def = defs[id];
  if (!def) return screenHome();
  const ses = loadSession(), saved = ses && ses.id === id;
  const o = optsFor(def), teams = (def.players.teamsAt || []).includes(o.players), lvl = def.levels && def.levels[o.difficulty];
  return `<section class="screen narrow"><h1>${esc(gt(def, 'name'))}</h1><p class="lead">${esc(gt(def, 'tagline'))}</p>` +
    `<div class="panel">` + (solo(def) ? '' : `<div class="field"><span>${t('setup.players')}</span><div class="seg">` +
    def.players.options.map(n => `<button type="button" data-players="${n}" aria-pressed="${n === o.players}">${n}</button>`).join('') +
    `</div><small>${t('setup.playersHint', { n: o.players - 1 })}${teams ? ' · ' + t('setup.teams') : ''}</small></div>`) +
    `<div class="field"><span>${t('setup.difficulty')}</span><div class="seg">` +
    def.difficulty.map(k => `<button type="button" data-diff="${k}" aria-pressed="${k === o.difficulty}">${t('diff.' + k)}</button>`).join('') +
    `</div></div>` + (def.matchWins ? `<div class="field"><span>${t('setup.wins')}</span><div class="seg">` +
    def.matchWins.map(k => `<button type="button" data-wins="${k}" aria-pressed="${k === o.wins}">${k}</button>`).join('') + '</div></div>' : '') + `<div>${lvl ? `<small>${t('sol.draw', { n: lvl.draw })} · ${t('sol.passes', { n: lvl.passes < 0 ? '∞' : lvl.passes })}</small>` : ''}</div>` + (saved ? `<a class="btn primary big" href="#/play/${id}">${t('resume.go')}</a><a class="btn big second" href="#/play/${id}" data-fresh>${t('resume.new')}</a>`
      : `<a class="btn primary big" href="#/play/${id}" data-fresh>${t('setup.start')}</a>`) + `</div>` +
    `<details class="rules" open><summary>${t('setup.rules')}</summary><ul>${gt(def, 'rules').map(r => `<li>${esc(r)}</li>`).join('')}</ul>` +
    `<a class="btn" href="#/help/${id}">${t('setup.manual')}</a></details></section>`;
}

function screenHelp(id) {
  const def = defs[id];
  if (!def) return screenHome();
  return `<section class="screen narrow"><p class="eyebrow">${t('setup.rules')}</p><h1>${esc(gt(def, 'name'))}</h1><p class="lead">${esc(gt(def, 'tagline'))}</p>` +
    `${manualHTML(def)}<a class="btn primary big" href="#/game/${id}">${t('man.play')}</a></section>`;
}

function screenStats() {
  const st = getStats(), ids = Object.keys(st).filter(k => defs[k]);
  if (!ids.length) return `<section class="screen narrow"><h1>${t('nav.stats')}</h1><p class="lead">${t('stats.empty')}</p><p class="note">${t('stats.note')}</p></section>`;
  const cell = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const block = (title, s, extra = '') => {
    const rate = s.played ? Math.round(100 * s.won / s.played) : 0;
    return `<div class="panel"><h2>${title}</h2><div class="stats">${cell(s.played, t('stats.played'))}${cell(s.won, t('stats.won'))}` +
      `${cell(s.lost, t('stats.lost'))}${cell(s.tied, t('stats.tied'))}${extra}</div>` +
      `<div class="meter" role="img" aria-label="${t('stats.winrate')} ${rate}%"><i style="width:${rate}%"></i></div><small>${t('stats.winrate')} ${rate}%</small></div>`;
  };
  const tot = ids.reduce((a, k) => ({ played: a.played + st[k].played, won: a.won + st[k].won, lost: a.lost + st[k].lost, tied: a.tied + st[k].tied }),
    { played: 0, won: 0, lost: 0, tied: 0 });
  return `<section class="screen narrow"><h1>${t('nav.stats')}</h1>${block(t('stats.total'), tot)}` +
    ids.map(k => block(esc(gt(defs[k], 'name')), st[k], cell(st[k].bestStreak, t('stats.streak')) + cell(st[k].bestScore, t('stats.best')))).join('') +
    `<p class="note">${t('stats.note')}</p><button type="button" class="btn danger" id="reset-stats">${t('stats.reset')}</button></section>`;
}

function render() {
  if (active) { active.stop(); active = null; }
  const [a, b] = route();
  document.body.dataset.screen = a || 'home';
  $('#btn-back').hidden = !a;
  $('#btn-help').hidden = !(['game', 'play'].includes(a) && defs[b]);
  $('#btn-stats').hidden = a === 'play';
  if (a === 'play' && defs[b]) {
    const def = defs[b], ses = loadSession(), resume = !fresh && ses && ses.id === b ? ses : null;
    fresh = false;
    app.innerHTML = '';
    active = ({ patience: startSolitaire, rummy: startRummy, burraco: startRummy, machiavelli: startMachiavelli, banking: startBanking }[def.engine] || startTable)(app, def, resume ? resume.opts : optsFor(def), () => go('game/' + b), resume);
  } else {
    app.innerHTML = a === 'deck' ? screenDeck(b) : a === 'game' ? screenSetup(b) : a === 'help' ? screenHelp(b) : a === 'stats' ? screenStats() : screenHome();
    window.scrollTo(0, 0);
  }
  document.title = 'Tavolo — ' + t('app.tagline');
}

function back() {
  const [a, b] = route();
  if (a === 'play' && active) active.quit();
  else if (a === 'help' && defs[b]) go('game/' + b);
  else if (a === 'game' && defs[b]) go('deck/' + defs[b].deck);
  else go('');
}

app.addEventListener('click', async e => {
  if (e.target.closest('[data-fresh]')) { fresh = true; clearSession(); }
  const p = e.target.closest('[data-players],[data-diff],[data-wins]');
  if (p) {
    const id = route()[1], o = optsFor(defs[id]);
    if (p.dataset.players) o.players = +p.dataset.players;
    if (p.dataset.diff) o.difficulty = p.dataset.diff;
    if (p.dataset.wins) o.wins = +p.dataset.wins;
    settings.last[id] = o; saveSettings(); render();
    return;
  }
  if (e.target.id === 'reset-stats') {
    const ok = await dialog({
      title: t('stats.reset'), body: `<p>${t('stats.resetConfirm')}</p>`,
      actions: [{ label: t('common.cancel'), val: false, primary: true }, { label: t('common.confirm'), val: true }]
    });
    if (ok) { resetStats(); render(); }
  }
});

$('#btn-back').addEventListener('click', back);
$('#btn-home').addEventListener('click', () => (active ? active.quit() : go('')));
$('#btn-stats').addEventListener('click', () => { if (!active) go('stats'); else active.quit(); });
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-help').addEventListener('click', () => {
  const id = route()[1], def = defs[id];
  if (!def) return;
  if (active) dialog({ title: esc(gt(def, 'name')), body: manualHTML(def), actions: [{ label: t('set.close'), val: 1, primary: true }] });
  else go('help/' + id);
});
$('#btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
$('#btn-install').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null; chrome();
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; chrome(); });
addEventListener('appinstalled', () => { installEvt = null; chrome(); });
addEventListener('hashchange', () => {
  document.querySelectorAll('dialog.dlg').forEach(d => d.close());   // a dialog must not survive a change of screen
  render();
});

// ---------- boot ----------
(async () => {
  applySettings();
  const [cat] = await Promise.all([fetch('games/index.json').then(r => r.json()), setLang(settings.lang)]);
  catalog = cat;
  const ids = cat.decks.flatMap(d => d.games);
  (await Promise.all(ids.map(id => fetch(`games/${id}.json`).then(r => r.json())))).forEach(d => { defs[d.id] = d; });
  chrome();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
