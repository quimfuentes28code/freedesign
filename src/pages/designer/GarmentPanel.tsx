import { deleteWithUndo } from '../../components/undo'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field } from '../../components/ui'
import { colorLabel } from '../../designer/colors'
import { resolveMaterial } from '../../designer/materials'
import { OPTION_GROUPS, opt, type GarmentTemplate } from '../../designer/types'
import type { Body } from '../../production/measurements'
import type { Client } from '../../shared/clients'
import { GENDERS, genderOf, type DesignData, type DesignInput, type PieceStyle } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { ExportMenu } from './ExportMenu'
import { MeasuresPanel } from './MeasuresPanel'
import { PieceInspector } from './PieceInspector'

interface Props {
  id: string | null
  design: DesignInput
  template: GarmentTemplate
  materials: Map<string, Material>
  library: Material[]
  clients: Client[]
  body: Body
  bodyLabel: string
  onChange: (d: DesignInput) => void
  onClose: () => void
  onDeleted: () => void
}

/**
 * «Prenda», dentro del lienzo: lo que no se pinta. Las piezas (color, material, superficie, forma de los bolsillos,
 * bloques de color), el modelo (cuello, mangas, largo…), las medidas y los datos del diseño (cliente, proyecto, notas).
 * Es lo que usan el 3D, la ficha técnica y el patrón.
 */
