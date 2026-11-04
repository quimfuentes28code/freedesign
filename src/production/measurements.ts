import { opt, type GarmentTemplate, type Options } from '../designer/types'
import { MEASUREMENT_GROUPS, type MeasurementKey, type Measurements } from '../shared/clients'
import { SIZES, type Size } from '../shared/production'

/**
 * Medidas de la prenda acabada (puntos de medida de la ficha técnica), calculadas a partir de las medidas del cuerpo
 * (las del cliente o las de una talla estándar) más la holgura que pide cada corte. Todo en cm.
 */

export type Body = Record<MeasurementKey, number>

/** Cuerpo de la talla M (unisex) y cuánto cambia cada medida de una talla a la siguiente. */
const BASE_M: Body = {
  altura: 175, peso: 72, cuello: 39, hombros: 45, pecho: 96, bajoPecho: 86, cintura: 82, cadera: 100,
  talleDelantero: 44, talleEspalda: 42, anchoEspalda: 40, largoBrazo: 61, biceps: 31, antebrazo: 26, muneca: 16,
  tiro: 27, entrepierna: 80, largoPierna: 104, muslo: 58, rodilla: 39, gemelo: 37, tobillo: 24,
}
const GRADE: Body = {
  altura: 4, peso: 6, cuello: 2, hombros: 2, pecho: 6, bajoPecho: 6, cintura: 6, cadera: 6,
  talleDelantero: 1.5, talleEspalda: 1.5, anchoEspalda: 2, largoBrazo: 1.5, biceps: 2, antebrazo: 1.5, muneca: 0.5,
  tiro: 1, entrepierna: 1.5, largoPierna: 2.5, muslo: 3, rodilla: 1.5, gemelo: 1.5, tobillo: 1,
}
const KEYS = Object.keys(BASE_M) as MeasurementKey[]

/** Medidas del cuerpo de una talla estándar. */
export function standardBody(size: Size): Body {
  const step = SIZES.indexOf(size) - SIZES.indexOf('M')
  return Object.fromEntries(KEYS.map((k) => [k, BASE_M[k] + GRADE[k] * step])) as Body
}

/** Talla estándar más parecida a unas medidas (por pecho, cintura o cadera). */
export function nearestSize(m: Measurements): Size {
  const key = (['pecho', 'cintura', 'cadera'] as const).find((k) => m[k])
  if (!key) return 'M'
  let best: Size = 'M'
  for (const s of SIZES) if (Math.abs(standardBody(s)[key] - m[key]!) < Math.abs(standardBody(best)[key] - m[key]!)) best = s
  return best
}

/** Cuerpo del cliente: sus medidas y, las que falten, las de su talla estándar más parecida. */
export function clientBody(m: Measurements) {
  const size = nearestSize(m)
  const std = standardBody(size)
  const missing = KEYS.filter((k) => !m[k])
  return { body: { ...std, ...m } as Body, size, missing }
}

export const measurementLabel = (k: MeasurementKey) =>
  MEASUREMENT_GROUPS.flatMap((g) => g.items as readonly { key: string; label: string }[]).find((i) => i.key === k)?.label ?? k

/** Punto de medida de la ficha. */
export interface Pom {
  id: string
  label: string
  /** Cómo se mide la prenda (para el taller). */
  how: string
  /** Tolerancia ± en cm. */
  tol: number
  /** Medidas del cuerpo de las que depende (para avisar si al cliente le faltan). */
  uses: MeasurementKey[]
  value: (b: Body) => number
}

const half = (n: number) => Math.round(n * 2) / 2

/** Puntos de medida de una prenda con sus opciones. */
export function garmentPoms(t: GarmentTemplate, o: Options): Pom[] {
  const get = <T extends string | boolean>(id: string) => opt<T>(t, o, id)
  return t.family === 'pants' ? pantsPoms(get) : topPoms(t.id, get)
}

type Get = <T extends string | boolean>(id: string) => T

