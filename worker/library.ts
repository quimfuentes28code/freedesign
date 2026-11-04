import {
  MATERIAL_CATEGORIES,
  PRICE_UNITS,
  type Material,
  type MaterialCategory,
  type MaterialInput,
  type PriceUnit,
  type Supplier,
  type SupplierInput,
} from '../src/shared/library'
import { deleteFile, isFileKey } from './files'
import { HttpError, json, noContent, now, num, ownedRef, readBody, required, text, type Env } from './http'

// --- Materiales: /api/materials ---

export async function materialsRoute(request: Request, env: Env, uid: string, id: string | undefined, url: URL) {
  if (!id && request.method === 'GET') {
    return json(await listMaterials(env, uid, url.searchParams.get('q') ?? '', url.searchParams.get('category') ?? ''))
  }
  if (!id && request.method === 'POST') return json(await createMaterial(env, uid, await readMaterial(request, env, uid)), 201)
  if (id && request.method === 'GET') return json(await getMaterial(env, uid, id))
  if (id && request.method === 'PUT') return json(await updateMaterial(env, uid, id, await readMaterial(request, env, uid)))
  if (id && request.method === 'DELETE') {
    const old = await getMaterial(env, uid, id)
    await env.DB.prepare('DELETE FROM materials WHERE id = ? AND user_id = ?').bind(id, uid).run()
    await deleteFile(env, uid, old.photo)
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface MaterialRow {
  id: string
  category: MaterialCategory
  name: string
  description: string
  reference: string
  supplier_id: string | null
  supplier_name: string | null
  price: number | null
  price_unit: PriceUnit
  color: string
  composition: string
  weight_gsm: number | null
  width_cm: number | null
  tags: string
  photo: string
  created_at: string
  updated_at: string
}

const MATERIAL_SELECT = `SELECT m.*, s.name AS supplier_name FROM materials m LEFT JOIN suppliers s ON s.id = m.supplier_id`

function toMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    description: r.description,
    reference: r.reference,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name ?? undefined,
    price: r.price,
    priceUnit: r.price_unit,
    color: r.color,
    composition: r.composition,
    weightGsm: r.weight_gsm,
    widthCm: r.width_cm,
    tags: r.tags,
    photo: r.photo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listMaterials(env: Env, uid: string, q: string, category: string) {
  const term = `%${q.trim()}%`
  const { results } = await env.DB.prepare(
    `${MATERIAL_SELECT}
     WHERE m.user_id = ?3 AND (?1 = '' OR m.category = ?1)
       AND (m.name LIKE ?2 OR m.description LIKE ?2 OR m.reference LIKE ?2 OR m.tags LIKE ?2
            OR m.composition LIKE ?2 OR m.color LIKE ?2 OR s.name LIKE ?2)
     ORDER BY m.name COLLATE NOCASE`,
  )
    .bind(category, term, uid)
    .all<MaterialRow>()
  return results.map(toMaterial)
}

async function getMaterial(env: Env, uid: string, id: string) {
  const row = await env.DB.prepare(`${MATERIAL_SELECT} WHERE m.id = ? AND m.user_id = ?`).bind(id, uid).first<MaterialRow>()
  if (!row) throw new HttpError(404, 'Material no encontrado')
  return toMaterial(row)
}

const MATERIAL_FIELDS = [
  'category', 'name', 'description', 'reference', 'supplier_id', 'price', 'price_unit', 'color',
  'composition', 'weight_gsm', 'width_cm', 'tags', 'photo',
] as const

const materialValues = (m: MaterialInput) => [
  m.category, m.name, m.description, m.reference, m.supplierId, m.price, m.priceUnit, m.color,
  m.composition, m.weightGsm, m.widthCm, m.tags, m.photo,
]

async function createMaterial(env: Env, uid: string, m: MaterialInput) {
  const id = crypto.randomUUID()
  const t = now()
  const cols = ['id', 'user_id', ...MATERIAL_FIELDS, 'created_at', 'updated_at']
  await env.DB.prepare(`INSERT INTO materials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(id, uid, ...materialValues(m), t, t)
    .run()
  return getMaterial(env, uid, id)
}

async function updateMaterial(env: Env, uid: string, id: string, m: MaterialInput) {
  const old = await getMaterial(env, uid, id)
  await env.DB.prepare(`UPDATE materials SET ${MATERIAL_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(...materialValues(m), now(), id, uid)
    .run()
  // Si se ha cambiado o quitado la foto, borramos la anterior
  if (old.photo && old.photo !== m.photo) await deleteFile(env, uid, old.photo)
  return getMaterial(env, uid, id)
}

async function readMaterial(request: Request, env: Env, uid: string): Promise<MaterialInput> {
  const b = await readBody(request)
  const category = text(b.category) as MaterialCategory
  if (!MATERIAL_CATEGORIES.some((c) => c.id === category)) throw new HttpError(400, 'Categoría no válida')
  const priceUnit = (PRICE_UNITS as readonly string[]).includes(text(b.priceUnit)) ? (text(b.priceUnit) as PriceUnit) : 'unidad'
  const photo = text(b.photo)
  if (photo && !isFileKey(photo)) throw new HttpError(400, 'Foto no válida')
  const isFabric = category === 'tejido'
  return {
    category,
    name: required(b.name, 'El nombre'),
    description: text(b.description),
    reference: text(b.reference),
    supplierId: await ownedRef(env, 'suppliers', text(b.supplierId) || null, uid, 'El proveedor'),
    price: num(b.price),
    priceUnit,
    color: text(b.color),
    composition: isFabric ? text(b.composition) : '',
    weightGsm: isFabric ? num(b.weightGsm) : null,
    widthCm: isFabric ? num(b.widthCm) : null,
    tags: text(b.tags),
    photo,
  }
}

// --- Proveedores: /api/suppliers ---

export async function suppliersRoute(request: Request, env: Env, uid: string, id: string | undefined) {
  if (!id && request.method === 'GET') return json(await listSuppliers(env, uid))
  if (!id && request.method === 'POST') return json(await createSupplier(env, uid, await readSupplier(request)), 201)
  if (id && request.method === 'GET') return json(await getSupplier(env, uid, id))
  if (id && request.method === 'PUT') return json(await updateSupplier(env, uid, id, await readSupplier(request)))
  if (id && request.method === 'DELETE') {
    // Los materiales de este proveedor se quedan sin proveedor (no se borran)
    await env.DB.batch([
      env.DB.prepare('UPDATE materials SET supplier_id = NULL WHERE supplier_id = ? AND user_id = ?').bind(id, uid),
      env.DB.prepare('DELETE FROM suppliers WHERE id = ? AND user_id = ?').bind(id, uid),
    ])
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface SupplierRow {
  id: string
  name: string
  contact: string
  email: string
  phone: string
  website: string
  city: string
  notes: string
  materials: number
  created_at: string
  updated_at: string
}

const SUPPLIER_SELECT = `SELECT s.*, (SELECT COUNT(*) FROM materials m WHERE m.supplier_id = s.id) AS materials FROM suppliers s`

function toSupplier(r: SupplierRow): Supplier {
  return {
    id: r.id,
    name: r.name,
    contact: r.contact,
    email: r.email,
    phone: r.phone,
    website: r.website,
    city: r.city,
    notes: r.notes,
    materials: r.materials,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function listSuppliers(env: Env, uid: string) {
  const { results } = await env.DB.prepare(`${SUPPLIER_SELECT} WHERE s.user_id = ? ORDER BY s.name COLLATE NOCASE`).bind(uid).all<SupplierRow>()
  return results.map(toSupplier)
}

async function getSupplier(env: Env, uid: string, id: string) {
  const row = await env.DB.prepare(`${SUPPLIER_SELECT} WHERE s.id = ? AND s.user_id = ?`).bind(id, uid).first<SupplierRow>()
  if (!row) throw new HttpError(404, 'Proveedor no encontrado')
  return toSupplier(row)
}

async function createSupplier(env: Env, uid: string, s: SupplierInput) {
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    `INSERT INTO suppliers (id, user_id, name, contact, email, phone, website, city, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, uid, s.name, s.contact, s.email, s.phone, s.website, s.city, s.notes, t, t)
    .run()
  return getSupplier(env, uid, id)
}

async function updateSupplier(env: Env, uid: string, id: string, s: SupplierInput) {
  const { meta } = await env.DB.prepare(
    `UPDATE suppliers SET name = ?, contact = ?, email = ?, phone = ?, website = ?, city = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(s.name, s.contact, s.email, s.phone, s.website, s.city, s.notes, now(), id, uid)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Proveedor no encontrado')
  return getSupplier(env, uid, id)
}

async function readSupplier(request: Request): Promise<SupplierInput> {
  const b = await readBody(request)
  return {
    name: required(b.name, 'El nombre'),
    contact: text(b.contact),
    email: text(b.email),
    phone: text(b.phone),
    website: text(b.website),
    city: text(b.city),
    notes: text(b.notes),
  }
}
