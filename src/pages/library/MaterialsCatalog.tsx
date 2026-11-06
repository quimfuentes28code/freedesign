import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { formatPrice, PageHeader, Status } from '../../components/ui'
import { fileUrl, MATERIAL_CATEGORIES, type Material } from '../../shared/library'
import { LibraryTabs } from './LibraryTabs'
import { getCatalogMaterial } from '../../designer/materials'
import { Swatch } from '../../designer/swatches'

/** Catálogo de materiales y recursos, con filtro por categoría y buscador. */
export function MaterialsCatalog() {
  const [params, setParams] = useSearchParams()
  const category = params.get('categoria') ?? ''
  const [q, setQ] = useState('')
  const [version, setVersion] = useState(0)
  const { data, error, loading } = useApi(() => api.listMaterials(q, category), [q, category, version])
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  // Tejidos y fornituras básicos (los que falten), con su textura para el Diseñador y el 3D
  const addBasics = async () => {
    setAdding(true)
    try {
      const { added: n } = await api.addBasicMaterials()
      setAdded(n ? `Añadidos ${n} materiales básicos.` : 'Ya tienes todos los materiales básicos.')
      setVersion((v) => v + 1)
    } catch (err) {
      setAdded(err instanceof Error ? err.message : 'No se han podido añadir.')
    } finally {
      setAdding(false)
    }
  }
  const current = MATERIAL_CATEGORIES.find((c) => c.id === category)

  const setCategory = (id: string) => setParams(id ? { categoria: id } : {}, { replace: true })

  return (
    <div className="page">
      <PageHeader
        title="Biblioteca"
        subtitle="Materiales y recursos para tus prendas"
        actions={
          <>
            <button className="button" onClick={addBasics} disabled={adding} title="Tejidos, fornituras, hilo y etiquetas básicos con su textura (solo los que falten)">
              {adding ? 'Añadiendo…' : 'Añadir básicos'}
            </button>
            <Link to={`/biblioteca/nuevo${category ? `?categoria=${category}` : ''}`} className="button primary">
              Añadir {current ? current.single.toLowerCase() : 'material'}
            </Link>
          </>
        }
      />
      {added && <p className="muted small">{added}</p>}
      <LibraryTabs />

      <div className="toolbar">
        <div className="chips">
          <button className={category === '' ? 'chip active' : 'chip'} onClick={() => setCategory('')}>
            Todos
          </button>
          {MATERIAL_CATEGORIES.map((c) => (
            <button key={c.id} className={category === c.id ? 'chip active' : 'chip'} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Buscar por nombre, referencia, color, composición, proveedor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Status loading={loading && !data} error={error} />

      {data && data.length === 0 && (
        <div className="card empty">
          <p>
            {q
              ? `No hay materiales que coincidan con «${q}».`
              : current
                ? `Todavía no hay ${current.label.toLowerCase()} en la biblioteca.`
                : 'La biblioteca está vacía.'}
          </p>
          {!q && (
            <Link to={`/biblioteca/nuevo${category ? `?categoria=${category}` : ''}`} className="button primary">
              Añadir el primero
            </Link>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="material-grid">
          {data.map((m) => (
            <MaterialCard key={m.id} material={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function MaterialCard({ material: m }: { material: Material }) {
  const category = MATERIAL_CATEGORIES.find((c) => c.id === m.category)
  const fabric = [m.composition, m.weightGsm ? `${m.weightGsm} g/m²` : '', m.widthCm ? `${m.widthCm} cm de ancho` : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <Link to={`/biblioteca/${m.id}`} className="card material-card">
      <div className="material-photo">
        {m.photo ? (
          <img src={fileUrl(m.photo)} alt="" loading="lazy" />
        ) : getCatalogMaterial(m.look) ? (
          // Sin foto, la muestra de su textura
          <Swatch material={getCatalogMaterial(m.look)} color={getCatalogMaterial(m.look)?.tint ?? '#c9c4ba'} size={120} />
        ) : (
          <span>{category?.single}</span>
        )}
      </div>
      <div className="material-body">
        <span className="tag muted">{category?.single}</span>
        <strong>{m.name}</strong>
        {fabric && <span className="muted small">{fabric}</span>}
        <span className="muted small">{m.supplierName ?? 'Sin proveedor'}</span>
        <span className="price">{formatPrice(m.price, m.priceUnit)}</span>
      </div>
    </Link>
  )
}
