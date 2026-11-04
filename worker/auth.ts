import { ACCOUNT_TYPES, MIN_PASSWORD, type AccountType, type ProfileInput, type User } from '../src/shared/users'
import { HttpError, json, now, readBody, required, text, type Env } from './http'

/**
 * Cuentas y sesiones: /api/auth/*
 * - Contraseñas con PBKDF2-SHA256 (Web Crypto, sin librerías).
 * - La sesión es un token aleatorio en una cookie HttpOnly; en la base de datos solo guardamos su hash.
 */

const COOKIE = 'fd_session'
const SESSION_DAYS = 30
const PBKDF2_ITERATIONS = 100_000 // máximo que admite Workers

export async function authRoute(request: Request, env: Env, action: string | undefined, url: URL): Promise<Response> {
  const m = request.method
  if (action === 'register' && m === 'POST') return register(request, env, url)
  if (action === 'login' && m === 'POST') return login(request, env, url)
  if (action === 'logout' && m === 'POST') {
    const token = readCookie(request)
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
    return withCookie(json({ ok: true }), clearCookie(url))
  }
  if (action === 'me') {
    const user = await currentUser(request, env)
    if (!user) throw new HttpError(401, 'Inicia sesión para continuar')
    if (m === 'GET') return json(user)
    if (m === 'PUT') return json(await updateProfile(env, user.id, readProfile(await readBody(request))))
  }
  if (action === 'password' && m === 'PUT') {
    const user = await currentUser(request, env)
    if (!user) throw new HttpError(401, 'Inicia sesión para continuar')
    const b = await readBody(request)
    const row = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(user.id).first<PasswordRow>()
    if (!row || !(await checkPassword(text(b.current), row))) throw new HttpError(400, 'La contraseña actual no es correcta')
    const { hash, salt } = await hashPassword(readPassword(b.password))
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').bind(hash, salt, now(), user.id),
      // Cierra las demás sesiones abiertas (otros dispositivos)
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, await sha256(readCookie(request) ?? '')),
    ])
    return json({ ok: true })
  }
  throw new HttpError(404, 'No encontrado')
}

/** Cuenta con la sesión iniciada en esta petición, o null. */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first<UserRow>()
  return row ? toUser(row) : null
}

// --- Registro e inicio de sesión ---

async function register(request: Request, env: Env, url: URL) {
  const b = await readBody(request)
  const email = readEmail(b.email)
  const password = readPassword(b.password)
  const profile = readProfile(b)
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (exists) throw new HttpError(409, 'Ya hay una cuenta con ese email. Prueba a iniciar sesión.')

  const { hash, salt } = await hashPassword(password)
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, account_type, name, company_name, tax_id, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, hash, salt, profile.accountType, profile.name, profile.companyName, profile.taxId, profile.phone, t, t)
    .run()
  const cookie = await startSession(env, id, url)
  return withCookie(json(await getUser(env, id), 201), cookie)
}

async function login(request: Request, env: Env, url: URL) {
  const b = await readBody(request)
  const email = text(b.email).toLowerCase()
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow & PasswordRow>()
  // Si no existe calculamos igualmente un hash, para no revelar por el tiempo de respuesta qué emails tienen cuenta
  const ok = row ? await checkPassword(text(b.password), row) : (await hashPassword(text(b.password)), false)
  if (!row || !ok) throw new HttpError(401, 'Email o contraseña incorrectos')
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').bind(row.id, now()).run()
  const cookie = await startSession(env, row.id, url)
  return withCookie(json(toUser(row)), cookie)
}

async function startSession(env: Env, userId: string, url: URL) {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, expires.toISOString(), now())
    .run()
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`
}

const clearCookie = (url: URL) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`

function withCookie(res: Response, cookie: string) {
  res.headers.append('Set-Cookie', cookie)
  return res
}

function readCookie(request: Request) {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=') || null
  }
  return null
}

// --- Perfil ---

interface UserRow {
  id: string
  email: string
  account_type: AccountType
  name: string
  company_name: string
  tax_id: string
  phone: string
  created_at: string
}

interface PasswordRow {
  password_hash: string
  password_salt: string
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    accountType: r.account_type,
    name: r.name,
    companyName: r.company_name,
    taxId: r.tax_id,
    phone: r.phone,
    createdAt: r.created_at,
  }
}

async function getUser(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  if (!row) throw new HttpError(404, 'Cuenta no encontrada')
  return toUser(row)
}

async function updateProfile(env: Env, id: string, p: ProfileInput) {
  await env.DB.prepare('UPDATE users SET account_type = ?, name = ?, company_name = ?, tax_id = ?, phone = ?, updated_at = ? WHERE id = ?')
    .bind(p.accountType, p.name, p.companyName, p.taxId, p.phone, now(), id)
    .run()
  return getUser(env, id)
}

function readProfile(b: Record<string, unknown>): ProfileInput {
  const accountType = ACCOUNT_TYPES.some((t) => t.id === b.accountType) ? (b.accountType as AccountType) : 'particular'
  const isCompany = accountType === 'empresa'
  return {
    accountType,
    name: required(b.name, 'El nombre').slice(0, 120),
    companyName: isCompany ? required(b.companyName, 'El nombre de la empresa').slice(0, 160) : '',
    taxId: isCompany ? text(b.taxId).toUpperCase().slice(0, 20) : '',
    phone: text(b.phone).slice(0, 30),
  }
}

function readEmail(v: unknown) {
  const email = text(v).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'El email no es válido')
  return email
}

function readPassword(v: unknown) {
  const p = typeof v === 'string' ? v : ''
  if (p.length < MIN_PASSWORD) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
  if (p.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga')
  return p
}

// --- Criptografía ---

async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256)
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt) }
}

async function checkPassword(password: string, row: PasswordRow) {
  const { hash } = await hashPassword(password, row.password_salt)
  return timingSafeEqual(hash, row.password_hash)
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const base64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
