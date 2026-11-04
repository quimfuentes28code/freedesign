import {
  EMPTY_TECH_PACK,
  ORDER_KINDS,
  SIZES,
  type ConstructionRow,
  type OrderKind,
  type OrderStep,
  type ProductionOrder,
  type ProductionOrderInput,
  type SpecColumn,
  type TechPack,
  type TechPackData,
} from '../src/shared/production'
import { HttpError, json, noContent, now, num, ownedRef, readBody, required, text, type Env } from './http'

const COLUMNS: SpecColumn[] = [...SIZES, 'cliente']
const isColumn = (v: string): v is SpecColumn => (COLUMNS as string[]).includes(v)
const isSize = (v: unknown): v is (typeof SIZES)[number] => (SIZES as readonly unknown[]).includes(v)
const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

// --- Fichas técnicas: /api/techpacks[/:projectId] ---

export async function techPacksRoute(request: Request, env: Env, uid: string, projectId: string | undefined) {
  const m = request.method
  if (!projectId && m === 'GET') {
    // Qué proyectos tienen ficha guardada (para la lista de Producción)
    const { results } = await env.DB.prepare('SELECT project_id, version, updated_at FROM tech_packs WHERE user_id = ?')
      .bind(uid)
      .all<{ project_id: string; version: number; updated_at: string }>()
    return json(results.map((r) => ({ projectId: r.project_id, version: r.version, updatedAt: r.updated_at })))
  }
  if (projectId && m === 'GET') return json(await getTechPack(env, uid, projectId))
  if (projectId && m === 'PUT') {
    await ownedRef(env, 'projects', projectId, uid, 'El proyecto')
    const b = await readBody(request)
    const designId = await ownedRef(env, 'designs', text(b.designId) || null, uid, 'El diseño')
    const data = JSON.stringify(readTechPackData(b.data))
    if (data.length > 200_000) throw new HttpError(400, 'La ficha es demasiado grande')
    const t = now()
    await env.DB.prepare(
      `INSERT INTO tech_packs (project_id, user_id, design_id, data, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
       ON CONFLICT (project_id) DO UPDATE SET design_id = ?3, data = ?4, version = version + 1, updated_at = ?5`,
    )
      .bind(projectId, uid, designId, data, t)
      .run()
    return json(await getTechPack(env, uid, projectId))
  }
  throw new HttpError(405, 'Método no permitido')
}

