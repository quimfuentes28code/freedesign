import type { LienzoAsset } from '../src/shared/designs'
import { deleteFile, isFileKey } from './files'
import { HttpError, json, noContent, now, readBody, required, text, type Env } from './http'

/** /api/recursos — texturas y pinceles propios del lienzo (de cada cuenta). */
export async function lienzoAssetsRoute(request: Request, env: Env, uid: string, id: string | undefined) {
  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM lienzo_assets WHERE user_id = ? ORDER BY created_at DESC').bind(uid).all<Row>()
    return json(results.map(toAsset))
  }
  if (!id && request.method === 'POST') {
    const b = await readBody(request)
    const kind = b.kind === 'pincel' ? 'pincel' : b.kind === 'textura' ? 'textura' : null
    if (!kind) throw new HttpError(400, 'Tipo no válido')
    const file = text(b.file)
    if (file && !isFileKey(file)) throw new HttpError(400, 'Imagen no válida')
    if (kind === 'textura' && !file) throw new HttpError(400, 'Falta la imagen de la textura')
    const grain = text(b.grain)
    const row: Row = {
      id: crypto.randomUUID(),
      kind,
      name: required(b.name, 'El nombre').slice(0, 60),
      file,
      grain: grain && isFileKey(grain) ? grain : null,
      settings: JSON.stringify(readSettings(b.settings)),
      created_at: now(),
    }
    await env.DB.prepare('INSERT INTO lienzo_assets (id, user_id, kind, name, file, grain, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, uid, row.kind, row.name, row.file, row.grain, row.settings, row.created_at)
      .run()
    return json(toAsset(row), 201)
  }
  if (id && request.method === 'PATCH') {
    const b = await readBody(request)
    const row = await env.DB.prepare('SELECT * FROM lienzo_assets WHERE id = ? AND user_id = ?').bind(id, uid).first<Row>()
    if (!row) throw new HttpError(404, 'No encontrado')
    const name = text(b.name).slice(0, 60) || row.name
    const settings = b.settings === undefined ? row.settings : JSON.stringify(readSettings(b.settings))
    await env.DB.prepare('UPDATE lienzo_assets SET name = ?, settings = ? WHERE id = ? AND user_id = ?').bind(name, settings, id, uid).run()
    return json(toAsset({ ...row, name, settings }))
  }
  if (id && request.method === 'DELETE') {
    const row = await env.DB.prepare('SELECT * FROM lienzo_assets WHERE id = ? AND user_id = ?').bind(id, uid).first<Row>()
    if (row) {
      await env.DB.prepare('DELETE FROM lienzo_assets WHERE id = ? AND user_id = ?').bind(id, uid).run()
      // Las imágenes de un pincel solo las usa él; las de una textura pueden estar en lienzos guardados (se quedan)
      if (row.kind === 'pincel') {
        if (row.file) await deleteFile(env, uid, row.file)
        if (row.grain) await deleteFile(env, uid, row.grain)
      }
    }
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

/** Ajustes que se guardan: números acotados, sí/no y unos pocos textos conocidos. */
const NUMBERS: Record<string, [number, number]> = {
  size: [1, 500],
  opacity: [0, 1],
  flow: [0.01, 1],
  spacing: [0.01, 5],
  hardness: [0, 1],
  grain: [0, 1],
  pressureSize: [0, 1],
  pressureOpacity: [0, 1],
  taper: [0, 200],
  streamline: [0, 1],
  scatter: [0, 3],
  scale: [0.05, 10],
}
function readSettings(raw: unknown): LienzoAsset['settings'] {
  const out: LienzoAsset['settings'] = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const range = NUMBERS[k]
    if (range && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(range[1], Math.max(range[0], v))
    else if (k === 'orient' && typeof v === 'boolean') out[k] = v
    else if ((k === 'tip' || k === 'shape' || k === 'grainTexture' || k === 'base' || k === 'blend') && typeof v === 'string' && /^[a-z0-9-]{1,30}$/.test(v)) out[k] = v
    else if (k === 'rows' && Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'number' && Number.isFinite(x)).slice(0, 4).join(',')
  }
  return out
}

interface Row {
  id: string
  kind: 'textura' | 'pincel'
  name: string
  file: string
  grain: string | null
  settings: string
  created_at: string
}

function toAsset(r: Row): LienzoAsset {
  return { id: r.id, kind: r.kind, name: r.name, file: r.file, grain: r.grain, settings: JSON.parse(r.settings || '{}'), createdAt: r.created_at }
}
