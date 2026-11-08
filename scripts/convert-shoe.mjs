// Prepara una zapatilla (.glb) para la web: la de Shopify o una generada con IA desde una foto (Tripo, Meshy…).
// Uso: node scripts/convert-shoe.mjs <entrada.glb> public/models/<nombre>.glb [--variante Midnight]
//
// - Reduce todas las texturas a 1024 px como mucho (JPEG; PNG si tienen transparencia)
// - Con variantes de material (KHR_materials_variants), deja solo la pedida (o la que ya tenga cada pieza)
// - Quita lo que no hace falta (cámaras, animaciones, extensiones de variantes); la geometría queda igual
// Después se añade una entrada en REAL_SHOES (src/three/RealShoes.tsx) con su archivo, nombre y créditos.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const args = process.argv.slice(2)
const [input, output] = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--variante')
const variantName = args.includes('--variante') ? args[args.indexOf('--variante') + 1] : null
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
const usedImages = [...new Set(usedTextures.map((t) => json.textures[t].source))]
const imageMap = new Map(usedImages.map((im, k) => [im, k]))

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
  if (acc.bufferView === undefined || viewMap.has(acc.bufferView)) continue
  const bv = json.bufferViews[acc.bufferView]
  const at = push(view(acc.bufferView))
  viewMap.set(acc.bufferView, bufferViews.length)
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bv.byteLength, ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), ...(bv.target ? { target: bv.target } : {}) })
}
for (const acc of json.accessors) if (acc.bufferView !== undefined) acc.bufferView = viewMap.get(acc.bufferView)
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
const textures = usedTextures.map((t) => ({ ...json.textures[t], source: imageMap.get(json.textures[t].source) }))

delete json.animations
delete json.cameras
delete json.skins
for (const n of json.nodes ?? []) {
  delete n.camera
  delete n.skin
}
if (json.extensions) delete json.extensions.KHR_materials_variants
json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => e !== 'KHR_materials_variants')
json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => e !== 'KHR_materials_variants')
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
const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + (p.indices !== undefined ? json.accessors[p.indices].count / 3 : 0), 0)
console.log(`${output}: ${(total / 1024 / 1024).toFixed(2)} MB, ${Math.round(tris)} triángulos, ${images.length} texturas`)
if (tris > 150000) console.warn('Aviso: tiene muchos triángulos; si va lento, pide al generador una versión más ligera (unos 30.000).')
