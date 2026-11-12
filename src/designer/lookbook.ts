import type { Client } from '../shared/clients'
import { DETAIL_KINDS, DETAIL_STYLES, SURFACE_KINDS, WASH_KINDS, type Design, type PieceStyle } from '../shared/designs'
import { TECHNIQUES } from '../shared/artworks'
import type { Material } from '../shared/library'
import { colorLabel } from './colors'
import { resolveMaterial } from './materials'
import { unitsOf } from './prints'
import { getTemplate } from './templates'
import { VIEWS, type GarmentTemplate, type View } from './types'

/**
 * Lookbook: el texto que se le pasa a una IA de imágenes (fuera de la app) para que haga fotos realistas de un outfit
 * en un maniquí sin rostro. Cuanto más detalle, más fiel sale: prenda, corte, colores con su nombre y código, tejidos
 * con su composición, estampados (qué, dónde, técnica y tamaño), fornituras y notas. Se acompaña de los dibujos
 * técnicos de cada prenda como imágenes de referencia.
 */

export const LOOK_SCENES = [
  { id: 'estudio-blanco', label: 'Plató blanco', text: 'estudio fotográfico con fondo infinito blanco, suelo blanco continuo, luz suave y difusa de softbox con sombras suaves en el suelo' },
  { id: 'estudio-gris', label: 'Plató gris (catálogo)', text: 'fondo continuo gris claro de estudio, iluminación uniforme y suave de catálogo de moda, sombra suave bajo los pies' },
  { id: 'salar', label: 'Salar', text: 'un salar blanco infinito con el suelo agrietado en hexágonos, cielo despejado y luz natural suave de última hora de la tarde' },
  { id: 'calle', label: 'Calle', text: 'una calle urbana tranquila de una ciudad europea, fachadas de piedra, luz natural de tarde, ambiente de editorial streetwear' },
  { id: 'azotea', label: 'Azotea', text: 'una azotea de hormigón al atardecer con la ciudad desenfocada al fondo, luz dorada lateral' },
  { id: 'desierto', label: 'Desierto', text: 'un desierto de dunas suaves con cielo limpio, luz natural cálida y sombras largas' },
  { id: 'otro', label: 'Otro (escríbelo)', text: '' },
] as const
export type LookScene = (typeof LOOK_SCENES)[number]['id']

export const LOOK_ANGLES = [
  { id: 'frente', label: 'De frente', text: 'de frente, cuerpo entero' },
  { id: 'tres-cuartos', label: 'Tres cuartos', text: 'en tres cuartos (girado unos 45° hacia su izquierda), cuerpo entero' },
  { id: 'perfil', label: 'Perfil', text: 'de perfil (girado 90°), cuerpo entero' },
  { id: 'espalda', label: 'Espalda', text: 'de espaldas, cuerpo entero, para ver bien la parte de atrás de la ropa' },
  { id: 'detalle', label: 'Detalle', text: 'plano medio cerrado del torso, para ver de cerca tejidos, estampados y fornituras' },
] as const
export type LookAngle = (typeof LOOK_ANGLES)[number]['id']

export const LOOK_SHOES = [
  { id: 'baloncesto', label: 'Zapatillas altas de baloncesto' },
  { id: 'skate', label: 'Zapatillas de skate gruesas' },
  { id: 'deportivas', label: 'Zapatillas deportivas bajas' },
  { id: 'bota', label: 'Botas de trabajo' },
  { id: 'otro', label: 'Otro (escríbelo)' },
  { id: '', label: 'Que lo elija la IA' },
] as const

export interface LookInput {
  /** Prendas del outfit con su papel (de arriba hacia abajo). */
  items: { role: string; design: Design }[]
  materials: Map<string, Material>
  /** Cuerpo del maniquí. */
  kind: 'hombre' | 'mujer'
  client?: Client
  shoes: string
  shoesText: string
  scene: LookScene
  sceneText: string
  angles: LookAngle[]
  /** Mano o pose: la prenda de arriba abierta, capucha puesta… */
  extra: string
}

