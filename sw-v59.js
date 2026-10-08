const CACHE_NAME = "showcue-v59-stable";
const APP_SHELL = ["./", "./index.html", "./display.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./showcue-stage-art.jpg", "./sw-v59.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("showcue-") && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const critical = path.endsWith("/index.html") || path.endsWith("/") || path.endsWith("/sw-v59.js") || path.endsWith("/manifest.webmanifest");
  if (critical) {
    event.respondWith(fetch(req, {cache:"no-store"}).then(res => {
      if (res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    if (res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
    return res;
  }).catch(() => cached || Response.error())));
});
