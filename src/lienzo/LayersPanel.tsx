// Panel de Capas del lienzo: cada fila, su menú «⋯» y las opciones de texto, fornitura y «Es la prenda».

import { useEffect, useRef, useState } from 'react'
import { NEW_DESIGN_CATALOG } from '../designer/templates'
import { BLEND_MODES, DETAIL_STYLES, LONG_DETAILS, PULLER_STYLES, type BlendMode, type CanvasLayer, type Detail, type DetailLayer, type PaintLayer, type TextLayer } from '../shared/designs'
import { FontPicker } from '../components/FontPicker'
import type { Artwork } from '../shared/artworks'
import { fileUrl as fileOf } from '../shared/library'

/** Menú «⋯» de una capa: lo que se hace de vez en cuando, agrupado (como el menú de capa de Procreate). */
export function LayerMenu(props: Parameters<typeof LayerRow>[0] & { close: () => void }) {
  const { layer: l, close } = props
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const out = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.lz-mini')) close()
    }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [close])
  const act = (f: () => void) => () => {
    f()
    close()
  }
  const item = (label: string, f: () => void, opts: { on?: boolean; title?: string; danger?: boolean } = {}) => (
    <button key={label} className={`lz-menu-item${opts.on ? ' on' : ''}${opts.danger ? ' danger' : ''}`} onClick={act(f)} title={opts.title}>
      <span>{label}</span>
      {opts.on !== undefined && <i>{opts.on ? '✓' : ''}</i>}
    </button>
  )
  return (
    <div className="lz-layer-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="lz-menu-group">
        {item('Duplicar', props.onDuplicate)}
        {item('Combinar abajo', props.onMerge, { title: 'Textos, fornituras e imágenes se convierten en pintura' })}
        {item('Subir', props.onUp)}
        {item('Bajar', props.onDown)}
      </div>
      <div className="lz-menu-group">
        {item('Máscara de recorte', () => props.onPatch({ clip: !l.clip || undefined }), { on: !!l.clip, title: 'Solo se ve donde hay algo en la capa de debajo' })}
        {item('Referencia para el bote', () => props.onPatch({ reference: !l.reference || undefined }), { on: !!l.reference, title: 'El bote rellena en otra capa parándose en las líneas de esta' })}
        {item('Bloquear', () => props.onPatch({ locked: !l.locked }), { on: l.locked })}
        {l.kind === 'paint' && item('Bloquear transparencia', () => props.onPatch({ alphaLock: !l.alphaLock } as Partial<PaintLayer>), { on: !!l.alphaLock, title: 'Solo se pinta donde ya hay algo' })}
      </div>
      <div className="lz-menu-group">
        {item('Es sombra', () => props.onPatch({ role: l.role === 'sombra' ? undefined : 'sombra' }), { on: l.role === 'sombra', title: 'Se ve en el dibujo; en 3D la pone la escena' })}
        {item('Es luz', () => props.onPatch({ role: l.role === 'luz' ? undefined : 'luz' }), { on: l.role === 'luz', title: 'Se ve en el dibujo; en 3D la pone la escena' })}
      </div>
      {(props.onFlip || props.onInvert || props.onClear) && (
        <div className="lz-menu-group">
          {props.onFlip && item('Voltear en horizontal', () => props.onFlip!('x'))}
          {props.onFlip && item('Voltear en vertical', () => props.onFlip!('y'))}
          {props.onInvert && item('Invertir colores', props.onInvert)}
          {props.onClear && item('Vaciar', props.onClear)}
        </div>
      )}
      <div className="lz-menu-group">{item('Borrar capa', props.onRemove, { danger: true })}</div>
    </div>
  )
}

