// "How to play" guide. Text comes from the game JSON and the locales; card tables and examples are drawn from the rules data.
import { t, gt } from './i18n.js';
import { cardHTML, DECKS } from './cards.js';
import { esc } from './ui.js';

export function manualHTML(def) {
  const deck = def.deck, R = def.rules, S = def.scoring || {};
  const card = (id, cls = '') => { const [r, s] = id.split('-'); return cardHTML({ id, r: +r, s, deck }, { cls }); };
  const list = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const sec = (title, body) => `<section class="man-sec"><h2>${title}</h2>${body}</section>`;
  const fig = (id, cap) => `<figure>${card(id)}<figcaption>${cap}</figcaption></figure>`;
  const suit = DECKS[deck].suits[0];

  let out = sec(t('man.goal'), `<p>${esc(gt(def, 'goal'))}</p>`);

  const tb = ['man.t.hand', 'man.t.opps', 'man.t.turn', 'man.t.deck'];
  tb.push(...(def.engine === 'trick' ? ['man.t.trump', 'man.t.center.trick'] : ['man.t.center.fishing', 'man.t.pile']));
  out += sec(t('man.table'), list(tb.map(k => t(k))));

  out += sec(t('man.turn'), list(gt(def, 'rules')));

  if (R.rankOrder) out += sec(t('man.cards'),
    `<div class="man-row">${R.rankOrder.map(r => fig(`${r}-${suit}`, `${R.cardPoints[r] || 0} ${t('play.pts')}`)).join('')}</div>` +
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
  out += sec(t('man.controls'), list(['man.c.hint', 'man.c.leave', 'man.c.settings'].map(k => t(k))));
  return `<div class="manual">${out}</div>`;
}
