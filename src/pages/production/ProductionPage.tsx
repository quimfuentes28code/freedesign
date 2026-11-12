import { deleteWithUndo } from '../../components/undo'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import type { Supplier } from '../../shared/library'
import {
  defaultSteps,
  ORDER_KINDS,
  ORDER_STATUS_LABELS,
  orderStatus,
  SIZES,
  totalUnits,
  type OrderStep,
  type ProductionOrder,
  type ProductionOrderInput,
  type SpecColumn,
} from '../../shared/production'
import type { ProjectSummary } from '../../shared/projects'
import { isOverdue, shortDate, StatusBadge } from '../projects/common'
import './production.css'

const today = () => new Date().toISOString().slice(0, 10)

/** Producción: órdenes de fabricación (muestras y tandas) con sus pasos, y acceso a la ficha técnica de cada proyecto. */
export function ProductionPage() {
  const [params, setParams] = useSearchParams()
  const orders = useApi(() => api.listOrders(), [])
  const projects = useApi(() => api.listProjects(), [])
  const packs = useApi(() => api.listTechPacks(), [])
  const suppliers = useApi(() => api.listSuppliers(), [])
  const [editing, setEditing] = useState<ProductionOrder | 'new' | null>(params.get('proyecto') ? 'new' : null)
  const [error, setError] = useState<string | null>(null)

  const closeForm = () => {
    setEditing(null)
    if (params.has('proyecto')) setParams({}, { replace: true })
  }
  const saved = (o: ProductionOrder) => {
    orders.setData((list) => {
      const rest = (list ?? []).filter((x) => x.id !== o.id)
      return [o, ...rest]
    })
    closeForm()
  }
  const toggleStep = async (o: ProductionOrder, step: OrderStep) => {
    const steps = o.steps.map((s) => (s.id === step.id ? { ...s, done: !s.done, doneAt: s.done ? '' : today() } : s))
    orders.setData((list) => list?.map((x) => (x.id === o.id ? { ...o, steps } : x)) ?? null)
    try {
      const updated = await api.updateOrder(o.id, { ...toInput(o), steps })
      orders.setData((list) => list?.map((x) => (x.id === o.id ? updated : x)) ?? null)
    } catch (e) {
      setError((e as Error).message)
      orders.reload()
    }
  }
  const remove = async (o: ProductionOrder) => {
    deleteWithUndo(`/production/${o.id}`, `Orden de ${o.projectName}`)
  }

  const all = orders.data ?? []
  const open = all.filter((o) => orderStatus(o) !== 'terminada')
  const done = all.filter((o) => orderStatus(o) === 'terminada')
  const packOf = new Map((packs.data ?? []).map((p) => [p.projectId, p]))
  const packProjects = (projects.data ?? []).filter((p) => p.status !== 'cancelado')

  return (
    <div className="page">
      <PageHeader
        title="Producción"
        subtitle="Fichas técnicas para el taller y seguimiento de la fabricación"
        actions={
          <button className="button primary" onClick={() => setEditing('new')} disabled={editing !== null}>
            Nueva orden
          </button>
        }
      />
      {error && <p className="status error">{error}</p>}

      {editing && projects.data && suppliers.data && (
        <OrderForm
          order={editing === 'new' ? null : editing}
          initialProject={params.get('proyecto') ?? ''}
          projects={projects.data ?? []}
          suppliers={suppliers.data ?? []}
          onSaved={saved}
          onCancel={closeForm}
        />
      )}

      <section className="production-section">
        <h2 className="section-title">En fabricación</h2>
        <Status loading={orders.loading} error={orders.error} />
        {orders.data && open.length === 0 && (
          <p className="muted small">No hay ninguna orden en curso. Crea una para seguir una muestra o una tanda de producción paso a paso.</p>
        )}
        <div className="order-grid">
          {open.map((o) => (
            <OrderCard key={o.id} order={o} onToggle={(s) => toggleStep(o, s)} onEdit={() => setEditing(o)} onDelete={() => remove(o)} />
          ))}
        </div>
      </section>

      {done.length > 0 && (
        <section className="production-section">
          <h2 className="section-title">Terminadas</h2>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Tipo</th>
                  <th>Taller</th>
                  <th className="num">Unidades</th>
                  <th>Terminada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {done.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/proyectos/${o.projectId}`}>{o.projectName}</Link>
                    </td>
                    <td>{kindLabel(o)}</td>
                    <td>{workshopOf(o)}</td>
                    <td className="num">{totalUnits(o.quantities)}</td>
                    <td>{shortDate(o.steps.map((s) => s.doneAt).sort().at(-1) ?? '')}</td>
                    <td className="num">
                      <button className="link-button" onClick={() => setEditing(o)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="production-section">
        <h2 className="section-title">Fichas técnicas</h2>
        <p className="muted small">Cada proyecto tiene su ficha, generada a partir de su diseño, el cliente y los materiales.</p>
        <Status loading={projects.loading} error={projects.error} />
        {projects.data && packProjects.length === 0 && (
          <p className="muted small">
            Aún no hay proyectos. <Link to="/proyectos/nuevo">Crea el primero</Link>.
          </p>
        )}
        {packProjects.length > 0 && (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Cliente</th>
                  <th>Fase</th>
                  <th>Ficha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {packProjects.map((p) => {
                  const pack = packOf.get(p.id)
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/proyectos/${p.id}`}>{p.name}</Link>
                      </td>
                      <td>{p.clientName ?? <span className="muted">—</span>}</td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        {pack ? (
                          <span>
                            v{pack.version} <span className="muted small">· {new Date(pack.updatedAt).toLocaleDateString('es-ES')}</span>
                          </span>
                        ) : p.designs === 0 ? (
                          <span className="muted">Falta el diseño</span>
                        ) : (
                          <span className="muted">Sin guardar</span>
                        )}
                      </td>
                      <td className="num">
                        <Link to={`/produccion/ficha/${p.id}`} className="button small-button">
                          Abrir ficha
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const kindLabel = (o: Pick<ProductionOrder, 'kind'>) => ORDER_KINDS.find((k) => k.id === o.kind)?.label ?? o.kind
const workshopOf = (o: ProductionOrder) => o.supplierName ?? (o.workshop || 'Sin taller asignado')

function toInput(o: ProductionOrder): ProductionOrderInput {
  const { projectId, kind, supplierId, workshop, quantities, startDate, dueDate, steps, notes } = o
  return { projectId, kind, supplierId, workshop, quantities, startDate, dueDate, steps, notes }
}

function unitsText(q: ProductionOrder['quantities']) {
  const parts = Object.entries(q)
    .filter(([, n]) => n)
    .map(([c, n]) => (c === 'cliente' ? `${n} a medida` : `${n} ${c}`))
  return parts.length ? parts.join(' · ') : 'Sin unidades'
}

function OrderCard({ order: o, onToggle, onEdit, onDelete }: { order: ProductionOrder; onToggle: (s: OrderStep) => void; onEdit: () => void; onDelete: () => void }) {
  const done = o.steps.filter((s) => s.done).length
  const status = orderStatus(o)
  const late = isOverdue(o.dueDate)
  return (
    <article className="card order-card">
      <header>
        <div>
          <Link to={`/proyectos/${o.projectId}`} className="order-title">
            {o.projectName}
          </Link>
          <p className="muted small">
            {kindLabel(o)} · {workshopOf(o)}
            {o.clientName && ` · ${o.clientName}`}
          </p>
        </div>
        <span className={`tag order-${status}`}>{ORDER_STATUS_LABELS[status]}</span>
      </header>
      <div className="order-meta small">
        <span>{unitsText(o.quantities)}</span>
        {o.dueDate && <span className={late ? 'late-text' : ''}>Entrega {shortDate(o.dueDate)}</span>}
      </div>
      <div className="progress" aria-label={`${done} de ${o.steps.length} pasos`}>
        <i style={{ width: `${o.steps.length ? (done / o.steps.length) * 100 : 0}%` }} />
      </div>
      <ul className="task-list steps">
        {o.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={s.done} onChange={() => onToggle(s)} />
              <span>{s.label}</span>
            </label>
            {s.doneAt && <span className="muted small">{shortDate(s.doneAt)}</span>}
          </li>
        ))}
      </ul>
      <footer>
        <Link to={`/produccion/ficha/${o.projectId}`} className="button small-button">
          Ficha técnica
        </Link>
        <button className="button small-button" onClick={onEdit}>
          Editar
        </button>
        <button className="link-button danger-text" onClick={onDelete}>
          Eliminar
        </button>
      </footer>
    </article>
  )
}

function OrderForm(props: {
  order: ProductionOrder | null
  initialProject: string
  projects: ProjectSummary[]
  suppliers: Supplier[]
  onSaved: (o: ProductionOrder) => void
  onCancel: () => void
}) {
  const { order, initialProject, projects, suppliers, onSaved, onCancel } = props
  const [form, setForm] = useState<ProductionOrderInput>(
    order
      ? toInput(order)
      : {
          projectId: initialProject,
          kind: 'muestra',
          supplierId: null,
          workshop: '',
          quantities: {},
          startDate: today(),
          dueDate: projects.find((p) => p.id === initialProject)?.dueDate ?? '',
          steps: defaultSteps(true),
          notes: '',
        },
  )
  const [newStep, setNewStep] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ProductionOrderInput>(k: K, v: ProductionOrderInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setQty = (c: SpecColumn, raw: string) => {
    const q = { ...form.quantities }
    const n = Math.max(0, Math.round(Number(raw)))
    if (!raw || !n) delete q[c]
    else q[c] = n
    set('quantities', q)
  }
  const project = projects.find((p) => p.id === form.projectId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(order ? await api.updateOrder(order.id, form) : await api.createOrder(form))
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form className="card order-form" onSubmit={submit}>
      <h2>{order ? 'Editar orden' : 'Nueva orden de fabricación'}</h2>
      {error && <p className="status error">{error}</p>}
      <div className="fields">
        <Field label="Proyecto *">
          <select required value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
            <option value="">Elige un proyecto…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.clientName ? ` · ${p.clientName}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <div className="segmented">
            {ORDER_KINDS.map((k) => (
              <button type="button" key={k.id} className={form.kind === k.id ? 'active' : ''} onClick={() => set('kind', k.id)}>
                {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Taller">
          <select
            value={form.supplierId ?? ''}
            onChange={(e) => {
              set('supplierId', e.target.value || null)
              if (e.target.value) set('workshop', '')
            }}
          >
            <option value="">Otro / nuestro taller</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {!form.supplierId && (
          <Field label="Nombre del taller">
            <input value={form.workshop} placeholder="Nuestro taller" onChange={(e) => set('workshop', e.target.value)} />
          </Field>
        )}
        <Field label="Inicio">
          <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Entrega">
          <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
      </div>

      <h3 className="form-sub">Unidades</h3>
      <div className="qty-grid">
        {project?.clientId && (
          <label>
            <span>A medida</span>
            <input type="number" min={0} value={form.quantities.cliente ?? ''} onChange={(e) => setQty('cliente', e.target.value)} />
          </label>
        )}
        {SIZES.map((s) => (
          <label key={s}>
            <span>{s}</span>
            <input type="number" min={0} value={form.quantities[s] ?? ''} onChange={(e) => setQty(s, e.target.value)} />
          </label>
        ))}
        <p className="muted small">Total: {totalUnits(form.quantities)}</p>
      </div>

      <h3 className="form-sub">Pasos</h3>
      <ul className="task-list steps">
        {form.steps.map((s, i) => (
          <li key={s.id}>
            <input
              className="cell-input"
              value={s.label}
              onChange={(e) => set('steps', form.steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <button type="button" className="icon-button" aria-label="Quitar paso" onClick={() => set('steps', form.steps.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="task-add">
        <input value={newStep} placeholder="Otro paso (p. ej. Lavado a la piedra)" onChange={(e) => setNewStep(e.target.value)} />
        <button
          type="button"
          className="button"
          disabled={!newStep.trim()}
          onClick={() => {
            set('steps', [...form.steps, { id: `paso-${Date.now()}`, label: newStep.trim(), done: false, doneAt: '' }])
            setNewStep('')
          }}
        >
          Añadir
        </button>
      </div>

      <h3 className="form-sub">Notas</h3>
      <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Precio pactado con el taller, contacto, incidencias…" />

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={saving || !form.projectId}>
          {saving ? 'Guardando…' : order ? 'Guardar cambios' : 'Crear orden'}
        </button>
      </div>
    </form>
  )
}
