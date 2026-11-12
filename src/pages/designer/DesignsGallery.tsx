import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import './designer.css'

/** «Diseños»: todos los diseños de la cuenta con su dibujo, para abrir uno o empezar otro en el lienzo. */
export function DesignsGallery() {
  const designs = useApi(() => api.listDesigns(), [])
  const [q, setQ] = useState('')
  const [client, setClient] = useState('')
  const [project, setProject] = useState('')

  const all = designs.data ?? []
  // Clientes y proyectos que tienen algún diseño (para los filtros)
  const clients = useMemo(() => uniq(all.map((d) => [d.clientId, d.clientName] as const)), [all])
  const projects = useMemo(() => uniq(all.map((d) => [d.projectId, d.projectName] as const)), [all])

  const text = q.trim().toLowerCase()
  const list = all
    .filter((d) => !client || d.clientId === client)
    .filter((d) => !project || d.projectId === project)
    .filter((d) => !text || [d.name, d.clientName, d.projectName].some((s) => s?.toLowerCase().includes(text)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="page">
      <PageHeader
        title="Diseños"
        subtitle="Tus prendas, del boceto al dibujo técnico"
        actions={
          <Link to="/disenador" className="button primary">
            Nuevo diseño
          </Link>
        }
      />

      {all.length > 0 && (
        <div className="designs-toolbar">
          <input type="search" placeholder="Buscar diseño, cliente o proyecto" value={q} onChange={(e) => setQ(e.target.value)} />
          {clients.length > 0 && (
            <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente">
              <option value="">Todos los clientes</option>
              {clients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {projects.length > 0 && (
            <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Proyecto">
              <option value="">Todos los proyectos</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <Status loading={designs.loading && !designs.data} error={designs.error} />

      {designs.data && all.length === 0 && (
        <div className="card empty">
          <p>Aún no tienes diseños.</p>
          <Link to="/disenador" className="button primary">
            Empezar el primero
          </Link>
        </div>
      )}
      {all.length > 0 && list.length === 0 && <p className="muted small">Ningún diseño coincide con la búsqueda.</p>}

      <div className="design-grid">
        {list.map((d) => {
          const t = getTemplate(d.template)
          return (
            <Link key={d.id} to={`/disenador/${d.id}`} className="card design-card">
              <div className="design-thumb">
                {t ? <FlatView template={t} data={d.data} view="front" /> : <span className="design-thumb-blank">Lienzo</span>}
              </div>
              <div className="design-body">
                <strong>{d.name}</strong>
                <span className="muted small">{[d.clientName, d.projectName].filter(Boolean).join(' · ') || 'Sin cliente ni proyecto'}</span>
                <span className="design-date">{new Date(d.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function uniq(pairs: (readonly [string | null, string | undefined])[]) {
  const seen = new Map<string, string>()
  for (const [id, name] of pairs) if (id && name && !seen.has(id)) seen.set(id, name)
  return [...seen].sort((a, b) => a[1].localeCompare(b[1], 'es'))
}
