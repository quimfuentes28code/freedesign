import { TECHNIQUES, type Technique } from '../src/shared/artworks'
import {
  BUTTON_STYLES,
  DETAIL_KINDS, LONG_DETAILS,
  PULLER_STYLES,
  ZIP_STYLES,
  SURFACE_KINDS,
  WASH_KINDS,
  type ColorBlock,
  type Surface,
  type Wash,
  type Callout,
  type Colorway,
  type Design,
  type DesignData,
  type DesignInput,
  type Detail,
  type DetailArt,
  type Drawing,
  type HardwareStyle,
  type Print,
  type Tracing, BLEND_MODES, type CanvasDoc, type CanvasLayer } from '../src/shared/designs'
import { isFileKey } from './files'
import { autoVersion, dropVersions } from './versions'
import { HttpError, json, noContent, now, ownedRef, readBody, required, text, type Env } from './http'

/** /api/designs — prendas diseñadas en el Diseñador. */
export async function designsRoute(request: Request, env: Env, uid: string, id: string | undefined, url: URL) {
  if (!id && request.method === 'GET') return json(await listDesigns(env, uid, url.searchParams.get('project') ?? ''))
  if (!id && request.method === 'POST') return json(await createDesign(env, uid, await readDesign(request, env, uid)), 201)
  if (id && request.method === 'GET') return json(await getDesign(env, uid, id))
  if (id && request.method === 'PUT') return json(await updateDesign(env, uid, id, await readDesign(request, env, uid)))
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM designs WHERE id = ? AND user_id = ?').bind(id, uid).run()
    await dropVersions(env, uid, id)
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
  await autoVersion(env, uid, id, { name: d.name, template: d.template, data: JSON.stringify(d.data) })
  return getDesign(env, uid, id)
}

async function updateDesign(env: Env, uid: string, id: string, d: DesignInput) {
  const { meta } = await env.DB.prepare(
    'UPDATE designs SET name = ?, template = ?, client_id = ?, project_id = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  )
    .bind(d.name, d.template, d.clientId, d.projectId, JSON.stringify(d.data), now(), id, uid)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Diseño no encontrado')
  await autoVersion(env, uid, id, { name: d.name, template: d.template, data: JSON.stringify(d.data) })
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
  const details = Array.isArray(data.details) ? data.details.slice(0, 120).map(readDetail).filter((d): d is Detail => !!d) : []
  const hardware = readHardware(data.hardware)
  const blocks = Array.isArray(data.blocks) ? data.blocks.slice(0, 60).map(readBlock).filter((b): b is ColorBlock => !!b) : []
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
      ...(data.brandTemplate === true ? { brandTemplate: true } : {}),
      ...(details.length ? { details } : {}),
      ...(hardware ? { hardware } : {}),
      ...(blocks.length ? { blocks } : {}),
      ...(readCanvas(data.canvas) ? { canvas: readCanvas(data.canvas)! } : {}),
      ...(isFileKey(text(data.thumb)) ? { thumb: text(data.thumb) } : {}),
    },
  }
}

