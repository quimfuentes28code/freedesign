import { useEffect, useState } from 'react'
import { FONTS as SYSTEM_FONTS } from '../shared/artworks'

/**
 * Catálogo de tipografías (Google Fonts, de uso libre) agrupadas por estilo, más las del sistema.
 * Cada fuente se guarda en los diseños como su pila CSS (`'Anton', sans-serif`), así se usa tal cual en SVG,
 * canvas y la ficha técnica. Se descargan solo cuando se usan (y una muestra ligera para el selector).
 */

export interface FontDef {
  /** Pila CSS que se guarda en el diseño. */
  id: string
  label: string
  /** Familia en Google Fonts (vacía en las del sistema). */
  family: string
  /** Pesos que tiene (las que no tienen negrita la simulan). */
  weights: number[]
}

const g = (family: string, fallback = 'sans-serif', weights = [400]): FontDef => ({ id: `'${family}', ${fallback}`, label: family, family, weights })

export const FONT_GROUPS: { name: string; fonts: FontDef[] }[] = [
  {
    name: 'Streetwear y display',
    fonts: [
      g('Anton'),
      g('Bebas Neue'),
      g('Archivo Black'),
      g('Oswald', 'sans-serif', [400, 700]),
      g('Bungee'),
      g('Rubik Mono One'),
      g('Russo One'),
      g('Black Ops One'),
      g('Righteous'),
      g('Bowlby One SC'),
      g('Teko', 'sans-serif', [400, 700]),
      g('Big Shoulders Display', 'sans-serif', [400, 700]),
      g('Syne', 'sans-serif', [400, 700]),
      g('Unbounded', 'sans-serif', [400, 700]),
      g('Dela Gothic One'),
      g('Monoton'),
    ],
  },
  {
    name: 'College y varsity',
    fonts: [
      g('Graduate', 'serif'),
      g('Staatliches'),
      g('Alfa Slab One', 'serif'),
      g('Saira Stencil One'),
      g('Allerta Stencil'),
      g('Stardos Stencil', 'serif', [400, 700]),
      g('Holtwood One SC', 'serif'),
      g('Bevan', 'serif'),
      g('Ultra', 'serif'),
      g('Rye', 'serif'),
    ],
  },
  {
    name: 'Gótica',
    fonts: [
      g('UnifrakturMaguntia', 'serif'),
      g('UnifrakturCook', 'serif', [700]),
      g('Pirata One', 'serif'),
      g('Grenze Gotisch', 'serif', [400, 700]),
      g('New Rocker', 'serif'),
      g('Metal Mania', 'serif'),
      g('Fruktur', 'serif'),
    ],
  },
  {
    name: 'Manuscrita',
    fonts: [
      g('Pacifico', 'cursive'),
      g('Lobster', 'cursive'),
      g('Dancing Script', 'cursive', [400, 700]),
      g('Great Vibes', 'cursive'),
      g('Sacramento', 'cursive'),
      g('Yellowtail', 'cursive'),
      g('Kaushan Script', 'cursive'),
      g('Satisfy', 'cursive'),
      g('Allura', 'cursive'),
      g('Mr Dafoe', 'cursive'),
      g('Marck Script', 'cursive'),
      g('Caveat', 'cursive', [400, 700]),
      g('Homemade Apple', 'cursive'),
    ],
  },
  {
    name: 'Grafiti y urbana',
    fonts: [
      g('Permanent Marker', 'cursive'),
      g('Rock Salt', 'cursive'),
      g('Sedgwick Ave Display', 'cursive'),
      g('Sedgwick Ave', 'cursive'),
      g('Rubik Wet Paint'),
      g('Rubik Spray Paint'),
      g('Rubik Glitch'),
      g('Rubik Bubbles'),
      g('Rubik Beastly'),
      g('Rubik Puddles'),
      g('Rubik Dirt'),
      g('Knewave'),
      g('Titan One'),
      g('Bangers'),
      g('Nosifer'),
      g('Creepster'),
      g('Frijole'),
      g('Faster One'),
      g('Londrina Solid', 'sans-serif', [400, 900]),
      g('Londrina Sketch'),
    ],
  },
  {
    name: 'Retro',
    fonts: [g('Shrikhand', 'cursive'), g('Fascinate'), g('Bungee Shade'), g('Rampart One'), g('Coiny'), g('Chicle'), g('Press Start 2P', 'monospace'), g('VT323', 'monospace')],
  },
  {
    name: 'Clásica y elegante',
    fonts: [
      g('Playfair Display', 'serif', [400, 700]),
      g('Abril Fatface', 'serif'),
      g('DM Serif Display', 'serif'),
      g('Cinzel', 'serif', [400, 700]),
      g('Cormorant Garamond', 'serif', [400, 700]),
      g('Libre Baskerville', 'serif', [400, 700]),
      g('Bodoni Moda', 'serif', [400, 700]),
      g('Prata', 'serif'),
    ],
  },
  {
    name: 'Moderna',
    fonts: [
      g('Inter', 'sans-serif', [400, 700]),
      g('Montserrat', 'sans-serif', [400, 700]),
      g('Poppins', 'sans-serif', [400, 700]),
      g('Space Grotesk', 'sans-serif', [400, 700]),
      g('Work Sans', 'sans-serif', [400, 700]),
      g('Manrope', 'sans-serif', [400, 700]),
      g('DM Sans', 'sans-serif', [400, 700]),
      g('Space Mono', 'monospace', [400, 700]),
      g('IBM Plex Mono', 'monospace', [400, 700]),
    ],
  },
  { name: 'Del sistema', fonts: SYSTEM_FONTS.map((f) => ({ id: f.id, label: f.label, family: '', weights: [400, 700] })) },
]

