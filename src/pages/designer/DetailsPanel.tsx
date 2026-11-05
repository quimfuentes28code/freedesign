import { Field } from '../../components/ui'
import { detailAspect, detailPrims, PrimsView } from '../../designer/details'
import { CX } from '../../designer/geometry'
import { UNITS_PER_CM as CLOTHES_UNITS } from '../../designer/prints'
import { VIEWS, type View } from '../../designer/types'
import type { Artwork } from '../../shared/artworks'
import { DETAIL_KINDS, DETAIL_STYLES, LONG_DETAILS, PULLER_STYLES, type Detail, type DetailArt, type DetailKind } from '../../shared/designs'
import { fileUrl } from '../../shared/library'

/** Cómo empieza cada detalle al añadirlo (tamaños en unidades del lienzo: 2 = 1 cm). */
const DEFAULTS: Record<DetailKind, Omit<Detail, 'id' | 'view' | 'x' | 'y'>> = {
  boton: { kind: 'boton', style: '4', w: 8, rotation: 0, color: '#2b2b2b', color2: '#1d1c1a' },
  cremallera: { kind: 'cremallera', style: 'metal', puller: 'clasico', w: 6, length: 120, rotation: 0, color: '#c9c9c9', color2: '#1d1c1a' },
  ojal: { kind: 'ojal', style: '', w: 6, rotation: 0, color: '#c9c9c9', color2: '#1d1c1a' },
  remache: { kind: 'remache', style: '', w: 5, rotation: 0, color: '#b08d57', color2: '#1d1c1a' },
  herrete: { kind: 'herrete', style: '', w: 3, rotation: 0, color: '#c9c9c9', color2: '#1d1c1a' },
  etiqueta: { kind: 'etiqueta', style: 'rect', w: 40, rotation: 0, color: '#1d1c1a', color2: '#f2efe8', text: 'TU MARCA' },
  parche: { kind: 'parche', style: 'rect', w: 50, rotation: 0, color: '#f2efe8', color2: '#1d1c1a', text: 'FD', relief: true },
  bolsillo: { kind: 'bolsillo', style: 'parche', w: 30, rotation: 0, color: '#8a8780', color2: '#1d1c1a' },
  trabilla: { kind: 'trabilla', style: '', w: 4, rotation: 0, color: '#8a8780', color2: '#1d1c1a' },
  cordon: { kind: 'cordon', style: 'tope', w: 5, length: 70, rotation: 0, color: '#f4f1ea', color2: '#2b2b2b' },
  cinta: { kind: 'cinta', style: 'lisa', w: 8, length: 160, rotation: 0, color: '#f2efe8', color2: '#1d1c1a' },
  velcro: { kind: 'velcro', style: '', w: 20, rotation: 0, color: '#2b2b2b', color2: '#1d1c1a' },
  hebilla: { kind: 'hebilla', style: 'cuadrada', w: 10, rotation: 0, color: '#c9c9c9', color2: '#1d1c1a' },
  costura: { kind: 'costura', style: 'simple', w: 3, length: 80, rotation: 0, color: '#1d1c1a', color2: '#1d1c1a' },
  pinza: { kind: 'pinza', style: '', w: 6, length: 40, rotation: 0, color: '#1d1c1a', color2: '#1d1c1a' },
}

/** Cómo se llama el estilo y el ancho en cada tipo de detalle. */
const STYLE_LABEL: Partial<Record<DetailKind, string>> = { cremallera: 'Cremallera', parche: 'Forma', bolsillo: 'Bolsillo', cinta: 'Cinta', hebilla: 'Hebilla', costura: 'Puntada', cordon: 'Remate' }
const SIZE_LABEL: Partial<Record<DetailKind, string>> = { cremallera: 'Ancho de la cinta', cinta: 'Ancho', costura: 'Separación', pinza: 'Ancho', cordon: 'Grosor del tope', bolsillo: 'Ancho' }