/** Lienzo creativo: tamaño, papel y capas (las de pintura e imágenes apuntan a archivos de KV). */
function readCanvas(raw: unknown): CanvasDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const w = Math.round(Math.min(4096, Math.max(256, finite(c.w, 2000))))
  const h = Math.round(Math.min(4096, Math.max(256, finite(c.h, 1400))))
  const layers: CanvasLayer[] = []
  for (const r of Array.isArray(c.layers) ? c.layers.slice(0, 60) : []) {
    if (!r || typeof r !== 'object') continue
    const l = r as Record<string, unknown>
    const base = {
      id: text(l.id) || crypto.randomUUID(),
      name: text(l.name).slice(0, 60) || 'Capa',
      visible: l.visible !== false,
      locked: l.locked === true,
      opacity: Math.min(1, Math.max(0, finite(l.opacity, 1))),
      blend: oneOf(l.blend, BLEND_MODES, 'normal'),
      ...(l.clip === true ? { clip: true } : {}),
      ...(l.reference === true ? { reference: true } : {}),
      ...(l.role === 'luz' || l.role === 'sombra' ? { role: l.role as 'luz' | 'sombra' } : {}),
    }
    const file = text(l.file)
    if (l.kind === 'paint') layers.push({ ...base, kind: 'paint', file: isFileKey(file) ? file : null, ...(l.alphaLock === true ? { alphaLock: true } : {}) })
    else if (l.kind === 'mockup') {
      const options: Record<string, string | boolean> = {}
      for (const [k, v] of Object.entries((l.options as Record<string, unknown>) ?? {}).slice(0, 60)) if (typeof v === 'string' || typeof v === 'boolean') options[k.slice(0, 40)] = typeof v === 'string' ? v.slice(0, 40) : v
      const pieces: Record<string, { color: string; surface?: Surface }> = {}
      for (const [k, v] of Object.entries((l.pieces as Record<string, unknown>) ?? {}).slice(0, 40)) {
        const color = hex((v as Record<string, unknown> | null)?.color, '')
        const surface = readSurface((v as Record<string, unknown> | null)?.surface)
        if (color) pieces[k.slice(0, 40)] = { color, ...(surface ? { surface } : {}) }
      }
      layers.push({
        ...base,
        kind: 'mockup',
        view: viewOf(l.view),
        x: finite(l.x, 0),
        y: finite(l.y, 0),
        w: Math.max(20, finite(l.w, 600)),
        style: l.style === 'linea' ? 'linea' : 'color',
        ...(text(l.template) ? { template: text(l.template).slice(0, 40), options, pieces } : {}),
      })
    } else if (l.kind === 'text') {
      const stroke = hex(l.stroke, '')
      layers.push({
        ...base,
        kind: 'text',
        text: text(l.text).slice(0, 400) || 'Texto',
        font: text(l.font).slice(0, 120) || 'Inter, sans-serif',
        size: Math.min(800, Math.max(4, finite(l.size, 80))),
        color: hex(l.color, '#1d1c1a'),
        x: finite(l.x, 0),
        y: finite(l.y, 0),
        rotation: finite(l.rotation, 0),
        ...(l.bold === true ? { bold: true } : {}),
        ...(l.italic === true ? { italic: true } : {}),
        ...(finite(l.letterSpacing, 0) ? { letterSpacing: Math.max(-50, Math.min(200, finite(l.letterSpacing, 0))) } : {}),
        ...(finite(l.arc, 0) ? { arc: Math.max(-100, Math.min(100, finite(l.arc, 0))) } : {}),
        ...(stroke ? { stroke, strokeWidth: Math.max(0.5, Math.min(60, finite(l.strokeWidth, 4))) } : {}),
      })
    } else if (l.kind === 'detail') {
      const detail = readDetail(l.detail)
      if (detail) layers.push({ ...base, kind: 'detail', detail, x: finite(l.x, 0), y: finite(l.y, 0), w: Math.max(4, finite(l.w, 80)), rotation: finite(l.rotation, 0) })
    }
    else if (l.kind === 'texture' && (/^[a-z0-9-]{1,30}$/.test(text(l.texture)) || isFileKey(file)))
      layers.push({
        ...base,
        kind: 'texture',
        texture: isFileKey(file) ? '' : text(l.texture),
        ...(isFileKey(file) ? { file } : {}),
        scale: Math.min(10, Math.max(0.05, finite(l.scale, 1))),
        rotation: finite(l.rotation, 0),
      })
    else if (l.kind === 'image' && (isFileKey(file) || /^\/mockups\/[a-z0-9-]+\.png$/.test(text(l.asset))))
      layers.push({ ...base, kind: 'image', file: isFileKey(file) ? file : '', ...(isFileKey(file) ? {} : { asset: text(l.asset) }), aspect: Math.max(0.05, finite(l.aspect, 1)), x: finite(l.x, 0), y: finite(l.y, 0), w: Math.max(4, finite(l.w, 400)), rotation: finite(l.rotation, 0), ...(l.flipX === true ? { flipX: true } : {}), ...(l.flipY === true ? { flipY: true } : {}) })
  }
  return { w, h, paper: hex(c.paper, '#ffffff'), layers }
}

