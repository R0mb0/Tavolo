// Service worker: offline support (stale-while-revalidate). Bump VERSION on every release.
const VERSION = 'tavolo-v1.1.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/cards.js', 'js/i18n.js', 'js/store.js', 'js/table.js', 'js/ui.js', 'js/manual.js', 'js/sfx.js', 'js/solitaire.js', 'js/rummy.js', 'js/machiavelli.js', 'js/banking.js', 'js/session.js', 'js/log.js', 'js/learn.js', 'js/achievements.js',
  'js/engines/index.js', 'js/engines/trick.js', 'js/engines/fishing.js', 'js/engines/patience.js', 'js/engines/shedding.js', 'js/engines/rummy.js', 'js/engines/burraco.js', 'js/engines/machiavelli.js', 'js/engines/banking.js', 'js/engines/called.js',
  'games/index.json', 'games/briscola.json', 'games/scopa.json', 'games/scopone.json', 'games/scopa-assi.json', 'games/tressette.json', 'games/solitario.json', 'games/klondike.json', 'games/danish.json', 'games/scala40.json', 'games/burraco.json', 'games/machiavelli.json', 'games/sette-e-mezzo.json', 'games/briscola-chiamata.json', 'games/rubamazzo.json',
  'locales/en.json', 'locales/it.json', 'locales/es.json', 'locales/fr.json', 'locales/de.json',
  'locales/pt.json', 'locales/zh.json', 'locales/ja.json', 'locales/ko.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});
