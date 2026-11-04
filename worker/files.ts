import { HttpError, json, noContent, type Env } from './http'

/** Tipos de imagen admitidos y su extensión. */
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}
const MAX_BYTES = 8 * 1024 * 1024

/**
 * /api/files — archivos guardados en Workers KV (de momento, imágenes).
 * POST con la imagen como cuerpo → { key }. GET /api/files/:key → la imagen.
 */
export async function filesRoute(request: Request, env: Env, key: string | undefined) {
  if (!key && request.method === 'POST') {
    const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim()
    const ext = IMAGE_TYPES[type]
    if (!ext) throw new HttpError(415, 'Solo se admiten imágenes (JPG, PNG, WebP, GIF o SVG)')
    const data = await request.arrayBuffer()
    if (data.byteLength === 0) throw new HttpError(400, 'El archivo está vacío')
    if (data.byteLength > MAX_BYTES) throw new HttpError(413, 'La imagen pesa más de 8 MB')
    const newKey = `${crypto.randomUUID()}.${ext}`
    await env.FILES.put(newKey, data, { metadata: { contentType: type } })
    return json({ key: newKey }, 201)
  }
  if (key && request.method === 'GET') {
    const obj = await env.FILES.getWithMetadata<{ contentType?: string }>(key, 'stream')
    if (!obj.value) throw new HttpError(404, 'Archivo no encontrado')
    return new Response(obj.value, {
      headers: {
        'Content-Type': obj.metadata?.contentType ?? 'application/octet-stream',
        // Las claves no se reutilizan nunca: el navegador puede guardar la imagen para siempre
        'Cache-Control': 'private, max-age=31536000, immutable',
        // Los SVG se muestran como imagen, sin ejecutar nada que traigan dentro
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    })
  }
  if (key && request.method === 'DELETE') {
    await env.FILES.delete(key)
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

/** Borra un archivo si existe (al cambiar o quitar una foto). */
export async function deleteFile(env: Env, key: string) {
  if (key) await env.FILES.delete(key)
}

/** Comprueba que una clave tiene la forma de las que genera esta API. */
export function isFileKey(key: string) {
  return /^[0-9a-f-]{36}\.(jpg|png|webp|gif|svg)$/.test(key)
}
