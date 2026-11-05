import type { DesignData } from '../shared/designs'
import { getTemplate } from './templates'
import type { GarmentTemplate } from './types'

/**
 * Outfit al azar para la portada: una prenda de arriba y un pantalón de las prendas base, con una combinación de
 * colores sobria (tonos de colección: negros, crudos, camel, verde, granate…).
 */

const TOPS_MAN = ['sudadera', 'camiseta', 'bomber', 'puffer', 'polo', 'camisa', 'cazadora', 'cortavientos', 'chaleco']
const TOPS_WOMAN = [...TOPS_MAN, 'top']
const BOTTOMS = ['pantalon', 'pantalon-ancho', 'pantalon-corto']

/** [arriba, abajo, detalle] */
const PALETTES: [string, string, string][] = [
  ['#1d1d1f', '#e9e1cf', '#c9a36b'],
  ['#e9e1cf', '#2e2f31', '#1d1d1f'],
  ['#2f4a3a', '#e9e1cf', '#1d1d1f'],
  ['#8b6a4a', '#1d1d1f', '#e9e1cf'],
  ['#f2efe8', '#1f2a44', '#c9a36b'],
  ['#6e2430', '#2e2f31', '#e9e1cf'],
  ['#a9a9a6', '#1d1d1f', '#f2efe8'],
  ['#1f2a44', '#a9a9a6', '#f2efe8'],
  ['#c9b79c', '#4a3a2c', '#1d1d1f'],
  ['#0f0f10', '#0f0f10', '#c9a36b'],
]

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

export interface RandomGarment {
  template: GarmentTemplate
  data: DesignData
}

/** Viste una prenda base con un color principal (y otro para fornituras y puños, a veces). */
function dress(template: GarmentTemplate, color: string, accent: string, genero: string): RandomGarment {
  const pieces: DesignData['pieces'] = {}
  const contrast = Math.random() < 0.35
  for (const p of template.pieces) {
    const trim = !p.materials.includes('tejido')
    const edge = contrast && ['punos', 'bajo', 'cuello', 'cinturilla', 'banda'].includes(p.id)
    pieces[p.id] = { color: trim ? (Math.random() < 0.5 ? accent : p.defaultColor) : edge ? accent : color, materialId: null }
  }
  const options: DesignData['options'] = { genero }
  // Algunas opciones al azar para que no salga siempre igual
  for (const o of template.options) {
    if (o.id === 'genero' || Math.random() < 0.55) continue
    if (o.type === 'choice') options[o.id] = pick(o.choices).id
    else options[o.id] = Math.random() < 0.5
  }
  return { template, data: { options, pieces, notes: '' } }
}

export function randomOutfit(): { kind: 'hombre' | 'mujer'; top: RandomGarment; bottom: RandomGarment } {
  const kind = Math.random() < 0.5 ? 'mujer' : 'hombre'
  const [up, down, accent] = pick(PALETTES)
  const topT = getTemplate(pick(kind === 'mujer' ? TOPS_WOMAN : TOPS_MAN))!
  const bottomT = getTemplate(pick(BOTTOMS))!
  return { kind, top: dress(topT, up, accent, kind), bottom: dress(bottomT, down, accent, kind) }
}
