/** Utilidades comunes de la API. */

export interface Env {
  DB: D1Database
  /** Almacén de archivos (fotos de materiales, y más adelante bocetos, estampados…). */
  FILES: KVNamespace
  ASSETS: Fetcher
  /** Correos con acceso, separados por comas. Vacío = sin comprobación (desarrollo local). */
  ALLOWED_EMAILS: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export const noContent = () => new Response(null, { status: 204 })

/** Cuerpo JSON de la petición, o error 400 si no lo es. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Datos no válidos')
  return body as Record<string, unknown>
}

/** Texto recortado (vacío si no es texto). */
export const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Número positivo o null. */
export function num(v: unknown) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Texto obligatorio. */
export function required(v: unknown, field: string) {
  const t = text(v)
  if (!t) throw new HttpError(400, `${field} es obligatorio`)
  return t
}

export const now = () => new Date().toISOString()
