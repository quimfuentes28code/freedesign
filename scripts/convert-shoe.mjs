// Prepara la zapatilla de running (MaterialsVariantsShoe de Shopify, CC-BY 4.0) para la web.
// Uso: node scripts/convert-shoe.mjs <entrada.glb> public/models/zapatilla.glb
//
// - Deja una sola textura de color (la variante «Midnight»: su azul es lo que la app tiñe con el color elegido)
// - Reduce las texturas a 1024 px (de 2048) y quita la extensión de variantes
// - La geometría queda igual
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: node scripts/convert-shoe.mjs <entrada.glb> <salida.glb>')
  process.exit(1)
}

const glb = await readFile(input)
const jsonLen = glb.readUInt32LE(12)
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString())
const binStart = 20 + jsonLen + 8
const view = (i) => {
  const bv = json.bufferViews[i]
  return glb.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength)
}

// Imágenes que se quedan: color «Midnight», normales y oclusión/rugosidad/metal
const keep = ['diffuseMidnight.jpg', 'normal.jpg', 'occlusionRougnessMetalness.jpg']
const images = []
for (const name of keep) {
  const i = json.images.findIndex((im) => im.name === name)
  const data = await sharp(view(json.images[i].bufferView)).resize(1024, 1024).jpeg({ quality: name === 'normal.jpg' ? 92 : 86 }).toBuffer()
  images.push({ old: i, name, data })
}

// Buffer nuevo: las vistas de la geometría (las de los accesores) y luego las imágenes
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
  if (viewMap.has(acc.bufferView)) continue
  const bv = json.bufferViews[acc.bufferView]
  const at = push(view(acc.bufferView))
  viewMap.set(acc.bufferView, bufferViews.length)
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bv.byteLength, ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), ...(bv.target ? { target: bv.target } : {}) })
}
const imageIndex = new Map()
const newImages = images.map(({ old, name, data }, k) => {
  const at = push(data)
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: data.length })
  imageIndex.set(old, k)
  return { name, mimeType: 'image/jpeg', bufferView: bufferViews.length - 1 }
})
for (const acc of json.accessors) acc.bufferView = viewMap.get(acc.bufferView)

// Texturas: una por imagen que se queda
const textures = newImages.map((_, k) => ({ source: k, ...(json.samplers?.length ? { sampler: 0 } : {}) }))
const texOf = (oldTex) => imageIndex.get(json.textures[oldTex].source)
const m = json.materials[0]
const pbr = m.pbrMetallicRoughness
const material = {
  name: 'zapatilla',
  pbrMetallicRoughness: {
    baseColorTexture: { index: imageIndex.get(json.images.findIndex((im) => im.name === 'diffuseMidnight.jpg')) },
    metallicRoughnessTexture: { index: texOf(pbr.metallicRoughnessTexture.index) },
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
  },
  normalTexture: { index: texOf(m.normalTexture.index) },
  ...(m.occlusionTexture ? { occlusionTexture: { index: texOf(m.occlusionTexture.index) } } : {}),
}
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  p.material = 0
  delete p.extensions
}
delete json.extensions
delete json.extensionsUsed
delete json.extensionsRequired
const out = {
  ...json,
  asset: { ...json.asset, copyright: '© 2021 Shopify, CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)' },
  bufferViews,
  images: newImages,
  textures,
  materials: [material],
  buffers: [{ byteLength: offset }],
}
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
console.log(`${output}: ${(total / 1024 / 1024).toFixed(2)} MB`)
