import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import { PAYMENT_METHODS, type PaymentMethod } from '../../shared/economy'
import { fileUrl, MATERIAL_CATEGORIES } from '../../shared/library'
import {
  EMPTY_PROJECT,
  FILE_CATEGORIES,
  materialCost,
  PROJECT_STATUSES,
  type FileCategory,
  type Project,
  type ProjectInput,
} from '../../shared/projects'
import { euro, isOverdue, margin } from './common'
import './projects.css'

const toInput = (p: Project): ProjectInput => ({
  name: p.name,
  status: p.status,
  clientId: p.clientId,
  collectionId: p.collectionId,
  description: p.description,
  notes: p.notes,
  dueDate: p.dueDate,
  price: p.price,
})

/** Ficha de proyecto: datos y fase, diseños, archivos, materiales y costes, tareas y notas. */
export function ProjectDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const navigate = useNavigate()
  const clients = useApi(() => api.listClients(), [])
  const collections = useApi(() => api.listCollections(), [])
  const [project, setProject] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectInput>(EMPTY_PROJECT)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) {
      setForm({ ...EMPTY_PROJECT, clientId: params.get('cliente'), collectionId: params.get('coleccion') })
      return
    }
    api
      .getProject(id)
      .then((p) => {
        setProject(p)
        setForm(toInput(p))
        setSaved(JSON.stringify(toInput(p)))
      })
      .catch((e: Error) => setError(e.message))
  }, [id, isNew, params])

  const dirty = JSON.stringify(form) !== saved
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        const created = await api.createProject(form)
        navigate(`/proyectos/${created.id}`, { replace: true })
      } else {
        const p = await api.updateProject(id, form)
        setProject(p)
        setSaved(JSON.stringify(form))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id || !confirm(`¿Eliminar el proyecto «${form.name}» con sus archivos, materiales, costes y tareas? Sus diseños se conservan.`)) return
    await api.deleteProject(id)
    navigate('/proyectos')
  }

  /** Cambios en archivos, materiales, costes y tareas: se guardan al momento. */
  const part = async (fn: () => Promise<Project>) => {
    setError(null)
    try {
      setProject(await fn())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!isNew && !project) return <div className="page">{error ? <Status error={error} /> : <Status loading />}</div>

  return (
    <div className="page">
      <form onSubmit={submit}>
        <PageHeader
          title={isNew ? 'Nuevo proyecto' : form.name || 'Proyecto'}
          subtitle={isNew ? 'Una prenda, de la idea a la entrega' : [project?.clientName, project?.collectionName].filter(Boolean).join(' · ') || 'Proyecto'}
          actions={
            <>
              <Link to="/proyectos" className="button">
                Volver
              </Link>
              {!isNew && (
                <>
                  <Link to={`/produccion/ficha/${id}`} className="button">
                    Ficha técnica
                  </Link>
                  <Link to={`/produccion?proyecto=${id}`} className="button">
                    Orden de fabricación
                  </Link>
                </>
              )}
              <button type="submit" className="button primary" disabled={saving || (!isNew && !dirty)}>
                {saving ? 'Guardando…' : isNew ? 'Crear proyecto' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </>
          }
        />
        {error && <p className="status error">{error}</p>}

        <StatusStepper value={form.status} onChange={(s) => set('status', s)} />

        <div className="form-layout">
          <section className="card">
            <h2>Datos</h2>
            <div className="fields">
              <Field label="Nombre *" wide>
                <input required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} placeholder="p. ej. Sudadera oversize para Marta" />
              </Field>
              <Field label="Cliente">
                <select value={form.clientId ?? ''} onChange={(e) => set('clientId', e.target.value || null)}>
                  <option value="">Sin cliente (marca propia)</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Colección">
                <select value={form.collectionId ?? ''} onChange={(e) => set('collectionId', e.target.value || null)}>
                  <option value="">Sin colección</option>
                  {collections.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.season ? ` · ${c.season}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de entrega">
                <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              </Field>
              <Field label="Precio de venta (€)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price ?? ''}
                  onChange={(e) => set('price', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Descripción" wide>
                <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Qué es, para quién, idea principal…" />
              </Field>
            </div>
          </section>
          <section className="card">
            <h2>Notas</h2>
            <textarea rows={10} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Conversaciones con el cliente, cambios, decisiones…" />
          </section>
        </div>
      </form>

      {project && (
        <>
          <Designs project={project} />
          <Files project={project} onPart={part} />
          <Costs project={project} price={form.price} onPart={part} />
          <Payments project={project} price={form.price} onPart={part} />
          <Tasks project={project} onPart={part} />
          <div className="danger-zone">
            <button className="button danger" onClick={remove}>
              Eliminar proyecto
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Fases del proyecto: se pulsa una para cambiar (se guarda con «Guardar cambios»). */
function StatusStepper({ value, onChange }: { value: ProjectInput['status']; onChange: (s: ProjectInput['status']) => void }) {
  const flow = PROJECT_STATUSES.slice(0, 7)
  const index = flow.findIndex((s) => s.id === value)
  return (
    <div className="stepper">
      {flow.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={['step', i < index ? 'done' : '', s.id === value ? 'current' : ''].join(' ')}
          onClick={() => onChange(s.id)}
        >
          <span className="step-dot">{i < index ? '✓' : i + 1}</span>
          {s.label}
        </button>
      ))}
      <span className="stepper-sep" />
      {PROJECT_STATUSES.slice(7).map((s) => (
        <button key={s.id} type="button" className={s.id === value ? 'step side current' : 'step side'} onClick={() => onChange(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

type PartFn = (fn: () => Promise<Project>) => Promise<void>

function Designs({ project }: { project: Project }) {
  const designs = useApi(() => api.listDesigns(project.id), [project.id])
  const all = useApi(() => api.listDesigns(), [])
  const free = (all.data ?? []).filter((d) => !d.projectId)

  const link = async (designId: string) => {
    const d = await api.getDesign(designId)
    await api.updateDesign(d.id, { name: d.name, template: d.template, clientId: d.clientId ?? project.clientId, projectId: project.id, data: d.data })
    designs.reload()
    all.reload()
  }
  const query = new URLSearchParams({ proyecto: project.id, ...(project.clientId && { cliente: project.clientId }) })

  return (
    <section className="card project-section">
      <div className="card-title">
        <h2>Diseños</h2>
        <div className="inline-actions">
          {free.length > 0 && (
            <select value="" onChange={(e) => e.target.value && link(e.target.value)} aria-label="Vincular un diseño existente">
              <option value="">Vincular un diseño existente…</option>
              {free.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Link to={`/disenador/nuevo?${query}`} className="button">
            Nuevo diseño
          </Link>
        </div>
      </div>
      {designs.data && designs.data.length === 0 && <p className="muted small">Este proyecto aún no tiene diseños.</p>}
      <div className="mini-grid">
        {designs.data?.map((d) => {
          const t = getTemplate(d.template)
          return (
            <Link key={d.id} to={`/disenador/${d.id}`} className="mini-card">
              <div className="mini-thumb">{t && <FlatView template={t} data={d.data} view="front" />}</div>
              <span>{d.name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Files({ project, onPart }: { project: Project; onPart: PartFn }) {
  const input = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<FileCategory>('boceto')
  const [uploading, setUploading] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) await onPart(() => api.addProjectFile(project.id, f, category))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section className="card project-section">
      <div className="card-title">
        <h2>Archivos</h2>
        <div className="inline-actions">
          <select value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} aria-label="Tipo de archivo">
            {FILE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="button" onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? 'Subiendo…' : 'Subir imágenes'}
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
      {project.files.length === 0 && <p className="muted small">Bocetos, referencias, fotos de muestras y del diseño final.</p>}
      {FILE_CATEGORIES.map((c) => {
        const files = project.files.filter((f) => f.category === c.id)
        if (!files.length) return null
        return (
          <div key={c.id} className="file-group">
            <h3>{c.label}</h3>
            <div className="file-grid">
              {files.map((f) => (
                <figure key={f.id} className="file-tile">
                  <a href={fileUrl(f.file)} target="_blank" rel="noreferrer">
                    <img src={fileUrl(f.file)} alt={f.name} loading="lazy" />
                  </a>
                  <button
                    className="file-remove"
                    title="Quitar"
                    onClick={() => confirm('¿Quitar esta imagen del proyecto?') && onPart(() => api.projectPart(project.id, 'files', 'DELETE', undefined, f.id))}
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Costs({ project, price, onPart }: { project: Project; price: number | null; onPart: PartFn }) {
  const library = useApi(() => api.listMaterials(), [])
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('1')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

  const materialsTotal = project.materials.reduce((s, m) => s + materialCost(m), 0)
  const otherTotal = project.costs.reduce((s, c) => s + c.amount, 0)
  const total = materialsTotal + otherTotal
  const m = margin(total, price)
  const catLabel = (id: string) => MATERIAL_CATEGORIES.find((c) => c.id === id)?.single ?? id

  return (
    <section className="card project-section">
      <h2>Materiales y costes</h2>
      <table className="table compact">
        <thead>
          <tr>
            <th>Material</th>
            <th className="num">Precio</th>
            <th className="num">Cantidad</th>
            <th className="num">Subtotal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {project.materials.map((pm) => (
            <tr key={pm.id}>
              <td>
                <Link to={`/biblioteca/${pm.materialId}`}>{pm.name}</Link> <span className="muted small">· {catLabel(pm.category)}</span>
              </td>
              <td className="num muted">{pm.price === null ? 'Sin precio' : `${euro(pm.price)} / ${pm.priceUnit}`}</td>
              <td className="num">
                <input
                  className="qty"
                  type="number"
                  min={0}
                  step={0.05}
                  defaultValue={pm.quantity}
                  onBlur={(e) => {
                    const q = Number(e.target.value)
                    if (q !== pm.quantity) onPart(() => api.projectPart(project.id, 'materials', 'PUT', { quantity: q, notes: pm.notes }, pm.id))
                  }}
                />
              </td>
              <td className="num">{euro(materialCost(pm))}</td>
              <td className="num">
                <button className="icon-button" title="Quitar" onClick={() => onPart(() => api.projectPart(project.id, 'materials', 'DELETE', undefined, pm.id))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr className="add-row">
            <td colSpan={2}>
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                <option value="">{library.data?.length ? 'Añadir material de la Biblioteca…' : 'La Biblioteca está vacía'}</option>
                {library.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {catLabel(x.category)}
                  </option>
                ))}
              </select>
            </td>
            <td className="num">
              <input className="qty" type="number" min={0} step={0.05} value={qty} onChange={(e) => setQty(e.target.value)} />
            </td>
            <td colSpan={2} className="num">
              <button
                className="button"
                disabled={!materialId}
                onClick={() =>
                  onPart(() => api.projectPart(project.id, 'materials', 'POST', { materialId, quantity: Number(qty) || 1 })).then(() => {
                    setMaterialId('')
                    setQty('1')
                  })
                }
              >
                Añadir
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="sub">Otros costes</h3>
      <table className="table compact">
        <tbody>
          {project.costs.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td className="num">{euro(c.amount)}</td>
              <td className="num">
                <button className="icon-button" title="Quitar" onClick={() => onPart(() => api.projectPart(project.id, 'costs', 'DELETE', undefined, c.id))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr className="add-row">
            <td>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Confección, estampación, envío…" />
            </td>
            <td className="num">
              <input className="qty" type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€" />
            </td>
            <td className="num">
              <button
                className="button"
                disabled={!label.trim()}
                onClick={() =>
                  onPart(() => api.projectPart(project.id, 'costs', 'POST', { label, amount: Number(amount) || 0 })).then(() => {
                    setLabel('')
                    setAmount('')
                  })
                }
              >
                Añadir
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="totals">
        <div>
          <span>Materiales</span>
          <strong>{euro(materialsTotal)}</strong>
        </div>
        <div>
          <span>Otros costes</span>
          <strong>{euro(otherTotal)}</strong>
        </div>
        <div>
          <span>Coste total</span>
          <strong>{euro(total)}</strong>
        </div>
        <div>
          <span>Precio de venta</span>
          <strong>{euro(price)}</strong>
        </div>
        <div className={m !== null && m < 0 ? 'negative' : ''}>
          <span>Margen</span>
          <strong>{m === null ? '—' : `${euro((price ?? 0) - total)} · ${m.toFixed(0)} %`}</strong>
        </div>
      </div>
      {total > 0 && (
        <p className="muted small price-hint">
          Precio orientativo: {euro(total / 0.5)} para un margen del 50 % · {euro(total / 0.4)} para un 60 %
        </p>
      )}
    </section>
  )
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function Payments({ project, price, onPart }: { project: Project; price: number | null; onPart: PartFn }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso)
  const [method, setMethod] = useState<PaymentMethod>('transferencia')
  const [notes, setNotes] = useState('')
  const paid = project.payments.reduce((s, p) => s + p.amount, 0)
  const pending = price ? Math.max(0, price - paid) : null
  const add = () =>
    Number(amount) > 0 &&
    onPart(() => api.projectPart(project.id, 'payments', 'POST', { amount: Number(amount), date, method, notes })).then(() => {
      setAmount('')
      setNotes('')
    })

  return (
    <section className="card project-section">
      <h2>Cobros</h2>
      <table className="table compact">
        <tbody>
          {project.payments.map((p) => (
            <tr key={p.id}>
              <td>{new Date(`${p.date}T00:00:00`).toLocaleDateString('es-ES')}</td>
              <td>
                {PAYMENT_METHODS.find((x) => x.id === p.method)?.label}
                {p.notes && <span className="muted small"> · {p.notes}</span>}
              </td>
              <td className="num">{euro(p.amount)}</td>
              <td className="num">
                <button className="icon-button" title="Quitar" onClick={() => onPart(() => api.projectPart(project.id, 'payments', 'DELETE', undefined, p.id))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr className="add-row">
            <td>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </td>
            <td>
              <div className="inline-actions payment-add">
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Señal, pago final…" />
              </div>
            </td>
            <td className="num">
              <input className="qty" type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€" />
            </td>
            <td className="num">
              <button className="button" disabled={!(Number(amount) > 0) || !date} onClick={add}>
                Añadir
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="totals">
        <div>
          <span>Precio de venta</span>
          <strong>{euro(price)}</strong>
        </div>
        <div>
          <span>Cobrado</span>
          <strong>{euro(paid)}</strong>
        </div>
        <div className={pending ? 'negative' : ''}>
          <span>Pendiente</span>
          <strong>{pending === null ? '—' : euro(pending)}</strong>
        </div>
      </div>
    </section>
  )
}

function Tasks({ project, onPart }: { project: Project; onPart: PartFn }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const add = () =>
    title.trim() &&
    onPart(() => api.projectPart(project.id, 'tasks', 'POST', { title, dueDate: due })).then(() => {
      setTitle('')
      setDue('')
    })
  return (
    <section className="card project-section">
      <h2>Tareas</h2>
      <ul className="task-list">
        {project.tasks.map((t) => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => onPart(() => api.projectPart(project.id, 'tasks', 'PUT', { title: t.title, done: e.target.checked, dueDate: t.dueDate }, t.id))}
              />
              <span>{t.title}</span>
            </label>
            {t.dueDate && <span className={!t.done && isOverdue(t.dueDate) ? 'tag late' : 'tag muted'}>{t.dueDate.split('-').reverse().join('/')}</span>}
            <button className="icon-button" title="Quitar" onClick={() => onPart(() => api.projectPart(project.id, 'tasks', 'DELETE', undefined, t.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="task-add">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva tarea (p. ej. pedir tela, tomar medidas…)" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <button className="button" onClick={add} disabled={!title.trim()}>
          Añadir
        </button>
      </div>
    </section>
  )
}