export function GarmentPanel(props: Props) {
  const { design, template, materials, onChange } = props
  const projects = useApi(() => api.listProjects(), [])
  const artworks = useApi(() => api.listArtworks(), [])
  const [section, setSection] = useState<'piezas' | 'modelo' | 'medidas' | 'datos'>('piezas')
  const [piece, setPiece] = useState<string | null>(null)

  const setData = (patch: Partial<DesignData>) => onChange({ ...design, data: { ...design.data, ...patch } })
  const setOption = (key: string, value: string | boolean) => setData({ options: { ...design.data.options, [key]: value } })
  const styleOf = (p: string): PieceStyle => design.data.pieces[p] ?? { color: template.pieces.find((x) => x.id === p)?.defaultColor ?? '#cccccc', materialId: null }
  const active = template.activePieces(design.data.options)
  const pieces = template.pieces.filter((p) => active.includes(p.id))
  const current = pieces.find((p) => p.id === piece)
  const used = [...new Set(pieces.map((p) => styleOf(p.id).color))]

  const remove = async () => {
    if (!props.id) return
    deleteWithUndo(`/designs/${props.id}`, design.name || 'Diseño')
    props.onDeleted()
  }

  return (
    <div className="lz-sheet side" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lz-pop-head">
        {current ? (
          <button className="lz-btn" onClick={() => setPiece(null)}>
            ← {current.label}
          </button>
        ) : (
          <h3>{template.name}</h3>
        )}
        <button className="lz-x" onClick={props.onClose} aria-label="Cerrar">
          ×
        </button>
      </div>

      {current ? (
        <div className="lz-light">
          <PieceInspector
            template={template.id}
            piece={current}
            style={styleOf(current.id)}
            used={used}
            materials={props.library}
            onChange={(patch) => setData({ pieces: { ...design.data.pieces, [current.id]: { ...styleOf(current.id), ...patch } } })}
            hardware={design.data.hardware}
            onHardware={(hardware) => setData({ hardware })}
            isZip={template.draw('front', design.data.options).some((s) => s.role === 'zip' && s.piece === current.id)}
            hasPockets={(['front', 'back', 'side'] as const).some((v) => template.draw(v, design.data.options).some((s) => s.pocket && s.piece === current.id))}
            artworks={artworks.data ?? []}
            blocks={(design.data.blocks ?? []).filter((b) => b.piece === current.id)}
            onBlocks={(list) => setData({ blocks: [...(design.data.blocks ?? []).filter((b) => b.piece !== current.id), ...list] })}
            blockTool={false}
            onBlockTool={() => alert('Para dividir una pieza en bloques de color, píntalos en el lienzo con el bote (modo «Pieza de la prenda») o con el pincel.')}
            onApplyToAll={() => {
              const src = styleOf(current.id)
              const next = { ...design.data.pieces }
              for (const p of template.pieces) if (p.materials.includes('tejido')) next[p.id] = { ...src }
              setData({ pieces: next })
            }}
          />
        </div>
      ) : (
        <>
          <div className="lz-seg" role="tablist">
            {(
              [
                ['piezas', 'Piezas'],
                ['modelo', 'Modelo'],
                ['medidas', 'Medidas'],
                ['datos', 'Datos'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={section === k ? 'on' : ''} onClick={() => setSection(k)}>
                {label}
              </button>
            ))}
          </div>

          {section === 'piezas' && (
            <>
              <p className="lz-muted">Color, tejido, superficie y forma de cada pieza. Se ven en el 3D, la ficha técnica y las prendas del lienzo.</p>
              <div className="lz-rows">
                {pieces.map((p) => {
                  const s = styleOf(p.id)
                  const r = resolveMaterial(template.id, p.id, s.materialId, materials)
                  return (
                    <button key={p.id} className="lz-row" onClick={() => setPiece(p.id)}>
                      <span className="lz-dot" style={{ background: s.color }} />
                      <span>
                        {p.label}
                        <br />
                        <span className="lz-muted">
                          {colorLabel(s).name || s.color.toUpperCase()} · {r.library?.name ?? r.catalog.name}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {section === 'modelo' &&
            OPTION_GROUPS.map((g) => {
              const options = template.options.filter((o) => o.group === g.id)
              if (!options.length) return null
              return (
                <div key={g.id}>
                  <h4>{g.label}</h4>
                  {options.map((o) =>
                    o.type === 'toggle' ? (
                      <label key={o.id} className="lz-toggle">
                        <input type="checkbox" checked={opt<boolean>(template, design.data.options, o.id)} onChange={(e) => setOption(o.id, e.target.checked)} />
                        <span>{o.label}</span>
                      </label>
                    ) : (
                      <div key={o.id}>
                        <p className="lz-label">{o.label}</p>
                        <div className="lz-chips">
                          {o.choices.map((ch) => (
                            <button key={ch.id} className={opt(template, design.data.options, o.id) === ch.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setOption(o.id, ch.id)}>
                              {ch.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )
            })}

          {section === 'medidas' && (
            <div className="lz-light">
              <MeasuresPanel template={template} data={design.data} body={props.body} bodyLabel={props.bodyLabel} onChange={(measures) => setData({ measures })} />
            </div>
          )}

          {section === 'datos' && (
            <div className="lz-form">
              <Field label="Nombre">
                <input value={design.name} onChange={(e) => onChange({ ...design, name: e.target.value })} />
              </Field>
              <Field label="Para quién es">
                <select value={genderOf(design.data)} onChange={(e) => setOption('genero', e.target.value)}>
                  {GENDERS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cliente">
                <select value={design.clientId ?? ''} onChange={(e) => onChange({ ...design, clientId: e.target.value || null })}>
                  <option value="">Sin cliente (marca propia)</option>
                  {props.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Proyecto">
                <select value={design.projectId ?? ''} onChange={(e) => onChange({ ...design, projectId: e.target.value || null })}>
                  <option value="">Sin proyecto</option>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              {design.projectId && (
                <div className="lz-chips">
                  <Link to={`/proyectos/${design.projectId}`} className="lz-chip">
                    Ir al proyecto
                  </Link>
                  <Link to={`/produccion/ficha/${design.projectId}`} className="lz-chip">
                    Ficha técnica
                  </Link>
                </div>
              )}
              <Field label="Notas">
                <textarea rows={4} value={design.data.notes} onChange={(e) => setData({ notes: e.target.value })} placeholder="Ideas, referencias, cambios pedidos por el cliente…" />
              </Field>
              <label className="lz-toggle">
                <input type="checkbox" checked={!!design.data.brandTemplate} onChange={(e) => setData({ brandTemplate: e.target.checked || undefined })} />
                <span>Plantilla de la marca (sale al empezar un diseño nuevo)</span>
              </label>
              <p className="lz-label">Dibujo técnico</p>
              <div className="lz-light">
                <ExportMenu template={template} data={design.data} materials={materials} body={props.body} bodyLabel={props.bodyLabel} name={design.name} view={null} mode="color" dims notes />
              </div>
              {props.id && (
                <button className="lz-chip danger" onClick={remove}>
                  Eliminar diseño
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
