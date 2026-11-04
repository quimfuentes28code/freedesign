/**
 * Proyectos y colecciones, compartidos por la web (src/) y la API (worker/).
 */
import type { PriceUnit } from './library'

/** Fases de un proyecto, en orden. Las dos últimas quedan aparte del flujo normal. */
export const PROJECT_STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'boceto', label: 'Boceto' },
  { id: 'diseno', label: 'Diseño' },
  { id: 'muestra', label: 'Muestra' },
  { id: 'aprobado', label: 'Aprobado' },
  { id: 'produccion', label: 'Producción' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'pausa', label: 'En pausa' },
  { id: 'cancelado', label: 'Cancelado' },
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]['id']

/** Fases que cuentan como «activas» (ni terminadas, ni en pausa, ni canceladas). */
export const ACTIVE_STATUSES: ProjectStatus[] = ['idea', 'boceto', 'diseno', 'muestra', 'aprobado', 'produccion']

export const FILE_CATEGORIES = [
  { id: 'boceto', label: 'Bocetos' },
  { id: 'referencia', label: 'Referencias' },
  { id: 'foto', label: 'Fotos' },
  { id: 'final', label: 'Diseño final' },
  { id: 'otro', label: 'Otros' },
] as const

export type FileCategory = (typeof FILE_CATEGORIES)[number]['id']

export interface Collection {
  id: string
  name: string
  season: string
  description: string
  /** Número de proyectos (solo lectura). */
  projects?: number
  createdAt: string
  updatedAt: string
}

export type CollectionInput = Pick<Collection, 'name' | 'season' | 'description'>

/** Proyecto tal como aparece en listas y tableros. */
export interface ProjectSummary {
  id: string
  name: string
  status: ProjectStatus
  clientId: string | null
  clientName?: string
  collectionId: string | null
  collectionName?: string
  dueDate: string
  price: number | null
  /** Coste total calculado (materiales + otros costes). */
  cost: number
  tasksOpen: number
  tasksTotal: number
  /** Primera imagen del proyecto (para la tarjeta), si tiene. */
  cover: string | null
  designs: number
  createdAt: string
  updatedAt: string
}

export interface ProjectFile {
  id: string
  category: FileCategory
  file: string
  name: string
  createdAt: string
}

export interface ProjectMaterial {
  id: string
  materialId: string
  quantity: number
  notes: string
  /** Datos del material (solo lectura). */
  name: string
  category: string
  price: number | null
  priceUnit: PriceUnit
  photo: string
}

export interface ProjectCost {
  id: string
  label: string
  amount: number
}

export interface ProjectTask {
  id: string
  title: string
  done: boolean
  dueDate: string
}

export interface Project extends ProjectSummary {
  description: string
  notes: string
  files: ProjectFile[]
  materials: ProjectMaterial[]
  costs: ProjectCost[]
  tasks: ProjectTask[]
}

export type ProjectInput = Pick<Project, 'name' | 'status' | 'clientId' | 'collectionId' | 'description' | 'notes' | 'dueDate' | 'price'>

export const EMPTY_PROJECT: ProjectInput = {
  name: '',
  status: 'idea',
  clientId: null,
  collectionId: null,
  description: '',
  notes: '',
  dueDate: '',
  price: null,
}

/** Coste de un material en el proyecto (cantidad × precio). */
export const materialCost = (m: Pick<ProjectMaterial, 'quantity' | 'price'>) => (m.price ?? 0) * m.quantity
