/**
 * API de FreeDesign (Cloudflare Worker). Atiende /api/*; el resto de rutas las sirve la web estática.
 * Los datos se guardan en la base de datos D1 (binding DB).
 */
import type { Client, ClientInput } from '../src/shared/clients'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** Correos con acceso, separados por comas. Vacío = sin comprobación (desarrollo local). */
  ALLOWED_EMAILS: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const denied = checkAccess(request, env)
    if (denied) return denied

    try {
      return await route(request, env, url)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Error inesperado en el servidor' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

/**
 * En producción la app va detrás de Cloudflare Access, que añade el correo de quien ha iniciado sesión.
 * Aquí comprobamos que es uno de los permitidos (defensa extra por si alguien llega al Worker directamente).
 */
function checkAccess(request: Request, env: Env) {
  const allowed = env.ALLOWED_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (allowed.length === 0) return null
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase()
  return email && allowed.includes(email) ? null : json({ error: 'Sin acceso' }, 403)
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean) // ['api', 'clients', id?]
  const [, resource, id] = parts

  if (resource === 'clients') {
    if (!id && request.method === 'GET') return json(await listClients(env, url.searchParams.get('q') ?? ''))
    if (!id && request.method === 'POST') return json(await createClient(env, await readClient(request)), 201)
    if (id && request.method === 'GET') return json(await getClient(env, id))
    if (id && request.method === 'PUT') return json(await updateClient(env, id, await readClient(request)))
    if (id && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204 })
    }
  }
  if (resource === 'stats' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS clients FROM clients').first<{ clients: number }>()
    return json({ clients: row?.clients ?? 0 })
  }
  throw new HttpError(404, 'No encontrado')
}

// --- Clientes ---

interface ClientRow {
  id: string
  name: string
  email: string
  phone: string
  instagram: string
  city: string
  address: string
  birthday: string
  preferences: string
  notes: string
  measurements: string
  measured_at: string
  created_at: string
  updated_at: string
}

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    instagram: r.instagram,
    city: r.city,
    address: r.address,
    birthday: r.birthday,
    preferences: r.preferences,
    notes: r.notes,
    measurements: JSON.parse(r.measurements || '{}'),
    measuredAt: r.measured_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listClients(env: Env, q: string) {
  const term = `%${q.trim()}%`
  const { results } = await env.DB.prepare(
    `SELECT * FROM clients
     WHERE name LIKE ?1 OR email LIKE ?1 OR instagram LIKE ?1 OR city LIKE ?1
     ORDER BY name COLLATE NOCASE`,
  )
    .bind(term)
    .all<ClientRow>()
  return results.map(toClient)
}

async function getClient(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first<ClientRow>()
  if (!row) throw new HttpError(404, 'Cliente no encontrado')
  return toClient(row)
}

async function createClient(env: Env, c: ClientInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO clients (id, name, email, phone, instagram, city, address, birthday, preferences, notes,
       measurements, measured_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.name, c.email, c.phone, c.instagram, c.city, c.address, c.birthday, c.preferences, c.notes,
      JSON.stringify(c.measurements), c.measuredAt, now, now)
    .run()
  return getClient(env, id)
}

async function updateClient(env: Env, id: string, c: ClientInput) {
  const { meta } = await env.DB.prepare(
    `UPDATE clients SET name = ?, email = ?, phone = ?, instagram = ?, city = ?, address = ?, birthday = ?,
       preferences = ?, notes = ?, measurements = ?, measured_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(c.name, c.email, c.phone, c.instagram, c.city, c.address, c.birthday, c.preferences, c.notes,
      JSON.stringify(c.measurements), c.measuredAt, new Date().toISOString(), id)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Cliente no encontrado')
  return getClient(env, id)
}

/** Lee y valida los datos de un cliente que llegan en la petición. */
async function readClient(request: Request): Promise<ClientInput> {
  const body = (await request.json().catch(() => null)) as Partial<ClientInput> | null
  if (!body || typeof body.name !== 'string' || !body.name.trim()) throw new HttpError(400, 'El nombre es obligatorio')
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const measurements: Record<string, number> = {}
  for (const [k, v] of Object.entries(body.measurements ?? {})) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) measurements[k] = Math.round(n * 10) / 10
  }
  return {
    name: body.name.trim(),
    email: text(body.email),
    phone: text(body.phone),
    instagram: text(body.instagram),
    city: text(body.city),
    address: text(body.address),
    birthday: text(body.birthday),
    preferences: text(body.preferences),
    notes: text(body.notes),
    measurements,
    measuredAt: text(body.measuredAt),
  }
}

// --- Utilidades ---

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
