import type { Artwork, ArtworkData, ArtworkInput } from '../src/shared/artworks'
import { isFileKey } from './files'
import { HttpError, json, noContent, now, num, readBody, required, text, type Env } from './http'

/** /api/artworks — gráficos para estampar. */
export async function artworksRoute(request: Request, env: Env, uid: string, id: string | undefined) {
  if (!id && request.method === 'GET') return json(await listArtworks(env, uid))
  if (!id && request.method === 'POST') return json(await createArtwork(env, uid, await readArtwork(request)), 201)
  if (id && request.method === 'GET') return json(await getArtwork(env, uid, id))
  if (id && request.method === 'PUT') return json(await updateArtwork(env, uid, id, await readArtwork(request)))
  if (id && request.method === 'DELETE') {
    // La imagen no se borra: los diseños que ya usan este gráfico guardan su propia referencia a ella
    await env.DB.prepare('DELETE FROM artworks WHERE id = ? AND user_id = ?').bind(id, uid).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface ArtworkRow {
  id: string
  name: string
  file: string
  width: number
  height: number
  data: string
  tags: string
  created_at: string
  updated_at: string
}

function toArtwork(r: ArtworkRow): Artwork {
  return {
    id: r.id,
    name: r.name,
    file: r.file,
    width: r.width,
    height: r.height,
    data: r.data ? (JSON.parse(r.data) as ArtworkData) : null,
    tags: r.tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listArtworks(env: Env, uid: string) {
  const { results } = await env.DB.prepare('SELECT * FROM artworks WHERE user_id = ? ORDER BY updated_at DESC').bind(uid).all<ArtworkRow>()
  return results.map(toArtwork)
}

async function getArtwork(env: Env, uid: string, id: string) {
  const row = await env.DB.prepare('SELECT * FROM artworks WHERE id = ? AND user_id = ?').bind(id, uid).first<ArtworkRow>()
  if (!row) throw new HttpError(404, 'Gráfico no encontrado')
  return toArtwork(row)
}

async function createArtwork(env: Env, uid: string, a: ArtworkInput) {
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    'INSERT INTO artworks (id, user_id, name, file, width, height, data, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, uid, a.name, a.file, a.width, a.height, a.data ? JSON.stringify(a.data) : '', a.tags, t, t)
    .run()
  return getArtwork(env, uid, id)
}

async function updateArtwork(env: Env, uid: string, id: string, a: ArtworkInput) {
  const { meta } = await env.DB.prepare(
    'UPDATE artworks SET name = ?, file = ?, width = ?, height = ?, data = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  )
    .bind(a.name, a.file, a.width, a.height, a.data ? JSON.stringify(a.data) : '', a.tags, now(), id, uid)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Gráfico no encontrado')
  // Al volver a guardar se genera una imagen nueva; la anterior se conserva porque puede estar en diseños ya hechos
  return getArtwork(env, uid, id)
}

async function readArtwork(request: Request): Promise<ArtworkInput> {
  const b = await readBody(request)
  const file = text(b.file)
  if (!isFileKey(file)) throw new HttpError(400, 'Falta la imagen del gráfico')
  const width = num(b.width)
  const height = num(b.height)
  if (!width || !height) throw new HttpError(400, 'Tamaño de imagen no válido')
  const data = b.data && typeof b.data === 'object' && Array.isArray((b.data as ArtworkData).layers) ? (b.data as ArtworkData) : null
  return { name: required(b.name, 'El nombre'), file, width, height, data, tags: text(b.tags) }
}
