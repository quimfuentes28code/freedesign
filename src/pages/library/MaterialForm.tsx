import { deleteWithUndo } from '../../components/undo'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import {
  EMPTY_MATERIAL,
  EMPTY_SUPPLIER,
  MATERIAL_CATEGORIES,
  PRICE_UNITS,
  type MaterialCategory,
  type MaterialInput,
} from '../../shared/library'
import { PhotoInput } from './PhotoInput'
import { CATALOG, getCatalogMaterial, groupCatalog } from '../../designer/materials'
import { Swatch } from '../../designer/swatches'

/** Unidad de precio habitual para cada categoría (se propone al elegirla). */
const DEFAULT_UNIT: Record<MaterialCategory, MaterialInput['priceUnit']> = {
  tejido: 'metro',
  fornitura: 'unidad',
  hilo: 'cono',
  etiqueta: 'unidad',
  estampado: 'unidad',
  acabado: 'unidad',
  packaging: 'unidad',
  otro: 'unidad',
}

/** Ficha de material: crear (/biblioteca/nuevo) o ver y editar (/biblioteca/:id). */
export function MaterialForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const navigate = useNavigate()
  const suppliers = useApi(() => api.listSuppliers(), [])
  const [form, setForm] = useState<MaterialInput>(EMPTY_MATERIAL)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isNew) {
      const category = MATERIAL_CATEGORIES.find((c) => c.id === params.get('categoria'))?.id ?? 'tejido'
      setForm({ ...EMPTY_MATERIAL, category, priceUnit: DEFAULT_UNIT[category] })
      return
    }
    setLoading(true)
    api
      .getMaterial(id)
      .then(({ id: _i, createdAt: _c, updatedAt: _u, supplierName: _s, ...rest }) => setForm(rest))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isNew, params])

  const set = <K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const setNumber = (key: 'price' | 'weightGsm' | 'widthCm', raw: string) => {
    const n = raw === '' ? null : Number(raw.replace(',', '.'))
    set(key, n !== null && Number.isFinite(n) ? n : null)
  }
  const setCategory = (category: MaterialCategory) => {
    // Si la unidad era la habitual de la categoría anterior, proponemos la de la nueva
    setForm((f) => ({ ...f, category, priceUnit: f.priceUnit === DEFAULT_UNIT[f.category] ? DEFAULT_UNIT[category] : f.priceUnit }))
    setSaved(false)
  }

  // Alta rápida de proveedor sin salir de la ficha (sus demás datos se completan luego en Proveedores)
  const addSupplier = async () => {
    const name = prompt('Nombre del proveedor')?.trim()
    if (!name) return
    try {
      const created = await api.createSupplier({ ...EMPTY_SUPPLIER, name })
      suppliers.reload()
      set('supplierId', created.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        const created = await api.createMaterial(form)
        navigate(`/biblioteca/${created.id}`, { replace: true })
      } else {
        await api.updateMaterial(id, form)
        setSaved(true)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id) return
    deleteWithUndo(`/materials/${id}`, form.name || 'Material')
    navigate(`/biblioteca?categoria=${form.category}`)
  }

  if (loading) return <div className="page"><Status loading /></div>

  const category = MATERIAL_CATEGORIES.find((c) => c.id === form.category)!
  return (
    <form className="page" onSubmit={submit}>
      <PageHeader
        title={isNew ? `Nuevo ${category.single.toLowerCase()}` : form.name || 'Material'}
        subtitle={isNew ? 'Añadir a la biblioteca' : category.single}
        actions={
          <>
            <Link to={`/biblioteca?categoria=${form.category}`} className="button">
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
          <h2>Foto</h2>
          <PhotoInput value={form.photo} onChange={(key) => set('photo', key)} />
        </section>

        <section className="card">
          <h2>Tipo</h2>
          <div className="chips">
            {MATERIAL_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={form.category === c.id ? 'chip active' : 'chip'}
                onClick={() => setCategory(c.id)}
              >
                {c.single}
              </button>
            ))}
          </div>
          {'hint' in category && <p className="muted small">{category.hint}</p>}

          <div className="fields spaced">
            <Field label="Nombre *" wide>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} />
            </Field>
            <Field label="Referencia">
              <input value={form.reference} placeholder="Código del proveedor" onChange={(e) => set('reference', e.target.value)} />
            </Field>
            <Field label="Color">
              <input value={form.color} onChange={(e) => set('color', e.target.value)} />
            </Field>
          </div>
        </section>

        {form.category === 'tejido' && (
          <section className="card">
            <h2>Tejido</h2>
            <div className="fields">
              <Field label="Composición" wide>
                <input
                  value={form.composition}
                  placeholder="p. ej. 80% algodón, 20% poliéster"
                  onChange={(e) => set('composition', e.target.value)}
                />
              </Field>
              <Field label="Gramaje (g/m²)">
                <input type="number" min={0} inputMode="decimal" value={form.weightGsm ?? ''} onChange={(e) => setNumber('weightGsm', e.target.value)} />
              </Field>
              <Field label="Ancho (cm)">
                <input type="number" min={0} inputMode="decimal" value={form.widthCm ?? ''} onChange={(e) => setNumber('widthCm', e.target.value)} />
              </Field>
            </div>
          </section>
        )}

        <section className="card">
          <h2>Proveedor y precio</h2>
          <div className="fields">
            <Field label="Proveedor" wide>
              <select value={form.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value || null)}>
                <option value="">Sin proveedor</option>
                {suppliers.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Precio aproximado (€)">
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={form.price ?? ''}
                onChange={(e) => setNumber('price', e.target.value)}
              />
            </Field>
            <Field label="Por">
              <select value={form.priceUnit} onChange={(e) => set('priceUnit', e.target.value as MaterialInput['priceUnit'])}>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" className="link-button" onClick={addSupplier}>
            + Añadir un proveedor nuevo
          </button>
        </section>

        {(form.category === 'tejido' || form.category === 'fornitura') && (
          <section className="card">
            <h2>Textura</h2>
            <p className="muted small">Cómo se ve en el Diseñador y en el 3D (el color es el de cada pieza).</p>
            <div className="look-pick">
              <Swatch material={getCatalogMaterial(form.look)} color={getCatalogMaterial(form.look)?.tint ?? '#9a9a9a'} size={44} />
              <select value={form.look} onChange={(e) => set('look', e.target.value)} aria-label="Textura">
                <option value="">Sin textura (la de cada prenda)</option>
                {groupCatalog(CATALOG.filter((m) => m.category === form.category)).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </section>
        )}

        <section className="card wide-card">
          <h2>Descripción</h2>
          <textarea
            rows={4}
            placeholder="Tacto, caída, usos recomendados, cuidados…"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Field label="Etiquetas (separadas por comas)" wide>
            <input value={form.tags} placeholder="p. ej. orgánico, invierno, básico" onChange={(e) => set('tags', e.target.value)} />
          </Field>
        </section>
      </div>

      {!isNew && (
        <div className="danger-zone">
          <button type="button" className="button danger" onClick={remove}>
            Eliminar de la biblioteca
          </button>
        </div>
      )}
    </form>
  )
}
