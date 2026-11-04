import {
  FILE_CATEGORIES,
  PROJECT_STATUSES,
  type Collection,
  type CollectionInput,
  type FileCategory,
  type Project,
  type ProjectInput,
  type ProjectStatus,
  type ProjectSummary,
} from '../src/shared/projects'
import { deleteFile, isFileKey } from './files'
import { HttpError, json, noContent, now, num, readBody, required, text, type Env } from './http'

const uuid = () => crypto.randomUUID()

// --- Proyectos: /api/projects[/:id[/:sub[/:subId]]] ---

export async function projectsRoute(request: Request, env: Env, rest: string[], url: URL) {
  const [id, sub, subId] = rest
  const m = request.method
  if (!id) {
    if (m === 'GET') return json(await listProjects(env, url.searchParams))
    if (m === 'POST') {
      const p = await readProject(request)
      const newId = uuid()
      const t = now()
      await env.DB.prepare(
        `INSERT INTO projects (id, name, status, client_id, collection_id, description, notes, due_date, price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(newId, p.name, p.status, p.clientId, p.collectionId, p.description, p.notes, p.dueDate, p.price, t, t)
        .run()
      return json(await getProject(env, newId), 201)
    }
  } else if (!sub) {
    if (m === 'GET') return json(await getProject(env, id))
    if (m === 'PUT') {
      const p = await readProject(request)
      const { meta } = await env.DB.prepare(
        `UPDATE projects SET name = ?, status = ?, client_id = ?, collection_id = ?, description = ?, notes = ?, due_date = ?, price = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(p.name, p.status, p.clientId, p.collectionId, p.description, p.notes, p.dueDate, p.price, now(), id)
        .run()
      if (meta.changes === 0) throw new HttpError(404, 'Proyecto no encontrado')
      return json(await getProject(env, id))
    }
    if (m === 'PATCH') {
      // Cambio rápido de fase (desde el tablero)
      const b = await readBody(request)
      const status = readStatus(b.status)
      await env.DB.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run()
      return json(await getProject(env, id))
    }
    if (m === 'DELETE') {
      const { results } = await env.DB.prepare('SELECT file FROM project_files WHERE project_id = ?').bind(id).all<{ file: string }>()
      await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
      for (const f of results) await deleteFile(env, f.file)
      return noContent()
    }
  } else {
    await touch(env, id)
    switch (sub) {
      case 'files':
        return projectFiles(request, env, id, subId)
      case 'materials':
        return projectMaterials(request, env, id, subId)
      case 'costs':
        return projectCosts(request, env, id, subId)
      case 'tasks':
        return projectTasks(request, env, id, subId)
    }
  }
  throw new HttpError(405, 'Método no permitido')
}

/** Marca el proyecto como modificado (y comprueba que existe). */
async function touch(env: Env, id: string) {
  const { meta } = await env.DB.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').bind(now(), id).run()
  if (meta.changes === 0) throw new HttpError(404, 'Proyecto no encontrado')
}

const SUMMARY_SELECT = `
  SELECT p.*, c.name AS client_name, col.name AS collection_name,
    (SELECT COALESCE(SUM(pm.quantity * COALESCE(mt.price, 0)), 0) FROM project_materials pm JOIN materials mt ON mt.id = pm.material_id WHERE pm.project_id = p.id)
      + (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) AS cost,
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND done = 0) AS tasks_open,
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) AS tasks_total,
    (SELECT file FROM project_files WHERE project_id = p.id
      ORDER BY CASE category WHEN 'final' THEN 0 WHEN 'foto' THEN 1 WHEN 'boceto' THEN 2 ELSE 3 END, created_at LIMIT 1) AS cover,
    (SELECT COUNT(*) FROM designs WHERE project_id = p.id) AS designs
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN collections col ON col.id = p.collection_id`

interface SummaryRow {
  id: string
  name: string
  status: ProjectStatus
  client_id: string | null
  client_name: string | null
  collection_id: string | null
  collection_name: string | null
  description: string
  notes: string
  due_date: string
  price: number | null
  cost: number
  tasks_open: number
  tasks_total: number
  cover: string | null
  designs: number
  created_at: string
  updated_at: string
}

function toSummary(r: SummaryRow): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    clientId: r.client_id,
    clientName: r.client_name ?? undefined,
    collectionId: r.collection_id,
    collectionName: r.collection_name ?? undefined,
    dueDate: r.due_date,
    price: r.price,
    cost: Math.round(r.cost * 100) / 100,
    tasksOpen: r.tasks_open,
    tasksTotal: r.tasks_total,
    cover: r.cover,
    designs: r.designs,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listProjects(env: Env, params: URLSearchParams) {
  const q = `%${(params.get('q') ?? '').trim()}%`
  const { results } = await env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE (?1 = '' OR p.status = ?1) AND (?2 = '' OR p.client_id = ?2) AND (?3 = '' OR p.collection_id = ?3)
       AND (p.name LIKE ?4 OR c.name LIKE ?4 OR col.name LIKE ?4)
     ORDER BY p.updated_at DESC`,
  )
    .bind(params.get('status') ?? '', params.get('client') ?? '', params.get('collection') ?? '', q)
    .all<SummaryRow>()
  return results.map(toSummary)
}

async function getProject(env: Env, id: string): Promise<Project> {
  const row = await env.DB.prepare(`${SUMMARY_SELECT} WHERE p.id = ?`).bind(id).first<SummaryRow>()
  if (!row) throw new HttpError(404, 'Proyecto no encontrado')
  const [files, materials, costs, tasks] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at').bind(id),
    env.DB.prepare(
      `SELECT pm.*, m.name, m.category, m.price, m.price_unit, m.photo FROM project_materials pm
       JOIN materials m ON m.id = pm.material_id WHERE pm.project_id = ? ORDER BY pm.created_at`,
    ).bind(id),
    env.DB.prepare('SELECT * FROM project_costs WHERE project_id = ? ORDER BY created_at').bind(id),
    env.DB.prepare('SELECT * FROM project_tasks WHERE project_id = ? ORDER BY done, CASE due_date WHEN \'\' THEN 1 ELSE 0 END, due_date, created_at').bind(id),
  ])
  type R = Record<string, unknown>
  return {
    ...toSummary(row),
    description: row.description,
    notes: row.notes,
    files: (files.results as R[]).map((f) => ({
      id: f.id as string,
      category: f.category as FileCategory,
      file: f.file as string,
      name: f.name as string,
      createdAt: f.created_at as string,
    })),
    materials: (materials.results as R[]).map((x) => ({
      id: x.id as string,
      materialId: x.material_id as string,
      quantity: x.quantity as number,
      notes: x.notes as string,
      name: x.name as string,
      category: x.category as string,
      price: x.price as number | null,
      priceUnit: x.price_unit as Project['materials'][number]['priceUnit'],
      photo: x.photo as string,
    })),
    costs: (costs.results as R[]).map((c) => ({ id: c.id as string, label: c.label as string, amount: c.amount as number })),
    tasks: (tasks.results as R[]).map((t) => ({ id: t.id as string, title: t.title as string, done: t.done === 1, dueDate: t.due_date as string })),
  }
}

function readStatus(v: unknown): ProjectStatus {
  const s = text(v) as ProjectStatus
  if (!PROJECT_STATUSES.some((x) => x.id === s)) throw new HttpError(400, 'Fase no válida')
  return s
}

async function readProject(request: Request): Promise<ProjectInput> {
  const b = await readBody(request)
  return {
    name: required(b.name, 'El nombre'),
    status: readStatus(b.status ?? 'idea'),
    clientId: text(b.clientId) || null,
    collectionId: text(b.collectionId) || null,
    description: text(b.description),
    notes: text(b.notes),
    dueDate: text(b.dueDate),
    price: num(b.price),
  }
}

// --- Partes de un proyecto ---

async function projectFiles(request: Request, env: Env, projectId: string, id: string | undefined) {
  if (!id && request.method === 'POST') {
    const b = await readBody(request)
    const file = text(b.file)
    if (!isFileKey(file)) throw new HttpError(400, 'Archivo no válido')
    const category = FILE_CATEGORIES.some((c) => c.id === b.category) ? (b.category as FileCategory) : 'otro'
    await env.DB.prepare('INSERT INTO project_files (id, project_id, category, file, name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uuid(), projectId, category, file, text(b.name), now())
      .run()
    return json(await getProject(env, projectId), 201)
  }
  if (id && request.method === 'PUT') {
    const b = await readBody(request)
    const category = FILE_CATEGORIES.some((c) => c.id === b.category) ? (b.category as FileCategory) : 'otro'
    await env.DB.prepare('UPDATE project_files SET category = ?, name = ? WHERE id = ? AND project_id = ?')
      .bind(category, text(b.name), id, projectId)
      .run()
    return json(await getProject(env, projectId))
  }
  if (id && request.method === 'DELETE') {
    const row = await env.DB.prepare('SELECT file FROM project_files WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ file: string }>()
    await env.DB.prepare('DELETE FROM project_files WHERE id = ? AND project_id = ?').bind(id, projectId).run()
    if (row) await deleteFile(env, row.file)
    return json(await getProject(env, projectId))
  }
  throw new HttpError(405, 'Método no permitido')
}

async function projectMaterials(request: Request, env: Env, projectId: string, id: string | undefined) {
  if (!id && request.method === 'POST') {
    const b = await readBody(request)
    const materialId = required(b.materialId, 'El material')
    await env.DB.prepare('INSERT INTO project_materials (id, project_id, material_id, quantity, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uuid(), projectId, materialId, num(b.quantity) ?? 1, text(b.notes), now())
      .run()
    return json(await getProject(env, projectId), 201)
  }
  if (id && request.method === 'PUT') {
    const b = await readBody(request)
    await env.DB.prepare('UPDATE project_materials SET quantity = ?, notes = ? WHERE id = ? AND project_id = ?')
      .bind(num(b.quantity) ?? 0, text(b.notes), id, projectId)
      .run()
    return json(await getProject(env, projectId))
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM project_materials WHERE id = ? AND project_id = ?').bind(id, projectId).run()
    return json(await getProject(env, projectId))
  }
  throw new HttpError(405, 'Método no permitido')
}

async function projectCosts(request: Request, env: Env, projectId: string, id: string | undefined) {
  if (!id && request.method === 'POST') {
    const b = await readBody(request)
    await env.DB.prepare('INSERT INTO project_costs (id, project_id, label, amount, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), projectId, required(b.label, 'El concepto'), num(b.amount) ?? 0, now())
      .run()
    return json(await getProject(env, projectId), 201)
  }
  if (id && request.method === 'PUT') {
    const b = await readBody(request)
    await env.DB.prepare('UPDATE project_costs SET label = ?, amount = ? WHERE id = ? AND project_id = ?')
      .bind(required(b.label, 'El concepto'), num(b.amount) ?? 0, id, projectId)
      .run()
    return json(await getProject(env, projectId))
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM project_costs WHERE id = ? AND project_id = ?').bind(id, projectId).run()
    return json(await getProject(env, projectId))
  }
  throw new HttpError(405, 'Método no permitido')
}

async function projectTasks(request: Request, env: Env, projectId: string, id: string | undefined) {
  if (!id && request.method === 'POST') {
    const b = await readBody(request)
    await env.DB.prepare('INSERT INTO project_tasks (id, project_id, title, done, due_date, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .bind(uuid(), projectId, required(b.title, 'La tarea'), text(b.dueDate), now())
      .run()
    return json(await getProject(env, projectId), 201)
  }
  if (id && request.method === 'PUT') {
    const b = await readBody(request)
    await env.DB.prepare('UPDATE project_tasks SET title = ?, done = ?, due_date = ? WHERE id = ? AND project_id = ?')
      .bind(required(b.title, 'La tarea'), b.done === true ? 1 : 0, text(b.dueDate), id, projectId)
      .run()
    return json(await getProject(env, projectId))
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM project_tasks WHERE id = ? AND project_id = ?').bind(id, projectId).run()
    return json(await getProject(env, projectId))
  }
  throw new HttpError(405, 'Método no permitido')
}

// --- Tareas pendientes de todos los proyectos (Dashboard): /api/tasks ---

export async function openTasks(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.due_date, p.id AS project_id, p.name AS project_name FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.done = 0 AND p.status NOT IN ('entregado', 'cancelado')
     ORDER BY CASE t.due_date WHEN '' THEN 1 ELSE 0 END, t.due_date, t.created_at LIMIT 20`,
  ).all<{ id: string; title: string; due_date: string; project_id: string; project_name: string }>()
  return results.map((r) => ({ id: r.id, title: r.title, dueDate: r.due_date, projectId: r.project_id, projectName: r.project_name }))
}

