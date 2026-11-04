/**
 * Economía: cobros, gastos generales y resúmenes, compartidos por la web (src/) y la API (worker/).
 */

export const PAYMENT_METHODS = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'bizum', label: 'Bizum' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'otro', label: 'Otro' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['id']

export interface ProjectPayment {
  id: string
  amount: number
  /** AAAA-MM-DD */
  date: string
  method: PaymentMethod
  notes: string
}

export const EXPENSE_CATEGORIES = [
  { id: 'taller', label: 'Alquiler y suministros' },
  { id: 'maquinaria', label: 'Maquinaria y herramientas' },
  { id: 'material', label: 'Material general' },
  { id: 'software', label: 'Software y web' },
  { id: 'marketing', label: 'Marketing y fotos' },
  { id: 'envios', label: 'Envíos y packaging' },
  { id: 'servicios', label: 'Gestoría y servicios' },
  { id: 'otro', label: 'Otros' },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id']

export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  concept: string
  amount: number
  supplierId: string | null
  supplierName?: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type ExpenseInput = Pick<Expense, 'date' | 'category' | 'concept' | 'amount' | 'supplierId' | 'notes'>

/** Un mes del resumen: lo cobrado, lo gastado en proyectos y los gastos generales. */
export interface EconomyMonth {
  /** 1–12 */
  month: number
  income: number
  projectCosts: number
  overhead: number
}

/** Rentabilidad de un proyecto (todos sus importes, sin filtrar por fechas). */
export interface ProjectEconomy {
  id: string
  name: string
  status: string
  clientId: string | null
  clientName: string | null
  collectionId: string | null
  collectionName: string | null
  price: number | null
  cost: number
  paid: number
  dueDate: string
}

export interface EconomySummary {
  year: number
  /** Años con algún movimiento (para el selector). */
  years: number[]
  months: EconomyMonth[]
  /** Gastos generales del año por categoría. */
  overheadByCategory: { category: ExpenseCategory; amount: number }[]
  projects: ProjectEconomy[]
}

/** Lo que falta por cobrar de un proyecto (nunca negativo; los cancelados no cuentan). */
export const pendingOf = (p: Pick<ProjectEconomy, 'price' | 'paid' | 'status'>) =>
  p.status === 'cancelado' || !p.price ? 0 : Math.max(0, p.price - p.paid)
