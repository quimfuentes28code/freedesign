import { Link } from 'react-router'
import { api, useApi } from '../api/client'
import { PageHeader } from '../components/ui'
import { initials } from './clients/ClientsList'

/** Resumen general. De momento muestra los clientes; se irá llenando con cada apartado nuevo. */
export function Dashboard() {
  const stats = useApi(() => api.stats(), [])
  const clients = useApi(() => api.listClients(), [])
  const recent = [...(clients.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="Resumen de tu taller" />

      <div className="stats">
        <Stat label="Clientes" value={stats.data?.clients} to="/clientes" />
        <Stat label="Diseños" value={stats.data?.designs} to="/disenador" />
        <Stat label="Materiales en la biblioteca" value={stats.data?.materials} to="/biblioteca" />
        <Stat label="Proveedores" value={stats.data?.suppliers} to="/biblioteca/proveedores" />
        <Stat label="Proyectos activos" soon />
        <Stat label="En fabricación" soon />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-title">
            <h2>Clientes recientes</h2>
            <Link to="/clientes" className="link">
              Ver todos
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted">
              Aún no hay clientes. <Link to="/clientes/nuevo">Crea el primero</Link>.
            </p>
          ) : (
            <ul className="list">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link to={`/clientes/${c.id}`} className="list-row">
                    <span className="avatar small">{initials(c.name)}</span>
                    <span>{c.name}</span>
                    <span className="muted small">{new Date(c.updatedAt).toLocaleDateString('es-ES')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Próximamente aquí</h2>
          <ul className="soon-list">
            <li>Proyectos por estado (boceto, diseño, muestra, fabricación, entregado)</li>
            <li>Prendas en fabricación y fechas de entrega</li>
            <li>Tareas pendientes</li>
            <li>Costes e ingresos del mes</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, to, soon }: { label: string; value?: number; to?: string; soon?: boolean }) {
  const body = (
    <>
      <span className="stat-value">{soon ? '—' : (value ?? '…')}</span>
      <span className="stat-label">{label}</span>
      {soon && <span className="tag muted">Próximamente</span>}
    </>
  )
  return to ? (
    <Link to={to} className="card stat">
      {body}
    </Link>
  ) : (
    <div className="card stat">{body}</div>
  )
}
