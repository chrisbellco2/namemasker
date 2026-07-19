// NameMasker service worker: cache-first for the site's own static assets,
// nothing else. The only network activity this site ever performs is loading
// these files; documents, mappings, and text never touch the network.
const CACHE = 'namemasker-__CACHE_VERSION__';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icon.svg',
  'fonts/BricolageGrotesque-var.woff2',
  'fonts/PublicSans-var.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ??
        fetch(request).catch(() =>
          request.mode === 'navigate' ? caches.match('index.html') : Response.error(),
        ),
    ),
  );
});
