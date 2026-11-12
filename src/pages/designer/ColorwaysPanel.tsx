import { useState } from 'react'
import { createPortal } from 'react-dom'
import { activeColorwayId, addColorway, colorwaysOf, removeColorway, renameColorway, switchColorway, withColorway } from '../../designer/colorways'
import { colorLabel } from '../../designer/colors'
import { download, mockupCanvas } from '../../designer/exportFlat'
import { FlatView } from '../../designer/FlatView'
import type { GarmentTemplate } from '../../designer/types'
import type { Body } from '../../production/measurements'
import type { Colorway, DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'

interface Props {
  name: string
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  body: Body
  onChange: (data: DesignData) => void
}

/**
 * Variantes de color del diseño (pestaña «Variantes» de «Prenda»): la misma prenda en otros colores. La activa es la
 * que se ve en el lienzo, el 3D y la ficha técnica; «Ver juntas» las pone una al lado de otra para enseñarlas o
 * descargarlas en una imagen.
 */
export function ColorwaysPanel({ name, template, data, materials, body, onChange }: Props) {
  const list = colorwaysOf(data)
  const active = activeColorwayId(data)
  const [compare, setCompare] = useState(false)
  const pieces = template.pieces.filter((p) => template.activePieces(data.options).includes(p.id))

  return (
    <div className="lz-colorways">
      <p className="lz-muted">
        La misma prenda en otros colores. Toca una para verla en el lienzo, el 3D y la ficha técnica; cambia sus colores en
        «Piezas». Lo pintado en el lienzo es común a todas.
      </p>
      <div className="lz-rows">
        {list.map((c) => {
          const colors = [...new Set(pieces.map((p) => c.pieces[p.id]?.color).filter(Boolean))] as string[]
          return (
            <div key={c.id} className={c.id === active ? 'lz-colorway on' : 'lz-colorway'}>
              <button className="lz-colorway-main" onClick={() => onChange(switchColorway(data, c.id))} title="Usar esta variante">
                <span className="lz-colorway-dots">
                  {colors.slice(0, 6).map((hex) => (
                    <span key={hex} style={{ background: hex }} />
                  ))}
                </span>
              </button>
              <input value={c.name} onChange={(e) => onChange(renameColorway(data, c.id, e.target.value))} aria-label="Nombre de la variante" maxLength={60} />
              {list.length > 1 && (
                <button className="lz-mini" onClick={() => onChange(removeColorway(data, c.id))} title="Quitar esta variante" aria-label={`Quitar ${c.name}`}>
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="lz-chips">
        <button className="lz-chip" onClick={() => onChange(addColorway(data, `Variante ${list.length + 1}`))}>
          + Nueva variante
        </button>
        {list.length > 1 && (
          <button className="lz-chip" onClick={() => setCompare(true)}>
            Ver juntas
          </button>
        )}
      </div>
      {compare && <CompareSheet name={name} template={template} data={data} list={list} materials={materials} body={body} onClose={() => setCompare(false)} />}
    </div>
  )
}

/** Todas las variantes una al lado de otra (delantero y espalda), con sus colores, y descarga en PNG. */
function CompareSheet({ name, template, data, list, materials, body, onClose }: { name: string; template: GarmentTemplate; data: DesignData; list: Colorway[]; materials: Map<string, Material>; body: Body; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const pieces = template.pieces.filter((p) => template.activePieces(data.options).includes(p.id))

  const save = async () => {
    setBusy(true)
    try {
      const blob = await compareImage(name, template, data, list, materials, body)
      download(blob, `${name || 'diseño'} - variantes.png`)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="lz-compare" role="dialog" aria-label="Variantes de color juntas" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <strong>{name} · variantes de color</strong>
        <div className="lz-chips">
          <button className="lz-btn primary" onClick={save} disabled={busy}>
            {busy ? 'Preparando…' : 'Descargar PNG'}
          </button>
          <button className="lz-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </header>
      <div className="lz-compare-grid">
        {list.map((c) => {
          const d = withColorway(data, c)
          return (
            <figure key={c.id}>
              <figcaption>{c.name}</figcaption>
              <div className="lz-compare-views">
                <FlatView template={template} data={d} view="front" frame="comun" />
                <FlatView template={template} data={d} view="back" frame="comun" />
              </div>
              <ul>
                {pieces.map((p) => {
                  const s = c.pieces[p.id] ?? { color: p.defaultColor }
                  const l = colorLabel(s)
                  return (
                    <li key={p.id}>
                      <span style={{ background: s.color }} />
                      {p.label}: {l.name || s.color.toUpperCase()}
                      {l.code && <em> · {l.code}</em>}
                    </li>
                  )
                })}
              </ul>
            </figure>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

/** Imagen con todas las variantes: delantero y espalda de cada una, su nombre y sus colores. */
async function compareImage(name: string, template: GarmentTemplate, data: DesignData, list: Colorway[], materials: Map<string, Material>, body: Body) {
  const VIEW = 520
  const COL = VIEW * 2 + 40
  const PER_ROW = Math.min(list.length, 3)
  const rows = Math.ceil(list.length / PER_ROW)
  const pieces = template.pieces.filter((p) => template.activePieces(data.options).includes(p.id))
  const drawn = await Promise.all(
    list.map(async (c) => {
      const d = withColorway(data, c)
      const [front, back] = await Promise.all([mockupCanvas(template, d, materials, body, 'front', 'color', VIEW), mockupCanvas(template, d, materials, body, 'back', 'color', VIEW)])
      return { c, front, back }
    }),
  )
  const viewH = Math.max(...drawn.flatMap((x) => [x.front.canvas.height, x.back.canvas.height]))
  const listH = pieces.length * 30 + 20
  const cellH = 70 + viewH + listH
  const out = document.createElement('canvas')
  out.width = PER_ROW * COL + 80
  out.height = 120 + rows * cellH + 40
  const g = out.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, out.width, out.height)
  g.fillStyle = '#1d1d1f'
  g.font = '600 40px "Space Grotesk", system-ui, sans-serif'
  g.fillText(`${name} · variantes de color`, 40, 72)
  drawn.forEach(({ c, front, back }, i) => {
    const x = 40 + (i % PER_ROW) * COL
    const y = 120 + Math.floor(i / PER_ROW) * cellH
    g.fillStyle = '#1d1d1f'
    g.font = '600 30px "Space Grotesk", system-ui, sans-serif'
    g.fillText(c.name, x, y + 40)
    g.drawImage(front.canvas, x, y + 60)
    g.drawImage(back.canvas, x + VIEW + 20, y + 60)
    g.font = '22px "IBM Plex Mono", ui-monospace, monospace'
    pieces.forEach((p, k) => {
      const s = c.pieces[p.id] ?? { color: p.defaultColor }
      const l = colorLabel(s)
      const ly = y + 70 + viewH + k * 30
      g.fillStyle = s.color
      g.fillRect(x, ly, 20, 20)
      g.strokeStyle = '#00000033'
      g.strokeRect(x, ly, 20, 20)
      g.fillStyle = '#333333'
      g.fillText(`${p.label}: ${l.name || s.color.toUpperCase()}${l.code ? ` · ${l.code}` : ''}`, x + 32, ly + 17)
    })
  })
  return new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('No se ha podido crear la imagen'))), 'image/png'))
}
