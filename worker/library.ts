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
import { HttpError, json, noContent, now, num, readBody, required, text, type Env } from './http'

// --- Materiales: /api/materials ---

export async function materialsRoute(request: Request, env: Env, id: string | undefined, url: URL) {
  if (!id && request.method === 'GET') {
    return json(await listMaterials(env, url.searchParams.get('q') ?? '', url.searchParams.get('category') ?? ''))
  }
  if (!id && request.method === 'POST') return json(await createMaterial(env, await readMaterial(request)), 201)
  if (id && request.method === 'GET') return json(await getMaterial(env, id))
  if (id && request.method === 'PUT') return json(await updateMaterial(env, id, await readMaterial(request)))
  if (id && request.method === 'DELETE') {
    const old = await getMaterial(env, id)
    await env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(id).run()
    await deleteFile(env, old.photo)
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

async function listMaterials(env: Env, q: string, category: string) {
  const term = `%${q.trim()}%`
  const { results } = await env.DB.prepare(
    `${MATERIAL_SELECT}
     WHERE (?1 = '' OR m.category = ?1)
       AND (m.name LIKE ?2 OR m.description LIKE ?2 OR m.reference LIKE ?2 OR m.tags LIKE ?2
            OR m.composition LIKE ?2 OR m.color LIKE ?2 OR s.name LIKE ?2)
     ORDER BY m.name COLLATE NOCASE`,
  )
    .bind(category, term)
    .all<MaterialRow>()
  return results.map(toMaterial)
}

async function getMaterial(env: Env, id: string) {
  const row = await env.DB.prepare(`${MATERIAL_SELECT} WHERE m.id = ?`).bind(id).first<MaterialRow>()
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

async function createMaterial(env: Env, m: MaterialInput) {
  const id = crypto.randomUUID()
  const t = now()
  const cols = ['id', ...MATERIAL_FIELDS, 'created_at', 'updated_at']
  await env.DB.prepare(`INSERT INTO materials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(id, ...materialValues(m), t, t)
    .run()
  return getMaterial(env, id)
}

async function updateMaterial(env: Env, id: string, m: MaterialInput) {
  const old = await getMaterial(env, id)
  await env.DB.prepare(`UPDATE materials SET ${MATERIAL_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...materialValues(m), now(), id)
    .run()
  // Si se ha cambiado o quitado la foto, borramos la anterior
  if (old.photo && old.photo !== m.photo) await deleteFile(env, old.photo)
  return getMaterial(env, id)
}

async function readMaterial(request: Request): Promise<MaterialInput> {
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
    supplierId: text(b.supplierId) || null,
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

export async function suppliersRoute(request: Request, env: Env, id: string | undefined) {
  if (!id && request.method === 'GET') return json(await listSuppliers(env))
  if (!id && request.method === 'POST') return json(await createSupplier(env, await readSupplier(request)), 201)
  if (id && request.method === 'GET') return json(await getSupplier(env, id))
  if (id && request.method === 'PUT') return json(await updateSupplier(env, id, await readSupplier(request)))
  if (id && request.method === 'DELETE') {
    // Los materiales de este proveedor se quedan sin proveedor (no se borran)
    await env.DB.batch([
      env.DB.prepare('UPDATE materials SET supplier_id = NULL WHERE supplier_id = ?').bind(id),
      env.DB.prepare('DELETE FROM suppliers WHERE id = ?').bind(id),
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

async function listSuppliers(env: Env) {
  const { results } = await env.DB.prepare(`${SUPPLIER_SELECT} ORDER BY s.name COLLATE NOCASE`).all<SupplierRow>()
  return results.map(toSupplier)
}

async function getSupplier(env: Env, id: string) {
  const row = await env.DB.prepare(`${SUPPLIER_SELECT} WHERE s.id = ?`).bind(id).first<SupplierRow>()
  if (!row) throw new HttpError(404, 'Proveedor no encontrado')
  return toSupplier(row)
}

async function createSupplier(env: Env, s: SupplierInput) {
  const id = crypto.randomUUID()
  const t = now()
  await env.DB.prepare(
    `INSERT INTO suppliers (id, name, contact, email, phone, website, city, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, s.name, s.contact, s.email, s.phone, s.website, s.city, s.notes, t, t)
    .run()
  return getSupplier(env, id)
}

async function updateSupplier(env: Env, id: string, s: SupplierInput) {
  const { meta } = await env.DB.prepare(
    `UPDATE suppliers SET name = ?, contact = ?, email = ?, phone = ?, website = ?, city = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(s.name, s.contact, s.email, s.phone, s.website, s.city, s.notes, now(), id)
    .run()
  if (meta.changes === 0) throw new HttpError(404, 'Proveedor no encontrado')
  return getSupplier(env, id)
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
