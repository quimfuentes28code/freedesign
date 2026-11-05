import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { defaultDesign, getTemplate, TEMPLATES } from '../../designer/templates'
import type { GarmentTemplate } from '../../designer/types'
import type { Design, DesignData } from '../../shared/designs'
import './designer.css'
import './studio-editor.css'

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
            <Link to="/disenador/probador" className="button">
              Probador 3D
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
                  <strong>
                    {d.name} {d.data.brandTemplate && <span className="tag">Plantilla</span>}
                  </strong>
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
  const designs = useApi(() => api.listDesigns(), [])
  const brand = (designs.data ?? []).filter((d) => d.data.brandTemplate && getTemplate(d.template))

  const create = async (key: string, input: { name: string; template: string; data: DesignData }) => {
    setCreating(key)
    setError(null)
    try {
      const d = await api.createDesign({ ...input, clientId: params.get('cliente'), projectId: params.get('proyecto') })
      navigate(`/disenador/${d.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setCreating(null)
    }
  }
  const fromTemplate = (t: GarmentTemplate) => create(t.id, { name: `${t.name} sin título`, template: t.id, data: defaultDesign(t) })
  // Desde una plantilla de la marca: una copia con todo (colores, variantes, medidas, estampados…), ya sin ser plantilla
  const fromBrand = (d: Design) => {
    const { brandTemplate: _b, ...data } = structuredClone(d.data)
    return create(d.id, { name: `${d.name} (nuevo)`, template: d.template, data })
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
      {brand.length > 0 && (
        <>
          <h2 className="catalog-title">Plantillas de tu marca</h2>
          <div className="design-grid">
            {brand.map((d) => (
              <button key={d.id} className="card design-card template-card" onClick={() => fromBrand(d)} disabled={creating !== null}>
                <div className="design-thumb">
                  <FlatView template={getTemplate(d.template)!} data={d.data} view="front" />
                </div>
                <div className="design-body">
                  <strong>{d.name}</strong>
                  <span className="muted small">{getTemplate(d.template)?.name}</span>
                  {creating === d.id && <span className="small">Creando…</span>}
                </div>
              </button>
            ))}
          </div>
          <h2 className="catalog-title">Prendas base</h2>
        </>
      )}
      <div className="design-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="card design-card template-card" onClick={() => fromTemplate(t)} disabled={creating !== null}>
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
