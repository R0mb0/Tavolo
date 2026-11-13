// Step-by-step tutorial: the guide of a game shown one idea at a time, ending with a practice game.
import { t, gt } from './i18n.js';
import { esc } from './ui.js';
import { manualParts } from './manual.js';

export function learnSteps(def) {
  const parts = manualParts(def), by = key => parts.find(p => p.title === t(key));
  const rules = gt(def, 'rules');
  const steps = [{ title: t('man.goal'), body: `<p class="big">${esc(gt(def, 'goal'))}</p>` }, by('man.table')];
  rules.forEach((r, k) => steps.push({ title: t('learn.rule', { n: k + 1, of: rules.length }), body: `<p class="big">${esc(r)}</p>` }));
  for (const key of ['man.cards', 'man.example', 'score.primiera', 'man.tips']) { const p = by(key); if (p) steps.push(p); }
  steps.push({ title: t('learn.practice'), body: `<p class="big">${t('learn.practiceText')}</p>`, last: true });
  return steps;
}

export function learnHTML(def, at) {
  const steps = learnSteps(def), n = steps.length, k = Math.min(Math.max(+at || 0, 0), n - 1), s = steps[k], id = def.id;
  return `<section class="screen narrow learn"><p class="eyebrow">${t('learn.title')} · ${k + 1} / ${n}</p><h1>${esc(gt(def, 'name'))}</h1>` +
    `<div class="meter" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${k + 1}" aria-label="${t('learn.title')}"><i style="width:${100 * (k + 1) / n}%"></i></div>` +
    `<div class="panel learn-step manual"><h2>${s.title}</h2>${s.body}</div><div class="learn-nav">` +
    (k > 0 ? `<a class="btn" href="#/learn/${id}/${k - 1}">‹ ${t('nav.back')}</a>` : '') + '<span class="grow"></span>' +
    (s.last ? `<a class="btn primary big" href="#/play/${id}" data-fresh data-coach>${t('learn.start')}</a>`
      : `<a class="btn primary" href="#/learn/${id}/${k + 1}">${t('learn.next')} ›</a>`) + '</div></section>';
}