/** Ficha guardada de un proyecto, o null si aún no se ha guardado ninguna. */
async function getTechPack(env: Env, uid: string, projectId: string): Promise<TechPack | null> {
  const r = await env.DB.prepare('SELECT * FROM tech_packs WHERE project_id = ? AND user_id = ?')
    .bind(projectId, uid)
    .first<{ project_id: string; design_id: string | null; data: string; version: number; created_at: string; updated_at: string }>()
  if (!r) return null
  return {
    projectId: r.project_id,
    designId: r.design_id,
    data: { ...EMPTY_TECH_PACK, ...(JSON.parse(r.data || '{}') as Partial<TechPackData>) },
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function readTechPackData(v: unknown): TechPackData {
  const d = obj(v)
  const sizes = arr(d.sizes).filter(isSize)
  const overrides: TechPackData['overrides'] = {}
  for (const [col, values] of Object.entries(obj(d.overrides))) {
    if (!isColumn(col)) continue
    const row: Record<string, number> = {}
    for (const [k, n] of Object.entries(obj(values))) {
      const value = num(n)
      if (value !== null) row[k.slice(0, 40)] = Math.round(value * 10) / 10
    }
    overrides[col] = row
  }
  const construction =
    d.construction === null
      ? null
      : arr(d.construction).map(
          (r, i): ConstructionRow => {
            const x = obj(r)
            return { id: text(x.id) || `c${i}`, area: text(x.area), operation: text(x.operation), machine: text(x.machine), notes: text(x.notes) }
          },
        )
  return {
    mode: d.mode === 'cliente' ? 'cliente' : 'tallas',
    sizes: sizes.length ? SIZES.filter((s) => sizes.includes(s)) : EMPTY_TECH_PACK.sizes,
    baseSize: isSize(d.baseSize) ? d.baseSize : 'M',
    overrides,
    construction,
    assembly: d.assembly === null ? null : arr(d.assembly).map(text).filter(Boolean),
    labels: text(d.labels),
    packaging: text(d.packaging),
    notes: text(d.notes),
  }
}

// --- Órdenes de fabricación: /api/production[/:id] ---

export async function productionRoute(request: Request, env: Env, uid: string, id: string | undefined, url: URL) {
  const m = request.method
  if (!id && m === 'GET') return json(await listOrders(env, uid, url.searchParams.get('project') ?? ''))
  if (!id && m === 'POST') {
    const o = await readOrder(request, env, uid)
    const newId = crypto.randomUUID()
    const t = now()
    await env.DB.prepare(
      `INSERT INTO production_orders (id, user_id, project_id, kind, supplier_id, workshop, quantities, start_date, due_date, steps, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId, uid, o.projectId, o.kind, o.supplierId, o.workshop, JSON.stringify(o.quantities), o.startDate, o.dueDate, JSON.stringify(o.steps), o.notes, t, t)
      .run()
    return json(await getOrder(env, uid, newId), 201)
  }
  if (id && m === 'GET') return json(await getOrder(env, uid, id))
  if (id && m === 'PUT') {
    const o = await readOrder(request, env, uid)
    const { meta } = await env.DB.prepare(
      `UPDATE production_orders SET project_id = ?, kind = ?, supplier_id = ?, workshop = ?, quantities = ?, start_date = ?, due_date = ?,
         steps = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
      .bind(o.projectId, o.kind, o.supplierId, o.workshop, JSON.stringify(o.quantities), o.startDate, o.dueDate, JSON.stringify(o.steps), o.notes, now(), id, uid)
      .run()
    if (meta.changes === 0) throw new HttpError(404, 'Orden no encontrada')
    return json(await getOrder(env, uid, id))
  }
  if (id && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM production_orders WHERE id = ? AND user_id = ?').bind(id, uid).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface OrderRow {
  id: string
  project_id: string
  project_name: string | null
  client_name: string | null
  kind: OrderKind
  supplier_id: string | null
  supplier_name: string | null
  workshop: string
  quantities: string
  start_date: string
  due_date: string
  steps: string
  notes: string
  created_at: string
  updated_at: string
}

const SELECT = `SELECT o.*, p.name AS project_name, c.name AS client_name, s.name AS supplier_name FROM production_orders o
  JOIN projects p ON p.id = o.project_id LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN suppliers s ON s.id = o.supplier_id`

function toOrder(r: OrderRow): ProductionOrder {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name ?? undefined,
    clientName: r.client_name ?? undefined,
    kind: r.kind,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name ?? undefined,
    workshop: r.workshop,
    quantities: JSON.parse(r.quantities || '{}'),
    startDate: r.start_date,
    dueDate: r.due_date,
    steps: JSON.parse(r.steps || '[]'),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listOrders(env: Env, uid: string, project: string) {
  const { results } = await env.DB.prepare(
    `${SELECT} WHERE o.user_id = ?1 AND (?2 = '' OR o.project_id = ?2)
     ORDER BY CASE o.due_date WHEN '' THEN 1 ELSE 0 END, o.due_date, o.created_at DESC`,
  )
    .bind(uid, project)
    .all<OrderRow>()
  return results.map(toOrder)
}

async function getOrder(env: Env, uid: string, id: string) {
  const r = await env.DB.prepare(`${SELECT} WHERE o.id = ? AND o.user_id = ?`).bind(id, uid).first<OrderRow>()
  if (!r) throw new HttpError(404, 'Orden no encontrada')
  return toOrder(r)
}

async function readOrder(request: Request, env: Env, uid: string): Promise<ProductionOrderInput> {
  const b = await readBody(request)
  const projectId = (await ownedRef(env, 'projects', required(b.projectId, 'El proyecto'), uid, 'El proyecto'))!
  const quantities: ProductionOrderInput['quantities'] = {}
  for (const [col, n] of Object.entries(obj(b.quantities))) {
    const value = num(n)
    if (isColumn(col) && value) quantities[col] = Math.round(value)
  }
  const steps = arr(b.steps)
    .map((s, i): OrderStep => {
      const x = obj(s)
      return { id: text(x.id) || `paso-${i + 1}`, label: text(x.label), done: x.done === true, doneAt: x.done === true ? text(x.doneAt) : '' }
    })
    .filter((s) => s.label)
  return {
    projectId,
    kind: ORDER_KINDS.some((k) => k.id === b.kind) ? (b.kind as OrderKind) : 'produccion',
    supplierId: await ownedRef(env, 'suppliers', text(b.supplierId) || null, uid, 'El taller'),
    workshop: text(b.workshop),
    quantities,
    startDate: text(b.startDate),
    dueDate: text(b.dueDate),
    steps,
    notes: text(b.notes),
  }
}