function readPieces(raw: unknown): DesignData['pieces'] {
  const pieces: DesignData['pieces'] = {}
  if (!raw || typeof raw !== 'object') return pieces
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue
    const s = v as Record<string, unknown>
    const color = text(s.color)
    const surface = readSurface(s.surface)
    const wash = readWash(s.wash)
    pieces[k] = {
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#cccccc',
      materialId: text(s.materialId) || null,
      ...(text(s.colorName) ? { colorName: text(s.colorName).slice(0, 60) } : {}),
      ...(text(s.colorCode) ? { colorCode: text(s.colorCode).slice(0, 40) } : {}),
      ...(surface ? { surface } : {}),
      ...(wash ? { wash } : {}),
      ...(readShape(s.shape) ? { shape: readShape(s.shape)! } : {}),
    }
  }
  return pieces
}

const finite = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
const viewOf = (v: unknown) => (VIEWS.includes(v as (typeof VIEWS)[number]) ? (v as (typeof VIEWS)[number]) : 'front')

function readDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const kinds = ['free', 'line', 'rect', 'ellipse', 'triangle', 'star', 'heart', 'diamond'] as const
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
    ...(/^#[0-9a-f]{6}$/i.test(text(d.fill)) ? { fill: text(d.fill) } : {}),
    ...(d.mirror === true ? { mirror: true } : {}),
    ...(finite(d.round, 0) > 0 ? { round: Math.min(1, finite(d.round, 0)) } : {}),
    ...(finite(d.smooth, 0) > 0 ? { smooth: Math.min(4, finite(d.smooth, 0)) } : {}),
    ...(finite(d.bend, 0) ? { bend: Math.max(-400, Math.min(400, finite(d.bend, 0))) } : {}),
    ...(d.quilt === true ? { quilt: true } : {}),
    ...(d.hidden === true ? { hidden: true } : {}),
    ...(d.locked === true ? { locked: true } : {}),
  }
}

const hex = (v: unknown, def: string) => {
  const c = text(v)
  return /^#[0-9a-f]{6}$/i.test(c) ? c : def
}
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], def: T): T => (list.some((x) => x.id === v) ? (v as T) : def)

function readArt(raw: unknown): DetailArt | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const file = text(a.file)
  if (!isFileKey(file)) return null
  return { artworkId: text(a.artworkId) || null, file, aspect: Math.max(0.05, finite(a.aspect, 1)) }
}

export function readDetail(raw: unknown): Detail | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const kind = oneOf(d.kind, DETAIL_KINDS, 'boton')
  const art = readArt(d.art)
  return {
    id: text(d.id) || crypto.randomUUID(),
    view: viewOf(d.view),
    kind,
    style: text(d.style).slice(0, 20),
    ...(kind === 'cremallera' ? { puller: oneOf(d.puller, PULLER_STYLES, 'clasico') } : {}),
    ...(LONG_DETAILS.includes(kind) ? { length: Math.min(800, Math.max(4, finite(d.length, 120))) } : {}),
    x: finite(d.x, 200),
    y: finite(d.y, 200),
    w: Math.min(300, Math.max(2, finite(d.w, 10))),
    rotation: finite(d.rotation, 0),
    color: hex(d.color, '#c9c9c9'),
    color2: hex(d.color2, '#1d1c1a'),
    ...(text(d.text) ? { text: text(d.text).slice(0, 80) } : {}),
    ...(art ? { art } : {}),
    ...(d.relief === true ? { relief: true } : {}),
    ...(readShape(d.shape) ? { shape: readShape(d.shape)! } : {}),
    ...(d.mirror === true ? { mirror: true } : {}),
    ...(d.hidden === true ? { hidden: true } : {}),
    ...(d.locked === true ? { locked: true } : {}),
  }
}