/** Nombre de los dos colores según el tipo de detalle. */
const COLOR_LABELS: Record<DetailKind, [string, string | null]> = {
  boton: ['Color', null],
  cremallera: ['Dientes y tirador', 'Cinta'],
  ojal: ['Metal', null],
  remache: ['Metal', null],
  herrete: ['Metal', null],
  etiqueta: ['Fondo', 'Texto y borde'],
  parche: ['Fondo', 'Borde y texto'],
  bolsillo: ['Tela', 'Pespunte y cierre'],
  trabilla: ['Tela', 'Presillas'],
  cordon: ['Cordón', 'Topes y herretes'],
  cinta: ['Cinta', 'Rayas y pespunte'],
  velcro: ['Velcro', 'Pespunte'],
  hebilla: ['Hebilla', 'Cinta'],
  costura: ['Hilo', null],
  pinza: ['Línea', null],
}

interface Props {
  details: Detail[]
  onChange: (d: Detail[]) => void
  view: View
  selected: string | null
  onSelect: (id: string | null) => void
  artworks: Artwork[]
  /** Unidades del lienzo por cm de la prenda (los detalles nuevos salen a su tamaño real). */
  upc?: number
}

const artOf = (a: Artwork): DetailArt => ({ artworkId: a.id, file: a.file, aspect: a.height / a.width })

