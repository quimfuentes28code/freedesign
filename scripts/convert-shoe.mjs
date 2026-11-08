// Prepara una zapatilla (.glb) para la web: la de Shopify o una generada con IA desde una foto (Tripo, Meshy…).
// Uso: node scripts/convert-shoe.mjs <entrada.glb> public/models/<nombre>.glb [--variante Midnight]
//
// - Reduce todas las texturas a 1024 px como mucho (JPEG; PNG si tienen transparencia)
// - Con variantes de material (KHR_materials_variants), deja solo la pedida (o la que ya tenga cada pieza)
// - Quita lo que no hace falta (cámaras, animaciones, extensiones de variantes); acepta texturas WebP
// - Si la malla tiene muchos triángulos (las de IA traen cientos de miles), la simplifica a unos 45.000
//   (`--triangulos N` para cambiarlo) sin perder la forma
// - Limpia los fallos típicos de los modelos hechos con IA: trozos sueltos que flotan y lo que sobresale por debajo
//   de la suela (columnas o pinchos); se supone que «arriba» es +Y
// Después se añade una entrada en REAL_SHOES (src/three/RealShoes.tsx) con su archivo, nombre y créditos.
import { readFile, writeFile } from 'node:fs/promises'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const args = process.argv.slice(2)
const flagValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const [input, output] = args.filter((a, i) => !a.startsWith('--') && !['--variante', '--triangulos'].includes(args[i - 1]))
const variantName = flagValue('--variante')
const maxTris = Number(flagValue('--triangulos') ?? 45000)
if (!input || !output) {
  console.error('Uso: node scripts/convert-shoe.mjs <entrada.glb> <salida.glb> [--variante Nombre]')
  process.exit(1)
}

const glb = await readFile(input)
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('No es un archivo .glb')
const jsonLen = glb.readUInt32LE(12)
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString())
const binStart = 20 + jsonLen + 8
const view = (i) => {
  const bv = json.bufferViews[i]
  return glb.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength)
}

// Variante de material: cada pieza toma la de la variante pedida
const variants = json.extensions?.KHR_materials_variants?.variants ?? []
const variant = variantName ? variants.findIndex((v) => v.name.toLowerCase() === variantName.toLowerCase()) : -1
if (variantName && variant < 0) throw new Error(`No hay variante «${variantName}» (hay: ${variants.map((v) => v.name).join(', ')})`)
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    const map = p.extensions?.KHR_materials_variants?.mappings
    const hit = map?.find((m) => m.variants.includes(variant))
    if (hit) p.material = hit.material
    if (p.extensions) delete p.extensions.KHR_materials_variants
    if (p.extensions && !Object.keys(p.extensions).length) delete p.extensions
  }
}

// Solo los materiales, texturas e imágenes que se usan
const usedMaterials = [...new Set(json.meshes.flatMap((m) => m.primitives.map((p) => p.material).filter((x) => x !== undefined)))]
const materialMap = new Map(usedMaterials.map((m, k) => [m, k]))
const materials = usedMaterials.map((i) => structuredClone(json.materials[i]))
for (const mesh of json.meshes) for (const p of mesh.primitives) if (p.material !== undefined) p.material = materialMap.get(p.material)
const textureRefs = []
const walk = (o) => {
  if (!o || typeof o !== 'object') return
  if (typeof o.index === 'number' && ('texCoord' in o || 'scale' in o || 'strength' in o || Object.keys(o).length <= 3)) textureRefs.push(o)
  for (const v of Object.values(o)) walk(v)
}
materials.forEach(walk)
const usedTextures = [...new Set(textureRefs.map((r) => r.index))]
const textureMap = new Map(usedTextures.map((t, k) => [t, k]))
for (const r of textureRefs) r.index = textureMap.get(r.index)
const sourceOf = (t) => json.textures[t].source ?? json.textures[t].extensions?.EXT_texture_webp?.source
const usedImages = [...new Set(usedTextures.map(sourceOf))]
const imageMap = new Map(usedImages.map((im, k) => [im, k]))

