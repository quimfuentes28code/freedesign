import { garmentPoms, standardBody, type Body } from '../production/measurements'
import type { DesignData } from '../shared/designs'
import type { GarmentTemplate } from './types'

/**
 * Medidas editables del diseño. Se guardan en cm (`DesignData.measures`, por punto de medida) y se comparan con las
 * que tocarían por el corte y el cuerpo (talla M o el cliente): la proporción entre las dos estira el dibujo,
 * la prenda 3D y la tabla de medidas de la ficha técnica. Sin medidas propias, todo queda como siempre.
 */

/** Cuánto se estira cada parte del dibujo (1 = como sale por el corte elegido). */
export interface DrawScale {
  width: number
  length: number
  sleeve: number
  sleeveWidth: number
  cuff: number
  hip: number
  knee: number
  hem: number
}

export const NO_SCALE: DrawScale = { width: 1, length: 1, sleeve: 1, sleeveWidth: 1, cuff: 1, hip: 1, knee: 1, hem: 1 }

/** Qué punto de medida mueve cada parte del dibujo. */
const DRIVERS: Record<'top' | 'pants', Partial<Record<keyof DrawScale, string[]>>> = {
  top: { width: ['pecho'], length: ['largo'], sleeve: ['manga'], sleeveWidth: ['biceps'], cuff: ['puno', 'boca-manga'] },
  pants: { length: ['largo'], hip: ['cadera'], knee: ['rodilla'], hem: ['bajo'] },
}

/** Puntos de medida que cambian el dibujo (el resto solo cambia la ficha técnica). */
export function drawingPoms(t: GarmentTemplate) {
  return new Set(Object.values(DRIVERS[t.id === 'pantalon' ? 'pants' : 'top']).flat())
}

/** Medida que sale del corte y el cuerpo, sin tener en cuenta ninguna medida propia. */
function rawMeasures(t: GarmentTemplate, data: DesignData, body: Body = standardBody('M')) {
  return new Map(garmentPoms(t, data.options).map((p) => [p.id, p.value(body)]))
}

/**
 * Medidas que acompañan a otra cuando esta se cambia (si no se han cambiado también a mano):
 * con el pecho, el bajo y los hombros en proporción; con el largo, la cremallera y la entrepierna; con la cadera, el muslo.
 */
const FOLLOW: Record<'top' | 'pants', { from: string; to: string; how: 'ratio' | 'delta' }[]> = {
  top: [
    { from: 'pecho', to: 'bajo', how: 'ratio' },
    { from: 'pecho', to: 'hombros', how: 'ratio' },
    { from: 'largo', to: 'cremallera', how: 'delta' },
  ],
  pants: [
    { from: 'largo', to: 'entrepierna', how: 'delta' },
    { from: 'cadera', to: 'muslo', how: 'ratio' },
    { from: 'cadera', to: 'cintura-max', how: 'delta' },
  ],
}

const half = (n: number) => Math.round(n * 2) / 2

/** Medida que tocaría a cada punto: la del corte y el cuerpo, ajustada a las medidas propias de las que depende. */
export function defaultMeasures(t: GarmentTemplate, data: DesignData, body?: Body) {
  const raw = rawMeasures(t, data, body)
  const own = data.measures ?? {}
  const out = new Map(raw)
  for (const f of FOLLOW[t.id === 'pantalon' ? 'pants' : 'top']) {
    const base = raw.get(f.from)
    const target = raw.get(f.to)
    if (own[f.from] === undefined || base === undefined || target === undefined) continue
    out.set(f.to, half(f.how === 'ratio' ? target * (own[f.from] / base) : target + own[f.from] - base))
  }
  return out
}

/** Diferencia (cm) de cada medida con la que sale del corte: se suma a todas las tallas de la ficha técnica. */
export function measureDeltas(t: GarmentTemplate, data: DesignData, body?: Body) {
  const raw = rawMeasures(t, data, body)
  const defs = defaultMeasures(t, data, body)
  const own = data.measures ?? {}
  const out: Record<string, number> = {}
  for (const [id, r] of raw) {
    const d = Math.round(((own[id] ?? defs.get(id)!) - r) * 10) / 10
    if (d) out[id] = d
  }
  return out
}

/** Escala del dibujo según las medidas propias del diseño. */
export function drawScale(t: GarmentTemplate, data: DesignData, body?: Body): DrawScale {
  const own = data.measures
  if (!own || !Object.keys(own).length) return NO_SCALE
  const defs = rawMeasures(t, data, body)
  const s = { ...NO_SCALE }
  for (const [k, ids] of Object.entries(DRIVERS[t.id === 'pantalon' ? 'pants' : 'top']) as [keyof DrawScale, string[]][]) {
    const id = ids.find((i) => own[i] !== undefined && defs.has(i))
    if (id) s[k] = Math.min(1.8, Math.max(0.5, own[id] / defs.get(id)!))
  }
  return s
}