/** Forma de un detalle: unos pocos números pequeños por nombre. */
function readShape(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw).slice(0, 20)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 20)] = Math.min(40, Math.max(-5, Math.round(v * 100) / 100))
  }
  return Object.keys(out).length ? out : null
}

function readHardware(raw: unknown): HardwareStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const out: HardwareStyle = {}
  if (BUTTON_STYLES.some((x) => x.id === h.buttons)) out.buttons = h.buttons as HardwareStyle['buttons']
  if (ZIP_STYLES.some((x) => x.id === h.zip)) out.zip = h.zip as HardwareStyle['zip']
  if (PULLER_STYLES.some((x) => x.id === h.puller)) out.puller = h.puller as HardwareStyle['puller']
  const ba = readArt(h.buttonArt)
  const pa = readArt(h.pullerArt)
  if (ba) out.buttonArt = ba
  if (pa) out.pullerArt = pa
  return Object.keys(out).length ? out : null
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

function readSurface(raw: unknown): Surface | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const kind = oneOf(s.kind, SURFACE_KINDS, 'liso')
  if (kind === 'liso') return null
  const art = readArt(s.art)
  return {
    kind,
    color2: hex(s.color2, '#f2efe8'),
    color3: hex(s.color3, '#1d1d1f'),
    size: Math.min(200, Math.max(0.3, finite(s.size, 4))),
    angle: Math.max(-180, Math.min(180, finite(s.angle, 0))),
    ...(art ? { art } : {}),
    ...(kind === 'imagen' && isFileKey(text(s.file)) ? { file: text(s.file) } : {}),
  }
}

function readWash(raw: unknown): Wash | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  const kind = oneOf(w.kind, WASH_KINDS, 'ninguno')
  return kind === 'ninguno' ? null : { kind, amount: Math.min(1, Math.max(0, finite(w.amount, 0.5))) }
}

function readBlock(raw: unknown): ColorBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const piece = text(b.piece).slice(0, 40)
  if (!piece) return null
  return {
    id: text(b.id) || crypto.randomUUID(),
    view: viewOf(b.view),
    piece,
    x1: finite(b.x1, 0),
    y1: finite(b.y1, 0),
    x2: finite(b.x2, 1),
    y2: finite(b.y2, 0),
    side: b.side === -1 ? -1 : 1,
    color: hex(b.color, '#f2efe8'),
    ...(text(b.colorName) ? { colorName: text(b.colorName).slice(0, 60) } : {}),
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
    ...(p.mirror === true ? { mirror: true } : {}),
    ...(p.hidden === true ? { hidden: true } : {}),
    ...(p.locked === true ? { locked: true } : {}),
    // Efectos del texto (solo los que estén puestos)
    ...(kind === 'text' && p.italic === true ? { italic: true } : {}),
    ...(kind === 'text' && p.vertical === true ? { vertical: true } : {}),
    ...(kind === 'text' && n(p.letterSpacing, 0) ? { letterSpacing: Math.max(-10, Math.min(40, n(p.letterSpacing, 0))) } : {}),
    ...(kind === 'text' && n(p.arc, 0) ? { arc: Math.max(-100, Math.min(100, n(p.arc, 0))) } : {}),
    ...(kind === 'text' && /^#[0-9a-f]{6}$/i.test(text(p.stroke)) ? { stroke: text(p.stroke), strokeWidth: Math.max(0.2, Math.min(12, n(p.strokeWidth, 1))) } : {}),
    ...(kind === 'text' && /^#[0-9a-f]{6}$/i.test(text(p.shadow)) ? { shadow: text(p.shadow), shadowOffset: Math.max(0.2, Math.min(12, n(p.shadowOffset, 1.5))) } : {}),
  }
}
