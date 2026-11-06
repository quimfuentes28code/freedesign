import type { DesignData } from '../shared/designs'
import type { Material } from '../shared/library'
import type { Design, Fit, GarmentSlot, GarmentType, Measurements, SlotStyle, TopShape, TopClosure, PantsShape, FemTopShape } from '../types'
import type { Measurements as ClientMeasurements } from '../shared/clients'
import type { Body } from '../production/measurements'
import { resolveMaterial } from './materials'
import { pieceTile } from './surfaces'
import { QUILT_SHAPES } from './quilt'
import { UNITS_PER_CM } from './prints'
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
  if (t.id === 'chaleco') return 'chaleco'
  if (t.id === 'top') return 'top'
  return opt(t, data.options, 'manga') === 'corta' ? 'camiseta' : 'manga-larga'
}

/**
 * Acabados en 3D de cada prenda de arriba con mangas (se cosen con patrón, como la sudadera): bajo, puños y cuello.
 * Los cuellos de camisa, las tapetas y el volumen del acolchado aún son aproximados.
 */
function topShapeOf(t: GarmentTemplate, o: DesignData['options']): TopShape | undefined {
  const v = (id: string) => String(opt(t, o, id) ?? '')
  const ribbed = v('punos') === 'canale'
  const fit = { neckFit: (v('ajusteCuello') || 'holgado') as 'cenido' | 'holgado' }
  switch (t.id) {
    case 'sudadera':
      return {
        ...fit,
        hem: ribbed ? 'canale' : 'dobladillo',
        cuff: ribbed ? 'canale' : 'dobladillo',
        neck: v('cuelloSin') === 'alto' ? 'alto' : v('cuelloSin') === 'polo' ? 'camisa' : 'canale',
        closure: zip(v('cremallera'), 22),
      }
    case 'camiseta':
      return { ...fit, hem: 'dobladillo', cuff: 'dobladillo', neck: v('cuello') === 'alto' ? 'alto' : 'canale' }
    case 'polo': {
      // Tapeta corta: unos 4 cm por botón
      const n = Number(v('botones')) || 3
      return {
        hem: 'dobladillo',
        cuff: ribbed ? 'canale' : 'dobladillo',
        ...mao(v('cuello')),
        closure: { kind: 'botones', full: false, length: 5 + n * 3.6, buttons: n, buttonSize: 1.1, placket: true },
        chestPocket: opt<boolean>(t, o, 'bolsillo') ? 'uno' : undefined,
      }
    }
    case 'camisa':
      return {
        hem: 'dobladillo',
        cuff: v('manga') === 'corta' ? 'dobladillo' : 'puno',
        ...mao(v('cuello')),
        closure: { kind: 'botones', full: true, buttons: 7, buttonSize: 1.05, placket: true },
        chestPocket: opt<boolean>(t, o, 'bolsillo') ? 'uno' : undefined,
      }
    case 'bomber':
      // El canalé de la bomber es un cuello bajo (unos 4,5 cm); el «alto», uno de chaqueta
      return {
        ...fit,
        hem: 'canale',
        cuff: 'canale',
        neck: v('cuello') === 'solapa' ? 'camisa' : 'alto',
        ...(v('cuello') === 'canale' ? { neckHeight: 4.5 } : {}),
        closure: jacket(v('cierre')),
      }
    // El «ribete elástico» recoge la muñeca y el bajo, como un puño y una pretina finos
    case 'puffer':
      return { ...fit, hem: ribbed ? 'canale' : 'pretina', cuff: ribbed ? 'canale' : 'puno', neck: 'alto', padded: true, quilt: quiltOf(o, t), closure: zip('completa') }
    case 'cazadora':
      return {
        hem: v('bajo') === 'pretina' ? 'pretina' : 'dobladillo',
        flatBand: v('bajo') === 'pretina',
        // Puño con botón o sin puño (la manga acaba en un dobladillo)
        cuff: v('punos') === 'sin' ? 'dobladillo' : 'puno',
        ...mao(v('cuello')),
        closure: { kind: 'botones', full: true, buttons: 6, buttonSize: 1.6, placket: true },
        chestPocket: v('bolsillos') === 'pecho-tapeta' ? 'dos' : undefined,
      }
    case 'chaleco': {
      const neck = v('cuello')
      return {
        ...fit,
        hem: v('bajo') === 'canale' ? 'canale' : 'dobladillo',
        cuff: 'dobladillo',
        neck: neck === 'alto' ? 'alto' : 'canale',
        sleeveless: true,
        closure: jacket(v('cierre')),
        ...(v('tipo') === 'acolchado' ? { padded: true, quilt: quiltOf(o, t) } : {}),
      }
    }
    case 'cortavientos':
      return { ...fit, hem: ribbed ? 'canale' : 'pretina', cuff: ribbed ? 'canale' : 'puno', neck: 'alto', closure: zip(v('cremallera'), 25) }
  }
  return undefined
}

