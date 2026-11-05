import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import { mannequinMeasurements } from '../../designer/to3d'
import { isPants } from '../../designer/types'
import { bodyKind, type Design as SavedDesign } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Scene } from '../../three/Scene'
import { bodyOf, outfitOf, useDesign3D } from './Design3D'
import './studio.css'

/**
 * Probador: el maniquí (con las medidas de un cliente o las estándar) lleva a la vez una prenda de arriba
 * y un pantalón ya diseñados, para ver cómo quedan juntos.
 */
export function Probador() {
  const designs = useApi(() => api.listDesigns(), [])
  const clients = useApi(() => api.listClients(), [])
  const library = useApi(() => api.listMaterials(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])
  const [clientId, setClientId] = useState('')
  // Cuerpo del maniquí: el de mujer si se eligen prendas de mujer (se puede cambiar a mano)
  const [bodyPick, setBodyPick] = useState<'auto' | 'hombre' | 'mujer'>('auto')
  const [topId, setTopId] = useState<string | null>(null)
  const [bottomId, setBottomId] = useState<string | null>(null)
  const [hoodUp, setHoodUp] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const all = (designs.data ?? []).filter((d) => getTemplate(d.template))
  // Gorros y gorras aún no tienen forma 3D: no salen en el Probador
  const tops = all.filter((d) => getTemplate(d.template)!.family === 'top')
  const bottoms = all.filter((d) => isPants(getTemplate(d.template)!))
  const top = tops.find((d) => d.id === topId) ?? null
  const bottom = bottoms.find((d) => d.id === bottomId) ?? null
  const client = clients.data?.find((c) => c.id === clientId)
  const auto = [top, bottom].some((d) => d && bodyKind(d.data) === 'mujer') ? 'mujer' : 'hombre'
  const kind = bodyPick === 'auto' ? auto : bodyPick
  const body = useMemo(() => bodyOf(client, kind), [client, kind])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements, kind), [client, kind])

  const top3d = useDesign3D(top ? getTemplate(top.template) : null, top?.data, materials, body)
  const bottom3d = useDesign3D(bottom ? getTemplate(bottom.template) : null, bottom?.data, materials, body)
  // La prenda de arriba va por fuera; el pantalón, debajo
  const worn = useMemo(() => {
    const main = top3d ?? bottom3d
    return main ? outfitOf(main, top3d && bottom3d ? bottom3d : null, false) : null
  }, [top3d, bottom3d])
  const shown = useMemo(() => (worn ? { ...worn.design, hoodUp } : null), [worn, hoodUp])

  return (
    <div className="studio probador">
      <main className="viewport">
        {shown ? (
          <Scene measurements={measurements} design={shown} outfit={worn!.outfit} autoRotate={autoRotate} animate={animate} />
        ) : (
          <div className="probador-empty">
            <p>Elige una prenda de arriba y un pantalón para vestir al maniquí.</p>
          </div>
        )}
        <p className="hint">{client ? `Medidas de ${client.name}` : 'Medidas estándar'} · Arrastra para girar · Rueda para acercar</p>
      </main>
      <aside className="panel">
        <div className="panel-header">
          <h1>Probador</h1>
          <Link to="/disenador" className="link">
            Diseños
          </Link>
        </div>
        <Status loading={designs.loading && !designs.data} error={designs.error} />

        <section>
          <h2>Cuerpo</h2>
          <div className="segmented" role="group" aria-label="Cuerpo del maniquí">
            {([['auto', 'Según la ropa'], ['hombre', 'Hombre'], ['mujer', 'Mujer']] as const).map(([id, label]) => (
              <button key={id} className={bodyPick === id ? 'active' : ''} onClick={() => setBodyPick(id)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Medidas</h2>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Medidas del maniquí">
            <option value="">Estándar (talla M)</option>
            {(clients.data ?? [])
              .filter((c) => Object.keys(c.measurements).length)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </section>

        <Picker title="Arriba" empty="Aún no hay sudaderas, camisetas ni chaquetas diseñadas." list={tops} selected={topId} onSelect={setTopId} materials={materials} />
        <Picker title="Abajo" empty="Aún no hay pantalones diseñados." list={bottoms} selected={bottomId} onSelect={setBottomId} materials={materials} />

        <section>
          <h2>Vista</h2>
          {shown?.hood && (
            <label className="toggle-row">
              <span>Capucha puesta</span>
              <input type="checkbox" checked={hoodUp} onChange={(e) => setHoodUp(e.target.checked)} />
            </label>
          )}
          <label className="toggle-row">
            <span>Animación</span>
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>Girar 360°</span>
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
          </label>
        </section>
      </aside>
    </div>
  )
}

/** Lista de diseños para elegir, con su dibujo delantero en miniatura (otro clic lo quita). */
function Picker(props: { title: string; empty: string; list: SavedDesign[]; selected: string | null; onSelect: (id: string | null) => void; materials: Map<string, Material> }) {
  const { title, empty, list, selected, onSelect, materials } = props
  return (
    <section>
      <h2>{title}</h2>
      {list.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <div className="probador-grid">
          {list.map((d) => (
            <button key={d.id} className={selected === d.id ? 'probador-item active' : 'probador-item'} onClick={() => onSelect(selected === d.id ? null : d.id)} aria-pressed={selected === d.id}>
              <FlatView template={getTemplate(d.template)!} data={d.data} view="front" materials={materials} frame="comun" />
              <span>{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
