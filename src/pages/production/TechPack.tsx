import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Status } from '../../components/ui'
import { Callouts, Dimensions } from '../../designer/annotations'
import { colorLabel } from '../../designer/colors'
import { activeColorwayId, colorwaysOf, withColorway } from '../../designer/colorways'
import { FlatView } from '../../designer/FlatView'
import { CX } from '../../designer/geometry'
import { resolveMaterial } from '../../designer/materials'
import { printSize, UNITS_PER_CM } from '../../designer/prints'
import { getTemplate } from '../../designer/templates'
import { VIEWS, type GarmentTemplate } from '../../designer/types'
import { defaultAssembly, defaultConstruction } from '../../production/construction'
import { clientBody, garmentPoms, measurementLabel, standardBody } from '../../production/measurements'
import { TECHNIQUES, type Artwork } from '../../shared/artworks'
import type { Client } from '../../shared/clients'
import type { Design, PieceStyle, Print } from '../../shared/designs'
import { fileUrl, MATERIAL_CATEGORIES, type Material } from '../../shared/library'
import { EMPTY_TECH_PACK, SIZES, type ConstructionRow, type Size, type SpecColumn, type TechPack, type TechPackData } from '../../shared/production'
import type { Project } from '../../shared/projects'
import { displayName } from '../../shared/users'
import './production.css'

interface Loaded {
  project: Project
  designs: Design[]
  client: Client | null
  materials: Map<string, Material>
  artworks: Map<string, Artwork>
}

const PACKAGING = 'Planchar del revés a temperatura media. Doblar con papel de seda y meter en bolsa individual con la talla visible.'

