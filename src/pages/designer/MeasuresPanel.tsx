import { defaultMeasures, drawingPoms } from '../../designer/measures'
import type { GarmentTemplate } from '../../designer/types'
import { garmentPoms, type Body } from '../../production/measurements'
import type { DesignData } from '../../shared/designs'

interface Props {
  template: GarmentTemplate
  data: DesignData
  body: Body
  bodyLabel: string
  onChange: (measures: Record<string, number>) => void
}

/** Medidas de la prenda acabada en cm: las que salen del corte, y las que se cambien a mano. */
export function MeasuresPanel({ template, data, body, bodyLabel, onChange }: Props) {
  const poms = garmentPoms(template, data.options)
  const defs = defaultMeasures(template, data, body)
  const moves = drawingPoms(template)
  const own = data.measures ?? {}

  const set = (id: string, raw: string) => {
    const next = { ...own }
    const n = Number(raw.replace(',', '.'))
    if (raw === '' || !Number.isFinite(n) || n <= 0 || n === defs.get(id)) delete next[id]
    else next[id] = Math.round(n * 10) / 10
    onChange(next)
  }

  return (
    <section>
      <div className="section-head">
        <h2>Medidas (cm)</h2>
        {Object.keys(own).length > 0 && (
          <button className="link-button inline" onClick={() => onChange({})}>
            Restablecer todas
          </button>
        )}
      </div>
      <p className="muted small">
        Prenda acabada, medida en plano ({bodyLabel}). Las marcadas con ● cambian el dibujo y el 3D; todas pasan a la ficha técnica.
      </p>
      <div className="measure-list">
        {poms.map((p, i) => {
          const value = own[p.id] ?? defs.get(p.id) ?? 0
          const changed = own[p.id] !== undefined
          return (
            <label key={p.id} className={changed ? 'measure-row changed' : 'measure-row'} title={p.how}>
              <span className="measure-letter">{String.fromCharCode(65 + i)}</span>
              <span className="measure-name">
                {p.label}
                {moves.has(p.id) && <i className="moves" aria-label="cambia el dibujo"> ●</i>}
              </span>
              {/* Se aplica al salir de la casilla o con Intro: así el dibujo no salta con cifras a medio escribir */}
              <input
                key={`${p.id}-${value}`}
                type="number"
                step={0.5}
                min={1}
                defaultValue={value}
                onBlur={(e) => Number(e.target.value) !== value && set(p.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label={`${p.label} en cm`}
              />
              {changed ? (
                <button type="button" className="icon-button reset" title={`Volver a ${defs.get(p.id)} cm`} onClick={() => set(p.id, '')}>
                  ↺
                </button>
              ) : (
                <span className="reset-space" />
              )}
            </label>
          )
        })}
      </div>
    </section>
  )
}
