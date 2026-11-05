import { useEffect, useMemo, useState, type RefObject } from 'react'
import { FlatView } from '../../designer/FlatView'
import { unitsOf } from '../../designer/prints'
import { TEMPLATES } from '../../designer/templates'
import type { View } from '../../designer/types'
import { TECHNIQUES, type ArtLayer, type Technique } from '../../shared/artworks'
import type { DesignData, Print } from '../../shared/designs'
import type { BrandColor } from '../../shared/users'
import { exportSvg } from './artLayers'
import { coverage, download, inkReport, productionNotes, realSizePng, realSizeSvg, STITCHES_PER_CM2 } from './artProduction'

/** Prendas para ver el gráfico puesto. */
const MOCKUP_GARMENTS = ['camiseta', 'sudadera', 'gorra'] as const
const GARMENT_COLORS = ['#fbfbf8', '#1d1d1f', '#a9a9a6', '#1f2a44', '#2f4a3a', '#b3261e', '#e9e1cf']

interface Rendered {
  blob: Blob
  url: string
  /** Alto / ancho del gráfico exportado. */
  aspect: number
  /** Ancho en unidades del lienzo del creador. */
  units: number
  cover: number
}

/**
 * Producción del gráfico: tamaño real, tintas o hilos (con sus códigos), puntadas de bordado, consejos según la
 * técnica, cómo queda en una prenda y exportación a tamaño real (PNG con sus ppp o SVG en cm).
 */