/** Ficha técnica (tech pack) de un proyecto: /produccion/ficha/:id. Se edita en pantalla y se imprime o guarda como PDF. */
export function TechPackPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [saved, setSaved] = useState<TechPack | null>(null)
  const [pack, setPack] = useState<TechPackData>(EMPTY_TECH_PACK)
  const [designId, setDesignId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [project, designs, tp, materials, artworks] = await Promise.all([
        api.getProject(id),
        api.listDesigns(id),
        api.getTechPack(id),
        api.listMaterials(),
        api.listArtworks(),
      ])
      const client = project.clientId ? await api.getClient(project.clientId) : null
      if (!alive) return
      const mats = new Map(materials.map((m) => [m.id, m]))
      setLoaded({ project, designs, client, materials: mats, artworks: new Map(artworks.map((a) => [a.id, a])) })
      setSaved(tp)
      const design = designs.find((d) => d.id === tp?.designId) ?? designs[0]
      setDesignId(design?.id ?? null)
      setPack(
        tp?.data ?? {
          ...EMPTY_TECH_PACK,
          mode: client ? 'cliente' : 'tallas',
          labels: design ? defaultLabels(design, mats) : '',
          packaging: PACKAGING,
        },
      )
    })().catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id])

  const update = (p: Partial<TechPackData>) => {
    setPack((x) => ({ ...x, ...p }))
    setDirty(true)
  }

  const save = async () => {
    if (!loaded || !designId) return
    setSaving(true)
    setError(null)
    try {
      const tp = await api.saveTechPack(id, { designId, data: pack })
      setSaved(tp)
      setPack(tp.data)
      setDirty(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="page"><Status loading={!error} error={error} /></div>

  const { project, designs, client } = loaded
  const design = designs.find((d) => d.id === designId)
  const template = design ? getTemplate(design.template) : undefined

  return (
    <div className="page techpack-page">
      <div className="techpack-bar no-print">
        <div>
          <h1>Ficha técnica</h1>
          <p className="page-subtitle">
            {project.name}
            {saved ? ` · versión ${saved.version} guardada el ${new Date(saved.updatedAt).toLocaleDateString('es-ES')}` : ' · sin guardar todavía'}
          </p>
        </div>
        <div className="page-actions">
          <Link to={`/proyectos/${id}`} className="button">
            Volver al proyecto
          </Link>
          <button className="button" onClick={() => window.print()} disabled={!template}>
            Imprimir / PDF
          </button>
          <button className="button primary" onClick={save} disabled={saving || !template || (!dirty && !!saved)}>
            {saving ? 'Guardando…' : saved ? 'Guardar nueva versión' : 'Guardar ficha'}
          </button>
        </div>
      </div>
      {error && <p className="status error no-print">{error}</p>}

      {!design || !template ? (
        <div className="card empty no-print">
          <p>Este proyecto aún no tiene ningún diseño. La ficha se genera a partir del diseño de la prenda.</p>
          <Link to={`/disenador/nuevo?proyecto=${id}${project.clientId ? `&cliente=${project.clientId}` : ''}`} className="button primary">
            Crear el diseño
          </Link>
        </div>
      ) : (
        <>
          <Settings
            pack={pack}
            update={update}
            designs={designs}
            designId={design.id}
            onDesign={(d) => {
              setDesignId(d)
              setDirty(true)
            }}
            hasClient={!!client}
            dirty={dirty}
          />
          <Document
            loaded={loaded}
            design={design}
            template={template}
            pack={pack}
            update={update}
            version={saved?.version}
            brand={user ? displayName(user) : 'FreeDesign'}
          />
        </>
      )}
    </div>
  )
}

function Settings(props: {
  pack: TechPackData
  update: (p: Partial<TechPackData>) => void
  designs: Design[]
  designId: string
  onDesign: (id: string) => void
  hasClient: boolean
  dirty: boolean
}) {
  const { pack, update, designs, designId, onDesign, hasClient, dirty } = props
  const toggleSize = (s: Size) => {
    const sizes = pack.sizes.includes(s) ? pack.sizes.filter((x) => x !== s) : SIZES.filter((x) => x === s || pack.sizes.includes(x))
    if (sizes.length) update({ sizes, baseSize: sizes.includes(pack.baseSize) ? pack.baseSize : sizes[Math.floor(sizes.length / 2)] })
  }
  return (
    <section className="card techpack-settings no-print">
      <label className="field">
        <span>Diseño</span>
        <select value={designId} onChange={(e) => onDesign(e.target.value)}>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Medidas</span>
        <div className="segmented">
          <button
            className={pack.mode === 'cliente' ? 'active' : ''}
            disabled={!hasClient}
            title={hasClient ? '' : 'El proyecto no tiene cliente'}
            onClick={() => update({ mode: 'cliente' })}
          >
            A medida del cliente
          </button>
          <button className={pack.mode === 'tallas' ? 'active' : ''} onClick={() => update({ mode: 'tallas' })}>
            Tabla de tallas
          </button>
        </div>
      </div>
      {pack.mode === 'tallas' && (
        <>
          <div className="field">
            <span>Tallas</span>
            <div className="chips">
              {SIZES.map((s) => (
                <button key={s} className={pack.sizes.includes(s) ? 'chip active' : 'chip'} onClick={() => toggleSize(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Talla de muestra</span>
            <select value={pack.baseSize} onChange={(e) => update({ baseSize: e.target.value as Size })}>
              {pack.sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <p className="muted small techpack-hint">
        Los dibujos, materiales y estampados salen del diseño. Las medidas, la confección y el montaje se calculan solos y puedes retocarlos aquí
        mismo. {dirty && <strong>Hay cambios sin guardar.</strong>}
      </p>
    </section>
  )
}

function Document(props: {
  loaded: Loaded
  design: Design
  template: GarmentTemplate
  pack: TechPackData
  update: (p: Partial<TechPackData>) => void
  version?: number
  brand: string
}) {
  const { loaded, design, template, pack, update, version, brand } = props
  const { project, client, materials, artworks } = loaded
  const options = design.data.options
  const prints = design.data.prints ?? []
  const sheets = 4
  const custom = pack.mode === 'cliente' && client
  const body = custom ? clientBody(client.measurements).body : standardBody(pack.baseSize)
  const bodyLabel = custom ? `la medida de ${client.name}` : `la talla ${pack.baseSize}`
  const colorways = colorwaysOf(design.data)
  const head = (title: string, page: number) => (
    <SheetHeader brand={brand} project={project} design={design} template={template} title={title} page={page} pages={sheets} version={version} />
  )

  return (
    <div className="techpack">
      {/* 1. Dibujo técnico */}
      <article className="sheet">
        {head('Dibujo técnico', 1)}
        <div className="sheet-flats">
          {VIEWS.map((v) => (
            <figure key={v.id} className={v.id === 'side' ? 'flat side' : 'flat'}>
              <FlatView
                template={template}
                data={design.data}
                view={v.id}
                materials={materials}
                frame="comun"
                overlay={(ctx) => (
                  <>
                    {v.id === 'front' && <Dimensions ctx={ctx} template={template} options={options} body={body} />}
                    <Callouts ctx={ctx} callouts={design.data.callouts ?? []} view={v.id} />
                  </>
                )}
              />
              <figcaption>{v.label}</figcaption>
            </figure>
          ))}
        </div>
        <p className="muted small">Las letras de las cotas corresponden a la tabla de medidas (hoja 3); valores de {bodyLabel}.</p>
        <div className="sheet-cols">
          <section>
            <h3>Prenda</h3>
            <dl className="spec-list">
              <dt>Prenda base</dt>
              <dd>{template.name}</dd>
              {template.options.map((o) => (
                <Row key={o.id} label={o.label}>
                  {o.type === 'toggle'
                    ? (options[o.id] ?? o.default) ? 'Sí' : 'No'
                    : o.choices.find((c) => c.id === (options[o.id] ?? o.default))?.label}
                </Row>
              ))}
            </dl>
          </section>
          <section>
            <h3>Pedido</h3>
            <dl className="spec-list">
              <Row label="Cliente">{client?.name ?? '—'}</Row>
              <Row label="Colección">{project.collectionName ?? '—'}</Row>
              <Row label="Entrega">{project.dueDate ? new Date(`${project.dueDate}T00:00:00`).toLocaleDateString('es-ES') : '—'}</Row>
              <Row label="Medidas">{pack.mode === 'cliente' ? 'A medida del cliente' : `Tallas ${pack.sizes.join(', ')} · muestra en ${pack.baseSize}`}</Row>
            </dl>
            {(design.data.notes || project.description) && (
              <>
                <h3>Notas del diseño</h3>
                <p className="pre">{[project.description, design.data.notes].filter(Boolean).join('\n\n')}</p>
              </>
            )}
          </section>
        </div>
      </article>

      {/* 2. Materiales y estampados */}
      <article className="sheet">
        {head('Materiales, colores y estampados', 2)}
        <h3>Piezas{colorways.length > 1 ? ` · variante ${colorways.find((c) => c.id === activeColorwayId(design.data))?.name}` : ''}</h3>
        <PiecesTable template={template} design={design} materials={materials} />
        {colorways.length > 1 && <ColorwaysTable template={template} design={design} />}
        {project.materials.length > 0 && (
          <>
            <h3>Lista de materiales (BOM)</h3>
            <table className="spec-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th>Proveedor</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {project.materials.map((pm) => {
                  const m = materials.get(pm.materialId)
                  return (
                    <tr key={pm.id}>
                      <td>
                        {pm.name}
                        {m?.reference && <span className="muted"> · ref. {m.reference}</span>}
                      </td>
                      <td>{MATERIAL_CATEGORIES.find((c) => c.id === pm.category)?.single ?? pm.category}</td>
                      <td className="num">
                        {pm.quantity.toLocaleString('es-ES')} {pm.priceUnit}
                      </td>
                      <td>{m?.supplierName ?? '—'}</td>
                      <td>{pm.notes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
        <h3>Estampados y logos</h3>
        {prints.length === 0 ? (
          <p className="muted">Sin estampados.</p>
        ) : (
          <PrintsTable template={template} prints={prints} artworks={artworks} />
        )}
      </article>

      {/* 3. Medidas */}
      <article className="sheet">
        {head('Tabla de medidas', 3)}
        <MeasureTable template={template} design={design} client={client} pack={pack} update={update} />
      </article>

      {/* 4. Confección */}
      <article className="sheet">
        {head('Confección y acabados', 4)}
        <ConstructionTable
          rows={pack.construction ?? defaultConstruction(template, options)}
          custom={!!pack.construction}
          onChange={(construction) => update({ construction })}
        />
        <div className="sheet-cols">
          <section>
            <Assembly
              steps={pack.assembly ?? defaultAssembly(template, options, prints.length > 0)}
              custom={!!pack.assembly}
              onChange={(assembly) => update({ assembly })}
            />
          </section>
          <section>
            <h3>Etiquetas</h3>
            <Editable multiline value={pack.labels} onChange={(labels) => update({ labels })} placeholder="Etiqueta de marca, talla, composición y cuidados…" />
            <h3>Planchado y embalaje</h3>
            <Editable multiline value={pack.packaging} onChange={(packaging) => update({ packaging })} />
            <h3>Notas para el taller</h3>
            <Editable multiline value={pack.notes} onChange={(notes) => update({ notes })} placeholder="Indicaciones especiales, dudas, cambios respecto a la muestra…" />
          </section>
        </div>
      </article>
    </div>
  )
}

function SheetHeader(props: {
  brand: string
  project: Project
  design: Design
  template: GarmentTemplate
  title: string
  page: number
  pages: number
  version?: number
}) {
  const { brand, project, design, template, title, page, pages, version } = props
  return (
    <header className="sheet-header">
      <div>
        <span className="sheet-brand">{brand}</span>
        <h2>{title}</h2>
      </div>
      <dl>
        <Row label="Proyecto">{project.name}</Row>
        <Row label="Prenda">
          {design.name} · {template.name}
        </Row>
        <Row label="Ref.">FD-{project.id.slice(0, 6).toUpperCase()}</Row>
        <Row label="Versión">{version ? `v${version}` : 'Borrador'}</Row>
        <Row label="Fecha">{new Date().toLocaleDateString('es-ES')}</Row>
        <Row label="Hoja">
          {page} / {pages}
        </Row>
      </dl>
    </header>
  )
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </>
)

function PiecesTable({ template, design, materials }: { template: GarmentTemplate; design: Design; materials: Map<string, Material> }) {
  const active = template.activePieces(design.data.options)
  return (
    <table className="spec-table">
      <thead>
        <tr>
          <th>Pieza</th>
          <th>Material</th>
          <th>Composición</th>
          <th>Gramaje</th>
          <th>Color</th>
          <th>Proveedor</th>
        </tr>
      </thead>
      <tbody>
        {template.pieces
          .filter((p) => active.includes(p.id))
          .map((p) => {
            const style = design.data.pieces[p.id]
            const r = resolveMaterial(template.id, p.id, style?.materialId, materials)
            const lib = r.library
            const color = style?.color ?? p.defaultColor
            return (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>
                  {lib ? lib.name : r.catalog.name}
                  {lib?.reference && <span className="muted"> · ref. {lib.reference}</span>}
                  {!r.chosen && <span className="muted"> (por defecto)</span>}
                </td>
                <td>{lib?.composition || r.catalog.composition}</td>
                <td>{lib?.weightGsm ? `${lib.weightGsm} g/m²` : r.catalog.weight}</td>
                <td>
                  <ColorCell style={style ?? { color, materialId: null }} />
                </td>
                <td>{lib?.supplierName ?? '—'}</td>
              </tr>
            )
          })}
      </tbody>
    </table>
  )
}

/** Color con su muestra, nombre y código (o el hex si no tiene nombre). */
function ColorCell({ style }: { style: PieceStyle }) {
  const l = colorLabel(style)
  return (
    <span className="color-cell">
      <span className="color-chip" style={{ background: style.color }} />
      <span>
        {l.name || style.color.toUpperCase()}
        {l.name && <span className="muted"> · {[l.code, style.color.toUpperCase()].filter(Boolean).join(' · ')}</span>}
        {!l.name && l.code && <span className="muted"> · {l.code}</span>}
      </span>
    </span>
  )
}

/** Variantes de color: cada pieza en cada variante, con la vista delantera de cada una. */
function ColorwaysTable({ template, design }: { template: GarmentTemplate; design: Design }) {
  const list = colorwaysOf(design.data)
  const active = template.activePieces(design.data.options)
  const pieces = template.pieces.filter((p) => active.includes(p.id))
  return (
    <>
      <h3>Variantes de color</h3>
      <div className="colorway-flats">
        {list.map((c) => (
          <figure key={c.id}>
            <FlatView template={template} data={withColorway(design.data, c)} view="front" frame="comun" />
            <figcaption>{c.name}</figcaption>
          </figure>
        ))}
      </div>
      <table className="spec-table">
        <thead>
          <tr>
            <th>Pieza</th>
            {list.map((c) => (
              <th key={c.id}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pieces.map((p) => (
            <tr key={p.id}>
              <td>{p.label}</td>
              {list.map((c) => (
                <td key={c.id}>
                  <ColorCell style={c.pieces[p.id] ?? { color: p.defaultColor, materialId: null }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function PrintsTable({ template, prints, artworks }: { template: GarmentTemplate; prints: Print[]; artworks: Map<string, Artwork> }) {
  const cm = (u: number) => (Math.round((u / UNITS_PER_CM) * 2) / 2).toLocaleString('es-ES')
  return (
    <table className="spec-table">
      <thead>
        <tr>
          <th></th>
          <th>Estampado</th>
          <th>Vista</th>
          <th>Posición</th>
          <th>Tamaño</th>
          <th>Técnica</th>
        </tr>
      </thead>
      <tbody>
        {prints.map((p) => {
          const { w, h } = printSize(p)
          const zones = template.printZones[p.view] ?? []
          const zone = [...zones].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
          const dx = (p.x - CX) / UNITS_PER_CM
          return (
            <tr key={p.id}>
              <td className="print-cell">
                {p.kind === 'artwork' ? (
                  <img src={fileUrl(p.file)} alt="" />
                ) : (
                  <span style={{ fontFamily: p.font, color: p.color, fontWeight: p.bold ? 700 : 400 }}>Aa</span>
                )}
              </td>
              <td>{p.kind === 'artwork' ? (artworks.get(p.artworkId ?? '')?.name ?? 'Gráfico') : `Texto «${p.text}» (${p.color.toUpperCase()})`}</td>
              <td>{VIEWS.find((v) => v.id === p.view)?.label}</td>
              <td>
                {zone ? (Math.hypot(zone.x - p.x, zone.y - p.y) < 8 ? zone.label : `Cerca de: ${zone.label}`) : '—'}
                {Math.abs(dx) >= 1 && (
                  <span className="muted">
                    {' '}
                    · {Math.abs(Math.round(dx))} cm a la {dx > 0 ? 'derecha' : 'izquierda'} del centro (según el dibujo)
                  </span>
                )}
                {p.rotation ? <span className="muted"> · girado {Math.round(p.rotation)}°</span> : null}
              </td>
              <td>
                {cm(w)} × {cm(h)} cm
              </td>
              <td>{TECHNIQUES.find((t) => t.id === p.technique)?.label ?? p.technique}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MeasureTable(props: { template: GarmentTemplate; design: Design; client: Client | null; pack: TechPackData; update: (p: Partial<TechPackData>) => void }) {
  const { template, design, client, pack, update } = props
  const poms = garmentPoms(template, design.data.options)
  const custom = pack.mode === 'cliente' && client
  const fromClient = useMemo(() => (client ? clientBody(client.measurements) : null), [client])
  const columns: SpecColumn[] = custom ? ['cliente'] : pack.sizes
  const bodyOf = (c: SpecColumn) => (c === 'cliente' && fromClient ? fromClient.body : standardBody(c === 'cliente' ? 'M' : c))
  const missing = custom && fromClient ? fromClient.missing.filter((k) => poms.some((p) => p.uses.includes(k))) : []

  const set = (col: SpecColumn, pom: string, raw: string, computed: number) => {
    const row = { ...(pack.overrides[col] ?? {}) }
    const n = Number(raw.replace(',', '.'))
    if (raw === '' || !Number.isFinite(n) || n === computed) delete row[pom]
    else row[pom] = n
    update({ overrides: { ...pack.overrides, [col]: row } })
  }

  return (
    <>
      <p className="muted small">
        Medidas de la prenda acabada, en cm, tomadas en plano. {custom ? `A medida de ${client.name}` : 'Tallaje estándar unisex'}; holgura según el corte
        elegido. Las celdas en negrita se han retocado a mano.
      </p>
      {missing.length > 0 && (
        <p className="status error small no-print">
          Al cliente le faltan medidas ({missing.map(measurementLabel).join(', ').toLowerCase()}): se han tomado de la talla {fromClient?.size} estándar.
          Añádelas en su ficha para afinar.
        </p>
      )}
      <table className="spec-table measure-table">
        <thead>
          <tr>
            <th></th>
            <th>Punto de medida</th>
            <th>Cómo se mide</th>
            {columns.map((c) => (
              <th key={c} className={`num${c === pack.baseSize && !custom ? ' base' : ''}`}>
                {c === 'cliente' ? 'A medida' : c}
              </th>
            ))}
            <th className="num">Tol. ±</th>
          </tr>
        </thead>
        <tbody>
          {poms.map((p, i) => (
            <tr key={p.id}>
              <td className="pom-letter">{String.fromCharCode(65 + i)}</td>
              <td>{p.label}</td>
              <td className="muted small">{p.how}</td>
              {columns.map((c) => {
                const computed = p.value(bodyOf(c))
                const override = pack.overrides[c]?.[p.id]
                const value = override ?? computed
                return (
                  <td key={c} className={`num${override !== undefined ? ' edited' : ''}${c === pack.baseSize && !custom ? ' base' : ''}`}>
                    <input
                      className="cell-input no-print"
                      type="number"
                      step={0.5}
                      value={value}
                      onChange={(e) => set(c, p.id, e.target.value, computed)}
                      title={override !== undefined ? `Calculado: ${computed}` : undefined}
                    />
                    <span className="print-only">{value.toLocaleString('es-ES')}</span>
                  </td>
                )
              })}
              <td className="num">{p.tol.toLocaleString('es-ES')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {custom && fromClient && (
        <>
          <h3>Medidas del cuerpo usadas</h3>
          <p className="small pre">
            {[...new Set(poms.flatMap((p) => p.uses))]
              .map((k) => `${measurementLabel(k)}: ${fromClient.body[k].toLocaleString('es-ES')} cm${fromClient.missing.includes(k) ? ` (talla ${fromClient.size})` : ''}`)
              .join(' · ')}
            {client.measuredAt && `\nTomadas el ${new Date(`${client.measuredAt}T00:00:00`).toLocaleDateString('es-ES')}`}
          </p>
        </>
      )}
    </>
  )
}

function ConstructionTable({ rows, custom, onChange }: { rows: ConstructionRow[]; custom: boolean; onChange: (r: ConstructionRow[] | null) => void }) {
  const set = (i: number, field: keyof ConstructionRow, value: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  return (
    <>
      <div className="sheet-title-row">
        <h3>Costuras y operaciones</h3>
        {custom && (
          <button className="link-button no-print" onClick={() => onChange(null)}>
            Volver a las de la prenda
          </button>
        )}
      </div>
      <table className="spec-table construction-table">
        <thead>
          <tr>
            <th>Zona</th>
            <th>Operación</th>
            <th>Máquina / puntada</th>
            <th>Notas</th>
            <th className="no-print"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              {(['area', 'operation', 'machine', 'notes'] as const).map((f) => (
                <td key={f}>
                  <Editable value={r[f]} onChange={(v) => set(i, f, v)} />
                </td>
              ))}
              <td className="no-print">
                <button className="icon-button" aria-label="Quitar fila" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="button small-button no-print"
        onClick={() => onChange([...rows, { id: `c${Date.now()}`, area: '', operation: '', machine: '', notes: '' }])}
      >
        Añadir operación
      </button>
    </>
  )
}

function Assembly({ steps, custom, onChange }: { steps: string[]; custom: boolean; onChange: (s: string[] | null) => void }) {
  return (
    <>
      <div className="sheet-title-row">
        <h3>Orden de montaje</h3>
        {custom && (
          <button className="link-button no-print" onClick={() => onChange(null)}>
            Volver al de la prenda
          </button>
        )}
      </div>
      <ol className="assembly">
        {steps.map((s, i) => (
          <li key={i}>
            <Editable value={s} onChange={(v) => onChange(steps.map((x, j) => (j === i ? v : x)))} />
            <button className="icon-button no-print" aria-label="Quitar paso" onClick={() => onChange(steps.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ol>
      <button className="button small-button no-print" onClick={() => onChange([...steps, ''])}>
        Añadir paso
      </button>
    </>
  )
}

/** Texto editable en pantalla que al imprimir se ve como texto normal (los campos no se imprimen bien). */
function Editable({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <>
      <textarea
        className={multiline ? 'cell-input grow boxed no-print' : 'cell-input grow no-print'}
        rows={multiline ? 3 : 1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="print-only pre">{value || '—'}</span>
    </>
  )
}

/** Texto de etiquetas por defecto, con la composición del material del cuerpo. */
function defaultLabels(design: Design, materials: Map<string, Material>) {
  const t = getTemplate(design.template)
  const main = t?.pieces[0]
  if (!t || !main) return ''
  const r = resolveMaterial(t.id, main.id, design.data.pieces[main.id]?.materialId, materials)
  const composition = r.library?.composition || r.catalog.composition
  return `Marca y talla: ${t.id === 'pantalon' ? 'centro de la cinturilla trasera' : 'nuca'}.\nComposición: ${composition}.\nCuidados: lavar a 30 °C del revés, no usar secadora, planchar a temperatura media.`
}