// Malla demasiado densa: se simplifica (se conservan los bordes de las costuras de las UV) y se compactan los puntos
const ARRAYS = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const readAccessor = (i) => {
  const a = json.accessors[i]
  const T = ARRAYS[a.componentType]
  const n = SIZES[a.type]
  const bv = json.bufferViews[a.bufferView]
  if (bv.byteStride && bv.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('Formato de malla no admitido (datos intercalados)')
  const src = view(a.bufferView).subarray(a.byteOffset ?? 0)
  const copy = new Uint8Array(a.count * n * T.BYTES_PER_ELEMENT)
  copy.set(src.subarray(0, copy.length))
  return new T(copy.buffer)
}
/**
 * Limpieza de un modelo hecho con IA: devuelve los índices sin los trozos sueltos que flotan separados de la
 * zapatilla (los que la tocan, como suela, cordones u ojales, se quedan; se unen los puntos que están en el mismo sitio) ni los
 * triángulos que quedan por debajo de la suela (donde la planta del modelo ya es estrecha: una columna o un pincho).
 */
function cleanShoe(indices, positions) {
  const n = positions.length / 3
  // Puntos en el mismo sitio (las costuras de la textura los duplican) cuentan como uno
  const key = (v) => `${Math.round(positions[v * 3] * 1e5)},${Math.round(positions[v * 3 + 1] * 1e5)},${Math.round(positions[v * 3 + 2] * 1e5)}`
  const canon = new Int32Array(n)
  const seen = new Map()
  for (let v = 0; v < n; v++) {
    const k = key(v)
    if (!seen.has(k)) seen.set(k, v)
    canon[v] = seen.get(k)
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]]
    return a
  }
  const join = (a, b) => {
    a = find(a)
    b = find(b)
    if (a !== b) parent[a] = b
  }
  const tris = indices.length / 3
  for (let t = 0; t < tris; t++) {
    join(canon[indices[t * 3]], canon[indices[t * 3 + 1]])
    join(canon[indices[t * 3]], canon[indices[t * 3 + 2]])
  }
  // Caja de cada trozo; el más grande es la zapatilla
  const boxes = new Map()
  for (let t = 0; t < tris; t++) {
    const r = find(canon[indices[t * 3]])
    let bx = boxes.get(r)
    if (!bx) boxes.set(r, (bx = { n: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }))
    bx.n++
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k]
      for (let c = 0; c < 3; c++) {
        bx.min[c] = Math.min(bx.min[c], positions[v * 3 + c])
        bx.max[c] = Math.max(bx.max[c], positions[v * 3 + c])
      }
    }
  }
  const main = [...boxes.values()].reduce((a, b) => (b.n > a.n ? b : a))
  const pad = main.max.map((m, c) => (m - main.min[c]) * 0.02)
  // Un trozo cuenta si toca la caja de la pieza principal (la suela, la lengüeta o los cordones de un modelo hecho
  // por piezas la tocan); solo se quitan los que flotan separados
  const inside = (bx) => bx === main || bx.min.every((m, c) => m <= main.max[c] + pad[c]) && bx.max.every((m, c) => m >= main.min[c] - pad[c])
  // Suela: de abajo arriba, la primera altura donde la planta deja de ser un pincho (al menos el 8 % de la más ancha;
  // una suela curvada toca el suelo con un trozo pequeño pero no tan estrecho)
  let y0 = Infinity
  let y1 = -Infinity
  for (let v = 0; v < n; v++) {
    y0 = Math.min(y0, positions[v * 3 + 1])
    y1 = Math.max(y1, positions[v * 3 + 1])
  }
  const BINS = 60
  const ext = Array.from({ length: BINS }, () => ({ x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }))
  for (let v = 0; v < n; v++) {
    const b = Math.min(BINS - 1, Math.floor(((positions[v * 3 + 1] - y0) / (y1 - y0)) * BINS))
    const e = ext[b]
    e.x0 = Math.min(e.x0, positions[v * 3])
    e.x1 = Math.max(e.x1, positions[v * 3])
    e.z0 = Math.min(e.z0, positions[v * 3 + 2])
    e.z1 = Math.max(e.z1, positions[v * 3 + 2])
  }
  const area = ext.map((e) => (e.x1 > e.x0 ? (e.x1 - e.x0) * (e.z1 - e.z0) : 0))
  const maxArea = Math.max(...area)
  const soleBin = area.findIndex((a) => a >= maxArea * 0.08)
  const floor = y0 + (soleBin / BINS) * (y1 - y0) - ((y1 - y0) / BINS) * 0.5
  const out = []
  let dropped = 0
  for (let t = 0; t < tris; t++) {
    const tri = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]]
    const loose = !inside(boxes.get(find(canon[tri[0]])))
    const below = tri.every((v) => positions[v * 3 + 1] < floor)
    if (loose || below) {
      dropped++
      continue
    }
    out.push(...tri)
  }
  if (dropped) console.log(`Limpieza: quitados ${dropped} triángulos (trozos sueltos o por debajo de la suela)`)
  return Uint32Array.from(out)
}