function topPoms(id: string, get: Get): Pom[] {
  const fit = get<string>('corte')
  const chestEase = { ajustado: 8, regular: 14, boxy: 22, oversize: 30 }[fit] ?? 14
  const drop = { ajustado: 0, regular: 1.5, boxy: 4, oversize: 8 }[fit] ?? 1.5
  const bicepsEase = { ajustado: 5, regular: 8, boxy: 12, oversize: 16 }[fit] ?? 8
  const lengthAdd = { crop: 2, normal: 20, largo: 28 }[get<string>('largo') ?? 'normal'] ?? 20
  // Se leen de las opciones de cada prenda (las que no la tienen dan undefined)
  const shortSleeve = get('manga') === 'corta'
  const rib = id === 'bomber' || get('punos') === 'canale'
  const shirtCuff = id === 'camisa' && !shortSleeve
  const hood = (id === 'sudadera' && get<boolean>('capucha')) || get('cuello') === 'capucha'
  const zip = id === 'puffer' || (id === 'bomber' && get('cierre') !== 'botones') ? 'completa' : (get<string>('cremallera') ?? 'ninguna')
  const neck = get<string>('cuello')
  const neckDrop = neck === 'pico' ? 18 : neck === 'cubano' ? 20 : neck === 'solapa' ? 32 : id === 'bomber' ? 8 : 9

  const chest = (b: Body) => b.pecho + chestEase
  const length = (b: Body) => b.talleEspalda + 2 + lengthAdd
  const poms: Pom[] = [
    { id: 'largo', label: 'Largo total', how: 'Desde el punto más alto del hombro (junto al cuello) hasta el bajo', tol: 1, uses: ['talleEspalda'], value: length },
    { id: 'pecho', label: 'Contorno de pecho', how: 'De costado a costado, 2 cm bajo la sisa, ×2', tol: 1.5, uses: ['pecho'], value: chest },
    { id: 'hombros', label: 'Ancho de hombros', how: 'De costura de hombro a costura de hombro', tol: 1, uses: ['hombros'], value: (b) => b.hombros + drop * 2 },
    {
      id: 'manga',
      label: 'Largo de manga',
      how: 'Desde la costura del hombro hasta el final del puño',
      tol: 1,
      uses: ['largoBrazo'],
      value: (b) => (shortSleeve ? 19 + (b.largoBrazo - 61) * 0.3 : b.largoBrazo + 2 - drop),
    },
    { id: 'biceps', label: 'Contorno de bíceps', how: 'A 2,5 cm de la sisa, ×2', tol: 1, uses: ['biceps'], value: (b) => b.biceps + bicepsEase },
    shortSleeve
      ? { id: 'boca-manga', label: 'Contorno boca de manga', how: 'En el bajo de la manga, ×2', tol: 1, uses: ['biceps'], value: (b) => b.biceps + bicepsEase - 4 }
      : {
          id: 'puno',
          label: rib ? 'Contorno de puño (relajado)' : shirtCuff ? 'Contorno de puño (abrochado)' : 'Contorno bajo de manga',
          how: shirtCuff ? 'Con el puño abrochado, de lado a lado ×2' : 'En el borde del puño, sin estirar, ×2',
          tol: 0.5,
          uses: ['muneca'],
          value: (b) => b.muneca + (rib ? 5 : shirtCuff ? 8 : id === 'camiseta' ? 10 : 12),
        },
    {
      id: 'bajo',
      label: rib ? 'Contorno de bajo (relajado)' : 'Contorno de bajo',
      how: 'En el borde del bajo, sin estirar, ×2',
      tol: 1.5,
      uses: ['pecho'],
      value: (b) => chest(b) - (rib ? 12 : 0),
    },
    { id: 'escote', label: 'Ancho de escote', how: 'De costura a costura del cuello, en línea recta', tol: 0.5, uses: ['cuello'], value: (b) => b.cuello * 0.46 + (fit === 'oversize' ? 1 : 0) },
    { id: 'caida-escote', label: 'Caída de escote delantero', how: 'Desde la línea de hombros hasta la costura del cuello', tol: 0.5, uses: [], value: () => neckDrop },
  ]
  if (neck === 'alto' || (id === 'sudadera' && !hood && get('cuelloSin') === 'alto')) {
    poms.push({ id: 'cuello-alto', label: 'Alto de cuello', how: 'Desde la costura del escote hasta el borde del cuello', tol: 0.5, uses: ['cuello'], value: (b) => 8 + (b.cuello - 39) * 0.2 })
  }
  if (hood) {
    poms.push(
      { id: 'capucha-alto', label: 'Alto de capucha', how: 'Desde la costura del escote hasta lo más alto', tol: 1, uses: ['altura'], value: (b) => b.altura * 0.2 },
      { id: 'capucha-ancho', label: 'Ancho de capucha', how: 'De delante a atrás, en la parte más ancha', tol: 1, uses: ['cuello'], value: (b) => b.cuello * 0.33 + 12 },
    )
  }
  if (zip === 'completa') poms.push({ id: 'cremallera', label: 'Largo de cremallera', how: 'Dientes, de tope a tope', tol: 0.5, uses: ['talleEspalda'], value: (b) => length(b) - (hood ? 2 : 5) })
  if (zip === 'media') poms.push({ id: 'cremallera', label: 'Largo de cremallera', how: 'Dientes, de tope a tope', tol: 0.5, uses: ['talleEspalda'], value: (b) => 20 + (b.talleEspalda - 42) * 0.5 })
  return poms.map((p) => ({ ...p, value: (b: Body) => half(p.value(b)) }))
}

