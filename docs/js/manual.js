// "How to play" guide. Text comes from the game JSON and the locales; card tables and examples are drawn from the rules data.
import { t, gt } from './i18n.js';
import { cardHTML, DECKS } from './cards.js';
import { esc } from './ui.js';

export function manualHTML(def) {
  const deck = def.deck, R = def.rules, S = def.scoring || {}, kind = def.engine;
  const card = (id, cls = '') => { const [r, s] = id.split('-'); return cardHTML({ id, r: +r, s, deck }, { cls }); };
  const list = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const sec = (title, body) => `<section class="man-sec"><h2>${title}</h2>${body}</section>`;
  const fig = (id, cap) => `<figure>${card(id)}<figcaption>${cap}</figcaption></figure>`;
  const suit = DECKS[deck].suits[0];
  const div = R.scoreDivisor || 1;
  const pts = u => (div === 1 ? u : (Math.floor(u / div) || (u % div ? '' : 0)) + (['', '⅓', '⅔'][u % div] || ''));

  let out = sec(t('man.goal'), `<p>${esc(gt(def, 'goal'))}</p>`);

  let tb;
  if (kind === 'patience') tb = ['man.s.stock', 'man.s.found', 'man.s.cols', 'man.s.tap'];
  else {
    tb = ['man.t.hand', 'man.t.opps', 'man.t.turn', 'man.t.deck'];
    if (kind === 'trick') { if (R.trump !== 'none') tb.push('man.t.trump'); tb.push('man.t.center.trick'); }
    else if (kind === 'shedding') tb.push('man.d.pile', 'man.d.table');
    else tb.push('man.t.center.fishing', 'man.t.pile');
  }
  out += sec(t('man.table'), list(tb.map(k => t(k))));

  out += sec(t('man.turn'), list(gt(def, 'rules')));

  if (R.rankOrder) out += sec(t('man.cards'),
    `<div class="man-row">${R.rankOrder.map(r => fig(`${r}-${suit}`, `${pts(R.cardPoints[r] || 0)} ${t('play.pts')}`)).join('')}</div>` +
    `<p class="man-scale"><span>← ${t('man.strong')}</span><span>${t('man.weak')} →</span></p>`);

  const ex = (def.manual && def.manual.examples) || [];
  if (ex.length) out += sec(t('man.example'), ex.map(e => '<div class="man-ex">' + (e.trick
    ? e.trick.map(id => card(id, id === e.win ? 'win' : '')).join('') +
      (e.trump ? `<span class="man-note">${t('play.trump')} <svg class="si s-${e.trump}" aria-hidden="true"><use href="#s-${e.trump}"/></svg></span>` : '')
    : `${card(e.play)}<span class="man-arrow" aria-hidden="true">→</span>${e.table.map(id => card(id, e.take.includes(id) ? 'win' : '')).join('')}`) +
    '</div>').join(''));

  if (S.primiera) {
    const seen = new Set(), rows = [];
    Object.entries(S.primiera).sort((a, b) => b[1] - a[1]).forEach(([r, v]) => { if (!seen.has(v)) { seen.add(v); rows.push(fig(`${r}-${suit}`, v)); } });
    out += sec(t('score.primiera'), `<div class="man-row">${rows.join('')}</div>`);
  }

  out += sec(t('man.tips'), list(gt(def, 'tips')));
  const ctl = kind === 'patience' ? ['man.c.hint', 'man.c.undo', 'man.c.leave', 'man.c.settings'] : ['man.c.hint', 'man.c.leave', 'man.c.settings'];
  out += sec(t('man.controls'), list(ctl.map(k => t(k))));
  return `<div class="manual">${out}</div>`;
}
