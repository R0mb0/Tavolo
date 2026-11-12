// Running log of a game: every table adds a line for what happens, the player can read it back at any time.
import { t } from './i18n.js';
import { dialog } from './ui.js';

export function createLog() {
  const items = [];
  return {
    add(html) { items.push(html); if (items.length > 400) items.shift(); },
    head(html) { items.push(`<b class="log-head">${html}</b>`); },
    clear() { items.length = 0; },
    button: () => `<button type="button" class="icon hint" data-log title="${t('play.log')}" aria-label="${t('play.log')}"><svg><use href="#i-log"/></svg></button>`,
    show: () => dialog({
      title: t('play.log'),
      body: items.length ? `<ol class="log">${items.slice().reverse().map(x => `<li>${x}</li>`).join('')}</ol>` : `<p>${t('play.logEmpty')}</p>`,
      actions: [{ label: t('set.close'), val: 1, primary: true }]
    })
  };
}