/** Cremallera entera, media (los cm del escote hacia abajo) o ninguna. */
const zip = (kind: string, half = 22): TopClosure | undefined =>
  kind === 'completa' ? { kind: 'cremallera', full: true } : kind === 'media' ? { kind: 'cremallera', full: false, length: half } : undefined

/** Cierre de chaqueta: cremallera entera o botones grandes con tapeta. */
const jacket = (cierre: string): TopClosure =>
  cierre === 'botones' ? { kind: 'botones', full: true, buttons: 5, buttonSize: 1.5, placket: true } : { kind: 'cremallera', full: true }

/** Cuello mao (una tira recta de pie, algo separada del cuello) o de camisa (con su pala). */
const mao = (cuello: string): Pick<TopShape, 'neck' | 'neckFit' | 'neckHeight'> =>
  cuello === 'mao' ? { neck: 'alto', neckFit: 'holgado', neckHeight: 3.5 } : { neck: 'camisa' }

/** Corte y acabados en 3D de un pantalón (se cose con patrón; ver three/cloth/pants.ts). */
function pantsShapeOf(t: GarmentTemplate, o: DesignData['options']): PantsShape {
  const v = (id: string) => String(opt(t, o, id) ?? '')
  const cut = v('corte')
  const leg: PantsShape['leg'] = cut === 'slim' ? 'slim' : cut === 'baggy' ? 'baggy' : cut === 'ancho' || t.id !== 'pantalon' ? (cut === 'regular' ? 'regular' : 'ancho') : 'regular'
  const cuff: PantsShape['cuff'] = v('bajo') === 'puno' ? 'puno' : v('bajo') === 'vuelto' ? 'vuelto' : 'recto'
  const waist: PantsShape['waist'] = v('cintura') === 'trabillas' ? 'trabillas' : 'elastica'
  return { leg, cuff, waist }
}

/** Canales del acolchado en 3D, con la forma y el ancho del Diseñador (los dibujados a mano aún no salen en 3D). */
function quiltOf(o: DesignData['options'], t: GarmentTemplate) {
  const shape = QUILT_SHAPES.findIndex((q) => q.id === opt(t, o, 'formaCanales'))
  if (shape < 0 || QUILT_SHAPES[shape].id === 'libre') return undefined
  // Separación de los canales del dibujo (unidades del lienzo) en cm
  const step = ({ estrechos: 22, medios: 28, anchos: 34 }[String(opt(t, o, 'canales'))] ?? 34) / UNITS_PER_CM
  return { shape, step }
}

/** Capucha en 3D: la sudadera con capucha y las chaquetas con el cuello «capucha». */
const hasHood = (t: GarmentTemplate, o: DesignData['options']) =>
  t.id === 'sudadera' ? !!opt<boolean>(t, o, 'capucha') : ['bomber', 'puffer', 'cortavientos', 'chaleco'].includes(t.id) && opt(t, o, 'cuello') === 'capucha'

/** Prendas base que en 3D se ven con una forma aproximada (sin su cuello, tapeta, acolchado…). */
export const hasOwn3D = (t: GarmentTemplate) =>
  ['sudadera', 'camiseta', 'polo', 'camisa', 'bomber', 'puffer', 'cazadora', 'cortavientos', 'chaleco', 'top', 'pantalon', 'pantalon-ancho', 'pantalon-corto'].includes(t.id)

