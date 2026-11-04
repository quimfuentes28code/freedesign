/**
 * Producción: fichas técnicas (tech packs) y órdenes de fabricación, compartidas por la web (src/) y la API (worker/).
 */

/** Tallas del tallaje estándar, de menor a mayor. */
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
export type Size = (typeof SIZES)[number]

/** Columna de la tabla de medidas: una talla o «cliente» (prenda a medida). */
export type SpecColumn = Size | 'cliente'

/** Fila de confección: qué se cose, cómo y con qué máquina. */
export interface ConstructionRow {
  id: string
  area: string
  operation: string
  machine: string
  notes: string
}

/**
 * Lo que se guarda de una ficha: lo elegido o retocado a mano. Lo demás (dibujos, materiales,
 * estampados, medidas calculadas) se genera al abrirla.
 */
export interface TechPackData {
  /** A medida (medidas del cliente) o tabla de tallas. */
  mode: 'cliente' | 'tallas'
  /** Tallas que salen en la tabla (modo tallas). */
  sizes: Size[]
  /** Talla de muestra (la que se cose primero y se usa de referencia). */
  baseSize: Size
  /** Medidas retocadas a mano: columna → punto de medida → cm. */
  overrides: Partial<Record<SpecColumn, Record<string, number>>>
  /** Confección y orden de montaje; null = las de por defecto de la prenda. */
  construction: ConstructionRow[] | null
  assembly: string[] | null
  /** Etiquetas (marca, talla, composición y cuidados). */
  labels: string
  /** Planchado, doblado y embalaje. */
  packaging: string
  notes: string
}

export const EMPTY_TECH_PACK: TechPackData = {
  mode: 'tallas',
  sizes: ['S', 'M', 'L', 'XL'],
  baseSize: 'M',
  overrides: {},
  construction: null,
  assembly: null,
  labels: '',
  packaging: '',
  notes: '',
}

export interface TechPack {
  projectId: string
  designId: string | null
  data: TechPackData
  version: number
  createdAt: string
  updatedAt: string
}

export type TechPackInput = Pick<TechPack, 'designId' | 'data'>

// --- Órdenes de fabricación ---

export const ORDER_KINDS = [
  { id: 'muestra', label: 'Muestra' },
  { id: 'produccion', label: 'Producción' },
] as const

export type OrderKind = (typeof ORDER_KINDS)[number]['id']

export interface OrderStep {
  id: string
  label: string
  done: boolean
  /** Fecha (AAAA-MM-DD) en que se terminó. */
  doneAt: string
}

export interface ProductionOrder {
  id: string
  projectId: string
  /** Datos del proyecto (solo lectura). */
  projectName?: string
  clientName?: string
  kind: OrderKind
  supplierId: string | null
  supplierName?: string
  /** Taller sin ficha de proveedor (p. ej. «Nuestro taller»). */
  workshop: string
  /** Unidades por talla (o «cliente» para una prenda a medida). */
  quantities: Partial<Record<SpecColumn, number>>
  startDate: string
  dueDate: string
  steps: OrderStep[]
  notes: string
  createdAt: string
  updatedAt: string
}

export type ProductionOrderInput = Pick<
  ProductionOrder,
  'projectId' | 'kind' | 'supplierId' | 'workshop' | 'quantities' | 'startDate' | 'dueDate' | 'steps' | 'notes'
>

/** Pasos habituales de una orden. El de estampación solo si la prenda lleva estampados. */
export function defaultSteps(withPrints: boolean): OrderStep[] {
  const labels = [
    'Patronaje',
    'Corte',
    ...(withPrints ? ['Estampación / bordado'] : []),
    'Confección',
    'Acabados y planchado',
    'Control de calidad',
    'Embalaje y entrega',
  ]
  return labels.map((label, i) => ({ id: `paso-${i + 1}`, label, done: false, doneAt: '' }))
}

export type OrderStatus = 'pendiente' | 'en_curso' | 'terminada'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  terminada: 'Terminada',
}

/** Estado de una orden según sus pasos: ninguno hecho, alguno o todos. */
export function orderStatus(o: Pick<ProductionOrder, 'steps'>): OrderStatus {
  const done = o.steps.filter((s) => s.done).length
  if (o.steps.length > 0 && done === o.steps.length) return 'terminada'
  return done > 0 ? 'en_curso' : 'pendiente'
}

export const totalUnits = (q: ProductionOrder['quantities']) => Object.values(q).reduce<number>((a, n) => a + (n ?? 0), 0)
