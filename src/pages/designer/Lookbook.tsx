import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import { download, exportFlat } from '../../designer/exportFlat'
import { FlatView } from '../../designer/FlatView'
import { LOOK_ANGLES, LOOK_SCENES, LOOK_SHOES, lookPrompt, PRODUCT_FINISHES, PRODUCT_SHOTS, productPrompt, referenceFile, type LookAngle, type LookScene, type ProductShot } from '../../designer/lookbook'
import { getTemplate } from '../../designer/templates'
import { isPants } from '../../designer/types'
import { standardBody } from '../../production/measurements'
import { bodyKind, type Design } from '../../shared/designs'
import { fileUrl, type Material } from '../../shared/library'
import type { ProjectFile } from '../../shared/projects'
import { bodyOf } from './Design3D'
import './lookbook.css'
import './studio.css'

/**
 * Lookbook: se eligen las prendas de un outfit y la app prepara lo que hay que pasarle a una IA de imágenes (fuera de la
 * app): el texto con todo el detalle y los dibujos técnicos de cada prenda. Las fotos que devuelva se suben luego a un
 * proyecto (y se ven también en la ficha de su cliente).
 */
export function Lookbook() {
  const designs = useApi(() => api.listDesigns(), [])
  const clients = useApi(() => api.listClients(), [])
  const library = useApi(() => api.listMaterials(), [])
  const projects = useApi(() => api.listProjects(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])

  const [topId, setTopId] = useState<string | null>(null)
  const [underId, setUnderId] = useState<string | null>(null)
  const [bottomId, setBottomId] = useState<string | null>(null)
  const [hatId, setHatId] = useState<string | null>(null)
  const [bodyPick, setBodyPick] = useState<'auto' | 'hombre' | 'mujer'>('auto')
  const [clientId, setClientId] = useState('')
  const [shoes, setShoes] = useState('baloncesto')
  const [shoesText, setShoesText] = useState('')
  const [scene, setScene] = useState<LookScene>('estudio-blanco')
  const [sceneText, setSceneText] = useState('')
  const [angles, setAngles] = useState<LookAngle[]>(['frente', 'tres-cuartos', 'espalda'])
  const [extra, setExtra] = useState('')
  // Tipo de foto: el outfit en el maniquí o una prenda sola (foto de producto)
  const [photo, setPhoto] = useState<'outfit' | 'producto'>('outfit')
  const [shot, setShot] = useState<ProductShot>('colgada')
  const [finish, setFinish] = useState('')
  const [exact, setExact] = useState(true)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all = (designs.data ?? []).filter((d) => getTemplate(d.template))
  const tops = all.filter((d) => getTemplate(d.template)!.family === 'top')
  const bottoms = all.filter((d) => isPants(getTemplate(d.template)!))
  const heads = all.filter((d) => getTemplate(d.template)!.family === 'head')
  const find = (id: string | null) => all.find((d) => d.id === id) ?? null
  // De arriba abajo: lo de encima, lo de debajo, el pantalón y lo de la cabeza
  const items = [
    { role: 'Prenda de arriba (por encima)', design: find(topId) },
    { role: 'Prenda de debajo (asoma bajo la de arriba)', design: find(underId) },
    { role: 'Pantalón', design: find(bottomId) },
    { role: 'Cabeza', design: find(hatId) },
  ].filter((x): x is { role: string; design: Design } => !!x.design)

  const client = clients.data?.find((c) => c.id === clientId)
  const auto = items.some((x) => bodyKind(x.design.data) === 'mujer') ? 'mujer' : 'hombre'
  const kind = bodyPick === 'auto' ? auto : bodyPick
  const prompt = !items.length
    ? ''
    : photo === 'producto'
      ? productPrompt({ design: items[0].design, materials, shot, finish, exact, extra })
      : lookPrompt({ items, materials, kind, client, shoes, shoesText, scene, sceneText, angles, extra })

  const copy = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Dibujos técnicos (delantero y espalda, en color) de cada prenda, como imágenes de referencia para la IA
  const downloadRefs = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const [n, { design }] of items.entries()) {
        const t = getTemplate(design.template)!
        const k = bodyKind(design.data)
        const body = bodyOf(client, k) ?? standardBody('M', k)
        const { blob } = await exportFlat(t, design.data, materials, body, {
          format: 'png',
          views: ['front', 'back'],
          mode: 'color',
          dims: false,
          notes: false,
          name: design.name,
          subtitle: '',
        })
        download(blob, referenceFile(n, design))
      }
    } catch (e) {
      setError((e as Error).message || 'No se han podido crear las imágenes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page lookbook">
      <PageHeader
        title="Lookbook"
        subtitle="Fotos realistas de tus outfits con una IA de imágenes"
        actions={
          <Link to="/disenos" className="button">
            Diseños
          </Link>
        }
      />
      <Status loading={designs.loading && !designs.data} error={designs.error} />

      <div className="lookbook-layout">
        <div className="lookbook-col">
          <section className="card">
            <h2>Outfit</h2>
            <Picker title="Arriba (por encima)" list={tops} selected={topId} onSelect={setTopId} materials={materials} />
            <Picker title="Debajo (opcional)" list={tops.filter((d) => d.id !== topId)} selected={underId} onSelect={setUnderId} materials={materials} />
            <Picker title="Pantalón" list={bottoms} selected={bottomId} onSelect={setBottomId} materials={materials} />
            <Picker title="Cabeza" list={heads} selected={hatId} onSelect={setHatId} materials={materials} />
            <h3>Calzado</h3>
            <div className="chips">
              {LOOK_SHOES.map((s) => (
                <button key={s.id} className={shoes === s.id ? 'chip active' : 'chip'} onClick={() => setShoes(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
            {shoes && (
              <input
                className="lookbook-input"
                value={shoesText}
                onChange={(e) => setShoesText(e.target.value)}
                placeholder={shoes === 'otro' ? 'Describe el calzado (modelo, color…)' : 'Color o detalles (opcional): p. ej. negras con suela blanca'}
              />
            )}
          </section>

          <section className="card">
            <h2>Maniquí y foto</h2>
            <div className="segmented" role="group" aria-label="Tipo de foto">
              <button className={photo === 'outfit' ? 'active' : ''} onClick={() => setPhoto('outfit')}>
                Outfit en maniquí
              </button>
              <button className={photo === 'producto' ? 'active' : ''} onClick={() => setPhoto('producto')}>
                Foto de producto
              </button>
            </div>
            {photo === 'producto' && (
              <div className="lookbook-fields">
                <p className="muted small">La primera prenda elegida, sola y fotografiada como en un catálogo. Adjunta su dibujo (o el lienzo) a la IA.</p>
                <Field label="Cómo" wide>
                  <select value={shot} onChange={(ev) => setShot(ev.target.value as ProductShot)}>
                    {PRODUCT_SHOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Acabado del tejido" wide>
                  <select value={finish} onChange={(ev) => setFinish(ev.target.value)}>
                    {PRODUCT_FINISHES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="toggle-row">
                  <span>Mantener el diseño exacto</span>
                  <input type="checkbox" checked={exact} onChange={(ev) => setExact(ev.target.checked)} />
                </label>
              </div>
            )}
            <div className="lookbook-fields" hidden={photo === 'producto'}>
              <Field label="Cuerpo">
                <select value={bodyPick} onChange={(e) => setBodyPick(e.target.value as typeof bodyPick)}>
                  <option value="auto">Según la ropa ({auto})</option>
                  <option value="hombre">Hombre</option>
                  <option value="mujer">Mujer</option>
                </select>
              </Field>
              <Field label="Medidas de un cliente">
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Estándar</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Escenario" wide>
                <select value={scene} onChange={(e) => setScene(e.target.value as LookScene)}>
                  {LOOK_SCENES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              {scene === 'otro' && (
                <Field label="Describe el escenario" wide>
                  <input value={sceneText} onChange={(e) => setSceneText(e.target.value)} placeholder="P. ej. un parking de noche con luces de neón" />
                </Field>
              )}
            </div>
            <h3 hidden={photo === 'producto'}>Vistas</h3>
            <div className="chips" hidden={photo === 'producto'}>
              {LOOK_ANGLES.map((a) => {
                const on = angles.includes(a.id)
                return (
                  <button key={a.id} className={on ? 'chip active' : 'chip'} aria-pressed={on} onClick={() => setAngles(on ? angles.filter((x) => x !== a.id) : [...angles, a.id])}>
                    {a.label}
                  </button>
                )
              })}
            </div>
            <Field label="Algo más (opcional)" wide>
              <textarea rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="P. ej. la chaqueta abierta, la capucha puesta, las mangas un poco remangadas…" />
            </Field>
          </section>
        </div>

        <div className="lookbook-col">
          <section className="card">
            <h2>1 · Texto para la IA</h2>
            {items.length ? (
              <>
                <textarea className="lookbook-prompt" readOnly value={prompt} rows={16} onFocus={(e) => e.currentTarget.select()} />
                <div className="lookbook-actions">
                  <button className="button primary" onClick={copy}>
                    {copied ? 'Copiado' : 'Copiar texto'}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Elige al menos una prenda del outfit.</p>
            )}
          </section>

          <section className="card">
            <h2>2 · Imágenes de referencia</h2>
            {items.length ? (
              <>
                <div className="lookbook-refs">
                  {items.map(({ design }, n) => (
                    <figure key={design.id}>
                      <div className="lookbook-flats">
                        <FlatView template={getTemplate(design.template)!} data={design.data} view="front" materials={materials} frame="ajustado" />
                        <FlatView template={getTemplate(design.template)!} data={design.data} view="back" materials={materials} frame="ajustado" />
                      </div>
                      <figcaption>{referenceFile(n, design)}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="lookbook-actions">
                  <button className="button" onClick={downloadRefs} disabled={busy}>
                    {busy ? 'Preparando…' : `Descargar ${items.length === 1 ? 'la imagen' : `las ${items.length} imágenes`}`}
                  </button>
                </div>
                {error && <p className="error">{error}</p>}
                <p className="muted small">
                  Pega el texto en tu IA de imágenes (Gemini, ChatGPT…) y adjunta estas imágenes. Si una foto cambia algún detalle, pídele que lo corrija o
                  vuelve a generarla.
                </p>
              </>
            ) : (
              <p className="muted">Aparecerán aquí al elegir las prendas.</p>
            )}
          </section>

          <UploadPhotos projects={projects.data ?? []} clientId={clientId} suggested={items.map((x) => x.design.projectId).find(Boolean) ?? ''} />
        </div>
      </div>
    </div>
  )
}

/** Subir las fotos que devuelva la IA a un proyecto (como «Fotos»). */
function UploadPhotos(props: { projects: { id: string; name: string; clientId: string | null; clientName?: string }[]; clientId: string; suggested: string }) {
  const { projects, clientId, suggested } = props
  const [projectId, setProjectId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState<ProjectFile[]>([])
  const [error, setError] = useState<string | null>(null)
  // Propone el proyecto de las prendas elegidas, o uno del cliente
  useEffect(() => {
    if (suggested) setProjectId(suggested)
    else if (clientId) setProjectId((p) => p || projects.find((x) => x.clientId === clientId)?.id || '')
  }, [suggested, clientId, projects])
  const list = clientId ? [...projects].sort((a, b) => Number(b.clientId === clientId) - Number(a.clientId === clientId)) : projects

  const upload = async (files: FileList | null) => {
    if (!files?.length || !projectId) return
    setUploading(true)
    setError(null)
    try {
      let last: ProjectFile[] = []
      for (const f of Array.from(files)) {
        const p = await api.addProjectFile(projectId, f, 'foto')
        last = p.files
      }
      // Las recién subidas son las últimas
      setDone(last.filter((f) => f.category === 'foto').slice(-files.length))
    } catch (e) {
      setError((e as Error).message || 'No se han podido subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="card">
      <h2>3 · Guardar las fotos</h2>
      {projects.length === 0 ? (
        <p className="muted">
          Crea antes un <Link to="/proyectos/nuevo">proyecto</Link> para guardarlas (si es de un cliente, se verán también en su ficha).
        </p>
      ) : (
        <>
          <Field label="Proyecto">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Elige un proyecto…</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.clientName ? ` · ${p.clientName}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <label className={projectId && !uploading ? 'button lookbook-upload' : 'button lookbook-upload disabled'}>
            {uploading ? 'Subiendo…' : 'Subir fotos'}
            <input type="file" accept="image/*" multiple disabled={!projectId || uploading} onChange={(e) => (upload(e.target.files), (e.target.value = ''))} hidden />
          </label>
          {error && <p className="error">{error}</p>}
          {done.length > 0 && (
            <>
              <div className="lookbook-photos">
                {done.map((f) => (
                  <img key={f.id} src={fileUrl(f.file)} alt={f.name} loading="lazy" />
                ))}
              </div>
              <p className="muted small">
                Guardadas en «Fotos» del <Link to={`/proyectos/${projectId}`}>proyecto</Link>.
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Lista de diseños para elegir, con su dibujo delantero en miniatura (otro clic lo quita). */
function Picker(props: { title: string; list: Design[]; selected: string | null; onSelect: (id: string | null) => void; materials: Map<string, Material> }) {
  const { title, list, selected, onSelect, materials } = props
  if (!list.length) return null
  return (
    <>
      <h3>{title}</h3>
      <div className="probador-grid lookbook-grid">
        {list.map((d) => (
          <button key={d.id} className={selected === d.id ? 'probador-item active' : 'probador-item'} onClick={() => onSelect(selected === d.id ? null : d.id)} aria-pressed={selected === d.id}>
            <FlatView template={getTemplate(d.template)!} data={d.data} view="front" materials={materials} frame="comun" />
            <span>{d.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}