/** Parte de la pierna que cubre el pantalón (de la entrepierna al tobillo). */
const LEG_LENGTH: Record<string, number> = { mini: 0.2, corto: 0.32, bermuda: 0.55, tobillero: 0.93 }

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
  botones: 'botones',
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
    const color = style?.color ?? p.defaultColor
    // Superficie (rayas, camuflaje…) y lavado: el mismo azulejo que en el dibujo, como textura de la tela
    const tile = style ? pieceTile(style) : null
    pieces[slot] = { color, look: catalog.look, ...(tile ? { tile: { canvas: tile.canvas, cm: tile.cm, key: tile.key, angle: style?.surface?.angle ?? 0, stretch: tile.stretch } } : {}) }
  }
  // Puños y bajo sin canalé (dobladillo): se ven como el cuerpo o las mangas
  pieces.punos ??= pieces.mangas ?? pieces.cuerpo
  pieces.bajo ??= pieces.cuerpo
  pieces.cuello ??= pieces.cuerpo

  const hood = hasHood(t, data.options)
  const top = t.family === 'top' ? topShapeOf(t, data.options) : undefined
  // Manga corta: del hombro a medio bíceps
  const short = top && t.id !== 'sudadera' && ['puffer', 'bomber', 'cazadora', 'cortavientos'].every((id) => id !== t.id) && opt(t, data.options, 'manga') !== 'larga'
  return {
    garment: garmentOf(t, data),
    fit: FIT[String(opt(t, data.options, 'corte'))] ?? 'normal',
    fabric: 'felpa',
    color: pieces.cuerpo?.color ?? '#cccccc',
    hood,
    pocket: ['sudadera', 'cortavientos'].includes(t.id) && opt(t, data.options, 'bolsillo') === 'canguro',
    cords: hood && opt<boolean>(t, data.options, 'cordones') !== false,
    hoodCross: hood && opt<boolean>(t, data.options, 'capuchaCruzada') === true,
    hoodCollar: hood && opt<boolean>(t, data.options, 'cuelloAltoCapucha') === true,
    top,
    pants: isPants(t) ? pantsShapeOf(t, data.options) : undefined,
    femTop:
      t.id === 'top'
        ? {
            kind: opt(t, data.options, 'tipo') as FemTopShape['kind'],
            neckline: opt(t, data.options, 'escote') as FemTopShape['neckline'],
            straps: opt(t, data.options, 'tirantes') as FemTopShape['straps'],
            fit: opt(t, data.options, 'corte') as FemTopShape['fit'],
          }
        : undefined,
    // Top: largo desde la axila (crop, a la cintura o a la cadera); el resto, del hombro al bajo
    bodyLength: (t.id === 'top' ? ({ crop: 16, cintura: 26, cadera: 40 }[String(opt(t, data.options, 'largo'))] ?? 16) : (BODY_LENGTH[String(opt(t, data.options, 'largo'))] ?? 70)) * s.length,
    sleeveLength: (short ? 24 : 64) * s.sleeve,
    chestScale: isPants(t) ? s.hip : s.width,
    legLength: isPants(t) ? (LEG_LENGTH[String(opt(t, data.options, 'largo'))] ?? 1) * s.length : undefined,
    pieces,
  }
}

/** Maniquí de hombre de partida: 180 cm y unos 80 kg (talla M-L), con su cuello, espalda y talle. */
export const DEFAULT_MEASUREMENTS: Measurements = { height: 180, chest: 102, waist: 88, hips: 103, neck: 40, backWidth: 45, backLength: 45 }
/** Maniquí de mujer de partida: 165 cm y unos 60 kg (talla S-M), con busto, bajo pecho, cintura y cadera de mujer. */
export const FEMALE_MEASUREMENTS: Measurements = { height: 165, chest: 88, waist: 68, hips: 96, female: true, underbust: 74, neck: 33, backWidth: 35, backLength: 40 }

/** Medidas del maniquí: las del cliente del diseño si las tiene, si no unas medias (de hombre o de mujer). */
export function mannequinMeasurements(m?: ClientMeasurements, kind: 'hombre' | 'mujer' = 'hombre'): Measurements {
  const def = kind === 'mujer' ? FEMALE_MEASUREMENTS : DEFAULT_MEASUREMENTS
  const opt = (v: number | undefined, min: number, max: number) => (v ? Math.min(max, Math.max(min, v)) : undefined)
  const clamp = (v: number | undefined, min: number, max: number, d: number) => (v ? Math.min(max, Math.max(min, v)) : d)
  return {
    height: clamp(m?.altura, 140, 210, def.height),
    chest: clamp(m?.pecho, 70, 150, def.chest),
    waist: clamp(m?.cintura, 50, 130, def.waist),
    hips: clamp(m?.cadera, 70, 150, def.hips),
    female: kind === 'mujer',
    // El maniquí también sigue el bajo pecho (tamaño del pecho), el cuello, la espalda y el talle
    underbust: opt(m?.bajoPecho, 55, 130) ?? def.underbust,
    neck: opt(m?.cuello, 28, 50) ?? def.neck,
    backWidth: opt(m?.anchoEspalda, 28, 55) ?? def.backWidth,
    backLength: opt(m?.talleEspalda, 32, 52) ?? def.backLength,
  }
}
