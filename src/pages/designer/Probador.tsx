import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { Status } from '../../components/ui'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import { mannequinMeasurements } from '../../designer/to3d'
import { isPants } from '../../designer/types'
import { bodyKind, type Design as SavedDesign } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { useDressing } from '../../three/cloth/dressClient'
import { POSES, type PoseId } from '../../three/pose'
import { Scene } from '../../three/Scene'
import { isRealShoe, REAL_SHOES } from '../../three/RealShoes'
import { SHOE_STYLES } from '../../three/Shoes'
import type { ShoeStyle } from '../../types'
import { basicTee, bodyOf, outfitOf, useDesign3D, type TeeChoice } from './Design3D'
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
  const [hatId, setHatId] = useState<string | null>(null)
  const [hoodUp, setHoodUp] = useState(false)
  // Prenda de arriba abierta y camiseta básica debajo
  const [open, setOpen] = useState(false)
  const [teeColor, setTeeColor] = useState<TeeChoice>('')
  const [shoes, setShoes] = useState<ShoeStyle | null>('globe')
  const [shoeColor, setShoeColor] = useState('#1f5f8b')
  const [autoRotate, setAutoRotate] = useState(false)
  // Calidad alta: malla fina y pliegues finos (tarda unos segundos más)
  const [hq, setHq] = useState(true)
  // Pose del maniquí: la ropa se calcula en ella
  const [pose, setPose] = useState<PoseId>('reposo')

  const all = (designs.data ?? []).filter((d) => getTemplate(d.template))
  const tops = all.filter((d) => getTemplate(d.template)!.family === 'top')
  const heads = all.filter((d) => getTemplate(d.template)!.family === 'head')
  const hatDesign = heads.find((d) => d.id === hatId) ?? null
  const bottoms = all.filter((d) => isPants(getTemplate(d.template)!))
  const top = tops.find((d) => d.id === topId) ?? null
  const bottom = bottoms.find((d) => d.id === bottomId) ?? null
  const client = clients.data?.find((c) => c.id === clientId)
  const auto = [top, bottom, hatDesign].some((d) => d && bodyKind(d.data) === 'mujer') ? 'mujer' : 'hombre'
  const kind = bodyPick === 'auto' ? auto : bodyPick
  const body = useMemo(() => bodyOf(client, kind), [client, kind])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements, kind), [client, kind])

  const top3d = useDesign3D(top ? getTemplate(top.template) : null, top?.data, materials, body)
  const bottom3d = useDesign3D(bottom ? getTemplate(bottom.template) : null, bottom?.data, materials, body)
  const hat3d = useDesign3D(hatDesign ? getTemplate(hatDesign.template) : null, hatDesign?.data, materials, body)
  // La prenda de arriba va por fuera; el pantalón, debajo
  const canOpen = !!top3d?.top?.closure?.full
  const tee = useMemo(() => (canOpen && teeColor ? basicTee(teeColor, kind === 'mujer') : null), [canOpen, teeColor, kind])
  const worn = useMemo(() => {
    const main = top3d ?? bottom3d
    return main ? outfitOf(main, top3d && bottom3d ? bottom3d : null, false, tee) : null
  }, [top3d, bottom3d, tee])
  // Solo con el gorro o la gorra, el maniquí lleva eso (en la cabeza); con ropa, va además de ella
  // Progresivo: primero la versión rápida (se ve en un momento) y, al terminar, se afina sola con la malla fina
  const dressing = useDressing()
  const outfitKey = JSON.stringify([topId, bottomId, clientId, kind, open, hoodUp, teeColor, pose])
  const [refined, setRefined] = useState(false)
  const sawBusy = useRef(false)
  useEffect(() => {
    setRefined(false)
    sawBusy.current = false
  }, [outfitKey])
  useEffect(() => {
    if (dressing) {
      sawBusy.current = true
      return
    }
    if (!sawBusy.current || refined) return
    // Entre una prenda y la de encima (que espera a la de debajo) hay un momento sin cálculo: se espera un poco para
    // afinar solo cuando todas tienen ya su versión rápida
    const t = setTimeout(() => setRefined(true), 600)
    return () => clearTimeout(t)
  }, [dressing, refined])
  const quality = hq && refined ? ('alta' as const) : undefined
  const shown = useMemo(() => (worn ? { ...worn.design, hoodUp, open: canOpen && open, quality } : hat3d), [worn, hoodUp, canOpen, open, hat3d, quality])
  const under = useMemo(() => worn?.outfit.map((d) => ({ ...d, quality })), [worn, quality])

  return (
    <div className="studio probador">
      <main className="viewport">
        {shown ? (
          <Scene measurements={measurements} design={shown} outfit={under} autoRotate={autoRotate} animate={false} pose={pose} shoes={shoes} shoeColor={shoeColor} hat={worn ? hat3d : null} />
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
        <Picker title="Cabeza" empty="Aún no hay gorros ni gorras diseñados." list={heads} selected={hatId} onSelect={setHatId} materials={materials} />

        <section>
          <h2>Pose</h2>
          <div className="chips">
            {POSES.map((p) => (
              <button key={p.id} className={pose === p.id ? 'chip active' : 'chip'} onClick={() => setPose(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Calzado</h2>
          <div className="chips">
            {[{ id: null, label: 'Descalzo' }, ...SHOE_STYLES].map((o) => (
              <button key={o.id ?? 'none'} className={shoes === o.id ? 'chip active' : 'chip'} onClick={() => setShoes(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          {isRealShoe(shoes) && (
            <>
              {REAL_SHOES[shoes].tint && (
                <label className="toggle-row">
                  <span>Color</span>
                  <input type="color" value={shoeColor} onChange={(e) => setShoeColor(e.target.value)} aria-label="Color de la zapatilla" />
                </label>
              )}
              <p className="muted small">{REAL_SHOES[shoes].credit}</p>
            </>
          )}
        </section>

        <section>
          <h2>Vista</h2>
          {shown?.hood && (
            <label className="toggle-row">
              <span>Capucha puesta</span>
              <input type="checkbox" checked={hoodUp} onChange={(e) => setHoodUp(e.target.checked)} />
            </label>
          )}
          {canOpen && (
            <>
              <label className="toggle-row">
                <span>Abierta</span>
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
              </label>
              <label className="toggle-row">
                <span>Debajo</span>
                <select value={teeColor} onChange={(e) => setTeeColor(e.target.value as TeeChoice)} aria-label="Camiseta debajo">
                  <option value="">Nada</option>
                  <option value="blanca">Camiseta blanca</option>
                  <option value="negra">Camiseta negra</option>
                </select>
              </label>
            </>
          )}
          <label className="toggle-row" title="Malla más fina y pliegues naturales, como un programa de patronaje 3D (tarda unos segundos)">
            <span>Calidad alta</span>
            <input type="checkbox" checked={hq} onChange={(e) => setHq(e.target.checked)} />
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