const VIEW_LABEL = Object.fromEntries(VIEWS.map((v) => [v.id, v.label.toLowerCase()])) as Record<View, string>
const label = (list: readonly { id: string; label: string }[], id: string | undefined) => list.find((x) => x.id === id)?.label ?? id ?? ''
/** Primera familia de una pila CSS: `'Anton', sans-serif` → Anton. */
const fontName = (stack: string) => stack.split(',')[0].replace(/['"]/g, '').trim()
const cm = (n: number) => `${Math.round(n)} cm`

/**
 * Nombre aproximado de un color (`#3B5B86` → «azul medio»), para los que no tienen nombre: la IA entiende mejor
 * una palabra que un código, y el código va al lado para afinar.
 */
export function colorWords(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return ''
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (l < 0.1) return 'negro'
  if (l > 0.93 && sat < 0.5) return 'blanco'
  if (sat < 0.12) return l < 0.3 ? 'gris muy oscuro' : l < 0.5 ? 'gris oscuro' : l < 0.72 ? 'gris medio' : l < 0.86 ? 'gris claro' : 'gris perla'
  let h = 0
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  // Tonos tierra: naranjas y amarillos apagados u oscuros
  const earthy = h >= 15 && h < 65 && (sat < 0.45 || l < 0.4)
  let name: string
  if (earthy) name = l > 0.7 ? 'beige' : l > 0.5 ? 'camel' : l > 0.3 ? 'marrón' : 'marrón chocolate'
  else if (h < 12 || h >= 345) name = l > 0.75 ? 'rosa' : 'rojo'
  else if (h < 40) name = 'naranja'
  else if (h < 65) name = 'amarillo'
  else if (h < 90) name = 'verde lima'
  else if (h < 160) name = sat < 0.35 ? 'verde oliva' : 'verde'
  else if (h < 195) name = 'turquesa'
  else if (h < 250) name = sat < 0.3 ? 'azul grisáceo' : 'azul'
  else if (h < 290) name = 'morado'
  else name = l > 0.7 ? 'rosa' : 'fucsia'
  if (earthy) return name
  const tone = l < 0.22 ? ' muy oscuro' : l < 0.38 ? ' oscuro' : l > 0.8 ? ' muy claro' : l > 0.65 ? ' claro' : ' medio'
  // El azul muy oscuro es marino; el rojo oscuro, burdeos
  if (name === 'azul' && l < 0.3) return 'azul marino'
  if (name === 'rojo' && l < 0.3) return 'burdeos'
  return name + tone
}

/** Color con su nombre y código: «Negro (#111111, Pantone 19-4007)» o, sin nombre, «azul medio (#3B5B86)». */
function colorText(c: { color: string; colorName?: string; colorCode?: string }) {
  const { name, code } = colorLabel(c)
  const extra = [c.color.toUpperCase(), code].filter(Boolean).join(', ')
  return `${name || colorWords(c.color)} (${extra})`
}

/** Tejido de una pieza: nombre, composición y gramaje. */
function materialText(t: GarmentTemplate, piece: string, style: PieceStyle, library: Map<string, Material>) {
  const m = resolveMaterial(t.id, piece, style.materialId, library)
  if (m.library) {
    const l = m.library
    const parts = [l.composition, l.weightGsm ? `${l.weightGsm} g/m²` : '', m.catalog && l.look ? `aspecto de ${m.catalog.name.toLowerCase()}` : '']
    return [l.name, ...parts].filter(Boolean).join(', ')
  }
  return [m.catalog.name, m.catalog.composition, m.catalog.weight].filter(Boolean).join(', ')
}

/** Descripción de una pieza: color, tejido, superficie y lavado. */
function pieceText(t: GarmentTemplate, piece: string, style: PieceStyle, library: Map<string, Material>) {
  // Botones, cremalleras y demás fornituras son de un material, no de un tejido
  const def = t.pieces.find((p) => p.id === piece)
  const trim = !!def && def.materials.length > 0 && def.materials.every((c) => c !== 'tejido')
  const parts = [`color ${colorText(style)}`, `${trim ? 'material' : 'tejido'} ${materialText(t, piece, style, library)}`]
  const s = style.surface
  if (s && s.kind !== 'liso') {
    const colors = [s.color2, s.kind === 'camuflaje' || s.kind === 'tiedye' ? s.color3 : ''].filter(Boolean).map((c) => colorText({ color: c }))
    parts.push(`con estampado de ${label(SURFACE_KINDS, s.kind).toLowerCase()}${colors.length ? ` (con ${colors.join(' y ')})` : ''}${s.size ? `, motivo de unos ${cm(s.size)}` : ''}`)
  }
  if (style.wash && style.wash.kind !== 'ninguno' && style.wash.amount > 0) {
    const amount = style.wash.amount > 0.66 ? 'muy marcado' : style.wash.amount > 0.33 ? 'medio' : 'suave'
    parts.push(`lavado ${label(WASH_KINDS, style.wash.kind).toLowerCase()} ${amount}`)
  }
  return parts.join(', ')
}

/** Lo más cercano de las posiciones habituales de estampado de esa vista («pecho izquierdo», «centro espalda»…). */
function zoneOf(t: GarmentTemplate, view: View, x: number, y: number) {
  const zones = t.printZones[view] ?? []
  let best: { label: string; d: number } | null = null
  for (const z of zones) {
    const d = Math.hypot(z.x - x, z.y - y)
    if (!best || d < best.d) best = { label: z.label, d }
  }
  // Lejos de todas: solo la vista
  return best && best.d < 30 * unitsOf(t) ? best.label.toLowerCase() : ''
}

/** Todo lo que se sabe de una prenda, en líneas. */
export function garmentLines(design: Design, library: Map<string, Material>): string[] {
  const t = getTemplate(design.template)
  if (!t) return []
  const d = design.data
  const out: string[] = []
  // Corte y opciones (las de sí/no, solo si están puestas)
  const opts: string[] = []
  for (const o of t.options) {
    if (o.id === 'genero') continue
    const v = d.options[o.id] ?? o.default
    if (o.type === 'choice') {
      const c = o.choices.find((x) => x.id === v)
      if (c) opts.push(`${o.label.toLowerCase()}: ${c.label.toLowerCase()}`)
    } else if (v === true) opts.push(o.label.toLowerCase())
  }
  if (opts.length) out.push(`Corte y detalles de patrón: ${opts.join('; ')}.`)

  // Piezas: las que van igual se juntan («cuerpo, mangas y capucha: …»)
  const groups = new Map<string, string[]>()
  for (const id of t.activePieces({ ...Object.fromEntries(t.options.map((o) => [o.id, o.default])), ...d.options })) {
    const def = t.pieces.find((p) => p.id === id)
    if (!def) continue
    const style: PieceStyle = d.pieces[id] ?? { color: def.defaultColor, materialId: null }
    const text = pieceText(t, id, style, library)
    groups.set(text, [...(groups.get(text) ?? []), def.label.toLowerCase()])
  }
  for (const [text, names] of groups) {
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]
    out.push(`${who.charAt(0).toUpperCase()}${who.slice(1)}: ${text}.`)
  }

  for (const b of d.blocks ?? []) {
    const def = t.pieces.find((p) => p.id === b.piece)
    out.push(`Bloque de color en ${def?.label.toLowerCase() ?? b.piece} (${VIEW_LABEL[b.view]}): una parte de la pieza va en ${colorText(b)}, dividida con una línea recta (ver dibujo).`)
  }

  // Estampados
  for (const p of (d.prints ?? []).filter((p) => !p.hidden)) {
    const where = [VIEW_LABEL[p.view], zoneOf(t, p.view, p.x, p.y)].filter(Boolean).join(', ')
    const size = `de unos ${cm(p.w / unitsOf(t))} de ancho`
    const tech = label(TECHNIQUES, p.technique).toLowerCase()
    if (p.kind === 'text') {
      const style = [p.bold ? 'negrita' : '', p.italic ? 'cursiva' : '', p.arc ? 'en arco' : '', p.vertical ? 'en vertical' : '', p.stroke ? `con contorno ${colorText({ color: p.stroke })}` : ''].filter(Boolean)
      out.push(`Texto «${p.text}» (${where}), tipografía ${fontName(p.font)}${style.length ? `, ${style.join(', ')}` : ''}, color ${colorText({ color: p.color })}, ${size}, en ${tech}. Las letras tienen que salir exactamente así.`)
    } else {
      out.push(`Gráfico (${where}), ${size}, en ${tech}: cópialo tal cual de la imagen de referencia, sin cambiarlo.`)
    }
  }

  // Detalles y fornituras puestos a mano
  for (const x of (d.details ?? []).filter((x) => !x.hidden)) {
    const style = label(DETAIL_STYLES[x.kind] ?? [], x.style).toLowerCase()
    const what = [label(DETAIL_KINDS, x.kind), style].filter(Boolean).join(' ')
    const zone = zoneOf(t, x.view, x.x, x.y)
    out.push(`${what} (${[VIEW_LABEL[x.view], zone].filter(Boolean).join(', ')}), color ${colorText({ color: x.color })}${x.text ? `, con el texto «${x.text}»` : ''}.`)
  }
  const hw = d.hardware
  if (hw?.buttons) out.push(`Botones de la prenda: ${label(DETAIL_STYLES.boton ?? [], hw.buttons).toLowerCase()}.`)
  if (hw?.zip) out.push(`Cremallera de la prenda: ${label(DETAIL_STYLES.cremallera ?? [], hw.zip).toLowerCase()}.`)

  const notes = (d.callouts ?? []).filter((c) => !c.hidden && c.text.trim()).map((c) => c.text.trim())
  if (notes.length) out.push(`Notas del dibujo: ${notes.join(' · ')}.`)
  if (d.notes.trim()) out.push(`Notas del diseño: ${d.notes.trim()}`)
  return out
}

/** Nombre de archivo de la imagen de referencia de una prenda. */
export function referenceFile(index: number, design: Design) {
  const base = design.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `referencia-${index + 1}-${base || 'prenda'}.png`
}

/** El texto completo para la IA. */
export function lookPrompt(i: LookInput): string {
  const woman = i.kind === 'mujer'
  const m = i.client?.measurements ?? {}
  const body = [m.altura ? `${m.altura} cm de altura` : '', m.peso ? `${m.peso} kg` : '', m.pecho ? `pecho ${m.pecho} cm` : '', m.cintura ? `cintura ${m.cintura} cm` : '', m.cadera ? `cadera ${m.cadera} cm` : ''].filter(Boolean)
  const scene = i.scene === 'otro' ? i.sceneText.trim() || 'un fondo neutro de estudio' : LOOK_SCENES.find((s) => s.id === i.scene)!.text
  const shoes = i.shoes === 'otro' ? i.shoesText.trim() : i.shoes ? `${LOOK_SHOES.find((s) => s.id === i.shoes)?.label.toLowerCase()}${i.shoesText.trim() ? `, ${i.shoesText.trim()}` : ''}` : ''
  const angles = LOOK_ANGLES.filter((a) => i.angles.includes(a.id))

  const lines: string[] = []
  lines.push(
    `Fotografía de moda realista, de calidad editorial (como una foto hecha con cámara réflex, objetivo de 50–85 mm, nitidez alta y colores naturales). ` +
      `Protagonista: un maniquí de tienda de cuerpo entero SIN ROSTRO (cabeza lisa y ovalada, sin ojos, nariz, boca ni pelo), acabado blanco mate, ` +
      `con proporciones ${woman ? 'de mujer' : 'de hombre'} realistas${body.length ? ` (${body.join(', ')})` : ''}, ` +
      `de pie en una postura recta y natural, con los brazos relajados a los lados.`,
  )
  lines.push('')
  lines.push(`Escenario: ${scene}.`)
  lines.push('')
  lines.push(
    `El maniquí lleva EXACTAMENTE el outfit que se describe abajo. Te adjunto los dibujos técnicos de cada prenda (delantero y espalda) como imágenes de referencia: ` +
      `respeta su forma, proporciones, largos, colores, tejidos, estampados, costuras y fornituras. No añadas logos, textos, bolsillos ni prendas que no estén ` +
      `descritos, y no cambies ningún color. La ropa tiene que verse como ropa real puesta: con su peso, caída y arrugas naturales del tejido, costuras y pespuntes visibles.`,
  )
  i.items.forEach(({ role, design }, n) => {
    const t = getTemplate(design.template)
    lines.push('')
    lines.push(`${n + 1}. ${role}: ${t?.name ?? design.template} «${design.name}» (imagen de referencia: ${referenceFile(n, design)})`)
    for (const l of garmentLines(design, i.materials)) lines.push(`   - ${l}`)
  })
  if (shoes) {
    lines.push('')
    lines.push(`Calzado: ${shoes}.`)
  }
  if (i.extra.trim()) {
    lines.push('')
    lines.push(`Además: ${i.extra.trim()}`)
  }
  lines.push('')
  if (angles.length > 1) {
    lines.push(`Haz ${angles.length} imágenes, una por cada vista, con el MISMO maniquí, la MISMA ropa, el mismo escenario y la misma luz en todas:`)
    angles.forEach((a, k) => lines.push(`   ${k + 1}. ${a.text.charAt(0).toUpperCase()}${a.text.slice(1)}.`))
  } else if (angles.length === 1) {
    lines.push(`Vista: ${angles[0].text}.`)
  }
  lines.push(`Formato vertical 4:5, cámara a la altura del pecho, el maniquí entero dentro del encuadre (cabeza y pies sin cortar), sin texto ni marcas de agua.`)
  return lines.join('\n')
}

/**
 * Foto de producto: la prenda sola (sin el maniquí del Lookbook), a partir del dibujo del lienzo, como las fotos
 * hiperrealistas de catálogo: colgada en una pared, en el suelo, con maniquí invisible o puesta en la calle.
 */
export const PRODUCT_SHOTS = [
  {
    id: 'colgada',
    label: 'Colgada en pared de hormigón',
    text: 'La prenda cuelga de una percha invisible delante de una pared de hormigón gris claro, de frente y centrada, con luz natural suave de ventana desde la izquierda y una sombra suave en la pared.',
  },
  {
    id: 'flatlay',
    label: 'Flat lay en el suelo',
    text: 'La prenda está extendida en el suelo (flat lay) sobre hormigón pulido gris claro, vista desde arriba, bien colocada y simétrica, con alguna arruga natural y luz suave desde arriba.',
  },
  {
    id: 'fantasma',
    label: 'Maniquí invisible (estudio)',
    text: 'Foto de catálogo con maniquí invisible (ghost mannequin): la prenda tiene la forma de ir puesta pero no se ve ningún cuerpo, fondo blanco puro de estudio, luz suave y uniforme y una sombra muy suave debajo.',
  },
  {
    id: 'modelo',
    label: 'Con modelo en la calle',
    text: 'La lleva puesta un modelo en una calle urbana, de cuerpo entero o tres cuartos, con luz natural de tarde y ambiente de editorial streetwear (la cara puede quedar fuera de plano).',
  },
] as const
export type ProductShot = (typeof PRODUCT_SHOTS)[number]['id']

/** Acabados del tejido que se pueden pedir. */
export const PRODUCT_FINISHES = [
  { id: '', label: 'Según el diseño' },
  { id: 'lavado', label: 'Lavado vintage', text: 'felpa de algodón gruesa con acabado lavado vintage (desteñido suave y uniforme)' },
  { id: 'nuevo', label: 'Nuevo y limpio', text: 'tejido nuevo, limpio y sin desgaste, con los colores intensos' },
  { id: 'acid', label: 'Acid wash', text: 'acabado acid wash: desteñido a manchas, marcado' },
  { id: 'premium', label: 'Felpa gruesa premium', text: 'felpa de algodón gruesa y pesada (unos 450 g/m²), de caída firme' },
] as const

export interface ProductInput {
  design: Design
  materials: Map<string, Material>
  shot: ProductShot
  finish: string
  /** Mantener el diseño exacto: que la IA no cambie nada del dibujo. */
  exact: boolean
  extra: string
}

/** El texto para pasar de un dibujo de la prenda a una foto de producto hiperrealista. */
export function productPrompt(i: ProductInput): string {
  const t = getTemplate(i.design.template)
  const shot = PRODUCT_SHOTS.find((s) => s.id === i.shot) ?? PRODUCT_SHOTS[0]
  const finish = PRODUCT_FINISHES.find((f) => f.id === i.finish)
  const lines: string[] = []
  lines.push('Convierte este dibujo de una prenda (te lo adjunto) en una fotografía de producto hiperrealista.')
  lines.push('')
  lines.push(
    i.exact
      ? 'Mantén EXACTAMENTE el diseño: la misma forma, el mismo largo y corte, los mismos colores, el logo y el texto idénticos y en el mismo sitio y tamaño, la misma cremallera, cordones, bolsillos, costuras y forro (con su estampado). No añadas ni quites ningún elemento ni texto, y no cambies ningún color.'
      : 'Usa el dibujo como guía del diseño: respeta la forma, los colores, los logos y los textos; puedes resolver con naturalidad los detalles pequeños que el dibujo no deja claros.',
  )
  lines.push('')
  lines.push(`La prenda: ${t?.name ?? i.design.template} «${i.design.name}».`)
  for (const l of garmentLines(i.design, i.materials)) lines.push(`   - ${l}`)
  lines.push('')
  lines.push(
    `Tejido: ${finish && 'text' in finish ? finish.text : 'el de la descripción'}, con su textura real, pliegues naturales, costuras con relieve y un ligero desgaste en los bordes.`,
  )
  lines.push('')
  lines.push(shot.text)
  if (i.extra.trim()) {
    lines.push('')
    lines.push(`Además: ${i.extra.trim()}`)
  }
  lines.push('')
  lines.push('Fotografía de catálogo, cámara de 50 mm, enfoque nítido, alta resolución y colores fieles. Sin personas (salvo en la foto con modelo), sin marcas de agua ni texto añadido.')
  return lines.join('\n')
}
