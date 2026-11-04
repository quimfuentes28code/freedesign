import { useState } from 'react'
import { activeColorwayId, addColorway, colorwaysOf, removeColorway, renameColorway, switchColorway, withColorway } from '../../designer/colorways'
import { FlatView } from '../../designer/FlatView'
import type { GarmentTemplate } from '../../designer/types'
import type { DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'

interface Props {
  template: GarmentTemplate
  data: DesignData
  onChange: (d: DesignData) => void
  comparing: boolean
  onCompare: (v: boolean) => void
}

/** Barra de variantes de color: cambiar de una a otra, crear una nueva (copia de la actual), renombrar y quitar. */
export function ColorwaysBar({ template, data, onChange, comparing, onCompare }: Props) {
  const list = colorwaysOf(data)
  const active = activeColorwayId(data)
  const [renaming, setRenaming] = useState<string | null>(null)
  const main = template.activePieces(data.options).filter((p) => template.pieces.find((x) => x.id === p)?.materials.includes('tejido'))

  return (
    <div className="colorways-bar">
      <span className="muted small">Variantes</span>
      <div className="colorway-chips">
        {list.map((c) => {
          const colors = [...new Set(main.map((p) => c.pieces[p]?.color ?? template.pieces.find((x) => x.id === p)?.defaultColor ?? '#ccc'))].slice(0, 4)
          return renaming === c.id ? (
            <input
              key={c.id}
              className="colorway-rename"
              autoFocus
              defaultValue={c.name}
              onBlur={(e) => {
                onChange(renameColorway(data, c.id, e.target.value.trim() || c.name))
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button
              key={c.id}
              className={c.id === active ? 'colorway-chip active' : 'colorway-chip'}
              onClick={() => (c.id === active ? setRenaming(c.id) : onChange(switchColorway(data, c.id)))}
              title={c.id === active ? 'Clic para cambiar el nombre' : `Pasar a «${c.name}»`}
            >
              <span className="colorway-dots">
                {colors.map((col) => (
                  <i key={col} style={{ background: col }} />
                ))}
              </span>
              {c.name}
              {c.id === active && list.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="colorway-remove"
                  aria-label={`Quitar la variante ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`¿Quitar la variante «${c.name}»?`)) onChange(removeColorway(data, c.id))
                  }}
                >
                  ×
                </span>
              )}
            </button>
          )
        })}
        <button className="colorway-chip add" onClick={() => onChange(addColorway(data, `Variante ${list.length + 1}`))} title="Nueva variante a partir de la actual">
          + Variante
        </button>
      </div>
      {list.length > 1 && (
        <button className={comparing ? 'tool active' : 'tool'} onClick={() => onCompare(!comparing)}>
          {comparing ? 'Volver al dibujo' : 'Comparar'}
        </button>
      )}
    </div>
  )
}

/** Todas las variantes una al lado de otra (vista delantera). Clic en una para trabajar con ella. */
export function ColorwaysCompare({ template, data, materials, onPick }: { template: GarmentTemplate; data: DesignData; materials: Map<string, Material>; onPick: (id: string) => void }) {
  const list = colorwaysOf(data)
  const active = activeColorwayId(data)
  return (
    <div className="canvas colorways-compare">
      <div className="compare-grid">
        {list.map((c) => (
          <button key={c.id} className={c.id === active ? 'compare-card active' : 'compare-card'} onClick={() => onPick(c.id)}>
            <FlatView template={template} data={withColorway(data, c)} view="front" materials={materials} frame="comun" />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
