import { useCallback, useEffect, useState, type DependencyList } from 'react'
import type { Client, ClientInput } from '../shared/clients'

/** Llamada a la API del Worker (/api/...). Lanza un Error con el mensaje del servidor si algo falla. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Error ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  stats: () => request<{ clients: number }>('/stats'),
  listClients: (q = '') => request<Client[]>(`/clients?q=${encodeURIComponent(q)}`),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (c: ClientInput) => request<Client>('/clients', { method: 'POST', body: JSON.stringify(c) }),
  updateClient: (id: string, c: ClientInput) =>
    request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: 'DELETE' }),
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
