import { deleteWithUndo } from '../../components/undo'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import type { Collection, CollectionInput } from '../../shared/projects'
import { ProjectsTabs } from './common'
import './projects.css'

const EMPTY: CollectionInput = { name: '', season: '', description: '' }

/** Colecciones de la marca propia (o de un cliente): agrupan proyectos. */
export function CollectionsPage() {
  const { data, error, loading, reload } = useApi(() => api.listCollections(), [])
  const [form, setForm] = useState<CollectionInput>(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setFormError(null)
    try {
      if (editing) await api.updateCollection(editing, form)
      else await api.createCollection(form)
      setForm(EMPTY)
      setEditing(null)
      reload()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const edit = (c: Collection) => {
    setEditing(c.id)
    setForm({ name: c.name, season: c.season, description: c.description })
  }
  const remove = async (c: Collection) => {
    deleteWithUndo(`/collections/${c.id}`, c.name || 'Colección')
  }

  return (
    <div className="page">
      <PageHeader title="Proyectos" subtitle="Cada prenda, de la idea a la entrega" />
      <ProjectsTabs />

      <section className="card collection-form">
        <h2>{editing ? 'Editar colección' : 'Nueva colección'}</h2>
        <div className="fields">
          <Field label="Nombre *">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="p. ej. Drop 01" />
          </Field>
          <Field label="Temporada">
            <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} placeholder="p. ej. SS27" />
          </Field>
          <Field label="Descripción" wide>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Concepto, inspiración, paleta…" />
          </Field>
        </div>
        {formError && <p className="status error">{formError}</p>}
        <div className="inline-actions spaced-top">
          <button className="button primary" onClick={save} disabled={saving || !form.name.trim()}>
            {editing ? 'Guardar cambios' : 'Crear colección'}
          </button>
          {editing && (
            <button
              className="button"
              onClick={() => {
                setEditing(null)
                setForm(EMPTY)
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </section>

      <Status loading={loading && !data} error={error} />
      {data && data.length === 0 && <p className="muted">Todavía no hay colecciones.</p>}
      <div className="client-grid">
        {data?.map((c) => (
          <div key={c.id} className="card collection-card">
            <div>
              <strong>{c.name}</strong>
              {c.season && <span className="tag muted">{c.season}</span>}
            </div>
            {c.description && <p className="muted small">{c.description}</p>}
            <div className="inline-actions">
              <Link to={`/proyectos?coleccion=${c.id}`} className="button">
                {c.projects ?? 0} proyecto{c.projects === 1 ? '' : 's'}
              </Link>
              <button className="button" onClick={() => edit(c)}>
                Editar
              </button>
              <button className="button danger" onClick={() => remove(c)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
