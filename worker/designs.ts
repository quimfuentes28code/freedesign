import { TECHNIQUES, type Technique } from '../src/shared/artworks'
import type { Callout, Colorway, Design, DesignData, DesignInput, Drawing, Print, Tracing } from '../src/shared/designs'
import { isFileKey } from './files'
import { HttpError, json, noContent, now, ownedRef, readBody, required, text, type Env } from './http'

/** /api/designs — prendas diseñadas en el Diseñador. */
export async function designsRoute(request: Request, env: Env, uid: string, id: string | undefined, url: URL) {
  if (!id && request.method === 'GET') return json(await listDesigns(env, uid, url.searchParams.get('project') ?? ''))
  if (!id && request.method === 'POST') return json(await createDesign(env, uid, await readDesign(request, env, uid)), 201)
  if (id && request.method === 'GET') return json(await getDesign(env, uid, id))
  if (id && request.method === 'PUT') return json(await updateDesign(env, uid, id, await readDesign(request, env, uid)))
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM designs WHERE id = ? AND user_id = ?').bind(id, uid).run()
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
  project_id: string | null
  project_name: string | null
  data: string
  created_at: string
  updated_at: string
}

const SELECT = `SELECT d.*, c.name AS client_name, p.name AS project_name FROM designs d
  LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN projects p ON p.id = d.project_id`

function toDesign(r: DesignRow): Design {
  return {
    id: r.id,
    name: r.name,
    template: r.template,
    clientId: r.client_id,
    clientName: r.client_name ?? undefined,
    projectId: r.project_id,
    projectName: r.project_name ?? undefined,
    data: JSON.parse(r.data || '{}') as DesignData,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listDesigns(env: Env, uid: string, project: string) {
  const { results } = await env.DB.prepare(
    `${SELECT} WHERE d.user_id = ?2 AND (?1 = '' OR d.project_id = ?1) ORDER BY d.updated_at DESC`,
  )
    .bind(project, uid)
    .all<DesignRow>()
  return results.map(toDesign)
}

async function getDesign(env: Env, uid: string, id: string) {
  const row = await env.DB.prepare(`${SELECT} WHERE d.id = ? AND d.user_id = ?`).bind(id, uid).first<DesignRow>()
  if (!row) throw new HttpError(404, 'Diseño no encontrado')
  return toDesign(row)
}

async function createDesign(env: Env, uid: string, d: DesignInput) {
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    'INSERT INTO designs (id, user_id, name, template, client_id, project_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, uid, d.name, d.template, d.clientId, d.projectId, JSON.stringify(d.data), t, t)
    .run()
  return getDesign(env, uid, id)
}

async function updateDesign(env: Env, uid: string, id: string, d: DesignInput) {
  const { meta } = await env.DB.prepare(
    'UPDATE designs SET name = ?, template = ?, client_id = ?, project_id = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  )
    .bind(d.name, d.template, d.clientId, d.projectId, JSON.stringify(d.data), now(), id, uid)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Diseño no encontrado')
  return getDesign(env, uid, id)
}

async function readDesign(request: Request, env: Env, uid: string): Promise<DesignInput> {
  const b = await readBody(request)
  const data = (b.data ?? {}) as Partial<DesignData>
  if (typeof data !== 'object') throw new HttpError(400, 'Datos del diseño no válidos')
  const options: DesignData['options'] = {}
  for (const [k, v] of Object.entries(data.options ?? {})) {
    if (typeof v === 'string' || typeof v === 'boolean') options[k] = v
  }
  const pieces = readPieces(data.pieces)
  const prints = Array.isArray(data.prints) ? data.prints.slice(0, 50).map(readPrint).filter((p): p is Print => !!p) : []
  const colorways: Colorway[] = Array.isArray(data.colorways)
    ? data.colorways.slice(0, 20).flatMap((c) => {
        if (!c || typeof c !== 'object') return []
        const x = c as unknown as Record<string, unknown>
        return [{ id: text(x.id) || crypto.randomUUID(), name: text(x.name).slice(0, 60) || 'Variante', pieces: readPieces(x.pieces) }]
      })
    : []
  const activeColorway = text(data.activeColorway)
  const callouts = Array.isArray(data.callouts) ? data.callouts.slice(0, 60).map(readCallout).filter((c): c is Callout => !!c) : []
  const drawings = Array.isArray(data.drawings) ? data.drawings.slice(0, 300).map(readDrawing).filter((d): d is Drawing => !!d) : []
  const tracings = Array.isArray(data.tracings) ? data.tracings.slice(0, 3).map(readTracing).filter((d): d is Tracing => !!d) : []
  const measures: Record<string, number> = {}
  if (data.measures && typeof data.measures === 'object') {
    for (const [k, v] of Object.entries(data.measures).slice(0, 40)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 400) measures[k.slice(0, 40)] = Math.round(v * 10) / 10
    }
  }
  return {
    name: required(b.name, 'El nombre'),
    template: required(b.template, 'La prenda base'),
    clientId: await ownedRef(env, 'clients', text(b.clientId) || null, uid, 'El cliente'),
    projectId: await ownedRef(env, 'projects', text(b.projectId) || null, uid, 'El proyecto'),
    data: {
      options,
      pieces,
      prints,
      notes: text(data.notes),
      ...(colorways.length ? { colorways, activeColorway: colorways.some((c) => c.id === activeColorway) ? activeColorway : colorways[0].id } : {}),
      ...(callouts.length ? { callouts } : {}),
      ...(Object.keys(measures).length ? { measures } : {}),
      ...(drawings.length ? { drawings } : {}),
      ...(tracings.length ? { tracings } : {}),
    },
  }
}

function readPieces(raw: unknown): DesignData['pieces'] {
  const pieces: DesignData['pieces'] = {}
  if (!raw || typeof raw !== 'object') return pieces
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue
    const s = v as Record<string, unknown>
    const color = text(s.color)
    pieces[k] = {
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#cccccc',
      materialId: text(s.materialId) || null,
      ...(text(s.colorName) ? { colorName: text(s.colorName).slice(0, 60) } : {}),
      ...(text(s.colorCode) ? { colorCode: text(s.colorCode).slice(0, 40) } : {}),
    }
  }
  return pieces
}

const finite = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
const viewOf = (v: unknown) => (VIEWS.includes(v as (typeof VIEWS)[number]) ? (v as (typeof VIEWS)[number]) : 'front')

function readDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const kinds = ['free', 'line', 'rect', 'ellipse'] as const
  const points = Array.isArray(d.points) ? d.points.slice(0, 4000).map((n) => Math.round(finite(n, 0) * 10) / 10) : []
  if (points.length < 4 || points.length % 2) return null
  const color = text(d.color)
  return {
    id: text(d.id) || crypto.randomUUID(),
    view: viewOf(d.view),
    kind: kinds.includes(d.kind as (typeof kinds)[number]) ? (d.kind as Drawing['kind']) : 'free',
    points,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#1d1c1a',
    width: Math.min(12, Math.max(0.3, finite(d.width, 1.2))),
    dash: d.dash === true,
    ...(d.hidden === true ? { hidden: true } : {}),
    ...(d.locked === true ? { locked: true } : {}),
  }
}