const ALL = FONT_GROUPS.flatMap((gr) => gr.fonts)
const BY_ID = new Map(ALL.map((f) => [f.id, f]))
export const fontDef = (id: string) => BY_ID.get(id)
export const fontLabel = (id: string) => BY_ID.get(id)?.label ?? id.split(',')[0].replace(/['"]/g, '')

/** URL de la hoja de estilos de Google Fonts para unas fuentes (con `text`, solo esas letras: muy ligera). */
export function googleCss(fonts: FontDef[], text?: string) {
  const fams = fonts.filter((f) => f.family).map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}${f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : ''}`)
  if (!fams.length) return null
  return `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`
}

/**
 * Añade una hoja de Google Fonts. Las muestras van al principio: si una misma familia tiene la muestra (pocas letras)
 * y la completa, el navegador prueba primero la última definida, que así es siempre la completa.
 */
function addSheet(href: string, first = false) {
  if (document.querySelector(`link[data-font="${CSS.escape(href)}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.font = href
  if (first) document.head.prepend(link)
  else document.head.appendChild(link)
}

const loading = new Map<string, Promise<void>>()

/** Descarga una fuente (todas sus letras) y espera a que esté lista. Las del sistema no hacen nada. */
export function loadFont(id: string): Promise<void> {
  const f = fontDef(id)
  if (!f?.family) return Promise.resolve()
  let p = loading.get(f.family)
  if (!p) {
    addSheet(googleCss([f])!)
    p = Promise.all(f.weights.map((w) => document.fonts.load(`${w} 40px '${f.family}'`)))
      .then(() => undefined)
      .catch(() => undefined)
    loading.set(f.family, p)
  }
  return p
}

let previews = false
/** Muestra de todas las fuentes (solo las letras de sus nombres) para el selector. */
export function loadFontPreviews() {
  if (previews) return
  previews = true
  const fonts = ALL.filter((f) => f.family)
  const text = [...new Set(fonts.map((f) => f.label).join('') + 'Aa')].join('')
  // En varias hojas: la URL de todas juntas sería demasiado larga
  for (let i = 0; i < fonts.length; i += 30) addSheet(googleCss(fonts.slice(i, i + 30), text)!, true)
}

/** Vuelve a pintar cuando termina de cargar alguna fuente (las medidas del texto cambian). */
export function useFontsVersion() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const on = () => setV((n) => n + 1)
    document.fonts.addEventListener('loadingdone', on)
    return () => document.fonts.removeEventListener('loadingdone', on)
  }, [])
  return v
}

/** Un archivo (imagen, fuente) como data URL, para meterlo dentro de un SVG independiente. */
export async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob()
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

/**
 * Hojas de estilo con las fuentes de Google usadas (fuente → texto escrito con ella), con solo esas letras
 * y en base64: un SVG usado como imagen no puede descargar nada de fuera. Las fuentes del sistema no hacen falta.
 */
export async function embeddedFontCss(texts: Map<string, string>) {
  const css: string[] = []
  for (const [font, text] of texts) {
    const def = fontDef(font)
    if (!def?.family) continue
    try {
      let sheet = await (await fetch(googleCss([def], [...new Set(text)].join('') || 'A')!)).text()
      for (const url of new Set(sheet.match(/https:\/\/[^)'"]+/g) ?? [])) sheet = sheet.replaceAll(url, await toDataUrl(url))
      css.push(sheet)
    } catch {
      // Sin conexión: se usa la fuente de reserva
    }
  }
  return css.join('\n')
}
