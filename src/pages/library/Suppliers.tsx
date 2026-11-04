import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, formatPrice, PageHeader, Status } from '../../components/ui'
import { EMPTY_SUPPLIER, MATERIAL_CATEGORIES, type SupplierInput } from '../../shared/library'
import { LibraryTabs } from './LibraryTabs'

/** Lista de proveedores. */
export function SuppliersList() {
  const { data, error, loading } = useApi(() => api.listSuppliers(), [])
  return (
    <div className="page">
      <PageHeader
        title="Biblioteca"
        subtitle="Materiales y recursos para tus prendas"
        actions={
          <Link to="/biblioteca/proveedores/nuevo" className="button primary">
            Añadir proveedor
          </Link>
        }
      />
      <LibraryTabs />
      <Status loading={loading && !data} error={error} />

      {data && data.length === 0 && (
        <div className="card empty">
          <p>Todavía no hay proveedores.</p>
          <Link to="/biblioteca/proveedores/nuevo" className="button primary">
            Añadir el primero
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Contacto</th>
                <th>Ciudad</th>
                <th className="num">Materiales</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/biblioteca/proveedores/${s.id}`}>
                      <strong>{s.name}</strong>
                    </Link>
                  </td>
                  <td className="muted">{[s.contact, s.email, s.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="muted">{s.city || '—'}</td>
                  <td className="num">{s.materials ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Ficha de proveedor: crear o editar, y ver sus materiales. */
export function SupplierForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [form, setForm] = useState<SupplierInput>(EMPTY_SUPPLIER)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const materials = useApi(() => (id ? api.listMaterials() : Promise.resolve([])), [id])
  const own = (materials.data ?? []).filter((m) => m.supplierId === id)

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_SUPPLIER)
      return
    }
    setLoading(true)
    api
      .getSupplier(id)
      .then(({ id: _i, createdAt: _c, updatedAt: _u, materials: _m, ...rest }) => setForm(rest))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const set = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        const created = await api.createSupplier(form)
        navigate(`/biblioteca/proveedores/${created.id}`, { replace: true })
      } else {
        await api.updateSupplier(id, form)
        setSaved(true)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const extra = own.length ? ` Sus ${own.length} materiales se quedarán sin proveedor.` : ''
    if (!id || !confirm(`¿Eliminar el proveedor «${form.name}»?${extra}`)) return
    try {
      await api.deleteSupplier(id)
      navigate('/biblioteca/proveedores')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (loading) return <div className="page"><Status loading /></div>

  return (
    <form className="page" onSubmit={submit}>
      <PageHeader
        title={isNew ? 'Nuevo proveedor' : form.name || 'Proveedor'}
        subtitle="Proveedor"
        actions={
          <>
            <Link to="/biblioteca/proveedores" className="button">
              Volver
            </Link>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Guardando…' : isNew ? 'Añadir' : 'Guardar cambios'}
            </button>
          </>
        }
      />
      {error && <p className="status error">{error}</p>}
      {saved && <p className="status ok">Cambios guardados.</p>}

      <div className="form-layout">
        <section className="card">
          <h2>Datos</h2>
          <div className="fields">
            <Field label="Nombre *" wide>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} />
            </Field>
            <Field label="Persona de contacto">
              <input value={form.contact} onChange={(e) => set('contact', e.target.value)} />
            </Field>
            <Field label="Ciudad">
              <input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Correo">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Web" wide>
              <input type="url" value={form.website} placeholder="https://" onChange={(e) => set('website', e.target.value)} />
            </Field>
          </div>
        </section>
        <section className="card">
          <h2>Notas</h2>
          <textarea
            rows={8}
            placeholder="Pedido mínimo, plazos de entrega, condiciones, calidad…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </section>

        {!isNew && (
          <section className="card wide-card">
            <h2>Sus materiales</h2>
            {own.length === 0 ? (
              <p className="muted small">Todavía no hay materiales de este proveedor en la biblioteca.</p>
            ) : (
              <ul className="list">
                {own.map((m) => (
                  <li key={m.id}>
                    <Link to={`/biblioteca/${m.id}`} className="list-row">
                      <span className="tag muted">{MATERIAL_CATEGORIES.find((c) => c.id === m.category)?.single}</span>
                      <span>{m.name}</span>
                      <span className="muted small">{formatPrice(m.price, m.priceUnit)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {!isNew && (
        <div className="danger-zone">
          <button type="button" className="button danger" onClick={remove}>
            Eliminar proveedor
          </button>
        </div>
      )}
    </form>
  )
}
