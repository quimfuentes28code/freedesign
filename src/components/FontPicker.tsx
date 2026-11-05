import { useEffect, useRef, useState } from 'react'
import { FONT_GROUPS, fontLabel, loadFont, loadFontPreviews } from '../designer/fonts'

/** Selector de tipografía: busca por nombre, agrupa por estilo y enseña cada fuente con su aspecto. */
export function FontPicker({ value, onChange, label = 'Tipografía' }: { value: string; onChange: (font: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadFont(value)
  }, [value])
  useEffect(() => {
    if (!open) return
    loadFontPreviews()
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const needle = q.trim().toLowerCase()
  const groups = FONT_GROUPS.map((g) => ({ ...g, fonts: g.fonts.filter((f) => !needle || f.label.toLowerCase().includes(needle) || g.name.toLowerCase().includes(needle)) })).filter(
    (g) => g.fonts.length,
  )

  return (
    <div className="field font-picker" ref={box}>
      <span>{label}</span>
      <button type="button" className="font-current" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ fontFamily: value }}>
        {fontLabel(value)}
        <span className="material-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="font-pop" role="listbox" aria-label="Tipografías">
          <input className="material-search" placeholder="Buscar fuente o estilo (gótica, grafiti…)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="font-list">
            {groups.map((g) => (
              <div key={g.name} className="font-group">
                <h3>{g.name}</h3>
                {g.fonts.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={f.id === value}
                    className={f.id === value ? 'font-option active' : 'font-option'}
                    style={{ fontFamily: f.id }}
                    onClick={() => {
                      loadFont(f.id)
                      onChange(f.id)
                      setOpen(false)
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="muted small">Ninguna fuente con ese nombre.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
