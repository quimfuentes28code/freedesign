import { chartColor, COLOR_CHART, colorLabel } from '../../designer/colors'
import type { PieceDef } from '../../designer/types'
import type { Artwork } from '../../shared/artworks'
import { BUTTON_STYLES, PULLER_STYLES, ZIP_STYLES, type HardwareStyle, type PieceStyle } from '../../shared/designs'
import { ArtPicker } from './DetailsPanel'
import type { Material } from '../../shared/library'
import { MaterialPicker } from './MaterialPicker'

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
  artworks?: Artwork[]
}

/** Propiedades de la pieza seleccionada: color (con nombre y código), carta de colores y material. */
export function PieceInspector(props: Props) {
  const { template, piece, style, used, materials, onChange, onApplyToAll, hardware = {}, onHardware, isZip, artworks = [] } = props
  const label = colorLabel(style)
  // Al elegir un color a mano se olvidan el nombre y el código (salvo que sea uno de la carta)
  const setHex = (hex: string) => {
    const c = chartColor(hex)
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

      <div className="inspector-block">
        <h3>Carta de colores</h3>
        {COLOR_CHART.map((g) => (
          <div key={g.name} className="chart-group">
            <span className="muted small">{g.name}</span>
            <div className="palette">
              {g.colors.map((c) => (
                <button
                  key={c.code}
                  className={c.hex === style.color ? 'swatch-button active' : 'swatch-button'}
                  style={{ background: c.hex }}
                  onClick={() => onChange({ color: c.hex, colorName: c.name, colorCode: c.code })}
                  title={`${c.name} · ${c.code}`}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {onHardware && piece.id === 'botones' && (
        <div className="inspector-block">
          <h3>Tipo de botón</h3>
          <div className="chips">
            {BUTTON_STYLES.map((b) => (
              <button key={b.id} className={(hardware.buttons ?? '4') === b.id ? 'chip active' : 'chip'} onClick={() => onHardware({ ...hardware, buttons: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
          {hardware.buttons === 'logo' && <ArtPicker art={hardware.buttonArt ?? null} artworks={artworks} onChange={(buttonArt) => onHardware({ ...hardware, buttonArt })} />}
        </div>
      )}
      {onHardware && isZip && (
        <div className="inspector-block">
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
        </div>
      )}

      <div className="inspector-block">
        <h3>Material</h3>
        <MaterialPicker
          template={template}
          piece={piece}
          materialId={style.materialId}
          color={style.color}
          library={materials}
          // Los metales tienen su propio color: al elegirlos, la pieza lo toma
          onChange={(materialId, m) => onChange(m?.tint ? { materialId, color: m.tint, colorName: m.name, colorCode: '' } : { materialId })}
        />
      </div>

      {fabric && (
        <button className="link-button" onClick={onApplyToAll}>
          Usar este color y tejido en todas las piezas de tela
        </button>
      )}
    </div>
  )
}
