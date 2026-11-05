import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { garmentPoms, type Body } from '../production/measurements'
import type { DesignData } from '../shared/designs'
import { CX } from './geometry'
import { defaultMeasures, DRIVERS, drawScale, type DrawScale } from './measures'
import { isPants, type GarmentTemplate, type View } from './types'

/**
 * «Estirar forma»: puntos sobre el dibujo que se arrastran para cambiar una medida (ancho y caída del escote, pecho,
 * largo, manga, puño; cadera, rodilla, bajo y largo del pantalón). Cada punto mueve una medida propia del diseño
 * (`DesignData.measures`), así el dibujo, la ficha técnica y el 3D cambian a la vez.
 *
 * Dónde va cada punto no se escribe a mano para cada prenda: se dibuja la prenda con esa parte un 10 % más grande
 * y el punto del trazado que más se mueve es el que se agarra (y su desplazamiento, la dirección en la que estira).
 */

export interface ShapeHandle {
  key: keyof DrawScale
  pom: string
  label: string
  x: number
  y: number
  /** Cuánto se mueve el punto al estirar esa parte un 10 %. */
  dx: number
  dy: number
}

const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

/** Puntos para estirar la prenda en una vista. */
export function shapeHandles(t: GarmentTemplate, data: DesignData, view: View, body?: Body): ShapeHandle[] {
  const poms = new Map(garmentPoms(t, data.options).map((p) => [p.id, p]))
  const s = drawScale(t, data, body)
  const base = t.draw(view, data.options, s)
  const out: ShapeHandle[] = []
  for (const [key, ids] of Object.entries(DRIVERS[isPants(t) ? 'pants' : 'top']) as [keyof DrawScale, string[]][]) {
    const pom = ids.find((id) => poms.has(id))
    if (!pom) continue
    const moved = t.draw(view, data.options, { ...s, [key]: s[key] * 1.1 })
    if (moved.length !== base.length) continue
    let best: { x: number; y: number; dx: number; dy: number; d: number } | null = null
    for (let i = 0; i < base.length; i++) {
      if (base[i].kind === 'stitch') continue
      const a = nums(base[i].d)
      const b = nums(moved[i].d)
      if (a.length !== b.length) continue
      for (let j = 0; j + 1 < a.length; j += 2) {
        // Solo la mitad derecha (el dibujo es simétrico) y el centro
        if (a[j] < CX - 0.5) continue
        const dx = b[j] - a[j]
        const dy = b[j + 1] - a[j + 1]
        const d = Math.hypot(dx, dy)
        if (!best || d > best.d + 0.01) best = { x: a[j], y: a[j + 1], dx, dy, d }
      }
    }
    if (!best || best.d < 0.8) continue
    // Si dos medidas acaban en el mismo punto, se queda la primera
    if (out.some((h) => Math.hypot(h.x - best!.x, h.y - best!.y) < 3)) continue
    out.push({ key, pom, label: poms.get(pom)!.label, x: best.x, y: best.y, dx: best.dx, dy: best.dy })
  }
  return out
}

interface Props {
  template: GarmentTemplate
  data: DesignData
  view: View
  body: Body
  onMeasures: (m: Record<string, number>) => void
}

/** Capa con los puntos para estirar la prenda (va encima del dibujo, en sus mismas unidades). */
export function ShapeHandles({ template, data, view, body, onMeasures }: Props) {
  const handles = shapeHandles(template, data, view, body)
  const drag = useRef<{ h: ShapeHandle; x: number; y: number; m0: number; k0: number; own: Record<string, number> } | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const defaults = defaultMeasures(template, data, body)
  const valueOf = (pom: string) => data.measures?.[pom] ?? defaults.get(pom) ?? 0

  const toSvg = (e: ReactPointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }
  const down = (h: ShapeHandle) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const p = toSvg(e)
    drag.current = { h, x: p.x, y: p.y, m0: valueOf(h.pom), k0: drawScale(template, data, body)[h.key], own: { ...data.measures } }
    setActive(h.pom)
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo: se arrastra igual, sin captura
    }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toSvg(e)
    // Cuánto se ha estirado, medido en la dirección en la que se mueve el punto
    const t = ((p.x - d.x) * d.h.dx + (p.y - d.y) * d.h.dy) / (d.h.dx * d.h.dx + d.h.dy * d.h.dy)
    const k = Math.min(1.8, Math.max(0.5, d.k0 * (1 + 0.1 * t)))
    const m = Math.round(((d.m0 * k) / d.k0) * 2) / 2
    if (m !== (data.measures?.[d.h.pom] ?? d.m0)) onMeasures({ ...d.own, [d.h.pom]: m })
  }
  const up = () => {
    drag.current = null
    setActive(null)
  }

  return (
    <g>
      {handles.map((h) => {
        const on = active === h.pom
        const label = `${h.label} · ${valueOf(h.pom).toLocaleString('es-ES')} cm`
        return (
          <g key={h.pom}>
            {(on || hover === h.pom) && (
              <g pointerEvents="none" fontFamily="Inter, system-ui, sans-serif">
                <rect x={h.x + 8} y={h.y - 20} width={label.length * 4.3 + 10} height={14} rx={3} fill="#1d4ed8" />
                <text x={h.x + 13} y={h.y - 10} fontSize={8} fill="#fff">
                  {label}
                </text>
              </g>
            )}
            <circle cx={h.x} cy={h.y} r={on ? 5.5 : 4.5} fill="#2563eb" stroke="#fff" strokeWidth={1.6} pointerEvents="none" />
            {/* Zona para agarrarlo, más grande que el punto */}
            <circle
              cx={h.x}
              cy={h.y}
              r={11}
              fill="transparent"
              style={{ cursor: Math.abs(h.dx) > Math.abs(h.dy) * 2 ? 'ew-resize' : Math.abs(h.dy) > Math.abs(h.dx) * 2 ? 'ns-resize' : 'move' }}
              onPointerDown={down(h)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerEnter={() => setHover(h.pom)}
              onPointerLeave={() => setHover(null)}
            >
              <title>{`${h.label}: arrastra para cambiarla`}</title>
            </circle>
          </g>
        )
      })}
    </g>
  )
}
