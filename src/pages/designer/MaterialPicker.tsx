import { useEffect, useMemo, useRef, useState } from 'react'
import { catalogFor, getCatalogMaterial, groupCatalog, resolveMaterial, type CatalogMaterial } from '../../designer/materials'
import { Swatch } from '../../designer/swatches'
import type { PieceDef } from '../../designer/types'
import type { Material } from '../../shared/library'

interface Props {
  template: string
  piece: PieceDef
  materialId: string | null
  color: string
  library: Material[]
  onChange: (materialId: string | null, material?: CatalogMaterial) => void
}

/**
 * Selector de material de una pieza: el catálogo de tejidos o fornituras (agrupado) y los materiales propios
 * de la Biblioteca, cada uno con su muestra en el color de la pieza para ver cómo queda antes de elegirlo.
 */
export function MaterialPicker({ template, piece, materialId, color, library, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const libMap = useMemo(() => new Map(library.map((m) => [m.id, m])), [library])
  const current = resolveMaterial(template, piece.id, materialId, libMap)
  const own = library.filter((m) => piece.materials.includes(m.category))

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const term = q.trim().toLowerCase()
  const match = (...texts: string[]) => !term || texts.some((t) => t.toLowerCase().includes(term))
  const groups = groupCatalog(catalogFor(piece).filter((m) => match(m.name, m.composition, m.uses, m.group)))
  const ownMatches = own.filter((m) => match(m.name, m.composition, m.tags))
  const pick = (id: string | null, m?: CatalogMaterial) => {
    onChange(id, m)
    setOpen(false)
    setQ('')
  }

  const name = current.library ? current.library.name : current.catalog.name
  return (
    <div className="material-picker" ref={root}>
      <button type="button" className="material-current" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Swatch material={current.library && !current.library.look ? undefined : current.catalog} library={current.library} color={color} size={34} />
        <span className="material-text">
          <span className="material-name">{name}</span>
          <span className="material-meta">
            {current.chosen ? (current.library ? 'De tu Biblioteca' : current.catalog.composition) : 'Por defecto · toca para elegir'}
          </span>
        </span>
        <span className="material-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="material-pop" role="listbox" aria-label={`Material de ${piece.label.toLowerCase()}`}>
          <input className="material-search" placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="material-list">
            {materialId && (
              <button type="button" className="material-option reset" onClick={() => pick(null)}>
                Quitar material (usar el de por defecto)
              </button>
            )}
            {ownMatches.length > 0 && (
              <div className="material-group">
                <h3>Tu Biblioteca</h3>
                {ownMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === materialId}
                    className={m.id === materialId ? 'material-option active' : 'material-option'}
                    onClick={() => pick(m.id)}
                  >
                    <Swatch material={getCatalogMaterial(m.look)} library={m} color={color} size={40} />
                    <span className="material-text">
                      <span className="material-name">{m.name}</span>
                      <span className="material-meta">{[m.composition, m.weightGsm ? `${m.weightGsm} g/m²` : ''].filter(Boolean).join(' · ') || 'Material propio'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {groups.map(([group, items]) => (
              <div key={group} className="material-group">
                <h3>{group}</h3>
                {items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === materialId}
                    className={m.id === materialId ? 'material-option active' : 'material-option'}
                    onClick={() => pick(m.id, m)}
                    title={m.uses}
                  >
                    <Swatch material={m} color={color} size={40} />
                    <span className="material-text">
                      <span className="material-name">{m.name}</span>
                      <span className="material-meta">{[m.composition, m.weight].filter((t) => t && t !== '—').join(' · ')}</span>
                      <span className="material-uses">{m.uses}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && !ownMatches.length && <p className="muted small material-empty">No hay materiales con «{q}».</p>}
          </div>
        </div>
      )}
    </div>
  )
}
