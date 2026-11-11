// Recorta los mockups de prendas de una hoja (imagen con varias prendas dibujadas sobre fondo claro) y los deja listos
// para la biblioteca del lienzo: cada prenda en su PNG con el fondo transparente, ampliada y suavizada, y su ficha en
// src/lienzo/mockups.ts.
//
// Uso: node scripts/mockups.mjs <hoja.png>
// Los nombres van en el mismo orden en que se encuentran las prendas (por filas, de izquierda a derecha); si la
// hoja cambia, hay que revisar NAMES. Con imágenes más grandes, los mockups salen más nítidos.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [, , input] = process.argv
if (!input) {
  console.error('Uso: node scripts/mockups.mjs <hoja.png>')
  process.exit(1)
}

/** Nombre de cada prenda (en el orden en que aparecen) y si es de mujer. */
const NAMES = [
  ['camiseta', 'Camiseta'],
  ['camiseta-ml', 'Camiseta de manga larga'],
  ['tirantes', 'Camiseta de tirantes (delante)'],
  ['tirantes-espalda', 'Camiseta de tirantes (espalda)'],
  ['crop-top', 'Crop top'],
  ['puffer', 'Chaqueta puffer'],
  ['sudadera-raglan', 'Sudadera raglán'],
  ['sudadera-capucha', 'Sudadera con capucha'],
  ['bomber', 'Bomber'],
  ['chandal-chaqueta', 'Chaqueta de chándal'],
  ['chaleco', 'Chaleco (delante)'],
  ['chaleco-espalda', 'Chaleco (espalda)'],
  ['jogger', 'Jogger'],
  ['cargo', 'Pantalón cargo'],
  ['varsity', 'Chaqueta varsity'],
  ['gorro', 'Gorro'],
  ['gorra', 'Gorra'],
  ['polo', 'Polo'],
  ['shorts', 'Pantalón corto'],
  ['vaquero', 'Vaquero'],
  ['chandal-pantalon', 'Pantalón de chándal'],
  ['camisa-mc', 'Camisa de manga corta'],
  ['polo-ml', 'Polo de manga larga'],
  ['shorts-cordon', 'Shorts con cordón'],
  ['short-vaquero', 'Short vaquero'],
  ['cazadora-vaquera', 'Cazadora vaquera'],
]

const SCALE = 4
const OUT = 'public/mockups'
fs.mkdirSync(OUT, { recursive: true })

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info
const bg = [data[0], data[1], data[2]]
const diff = (i) => Math.abs(data[i * 3] - bg[0]) + Math.abs(data[i * 3 + 1] - bg[1]) + Math.abs(data[i * 3 + 2] - bg[2])
const ink = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) if (diff(i) > 30) ink[i] = 1

// Zonas con dibujo (unidas si están a menos de 3 px)
const R = 3
const dil = new Uint8Array(W * H)
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (ink[y * W + x])
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) dil[yy * W + xx] = 1
        }
const seen = new Int32Array(W * H).fill(-1)
let boxes = []
for (let i = 0; i < W * H; i++) {
  if (!dil[i] || seen[i] >= 0) continue
  const id = boxes.length
  let [x0, y0, x1, y1, n] = [W, H, 0, 0, 0]
  const stack = [i]
  seen[i] = id
  while (stack.length) {
    const j = stack.pop()
    const x = j % W
    const y = (j - x) / W
    n++
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
    for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && dil[k] && seen[k] < 0 && Math.abs((k % W) - x) <= 1) (seen[k] = id), stack.push(k)
  }
  if (n > 300) boxes.push({ x0: x0 + R, y0: y0 + R, x1: x1 - R, y1: y1 - R })
}

