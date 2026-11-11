import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../api/client'
import { measureDeltas } from '../../designer/measures'
import { getTemplate } from '../../designer/templates'
import { clientBody, garmentPoms, standardBody } from '../../production/measurements'
import { draftPattern, hasPattern, type PatternPiece } from '../../production/pattern'
import type { Client } from '../../shared/clients'
import { bodyKind, type Design } from '../../shared/designs'
import { SIZES, type Size } from '../../shared/production'
import './production.css'

/** Hoja A4 vertical con 1 cm de margen: lo que cabe en cada hoja al imprimir el patrón a tamaño real. */
const TILE_W = 19
const TILE_H = 27.7
/** Margen alrededor de cada pieza (cm): el de costura y un poco de aire para los textos. */
const PAD = 3

/**
 * Patronaje de un diseño: las piezas del patrón con su margen de costura, línea de hilo, doblez y piquetes, en la
 * talla elegida o a la medida del cliente. Se imprimen a tamaño real repartidas en hojas A4 que se juntan.
 */
export function PatternPage() {
  const { id = '' } = useParams()
  const [design, setDesign] = useState<Design | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<Size | 'cliente'>('M')
  const [seam, setSeam] = useState(1)
  useEffect(() => {
    api
      .getDesign(id)
      .then(async (d) => {
        setDesign(d)
        if (d.clientId) {
          const c = await api.getClient(d.clientId).catch(() => null)
          setClient(c)
          if (c && Object.keys(c.measurements).length) setSize('cliente')
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  const template = design ? getTemplate(design.template) : undefined
  const pieces = useMemo(() => {
    if (!design || !template) return []
    const kind = bodyKind(design.data)
    const body = size === 'cliente' && client ? clientBody(client.measurements, kind).body : standardBody(size === 'cliente' ? 'M' : size, kind)
    const deltas = measureDeltas(template, design.data, body)
    const m = Object.fromEntries(garmentPoms(template, design.data.options).map((p) => [p.id, p.value(body) + (deltas[p.id] ?? 0)]))
    return draftPattern(template, design.data.options, m)
  }, [design, template, client, size])

  if (error) return <p className="status error">{error}</p>
  if (!design || !template) return <p className="status">Cargando…</p>
  const label = size === 'cliente' && client ? `a medida de ${client.name}` : `talla ${size}`

  return (
    <div className="page pattern-page">
      <div className="techpack-bar no-print">
        <div className="page-title">
          <h1>Patrón</h1>
          <p className="page-subtitle">
            {design.name} · {template.name} · {label}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/produccion" className="button">
            Volver
          </Link>
          <button className="button primary" onClick={() => window.print()} disabled={!pieces.length}>
            Imprimir a tamaño real (A4)
          </button>
        </div>
      </div>

      {!hasPattern(template) ? (
        <p className="status no-print">Esta prenda aún no tiene patrón trazado (de momento: prendas de arriba y pantalones).</p>
      ) : (
        <>
          <div className="card pattern-controls no-print">
            <div className="segmented" role="group" aria-label="Talla">
              {client && Object.keys(client.measurements).length > 0 && (
                <button className={size === 'cliente' ? 'active' : ''} onClick={() => setSize('cliente')}>
                  A medida de {client.name}
                </button>
              )}
              {SIZES.map((s) => (
                <button key={s} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>
                  {s}
                </button>
              ))}
            </div>
            <label className="pattern-seam">
              <span>Margen de costura</span>
              <select value={seam} onChange={(e) => setSeam(Number(e.target.value))}>
                <option value={0}>Sin margen</option>
                <option value={0.7}>0,7 cm</option>
                <option value={1}>1 cm</option>
                <option value={1.5}>1,5 cm</option>
              </select>
            </label>
            <p className="muted small">
              Patrón base trazado con las medidas de la ficha técnica: la línea continua es el corte y la discontinua la costura. Revisa la primera muestra
              (la toile) antes de cortar la tela buena. Al imprimir, comprueba que el cuadrado de prueba mide 5 × 5 cm.
            </p>
          </div>

          {/* En pantalla: todas las piezas a escala */}
          <div className="pattern-grid no-print">
            {pieces.map((p) => (
              <div key={p.id} className="card pattern-card">
                <PieceSvg piece={p} seam={seam} box={[-PAD, -PAD, p.w + PAD * 2, p.h + PAD * 2]} width={`${Math.min(560, (p.w + PAD * 2) * 6)}px`} />
                <div className="pattern-meta">
                  <strong>{p.name}</strong>
                  <span>{p.cut}</span>
                  <span className="muted">
                    {r(p.w)} × {r(p.h)} cm
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Al imprimir: cada pieza a tamaño real, repartida en hojas A4 numeradas */}
          <div className="pattern-print">
            {pieces.flatMap((p, pi) => tiles(p).map((t, ti, all) => (
              <section key={`${p.id}-${ti}`} className="pattern-tile">
                <PieceSvg piece={p} seam={seam} box={[t.x, t.y, TILE_W, TILE_H]} width={`${TILE_W}cm`} height={`${TILE_H}cm`} />
                <div className="pattern-tile-label">
                  {design.name} · {label} · <strong>{p.name}</strong> · hoja {ti + 1} de {all.length} (fila {t.row + 1}, columna {t.col + 1})
                </div>
                {pi === 0 && ti === 0 && <div className="pattern-test">5 × 5 cm</div>}
              </section>
            )))}
          </div>
        </>
      )}
    </div>
  )
}

const r = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-ES')

/** Hojas en que se reparte una pieza (con 1 cm de solape para pegarlas). */
function tiles(p: PatternPiece) {
  const w = p.w + PAD * 2
  const h = p.h + PAD * 2
  const stepW = TILE_W - 1
  const stepH = TILE_H - 1
  const cols = Math.max(1, Math.ceil((w - 1) / stepW))
  const rows = Math.max(1, Math.ceil((h - 1) / stepH))
  const out: { x: number; y: number; row: number; col: number }[] = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) out.push({ x: -PAD + col * stepW, y: -PAD + row * stepH, row, col })
  return out
}

/** Una pieza en SVG (unidades en cm): corte, costura, hilo, doblez, piquetes y su nombre. */
function PieceSvg({ piece: p, seam, box, width, height }: { piece: PatternPiece; seam: number; box: [number, number, number, number]; width: string; height?: string }) {
  const [gx1, gy1, gx2, gy2] = p.grain
  const cx = p.w / 2
  const cy = p.h / 2
  const text = Math.max(0.9, Math.min(2.2, p.w / 12))
  return (
    <svg viewBox={box.join(' ')} width={width} height={height} className="pattern-svg" role="img" aria-label={p.name}>
      {/* Margen de costura: el trazo ancho deja la línea de corte por fuera, a `seam` cm */}
      {seam > 0 && (
        <>
          <path d={p.path} fill="none" stroke="#1d1c1a" strokeWidth={seam * 2 + 0.06} strokeLinejoin="round" />
          <path d={p.path} fill="none" stroke="#ffffff" strokeWidth={seam * 2 - 0.06} strokeLinejoin="round" />
        </>
      )}
      <path d={p.path} fill="#ffffff" stroke="#1d1c1a" strokeWidth={0.06} strokeDasharray={seam > 0 ? '0.5 0.3' : undefined} />
      {/* Línea de hilo con flechas */}
      <g stroke="#1d1c1a" strokeWidth={0.06} fill="#1d1c1a">
        <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} />
        <Arrow x={gx1} y={gy1} toX={gx2} toY={gy2} />
        <Arrow x={gx2} y={gy2} toX={gx1} toY={gy1} />
      </g>
      {p.fold && (
        <g>
          <line x1={p.fold[0]} y1={p.fold[1]} x2={p.fold[2]} y2={p.fold[3]} stroke="#2563eb" strokeWidth={0.12} strokeDasharray="1 0.4" />
          <text
            x={(p.fold[0] + p.fold[2]) / 2 + (p.fold[0] === p.fold[2] ? 0.7 : 0)}
            y={(p.fold[1] + p.fold[3]) / 2 - (p.fold[1] === p.fold[3] ? 0.5 : 0)}
            fontSize={0.9}
            fill="#2563eb"
            transform={p.fold[0] === p.fold[2] ? `rotate(90 ${p.fold[0] + 0.7} ${(p.fold[1] + p.fold[3]) / 2})` : undefined}
            textAnchor="middle"
          >
            DOBLEZ
          </text>
        </g>
      )}
      {(p.notches ?? []).map(([x, y], i) => (
        <line key={i} x1={x} y1={y} x2={x + (x <= 0.01 ? -1 : 1) * (seam || 0.6)} y2={y} stroke="#1d1c1a" strokeWidth={0.12} />
      ))}
      <g fontFamily="Inter, system-ui, sans-serif" fill="#1d1c1a" textAnchor="middle">
        <text x={cx} y={cy - text * 0.4} fontSize={text} fontWeight={700}>
          {p.name.toUpperCase()}
        </text>
        <text x={cx} y={cy + text * 0.9} fontSize={text * 0.6}>
          {p.cut}
        </text>
        {p.note && (
          <text x={cx} y={cy + text * 1.8} fontSize={text * 0.45} fill="#57534e">
            {p.note}
          </text>
        )}
      </g>
    </svg>
  )
}

function Arrow({ x, y, toX, toY }: { x: number; y: number; toX: number; toY: number }) {
  const a = Math.atan2(y - toY, x - toX)
  const s = 0.6
  const p1 = [x - Math.cos(a - 0.4) * s, y - Math.sin(a - 0.4) * s]
  const p2 = [x - Math.cos(a + 0.4) * s, y - Math.sin(a + 0.4) * s]
  return <path d={`M${x} ${y} L${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]} Z`} />
}