function pantsPoms(get: Get): Pom[] {
  const fit = get<string>('corte')
  const hipEase = { slim: 6, regular: 10, ancho: 16, baggy: 24 }[fit] ?? 10
  const thighEase = { slim: 5, regular: 9, ancho: 14, baggy: 20 }[fit] ?? 9
  const kneeEase = { slim: 4, regular: 8, ancho: 14, baggy: 20 }[fit] ?? 8
  const riseAdd = { slim: 1, regular: 2, ancho: 3, baggy: 5 }[fit] ?? 2
  const length = get<string>('largo')
  const cut = length === 'tobillero' ? 6 : 0
  const cuff = get('bajo') === 'puno'
  const knee = (b: Body) => b.rodilla + kneeEase
  // Cortos: la entrepierna se mide en cm propios (no sale del largo de pierna)
  const shortInseam = length === 'corto' ? 16 : length === 'bermuda' ? 27 : null
  const fixedWaist = get('cintura') === 'trabillas'

  const waist: Pom[] = fixedWaist
    ? [{ id: 'cintura', label: 'Contorno de cintura', how: 'Por el borde de la cinturilla, abrochada, ×2', tol: 1, uses: ['cintura'], value: (b) => b.cintura + 2 }]
    : [
        { id: 'cintura', label: 'Contorno de cintura (relajada)', how: 'Por el borde de la cinturilla, sin estirar, ×2', tol: 1, uses: ['cintura'], value: (b) => b.cintura - 6 },
        { id: 'cintura-max', label: 'Contorno de cintura (estirada)', how: 'Por el borde de la cinturilla, estirada al máximo, ×2', tol: 1.5, uses: ['cadera'], value: (b) => b.cadera + hipEase + 2 },
      ]
  if (shortInseam !== null) {
    const thigh = (b: Body) => b.muslo + thighEase
    const poms: Pom[] = [
      ...waist,
      { id: 'cadera', label: 'Contorno de cadera', how: 'A 18 cm de la cinturilla, ×2', tol: 1.5, uses: ['cadera'], value: (b) => b.cadera + hipEase },
      { id: 'tiro-del', label: 'Tiro delantero', how: 'Desde la cinturilla hasta la entrepierna, por delante', tol: 0.5, uses: ['tiro'], value: (b) => b.tiro + riseAdd },
      { id: 'tiro-tra', label: 'Tiro trasero', how: 'Desde la cinturilla hasta la entrepierna, por detrás', tol: 0.5, uses: ['tiro'], value: (b) => b.tiro + riseAdd + 9 },
      { id: 'muslo', label: 'Contorno de muslo', how: 'A 2,5 cm de la entrepierna, ×2', tol: 1, uses: ['muslo'], value: thigh },
      { id: 'bajo', label: 'Contorno de bajo', how: 'En el borde del bajo, ×2', tol: 1, uses: ['muslo'], value: (b) => thigh(b) - (cuff ? 10 : 3) },
      { id: 'entrepierna', label: 'Largo de entrepierna', how: 'Desde la entrepierna hasta el bajo', tol: 0.5, uses: ['entrepierna'], value: (b) => shortInseam + (b.entrepierna - 80) * 0.1 },
      { id: 'largo', label: 'Largo exterior', how: 'Por el costado, desde el borde de la cinturilla hasta el bajo', tol: 1, uses: ['tiro'], value: (b) => shortInseam + b.tiro + riseAdd + 4 },
    ]
    return poms.map((p) => ({ ...p, value: (b: Body) => half(p.value(b)) }))
  }

  const poms: Pom[] = [
    ...waist,
    { id: 'cadera', label: 'Contorno de cadera', how: 'A 18 cm de la cinturilla, ×2', tol: 1.5, uses: ['cadera'], value: (b) => b.cadera + hipEase },
    { id: 'tiro-del', label: 'Tiro delantero', how: 'Desde la cinturilla hasta la entrepierna, por delante', tol: 0.5, uses: ['tiro'], value: (b) => b.tiro + riseAdd },
    { id: 'tiro-tra', label: 'Tiro trasero', how: 'Desde la cinturilla hasta la entrepierna, por detrás', tol: 0.5, uses: ['tiro'], value: (b) => b.tiro + riseAdd + 9 },
    { id: 'muslo', label: 'Contorno de muslo', how: 'A 2,5 cm de la entrepierna, ×2', tol: 1, uses: ['muslo'], value: (b) => b.muslo + thighEase },
    { id: 'rodilla', label: 'Contorno de rodilla', how: 'A mitad de la entrepierna, ×2', tol: 1, uses: ['rodilla'], value: knee },
    {
      id: 'bajo',
      label: cuff ? 'Contorno de puño (relajado)' : 'Contorno de bajo',
      how: 'En el borde del bajo, sin estirar, ×2',
      tol: 0.5,
      uses: cuff ? ['tobillo'] : ['rodilla'],
      value: (b) => (cuff ? b.tobillo + 4 : knee(b) - ({ slim: 8, regular: 5, ancho: 1, baggy: 0 }[fit] ?? 5)),
    },
    { id: 'entrepierna', label: 'Largo de entrepierna', how: 'Desde la entrepierna hasta el bajo', tol: 1, uses: ['entrepierna'], value: (b) => b.entrepierna - cut },
    { id: 'largo', label: 'Largo exterior', how: 'Por el costado, desde el borde de la cinturilla hasta el bajo', tol: 1, uses: ['largoPierna'], value: (b) => b.largoPierna + 1 - cut },
  ]
  return poms.map((p) => ({ ...p, value: (b: Body) => half(p.value(b)) }))
}
