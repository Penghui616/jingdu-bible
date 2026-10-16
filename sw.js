'use strict';
// Change this version whenever a cached application asset changes.
const CACHE = 'jingdu-offline-v2-direct';
const ROOT = new URL('./',self.location.href);
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'direct-api.js', 'direct-core.js', 'speech.js', 'pwa.js', 'icon.svg', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'data/cus.json', 'data/source.json'].map(path=>new URL(path,ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never mistake an authentication redirect or error page for an app asset.
    for (const url of ASSETS) {
      const response = await fetch(new Request(url, {cache:'reload', credentials:'same-origin'}));
      const type = response.headers.get('content-type') || '';
      const expected = url.endsWith('.js') ? /javascript/ : url.endsWith('.css') ? /text\/css/ : /\.(json|webmanifest)$/.test(url) ? /json|manifest/ : /\.(png|svg)$/.test(url) ? /image\// : /text\/html/;
      if (!response.ok || response.redirected || !expected.test(type)) throw new Error('Offline assets unavailable');
      await cache.put(url, response);
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if(key.startsWith('jingdu-offline-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.search='';url.hash='';
  // APIs, credentials, sign-in pages and model audio always use the network.
  if(event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.href) || fetch(event.request);
  })());
});
