import type { DesignVersion } from '../src/shared/designs'
import { deleteFile } from './files'
import { HttpError, json, now, readBody, text, type Env } from './http'

/** Cada cuánto se guarda sola una versión mientras se trabaja (al guardar el diseño). */
const AUTO_EVERY_MS = 10 * 60 * 1000
/** Versiones automáticas que se conservan por diseño (las de nombre no se borran solas). */
const KEEP_AUTO = 40

/** Claves de KV que aparecen en unos datos (las capas del lienzo, imágenes, texturas…). */
const KEY_RE = /[0-9a-f-]{36}\.(?:jpg|png|webp|gif|svg)/g
const keysOf = (data: string) => new Set(data.match(KEY_RE) ?? [])

interface Row {
  id: string
  label: string
  name: string
  template: string
  data: string
  created_at: string
}

/**
 * /api/designs/:id/versions — historial de versiones de un diseño.
 * GET → lista (sin los datos). POST { label } → guarda la versión actual con nombre.
 * POST /:vid/restore → el diseño vuelve a esa versión (antes se guarda cómo estaba, por si acaso).
 */
export async function versionsRoute(request: Request, env: Env, uid: string, designId: string, vid: string | undefined, action: string | undefined) {
  const design = await env.DB.prepare('SELECT name, template, data FROM designs WHERE id = ? AND user_id = ?')
    .bind(designId, uid)
    .first<{ name: string; template: string; data: string }>()
  if (!design) throw new HttpError(404, 'Diseño no encontrado')

  if (!vid && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, label, name, template, created_at FROM design_versions WHERE design_id = ? AND user_id = ? ORDER BY created_at DESC',
    )
      .bind(designId, uid)
      .all<Omit<Row, 'data'>>()
    return json(results.map((r) => ({ id: r.id, label: r.label, name: r.name, createdAt: r.created_at }) satisfies DesignVersion))
  }
  if (!vid && request.method === 'POST') {
    const b = await readBody(request)
    const label = text(b.label).slice(0, 80) || 'Versión guardada'
    return json(await snapshot(env, uid, designId, design, label), 201)
  }
  if (vid && action === 'restore' && request.method === 'POST') {
    const v = await env.DB.prepare('SELECT * FROM design_versions WHERE id = ? AND design_id = ? AND user_id = ?')
      .bind(vid, designId, uid)
      .first<Row>()
    if (!v) throw new HttpError(404, 'Versión no encontrada')
    await snapshot(env, uid, designId, design, 'Antes de restaurar')
    await env.DB.prepare('UPDATE designs SET name = ?, template = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(v.name, v.template, v.data, now(), designId, uid)
      .run()
    return json({ ok: true })
  }
  if (vid && !action && request.method === 'DELETE') {
    const v = await env.DB.prepare('SELECT data FROM design_versions WHERE id = ? AND design_id = ? AND user_id = ?')
      .bind(vid, designId, uid)
      .first<{ data: string }>()
    if (v) {
      await env.DB.prepare('DELETE FROM design_versions WHERE id = ? AND user_id = ?').bind(vid, uid).run()
      await dropUnused(env, uid, designId, keysOf(v.data))
    }
    return new Response(null, { status: 204 })
  }
  throw new HttpError(405, 'Método no permitido')
}

async function snapshot(env: Env, uid: string, designId: string, d: { name: string; template: string; data: string }, label: string) {
  const v: DesignVersion = { id: crypto.randomUUID(), label, name: d.name, createdAt: now() }
  await env.DB.prepare(
    'INSERT INTO design_versions (id, user_id, design_id, label, name, template, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(v.id, uid, designId, label, d.name, d.template, d.data, v.createdAt)
    .run()
  return v
}

/**
 * Al guardar un diseño: si hace más de 10 minutos de la última versión, se guarda una automática. Nunca hace fallar el
 * guardado (p. ej. si en la base de datos aún no está la tabla de versiones, migración 0013).
 */
export async function autoVersion(env: Env, uid: string, designId: string, d: { name: string; template: string; data: string }) {
  try {
    await autoVersionUnsafe(env, uid, designId, d)
  } catch (err) {
    console.error('Versión automática no guardada', err)
  }
}

async function autoVersionUnsafe(env: Env, uid: string, designId: string, d: { name: string; template: string; data: string }) {
  const last = await env.DB.prepare('SELECT MAX(created_at) AS t FROM design_versions WHERE design_id = ? AND user_id = ?')
    .bind(designId, uid)
    .first<{ t: string | null }>()
  if (last?.t && Date.now() - Date.parse(last.t) < AUTO_EVERY_MS) return
  await snapshot(env, uid, designId, d, '')
  // Se quitan las automáticas más viejas, y sus imágenes si ya nadie las usa
  const { results } = await env.DB.prepare(
    `SELECT id, data FROM design_versions WHERE design_id = ? AND user_id = ? AND label = ''
     ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  )
    .bind(designId, uid, KEEP_AUTO)
    .all<{ id: string; data: string }>()
  if (!results.length) return
  const keys = new Set<string>()
  for (const r of results) {
    await env.DB.prepare('DELETE FROM design_versions WHERE id = ? AND user_id = ?').bind(r.id, uid).run()
    keysOf(r.data).forEach((k) => keys.add(k))
  }
  await dropUnused(env, uid, designId, keys)
}

/** Borra de KV las imágenes que ya no usan ni el diseño ni ninguna de sus versiones. */
async function dropUnused(env: Env, uid: string, designId: string, keys: Set<string>) {
  if (!keys.size) return
  const current = await env.DB.prepare('SELECT data FROM designs WHERE id = ? AND user_id = ?').bind(designId, uid).first<{ data: string }>()
  const { results } = await env.DB.prepare('SELECT data FROM design_versions WHERE design_id = ? AND user_id = ?')
    .bind(designId, uid)
    .all<{ data: string }>()
  const used = new Set<string>()
  for (const d of [current?.data ?? '', ...results.map((r) => r.data)]) keysOf(d).forEach((k) => used.add(k))
  for (const k of keys) if (!used.has(k)) await deleteFile(env, uid, k)
}

/** ¿Alguna versión guardada usa esta imagen? (entonces no se borra aunque el diseño ya no la use) */
export async function usedByVersion(env: Env, uid: string, key: string) {
  try {
    const row = await env.DB.prepare('SELECT 1 AS x FROM design_versions WHERE user_id = ? AND instr(data, ?) > 0 LIMIT 1').bind(uid, key).first()
    return !!row
  } catch {
    // Sin tabla de versiones: nada la usa
    return false
  }
}

/** Al eliminar un diseño se van también sus versiones. */
export async function dropVersions(env: Env, uid: string, designId: string) {
  await env.DB.prepare('DELETE FROM design_versions WHERE design_id = ? AND user_id = ?')
    .bind(designId, uid)
    .run()
    .catch(() => {})
}
