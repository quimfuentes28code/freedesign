/**
 * Barra de herramientas del lienzo, como la de Photoshop: una columna a la izquierda con cada herramienta una sola vez,
 * agrupadas. Cada grupo enseña su última herramienta usada; el triangulito de la esquina indica que hay más: mantener
 * pulsado, clic derecho o tocar el triangulito abre el grupo para elegir otra. Las teclas de siempre siguen valiendo.
 */
import { useEffect, useRef, useState } from 'react'

export interface ToolDef {
  id: string
  label: string
  /** Tecla rápida (se enseña en el nombre). */
  key: string
  /** Trazo del icono (20 × 20). */
  d: string
}

/** Grupos en el orden de Photoshop: mover y seleccionar, pintar y borrar, rellenar, vectores, texto. */
export const TOOL_GROUPS: { id: string; tools: ToolDef[] }[] = [
  { id: 'move', tools: [{ id: 'move', label: 'Mover la capa', key: 'V', d: 'M10 2.5v15M2.5 10h15M10 2.5l-2.5 2.5M10 2.5l2.5 2.5M10 17.5l-2.5-2.5M10 17.5l2.5-2.5M2.5 10l2.5-2.5M2.5 10l2.5 2.5M17.5 10l-2.5-2.5M17.5 10l-2.5 2.5' }] },
  {
    id: 'select',
    tools: [
      { id: 'select', label: 'Selección a mano (lazo)', key: 'S', d: 'M10 3.5c4 0 6.5 1.8 6.5 4.2S14 12 10 12 3.5 10.1 3.5 7.7 6 3.5 10 3.5zM6 11.5l-1.5 5 2-1 1 1.5' },
      { id: 'direct', label: 'Selección directa (vectores)', key: 'A', d: 'M5 3l10 6.5-4.5 1.2 2.6 4.8-1.8 1-2.6-4.8L5 15z' },
    ],
  },
  {
    id: 'paint',
    tools: [
      { id: 'brush', label: 'Pincel', key: 'B', d: 'M14.5 3.5l2 2-8 8-3 1 1-3zM4 16.5c1.5 0 2.5-1 2.5-2.5' },
      { id: 'shaper', label: 'Shaper: formas perfectas a mano', key: 'N', d: 'M3.5 14.5c2-6 4-9 6.5-9s3 3 1 5.5-1 4 2 4 3-2 3.5-3.5M4 4.5h4v4H4z' },
      { id: 'curve', label: 'Curvatura', key: 'C', d: 'M3.5 15.5C6 6 14 14 16.5 4.5M3.5 15.5h.01M10 10h.01M16.5 4.5h.01' },
    ],
  },
  { id: 'eraser', tools: [{ id: 'eraser', label: 'Goma de borrar', key: 'E', d: 'M7 16.5h9M3.5 12.5l7-7 5 5-6 6H7z' }] },
  {
    id: 'fill',
    tools: [
      { id: 'fill', label: 'Bote de pintura', key: 'G', d: 'M4 9.5l5.5-5.5 6 6-5.5 5.5zM16.5 12.5c0 1.5-1 2.5-1 2.5s-1-1-1-2.5' },
      { id: 'picker', label: 'Cuentagotas', key: 'I', d: 'M13 3.5l3.5 3.5-2 2-3.5-3.5zM11 5.5l-7 7v3h3l7-7' },
    ],
  },
  {
    id: 'pen',
    tools: [
      { id: 'pen', label: 'Pluma (vectores)', key: 'P', d: 'M10 2.5l4.5 7-4.5 8-4.5-8zM10 9.5v8M10 9.5a1 1 0 100 .01' },
      { id: 'vpencil', label: 'Lápiz vectorial', key: 'L', d: 'M13.5 3.5l3 3-8.5 8.5-3.5.5.5-3.5zM3 17.5c2-1.5 4-1.5 6 0s4 1.5 6 0' },
    ],
  },
  { id: 'vshape', tools: [{ id: 'vshape', label: 'Formas vectoriales', key: 'M', d: 'M3.5 3.5h7v7h-7zM14 9.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z' }] },
  { id: 'text', tools: [{ id: 'text', label: 'Texto', key: 'T', d: 'M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5' }] },
]

export const toolDef = (id: string) => TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === id)

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const LAST_KEY = 'freedesign.lienzo.groups'
function loadLast(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

/**
 * Columna de herramientas. `onReclick`: tocar otra vez la herramienta activa (el pincel y la goma abren sus pinceles).
 */
export function ToolColumn({ tool, onPick, onReclick, children }: { tool: string; onPick: (id: string) => void; onReclick: (id: string) => void; children?: React.ReactNode }) {
  const [last, setLast] = useState<Record<string, string>>(loadLast)
  const [open, setOpen] = useState<string | null>(null)
  const hold = useRef(0)
  const held = useRef(false)

  // La herramienta elegida (también con teclado) pasa a ser la que enseña su grupo
  useEffect(() => {
    const g = TOOL_GROUPS.find((x) => x.tools.some((t) => t.id === tool))
    if (g && last[g.id] !== tool) {
      const next = { ...last, [g.id]: tool }
      setLast(next)
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(next))
      } catch {
        // Sin almacenamiento
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])
  // Un toque fuera cierra el grupo abierto
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.lz-tg')) setOpen(null)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])

  return (
    <aside className="lz-tools" aria-label="Herramientas" onPointerDown={(e) => e.stopPropagation()}>
      {TOOL_GROUPS.map((g) => {
        const shown = g.tools.find((t) => t.id === tool) ?? g.tools.find((t) => t.id === last[g.id]) ?? g.tools[0]
        const active = g.tools.some((t) => t.id === tool)
        const many = g.tools.length > 1
        return (
          <div key={g.id} className="lz-tg">
            <button
              className={active ? 'lz-tg-btn on' : 'lz-tg-btn'}
              title={`${shown.label} (${shown.key})${many ? ' — mantén pulsado para ver las demás del grupo' : ''}`}
              aria-label={shown.label}
              onPointerDown={() => {
                held.current = false
                if (!many) return
                clearTimeout(hold.current)
                hold.current = window.setTimeout(() => {
                  held.current = true
                  setOpen(g.id)
                }, 450)
              }}
              onPointerUp={() => clearTimeout(hold.current)}
              onPointerLeave={() => clearTimeout(hold.current)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (many) setOpen(g.id)
              }}
              onClick={() => {
                if (held.current) return
                setOpen(null)
                if (shown.id === tool) onReclick(shown.id)
                else onPick(shown.id)
              }}
            >
              <Glyph d={shown.d} />
              {many && (
                <span
                  className="lz-tg-more"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(open === g.id ? null : g.id)
                  }}
                />
              )}
            </button>
            {open === g.id && (
              <div className="lz-tg-fly" role="menu">
                {g.tools.map((t) => (
                  <button
                    key={t.id}
                    role="menuitem"
                    className={t.id === tool ? 'on' : ''}
                    onClick={() => {
                      setOpen(null)
                      onPick(t.id)
                    }}
                  >
                    <Glyph d={t.d} />
                    <span>{t.label}</span>
                    <kbd>{t.key}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {children}
    </aside>
  )
}
