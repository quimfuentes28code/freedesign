import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { PageHeader, Status } from '../../components/ui'
import { colorwaysOf, withColorway } from '../../designer/colorways'
import { colorLabel } from '../../designer/colors'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import type { Design } from '../../shared/designs'
import { fileUrl } from '../../shared/library'
import { displayName } from '../../shared/users'
import { DesignThumb } from '../designer/DesignThumb'
import './presentation.css'

/** Qué sale en la presentación (se recuerda por proyecto en este navegador). */
interface Choice {
  title: string
  subtitle: string
  notes: string
  cover: boolean
  moodboard: boolean
  materials: boolean
  /** Diseños que no salen */
  hiddenDesigns: string[]
  /** Fotos que no salen en el moodboard */
  hiddenFiles: string[]
}

const KEY = (id: string) => `fd:presentacion:${id}`

function stored(id: string): Partial<Choice> {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? '{}') as Partial<Choice>
  } catch {
    return {}
  }
}

/**
 * Presentación de un proyecto (`/proyectos/:id/presentacion`): hojas A4 apaisadas para enseñar al cliente, que se
 * imprimen o se guardan como PDF. Portada, moodboard (fotos y referencias del proyecto, paleta de colores de sus
 * diseños, telas y notas), una hoja por diseño (lo pintado en el lienzo, delantero y espalda, colores y variantes) y
 * los materiales. A la izquierda se elige qué sale.
 */