function readTracing(raw: unknown): Tracing | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const file = text(t.file)
  if (!isFileKey(file)) return null
  return {
    id: text(t.id) || crypto.randomUUID(),
    view: viewOf(t.view),
    file,
    aspect: Math.max(0.05, finite(t.aspect, 1)),
    x: finite(t.x, 200),
    y: finite(t.y, 240),
    w: Math.max(10, finite(t.w, 300)),
    opacity: Math.min(1, Math.max(0.05, finite(t.opacity, 0.5))),
    ...(t.hidden === true ? { hidden: true } : {}),
    ...(t.locked === true ? { locked: true } : {}),
  }
}

function readCallout(raw: unknown): Callout | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const [x, y, lx, ly] = [n(c.x), n(c.y), n(c.lx), n(c.ly)]
  if (x === null || y === null || lx === null || ly === null) return null
  return {
    id: text(c.id) || crypto.randomUUID(),
    view: VIEWS.includes(c.view as (typeof VIEWS)[number]) ? (c.view as Callout['view']) : 'front',
    x,
    y,
    lx,
    ly,
    text: text(c.text).slice(0, 200),
    ...(c.hidden === true ? { hidden: true } : {}),
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
    ...(p.hidden === true ? { hidden: true } : {}),
    ...(p.locked === true ? { locked: true } : {}),
  }
}
