import { TECHNIQUES, type Technique } from '../src/shared/artworks'
import type { Design, DesignData, DesignInput, Print } from '../src/shared/designs'
import { isFileKey } from './files'
import { HttpError, json, noContent, now, readBody, required, text, type Env } from './http'

/** /api/designs — prendas diseñadas en el Diseñador. */
export async function designsRoute(request: Request, env: Env, id: string | undefined) {
  if (!id && request.method === 'GET') return json(await listDesigns(env))
  if (!id && request.method === 'POST') return json(await createDesign(env, await readDesign(request)), 201)
  if (id && request.method === 'GET') return json(await getDesign(env, id))
  if (id && request.method === 'PUT') return json(await updateDesign(env, id, await readDesign(request)))
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM designs WHERE id = ?').bind(id).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface DesignRow {
  id: string
  name: string
  template: string
  client_id: string | null
  client_name: string | null
  data: string
  created_at: string
  updated_at: string
}

const SELECT = `SELECT d.*, c.name AS client_name FROM designs d LEFT JOIN clients c ON c.id = d.client_id`

function toDesign(r: DesignRow): Design {
  return {
    id: r.id,
    name: r.name,
    template: r.template,
    clientId: r.client_id,
    clientName: r.client_name ?? undefined,
    data: JSON.parse(r.data || '{}') as DesignData,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listDesigns(env: Env) {
  const { results } = await env.DB.prepare(`${SELECT} ORDER BY d.updated_at DESC`).all<DesignRow>()
  return results.map(toDesign)
}

async function getDesign(env: Env, id: string) {
  const row = await env.DB.prepare(`${SELECT} WHERE d.id = ?`).bind(id).first<DesignRow>()
  if (!row) throw new HttpError(404, 'Diseño no encontrado')
  return toDesign(row)
}

async function createDesign(env: Env, d: DesignInput) {
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    'INSERT INTO designs (id, name, template, client_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, d.name, d.template, d.clientId, JSON.stringify(d.data), t, t)
    .run()
  return getDesign(env, id)
}

async function updateDesign(env: Env, id: string, d: DesignInput) {
  const { meta } = await env.DB.prepare(
    'UPDATE designs SET name = ?, template = ?, client_id = ?, data = ?, updated_at = ? WHERE id = ?',
  )
    .bind(d.name, d.template, d.clientId, JSON.stringify(d.data), now(), id)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Diseño no encontrado')
  return getDesign(env, id)
}

async function readDesign(request: Request): Promise<DesignInput> {
  const b = await readBody(request)
  const data = (b.data ?? {}) as Partial<DesignData>
  if (typeof data !== 'object') throw new HttpError(400, 'Datos del diseño no válidos')
  const options: DesignData['options'] = {}
  for (const [k, v] of Object.entries(data.options ?? {})) {
    if (typeof v === 'string' || typeof v === 'boolean') options[k] = v
  }
  const pieces: DesignData['pieces'] = {}
  for (const [k, v] of Object.entries(data.pieces ?? {})) {
    if (v && typeof v === 'object') {
      const color = text((v as { color?: unknown }).color)
      pieces[k] = {
        color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#cccccc',
        materialId: text((v as { materialId?: unknown }).materialId) || null,
      }
    }
  }
  const prints = Array.isArray(data.prints) ? data.prints.slice(0, 50).map(readPrint).filter((p): p is Print => !!p) : []
  return {
    name: required(b.name, 'El nombre'),
    template: required(b.template, 'La prenda base'),
    clientId: text(b.clientId) || null,
    data: { options, pieces, prints, notes: text(data.notes) },
  }
}

const VIEWS = ['front', 'back', 'side'] as const

/** Valida un estampado (descarta los que no tengan sentido). */
function readPrint(raw: unknown): Print | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const n = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
  const kind = p.kind === 'text' ? 'text' : 'artwork'
  const file = text(p.file)
  if (kind === 'artwork' && !isFileKey(file)) return null
  const color = text(p.color)
  return {
    id: text(p.id) || crypto.randomUUID(),
    view: VIEWS.includes(p.view as (typeof VIEWS)[number]) ? (p.view as Print['view']) : 'front',
    kind,
    artworkId: text(p.artworkId) || null,
    file: kind === 'artwork' ? file : '',
    aspect: Math.max(0.05, n(p.aspect, 1)),
    w: Math.max(2, n(p.w, 60)),
    text: text(p.text).slice(0, 200),
    font: text(p.font).slice(0, 80),
    size: Math.max(2, n(p.size, 20)),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#1d1d1f',
    bold: p.bold === true,
    x: n(p.x, 200),
    y: n(p.y, 200),
    rotation: n(p.rotation, 0),
    technique: TECHNIQUES.some((t) => t.id === p.technique) ? (p.technique as Technique) : 'serigrafia',
    clip: p.clip !== false,
  }
}
