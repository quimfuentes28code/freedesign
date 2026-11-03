import { useCallback, useEffect, useState, type DependencyList } from 'react'
import type { Client, ClientInput } from '../shared/clients'
import type { Design, DesignInput } from '../shared/designs'
import type { Material, MaterialInput, Supplier, SupplierInput } from '../shared/library'

/** Llamada a la API del Worker (/api/...). Lanza un Error con el mensaje del servidor si algo falla. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Error ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  stats: () => request<{ clients: number; materials: number; suppliers: number; designs: number }>('/stats'),

  listClients: (q = '') => request<Client[]>(`/clients?q=${encodeURIComponent(q)}`),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (c: ClientInput) => request<Client>('/clients', send('POST', c)),
  updateClient: (id: string, c: ClientInput) => request<Client>(`/clients/${id}`, send('PUT', c)),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, send('DELETE')),

  listMaterials: (q = '', category = '') =>
    request<Material[]>(`/materials?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  getMaterial: (id: string) => request<Material>(`/materials/${id}`),
  createMaterial: (m: MaterialInput) => request<Material>('/materials', send('POST', m)),
  updateMaterial: (id: string, m: MaterialInput) => request<Material>(`/materials/${id}`, send('PUT', m)),
  deleteMaterial: (id: string) => request<void>(`/materials/${id}`, send('DELETE')),

  listSuppliers: () => request<Supplier[]>('/suppliers'),
  getSupplier: (id: string) => request<Supplier>(`/suppliers/${id}`),
  createSupplier: (s: SupplierInput) => request<Supplier>('/suppliers', send('POST', s)),
  updateSupplier: (id: string, s: SupplierInput) => request<Supplier>(`/suppliers/${id}`, send('PUT', s)),
  deleteSupplier: (id: string) => request<void>(`/suppliers/${id}`, send('DELETE')),

  listDesigns: () => request<Design[]>('/designs'),
  getDesign: (id: string) => request<Design>(`/designs/${id}`),
  createDesign: (d: DesignInput) => request<Design>('/designs', send('POST', d)),
  updateDesign: (id: string, d: DesignInput) => request<Design>(`/designs/${id}`, send('PUT', d)),
  deleteDesign: (id: string) => request<void>(`/designs/${id}`, send('DELETE')),

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
  return { data, error, loading, reload }
}
