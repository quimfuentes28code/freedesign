/*
 * Service worker de FreeDesign (app instalable en iPad, móvil y ordenador).
 * - La API (/api/*) nunca pasa por la caché: los datos siempre son los del servidor.
 * - Las páginas van primero a la red (así se ve siempre lo último publicado) y, sin conexión, se abre la última guardada.
 * - Los archivos con huella en el nombre (/assets/*) no cambian nunca: se guardan la primera vez que se usan.
 * - Iconos, mockups y modelos 3D: se sirven de la caché y se refrescan por detrás.
 * Cambiar VERSION borra las cachés viejas al activarse el service worker nuevo.
 */
const VERSION = 'v1'
const PAGES = `fd-pages-${VERSION}`
const STATIC = `fd-static-${VERSION}`
const MEDIA = `fd-media-${VERSION}`

self.addEventListener('install', (event) => {
  // Guarda la portada para poder abrir la app sin conexión desde el primer momento
  event.waitUntil(caches.open(PAGES).then((c) => c.add('/')).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, STATIC, MEDIA]
      for (const key of await caches.keys()) if (key.startsWith('fd-') && !keep.includes(key)) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// La página avisa cuando conviene cambiar a la versión nueva (al salir de la app, para no cortar a nadie a medio trabajo)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, STATIC))
  } else if (/^\/(icons|mockups|models)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, MEDIA))
  }
})

async function networkFirst(req) {
  const cache = await caches.open(PAGES)
  try {
    const res = await fetch(req)
    // Es una app de una sola página: todas las rutas son el mismo index.html, se guarda como «/»
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch (err) {
    const cached = await cache.match('/')
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name)
  const cached = await cache.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name)
  const cached = await cache.match(req)
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => cached)
  return cached || fresh
}
