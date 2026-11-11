import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Color en HSV (matiz 0–360, saturación y brillo 0–1). */
interface Hsv {
  h: number
  s: number
  v: number
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`
}

interface Props {
  color: string
  onChange: (hex: string) => void
  recent: string[]
  brand: string[]
}

/** Selector de color como el de Procreate: cuadro de saturación y brillo, barra de matiz, código y paletas. */
export function ColorPicker({ color, onChange, recent, brand }: Props) {
  const [hsv, setHsv] = useState(() => hexToHsv(color))
  const [hex, setHex] = useState(color)
  // Si el color cambia desde fuera (cuentagotas), se pone en el selector sin perder el matiz de los grises
  const last = useRef(color)
  useEffect(() => {
    if (color === last.current) return
    last.current = color
    const next = hexToHsv(color)
    setHsv((prev) => (next.s === 0 ? { ...next, h: prev.h } : next))
    setHex(color)
  }, [color])
  const set = (next: Hsv) => {
    setHsv(next)
    const out = hsvToHex(next)
    last.current = out
    setHex(out)
    onChange(out)
  }
  const drag = (el: HTMLElement, e: ReactPointerEvent, fn: (u: number, v: number) => void) => {
    const r = el.getBoundingClientRect()
    const at = (ev: { clientX: number; clientY: number }) =>
      fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)))
    at(e)
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => at(ev)
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const hue = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  return (
    <div className="lz-color">
      <div
        className="lz-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})` }}
        onPointerDown={(e) => drag(e.currentTarget, e, (u, v) => set({ ...hsv, s: u, v: 1 - v }))}
      >
        <span className="lz-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <div className="lz-hue" onPointerDown={(e) => drag(e.currentTarget, e, (u) => set({ ...hsv, h: u * 359.9 }))}>
        <span className="lz-knob" style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%', background: hue }} />
      </div>
      <div className="lz-color-row">
        <span className="lz-swatch big" style={{ background: hsvToHex(hsv) }} />
        <input
          className="lz-hex"
          value={hex}
          onChange={(e) => {
            setHex(e.target.value)
            if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
              setHsv(hexToHsv(v))
              last.current = v
              onChange(v)
            }
          }}
          aria-label="Código del color"
        />
      </div>
      {brand.length > 0 && (
        <>
          <p className="lz-label">Colores de la marca</p>
          <div className="lz-swatches">
            {brand.map((c) => (
              <button key={c} className="lz-swatch" style={{ background: c }} onClick={() => onChange(c)} title={c} />
            ))}
          </div>
        </>
      )}
      <p className="lz-label">Recientes</p>
      <div className="lz-swatches">
        {recent.map((c) => (
          <button key={c} className="lz-swatch" style={{ background: c }} onClick={() => onChange(c)} title={c} />
        ))}
        {!recent.length && <span className="lz-muted">Aún no has usado colores</span>}
      </div>
    </div>
  )
}
