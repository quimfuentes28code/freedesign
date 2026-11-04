import type { Client, ClientInput } from '../src/shared/clients'
import { HttpError, json, noContent, now, readBody, required, text, type Env } from './http'

/** /api/clients — fichas de clientes. */
export async function clientsRoute(request: Request, env: Env, id: string | undefined, url: URL) {
  if (!id && request.method === 'GET') return json(await listClients(env, url.searchParams.get('q') ?? ''))
  if (!id && request.method === 'POST') return json(await createClient(env, await readClient(request)), 201)
  if (id && request.method === 'GET') return json(await getClient(env, id))
  if (id && request.method === 'PUT') return json(await updateClient(env, id, await readClient(request)))
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

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
  const t = now()
  await env.DB.prepare(
    `INSERT INTO clients (id, name, email, phone, instagram, city, address, birthday, preferences, notes,
       measurements, measured_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.name, c.email, c.phone, c.instagram, c.city, c.address, c.birthday, c.preferences, c.notes,
      JSON.stringify(c.measurements), c.measuredAt, t, t)
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
      JSON.stringify(c.measurements), c.measuredAt, now(), id)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Cliente no encontrado')
  return getClient(env, id)
}

/** Lee y valida los datos de un cliente que llegan en la petición. */
async function readClient(request: Request): Promise<ClientInput> {
  const body = await readBody(request)
  const measurements: Record<string, number> = {}
  for (const [k, v] of Object.entries((body.measurements as Record<string, unknown>) ?? {})) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) measurements[k] = Math.round(n * 10) / 10
  }
  return {
    name: required(body.name, 'El nombre'),
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
