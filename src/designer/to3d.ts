import type { DesignData } from '../shared/designs'
import type { Material } from '../shared/library'
import type { Design, Fit, GarmentSlot, GarmentType, Measurements, SlotStyle } from '../types'
import type { Measurements as ClientMeasurements } from '../shared/clients'
import type { Body } from '../production/measurements'
import { resolveMaterial } from './materials'
import { drawScale } from './measures'
import { opt, type GarmentTemplate } from './types'

/**
 * Convierte un diseño del Diseñador (plano 2D) en la prenda de la vista 3D: prenda base, corte, largos,
 * detalles y el color y material de cada pieza. Así las dos vistas muestran siempre lo mismo.
 */

/** Prenda 3D con la que se ve cada prenda base (la bomber aún no tiene modelo propio: se ve como manga larga). */
function garmentOf(t: GarmentTemplate, data: DesignData): GarmentType {
  switch (t.id) {
    case 'sudadera':
      return 'sudadera'
    case 'camiseta':
      return opt(t, data.options, 'manga') === 'larga' ? 'manga-larga' : 'camiseta'
    case 'pantalon':
      return 'pantalon'
    default:
      return 'manga-larga'
  }
}

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
    chestScale: t.id === 'pantalon' ? s.hip : s.width,
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
