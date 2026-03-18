const CACHE = 'joybox-v2'
const ASSETS = ['/joybox/', '/joybox/index.html', '/joybox/app.js', '/joybox/app.css', '/joybox/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // For audio blobs — always go network
  if (e.request.url.startsWith('blob:') || e.request.url.includes('backblazeb2.com')) {
    return
  }
  // For app shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
