import { useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { MEASUREMENT_GROUPS } from '../../shared/clients'

const TOTAL_MEASUREMENTS = MEASUREMENT_GROUPS.reduce((n, g) => n + g.items.length, 0)

/** Lista de clientes con buscador. */
export function ClientsList() {
  const [q, setQ] = useState('')
  const { data, error, loading } = useApi(() => api.listClients(q), [q])

  return (
    <div className="page">
      <PageHeader
        title="Clientes"
        subtitle="Fichas con sus datos, preferencias y medidas"
        actions={
          <Link to="/clientes/nuevo" className="button primary">
            Nuevo cliente
          </Link>
        }
      />

      <input
        className="search"
        type="search"
        placeholder="Buscar por nombre, correo, Instagram o ciudad"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Status loading={loading && !data} error={error} />

      {data && data.length === 0 && (
        <div className="card empty">
          {q ? (
            <p>No hay clientes que coincidan con «{q}».</p>
          ) : (
            <>
              <p>Todavía no hay clientes.</p>
              <Link to="/clientes/nuevo" className="button primary">
                Crear el primero
              </Link>
            </>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="client-grid">
          {data.map((c) => {
            const measured = Object.keys(c.measurements).length
            return (
              <Link key={c.id} to={`/clientes/${c.id}`} className="card client-card">
                <div className="avatar" aria-hidden="true">
                  {initials(c.name)}
                </div>
                <div className="client-card-body">
                  <strong>{c.name}</strong>
                  <span className="muted">{[c.city, c.instagram].filter(Boolean).join(' · ') || c.email || 'Sin datos de contacto'}</span>
                  <span className={measured ? 'tag' : 'tag muted'}>
                    {measured ? `${measured}/${TOTAL_MEASUREMENTS} medidas` : 'Sin medidas'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
