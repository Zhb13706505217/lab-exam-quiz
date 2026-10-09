/* 上岗证刷题 · 离线缓存（离线优先 + 后台自动更新） */
const CACHE = 'labexam-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './bank.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    const network = fetch(e.request).then(res => {
      if (res && res.status === 200) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    if (hit) return hit;
    const res = await network;
    return res || (await cache.match('./index.html')) || Response.error();
  })());
});
