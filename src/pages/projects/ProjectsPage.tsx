import { useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { fileUrl } from '../../shared/library'
import { PROJECT_STATUSES, type ProjectStatus, type ProjectSummary } from '../../shared/projects'
import { designLink, euro, isOverdue, margin, ProjectsTabs, shortDate } from './common'
import './projects.css'

/** Proyectos: tablero por fases (arrastrando se cambia de fase) o lista, con filtros por cliente y colección. */
export function ProjectsPage() {
  const [params, setParams] = useSearchParams()
  const filters = { client: params.get('cliente') ?? '', collection: params.get('coleccion') ?? '' }
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'tablero' | 'lista'>(() => (localStorageGet('proyectos-vista') === 'lista' ? 'lista' : 'tablero'))
  const projects = useApi(() => api.listProjects({ q, ...filters }), [q, filters.client, filters.collection])
  const clients = useApi(() => api.listClients(), [])
  const collections = useApi(() => api.listCollections(), [])
  const [moving, setMoving] = useState<Record<string, ProjectStatus>>({})

  const setFilter = (key: 'cliente' | 'coleccion', value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const switchMode = (m: 'tablero' | 'lista') => {
    setMode(m)
    localStorageSet('proyectos-vista', m)
  }

  // Cambio de fase (arrastrando en el tablero o desde la lista): se ve al momento y se guarda detrás
  const setStatus = async (id: string, status: ProjectStatus) => {
    setMoving((m) => ({ ...m, [id]: status }))
    try {
      await api.setProjectStatus(id, status)
      projects.reload()
    } finally {
      setMoving((m) => {
        const { [id]: _, ...rest } = m
        return rest
      })
    }
  }
  const list = (projects.data ?? []).map((p) => (moving[p.id] ? { ...p, status: moving[p.id] } : p))
  const query = new URLSearchParams({ ...(filters.client && { cliente: filters.client }), ...(filters.collection && { coleccion: filters.collection }) })

  return (
    <div className="page wide">
      <PageHeader
        title="Proyectos"
        subtitle="Cada prenda, de la idea a la entrega"
        actions={
          <Link to={`/proyectos/nuevo${query.size ? `?${query}` : ''}`} className="button primary">
            Nuevo proyecto
          </Link>
        }
      />
      <ProjectsTabs />

      <div className="project-toolbar">
        <div className="segmented">
          <button className={mode === 'tablero' ? 'active' : ''} onClick={() => switchMode('tablero')}>
            Tablero
          </button>
          <button className={mode === 'lista' ? 'active' : ''} onClick={() => switchMode('lista')}>
            Lista
          </button>
        </div>
        <input className="search" type="search" placeholder="Buscar proyecto, cliente o colección" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filters.client} onChange={(e) => setFilter('cliente', e.target.value)} aria-label="Filtrar por cliente">
          <option value="">Todos los clientes</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={filters.collection} onChange={(e) => setFilter('coleccion', e.target.value)} aria-label="Filtrar por colección">
          <option value="">Todas las colecciones</option>
          {collections.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Status loading={projects.loading && !projects.data} error={projects.error} />
      {projects.data && projects.data.length === 0 && !q && !filters.client && !filters.collection ? (
        <div className="card empty">
          <p>Todavía no hay proyectos. Cada prenda que diseñes o fabriques puede ser un proyecto con su fase, archivos, materiales y costes.</p>
          <Link to="/proyectos/nuevo" className="button primary">
            Crear el primero
          </Link>
        </div>
      ) : mode === 'tablero' ? (
        <Board projects={list} onMove={setStatus} />
      ) : (
        <ProjectTable projects={list} onStatus={setStatus} />
      )}
    </div>
  )
}

function Board({ projects, onMove }: { projects: ProjectSummary[]; onMove: (id: string, s: ProjectStatus) => void }) {
  const [over, setOver] = useState<ProjectStatus | null>(null)
  const drop = (status: ProjectStatus) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain')
    const p = projects.find((x) => x.id === id)
    if (p && p.status !== status) onMove(id, status)
  }
  return (
    <div className="board">
      {PROJECT_STATUSES.map((s) => {
        const items = projects.filter((p) => p.status === s.id)
        return (
          <section
            key={s.id}
            className={over === s.id ? 'board-col over' : 'board-col'}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(s.id)
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={drop(s.id)}
          >
            <header>
              <span className={`dot s-${s.id}`} />
              {s.label}
              <span className="count">{items.length}</span>
            </header>
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

function ProjectCard({ project: p }: { project: ProjectSummary }) {
  return (
    <div className="project-card-wrap">
    <Link
      to={`/proyectos/${p.id}`}
      className="card project-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      {p.cover && <img src={fileUrl(p.cover)} alt="" loading="lazy" />}
      <strong>{p.name}</strong>
      <span className="muted small">{[p.clientName, p.collectionName].filter(Boolean).join(' · ') || 'Sin cliente ni colección'}</span>
      <div className="project-meta">
        {p.dueDate && <span className={isOverdue(p.dueDate) && p.status !== 'entregado' ? 'tag late' : 'tag'}>{shortDate(p.dueDate)}</span>}
        {p.tasksTotal > 0 && (
          <span className="tag muted">
            {p.tasksTotal - p.tasksOpen}/{p.tasksTotal} tareas
          </span>
        )}
        {p.designs > 0 && <span className="tag muted">{p.designs} diseño{p.designs > 1 ? 's' : ''}</span>}
      </div>
    </Link>
      <Link to={designLink(p)} className="project-card-design" title="Nuevo diseño para este proyecto">
        + Diseño
      </Link>
    </div>
  )
}

function ProjectTable({ projects, onStatus }: { projects: ProjectSummary[]; onStatus: (id: string, s: ProjectStatus) => void }) {
  if (projects.length === 0) return <p className="muted">No hay proyectos que coincidan con los filtros.</p>
  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Fase</th>
            <th>Cliente</th>
            <th>Colección</th>
            <th>Entrega</th>
            <th className="num">Coste</th>
            <th className="num">Precio</th>
            <th className="num">Margen</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const m = margin(p.cost, p.price)
            return (
              <tr key={p.id}>
                <td>
                  <Link to={`/proyectos/${p.id}`}>
                    <strong>{p.name}</strong>
                  </Link>
                </td>
                <td>
                  <select className={`status-select s-${p.status}`} value={p.status} onChange={(e) => onStatus(p.id, e.target.value as ProjectStatus)}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted">{p.clientName ?? '—'}</td>
                <td className="muted">{p.collectionName ?? '—'}</td>
                <td className={isOverdue(p.dueDate) && p.status !== 'entregado' ? 'late-text' : 'muted'}>{shortDate(p.dueDate) || '—'}</td>
                <td className="num">{euro(p.cost)}</td>
                <td className="num">{euro(p.price)}</td>
                <td className="num">{m === null ? '—' : `${m.toFixed(0)} %`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


function localStorageGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada, solo no se recuerda la vista
  }
}
