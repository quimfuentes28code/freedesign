// Piezas pequeñas del lienzo: paneles flotantes, pinceles, estampados, guías, IA y botón rápido.

import { SURFACE_KINDS } from '../shared/designs'
import { PATTERN_GROUPS, patternDefaults } from '../designer/morePatterns'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LOOK_ANGLES, LOOK_SCENES, lookPrompt, PRODUCT_FINISHES, PRODUCT_SHOTS, productPrompt, type LookScene, type ProductShot } from '../designer/lookbook'
import { DEFAULT_SIZE, pieceTile } from '../designer/surfaces'
import { type SurfaceKind } from '../shared/designs'
import { grainFor, Stroke, type BrushPreset, type Symmetry } from './brushes'
import { type Settings } from './lienzoSettings'
import { fillWithPattern } from './canvasUtils'

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Pop({ title, className, children, action }: { title: string; className: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={className} onPointerDown={(e) => e.stopPropagation()}>
      <div className="lz-pop-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Biblioteca de pinceles por grupos, cada uno con su muestra de trazo. */
export function BrushLibrary({ brushes, current, onPick, color }: { brushes: BrushPreset[]; current: string; onPick: (id: string) => void; color: string }) {
  const groups = [...new Set(brushes.map((b) => b.group))]
  const [group, setGroup] = useState(brushes.find((b) => b.id === current)?.group ?? groups[0])
  return (
    <div className="lz-brushes">
      <nav>
        {groups.map((g) => (
          <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </nav>
      <div className="lz-brush-list">
        {brushes.filter((b) => b.group === group).map((b) => (
          <button key={b.id} className={b.id === current ? 'lz-brush on' : 'lz-brush'} onClick={() => onPick(b.id)}>
            <span>{b.name}</span>
            <BrushPreview brush={b} color={color} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Muestra de un pincel: una onda pintada con él (con presión que sube y baja). */
export function BrushPreview({ brush, color }: { brush: BrushPreset; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const raw = document.createElement('canvas')
    raw.width = c.width
    raw.height = c.height
    if (brush.smudge) {
      const rg = raw.getContext('2d')!
      for (let i = 0; i < 6; i++) {
        rg.fillStyle = i % 2 ? color : '#9ca3af'
        rg.fillRect((i * c.width) / 6, 0, c.width / 6, c.height)
      }
    }
    const s = new Stroke(raw, { brush, color, size: brush.pattern ? 34 : Math.min(brush.shape ? 16 : 26, brush.size * 1.4 + 3), opacity: 1, streamline: 0, symmetry: 'none', axis: { x: 0, y: 0 } })
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      s.add(12 + t * (c.width - 24), c.height / 2 + Math.sin(t * Math.PI * 2) * 10, Math.sin(t * Math.PI) * 0.9 + 0.1)
    }
    if (brush.pattern) fillWithPattern(raw.getContext('2d')!, { x0: 0, y0: 0, x1: raw.width, y1: raw.height }, brush.pattern, color, undefined, (DEFAULT_SIZE[brush.pattern] ?? 4) > 10 ? 6 : 3, 2.4)
    g.globalAlpha = brush.opacity
    g.drawImage(raw, 0, 0)
    if (brush.grain) {
      g.globalCompositeOperation = 'destination-out'
      g.globalAlpha = brush.grain * 0.85
      g.fillStyle = g.createPattern(grainFor(brush), 'repeat')!
      g.fillRect(0, 0, c.width, c.height)
      g.globalCompositeOperation = 'source-over'
    }
    g.globalAlpha = 1
  }, [brush, color])
  return <canvas ref={ref} width={220} height={44} className="lz-brush-preview" />
}

/**
 * Pedir una imagen a una IA externa (Gemini o ChatGPT), sin coste en la app: prepara el texto con todo el detalle de
 * la prenda (el del Lookbook), lo copia y abre la IA en una ventana al lado. La imagen que devuelva se pega en el
 * lienzo con Ctrl+V (queda como capa de imagen) o se sube con «Imagen…».
 */
export function AiPanel({ design, materials, female, onExport }: { design: import('../shared/designs').Design; materials: Map<string, import('../shared/library').Material>; female: boolean; onExport: () => void }) {
  const [scene, setScene] = useState<LookScene>(LOOK_SCENES[0].id)
  const [extra, setExtra] = useState('')
  const [mode, setMode] = useState<'producto' | 'maniqui'>('producto')
  const [shot, setShot] = useState<ProductShot>('colgada')
  const [finish, setFinish] = useState('')
  const [exact, setExact] = useState(true)
  const base = useMemo(
    () =>
      mode === 'producto'
        ? productPrompt({ design, materials, shot, finish, exact, extra })
        : lookPrompt({
        items: [{ role: 'Prenda', design }],
        materials,
        kind: female ? 'mujer' : 'hombre',
        shoes: '',
        shoesText: '',
        scene,
        sceneText: '',
        angles: [LOOK_ANGLES[0].id],
        extra,
      }),
    [design, materials, female, scene, extra, mode, shot, finish, exact],
  )
  const [text, setText] = useState(base)
  useEffect(() => setText(base), [base])
  const [copied, setCopied] = useState(false)
  const open = async (url: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    // Ventana a un lado de la pantalla (si el navegador lo permite)
    const w = Math.min(560, Math.round(window.screen.availWidth * 0.4))
    window.open(url, 'fd-ia', `popup,width=${w},height=${window.screen.availHeight},left=${window.screen.availWidth - w},top=0`)
  }
  return (
    <div className="lz-ai">
      <p className="lz-muted">
        Prepara el texto con todo el detalle de la prenda. Al abrir la IA, el texto queda copiado: pégalo allí (Ctrl+V) junto con la imagen del lienzo como
        referencia. Cuando tengas la imagen, cópiala y pégala aquí con Ctrl+V: queda como una capa.
      </p>
      <p className="lz-label">Tipo de foto</p>
      <div className="lz-chips">
        <button className={mode === 'producto' ? 'lz-chip on' : 'lz-chip'} onClick={() => setMode('producto')} title="La prenda sola, como en un catálogo">
          Foto de producto
        </button>
        <button className={mode === 'maniqui' ? 'lz-chip on' : 'lz-chip'} onClick={() => setMode('maniqui')} title="Puesta en un maniquí sin rostro (como el Lookbook)">
          En maniquí
        </button>
      </div>
      {mode === 'producto' ? (
        <>
          <p className="lz-label">Cómo</p>
          <div className="lz-chips">
            {PRODUCT_SHOTS.map((x) => (
              <button key={x.id} className={shot === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setShot(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <p className="lz-label">Acabado del tejido</p>
          <div className="lz-chips">
            {PRODUCT_FINISHES.map((x) => (
              <button key={x.id} className={finish === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setFinish(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <label className="lz-toggle" title="La IA no cambia nada del dibujo: logos, textos, colores, cremallera, bolsillos…">
            <input type="checkbox" checked={exact} onChange={(ev) => setExact(ev.target.checked)} /> Mantener el diseño exacto
          </label>
        </>
      ) : (
        <>
          <p className="lz-label">Escenario</p>
          <div className="lz-chips">
            {LOOK_SCENES.filter((x) => x.id !== 'otro').map((x) => (
              <button key={x.id} className={scene === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setScene(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="lz-field">
        <span>Algo más (pose, capucha puesta, chaqueta abierta…)</span>
        <input className="lz-hex" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </label>
      <label className="lz-field">
        <span>Texto para la IA (lo puedes retocar)</span>
        <textarea className="lz-hex lz-prompt" value={text} onChange={(e) => setText(e.target.value)} rows={10} />
      </label>
      <div className="lz-chips">
        <button className="lz-btn" onClick={onExport} title="Descarga el lienzo como PNG para adjuntarlo a la IA como referencia">
          Descargar el lienzo (referencia)
        </button>
      </div>
      <div className="lz-chips">
        <button className="lz-btn primary" onClick={() => open('https://gemini.google.com/app')}>
          Copiar y abrir Gemini
        </button>
        <button className="lz-btn" onClick={() => open('https://chatgpt.com/')}>
          Copiar y abrir ChatGPT
        </button>
      </div>
      {copied && <p className="lz-muted">Texto copiado: pégalo en la IA con Ctrl+V.</p>}
    </div>
  )
}

/** Estampados del bote (los mismos de las piezas del Diseñador). */
export const FILL_PATTERNS: { id: SurfaceKind; label: string; group?: string }[] = [
  { id: 'liso', label: 'Color liso' },
  ...PATTERN_GROUPS.flatMap((g) => g.ids.map((id) => ({ id: id as SurfaceKind, label: SURFACE_KINDS.find((k) => k.id === id)?.label ?? id, group: g.label }))),
  { id: 'imagen', label: 'Tu tela', group: 'Otros' },
]

/** Con qué rellena el bote: color liso o estampado, con su segundo color y su tamaño. */
export function PatternPicker({
  value,
  color,
  onChange,
  onUpload,
}: {
  value: Settings['fillPattern']
  color: string
  onChange: (v: Settings['fillPattern']) => void
  onUpload: (f: File) => void
}) {
  const v = value ?? { kind: 'liso' as SurfaceKind, color2: '#ffffff', size: 3, angle: 0 }
  return (
    <>
      <select
        value={v.kind}
        onChange={(e) => onChange({ ...v, kind: e.target.value as SurfaceKind, size: DEFAULT_SIZE[e.target.value] ?? v.size, color2: patternDefaults(e.target.value).c2 })}
        title="Rellenar con color liso o con un estampado"
        className="lz-select"
      >
        <option value="liso">Color liso</option>
        {[...new Set(FILL_PATTERNS.filter((p) => p.group).map((p) => p.group!))].map((g) => (
          <optgroup key={g} label={g}>
            {FILL_PATTERNS.filter((p) => p.group === g).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {v.kind !== 'liso' && (
        <>
          <PatternSwatch value={v} color={color} />
          {v.kind !== 'imagen' ? (
            <label className="lz-mini-color" title="Segundo color del estampado">
              <input type="color" value={v.color2} onChange={(e) => onChange({ ...v, color2: e.target.value })} />
            </label>
          ) : (
            <label className="lz-chip" title="Sube una muestra de tu tela (se repite)">
              {v.file ? 'Cambiar tela' : 'Subir tela'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
          )}
          <label className="lz-inline-range" title="Tamaño del dibujo que se repite">
            <span>{v.size} cm</span>
            <input type="range" min={0.5} max={Math.max(20, (DEFAULT_SIZE[v.kind] ?? 0) * 3)} step={0.5} value={v.size} onChange={(e) => onChange({ ...v, size: Number(e.target.value) })} />
          </label>
        </>
      )}
    </>
  )
}

/** Muestra pequeña del estampado elegido. */
export function PatternSwatch({ value, color }: { value: Settings['fillPattern']; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    const tile = pieceTile({ color, surface: { kind: value.kind, color2: value.color2, color3: '#6b7280', size: value.size, angle: value.angle, ...(value.file ? { file: value.file } : {}) } })
    g.clearRect(0, 0, c.width, c.height)
    if (!tile) return
    const p = g.createPattern(tile.canvas, 'repeat')!
    p.setTransform(new DOMMatrix().scale(Math.max(0.03, Math.min(0.25, 10 / value.size / 10))))
    g.fillStyle = p
    g.fillRect(0, 0, c.width, c.height)
  })
  return <canvas ref={ref} width={30} height={30} className="lz-swatch-canvas" />
}

/** Guía de perspectiva: líneas que salen de cada punto de fuga y el horizonte; los puntos se arrastran. */
export function PerspectiveGuide({
  w,
  h,
  points,
  scale,
  onMove,
  toDoc,
}: {
  w: number
  h: number
  points: [number, number][]
  scale: number
  onMove: (i: number, x: number, y: number) => void
  toDoc: (x: number, y: number) => { x: number; y: number }
}) {
  const L = Math.hypot(w, h) * 2
  const sw = 1.2 / scale
  return (
    <svg className="lz-overlay persp" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <line x1={-L} y1={points[0][1]} x2={L} y2={points[0][1]} stroke="#3d8bfd" strokeWidth={sw * 1.6} opacity={0.7} />
      {points.map(([px, py], i) => (
        <g key={i}>
          {Array.from({ length: 36 }, (_, k) => {
            const a = (k / 36) * Math.PI * 2
            return <line key={k} x1={px} y1={py} x2={px + Math.cos(a) * L} y2={py + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.35} />
          })}
          <circle
            cx={px}
            cy={py}
            r={12 / scale}
            fill="#ffffff"
            stroke="#3d8bfd"
            strokeWidth={3 / scale}
            style={{ pointerEvents: 'auto', cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              const move = (ev: PointerEvent) => {
                const p = toDoc(ev.clientX, ev.clientY)
                onMove(i, p.x, p.y)
              }
              const up = () => {
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
            }}
          />
        </g>
      ))}
    </svg>
  )
}

/** Guía de la simetría: sus ejes (o los radios) y el centro, que se arrastra. */
export function SymmetryGuide({
  w,
  h,
  kind,
  count,
  center,
  scale,
  toDoc,
  onMove,
}: {
  w: number
  h: number
  kind: Symmetry
  count: number
  center: [number, number]
  scale: number
  toDoc: (x: number, y: number) => { x: number; y: number }
  onMove: (x: number, y: number) => void
}) {
  const L = Math.hypot(w, h) * 2
  const [cx, cy] = center
  const sw = 2 / scale
  const full: number[] = []
  if (kind === 'vertical' || kind === 'cuadrante') full.push(Math.PI / 2)
  if (kind === 'horizontal' || kind === 'cuadrante') full.push(0)
  const n = kind === 'radial' || kind === 'giratoria' ? Math.max(2, Math.min(16, count)) : 0
  return (
    <svg className="lz-overlay persp" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {full.map((a) => (
        <line key={a} x1={cx - Math.cos(a) * L} y1={cy - Math.sin(a) * L} x2={cx + Math.cos(a) * L} y2={cy + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.8} />
      ))}
      {Array.from({ length: n }, (_, k) => {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2
        return <line key={k} x1={cx} y1={cy} x2={cx + Math.cos(a) * L} y2={cy + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.7} />
      })}
      <circle
        cx={cx}
        cy={cy}
        r={11 / scale}
        fill="#fff"
        stroke="#3d8bfd"
        strokeWidth={3 / scale}
        style={{ pointerEvents: 'auto', cursor: 'grab' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          const el = e.currentTarget
          try {
            el.setPointerCapture(e.pointerId)
          } catch {
            // Puntero ya suelto
          }
          const move = (ev: PointerEvent) => {
            const p = toDoc(ev.clientX, ev.clientY)
            onMove(p.x, p.y)
          }
          const up = () => {
            el.removeEventListener('pointermove', move)
            el.removeEventListener('pointerup', up)
          }
          el.addEventListener('pointermove', move)
          el.addEventListener('pointerup', up)
        }}
      />
    </svg>
  )
}

/**
 * Botón flotante del menú rápido: se arrastra a cualquier sitio del lienzo (se recuerda) y al tocarlo abre el menú.
 */
export function QuickButton({ at, open, onMove, onToggle }: { at: [number, number]; open: boolean; onMove: (at: [number, number]) => void; onToggle: (rect: DOMRect) => void }) {
  const [pos, setPos] = useState(at)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => setPos(at), [at[0], at[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const place = (ev: { clientX: number; clientY: number }, el: HTMLElement) => {
    const box = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    const x = Math.min(0.98, Math.max(0.02, (ev.clientX - box.left) / box.width))
    const y = Math.min(0.97, Math.max(0.06, (ev.clientY - box.top) / box.height))
    return [x, y] as [number, number]
  }
  return (
    <button
      className={open ? 'lz-fab on' : 'lz-fab'}
      style={{ left: `${pos[0] * 100}%`, top: `${pos[1] * 100}%` }}
      title="Menú rápido: tócalo para abrirlo o arrástralo donde quieras (también con clic derecho en el lienzo)"
      aria-label="Menú rápido"
      onPointerDown={(e) => {
        e.stopPropagation()
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Puntero ya suelto
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
        d.moved = true
        setPos(place(e, e.currentTarget))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d) return
        if (d.moved) onMove(place(e, e.currentTarget))
        else onToggle(e.currentTarget.getBoundingClientRect())
      }}
    >
      <Icon d="M10 3a7 7 0 100 14 7 7 0 000-14zM10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
    </button>
  )
}
