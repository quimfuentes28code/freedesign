import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import { EMPTY_CLIENT, MEASUREMENT_GROUPS, type ClientInput, type MeasurementKey } from '../../shared/clients'

/** Ficha de cliente: crear uno nuevo (/clientes/nuevo) o ver y editar uno existente (/clientes/:id). */
export function ClientForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [form, setForm] = useState<ClientInput>(EMPTY_CLIENT)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_CLIENT)
      return
    }
    setLoading(true)
    api
      .getClient(id)
      .then(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => setForm(rest))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const setMeasure = (key: MeasurementKey, raw: string) => {
    const value = raw === '' ? undefined : Number(raw.replace(',', '.'))
    const measurements = { ...form.measurements }
    if (value === undefined || !Number.isFinite(value)) delete measurements[key]
    else measurements[key] = value
    set('measurements', measurements)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        const created = await api.createClient(form)
        navigate(`/clientes/${created.id}`, { replace: true })
      } else {
        await api.updateClient(id, form)
        setSaved(true)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id || !confirm(`¿Eliminar la ficha de ${form.name}? No se puede deshacer.`)) return
    try {
      await api.deleteClient(id)
      navigate('/clientes')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (loading) return <div className="page"><Status loading /></div>

  return (
    <form className="page" onSubmit={submit}>
      <PageHeader
        title={isNew ? 'Nuevo cliente' : form.name || 'Cliente'}
        subtitle={isNew ? 'Datos básicos y medidas para sus prendas' : 'Ficha de cliente'}
        actions={
          <>
            <Link to="/clientes" className="button">
              Volver
            </Link>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Guardando…' : isNew ? 'Crear cliente' : 'Guardar cambios'}
            </button>
          </>
        }
      />
      {error && <p className="status error">{error}</p>}
      {saved && <p className="status ok">Cambios guardados.</p>}

      <div className="form-layout">
        <section className="card">
          <h2>Datos personales</h2>
          <div className="fields">
            <Field label="Nombre *" wide>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} />
            </Field>
            <Field label="Correo">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Instagram">
              <input value={form.instagram} placeholder="@usuario" onChange={(e) => set('instagram', e.target.value)} />
            </Field>
            <Field label="Fecha de nacimiento">
              <input type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} />
            </Field>
            <Field label="Ciudad">
              <input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Dirección de envío" wide>
              <input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="card">
          <h2>Estilo y preferencias</h2>
          <textarea
            rows={4}
            placeholder="Estilo, colores y tejidos que le gustan, cortes que prefiere, alergias a materiales…"
            value={form.preferences}
            onChange={(e) => set('preferences', e.target.value)}
          />
          <h2 className="spaced">Notas</h2>
          <textarea rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </section>

        <section className="card measurements">
          <div className="card-title">
            <h2>Medidas</h2>
            <label className="inline-field">
              Tomadas el
              <input type="date" value={form.measuredAt} onChange={(e) => set('measuredAt', e.target.value)} />
            </label>
          </div>
          <p className="muted small">En centímetros. Rellena las que tengas; se reutilizarán en sus prendas y fichas técnicas.</p>
          <div className="measure-groups">
            {MEASUREMENT_GROUPS.map((g) => (
              <fieldset key={g.title}>
                <legend>{g.title}</legend>
                {g.items.map((m) => (
                  <label key={m.key} className="measure">
                    <span>{m.label}</span>
                    <span className="unit-input">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.5}
                        value={form.measurements[m.key] ?? ''}
                        onChange={(e) => setMeasure(m.key, e.target.value)}
                      />
                      <em>{'unit' in m ? m.unit : 'cm'}</em>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>
      </div>

      {!isNew && (
        <div className="danger-zone">
          <button type="button" className="button danger" onClick={remove}>
            Eliminar cliente
          </button>
        </div>
      )}
    </form>
  )
}