/** «Es la prenda»: para dibujar primero y decidir la prenda después. */
export function AsGarment({ layer: l, blank, templateName, onPick }: { layer: CanvasLayer; blank: boolean; templateName: string; onPick: (view: 'front' | 'back' | 'side' | null, entryId?: string) => void }) {
  const current = l.kind === 'image' ? (l.mockup?.view ?? null) : null
  const [entry, setEntry] = useState('')
  const views = [
    ['front', 'Delantero'],
    ['back', 'Espalda'],
    ['side', 'Lateral'],
  ] as const
  return (
    <div className="lz-field">
      <span title="Lo pintado encima de este dibujo irá a la prenda 3D, encajado a su contorno">Es la prenda</span>
      {blank && (
        <select value={entry} onChange={(e) => setEntry(e.target.value)} title="Qué prenda es (para el 3D, la ficha y el patrón)">
          <option value="">¿Qué prenda es?</option>
          {NEW_DESIGN_CATALOG.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {!blank && <small className="lz-muted">Prenda del diseño: {templateName.toLowerCase()}</small>}
      <div className="lz-chips">
        {current && (
          <button className="lz-chip" onClick={() => onPick(null)}>
            No
          </button>
        )}
        {views.map(([v, label]) => (
          <button key={v} className={current === v ? 'lz-chip on' : 'lz-chip'} disabled={blank && !entry} onClick={() => onPick(v, entry || undefined)}>
            {label}
          </button>
        ))}
      </div>
      {blank && !entry && <small className="lz-muted">Elige la prenda y después qué vista es este dibujo.</small>}
    </div>
  )
}

/** Una fila del panel de capas: miniatura, nombre, visibilidad y, si está activa, sus ajustes. */
export function LayerRow(props: {
  layer: CanvasLayer
  active: boolean
  thumb?: HTMLCanvasElement
  image?: string
  onSelect: () => void
  onPatch: (p: Partial<CanvasLayer>) => void
  onRemove: () => void
  onDuplicate: () => void
  onUp: () => void
  onDown: () => void
  onMerge: () => void
  onClear?: () => void
  onOptions: () => void
  artworks: Artwork[]
  onSavePreset: (name: string, detail: Detail) => void
  onFlip?: (axis: 'x' | 'y') => void
  onInvert?: () => void
  /** Recortada a la capa de debajo (se ve sangrada en la lista). */
  clipped: boolean
  /** «Es la prenda»: el dibujo a mano pasa a ser la prenda del diseño en esa vista (y, en blanco, qué prenda es). */
  onAsGarment?: (view: 'front' | 'back' | 'side' | null, entryId?: string) => void
  /** Prenda del diseño: cambiar su dibujo (en línea, a color o el de la hoja de mockups). */
  onDrawing?: (k: 'linea' | 'color' | 'hoja') => void
  hasSheet?: boolean
  blank?: boolean
  templateName?: string
}) {
  const { layer: l, active } = props
  const thumbRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = thumbRef.current
    if (!c || !props.thumb) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const k = Math.min(c.width / props.thumb.width, c.height / props.thumb.height)
    g.drawImage(props.thumb, (c.width - props.thumb.width * k) / 2, (c.height - props.thumb.height * k) / 2, props.thumb.width * k, props.thumb.height * k)
  })
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const kind = l.kind === 'paint' ? 'Pintura' : l.kind === 'mockup' || (l.kind === 'image' && (l.mockup || l.asset)) ? 'Prenda' : l.kind === 'detail' ? 'Fornitura' : l.kind === 'text' ? 'Texto' : l.kind === 'texture' ? 'Textura' : l.kind === 'vector' ? 'Trazados' : 'Imagen'
  return (
    <div className={`lz-layer-row${active ? ' on' : ''}${props.clipped ? ' clipped' : ''}`}>
      <div className="lz-layer-main" onClick={props.onSelect}>
        <div className="lz-thumb">{props.image ? <img src={props.image} alt="" /> : <canvas ref={thumbRef} width={60} height={44} />}</div>
        <div className="lz-layer-name">
          {editing ? (
            <input autoFocus defaultValue={l.name} onBlur={(e) => (setEditing(false), props.onPatch({ name: e.target.value || l.name }))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          ) : (
            <strong onDoubleClick={() => setEditing(true)} title="Doble clic para cambiar el nombre">
              {l.name}
            </strong>
          )}
          <small>
            {kind}
            {l.blend !== 'normal' ? ` · ${BLEND_MODES.find((b) => b.id === l.blend)?.label}` : ''}
            {l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)} %` : ''}
            {l.locked ? ' · bloqueada' : ''}
            {l.reference ? ' · referencia' : ''}
            {l.role ? ` · ${l.role}` : ''}
          </small>
        </div>
        {l.locked && (
          <button className="lz-mini" onClick={(e) => (e.stopPropagation(), props.onPatch({ locked: false }))} title="Bloqueada: toca para desbloquear">
            🔒
          </button>
        )}
        <button className="lz-mini" onClick={(e) => (e.stopPropagation(), props.onPatch({ visible: !l.visible }))} title={l.visible ? 'Ocultar' : 'Mostrar'}>
          {l.visible ? '◉' : '○'}
        </button>
        <button className={menu ? 'lz-mini on' : 'lz-mini'} onClick={(e) => (e.stopPropagation(), setMenu(!menu))} title="Más: duplicar, combinar, voltear, máscara…">
          ⋯
        </button>
      </div>
      {menu && <LayerMenu {...props} close={() => setMenu(false)} />}
      {active && (
        <div className="lz-layer-opts">
          <div className="lz-layer-pair">
          <div className="lz-field">
            <span>
              Opacidad <strong>{Math.round(l.opacity * 100)} %</strong>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={l.opacity} onChange={(e) => props.onPatch({ opacity: Number(e.target.value) })} />
          </div>
          <div className="lz-field">
            <span>Fusión</span>
            <select value={l.blend} onChange={(e) => props.onPatch({ blend: e.target.value as BlendMode })}>
              {BLEND_MODES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          </div>
          {l.kind === 'mockup' && (
            <>
              <div className="lz-chips">
                {(['front', 'back', 'side'] as const).map((v) => (
                  <button key={v} className={l.view === v ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ view: v })}>
                    {v === 'front' ? 'Delantero' : v === 'back' ? 'Espalda' : 'Lateral'}
                  </button>
                ))}
              </div>
              {!props.onDrawing && (
                <div className="lz-chips">
                  <button className={l.style === 'linea' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ style: 'linea' })} title="Gris claro con contorno, para pintar encima">
                    En línea
                  </button>
                  <button className={l.style === 'color' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ style: 'color' })} title="Con los colores y tejidos del diseño">
                    A color
                  </button>
                </div>
              )}
            </>
          )}
          {props.onDrawing && (
            <div className="lz-field">
              <span>Dibujo de la prenda</span>
              <div className="lz-chips">
                <button className={l.kind === 'mockup' && l.style === 'linea' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onDrawing!('linea')} title="Dibujo técnico en gris claro, para pintar encima; cambia con el cuello, la capucha, las medidas…">
                  En línea
                </button>
                <button className={l.kind === 'mockup' && l.style === 'color' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onDrawing!('color')} title="Dibujo técnico con los colores y tejidos de cada pieza">
                  A color
                </button>
                {props.hasSheet && (
                  <button className={l.kind === 'image' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onDrawing!('hoja')} title="El dibujo de la hoja de mockups (fijo: no cambia con las opciones)">
                    De la hoja
                  </button>
                )}
              </div>
            </div>
          )}
          {l.kind === 'mockup' && (
            <button className="lz-btn" onClick={props.onOptions} title="Cuello, capucha, bolsillos, mangas… viendo cómo queda cada uno">
              Cambiar cuello, capucha, bolsillos…
            </button>
          )}
          {props.onAsGarment && <AsGarment layer={l} blank={!!props.blank} templateName={props.templateName ?? ''} onPick={props.onAsGarment} />}
          {l.kind === 'text' && <TextOptions layer={l} onPatch={props.onPatch} />}
          {l.kind === 'detail' && <DetailOptions layer={l} onPatch={props.onPatch} artworks={props.artworks} onSavePreset={props.onSavePreset} />}
          {l.kind === 'texture' && (
            <>
              <div className="lz-field">
                <span>
                  Escala <strong>{Math.round(l.scale * 100)} %</strong>
                </span>
                <input type="range" min={0.1} max={4} step={0.05} value={l.scale} onChange={(e) => props.onPatch({ scale: Number(e.target.value) })} />
              </div>
              <div className="lz-field">
                <span>
                  Giro <strong>{Math.round(l.rotation)}°</strong>
                </span>
                <input type="range" min={-180} max={180} step={1} value={l.rotation} onChange={(e) => props.onPatch({ rotation: Number(e.target.value) })} />
              </div>
              <p className="lz-muted">Prueba la fusión Superponer o Luz suave, y baja la opacidad para que se note menos.</p>
            </>
          )}
          {(l.kind === 'mockup' || l.kind === 'image' || l.kind === 'detail') && (
            <div className="lz-field">
              <span>
                Tamaño <strong>{Math.round(l.w)} px</strong>
              </span>
              <input type="range" min={l.kind === 'detail' ? 8 : 60} max={2400} step={l.kind === 'detail' ? 2 : 10} value={l.w} onChange={(e) => props.onPatch({ w: Number(e.target.value) })} />
            </div>
          )}
          {(l.kind === 'image' || l.kind === 'detail' || l.kind === 'text') && (
            <div className="lz-field">
              <span>
                Giro <strong>{Math.round(l.rotation)}°</strong>
              </span>
              <input type="range" min={-180} max={180} step={1} value={l.rotation} onChange={(e) => props.onPatch({ rotation: Number(e.target.value) })} />
            </div>
          )}
                  </div>
      )}
    </div>
  )
}

/** Ajustes de una fornitura: estilo, tirador, colores y largo. */
export function DetailOptions({
  layer: l,
  onPatch,
  artworks,
  onSavePreset,
}: {
  layer: DetailLayer
  onPatch: (p: Partial<CanvasLayer>) => void
  artworks: Artwork[]
  onSavePreset: (name: string, detail: Detail) => void
}) {
  const d = l.detail
  const set = (p: Partial<DetailLayer['detail']>) => onPatch({ detail: { ...d, ...p } } as Partial<CanvasLayer>)
  const styles = DETAIL_STYLES[d.kind]
  const [naming, setNaming] = useState<string | null>(null)
  // Llevan logo: botones, tirador de la cremallera, parches y etiquetas
  const withArt = d.kind === 'boton' || d.kind === 'parche' || d.kind === 'etiqueta' || (d.kind === 'cremallera' && d.puller === 'logo') || (d.kind === 'tope' && d.style === 'logo')
  return (
    <>
      {styles && (
        <div className="lz-chips">
          {styles.map((s) => (
            <button key={s.id} className={d.style === s.id ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ style: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {d.kind === 'cremallera' && (
        <>
          <p className="lz-label">Tirador</p>
          <div className="lz-chips">
            {PULLER_STYLES.map((p) => (
              <button key={p.id} className={(d.puller ?? 'clasico') === p.id ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ puller: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="lz-color-pair">
        <label className="lz-field">
          <span>Color</span>
          <input type="color" value={d.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="lz-field">
          <span>Contraste</span>
          <input type="color" value={d.color2} onChange={(e) => set({ color2: e.target.value })} />
        </label>
      </div>
      {(d.kind === 'etiqueta' || d.kind === 'parche' || (d.kind === 'boton' && d.style === 'jeans') || (d.kind === 'cordon' && d.style === 'plano')) && (
        <label className="lz-field">
          <span>Texto</span>
          <input className="lz-hex" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        </label>
      )}
      {LONG_DETAILS.includes(d.kind) && (
        <div className="lz-field">
          <span>
            Largo <strong>{Math.round((d.length ?? 100) / 2)} cm</strong>
          </span>
          <input type="range" min={6} max={400} step={2} value={d.length ?? 100} onChange={(e) => set({ length: Number(e.target.value) })} />
        </div>
      )}
      {withArt && (
        <>
          <p className="lz-label">{d.kind === 'cremallera' ? 'Logo del tirador' : 'Tu logo o gráfico'}</p>
          {artworks.length ? (
            <div className="lz-art-list">
              <button className={!d.art ? 'lz-art on' : 'lz-art'} onClick={() => set({ art: null })} title="Sin logo">
                Sin logo
              </button>
              {artworks.map((a) => (
                <button
                  key={a.id}
                  className={d.art?.file === a.file ? 'lz-art on' : 'lz-art'}
                  onClick={() => set({ art: { artworkId: a.id, file: a.file, aspect: a.height / Math.max(1, a.width) } })}
                  title={a.name}
                >
                  <img src={fileOf(a.file)} alt={a.name} />
                </button>
              ))}
            </div>
          ) : (
            <p className="lz-muted">Crea o sube tus logos en Biblioteca → Gráficos y salen aquí.</p>
          )}
          {d.kind === 'boton' && d.art && d.style !== 'logo' && styles?.some((s) => s.id === 'logo') && (
            <button className="lz-chip" onClick={() => set({ style: 'logo' })}>
              Botón con la forma del logo
            </button>
          )}
        </>
      )}
      {naming === null ? (
        <button className="lz-btn" onClick={() => setNaming(l.name)} title="Para usarla en cualquier diseño desde la biblioteca">
          Guardar en mis fornituras
        </button>
      ) : (
        <div className="lz-save-row">
          <input className="lz-hex" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Nombre (p. ej. Cremallera metal dorada)" />
          <button
            className="lz-btn primary"
            onClick={() => {
              onSavePreset(naming.trim() || l.name, d)
              setNaming(null)
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </>
  )
}

/** Ajustes de un texto: lo que dice, fuente, tamaño, color, negrita, cursiva, espaciado, arco y contorno. */
export function TextOptions({ layer: l, onPatch }: { layer: TextLayer; onPatch: (p: Partial<CanvasLayer>) => void }) {
  const set = (p: Partial<TextLayer>) => onPatch(p as Partial<CanvasLayer>)
  return (
    <div className="lz-text-opts">
      <label className="lz-field">
        <span>Texto</span>
        <textarea className="lz-hex" rows={2} value={l.text} onChange={(e) => set({ text: e.target.value })} />
      </label>
      <div className="lz-font">
        <FontPicker value={l.font} onChange={(font) => set({ font })} label="Fuente" />
      </div>
      <div className="lz-field">
        <span>
          Tamaño <strong>{Math.round(l.size)} px</strong>
        </span>
        <input type="range" min={10} max={500} step={1} value={l.size} onChange={(e) => set({ size: Number(e.target.value) })} />
      </div>
      <div className="lz-color-pair">
        <label className="lz-field">
          <span>Color</span>
          <input type="color" value={l.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="lz-field">
          <span>Contorno</span>
          <input type="color" value={l.stroke ?? '#ffffff'} onChange={(e) => set({ stroke: e.target.value, strokeWidth: l.strokeWidth ?? 4 })} />
        </label>
      </div>
      <div className="lz-chips">
        <button className={l.bold ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ bold: !l.bold })}>
          <strong>N</strong> Negrita
        </button>
        <button className={l.italic ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ italic: !l.italic })}>
          <em>C</em> Cursiva
        </button>
        {l.stroke && (
          <button className="lz-chip" onClick={() => set({ stroke: undefined, strokeWidth: undefined })}>
            Sin contorno
          </button>
        )}
      </div>
      {l.stroke && (
        <div className="lz-field">
          <span>
            Grosor del contorno <strong>{l.strokeWidth ?? 4} px</strong>
          </span>
          <input type="range" min={1} max={40} step={1} value={l.strokeWidth ?? 4} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} />
        </div>
      )}
      <div className="lz-field">
        <span>
          Espacio entre letras <strong>{l.letterSpacing ?? 0} px</strong>
        </span>
        <input type="range" min={-20} max={120} step={1} value={l.letterSpacing ?? 0} onChange={(e) => set({ letterSpacing: Number(e.target.value) || undefined })} />
      </div>
      <div className="lz-field">
        <span>
          Arco <strong>{l.arc ?? 0}</strong>
        </span>
        <input type="range" min={-100} max={100} step={1} value={l.arc ?? 0} onChange={(e) => set({ arc: Number(e.target.value) || undefined })} />
      </div>
    </div>
  )
}
