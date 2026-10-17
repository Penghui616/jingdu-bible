'use strict';
// Change this version whenever a cached application asset changes.
const BUILD = '20261017-5';
const CACHE = 'jingdu-offline-v5-update';
const ROOT = new URL('./',self.location.href);
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'direct-api.js', 'direct-core.js', 'speech.js', 'voice-input.js', 'pwa.js', 'icon.svg', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'data/cus.json', 'data/source.json'].map(path=>new URL(path,ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never mistake an authentication redirect or error page for an app asset.
    for (const url of ASSETS) {
      const fresh = new URL(url);fresh.searchParams.set('build',BUILD);
      const response = await fetch(new Request(fresh, {cache:'no-store', credentials:'same-origin'}));
      const type = response.headers.get('content-type') || '';
      const expected = url.endsWith('.js') ? /javascript/ : url.endsWith('.css') ? /text\/css/ : /\.(json|webmanifest)$/.test(url) ? /json|manifest/ : /\.(png|svg)$/.test(url) ? /image\// : /text\/html/;
      if (!response.ok || response.redirected || !expected.test(type)) throw new Error('Offline assets unavailable');
      if((url===ROOT.href || url.endsWith('/index.html')) && !(await response.clone().text()).includes(`name="jingdu-build" content="${BUILD}"`))throw new Error('App version unavailable');
      await cache.put(url, response);
    }
    // Activate only after the complete version is cached. Existing documents are
    // not forcibly reloaded, so unsent questions and active recordings survive.
    await self.skipWaiting();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
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
