import { Link } from 'react-router'
import { api, useApi } from '../api/client'
import { PageHeader } from '../components/ui'
import { ACTIVE_STATUSES, PROJECT_STATUSES } from '../shared/projects'
import { initials } from './clients/ClientsList'
import { isOverdue, shortDate } from './projects/common'
import './projects/projects.css'

/** Resumen general del taller: proyectos, tareas, entregas y clientes. */
export function Dashboard() {
  const stats = useApi(() => api.stats(), [])
  const clients = useApi(() => api.listClients(), [])
  const projects = useApi(() => api.listProjects(), [])
  const tasks = useApi(() => api.openTasks(), [])
  const s = stats.data

  const recentClients = [...(clients.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const active = (projects.data ?? []).filter((p) => ACTIVE_STATUSES.includes(p.status))
  const deliveries = active.filter((p) => p.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6)
  const byStatus = PROJECT_STATUSES.slice(0, 7).map((st) => ({ ...st, n: (projects.data ?? []).filter((p) => p.status === st.id).length }))
  const maxN = Math.max(1, ...byStatus.map((b) => b.n))

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="Resumen de tu taller" />

      <div className="stats">
        <Stat label="Proyectos activos" value={s?.activeProjects} to="/proyectos" />
        <Stat label="En fabricación" value={s?.inProduction} to="/proyectos" />
        <Stat label="Tareas pendientes" value={s?.openTasks} />
        <Stat label="Clientes" value={s?.clients} to="/clientes" />
        <Stat label="Diseños" value={s?.designs} to="/disenos" />
        <Stat label="Materiales" value={s?.materials} to="/biblioteca" />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-title">
            <h2>Tareas pendientes</h2>
          </div>
          {tasks.data?.length === 0 ? (
            <p className="muted small">No hay tareas pendientes. Se añaden desde cada proyecto.</p>
          ) : (
            <ul className="list">
              {tasks.data?.map((t) => (
                <li key={t.id}>
                  <Link to={`/proyectos/${t.projectId}`} className="list-row">
                    <span className={t.dueDate && isOverdue(t.dueDate) ? 'tag late' : 'tag muted'}>{t.dueDate ? shortDate(t.dueDate) : 'Sin fecha'}</span>
                    <span>{t.title}</span>
                    <span className="muted small">{t.projectName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Próximas entregas</h2>
            <Link to="/proyectos" className="link">
              Ver proyectos
            </Link>
          </div>
          {deliveries.length === 0 ? (
            <p className="muted small">Ningún proyecto activo con fecha de entrega.</p>
          ) : (
            <ul className="list">
              {deliveries.map((p) => (
                <li key={p.id}>
                  <Link to={`/proyectos/${p.id}`} className="list-row">
                    <span className={isOverdue(p.dueDate) ? 'tag late' : 'tag'}>{shortDate(p.dueDate)}</span>
                    <span>{p.name}</span>
                    <span className={`status-badge s-${p.status}`}>{PROJECT_STATUSES.find((x) => x.id === p.status)?.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Proyectos por fase</h2>
          <div className="phase-bars">
            {byStatus.map((b) => (
              <div key={b.id} className={`phase-bar s-${b.id}`}>
                <span>{b.label}</span>
                <div>
                  <i style={{ width: `${(b.n / maxN) * 100}%` }} />
                </div>
                <strong>{b.n}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Clientes recientes</h2>
            <Link to="/clientes" className="link">
              Ver todos
            </Link>
          </div>
          {recentClients.length === 0 ? (
            <p className="muted small">
              Aún no hay clientes. <Link to="/clientes/nuevo">Crea el primero</Link>.
            </p>
          ) : (
            <ul className="list">
              {recentClients.map((c) => (
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
      </div>
    </div>
  )
}

function Stat({ label, value, to }: { label: string; value?: number; to?: string }) {
  const body = (
    <>
      <span className="stat-value">{value ?? '…'}</span>
      <span className="stat-label">{label}</span>
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
