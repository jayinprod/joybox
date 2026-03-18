const CACHE = 'joybox-v1'
const ASSETS = ['/', '/index.html', '/manifest.json']

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
  // For audio blobs and worker API calls — always go network
  if (e.request.url.includes('workers.dev') || e.request.url.startsWith('blob:')) {
    return
  }
  // For app shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