// Dos prendas que se tocan: se separan por la columna sin dibujo más ancha que haya dentro (si la hay en medio)
const split = []
for (const b of boxes) {
  const empty = []
  for (let x = b.x0 + 20; x < b.x1 - 20; x++) {
    let n = 0
    for (let y = b.y0; y <= b.y1; y++) n += ink[y * W + x]
    if (n === 0) empty.push(x)
  }
  // Solo las que son claramente dos prendas (más anchas que dos piezas juntas)
  if (b.x1 - b.x0 > 260 && empty.length) {
    // El hueco más cercano al centro (entre las dos prendas, no entre el delante y la espalda de una)
    const mid = (b.x0 + b.x1) / 2
    const cut = empty.reduce((best, x) => (Math.abs(x - mid) < Math.abs(best - mid) ? x : best), empty[0])
    split.push({ ...b, x1: cut - 1 }, { ...b, x0: cut + 1 })
  } else split.push(b)
}
boxes = split.sort((a, b) => (Math.abs(a.y0 - b.y0) < 40 ? a.x0 - b.x0 : a.y0 - b.y0))
if (boxes.length !== NAMES.length) console.warn(`Aviso: ${boxes.length} prendas encontradas y ${NAMES.length} nombres`)

const catalog = []
for (let k = 0; k < boxes.length; k++) {
  const b = boxes[k]
  const [id, name] = NAMES[k] ?? [`mockup-${k + 1}`, `Mockup ${k + 1}`]
  const pad = 2
  const x0 = Math.max(0, b.x0 - pad)
  const y0 = Math.max(0, b.y0 - pad)
  const w = Math.min(W - x0, b.x1 - b.x0 + 1 + pad * 2)
  const h = Math.min(H - y0, b.y1 - b.y0 + 1 + pad * 2)
  // Fondo transparente: lo que es color de fondo y se llega a él desde el borde (el gris de dentro se queda)
  const alpha = new Uint8Array(w * h).fill(255)
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const j = stack.pop()
    if (alpha[j] === 0) continue
    const x = j % w
    const y = (j - x) / w
    if (diff((y0 + y) * W + x0 + x) > 30) continue
    alpha[j] = 0
    if (x > 0) stack.push(j - 1)
    if (x < w - 1) stack.push(j + 1)
    if (y > 0) stack.push(j - w)
    if (y < h - 1) stack.push(j + w)
  }
  // Borde sin halo: los puntos del contorno casi del color del fondo se vuelven en parte transparentes (dos pasadas)
  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(alpha)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = y * w + x
        if (!alpha[j]) continue
        const edge = (x > 0 && !alpha[j - 1]) || (x < w - 1 && !alpha[j + 1]) || (y > 0 && !alpha[j - w]) || (y < h - 1 && !alpha[j + w])
        if (!edge) continue
        const d = diff((y0 + y) * W + x0 + x)
        next[j] = Math.min(alpha[j], Math.max(0, Math.min(255, Math.round(((d - 20) / 90) * 255))))
      }
    alpha.set(next)
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * W + x0 + x) * 3
      const d = (y * w + x) * 4
      rgba[d] = data[s]
      rgba[d + 1] = data[s + 1]
      rgba[d + 2] = data[s + 2]
      rgba[d + 3] = alpha[y * w + x]
    }
  const file = `${id}.png`
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(w * SCALE, h * SCALE, { kernel: 'lanczos3' })
    .sharpen({ sigma: 1.2 })
    .png()
    .toFile(path.join(OUT, file))
  catalog.push({ id, name, file: `/mockups/${file}`, aspect: +(h / w).toFixed(4) })
}

const ts =
  `// Generado por scripts/mockups.mjs: mockups de prendas (dibujos planos con fondo transparente) para el lienzo.\n` +
  `export interface MockupAsset {\n  id: string\n  name: string\n  /** Ruta pública de la imagen. */\n  file: string\n  /** Alto / ancho. */\n  aspect: number\n}\n\n` +
  `export const MOCKUPS: MockupAsset[] = ${JSON.stringify(catalog, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")}\n`
fs.writeFileSync('src/lienzo/mockups.ts', ts)
console.log(`${catalog.length} mockups en ${OUT}`)
