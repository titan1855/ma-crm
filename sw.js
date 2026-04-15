const CACHE = 'ma-crm-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/db.js',
  './js/utils.js',
  './js/router.js',
  './js/migration.js',
  './js/modules/daily312.js',
  './js/modules/prospects.js',
  './js/modules/pool.js',
  './js/modules/calendar.js',
  './js/modules/products.js',
  './js/modules/mufo.js',
  './js/modules/challenges.js',
  './js/modules/achievements.js',
  './js/modules/weekly.js',
  './js/modules/onboarding.js',
  './js/modules/testimonials.js',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=DM+Serif+Display&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Firebase / Google API 與 CDN 請求不快取，讓它走網路
  const url = e.request.url;
  if (
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com/google.firestore') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken.googleapis') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
