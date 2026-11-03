import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { defaultDesign, getTemplate, TEMPLATES } from '../../designer/templates'
import './designer.css'

/** Lista de diseños guardados. */
export function DesignsList() {
  const { data, error, loading } = useApi(() => api.listDesigns(), [])
  return (
    <div className="page">
      <PageHeader
        title="Diseñador"
        subtitle="Tus prendas diseñadas"
        actions={
          <>
            <Link to="/disenador/3d" className="button">
              Vista previa 3D
            </Link>
            <Link to="/disenador/nuevo" className="button primary">
              Nuevo diseño
            </Link>
          </>
        }
      />
      <Status loading={loading && !data} error={error} />
      {data && data.length === 0 && (
        <div className="card empty">
          <p>Todavía no hay diseños. Empieza eligiendo una prenda base del catálogo.</p>
          <Link to="/disenador/nuevo" className="button primary">
            Ver el catálogo
          </Link>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="design-grid">
          {data.map((d) => {
            const t = getTemplate(d.template)
            return (
              <Link key={d.id} to={`/disenador/${d.id}`} className="card design-card">
                <div className="design-thumb">{t && <FlatView template={t} data={d.data} view="front" />}</div>
                <div className="design-body">
                  <strong>{d.name}</strong>
                  <span className="muted small">
                    {t?.name ?? d.template} · {d.clientName ?? 'Marca propia'}
                    {d.projectName ? ` · ${d.projectName}` : ''}
                  </span>
                  <span className="muted small">Editado el {new Date(d.updatedAt).toLocaleDateString('es-ES')}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Catálogo de prendas base: al elegir una se crea un diseño nuevo y se abre en el editor. */
export function NewDesign() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async (templateId: string) => {
    const t = getTemplate(templateId)!
    setCreating(templateId)
    setError(null)
    try {
      const d = await api.createDesign({
        name: `${t.name} sin título`,
        template: t.id,
        clientId: params.get('cliente'),
        projectId: params.get('proyecto'),
        data: defaultDesign(t),
      })
      navigate(`/disenador/${d.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setCreating(null)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Nuevo diseño"
        subtitle="Elige una prenda base para empezar"
        actions={
          <Link to="/disenador" className="button">
            Volver
          </Link>
        }
      />
      {error && <p className="status error">{error}</p>}
      <div className="design-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="card design-card template-card" onClick={() => create(t.id)} disabled={creating !== null}>
            <div className="design-thumb">
              <FlatView template={t} data={defaultDesign(t)} view="front" />
            </div>
            <div className="design-body">
              <strong>{t.name}</strong>
              <span className="muted small">{t.description}</span>
              {creating === t.id && <span className="small">Creando…</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
