// Parte los mockups de la hoja (public/mockups/<id>.png, delantero y espalda juntos) en una imagen por vista
// (<id>-delante.png y <id>-detras.png), buscando la franja vacía entre las dos figuras, y escribe
// src/lienzo/mockupViews.ts: qué dibujos usa cada prenda del catálogo al empezar un diseño.
// Uso: node scripts/mockup-views.mjs
import fs from 'node:fs'
import sharp from 'sharp'

const DIR = 'public/mockups'

/** Prenda del catálogo (NEW_DESIGN_CATALOG) → mockup de la hoja. `back` si la espalda es otra imagen. */
const MAP = {
  sudadera: { src: 'sudadera-capucha' },
  camiseta: { src: 'camiseta' },
  'camiseta-ml': { src: 'camiseta-ml' },
  polo: { src: 'polo' },
  'polo-ml': { src: 'polo-ml' },
  'camisa-mc': { src: 'camisa-mc' },
  bomber: { src: 'bomber' },
  puffer: { src: 'puffer' },
  chaleco: { src: 'chaleco', back: 'chaleco-espalda' },
  cazadora: { src: 'cazadora-vaquera' },
  cortavientos: { src: 'chandal-chaqueta' },
  pantalon: { src: 'jogger' },
  chandal: { src: 'chandal-pantalon' },
  'pantalon-ancho': { src: 'vaquero' },
  'pantalon-corto': { src: 'shorts' },
  shorts: { src: 'short-vaquero' },
  top: { src: 'tirantes', back: 'tirantes-espalda' },
  gorro: { src: 'gorro' },
  gorra: { src: 'gorra' },
}

/** Columnas con algo pintado (alfa) de una imagen. */
async function columns(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const cols = new Array(info.width).fill(0)
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 30) cols[x]++
  return { cols, w: info.width, h: info.height }
}

/**
 * Amplía un dibujo pequeño (×4) sin que se vean los píxeles: el color sobre blanco y la silueta por separado, con un
 * suavizado y un poco de contraste para que las líneas queden limpias.
 */
async function upscale(buf) {
  const m = await sharp(buf).metadata()
  const W = m.width * 4
  const H = m.height * 4
  const c = (v, lo, hi) => Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo)) * 255)))
  const rgb = await sharp(buf).flatten({ background: '#ffffff' }).resize(W, H, { kernel: 'lanczos3' }).blur(1.4).removeAlpha().raw().toBuffer()
  const alpha = await sharp(buf).ensureAlpha().extractChannel(3).resize(W, H, { kernel: 'lanczos3' }).blur(2.2).extractChannel(0).raw().toBuffer()
  const out = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) out[i * 4 + k] = c(rgb[i * 3 + k], 70, 240)
    out[i * 4 + 3] = c(alpha[i], 25, 80)
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

/** Recorta una zona, le quita lo vacío de alrededor y la amplía. Devuelve su proporción (alto / ancho). */
async function cut(file, left, width, out) {
  const buf = await sharp(file).extract({ left, top: 0, width, height: (await sharp(file).metadata()).height }).png().toBuffer()
  const trimmed = await sharp(buf).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true })
  await sharp(await upscale(trimmed.data)).png({ palette: true, quality: 90, effort: 8 }).toFile(out)
  return Math.round((trimmed.info.height / trimmed.info.width) * 10000) / 10000
}

/** Parte en dos por la columna más vacía de la zona central (quedan puntitos del difuminado entre las figuras); si
 * esa columna tiene mucho dibujo, es una sola figura. */
async function split(id) {
  const file = `${DIR}/${id}.png`
  const { cols, w, h } = await columns(file)
  let mid = -1
  for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x++) if (mid < 0 || cols[x] < cols[mid]) mid = x
  if (mid < 0 || cols[mid] > h * 0.04) return { single: true, file }
  // Centro de la franja más vacía (columnas casi tan vacías como la mínima, seguidas)
  let a = mid
  let b = mid
  while (a > 0 && cols[a - 1] <= cols[mid] + 1) a--
  while (b < w - 1 && cols[b + 1] <= cols[mid] + 1) b++
  return { single: false, file, mid: Math.floor((a + b) / 2), w }
}

const views = {}
for (const [entry, m] of Object.entries(MAP)) {
  const s = await split(m.src)
  const v = {}
  if (s.single || m.back) {
    v.front = { file: `/mockups/${m.src}-delante.png`, aspect: await cut(s.file, 0, (await sharp(s.file).metadata()).width, `${DIR}/${m.src}-delante.png`) }
    if (m.back) {
      const b = `${DIR}/${m.back}.png`
      v.back = { file: `/mockups/${m.back}-detras.png`, aspect: await cut(b, 0, (await sharp(b).metadata()).width, `${DIR}/${m.back}-detras.png`) }
    }
  } else {
    v.front = { file: `/mockups/${m.src}-delante.png`, aspect: await cut(s.file, 0, s.mid, `${DIR}/${m.src}-delante.png`) }
    v.back = { file: `/mockups/${m.src}-detras.png`, aspect: await cut(s.file, s.mid, s.w - s.mid, `${DIR}/${m.src}-detras.png`) }
  }
  views[entry] = v
  console.log(entry, s.single ? '(una figura)' : `partido en x=${s.mid}`)
}

fs.writeFileSync(
  'src/lienzo/mockupViews.ts',
  `// Generado por scripts/mockup-views.mjs: los dibujos de la hoja de mockups que usa cada prenda del catálogo al
// empezar un diseño (delante y detrás por separado, para encajar cada vista con la prenda 3D).
export interface MockupView {
  /** Ruta pública de la imagen. */
  file: string
  /** Alto / ancho. */
  aspect: number
}

export const MOCKUP_VIEWS: Record<string, { front?: MockupView; back?: MockupView }> = ${JSON.stringify(views, null, 2)}
`,
)
console.log('ok')
