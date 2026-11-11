import { useState } from 'react'
import { api, useApi } from '../../api/client'
import { FlatView } from '../../designer/FlatView'
import { defaultDesign, getTemplate, NEW_DESIGN_CATALOG, type CatalogEntry } from '../../designer/templates'
import type { GarmentTemplate } from '../../designer/types'
import { GENDERS, type Design, type DesignData, type Gender } from '../../shared/designs'

interface Props {
  /** Diseño nuevo sin guardar: se puede elegir su prenda; si ya existe, «Nuevo diseño» abre otro lienzo. */
  draft: boolean
  current: string | null
  onClose: () => void
  onBlank: () => void
  onGarment: (entry: CatalogEntry, gender: Gender) => void
  onImage: (file: File) => void
  onBrand: (d: Design) => void
  onOpen: (id: string) => void
  onNew: () => void
  onLeave: (to: string) => void
}

/**
 * «Diseños», dentro del lienzo: empezar (lienzo en blanco, una prenda, una plantilla de la marca o una imagen) y abrir
 * los diseños guardados. Es lo primero que sale al entrar en el Diseñador.
 */
export function StartPanel(props: Props) {
  const designs = useApi(() => api.listDesigns(), [])
  const [tab, setTab] = useState<'nuevo' | 'mios'>(props.draft ? 'nuevo' : 'mios')
  const [gender, setGender] = useState<Gender>('hombre')
  const body = gender === 'mujer' ? 'mujer' : 'hombre'
  const catalog = NEW_DESIGN_CATALOG.filter((e) => !e.only || e.only === body)
  const all = designs.data ?? []
  const brand = all.filter((d) => d.data.brandTemplate && getTemplate(d.template))

  return (
    <div className="lz-sheet" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lz-pop-head">
        <div className="lz-seg" role="tablist">
          <button className={tab === 'nuevo' ? 'on' : ''} onClick={() => setTab('nuevo')}>
            Empezar
          </button>
          <button className={tab === 'mios' ? 'on' : ''} onClick={() => setTab('mios')}>
            Mis diseños{all.length ? ` (${all.length})` : ''}
          </button>
        </div>
        <button className="lz-x" onClick={props.onClose} aria-label="Cerrar">
          ×
        </button>
      </div>

      {tab === 'nuevo' && !props.draft && (
        <>
          <p className="lz-muted">Estás en un diseño ya guardado. Para empezar otro, abre un lienzo nuevo.</p>
          <button className="lz-btn primary" onClick={props.onNew}>
            Nuevo diseño
          </button>
        </>
      )}

      {tab === 'nuevo' && props.draft && (
        <>
          <div className="lz-grid-items">
            <button className="lz-big" onClick={props.onBlank}>
              <b>＋</b>
              Lienzo en blanco
            </button>
            <label className="lz-big">
              <b>⤒</b>
              Importar imagen
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && props.onImage(e.target.files[0])} />
            </label>
          </div>

          {brand.length > 0 && (
            <>
              <h4>Plantillas de tu marca</h4>
              <div className="lz-grid-items">
                {brand.map((d) => (
                  <button key={d.id} className="lz-lib-item" onClick={() => props.onBrand(d)} title={d.name}>
                    <div className="lz-lib-thumb">
                      <FlatView template={getTemplate(d.template)!} data={d.data} view="front" />
                    </div>
                    <span>{d.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h4>Sobre una prenda</h4>
          <div className="lz-chips">
            {GENDERS.map((g) => (
              <button key={g.id} className={gender === g.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setGender(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          {FAMILIES.map((fam) => (
            <div key={fam.id}>
              <h4>{fam.label}</h4>
              <div className="lz-grid-items">
                {catalog
                  .filter((e) => e.template.family === fam.id)
                  .map((e) => (
                    <button key={e.id} className="lz-lib-item" onClick={() => props.onGarment(e, gender)} title={e.description}>
                      <div className="lz-lib-thumb">
                        <FlatView template={e.template} data={{ ...defaultDesign(e.template, { ...e.options, genero: gender }), prints: [] } as DesignData} view="front" mode="linea" />
                      </div>
                      <span>{e.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'mios' && (
        <>
          {designs.loading && !designs.data && <p className="lz-muted">Cargando…</p>}
          {designs.data && all.length === 0 && <p className="lz-muted">Aún no has guardado ningún diseño.</p>}
          <div className="lz-grid-items">
            {!props.draft && (
              <button className="lz-big" onClick={props.onNew}>
                <b>＋</b>
                Nuevo diseño
              </button>
            )}
            {all.map((d) => {
              const t = getTemplate(d.template)
              return (
                <button key={d.id} className={d.id === props.current ? 'lz-lib-item on' : 'lz-lib-item'} onClick={() => (d.id === props.current ? props.onClose() : props.onOpen(d.id))} title={d.name}>
                  <div className="lz-lib-thumb">{t && <FlatView template={t} data={d.data} view="front" />}</div>
                  <span>
                    {d.name}
                    <br />
                    {d.clientName ?? 'Marca propia'} · {new Date(d.updatedAt).toLocaleDateString('es-ES')}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <h4>Más</h4>
      <div className="lz-chips">
        <button className="lz-chip" onClick={() => props.onLeave('/disenador/probador')}>
          Probador 3D
        </button>
        <button className="lz-chip" onClick={() => props.onLeave('/disenador/lookbook')}>
          Lookbook
        </button>
        <button className="lz-chip" onClick={() => props.onLeave('/dashboard')}>
          Salir del Diseñador
        </button>
      </div>
    </div>
  )
}

/** Grupos de prendas. */
const FAMILIES: { id: GarmentTemplate['family']; label: string }[] = [
  { id: 'top', label: 'Arriba' },
  { id: 'pants', label: 'Abajo' },
  { id: 'head', label: 'Cabeza' },
]