// --- Colecciones: /api/collections ---

export async function collectionsRoute(request: Request, env: Env, id: string | undefined) {
  const SELECT = `SELECT col.*, (SELECT COUNT(*) FROM projects p WHERE p.collection_id = col.id) AS projects FROM collections col`
  type Row = { id: string; name: string; season: string; description: string; projects: number; created_at: string; updated_at: string }
  const toCollection = (r: Row): Collection => ({
    id: r.id,
    name: r.name,
    season: r.season,
    description: r.description,
    projects: r.projects,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })
  const read = async (): Promise<CollectionInput> => {
    const b = await readBody(request)
    return { name: required(b.name, 'El nombre'), season: text(b.season), description: text(b.description) }
  }
  const get = async (cid: string) => {
    const row = await env.DB.prepare(`${SELECT} WHERE col.id = ?`).bind(cid).first<Row>()
    if (!row) throw new HttpError(404, 'Colección no encontrada')
    return toCollection(row)
  }

  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare(`${SELECT} ORDER BY col.created_at DESC`).all<Row>()
    return json(results.map(toCollection))
  }
  if (!id && request.method === 'POST') {
    const c = await read()
    const newId = uuid()
    const t = now()
    await env.DB.prepare('INSERT INTO collections (id, name, season, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId, c.name, c.season, c.description, t, t)
      .run()
    return json(await get(newId), 201)
  }
  if (id && request.method === 'GET') return json(await get(id))
  if (id && request.method === 'PUT') {
    const c = await read()
    await env.DB.prepare('UPDATE collections SET name = ?, season = ?, description = ?, updated_at = ? WHERE id = ?')
      .bind(c.name, c.season, c.description, now(), id)
      .run()
    return json(await get(id))
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}
