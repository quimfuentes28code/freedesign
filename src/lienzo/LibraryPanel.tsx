// Biblioteca del lienzo (prendas, mockups, fornituras, gráficos, texturas, mis mockups) y editor de pinceles propios.

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { FlatView } from '../designer/FlatView'
import { defaultDesign, getTemplate, NEW_DESIGN_CATALOG, TEMPLATES } from '../designer/templates'
import type { GarmentTemplate, Options } from '../designer/types'
import { DETAIL_DEFAULTS } from '../pages/designer/DetailsPanel'
import { standardBody, type Body } from '../production/measurements'
import { DETAIL_KINDS, DETAIL_STYLES, type DesignData, type Detail, type DetailKind, type DetailLayer, type HardwarePreset, type MockupLayer, type LienzoAsset } from '../shared/designs'
import { type BrushPreset } from './brushes'
import { TEXTURES, textureTile, type TextureDef } from './textures'
import { TemplateGallery } from '../pages/library/ArtworkCreator'
import { detailCanvas, onArtLoaded, type Runtime } from './engine'
import { MOCKUPS, type MockupAsset } from './mockups'
import type { Artwork } from '../shared/artworks'
import { fileUrl as fileOf } from '../shared/library'
import { assetBrush } from './canvasUtils'

/** Lo que se puede arrastrar desde la biblioteca. */
export type LibraryItem =
  | { kind: 'garment'; id: string; label: string }
  | { kind: 'option'; option: string; value: string | boolean; label: string }
  | { kind: 'art'; artwork: Artwork; label: string } | { kind: 'mockup'; asset: MockupAsset; label: string } | { kind: 'detail'; detail: Detail; label: string } | { kind: 'mymockup'; asset: LienzoAsset; label: string }

/** Fornitura de la biblioteca: la de serie de su tipo, con un estilo. */
export const stock = (kind: DetailKind, style: string | null): Detail => ({ ...DETAIL_DEFAULTS[kind], ...(style ? { style } : {}), id: 'stock', view: 'front', x: 0, y: 0 })

/** Fornituras de la biblioteca: cada tipo con sus estilos (cremalleras metálicas, invisibles, botones de 2 o 4 agujeros…). */
export const EFFECTS: DetailKind[] = ['roto', 'deshilachado', 'desgaste']
export const HARDWARE: { kind: DetailKind; styles: (string | null)[] }[] = DETAIL_KINDS.filter((k) => !EFFECTS.includes(k.id)).map((k) => ({
  kind: k.id,
  styles: DETAIL_STYLES[k.id]?.map((s) => s.id) ?? [null],
}))

