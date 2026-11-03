import { useEffect, useState } from 'react'
import { FABRICS, type FabricId } from '../data/fabrics'
import type { Design, Fit, GarmentType, Measurements } from '../types'

const GARMENTS: { id: GarmentType; label: string }[] = [
  { id: 'sudadera', label: 'Sudadera' },
  { id: 'camiseta', label: 'Camiseta' },
  { id: 'manga-larga', label: 'Manga larga' },
  { id: 'vestido', label: 'Vestido' },
  { id: 'pantalon', label: 'Pantalón' },
]

const FITS: { id: Fit; label: string }[] = [
  { id: 'ajustado', label: 'Ajustado' },
  { id: 'normal', label: 'Normal' },
  { id: 'holgado', label: 'Oversize' },
]

const MEASUREMENTS: { key: keyof Measurements; label: string; min: number; max: number }[] = [
  { key: 'height', label: 'Altura', min: 140, max: 210 },
  { key: 'chest', label: 'Pecho', min: 70, max: 140 },
  { key: 'waist', label: 'Cintura', min: 50, max: 130 },
  { key: 'hips', label: 'Cadera', min: 70, max: 140 },
]

interface Props {
  measurements: Measurements
  onMeasurementsChange: (m: Measurements) => void
  design: Design
  onDesignChange: (d: Design) => void
  autoRotate: boolean
  onAutoRotateChange: (v: boolean) => void
  animate: boolean
  onAnimateChange: (v: boolean) => void
}

export function DesignPanel(props: Props) {
  const { measurements, design } = props
  const setDesign = (patch: Partial<Design>) => props.onDesignChange({ ...design, ...patch })

  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>FreeDesign</h1>
        <div className="toggles">
          <label className="toggle">
            <input type="checkbox" checked={props.animate} onChange={(e) => props.onAnimateChange(e.target.checked)} />
            Animación
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.autoRotate}
              onChange={(e) => props.onAutoRotateChange(e.target.checked)}
            />
            Girar 360°
          </label>
        </div>
      </header>

      <section>
        <h2>Prenda</h2>
        <div className="chips">
          {GARMENTS.map((g) => (
            <button
              key={g.id}
              className={design.garment === g.id ? 'chip active' : 'chip'}
              onClick={() => setDesign({ garment: g.id })}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Corte</h2>
        <div className="chips">
          {FITS.map((f) => (
            <button
              key={f.id}
              className={design.fit === f.id ? 'chip active' : 'chip'}
              onClick={() => setDesign({ fit: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {design.garment === 'sudadera' && (
        <section>
          <h2>Detalles</h2>
          <div className="chips">
            <button className={design.hood ? 'chip active' : 'chip'} onClick={() => setDesign({ hood: !design.hood })}>
              Capucha
            </button>
            <button className={design.pocket ? 'chip active' : 'chip'} onClick={() => setDesign({ pocket: !design.pocket })}>
              Bolsillo canguro
            </button>
          </div>
          <Slider label="Largo" min={55} max={85} value={design.bodyLength} onCommit={(v) => setDesign({ bodyLength: v })} />
          <Slider
            label="Largo de manga"
            min={50}
            max={75}
            value={design.sleeveLength}
            onCommit={(v) => setDesign({ sleeveLength: v })}
          />
        </section>
      )}

      <section>
        <h2>Tela</h2>
        <div className="chips">
          {(Object.keys(FABRICS) as FabricId[]).map((id) => (
            <button
              key={id}
              className={design.fabric === id ? 'chip active' : 'chip'}
              onClick={() => setDesign({ fabric: id, color: FABRICS[id].defaultColor })}
            >
              <span className="swatch" style={{ background: FABRICS[id].defaultColor }} />
              {FABRICS[id].name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Color</h2>
        <label className="color">
          <input type="color" value={design.color} onChange={(e) => setDesign({ color: e.target.value })} />
          <span>{design.color.toUpperCase()}</span>
        </label>
      </section>

      <section>
        <h2>Medidas del cuerpo</h2>
        {MEASUREMENTS.map((m) => (
          <Slider
            key={m.key}
            label={m.label}
            min={m.min}
            max={m.max}
            value={measurements[m.key]}
            onCommit={(v) => props.onMeasurementsChange({ ...measurements, [m.key]: v })}
          />
        ))}
      </section>
    </aside>
  )
}

/**
 * Deslizador en cm que solo aplica el valor al soltarlo: recalcular la prenda tarda un momento
 * y así no se hace en cada paso del arrastre.
 */
function Slider(props: { label: string; min: number; max: number; value: number; onCommit: (v: number) => void }) {
  const [value, setValue] = useState(props.value)
  useEffect(() => setValue(props.value), [props.value])
  const commit = () => {
    if (value !== props.value) props.onCommit(value)
  }
  return (
    <label className="slider">
      <span>
        {props.label} <strong>{value} cm</strong>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  )
}