await MeshoptSimplifier.ready
let triangles = 0
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    if (p.indices === undefined || (p.mode ?? 4) !== 4) continue
    const positions = readAccessor(p.attributes.POSITION)
    const cleaned = cleanShoe(Uint32Array.from(readAccessor(p.indices)), positions)
    const count = cleaned.length / 3
    const [simple] = count > maxTris * 1.1 ? MeshoptSimplifier.simplify(cleaned, positions, 3, maxTris * 3, 0.01, []) : [cleaned]
    // Solo los puntos que se usan, renumerados
    const remap = new Int32Array(positions.length / 3).fill(-1)
    let used = 0
    const newIdx = new Uint32Array(simple.length)
    for (let k = 0; k < simple.length; k++) {
      const v = simple[k]
      if (remap[v] < 0) remap[v] = used++
      newIdx[k] = remap[v]
    }
    const attributes = {}
    for (const [name, acc] of Object.entries(p.attributes)) {
      const a = json.accessors[acc]
      const data = readAccessor(acc)
      const n = SIZES[a.type]
      const out = new data.constructor(used * n)
      for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let c = 0; c < n; c++) out[remap[v] * n + c] = data[v * n + c]
      const acc2 = { componentType: a.componentType, type: a.type, count: used, _data: out, ...(a.normalized ? { normalized: true } : {}) }
      if (name === 'POSITION') {
        acc2.min = [0, 1, 2].map((c) => Math.min(...Array.from({ length: used }, (_, v) => out[v * 3 + c])))
        acc2.max = [0, 1, 2].map((c) => Math.max(...Array.from({ length: used }, (_, v) => out[v * 3 + c])))
      }
      json.accessors.push(acc2)
      attributes[name] = json.accessors.length - 1
    }
    json.accessors.push({ componentType: 5125, type: 'SCALAR', count: newIdx.length, _data: newIdx })
    p.indices = json.accessors.length - 1
    p.attributes = attributes
    triangles += newIdx.length / 3
    if (newIdx.length / 3 < count) console.log(`Malla simplificada: ${Math.round(count)} → ${newIdx.length / 3} triángulos`)
  }
}
// Las normales sobran: la app las recalcula al colocar la zapatilla (RealShoes.tsx)
for (const mesh of json.meshes) for (const p of mesh.primitives) delete p.attributes.NORMAL
// Solo los accesores que se siguen usando
const usedAcc = [...new Set(json.meshes.flatMap((m) => m.primitives.flatMap((p) => [...Object.values(p.attributes), ...(p.indices !== undefined ? [p.indices] : [])])))]
const accMap = new Map(usedAcc.map((a, k) => [a, k]))
for (const mesh of json.meshes)
  for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k])
    if (p.indices !== undefined) p.indices = accMap.get(p.indices)
    if (p.targets) delete p.targets
  }
json.accessors = usedAcc.map((a) => json.accessors[a])

