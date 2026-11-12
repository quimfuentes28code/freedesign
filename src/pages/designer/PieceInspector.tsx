import { useMemo, useState } from 'react'
import { chartColor, COLOR_CHART, colorLabel } from '../../designer/colors'
import type { PieceDef } from '../../designer/types'
import type { Artwork } from '../../shared/artworks'
import { BUTTON_STYLES, PULLER_STYLES, SURFACE_KINDS, WASH_KINDS, ZIP_STYLES, type ColorBlock, type HardwareStyle, type PieceStyle, type Surface, type SurfaceKind, type WashKind } from '../../shared/designs'
import { DEFAULT_SIZE } from '../../designer/surfaces'
import { PATTERN_GROUPS, patternDefaults, THREE_COLORS } from '../../designer/morePatterns'
import { ArtPicker } from './DetailsPanel'
import type { Material } from '../../shared/library'
import { MaterialPicker } from './MaterialPicker'
import { Fold } from './Fold'
import { POCKET_SHAPE_PARAMS } from '../../designer/details'
import { useAuth } from '../../auth/AuthContext'
import { api, useApi } from '../../api/client'
import { fileUrl } from '../../shared/library'

interface Props {
  template: string
  piece: PieceDef
  style: PieceStyle
  /** Colores que ya usa el diseño (para repetirlos en otras piezas). */
  used: string[]
  materials: Material[]
  onChange: (patch: Partial<PieceStyle>) => void
  /** Copiar el color y el tejido de esta pieza a todas las piezas de tela. */
  onApplyToAll: () => void
  /** Estilo de las fornituras de la prenda (si la pieza es de botones o la cremallera). */
  hardware?: HardwareStyle
  onHardware?: (h: HardwareStyle) => void
  /** La pieza es la cremallera de la prenda. */
  isZip?: boolean
  /** La pieza tiene bolsillos de parche cuya forma se puede cambiar. */
  hasPockets?: boolean
  artworks?: Artwork[]
  /** Bloques de color de esta pieza (en todas las vistas). */
  blocks?: ColorBlock[]
  onBlocks?: (blocks: ColorBlock[]) => void
  /** La herramienta para dividir la pieza con una línea está activa. */
  blockTool?: boolean
  onBlockTool?: (on: boolean) => void
}