export function ProductionPanel({ layers, exportRef, brand, name }: { layers: ArtLayer[]; exportRef: RefObject<SVGGElement | null>; brand: BrandColor[]; name: string }) {
  const [technique, setTechnique] = useState<Technique>('serigrafia')
  const [widthCm, setWidthCm] = useState(25)
  const [dpi, setDpi] = useState(300)
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [busy, setBusy] = useState(false)
  const [mockup, setMockup] = useState(false)
  const [garment, setGarment] = useState<(typeof MOCKUP_GARMENTS)[number]>('camiseta')
  const [garmentColor, setGarmentColor] = useState(GARMENT_COLORS[0])
  const [zone, setZone] = useState('pecho')
  const [error, setError] = useState<string | null>(null)
  const visible = layers.filter((l) => !l.hidden)
  const report = useMemo(() => inkReport(visible, brand), [visible, brand])

  // El gráfico exportado (se rehace al cambiar las capas, con una pausa para no hacerlo a cada tecla)
  const key = JSON.stringify(visible)
  useEffect(() => {
    if (!visible.length) {
      setRendered(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      if (!exportRef.current) return
      try {
        const { blob, width, height } = await exportSvg(exportRef.current, visible)
        const cover = await coverage(blob, height / width)
        if (cancelled) return
        setRendered((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { blob, url: URL.createObjectURL(blob), aspect: height / width, units: width, cover }
        })
      } catch {
        // Si falla (p. ej. una imagen que no carga) se deja el anterior
      }
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const heightCm = rendered ? widthCm * rendered.aspect : 0
  const cmPerUnit = rendered ? widthCm / rendered.units : 0
  const textMm = report.smallestText !== null && rendered ? report.smallestText * cmPerUnit * 10 : null
  const notes = productionNotes(technique, report, textMm)
  const areaCm2 = rendered ? widthCm * heightCm * rendered.cover : 0
  const stitches = Math.round((areaCm2 * STITCHES_PER_CM2) / 500) * 500
  const inkWord = technique === 'bordado' || technique === 'parche' ? 'hilos' : 'tintas'
  const file = (name.trim() || 'grafico').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()

  const exportAs = async (kind: 'png' | 'svg') => {
    if (!rendered) return
    setBusy(true)
    setError(null)
    try {
      const blob = kind === 'png' ? await realSizePng(rendered.blob, widthCm, heightCm, dpi) : await realSizeSvg(rendered.blob, widthCm, heightCm)
      download(blob, `${file}-${Math.round(widthCm)}cm.${kind}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Prenda de prueba con el gráfico puesto en la zona elegida, al ancho real
  const template = TEMPLATES.find((t) => t.id === garment)!
  const zones = (['front', 'back'] as View[]).flatMap((v) => (template.printZones[v] ?? []).map((z) => ({ ...z, view: v })))
  const z = zones.find((x) => x.id === zone) ?? zones[0]
  const data: DesignData | null =
    rendered && z
      ? {
          options: {},
          notes: '',
          pieces: Object.fromEntries(template.pieces.filter((p) => p.materials.includes('tejido')).map((p) => [p.id, { color: garmentColor, materialId: null }])),
          prints: [
            {
              id: 'mockup',
              view: z.view,
              kind: 'artwork',
              artworkId: null,
              file: rendered.url,
              aspect: rendered.aspect,
              w: widthCm * unitsOf(template),
              text: '',
              font: '',
              size: 0,
              color: '',
              bold: false,
              x: z.x,
              y: z.y,
              rotation: 0,
              technique,
              clip: true,
            } satisfies Print,
          ],
        }
      : null

  if (!visible.length) return null
  return (
    <section className="production">
      <h2>Producción</h2>
      <div className="chips">
        {TECHNIQUES.map((t) => (
          <button key={t.id} className={technique === t.id ? 'chip active' : 'chip'} onClick={() => setTechnique(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="production-size">
        <label className="field">
          <span>Ancho real (cm)</span>
          <input type="number" min={1} max={150} step={0.5} value={widthCm} onChange={(e) => setWidthCm(Math.max(1, Math.min(150, Number(e.target.value) || 1)))} />
        </label>
        <div className="field">
          <span>Alto</span>
          <strong>{rendered ? `${heightCm.toFixed(1).replace('.', ',')} cm` : '…'}</strong>
        </div>
      </div>

      <h3 className="form-sub">
        {report.inks.length} {report.inks.length === 1 ? inkWord.slice(0, -1) : inkWord}
        {report.images && ' + imagen a todo color'}
      </h3>
      <ul className="ink-list">
        {report.inks.map((k) => (
          <li key={k.hex}>
            <span className="ink-swatch" style={{ background: k.hex }} />
            <span>{k.name || 'Sin nombre'}</span>
            <span className="muted small">{k.code || k.hex.toUpperCase()}</span>
          </li>
        ))}
      </ul>
      {technique === 'bordado' && rendered && (
        <p className="small">
          Unas <strong>{stitches.toLocaleString('es-ES')}</strong> puntadas ({areaCm2.toFixed(0)} cm² rellenos) y {report.inks.length} cambios de hilo. Cálculo
          orientativo: el taller lo afina al picar el diseño.
        </p>
      )}
      {technique !== 'bordado' && rendered && <p className="muted small">Superficie con tinta: {areaCm2.toFixed(0)} cm² de {(widthCm * heightCm).toFixed(0)} cm².</p>}
      {notes.map((n) => (
        <p key={n} className="production-note small">
          {n}
        </p>
      ))}

      <h3 className="form-sub">Ver en una prenda</h3>
      <button className={mockup ? 'button active' : 'button'} onClick={() => setMockup((v) => !v)}>
        {mockup ? 'Ocultar prenda' : 'Probar en una prenda'}
      </button>
      {mockup && (
        <div className="mockup">
          <div className="chips">
            {MOCKUP_GARMENTS.map((g) => (
              <button
                key={g}
                className={garment === g ? 'chip active' : 'chip'}
                onClick={() => {
                  setGarment(g)
                  setZone(g === 'gorra' ? 'frontal' : 'pecho')
                }}
              >
                {TEMPLATES.find((t) => t.id === g)!.name}
              </button>
            ))}
          </div>
          <div className="chips">
            {zones.map((x) => (
              <button key={x.id} className={z?.id === x.id ? 'chip active' : 'chip'} onClick={() => setZone(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="color-line">
            {GARMENT_COLORS.map((c) => (
              <button key={c} className={c === garmentColor ? 'swatch-button active' : 'swatch-button'} style={{ background: c }} onClick={() => setGarmentColor(c)} aria-label={`Prenda ${c}`} />
            ))}
          </div>
          {data && z && <FlatView template={template} data={data} view={z.view} className="mockup-flat" />}
          <p className="muted small">Al ancho real que has puesto ({widthCm} cm), sobre la talla M.</p>
        </div>
      )}

      <h3 className="form-sub">Exportar a tamaño real</h3>
      <div className="chips">
        {[150, 300].map((v) => (
          <button key={v} className={dpi === v ? 'chip active' : 'chip'} onClick={() => setDpi(v)}>
            {v} ppp
          </button>
        ))}
      </div>
      <div className="print-actions">
        <button className="button" disabled={!rendered || busy} onClick={() => exportAs('png')} title={`PNG transparente de ${Math.round((widthCm / 2.54) * dpi)} px de ancho`}>
          PNG {widthCm} cm
        </button>
        <button className="button" disabled={!rendered || busy} onClick={() => exportAs('svg')} title="Vectorial, con su medida en cm (para corte de vinilo o imprenta)">
          SVG {widthCm} cm
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
    </section>
  )
}