/** Detalles colocados a mano: botones, cremalleras, ojales, remaches, herretes, etiquetas y parches. */
export function DetailsPanel({ details, onChange, view, selected, onSelect, artworks, upc = CLOTHES_UNITS }: Props) {
  const UNITS_PER_CM = upc
  const current = details.find((d) => d.id === selected) ?? null
  const update = (patch: Partial<Detail>) => current && onChange(details.map((d) => (d.id === current.id ? { ...d, ...patch } : d)))
  const add = (kind: DetailKind) => {
    const base = structuredClone(DEFAULTS[kind])
    // En las prendas que se dibujan más grandes (gorros, gorras), el detalle sale a su tamaño real
    const k = upc / CLOTHES_UNITS
    const d: Detail = { id: crypto.randomUUID(), view, x: CX + (kind === 'cremallera' ? 0 : 30), y: kind === 'cremallera' ? 200 : 170, ...base, w: base.w * k, ...(base.length ? { length: base.length * k } : {}) }
    onChange([...details, d])
    onSelect(d.id)
  }
  const cm = (u: number) => Math.round((u / UNITS_PER_CM) * 2) / 2

  return (
    <section>
      <h2>Detalles</h2>
      <p className="muted small">Se añaden en la vista {VIEWS.find((v) => v.id === view)?.label.toLowerCase()}. Arrástralos para colocarlos; la esquina los escala.</p>
      <div className="detail-kinds">
        {DETAIL_KINDS.map((k) => {
          const sample = { id: k.id, view, x: 0, y: 0, ...DEFAULTS[k.id], ...(LONG_DETAILS.includes(k.id) ? { length: DEFAULTS[k.id].w * 5 } : {}) } as Detail
          const h = sample.w * detailAspect(sample)
          const s = Math.max(sample.w, h) * 1.25
          return (
            <button key={k.id} className="detail-kind" onClick={() => add(k.id)} title={`Añadir ${k.label.toLowerCase()}`}>
              <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} width="34" height="34" aria-hidden>
                <PrimsView prims={detailPrims(sample)} />
              </svg>
              <span>{k.label}</span>
            </button>
          )
        })}
      </div>

      {current && (
        <div className="print-editor detail-editor">
          <h3 className="form-sub">{DETAIL_KINDS.find((k) => k.id === current.kind)?.label}</h3>

          {DETAIL_STYLES[current.kind] && (
            <Chips label={STYLE_LABEL[current.kind] ?? 'Tipo'} value={current.style} options={DETAIL_STYLES[current.kind]!} onChange={(style) => update({ style })} />
          )}
          {current.kind === 'cremallera' && (
            <Chips label="Tirador" value={current.puller ?? 'clasico'} options={PULLER_STYLES} onChange={(puller) => update({ puller: puller as Detail['puller'] })} />
          )}

          {(current.kind === 'etiqueta' || current.kind === 'parche') && (
            <Field label="Texto">
              <input value={current.text ?? ''} onChange={(e) => update({ text: e.target.value })} placeholder={current.art ? 'Con gráfico no se ve el texto' : ''} />
            </Field>
          )}

          {/* Gráfico: botón o tirador con logo, o parche con dibujo */}
          {((current.kind === 'boton' && current.style === 'logo') || (current.kind === 'cremallera' && current.puller === 'logo') || current.kind === 'parche') && (
            <ArtPicker art={current.art ?? null} artworks={artworks} onChange={(art) => update({ art })} />
          )}

          <div className="fields">
            <Field label={COLOR_LABELS[current.kind][0]}>
              <input type="color" value={current.color} onChange={(e) => update({ color: e.target.value })} />
            </Field>
            {COLOR_LABELS[current.kind][1] && (
              <Field label={COLOR_LABELS[current.kind][1]!}>
                <input type="color" value={current.color2} onChange={(e) => update({ color2: e.target.value })} />
              </Field>
            )}
          </div>

          <label className="field">
            <span>
              {SIZE_LABEL[current.kind] ?? 'Tamaño'} ≈ <strong>{cm(current.w).toLocaleString('es-ES')} cm</strong>
            </span>
            <input
              type="range"
              min={current.kind === 'costura' ? 1 : 2}
              max={(['etiqueta', 'parche', 'bolsillo'].includes(current.kind) ? 120 : current.kind === 'costura' ? 10 : 40) * (upc / CLOTHES_UNITS)}
              step={0.5}
              value={current.w}
              onChange={(e) => update({ w: Number(e.target.value) })}
            />
          </label>
          {LONG_DETAILS.includes(current.kind) && (
            <label className="field">
              <span>
                Largo ≈ <strong>{cm(current.length ?? 120).toLocaleString('es-ES')} cm</strong>
              </span>
              <input type="range" min={4} max={800} step={1} value={current.length ?? 120} onChange={(e) => update({ length: Number(e.target.value) })} />
            </label>
          )}
          <label className="field">
            <span>
              Giro <strong>{Math.round(current.rotation)}°</strong>
            </span>
            <input type="range" min={-180} max={180} value={current.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} />
          </label>
          {(current.kind === 'etiqueta' || current.kind === 'parche') && (
            <label className="toggle-row">
              <span>Bordado / en relieve</span>
              <input type="checkbox" checked={!!current.relief} onChange={(e) => update({ relief: e.target.checked || undefined })} />
            </label>
          )}
          <div className="print-actions">
            <button className="button" onClick={() => update({ x: CX })}>
              ↔ Centrar
            </button>
            <button
              className="button"
              onClick={() => {
                const copy = { ...structuredClone(current), id: crypto.randomUUID(), x: current.x + 12, y: current.y + 12 }
                onChange([...details, copy])
                onSelect(copy.id)
              }}
            >
              Duplicar
            </button>
            <button className="button" onClick={() => update({ locked: !current.locked })}>
              {current.locked ? 'Desbloquear' : 'Bloquear'}
            </button>
            <button
              className="button danger"
              onClick={() => {
                onChange(details.filter((d) => d.id !== current.id))
                onSelect(null)
              }}
            >
              Quitar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="option-row">
      <span>{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button key={o.id} className={value === o.id ? 'chip active' : 'chip'} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Elegir un gráfico de la Biblioteca para un botón, un tirador o un parche. */
export function ArtPicker({ art, artworks, onChange }: { art: DetailArt | null; artworks: Artwork[]; onChange: (a: DetailArt | null) => void }) {
  return (
    <div className="option-row">
      <span>Gráfico</span>
      {artworks.length === 0 ? (
        <p className="muted small">Sube o crea un gráfico en Biblioteca → Gráficos para usarlo aquí.</p>
      ) : (
        <div className="art-picker">
          {artworks.map((a) => (
            <button key={a.id} className={art?.artworkId === a.id ? 'art-pick active' : 'art-pick'} onClick={() => onChange(artOf(a))} title={a.name}>
              <img src={fileUrl(a.file)} alt={a.name} />
            </button>
          ))}
          {art && (
            <button className="link-button inline" onClick={() => onChange(null)}>
              Quitar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
