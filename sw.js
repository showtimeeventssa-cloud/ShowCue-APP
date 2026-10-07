const C="showcue-v52-stable";
const A=["./","./index.html","./display.html","./manifest.webmanifest","./showcue-logo.svg","./showcue-stage-art.jpg","./icon-48.png","./icon-72.png","./icon-96.png","./icon-120.png","./icon-144.png","./icon-152.png","./icon-167.png","./icon-180.png","./icon-192.png","./icon-256.png","./icon-384.png","./icon-512.png","./icon-1024.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request))));