/** Propiedades de la pieza seleccionada: color (con nombre y código), carta de colores y material. */
export function PieceInspector(props: Props) {
  const { template, piece, style, used, materials, onChange, onApplyToAll, hardware = {}, onHardware, isZip, hasPockets, artworks = [], blocks = [], onBlocks, blockTool, onBlockTool } = props
  const label = colorLabel(style)
  const brand = useAuth().user?.brandColors ?? []
  // Al elegir un color a mano se olvidan el nombre y el código (salvo que sea uno de la marca o de la carta)
  const setHex = (hex: string) => {
    const c = brand.find((b) => b.hex === hex) ?? chartColor(hex)
    onChange({ color: hex, colorName: c?.name ?? '', colorCode: c?.code ?? '' })
  }
  const fabric = piece.materials.includes('tejido')

  return (
    <div className="inspector-piece">
      <div className="inspector-color">
        <label className="big-swatch" title="Elegir cualquier color">
          <input type="color" value={style.color} onChange={(e) => setHex(e.target.value)} />
          <span style={{ background: style.color }} />
        </label>
        <div>
          <strong>{piece.label}</strong>
          <span className="muted small">
            {label.name || 'Color sin nombre'}
            {label.code && ` · ${label.code}`}
          </span>
        </div>
      </div>

      <Fold title="Color y código" open>
      <div className="inspector-fields">
        <label>
          <span>Hex</span>
          {/* Sin controlar: se puede escribir a medias y solo se aplica cuando es un color completo */}
          <input
            key={style.color}
            defaultValue={style.color.toUpperCase()}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (/^#[0-9a-f]{6}$/i.test(v)) setHex(v.toLowerCase())
            }}
            maxLength={7}
            spellCheck={false}
          />
        </label>
        <label>
          <span>Nombre del color</span>
          <input value={style.colorName ?? ''} placeholder={label.name || 'p. ej. Negro carbón'} onChange={(e) => onChange({ colorName: e.target.value })} />
        </label>
        <label>
          <span>Código (Pantone, proveedor…)</span>
          <input value={style.colorCode ?? ''} placeholder={label.code || 'p. ej. 19-4007 TCX'} onChange={(e) => onChange({ colorCode: e.target.value })} />
        </label>
      </div>

      {brand.length > 0 && (
        <div className="inspector-block">
          <h3>Colores de la marca</h3>
          <div className="palette">
            {brand.map((c, i) => (
              <button
                key={i}
                className={c.hex === style.color ? 'swatch-button active' : 'swatch-button'}
                style={{ background: c.hex }}
                onClick={() => onChange({ color: c.hex, colorName: c.name, colorCode: c.code })}
                title={[c.name, c.code].filter(Boolean).join(' · ') || c.hex.toUpperCase()}
                aria-label={c.name || c.hex}
              />
            ))}
          </div>
        </div>
      )}

      {used.length > 1 && (
        <div className="inspector-block">
          <h3>Colores de este diseño</h3>
          <div className="palette">
            {used.map((c) => (
              <button
                key={c}
                className={c === style.color ? 'swatch-button active' : 'swatch-button'}
                style={{ background: c }}
                onClick={() => setHex(c)}
                title={chartColor(c)?.name ?? c.toUpperCase()}
                aria-label={`Color ${chartColor(c)?.name ?? c}`}
              />
            ))}
          </div>
        </div>
      )}
      </Fold>

      <Fold title="Carta de colores">
        <ColorChart current={style.color} brand={brand} onPick={(c) => onChange({ color: c.hex, colorName: c.name, colorCode: c.code })} />
      </Fold>

      {onHardware && piece.id === 'botones' && (
        <Fold title="Tipo de botón" open>
          <div className="chips">
            {BUTTON_STYLES.map((b) => (
              <button key={b.id} className={(hardware.buttons ?? '4') === b.id ? 'chip active' : 'chip'} onClick={() => onHardware({ ...hardware, buttons: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
          {hardware.buttons === 'logo' && <ArtPicker art={hardware.buttonArt ?? null} artworks={artworks} onChange={(buttonArt) => onHardware({ ...hardware, buttonArt })} />}
        </Fold>
      )}
      {onHardware && isZip && (
        <Fold title="Cremallera y tirador" open>
          <h3>Cremallera</h3>
          <div className="chips">
            {ZIP_STYLES.map((z) => (
              <button key={z.id} className={(hardware.zip ?? 'metal') === z.id ? 'chip active' : 'chip'} onClick={() => onHardware({ ...hardware, zip: z.id })}>
                {z.label}
              </button>
            ))}
          </div>
          <h3 className="spaced-top">Tirador</h3>
          <div className="chips">
            {PULLER_STYLES.map((p) => (
              <button key={p.id} className={(hardware.puller ?? 'clasico') === p.id ? 'chip active' : 'chip'} onClick={() => onHardware({ ...hardware, puller: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
          {hardware.puller === 'logo' && <ArtPicker art={hardware.pullerArt ?? null} artworks={artworks} onChange={(pullerArt) => onHardware({ ...hardware, pullerArt })} />}
        </Fold>
      )}

      {hasPockets && (
        <Fold title="Forma del bolsillo" open={!!style.shape}>
          {POCKET_SHAPE_PARAMS.map((p) => {
            const v = style.shape?.[p.id] ?? p.def
            const set = (value: number) => onChange({ shape: { ...style.shape, [p.id]: value } })
            return p.choices ? (
              <div key={p.id} className="option-row">
                <span>{p.label}</span>
                <div className="chips">
                  {p.choices.map((c, i) => (
                    <button key={c} className={Math.round(v) === i ? 'chip active' : 'chip'} onClick={() => set(i)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label key={p.id} className="field">
                <span>
                  {p.label} <strong>{Math.round(v * 100)} %</strong>
                </span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => set(Number(e.target.value))} />
              </label>
            )
          })}
          {style.shape && (
            <button className="link-button" onClick={() => onChange({ shape: undefined })}>
              Volver a la forma de la prenda
            </button>
          )}
        </Fold>
      )}

      {fabric && (
        <Fold title="Superficie y lavado" open={!!(style.surface || style.wash)}>
          <SurfaceControls style={style} artworks={artworks} onChange={onChange} />
        </Fold>
      )}

      {fabric && onBlocks && (
        <Fold title="Bloques de color" open={blocks.length > 0 || !!blockTool}>
          <p className="muted small">Divide la pieza con una línea y da otro color a una de las partes (color block).</p>
          {blocks.map((b, i) => (
            <div key={b.id} className="block-row">
              <input type="color" value={b.color} onChange={(e) => onBlocks(blocks.map((x) => (x.id === b.id ? { ...x, color: e.target.value, colorName: chartColor(e.target.value)?.name ?? '' } : x)))} aria-label={`Color del bloque ${i + 1}`} />
              <span className="small">
                Bloque {i + 1} · {b.view === 'front' ? 'delantero' : b.view === 'back' ? 'espalda' : 'lateral'}
              </span>
              <button className="link-button" onClick={() => onBlocks(blocks.map((x) => (x.id === b.id ? { ...x, side: (x.side === 1 ? -1 : 1) as 1 | -1 } : x)))} title="Pasar el color al otro lado de la línea">
                Invertir
              </button>
              <button className="link-button danger" onClick={() => onBlocks(blocks.filter((x) => x.id !== b.id))}>
                Quitar
              </button>
            </div>
          ))}
          {onBlockTool && (
            <button className={blockTool ? 'button primary' : 'button'} onClick={() => onBlockTool(!blockTool)}>
              {blockTool ? 'Arrastra una línea sobre la pieza… (Esc cancela)' : '+ Dividir con una línea'}
            </button>
          )}
        </Fold>
      )}

      <Fold title="Material" open>
        <MaterialPicker
          template={template}
          piece={piece}
          materialId={style.materialId}
          color={style.color}
          library={materials}
          // Los metales tienen su propio color: al elegirlos, la pieza lo toma
          onChange={(materialId, m) => onChange(m?.tint ? { materialId, color: m.tint, colorName: m.name, colorCode: '' } : { materialId })}
        />
      </Fold>

      {fabric && (
        <button className="link-button" onClick={onApplyToAll}>
          Usar este color y tejido en todas las piezas de tela
        </button>
      )}
    </div>
  )
}

/** Superficie por toda la pieza (rayas, cuadros, camuflaje…) y lavado. */
function SurfaceControls({ style, artworks, onChange }: { style: PieceStyle; artworks: Artwork[]; onChange: (patch: Partial<PieceStyle>) => void }) {
  const s = style.surface
  const kind: SurfaceKind = s?.kind ?? 'liso'
  const setKind = (k: SurfaceKind) => {
    if (k === 'liso') return onChange({ surface: undefined })
    const d = patternDefaults(k)
    const base: Surface = s ?? { kind: k, color2: d.c2, color3: d.c3, size: 0, angle: 0 }
    // Al cambiar de tipo se ponen el tamaño y los colores de partida que le tocan
    onChange({ surface: { ...base, kind: k, color2: d.c2, color3: d.c3, size: DEFAULT_SIZE[k] ?? 10 } })
  }
  const set = (patch: Partial<Surface>) => s && onChange({ surface: { ...s, ...patch } })
  const wash = style.wash
  const setWash = (k: WashKind) => onChange({ wash: k === 'ninguno' ? undefined : { kind: k, amount: wash?.amount ?? 0.6 } })
  const big = (DEFAULT_SIZE[kind] ?? 0) >= 12 || kind === 'imagen'
  const three = THREE_COLORS.has(kind)
  const [uploading, setUploading] = useState(false)
  const uploadTile = async (file: File | undefined) => {
    if (!file || !s) return
    setUploading(true)
    try {
      const { key } = await api.uploadImage(file)
      set({ file: key })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se ha podido subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="inspector-sub">
        <h3>Superficie</h3>
        <select value={kind} onChange={(e) => setKind(e.target.value as SurfaceKind)} aria-label="Estampado de la pieza">
          <option value="liso">Liso</option>
          {PATTERN_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.ids.map((id) => (
                <option key={id} value={id}>
                  {SURFACE_KINDS.find((k) => k.id === id)?.label ?? id}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Otros">
            <option value="logo">Logo repetido</option>
            <option value="degradado">Degradado</option>
            <option value="imagen">Imagen propia</option>
          </optgroup>
        </select>
        {s && (
          <div className="surface-fields">
            {kind === 'imagen' && (
              <div className="field">
                <span>Muestra de tela (se repite)</span>
                {s.file && <img className="surface-thumb" src={fileUrl(s.file)} alt="Muestra de tela" />}
                <label className="button">
                  {uploading ? 'Subiendo…' : s.file ? 'Cambiar imagen' : 'Subir imagen'}
                  <input type="file" accept="image/*" hidden onChange={(e) => uploadTile(e.target.files?.[0])} />
                </label>
                <small className="muted">Mejor una imagen cuadrada que encaje sin cortes al repetirse (cuadros, rayas, un estampado…).</small>
              </div>
            )}
            {kind !== 'logo' && kind !== 'imagen' && (
              <label className="field">
                <span>{kind === 'degradado' ? 'Color de abajo' : 'Segundo color'}</span>
                <input type="color" value={s.color2} onChange={(e) => set({ color2: e.target.value })} />
              </label>
            )}
            {three && (
              <label className="field">
                <span>{kind === 'escoces' ? 'Color de las rayas finas' : 'Tercer color'}</span>
                <input type="color" value={s.color3} onChange={(e) => set({ color3: e.target.value })} />
              </label>
            )}
            {kind === 'logo' && <ArtPicker art={s.art ?? null} artworks={artworks} onChange={(art) => set({ art })} />}
            {kind !== 'degradado' && (
              <label className="field">
                <span>
                  Tamaño del dibujo <strong>{s.size.toLocaleString('es-ES')} cm</strong>
                </span>
                <input type="range" min={big ? 10 : 0.5} max={big ? 120 : 30} step={0.5} value={s.size} onChange={(e) => set({ size: Number(e.target.value) })} />
              </label>
            )}
            <label className="field">
              <span>
                Giro <strong>{Math.round(s.angle)}°</strong>
              </span>
              <input type="range" min={-90} max={90} step={1} value={s.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
            </label>
          </div>
        )}
      </div>

      <div className="inspector-sub">
        <h3>Lavado</h3>
        <div className="chips">
          {WASH_KINDS.map((w) => (
            <button key={w.id} className={(wash?.kind ?? 'ninguno') === w.id ? 'chip active' : 'chip'} onClick={() => setWash(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
        {wash && (
          <label className="field">
            <span>
              Intensidad <strong>{Math.round(wash.amount * 100)} %</strong>
            </span>
            <input type="range" min={0.1} max={1} step={0.05} value={wash.amount} onChange={(e) => onChange({ wash: { ...wash, amount: Number(e.target.value) } })} />
          </label>
        )}
      </div>
    </>
  )
}

interface NamedColor {
  hex: string
  name: string
  code: string
}

/**
 * Carta de colores con buscador (por nombre o código) y «Tus códigos»: los colores con código propio (Pantone, de
 * proveedor…) que ya se han usado en la marca o en cualquier diseño de la cuenta, para repetirlos sin escribirlos.
 */
function ColorChart({ current, brand, onPick }: { current: string; brand: { hex: string; name?: string; code?: string }[]; onPick: (c: NamedColor) => void }) {
  const designs = useApi(() => api.listDesigns(), [])
  const [q, setQ] = useState('')

  const mine = useMemo(() => {
    const seen = new Map<string, NamedColor>()
    const add = (hex: string, name = '', code = '') => {
      code = code.trim()
      // Solo los que tienen un código propio (los FD- ya están en la carta)
      if (!code || code.startsWith('FD-') || !/^#[0-9a-f]{6}$/i.test(hex)) return
      const key = code.toLowerCase()
      if (!seen.has(key)) seen.set(key, { hex: hex.toLowerCase(), name: name.trim(), code })
    }
    for (const b of brand) add(b.hex, b.name, b.code)
    for (const d of designs.data ?? []) {
      for (const s of Object.values(d.data.pieces ?? {})) add(s.color, s.colorName, s.colorCode)
      for (const c of d.data.colorways ?? []) for (const s of Object.values(c.pieces)) add(s.color, s.colorName, s.colorCode)
    }
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }))
  }, [brand, designs.data])

  const text = q.trim().toLowerCase()
  const match = (c: NamedColor) => !text || c.name.toLowerCase().includes(text) || c.code.toLowerCase().includes(text) || c.hex.includes(text)
  const swatch = (c: NamedColor) => (
    <button
      key={`${c.code}${c.hex}`}
      className={c.hex === current ? 'swatch-button active' : 'swatch-button'}
      style={{ background: c.hex }}
      onClick={() => onPick(c)}
      title={[c.name, c.code].filter(Boolean).join(' · ')}
      aria-label={c.name || c.code}
    />
  )
  const ownFound = mine.filter(match)
  const groups = COLOR_CHART.map((g) => ({ name: g.name, colors: g.colors.filter(match) })).filter((g) => g.colors.length)

  return (
    <div className="color-chart">
      <input type="search" className="color-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código (p. ej. 19-4007)" />
      {ownFound.length > 0 && (
        <div className="chart-group">
          <span className="muted small">Tus códigos</span>
          <div className="palette">{ownFound.map(swatch)}</div>
          {text && (
            <ul className="color-found">
              {ownFound.slice(0, 8).map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => onPick(c)}>
                    <span style={{ background: c.hex }} />
                    {c.code}
                    {c.name && <em> · {c.name}</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.name} className="chart-group">
          <span className="muted small">{g.name}</span>
          <div className="palette">{g.colors.map(swatch)}</div>
        </div>
      ))}
      {text && !ownFound.length && !groups.length && (
        <p className="muted small">
          Ningún color con «{q}». Si es un código nuevo (Pantone, de proveedor…), elige el color y escríbelo arriba en «Código»: la
          próxima vez saldrá en «Tus códigos».
        </p>
      )}
    </div>
  )
}
