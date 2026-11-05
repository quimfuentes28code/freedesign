import { useEffect, useRef, useState } from 'react'
import { download, exportFlat, type ExportFormat } from '../../designer/exportFlat'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import type { Body } from '../../production/measurements'
import type { DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  body: Body
  bodyLabel: string
  name: string
  /** Vista que se ve ahora en el lienzo (null si se ven todas). */
  view: View | null
  /** Cómo se ve ahora el lienzo, para partir de lo mismo. */
  mode: 'color' | 'linea'
  dims: boolean
  notes: boolean
}

const FORMATS: { id: ExportFormat; label: string; title: string }[] = [
  { id: 'png', label: 'PNG', title: 'Imagen en alta resolución' },
  { id: 'svg', label: 'SVG', title: 'Vectorial, para Illustrator o el taller' },
  { id: 'pdf', label: 'PDF', title: 'Hoja A4 apaisada con el nombre del diseño' },
]

/** Botón «Exportar» del editor: elige formato, vistas y qué se incluye, y descarga el dibujo. */
export function ExportMenu(props: Props) {
  const { template, data, materials, body, bodyLabel, name } = props
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [which, setWhich] = useState<'actual' | 'todas'>(props.view ? 'actual' : 'todas')
  const [mode, setMode] = useState(props.mode)
  const [dims, setDims] = useState(props.dims)
  const [notes, setNotes] = useState(props.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Al abrirlo parte de cómo se ve ahora el lienzo
  const toggle = () => {
    if (!open) {
      setWhich(props.view ? 'actual' : 'todas')
      setMode(props.mode)
      setDims(props.dims)
      setNotes(props.notes)
      setError(null)
    }
    setOpen(!open)
  }

  // Se cierra al hacer clic fuera o con Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const views: View[] = which === 'actual' && props.view ? [props.view] : VIEWS.map((v) => v.id)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const subtitle = [template.name, `Medidas: ${bodyLabel}`, new Date().toLocaleDateString('es-ES')].join(' · ')
      const { blob, file } = await exportFlat(template, data, materials, body, { format, views, mode, dims, notes, name: name || 'Diseño', subtitle })
      download(blob, file)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message || 'No se ha podido exportar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="export-menu" ref={box}>
      <button className="button" onClick={toggle} aria-expanded={open} title="Descargar el dibujo en PNG, SVG o PDF">
        Exportar
      </button>
      {open && (
        <div className="export-panel" role="dialog" aria-label="Exportar el dibujo">
          <h3>Formato</h3>
          <div className="segmented">
            {FORMATS.map((f) => (
              <button key={f.id} className={format === f.id ? 'active' : ''} onClick={() => setFormat(f.id)} title={f.title}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="muted small">{FORMATS.find((f) => f.id === format)?.title}</p>

          <h3>Vistas</h3>
          <div className="segmented">
            <button className={which === 'actual' ? 'active' : ''} onClick={() => setWhich('actual')} disabled={!props.view}>
              {props.view ? VIEWS.find((v) => v.id === props.view)?.label : 'Vista actual'}
            </button>
            <button className={which === 'todas' ? 'active' : ''} onClick={() => setWhich('todas')}>
              Las tres
            </button>
          </div>

          <h3>Dibujo</h3>
          <div className="segmented">
            <button className={mode === 'color' ? 'active' : ''} onClick={() => setMode('color')}>
              Color
            </button>
            <button className={mode === 'linea' ? 'active' : ''} onClick={() => setMode('linea')}>
              Línea
            </button>
          </div>
          <label className="toggle-row">
            <span>Cotas con las medidas</span>
            <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>Notas</span>
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
          </label>

          {error && <p className="status error small">{error}</p>}
          <button className="button primary" onClick={run} disabled={busy}>
            {busy ? 'Preparando…' : `Descargar ${format.toUpperCase()}`}
          </button>
        </div>
      )}
    </div>
  )
}