/** Biblioteca visual: prendas del catálogo y fornituras, para tocar (al centro) o arrastrar al lienzo. */
export function Library({
  onCreateArtwork,
  onEditArtwork,
  textures,
  myMockups,
  onUploadMockup,
  onTexture,
  onUploadTexture,
  onDeleteTexture,
  materials,
  artworks,
  presets,
  onDeletePreset,
  onStart,
}: {
  onCreateArtwork: (template?: string) => void
  onEditArtwork: (a: Artwork) => void
  textures: LienzoAsset[]
  myMockups: LienzoAsset[]
  onUploadMockup: (f: { file: File; name: string; template: string; view: 'front' | 'back' | 'side'; removeBg: boolean }) => void
  onTexture: (t: TextureDef | LienzoAsset) => void
  onUploadTexture: (f: File) => void
  onDeleteTexture: (t: LienzoAsset) => void
  materials: Map<string, import('../shared/library').Material>
  artworks: Artwork[]
  presets: HardwarePreset[]
  onDeletePreset: (p: HardwarePreset) => void
  onStart: (item: LibraryItem, e: React.PointerEvent) => void
}) {
  const brandColors = useAuth().user?.brandColors ?? []
  const [tab, setTab] = useState<'mockups' | 'texturas' | 'prendas' | 'cuellos' | 'graficos' | 'fornituras' | 'mias'>('mockups')
  const [kind, setKind] = useState<DetailKind>('cremallera')
  const body = useMemo(() => standardBody('M'), [])
  return (
    <div className="lz-library">
      <div className="lz-chips">
        <button className={tab === 'mockups' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('mockups')} title="Dibujos planos para pintar encima">
          Mockups
        </button>
        <button className={tab === 'texturas' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('texturas')} title="Telas y efectos: se ponen encima de la capa elegida, recortados a ella">
          Texturas
        </button>
        <button className={tab === 'prendas' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('prendas')} title="Prendas del Diseñador: se les cambia el cuello, la capucha… y se pintan por piezas">
          Prendas editables
        </button>
        <button className={tab === 'cuellos' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('cuellos')} title="Arrástralos encima de una prenda editable">
          Cuellos y capuchas
        </button>
        <button className={tab === 'graficos' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('graficos')} title="Tus logos y estampados de Biblioteca → Gráficos">
          Gráficos
        </button>
        <button className={tab === 'fornituras' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('fornituras')}>
          Fornituras y detalles
        </button>
        <button className={tab === 'mias' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('mias')}>
          Mis fornituras{presets.length ? ` (${presets.length})` : ''}
        </button>
      </div>
      {tab === 'texturas' ? (
        <>
          <p className="lz-muted">Toca una: se pone encima de la capa elegida (la prenda o tu color), recortada a ella y en Superponer. Puedes poner varias.</p>
          {(['Telas', 'Efectos'] as const).map((group) => (
            <div key={group}>
              <p className="lz-label">{group}</p>
              <div className="lz-grid-items">
                {TEXTURES.filter((t) => t.group === group).map((t) => (
                  <button key={t.id} className="lz-lib-item" onClick={() => onTexture(t)} title={t.name}>
                    <TextureThumb id={t.id} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="lz-label">Mis texturas</p>
          <div className="lz-grid-items">
            <label className="lz-lib-item lz-upload" title="Cualquier imagen: una foto de tela, una textura descargada…">
              <div className="lz-lib-thumb">＋</div>
              <span>Subir textura</span>
              <input type="file" accept="image/*" hidden onChange={(ev) => ev.target.files?.[0] && onUploadTexture(ev.target.files[0])} />
            </label>
            {textures.map((t) => (
              <div key={t.id} className="lz-lib-item" title={t.name}>
                <button className="lz-lib-pick" onClick={() => onTexture(t)}>
                  <div className="lz-lib-thumb">
                    <img src={fileOf(t.file)} alt={t.name} draggable={false} />
                  </div>
                  <span>{t.name}</span>
                </button>
                <button className="lz-mini" onClick={() => confirm(`¿Quitar «${t.name}» de Mis texturas?`) && onDeleteTexture(t)} title="Quitar de Mis texturas">
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="lz-muted">Arrastra al lienzo o toca para ponerlo en el centro.</p>
      )}
      {tab === 'texturas' ? null : tab === 'cuellos' ? (
        <>
          <p className="lz-muted">Suéltalos encima de una prenda editable (la de tu diseño o las de «Prendas editables»).</p>
          <div className="lz-grid-items">
            {NECKS.map((n) => (
              <button key={n.option + String(n.value)} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'option', option: n.option, value: n.value, label: n.label }, ev)} title={n.label}>
                <div className="lz-lib-thumb neck">
                  <FlatView template={n.template} data={n.data} view="front" materials={materials} mode="linea" />
                </div>
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : tab === 'graficos' ? (
        <>
          <div className="lz-chips">
            <button className="lz-chip on" onClick={() => onCreateArtwork()}>
              + Crear un gráfico o logo
            </button>
            <button className="lz-chip on" onClick={() => onCreateArtwork('graffiti')} title="Escribe un texto y elige el estilo: burbuja, wildstyle, 3D, tag…">
              + Graffiti
            </button>
          </div>
          <p className="lz-label">Empezar con un logo</p>
          <div className="lz-templates">
            <TemplateGallery brand={brandColors} onPick={(t) => onCreateArtwork(t.id)} />
          </div>
          <p className="lz-label">Tus gráficos (toca para ponerlo; doble toque para editarlo)</p>
          {artworks.length ? (
          <div className="lz-grid-items">
            {artworks.map((a) => (
              <button key={a.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'art', artwork: a, label: a.name }, ev)} onDoubleClick={() => onEditArtwork(a)} title={a.name + " (doble toque para editarlo)"}>
                <div className="lz-lib-thumb checker">
                  <img src={fileOf(a.file)} alt={a.name} draggable={false} />
                </div>
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="lz-muted">Aún no tienes gráficos: crea uno arriba o súbelos en Biblioteca → Gráficos.</p>
          )}
        </>
      ) : tab === 'mockups' ? (
        <>
        <MyMockups items={myMockups} onUpload={onUploadMockup} onDelete={onDeleteTexture} onStart={onStart} />
        <p className="lz-label">Mockups de la app</p>
        <div className="lz-grid-items">
          {MOCKUPS.map((m) => (
            <button key={m.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'mockup', asset: m, label: m.name }, ev)} title={m.name}>
              <div className="lz-lib-thumb">
                <img src={m.file} alt={m.name} draggable={false} />
              </div>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
        </>
      ) : tab === 'mias' ? (
        presets.length ? (
          <div className="lz-grid-items">
            {presets.map((p) => (
              <div key={p.id} className="lz-lib-wrap">
                <button className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'detail', detail: p.detail, label: p.name }, ev)} title={p.name}>
                  <div className="lz-lib-thumb">
                    <DetailThumb detail={p.detail} />
                  </div>
                  <span>{p.name}</span>
                </button>
                <button className="lz-lib-del" onClick={() => onDeletePreset(p)} title="Quitar de mis fornituras" aria-label={`Quitar ${p.name}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="lz-muted">
            Aún no tienes fornituras propias. Pon una en el lienzo (una cremallera, un botón, un parche…), ajústala a tu gusto (tipo, tirador, colores, tu
            logo) y, en sus ajustes de la capa, toca «Guardar en mis fornituras».
          </p>
        )
      ) : tab === 'prendas' ? (
        <div className="lz-grid-items">
          {NEW_DESIGN_CATALOG.map((e) => {
            const data = { ...defaultDesign(e.template, e.options), prints: [] } as DesignData
            return (
              <button key={e.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'garment', id: e.id, label: e.name }, ev)} title={e.description}>
                <div className="lz-lib-thumb">
                  <FlatView template={e.template} data={data} view="front" materials={materials} mode="linea" body={body} />
                </div>
                <span>{e.name}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="lz-chips">
            {HARDWARE.map((h) => (
              <button key={h.kind} className={h.kind === kind ? 'lz-chip on' : 'lz-chip'} onClick={() => setKind(h.kind)}>
                {DETAIL_KINDS.find((k) => k.id === h.kind)?.label}
              </button>
            ))}
          </div>
          <div className="lz-grid-items">
            {HARDWARE.find((h) => h.kind === kind)!.styles.map((style) => {
              const label = DETAIL_STYLES[kind]?.find((x) => x.id === style)?.label ?? DETAIL_KINDS.find((k) => k.id === kind)?.label ?? ''
              return (
                <button key={style ?? 'x'} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'detail', detail: stock(kind, style), label: DETAIL_KINDS.find((k) => k.id === kind)?.label ?? label }, ev)}>
                  <div className="lz-lib-thumb">
                    <DetailThumb detail={stock(kind, style)} />
                  </div>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Miniatura de una fornitura con su estilo. */
export function DetailThumb({ detail }: { detail: Detail }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(detail)
  const [, again] = useReducer((n: number) => n + 1, 0)
  useEffect(() => onArtLoaded(again), [])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const layer: DetailLayer = {
      id: `thumb-${key}`,
      kind: 'detail',
      name: '',
      detail,
      x: 0,
      y: 0,
      w: 120,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'normal',
    }
    const src = detailCanvas(thumbRuntime, layer)
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const k = Math.min((c.width * 0.8) / src.width, (c.height * 0.8) / src.height)
    g.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k)
  })
  return <canvas ref={ref} width={120} height={90} />
}
/** Memoria aparte para las miniaturas de la biblioteca. */
export const thumbRuntime = { details: new Map() } as unknown as Runtime

/** De dónde sale el dibujo de un mockup: la prenda del propio diseño o una del catálogo con sus opciones y colores. */
export function mockupSource(l: MockupLayer, own: GarmentTemplate, data: DesignData, body: Body) {
  if (!l.template) return { t: own, data, body }
  const t = getTemplate(l.template)
  if (!t) return null
  const base = defaultDesign(t, l.options)
  // Lo que no se ha pintado, en gris muy claro (como el mockup en línea)
  const pieces = Object.fromEntries(
    Object.entries(base.pieces).map(([k, v]) => [k, { ...v, color: l.pieces?.[k]?.color ?? (l.style === 'color' ? '#ebebea' : v.color), ...(l.pieces?.[k]?.surface ? { surface: l.pieces[k].surface } : {}) }]),
  )
  const kind = l.options?.genero === 'mujer' ? 'mujer' : 'hombre'
  return { t, data: { ...base, pieces, prints: [] } as DesignData, body: standardBody('M', kind) }
}

/**
 * Opciones de una prenda (cuello, capucha, bolsillos, mangas, largos…) viendo cómo queda cada una: una miniatura
 * de la prenda con esa opción. Se abre una opción cada vez.
 */
export function GarmentOptions({ layer, own, materials, onChange }: { layer: MockupLayer; own: { template: GarmentTemplate; data: DesignData }; materials: Map<string, import('../shared/library').Material>; onChange: (p: Options) => void }) {
  const t = layer.template ? getTemplate(layer.template) : own.template
  const [open, setOpen] = useState<string | null>(null)
  if (!t) return null
  const current: Options = layer.template ? { ...defaultDesign(t).options, ...layer.options } : own.data.options
  const base = layer.template ? ({ ...defaultDesign(t, current), prints: [] } as DesignData) : own.data
  return (
    <div className="lz-options">
      {t.options.map((o) => {
        const value = current[o.id]
        const choices = o.type === 'choice' ? o.choices : [
          { id: 'true', label: 'Sí' },
          { id: 'false', label: 'No' },
        ]
        const label = o.type === 'choice' ? o.choices.find((c) => c.id === value)?.label : value ? 'Sí' : 'No'
        return (
          <div key={o.id} className="lz-option">
            <button className="lz-option-head" onClick={() => setOpen(open === o.id ? null : o.id)}>
              <span>{o.label}</span>
              <strong>{label}</strong>
            </button>
            {open === o.id && (
              <div className="lz-grid-items small">
                {choices.map((c) => {
                  const v = o.type === 'choice' ? c.id : c.id === 'true'
                  const data = { ...base, options: { ...base.options, [o.id]: v } }
                  return (
                    <button key={c.id} className={String(value) === String(v) ? 'lz-lib-item on' : 'lz-lib-item'} onClick={() => onChange({ [o.id]: v })}>
                      <div className="lz-lib-thumb">
                        <FlatView template={t} data={data} view={layer.view} materials={materials} mode="linea" />
                      </div>
                      <span>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Cuellos y capuchas de la biblioteca: cada tipo de cuello de las prendas del catálogo (una vez cada uno) y la
 * capucha, con la miniatura de una prenda que lo lleva.
 */
export const NECKS: { option: string; value: string | boolean; label: string; template: GarmentTemplate; data: DesignData }[] = (() => {
  const out: { option: string; value: string | boolean; label: string; template: GarmentTemplate; data: DesignData }[] = []
  const seen = new Set<string>()
  for (const e of NEW_DESIGN_CATALOG) {
    const t = e.template
    for (const o of t.options) {
      if (o.id === 'cuello' && o.type === 'choice')
        for (const c of o.choices) {
          if (seen.has(c.id)) continue
          seen.add(c.id)
          out.push({ option: 'cuello', value: c.id, label: c.id === 'capucha' ? 'Capucha' : `Cuello ${c.label.toLowerCase()}`, template: t, data: { ...defaultDesign(t, { ...e.options, cuello: c.id }), prints: [] } as DesignData })
        }
      if (o.id === 'capucha' && o.type === 'toggle' && !seen.has('capucha-toggle')) {
        seen.add('capucha-toggle')
        out.push({ option: 'capucha', value: true, label: 'Capucha (sudadera)', template: t, data: { ...defaultDesign(t, { ...e.options, capucha: true }), prints: [] } as DesignData })
        out.push({ option: 'capucha', value: false, label: 'Sin capucha (sudadera)', template: t, data: { ...defaultDesign(t, { ...e.options, capucha: false }), prints: [] } as DesignData })
      }
    }
  }
  return out
})()

/** Muestra de una textura de la app. */
export function TextureThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Las texturas se hacen la primera vez (unas décimas cada una): de una en una, sin congelar el panel
    const i = TEXTURES.findIndex((t) => t.id === id)
    const timer = setTimeout(() => {
      const c = ref.current
      if (!c) return
      // Un trozo del azulejo a su tamaño (se ve el tejido)
      c.getContext('2d')!.drawImage(textureTile(id), 0, 0, 240, 156, 0, 0, c.width, c.height)
    }, 30 + Math.max(0, i) * 60)
    return () => clearTimeout(timer)
  }, [id])
  return (
    <div className="lz-lib-thumb">
      <canvas ref={ref} width={160} height={104} />
    </div>
  )
}

/** Ajustes de un pincel propio: nombre, flujo, separación, grano, presión, dispersión, afinado y giro de la punta. */
export function BrushEditor({ asset, onSave, onDelete }: { asset: LienzoAsset; onSave: (name: string, s: LienzoAsset['settings']) => void; onDelete: () => void }) {
  const [name, setName] = useState(asset.name)
  const [s, setS] = useState(asset.settings)
  const base = assetBrush({ ...asset, settings: s })
  const fields: [keyof BrushPreset & string, string, number, number, number][] = [
    ['flow', 'Flujo', 0.01, 1, 0.01],
    ['spacing', 'Separación', 0.01, 3, 0.01],
    ...(asset.file ? [] : ([['hardness', 'Dureza', 0, 1, 0.05]] as [keyof BrushPreset & string, string, number, number, number][])),
    ['grain', 'Grano', 0, 1, 0.05],
    ['pressureSize', 'Presión → tamaño', 0, 1, 0.05],
    ['pressureOpacity', 'Presión → opacidad', 0, 1, 0.05],
    ['scatter', 'Dispersión', 0, 2, 0.05],
    ['taper', 'Afinado', 0, 120, 1],
  ]
  return (
    <div className="lz-brush-editor">
      <p className="lz-label">Ajustes de «{asset.name}»</p>
      <input className="lz-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del pincel" />
      {fields.map(([k, label, min, max, step]) => (
        <div key={k} className="lz-field">
          <span>
            {label} <strong>{Number(base[k]).toFixed(step < 1 ? 2 : 0)}</strong>
          </span>
          <input type="range" min={min} max={max} step={step} value={Number(base[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
        </div>
      ))}
      {asset.file && (
        <label className="lz-toggle">
          <input type="checkbox" checked={s.orient === true} onChange={(e) => setS({ ...s, orient: e.target.checked })} /> La punta gira con el trazo
        </label>
      )}
      <div className="lz-chips">
        <button className="lz-chip on" onClick={() => onSave(name.trim() || asset.name, s)}>
          Guardar cambios
        </button>
        <button className="lz-chip danger" onClick={() => confirm(`¿Borrar el pincel «${asset.name}»?`) && onDelete()}>
          Borrar pincel
        </button>
      </div>
    </div>
  )
}

/** «Mis mockups»: tus dibujos de prendas, cada uno con qué prenda es y qué vista (así pasan al 3D sin elegir nada más). */
export function MyMockups({
  items,
  onUpload,
  onDelete,
  onStart,
}: {
  items: LienzoAsset[]
  onUpload: (f: { file: File; name: string; template: string; view: 'front' | 'back' | 'side'; removeBg: boolean }) => void
  onDelete: (a: LienzoAsset) => void
  onStart: (item: LibraryItem, e: React.PointerEvent) => void
}) {
  const [form, setForm] = useState<{ file: File; name: string; template: string; view: 'front' | 'back' | 'side'; removeBg: boolean } | null>(null)
  const garments = TEMPLATES.filter((t) => NEW_DESIGN_CATALOG.some((c) => c.template.id === t.id))
  return (
    <>
      <p className="lz-label">Mis mockups</p>
      {form ? (
        <div className="lz-mymockup-form">
          <label className="lz-field">
            <span>Nombre</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
          </label>
          <label className="lz-field">
            <span>¿Qué prenda es? (para el 3D)</span>
            <select value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
              {garments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="lz-chips">
            {(
              [
                ['front', 'Delante'],
                ['back', 'Detrás'],
                ['side', 'De lado'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={form.view === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setForm({ ...form, view: id })}>
                {label}
              </button>
            ))}
          </div>
          <label className="lz-toggle">
            <input type="checkbox" checked={form.removeBg} onChange={(e) => setForm({ ...form, removeBg: e.target.checked })} />
            <span>Quitar el fondo (blanco o liso)</span>
          </label>
          <div className="lz-chips">
            <button className="lz-btn primary" onClick={() => (onUpload(form), setForm(null))}>
              Guardar y poner
            </button>
            <button className="lz-btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <label className="lz-chip" title="Sube el dibujo de una prenda tuya (PNG o JPG): dices qué prenda es y qué vista, y pasa al 3D">
          + Subir mi mockup
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) setForm({ file, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), template: garments[0]?.id ?? 'sudadera', view: 'front', removeBg: true })
            }}
          />
        </label>
      )}
      {items.length > 0 && (
        <div className="lz-grid-items">
          {items.map((a) => (
            <div key={a.id} className="lz-lib-wrap">
              <button className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'mymockup', asset: a, label: a.name }, ev)} title={a.name}>
                <div className="lz-lib-thumb">
                  <img src={fileOf(a.file)} alt={a.name} draggable={false} />
                </div>
                <span>
                  {a.name}
                  <br />
                  {getTemplate(String(a.settings.template))?.name ?? ''} · {a.settings.view === 'back' ? 'detrás' : a.settings.view === 'side' ? 'de lado' : 'delante'}
                </span>
              </button>
              <button className="lz-lib-del" onClick={() => onDelete(a)} title="Quitar de Mis mockups" aria-label={`Quitar ${a.name}`}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