// Buffer nuevo: geometría y luego las imágenes reducidas
const chunks = []
let offset = 0
const push = (data) => {
  const pad = (4 - (offset % 4)) % 4
  if (pad) {
    chunks.push(Buffer.alloc(pad))
    offset += pad
  }
  const at = offset
  chunks.push(data)
  offset += data.length
  return at
}
const bufferViews = []
const viewMap = new Map()
for (const acc of json.accessors) {
  // Los simplificados traen sus datos; el resto copia su vista
  if (acc._data) {
    const at = push(Buffer.from(acc._data.buffer, acc._data.byteOffset, acc._data.byteLength))
    bufferViews.push({ buffer: 0, byteOffset: at, byteLength: acc._data.byteLength })
    acc.bufferView = bufferViews.length - 1
    delete acc._data
    continue
  }
  if (acc.bufferView === undefined) continue
  if (!viewMap.has(acc.bufferView)) {
    const bv = json.bufferViews[acc.bufferView]
    const at = push(view(acc.bufferView))
    viewMap.set(acc.bufferView, bufferViews.length)
    bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bv.byteLength, ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), ...(bv.target ? { target: bv.target } : {}) })
  }
  acc.bufferView = viewMap.get(acc.bufferView)
}
const images = []
for (const i of usedImages) {
  const im = json.images[i]
  const src = im.bufferView !== undefined ? view(im.bufferView) : null
  if (!src) throw new Error('Las imágenes tienen que ir dentro del .glb')
  const img = sharp(src)
  const meta = await img.metadata()
  const alpha = meta.hasAlpha && (await img.stats()).channels[3]?.min < 250
  const resized = img.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
  const data = alpha ? await resized.png().toBuffer() : await resized.jpeg({ quality: 88 }).toBuffer()
  const at = push(data)
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: data.length })
  images.push({ name: im.name, mimeType: alpha ? 'image/png' : 'image/jpeg', bufferView: bufferViews.length - 1 })
}
const textures = usedTextures.map((t) => {
  const { extensions: _ext, ...rest } = json.textures[t]
  return { ...rest, source: imageMap.get(sourceOf(t)) }
})

delete json.animations
delete json.cameras
delete json.skins
for (const n of json.nodes ?? []) {
  delete n.camera
  delete n.skin
}
if (json.extensions) delete json.extensions.KHR_materials_variants
const dropExt = (e) => e !== 'KHR_materials_variants' && e !== 'EXT_texture_webp'
json.extensionsUsed = (json.extensionsUsed ?? []).filter(dropExt)
json.extensionsRequired = (json.extensionsRequired ?? []).filter(dropExt)
if (!json.extensionsUsed.length) delete json.extensionsUsed
if (!json.extensionsRequired.length) delete json.extensionsRequired
if (json.extensions && !Object.keys(json.extensions).length) delete json.extensions

const out = { ...json, bufferViews, images, textures, materials, buffers: [{ byteLength: offset }] }
if (!images.length) delete out.images
if (!textures.length) delete out.textures
const bin = Buffer.concat(chunks)
const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4)
let jsonBuf = Buffer.from(JSON.stringify(out))
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)])
const total = 12 + 8 + jsonBuf.length + 8 + bin.length + binPad.length
const head = Buffer.alloc(12)
head.writeUInt32LE(0x46546c67, 0)
head.writeUInt32LE(2, 4)
head.writeUInt32LE(total, 8)
const jh = Buffer.alloc(8)
jh.writeUInt32LE(jsonBuf.length, 0)
jh.writeUInt32LE(0x4e4f534a, 4)
const bh = Buffer.alloc(8)
bh.writeUInt32LE(bin.length + binPad.length, 0)
bh.writeUInt32LE(0x004e4942, 4)
await writeFile(output, Buffer.concat([head, jh, jsonBuf, bh, bin, binPad]))
console.log(`${output}: ${(total / 1024 / 1024).toFixed(2)} MB, ${Math.round(triangles)} triángulos, ${images.length} texturas`)
