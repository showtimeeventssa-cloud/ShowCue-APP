const C="showcue-v28-tv-video-playback";
const A=["./","./index.html","./display.html","./manifest.webmanifest","./showcue-logo.svg","./showcue-stage-art.jpg","./icon-48.png","./icon-72.png","./icon-96.png","./icon-120.png","./icon-144.png","./icon-152.png","./icon-167.png","./icon-180.png","./icon-192.png","./icon-256.png","./icon-384.png","./icon-512.png","./icon-1024.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(A);}).then(function(){return self.skipWaiting();}));});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==C;}).map(function(x){return caches.delete(x);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener("fetch",function(e){e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request);}));});
