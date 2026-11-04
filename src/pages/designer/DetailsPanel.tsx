import { Field } from '../../components/ui'
import { detailAspect, detailPrims, PrimsView } from '../../designer/details'
import { CX } from '../../designer/geometry'
import { UNITS_PER_CM } from '../../designer/prints'
import { VIEWS, type View } from '../../designer/types'
import type { Artwork } from '../../shared/artworks'
import { BUTTON_STYLES, DETAIL_KINDS, PATCH_SHAPES, PULLER_STYLES, ZIP_STYLES, type Detail, type DetailArt, type DetailKind } from '../../shared/designs'
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
}

/** Nombre de los dos colores según el tipo de detalle. */
const COLOR_LABELS: Record<DetailKind, [string, string | null]> = {
  boton: ['Color', null],
  cremallera: ['Dientes y tirador', 'Cinta'],
  ojal: ['Metal', null],
  remache: ['Metal', null],
  herrete: ['Metal', null],
  etiqueta: ['Fondo', 'Texto y borde'],
  parche: ['Fondo', 'Borde y texto'],
}

interface Props {
  details: Detail[]
  onChange: (d: Detail[]) => void
  view: View
  selected: string | null
  onSelect: (id: string | null) => void
  artworks: Artwork[]
}

const artOf = (a: Artwork): DetailArt => ({ artworkId: a.id, file: a.file, aspect: a.height / a.width })

/** Detalles colocados a mano: botones, cremalleras, ojales, remaches, herretes, etiquetas y parches. */
export function DetailsPanel({ details, onChange, view, selected, onSelect, artworks }: Props) {
  const current = details.find((d) => d.id === selected) ?? null
  const update = (patch: Partial<Detail>) => current && onChange(details.map((d) => (d.id === current.id ? { ...d, ...patch } : d)))
  const add = (kind: DetailKind) => {
    const d: Detail = { id: crypto.randomUUID(), view, x: CX + (kind === 'cremallera' ? 0 : 30), y: kind === 'cremallera' ? 200 : 170, ...structuredClone(DEFAULTS[kind]) }
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
          const sample = { id: k.id, view, x: 0, y: 0, ...DEFAULTS[k.id], ...(k.id === 'cremallera' ? { length: 40 } : {}) } as Detail
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

          {current.kind === 'boton' && (
            <Chips label="Tipo" value={current.style} options={BUTTON_STYLES} onChange={(style) => update({ style })} />
          )}
          {current.kind === 'cremallera' && (
            <>
              <Chips label="Cremallera" value={current.style} options={ZIP_STYLES} onChange={(style) => update({ style })} />
              <Chips label="Tirador" value={current.puller ?? 'clasico'} options={PULLER_STYLES} onChange={(puller) => update({ puller: puller as Detail['puller'] })} />
            </>
          )}
          {current.kind === 'parche' && <Chips label="Forma" value={current.style} options={PATCH_SHAPES} onChange={(style) => update({ style })} />}

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
              {current.kind === 'cremallera' ? 'Ancho de la cinta' : 'Tamaño'} ≈ <strong>{cm(current.w).toLocaleString('es-ES')} cm</strong>
            </span>
            <input
              type="range"
              min={current.kind === 'cremallera' ? 2 : 2}
              max={current.kind === 'etiqueta' || current.kind === 'parche' ? 120 : 40}
              step={0.5}
              value={current.w}
              onChange={(e) => update({ w: Number(e.target.value) })}
            />
          </label>
          {current.kind === 'cremallera' && (
            <label className="field">
              <span>
                Largo ≈ <strong>{cm(current.length ?? 120).toLocaleString('es-ES')} cm</strong>
              </span>
              <input type="range" min={10} max={320} step={1} value={current.length ?? 120} onChange={(e) => update({ length: Number(e.target.value) })} />
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