export function ProjectPresentation() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const project = useApi(() => api.getProject(id), [id])
  const designs = useApi(() => api.listDesigns(id), [id])
  const [choice, setChoice] = useState<Choice | null>(null)

  // Valores de partida cuando llega el proyecto (con lo que se eligiera la última vez)
  useEffect(() => {
    const p = project.data
    if (!p || choice) return
    setChoice({
      title: p.name,
      subtitle: [p.clientName, p.collectionName].filter(Boolean).join(' · '),
      notes: p.description,
      cover: true,
      moodboard: true,
      materials: p.materials.length > 0,
      hiddenDesigns: [],
      hiddenFiles: [],
      ...stored(id),
    })
  }, [project.data, choice, id])

  useEffect(() => {
    if (!choice) return
    try {
      localStorage.setItem(KEY(id), JSON.stringify(choice))
    } catch {
      // Sin almacenamiento: solo mientras la página está abierta
    }
  }, [choice, id])

  const p = project.data
  const all = useMemo(() => (designs.data ?? []).filter((d) => getTemplate(d.template)), [designs.data])
  if (!p || !choice) return <div className="page">{project.error ? <Status error={project.error} /> : <Status loading />}</div>

  const set = (patch: Partial<Choice>) => setChoice({ ...choice, ...patch })
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const shown = all.filter((d) => !choice.hiddenDesigns.includes(d.id))
  const images = p.files.filter((f) => f.category !== 'otro' && /\.(jpe?g|png|webp|gif|svg)$/i.test(f.file))
  const moodImages = images.filter((f) => !choice.hiddenFiles.includes(f.id))
  const palette = paletteOf(shown)
  const brand = user ? displayName(user) : ''
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const hero = images.find((f) => f.category === 'final') ?? null

  const sheets = [
    choice.cover && 'cover',
    choice.moodboard && 'mood',
    ...shown.map((d) => `d:${d.id}`),
    choice.materials && p.materials.length > 0 && 'materials',
  ].filter(Boolean) as string[]
  const pageOf = (s: string) => sheets.indexOf(s) + 1

  return (
    <div className="page presentation-page">
      <div className="no-print">
        <PageHeader
          title="Presentación"
          subtitle={p.name}
          actions={
            <>
              <Link to={`/proyectos/${p.id}`} className="button">
                Volver al proyecto
              </Link>
              <button className="button primary" onClick={() => window.print()} disabled={!sheets.length}>
                Imprimir o guardar PDF
              </button>
            </>
          }
        />
      </div>

      <div className="presentation-layout">
        <aside className="card presentation-controls no-print">
          <h2>Textos</h2>
          <label className="field">
            <span>Título</span>
            <input value={choice.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Subtítulo</span>
            <input value={choice.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Cliente, colección, temporada…" />
          </label>
          <label className="field">
            <span>Notas del moodboard</span>
            <textarea rows={4} value={choice.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="La idea, el ambiente, para quién es…" />
          </label>

          <h2>Hojas</h2>
          <label className="check">
            <input type="checkbox" checked={choice.cover} onChange={(e) => set({ cover: e.target.checked })} /> Portada
          </label>
          <label className="check">
            <input type="checkbox" checked={choice.moodboard} onChange={(e) => set({ moodboard: e.target.checked })} /> Moodboard
          </label>
          {all.map((d) => (
            <label key={d.id} className="check">
              <input type="checkbox" checked={!choice.hiddenDesigns.includes(d.id)} onChange={() => set({ hiddenDesigns: toggle(choice.hiddenDesigns, d.id) })} /> {d.name}
            </label>
          ))}
          {p.materials.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={choice.materials} onChange={(e) => set({ materials: e.target.checked })} /> Materiales
            </label>
          )}
          {!all.length && <p className="muted small">Este proyecto aún no tiene diseños.</p>}

          {choice.moodboard && (
            <>
              <h2>Fotos del moodboard</h2>
              {images.length ? (
                <div className="presentation-pick">
                  {images.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={choice.hiddenFiles.includes(f.id) ? 'off' : ''}
                      onClick={() => set({ hiddenFiles: toggle(choice.hiddenFiles, f.id) })}
                      title={choice.hiddenFiles.includes(f.id) ? 'No sale: toca para ponerla' : 'Sale: toca para quitarla'}
                    >
                      <img src={fileUrl(f.file)} alt={f.name} loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted small">Sube bocetos, referencias o fotos en la ficha del proyecto («Archivos») y saldrán aquí.</p>
              )}
            </>
          )}
          <p className="muted small">Se imprime en A4 apaisado. En el diálogo de imprimir, elige «Guardar como PDF».</p>
        </aside>

        <div className="presentation-sheets">
          {choice.cover && (
            <article className="pres-sheet pres-cover">
              <div className="pres-cover-text">
                <span className="pres-kicker">{brand}</span>
                <h1>{choice.title}</h1>
                {choice.subtitle && <p className="pres-sub">{choice.subtitle}</p>}
                <span className="pres-date">{date}</span>
              </div>
              <div className="pres-cover-art">
                {hero ? <img src={fileUrl(hero.file)} alt="" /> : shown[0] ? <DesignThumb design={shown[0]} /> : null}
              </div>
              <Foot brand={brand} title={choice.title} page={pageOf('cover')} pages={sheets.length} />
            </article>
          )}

          {choice.moodboard && (
            <article className="pres-sheet pres-mood">
              <h2 className="pres-title">Moodboard</h2>
              <div className="pres-mood-body">
                <div className={`pres-collage n${Math.min(moodImages.length, 6)}`}>
                  {moodImages.slice(0, 6).map((f) => (
                    <img key={f.id} src={fileUrl(f.file)} alt={f.name} />
                  ))}
                  {!moodImages.length && <p className="pres-empty">Sin fotos: añádelas en «Archivos» del proyecto.</p>}
                </div>
                <div className="pres-mood-side">
                  {choice.notes && <p className="pres-notes">{choice.notes}</p>}
                  {palette.length > 0 && (
                    <>
                      <h3>Paleta</h3>
                      <ul className="pres-palette">
                        {palette.slice(0, 10).map((c) => (
                          <li key={c.hex}>
                            <span style={{ background: c.hex }} />
                            <strong>{c.name || c.hex.toUpperCase()}</strong>
                            {c.code && <em>{c.code}</em>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {p.materials.some((m) => m.photo) && (
                    <>
                      <h3>Tejidos</h3>
                      <div className="pres-swatches">
                        {p.materials
                          .filter((m) => m.photo)
                          .slice(0, 4)
                          .map((m) => (
                            <figure key={m.id}>
                              <img src={fileUrl(m.photo)} alt="" />
                              <figcaption>{m.name}</figcaption>
                            </figure>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <Foot brand={brand} title={choice.title} page={pageOf('mood')} pages={sheets.length} />
            </article>
          )}

          {shown.map((d) => (
            <DesignSheet key={d.id} design={d} brand={brand} title={choice.title} page={pageOf(`d:${d.id}`)} pages={sheets.length} />
          ))}

          {choice.materials && p.materials.length > 0 && (
            <article className="pres-sheet pres-materials">
              <h2 className="pres-title">Materiales</h2>
              <div className="pres-material-grid">
                {p.materials.map((m) => (
                  <figure key={m.id}>
                    <div className="pres-material-img">{m.photo ? <img src={fileUrl(m.photo)} alt="" /> : <span>{m.name.charAt(0)}</span>}</div>
                    <figcaption>
                      <strong>{m.name}</strong>
                      {m.notes && <span>{m.notes}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <Foot brand={brand} title={choice.title} page={pageOf('materials')} pages={sheets.length} />
            </article>
          )}

          {!sheets.length && <p className="muted no-print">Elige al menos una hoja.</p>}
        </div>
      </div>
    </div>
  )
}

/** Hoja de un diseño: lo pintado en el lienzo, delantero y espalda, colores y, si tiene, sus variantes. */
function DesignSheet({ design, brand, title, page, pages }: { design: Design; brand: string; title: string; page: number; pages: number }) {
  const t = getTemplate(design.template)!
  const ways = colorwaysOf(design.data)
  const pieces = t.pieces.filter((p) => t.activePieces(design.data.options).includes(p.id))
  const colors = pieces.map((p) => ({ label: p.label, style: design.data.pieces[p.id] ?? { color: p.defaultColor } }))
  return (
    <article className="pres-sheet pres-design">
      <h2 className="pres-title">{design.name}</h2>
      <div className="pres-design-body">
        {design.data.thumb && (
          <div className="pres-canvas">
            <img src={fileUrl(design.data.thumb)} alt="" />
          </div>
        )}
        <div className="pres-flats">
          <FlatView template={t} data={design.data} view="front" frame="comun" />
          <FlatView template={t} data={design.data} view="back" frame="comun" />
        </div>
        <ul className="pres-colors">
          {colors.map((c) => {
            const l = colorLabel(c.style)
            return (
              <li key={c.label}>
                <span style={{ background: c.style.color }} />
                <strong>{c.label}</strong>
                <em>
                  {l.name || c.style.color.toUpperCase()}
                  {l.code ? ` · ${l.code}` : ''}
                </em>
              </li>
            )
          })}
        </ul>
      </div>
      {ways.length > 1 && (
        <div className="pres-ways">
          {ways.map((c) => (
            <figure key={c.id}>
              <FlatView template={t} data={withColorway(design.data, c)} view="front" frame="comun" />
              <figcaption>{c.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <Foot brand={brand} title={title} page={page} pages={pages} />
    </article>
  )
}

function Foot({ brand, title, page, pages }: { brand: string; title: string; page: number; pages: number }) {
  return (
    <footer className="pres-foot">
      <span>{[brand, title].filter(Boolean).join(' · ')}</span>
      <span>
        {page} / {pages}
      </span>
    </footer>
  )
}

/** Colores de los diseños (de sus piezas y variantes), sin repetir, los más usados primero. */
function paletteOf(designs: Design[]) {
  const count = new Map<string, { hex: string; name: string; code: string; n: number }>()
  for (const d of designs) {
    const t = getTemplate(d.template)
    if (!t) continue
    const active = t.activePieces(d.data.options)
    for (const c of colorwaysOf(d.data)) {
      for (const p of t.pieces) {
        if (!active.includes(p.id)) continue
        const s = c.pieces[p.id] ?? { color: p.defaultColor }
        const hex = s.color.toLowerCase()
        const l = colorLabel(s)
        const cur = count.get(hex)
        if (cur) cur.n++
        else count.set(hex, { hex, name: l.name, code: l.code, n: 1 })
      }
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n)
}
