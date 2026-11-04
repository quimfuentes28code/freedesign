import type { DesignData } from '../shared/designs'
import type { Material } from '../shared/library'
import type { Design, Fit, GarmentSlot, GarmentType, Measurements, SlotStyle } from '../types'
import type { Measurements as ClientMeasurements } from '../shared/clients'
import type { Body } from '../production/measurements'
import { resolveMaterial } from './materials'
import { drawScale } from './measures'
import { isPants, opt, type GarmentTemplate } from './types'

/**
 * Convierte un diseño del Diseñador (plano 2D) en la prenda de la vista 3D: prenda base, corte, largos,
 * detalles y el color y material de cada pieza. Así las dos vistas muestran siempre lo mismo.
 */

/**
 * Prenda 3D con la que se ve cada prenda base. Solo la sudadera tiene patrón propio; las demás se ven con la forma
 * más parecida (manga corta o larga, o pantalón) y su largo.
 */
function garmentOf(t: GarmentTemplate, data: DesignData): GarmentType {
  if (isPants(t)) return 'pantalon'
  if (t.id === 'sudadera') return 'sudadera'
  return opt(t, data.options, 'manga') === 'corta' ? 'camiseta' : 'manga-larga'
}

/** Prendas base que en 3D se ven con una forma aproximada (sin su cuello, tapeta, acolchado…). */
export const hasOwn3D = (t: GarmentTemplate) => t.id === 'sudadera' || t.id === 'camiseta' || t.id === 'pantalon'

/** Parte de la pierna que cubre el pantalón (de la entrepierna al tobillo). */
const LEG_LENGTH: Record<string, number> = { corto: 0.32, bermuda: 0.55, tobillero: 0.93 }

const FIT: Record<string, Fit> = {
  ajustado: 'ajustado',
  slim: 'ajustado',
  regular: 'normal',
  boxy: 'holgado',
  oversize: 'holgado',
  ancho: 'holgado',
  baggy: 'holgado',
}

const BODY_LENGTH: Record<string, number> = { crop: 58, normal: 70, largo: 78 }

/** Pieza del Diseñador → zona de la prenda 3D. */
const SLOT_OF: Record<string, GarmentSlot> = {
  cuerpo: 'cuerpo',
  perneras: 'cuerpo',
  mangas: 'mangas',
  capucha: 'capucha',
  cuello: 'cuello',
  bolsillo: 'bolsillo',
  punos: 'punos',
  bajo: 'bajo',
  cordones: 'cordones',
  fornituras: 'ojales',
}

export function designTo3D(t: GarmentTemplate, data: DesignData, library?: Map<string, Material>, body?: Body): Design {
  // Medidas propias del diseño: estiran largo, mangas y ancho igual que en el dibujo
  const s = drawScale(t, data, body)
  const active = t.activePieces(data.options)
  const pieces: Partial<Record<GarmentSlot, SlotStyle>> = {}
  for (const p of t.pieces) {
    const slot = SLOT_OF[p.id]
    // Las fornituras (cremallera, remates) dan su metal a los ojales aunque no haya cremallera
    if (!slot || (!active.includes(p.id) && slot !== 'ojales') || pieces[slot]) continue
    const style = data.pieces[p.id]
    const { catalog } = resolveMaterial(t.id, p.id, style?.materialId, library)
    pieces[slot] = { color: style?.color ?? p.defaultColor, look: catalog.look }
  }
  // Puños y bajo sin canalé (dobladillo): se ven como el cuerpo o las mangas
  pieces.punos ??= pieces.mangas ?? pieces.cuerpo
  pieces.bajo ??= pieces.cuerpo
  pieces.cuello ??= pieces.cuerpo

  const hood = t.id === 'sudadera' && opt<boolean>(t, data.options, 'capucha')
  return {
    garment: garmentOf(t, data),
    fit: FIT[String(opt(t, data.options, 'corte'))] ?? 'normal',
    fabric: 'felpa',
    color: pieces.cuerpo?.color ?? '#cccccc',
    hood,
    pocket: t.id === 'sudadera' && opt(t, data.options, 'bolsillo') === 'canguro',
    cords: hood && opt<boolean>(t, data.options, 'cordones'),
    bodyLength: (BODY_LENGTH[String(opt(t, data.options, 'largo'))] ?? 70) * s.length,
    sleeveLength: 64 * s.sleeve,
    chestScale: isPants(t) ? s.hip : s.width,
    legLength: isPants(t) ? (LEG_LENGTH[String(opt(t, data.options, 'largo'))] ?? 1) * s.length : undefined,
    pieces,
  }
}

export const DEFAULT_MEASUREMENTS: Measurements = { height: 172, chest: 92, waist: 76, hips: 98 }

/** Medidas del maniquí: las del cliente del diseño si las tiene, si no unas medias. */
export function mannequinMeasurements(m?: ClientMeasurements): Measurements {
  const clamp = (v: number | undefined, min: number, max: number, def: number) => (v ? Math.min(max, Math.max(min, v)) : def)
  return {
    height: clamp(m?.altura, 140, 210, DEFAULT_MEASUREMENTS.height),
    chest: clamp(m?.pecho, 70, 140, DEFAULT_MEASUREMENTS.chest),
    waist: clamp(m?.cintura, 50, 130, DEFAULT_MEASUREMENTS.waist),
    hips: clamp(m?.cadera, 70, 140, DEFAULT_MEASUREMENTS.hips),
  }
}
