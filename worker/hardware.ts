import type { HardwarePreset } from '../src/shared/designs'
import { readDetail } from './designs'
import { HttpError, json, noContent, now, readBody, required, type Env } from './http'

/** /api/hardware — fornituras propias guardadas (para la biblioteca del lienzo). */
export async function hardwareRoute(request: Request, env: Env, uid: string, id: string | undefined) {
  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM hardware_presets WHERE user_id = ? ORDER BY created_at DESC').bind(uid).all<Row>()
    return json(results.map(toPreset))
  }
  if (!id && request.method === 'POST') {
    const b = (await readBody(request)) as Record<string, unknown>
    const name = required(b.name, 'El nombre').slice(0, 60)
    const detail = readDetail(b.detail)
    if (!detail) throw new HttpError(400, 'La fornitura no es válida')
    const row: Row = { id: crypto.randomUUID(), name, detail: JSON.stringify(detail), created_at: now() }
    await env.DB.prepare('INSERT INTO hardware_presets (id, user_id, name, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, uid, row.name, row.detail, row.created_at).run()
    return json(toPreset(row), 201)
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM hardware_presets WHERE id = ? AND user_id = ?').bind(id, uid).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface Row {
  id: string
  name: string
  detail: string
  created_at: string
}

function toPreset(r: Row): HardwarePreset {
  return { id: r.id, name: r.name, detail: JSON.parse(r.detail), createdAt: r.created_at }
}
