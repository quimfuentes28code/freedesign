import { useCallback, useEffect, useState, type DependencyList } from 'react'
import type { Client, ClientInput } from '../shared/clients'
import type { Artwork, ArtworkInput } from '../shared/artworks'
import type { Design, DesignInput, Detail, HardwarePreset, LienzoAsset } from '../shared/designs'
import type { Material, MaterialInput, Supplier, SupplierInput } from '../shared/library'
import type { Collection, CollectionInput, FileCategory, Project, ProjectInput, ProjectStatus, ProjectSummary } from '../shared/projects'
import type { EconomySummary, Expense, ExpenseInput } from '../shared/economy'
import type { ProductionOrder, ProductionOrderInput, TechPack, TechPackInput } from '../shared/production'
import type { BrandColor, ProfileInput, RegisterInput, User } from '../shared/users'

/** Evento que se lanza cuando la API responde que no hay sesión (caducada o cerrada en otro sitio). */
export const SESSION_EXPIRED = 'fd:session-expired'

/** Llamada a la API del Worker (/api/...). Lanza un Error con el mensaje del servidor si algo falla. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED))
    throw new Error(body?.error ?? `Error ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  /** Cuenta con la sesión iniciada, o null si no hay sesión. */
  me: async () => {
    const res = await fetch('/api/auth/me')
    if (res.status === 401) return null
    if (!res.ok) throw new Error(`Error ${res.status}`)
    return (await res.json()) as User
  },
  login: (email: string, password: string) => request<User>('/auth/login', send('POST', { email, password })),
  register: (r: RegisterInput) => request<User>('/auth/register', send('POST', r)),
  logout: () => request<void>('/auth/logout', send('POST')),
  updateProfile: (p: ProfileInput) => request<User>('/auth/me', send('PUT', p)),
  saveBrandColors: (colors: BrandColor[]) => request<User>('/auth/brand', send('PUT', { colors })),
  changePassword: (current: string, password: string) => request<void>('/auth/password', send('PUT', { current, password })),

  stats: () => request<Stats>('/stats'),
  openTasks: () => request<{ id: string; title: string; dueDate: string; projectId: string; projectName: string }[]>('/tasks'),

  listProjects: (f: { q?: string; status?: string; client?: string; collection?: string } = {}) =>
    request<ProjectSummary[]>(`/projects?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])}`),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (p: ProjectInput) => request<Project>('/projects', send('POST', p)),
  updateProject: (id: string, p: ProjectInput) => request<Project>(`/projects/${id}`, send('PUT', p)),
  setProjectStatus: (id: string, status: ProjectStatus) => request<Project>(`/projects/${id}`, send('PATCH', { status })),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, send('DELETE')),
  /** Partes de un proyecto (archivos, materiales, costes, tareas): devuelven el proyecto actualizado. */
  projectPart: (id: string, part: 'files' | 'materials' | 'costs' | 'tasks' | 'payments',method: 'POST' | 'PUT' | 'DELETE', body?: unknown, partId?: string) =>
    request<Project>(`/projects/${id}/${part}${partId ? `/${partId}` : ''}`, send(method, body)),
  addProjectFile: async (id: string, file: File, category: FileCategory) => {
    const { key } = await api.uploadImage(file)
    return api.projectPart(id, 'files', 'POST', { file: key, category, name: file.name })
  },

  /** Ficha técnica guardada de un proyecto (null si aún no tiene). */
  getTechPack: (projectId: string) => request<TechPack | null>(`/techpacks/${projectId}`),
  saveTechPack: (projectId: string, t: TechPackInput) => request<TechPack>(`/techpacks/${projectId}`, send('PUT', t)),
  listTechPacks: () => request<{ projectId: string; version: number; updatedAt: string }[]>('/techpacks'),
  listOrders: (project = '') => request<ProductionOrder[]>(`/production?project=${encodeURIComponent(project)}`),
  createOrder: (o: ProductionOrderInput) => request<ProductionOrder>('/production', send('POST', o)),
  updateOrder: (id: string, o: ProductionOrderInput) => request<ProductionOrder>(`/production/${id}`, send('PUT', o)),
  deleteOrder: (id: string) => request<void>(`/production/${id}`, send('DELETE')),

  economy: (year: number) => request<EconomySummary>(`/economy?year=${year}`),
  listExpenses: (year = '') => request<Expense[]>(`/expenses?year=${encodeURIComponent(year)}`),
  createExpense: (e: ExpenseInput) => request<Expense>('/expenses', send('POST', e)),
  updateExpense: (id: string, e: ExpenseInput) => request<Expense>(`/expenses/${id}`, send('PUT', e)),
  deleteExpense: (id: string) => request<void>(`/expenses/${id}`, send('DELETE')),

  listCollections: () =>request<Collection[]>('/collections'),
  createCollection: (c: CollectionInput) => request<Collection>('/collections', send('POST', c)),
  updateCollection: (id: string, c: CollectionInput) => request<Collection>(`/collections/${id}`, send('PUT', c)),
  deleteCollection: (id: string) => request<void>(`/collections/${id}`, send('DELETE')),

  listClients: (q = '') => request<Client[]>(`/clients?q=${encodeURIComponent(q)}`),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (c: ClientInput) => request<Client>('/clients', send('POST', c)),
  updateClient: (id: string, c: ClientInput) => request<Client>(`/clients/${id}`, send('PUT', c)),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, send('DELETE')),

  listMaterials: (q = '', category = '') =>
    request<Material[]>(`/materials?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  getMaterial: (id: string) => request<Material>(`/materials/${id}`),
  createMaterial: (m: MaterialInput) => request<Material>('/materials', send('POST', m)),
  /** Añade a la Biblioteca los materiales básicos que falten. */
  addBasicMaterials: () => request<{ added: number }>('/materials/basicos', send('POST', {})),
  updateMaterial: (id: string, m: MaterialInput) => request<Material>(`/materials/${id}`, send('PUT', m)),
  deleteMaterial: (id: string) => request<void>(`/materials/${id}`, send('DELETE')),

  listSuppliers: () => request<Supplier[]>('/suppliers'),
  getSupplier: (id: string) => request<Supplier>(`/suppliers/${id}`),
  createSupplier: (s: SupplierInput) => request<Supplier>('/suppliers', send('POST', s)),
  updateSupplier: (id: string, s: SupplierInput) => request<Supplier>(`/suppliers/${id}`, send('PUT', s)),
  deleteSupplier: (id: string) => request<void>(`/suppliers/${id}`, send('DELETE')),

  listDesigns: (project = '') => request<Design[]>(`/designs${project ? `?project=${project}` : ''}`),
  getDesign: (id: string) => request<Design>(`/designs/${id}`),
  createDesign: (d: DesignInput) => request<Design>('/designs', send('POST', d)),
  updateDesign: (id: string, d: DesignInput) => request<Design>(`/designs/${id}`, send('PUT', d)),
  deleteDesign: (id: string) => request<void>(`/designs/${id}`, send('DELETE')),

  listArtworks: () => request<Artwork[]>('/artworks'),
  listHardware: () => request<HardwarePreset[]>('/hardware'),
  /** Texturas y pinceles propios del lienzo. */
  listLienzoAssets: () => request<LienzoAsset[]>('/recursos'),
  createLienzoAsset: (a: Pick<LienzoAsset, 'kind' | 'name' | 'file' | 'grain' | 'settings'>) => request<LienzoAsset>('/recursos', send('POST', a)),
  updateLienzoAsset: (id: string, a: Partial<Pick<LienzoAsset, 'name' | 'settings'>>) => request<LienzoAsset>(`/recursos/${id}`, send('PATCH', a)),
  deleteLienzoAsset: (id: string) => request<void>(`/recursos/${id}`, send('DELETE')),
  createHardware: (name: string, detail: Detail) => request<HardwarePreset>('/hardware', send('POST', { name, detail })),
  deleteHardware: (id: string) => request<void>(`/hardware/${id}`, send('DELETE')),
  getArtwork: (id: string) => request<Artwork>(`/artworks/${id}`),
  createArtwork: (a: ArtworkInput) => request<Artwork>('/artworks', send('POST', a)),
  updateArtwork: (id: string, a: ArtworkInput) => request<Artwork>(`/artworks/${id}`, send('PUT', a)),
  deleteArtwork: (id: string) => request<void>(`/artworks/${id}`, send('DELETE')),

  /** Sube una imagen subida por el usuario como gráfico nuevo de la Biblioteca. */
  uploadArtwork: async (file: File) => {
    const { width, height } = await imageSize(file)
    const { key } = await api.uploadImage(file)
    const name = file.name.replace(/\.[^.]+$/, '') || 'Gráfico'
    return api.createArtwork({ name, file: key, width, height, data: null, tags: '' })
  },

  /** Sube una imagen tal cual (sin reducirla: las capas del lienzo) y devuelve su clave. */
  uploadBlob: (blob: Blob) => request<{ key: string }>('/files', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } }),
  /** Borra un archivo de la cuenta (p. ej. la versión anterior de una capa del lienzo). */
  deleteFile: (key: string) => request<void>(`/files/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  /** Sube una imagen (reducida antes en el navegador) y devuelve su clave. */
  uploadImage: async (file: File) => {
    const blob = await shrinkImage(file)
    return request<{ key: string }>('/files', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } })
  },
}

/**
 * Reduce las fotos grandes (máx. 1600 px por lado) antes de subirlas, para que carguen rápido.
 * Los SVG y GIF se suben tal cual.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file)
  const max = 1600
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 600 * 1024) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  return blob ?? file
}

/** Carga datos de la API y los vuelve a pedir cuando cambian las dependencias. */
export function useApi<T>(load: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [run])

  useEffect(() => reload(), [reload])
  return { data, error, loading, reload, setData }
}

/** Tamaño natural de una imagen (también de un SVG). */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth || 500, height: img.naturalHeight || 500 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface Stats {
  clients: number
  materials: number
  suppliers: number
  designs: number
  activeProjects: number
  inProduction: number
  openTasks: number
}
