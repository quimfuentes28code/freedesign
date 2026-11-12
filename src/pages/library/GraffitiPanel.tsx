import { useEffect, useState } from 'react'
import { loadFont } from '../../designer/fonts'
import type { ArtLayer } from '../../shared/artworks'
import { DEFAULT_GRAFFITI, GRAFFITI_FONTS, GRAFFITI_PRESETS, GRAFFITI_STYLES, graffitiLayers, type GraffitiBackground, type GraffitiOptions } from './artGraffiti'

/** Panel del generador de graffiti: texto, estilo, colores y efectos; «Generar» pone las capas en el creador. */
export function GraffitiPanel({ onGenerate }: { onGenerate: (layers: ArtLayer[], name: string) => void }) {
  const [o, setO] = useState<GraffitiOptions>(DEFAULT_GRAFFITI)
  const set = (p: Partial<GraffitiOptions>) => setO((x) => ({ ...x, ...p }))
  useEffect(() => {
    for (const f of GRAFFITI_FONTS) loadFont(f)
  }, [])
  const toggles: [keyof GraffitiOptions, string][] = [
    ['drips', 'Gotas que chorrean'],
    ['shine', 'Brillos'],
    ['volume', 'Volumen 3D'],
    ['doubleOutline', 'Contorno doble'],
    ['arrows', 'Flechas'],
    ['stars', 'Estrellas'],
  ]
  const colors: [keyof GraffitiOptions, string][] = [
    ['fill', 'Relleno'],
    ['fill2', 'Degradado'],
    ['outline', 'Contorno'],
    ['outer', 'Contorno de fuera'],
    ['back', 'Fondo'],
  ]
  return (
    <div className="graffiti-panel">
      <label className="graffiti-field">
        <span>Texto</span>
        <input value={o.text} maxLength={14} onChange={(e) => set({ text: e.target.value })} placeholder="Tu nombre o tu marca" />
      </label>
      <span className="muted small">Estilo</span>
      <div className="chips">
        {GRAFFITI_STYLES.map((s) => (
          <button key={s.id} className={o.style === s.id ? 'chip active' : 'chip'} onClick={() => set({ style: s.id, ...GRAFFITI_PRESETS[s.id] })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="graffiti-colors">
        {colors.map(([k, label]) => (
          <label key={k}>
            <input type="color" value={o[k] as string} onChange={(e) => set({ [k]: e.target.value })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="graffiti-toggles">
        {toggles.map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={!!o[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <span className="muted small">Fondo</span>
      <div className="chips">
        {(
          [
            ['ninguno', 'Sin fondo'],
            ['nube', 'Nube'],
            ['cuadros', 'Cuadros'],
            ['estrellas', 'Estrellas'],
          ] as [GraffitiBackground, string][]
        ).map(([id, label]) => (
          <button key={id} className={o.background === id ? 'chip active' : 'chip'} onClick={() => set({ background: id })}>
            {label}
          </button>
        ))}
      </div>
      <label className="graffiti-field">
        <span>Inclinación {o.tilt}°</span>
        <input type="range" min={-20} max={20} step={1} value={o.tilt} onChange={(e) => set({ tilt: Number(e.target.value) })} />
      </label>
      <button className="button primary" onClick={() => onGenerate(graffitiLayers(o), `Graffiti ${o.text.trim().toUpperCase() || 'FREE'}`)}>
        Generar graffiti
      </button>
      <p className="muted small">Sale por capas (letras, volumen, gotas, brillos, fondo): luego mueve, cambia o borra lo que quieras. Sustituye lo que hay (Ctrl+Z para volver).</p>
    </div>
  )
}
