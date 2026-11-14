import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { defaultDesign, getTemplate, NEW_DESIGN_CATALOG } from '../../designer/templates'
import { clientBody, standardBody } from '../../production/measurements'
import { bodyKind, type CanvasDoc, type DesignInput, type MockupLayer } from '../../shared/designs'
import { Design3D } from './Design3D'
import { useHistory } from './useHistory'
import { Lienzo, type Mode3D } from '../../lienzo/Lienzo'
import { afterSave, compose, dropRuntime, flushCanvas, moveRuntime, peekRuntime } from '../../lienzo/engine'
import { StartPanel } from './StartPanel'
import { GarmentPanel } from './GarmentPanel'
import './designer.css'
import './studio-editor.css'

/** Id del lienzo en memoria mientras el diseño aún no existe (borrador). */
const DRAFT = 'borrador'

/** Espera desde el último cambio hasta el autoguardado (y tras un fallo, antes de volver a intentarlo). */
const AUTOSAVE_MS = 2500
const RETRY_MS = 15000

/** Pone en `d` las claves de las capas recién subidas (sin tocar lo que haya cambiado mientras subían). */
function withFiles(d: DesignInput, uploaded: CanvasDoc): DesignInput {
  const cur = d.data.canvas
  if (!cur) return { ...d, data: { ...d.data, canvas: uploaded } }
  const files = new Map(uploaded.layers.flatMap((l) => (l.kind === 'paint' ? [[l.id, l.file] as const] : [])))
  const layers = cur.layers.map((l) => (l.kind === 'paint' && files.has(l.id) ? { ...l, file: files.get(l.id)! } : l))
  return { ...d, data: { ...d.data, canvas: { ...cur, layers } } }
}

/** Ancho de la miniatura del lienzo (para las galerías de diseños). */
const THUMB_W = 480

/** Imagen pequeña de lo que hay en el lienzo (todas las capas visibles, con el papel), subida a KV. */
async function canvasThumb(runtimeId: string, doc: CanvasDoc): Promise<string | null> {
  const r = peekRuntime(runtimeId)
  if (!r) return null
  const full = compose(r, doc)
  const s = Math.min(1, THUMB_W / doc.w)
  const c = document.createElement('canvas')
  c.width = Math.round(doc.w * s)
  c.height = Math.round(doc.h * s)
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(full, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
  return blob ? (await api.uploadBlob(blob)).key : null
}

/** Lienzo en blanco: solo el papel y una capa de pintura. */
function blankDoc(): CanvasDoc {
  return { w: 2000, h: 1400, paper: '#ffffff', layers: [{ id: crypto.randomUUID(), kind: 'paint', name: 'Capa 1', file: null, visible: true, locked: false, opacity: 1, blend: 'normal' }] }
}

/** Delante y detrás de la prenda del diseño, en línea, para pintar encima. */
export function ownMockups(): MockupLayer[] {
  const base = { kind: 'mockup', style: 'linea', y: 120, w: 820, visible: true, locked: false, opacity: 1, blend: 'normal' } as const
  return [
    { ...base, id: crypto.randomUUID(), name: 'Prenda · Delantero', view: 'front', x: 140 },
    { ...base, id: crypto.randomUUID(), name: 'Prenda · Espalda', view: 'back', x: 1040 },
  ]
}

/** Diseño nuevo sin guardar: lienzo en blanco (la prenda base se elige dentro). */
function newDraft(params: URLSearchParams): DesignInput {
  const e = NEW_DESIGN_CATALOG[0]
  const genero = params.get('genero') === 'mujer' || params.get('genero') === 'unisex' ? params.get('genero')! : 'hombre'
  return {
    name: 'Diseño sin título',
    template: e.template.id,
    clientId: params.get('cliente'),
    projectId: params.get('proyecto'),
    // Sin prenda elegida: el 3D no enseña ninguna (antes salía siempre la sudadera) hasta elegir qué prenda es
    data: { ...defaultDesign(e.template, { ...e.options, genero }), canvas: blankDoc(), blank: true },
  }
}

const MODE_KEY = 'fd:lienzo-3d'
function storedMode(): Mode3D {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'side' || v === 'full' ? v : 'off'
  } catch {
    return 'off'
  }
}

/**
 * El Diseñador: siempre el lienzo. Sin id es un diseño nuevo (lienzo en blanco, se crea al guardar) y dentro se elige
 * qué hacer (prenda, plantilla, imagen o abrir otro diseño); con id, el lienzo de ese diseño. Arriba se cambia entre
 * 2D, 3D y los dos a la vez.
 */
export function DesignEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const clients = useApi(() => api.listClients(), [])
  const library = useApi(() => api.listMaterials(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])

  const history = useHistory<DesignInput | null>(null)
  const design = history.state
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mode3d, setMode3dState] = useState<Mode3D>(storedMode)
  const [sheet, setSheet] = useState<'start' | 'garment' | null>(id ? null : 'start')
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const runtimeId = id ?? DRAFT
  // Guardado en marcha (también para el autoguardado, que no espera a que React repinte)
  const savingRef = useRef(false)
  const savedRef = useRef('')
  // Diseño que se acaba de crear al guardar el borrador: al cambiar la dirección no se vuelve a cargar (se seguiría
  // pintando sobre él mientras llega)
  const justCreated = useRef<string | null>(null)
  const failedAt = useRef(0)
  // Lienzo de la última miniatura (si no ha cambiado, no se rehace)
  const thumbOf = useRef('')
  // Sube al volver a una versión: el lienzo se monta de nuevo con las capas de esa versión
  const [loadCount, setLoadCount] = useState(0)
  const setMode3d = (m: Mode3D) => {
    setMode3dState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // Sin almacenamiento: solo mientras la página está abierta
    }
  }

  const markSaved = (s: string) => {
    savedRef.current = s
    setSaved(s)
  }

  const load = (designId: string) =>
    api
      .getDesign(designId)
      .then((d) => {
        const input: DesignInput = { name: d.name, template: d.template, clientId: d.clientId, projectId: d.projectId, data: d.data }
        history.reset(input)
        markSaved(JSON.stringify(input))
        thumbOf.current = input.data.thumb && input.data.canvas ? JSON.stringify(input.data.canvas) : ''
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    setError(null)
    if (id && id === justCreated.current) return
    if (!id) {
      // Borrador nuevo: lienzo en blanco
      dropRuntime(DRAFT)
      const d = newDraft(params)
      history.reset(d)
      markSaved(JSON.stringify(d))
      setSheet('start')
      return
    }
    load(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const dirty = design !== null && JSON.stringify(design) !== saved
  const isDirty = () => history.get() !== null && JSON.stringify(history.get()) !== savedRef.current

  /**
   * Guarda el diseño (a mano o solo, a los segundos de cada cambio). Se puede seguir pintando mientras: se guarda lo
   * que hay al terminar de subir las capas, y lo que cambie después queda para el siguiente guardado.
   */
  const save = async () => {
    if (!history.get() || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      // Antes, las capas pintadas del lienzo se suben como imágenes
      const canvas = await flushCanvas(runtimeId)
      const latest = history.get()!
      let next = canvas ? withFiles(latest, canvas) : latest
      // Miniatura de lo que hay en el lienzo (aunque esté en blanco), si ha cambiado desde la última
      const doc = next.data.canvas
      const docKey = doc ? JSON.stringify(doc) : ''
      if (doc && (docKey !== thumbOf.current || !next.data.thumb)) {
        const old = next.data.thumb
        const thumb = await canvasThumb(runtimeId, doc).catch(() => null)
        if (thumb) {
          thumbOf.current = docKey
          next = { ...next, data: { ...next.data, thumb } }
          if (old) api.deleteFile(old).catch(() => {})
        }
      }
      if (next !== latest) history.replace(next)
      if (id) {
        await api.updateDesign(id, next)
        markSaved(JSON.stringify(next))
        afterSave(id)
      } else {
        // Primer guardado: se crea el diseño y el lienzo en memoria pasa a ser el suyo
        const created = await api.createDesign(next)
        justCreated.current = created.id
        moveRuntime(DRAFT, created.id)
        afterSave(created.id)
        markSaved(JSON.stringify(next))
        navigate(`/disenador/${created.id}`, { replace: true })
      }
      failedAt.current = 0
    } catch (e) {
      failedAt.current = Date.now()
      setError(`No se ha podido guardar: ${(e as Error).message}. Se volverá a intentar solo.`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Autoguardado: unos segundos después del último cambio (si falla, se espera un poco más)
  useEffect(() => {
    if (!dirty || saving) return
    const t = window.setTimeout(save, failedAt.current ? RETRY_MS : AUTOSAVE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, dirty, saving])

  /** Tras volver a una versión: se olvida el lienzo en memoria y se carga de nuevo. */
  const reloadDesign = async () => {
    if (!id) return
    dropRuntime(id)
    await load(id)
    setLoadCount((n) => n + 1)
    setSheet(null)
  }

  // Ctrl+S guarda también con un panel abierto (el lienzo lo atiende si tiene el foco)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Aviso al salir con cambios sin guardar
  useEffect(() => {
    if (!dirty) return
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  /** Ir a otra página del Diseñador o de la app: antes se guarda lo pendiente (y si no se puede, se avisa). */
  const go = async (to: string) => {
    if (isDirty()) await save()
    if (isDirty() && !confirm('No se han podido guardar los últimos cambios. ¿Salir sin ellos?')) return
    navigate(to)
  }

  if (error && !design)
    return (
      <div className="page">
        <p className="status error">{error}</p>
      </div>
    )
  if (!design) return <div className="page"><p className="muted">Cargando…</p></div>
  const template = getTemplate(design.template)
  if (!template) return <div className="page"><p className="status error">Prenda base desconocida: {design.template}</p></div>

  const client = clients.data?.find((c) => c.id === design.clientId)
  const kind = bodyKind(design.data)
  const fromClient = client && Object.keys(client.measurements).length ? clientBody(client.measurements, kind) : null
  const body = fromClient?.body ?? standardBody('M', kind)
  const bodyLabel = fromClient ? `a medida de ${client!.name}` : 'talla M'
  const canvas = design.data.canvas ?? blankDoc()

  return (
    <div className="editor studio-editor">
      <Lienzo
        key={loadCount}
        designId={runtimeId}
        name={design.name}
        template={template}
        data={{ ...design.data, canvas }}
        materials={materials}
        body={body}
        onChange={(c) => history.set({ ...design, data: { ...design.data, canvas: c } })}
        onPieceColor={(piece, color, c, surface) =>
          history.set({
            ...design,
            data: {
              ...design.data,
              ...(c ? { canvas: c } : {}),
              pieces: { ...design.data.pieces, [piece]: { ...design.data.pieces[piece], color, colorName: undefined, colorCode: undefined, surface: surface ?? undefined } },
            },
          })
        }
        onOptions={(patch) => history.set({ ...design, data: { ...design.data, options: { ...design.data.options, ...patch } } })}
        onSave={save}
        saving={saving}
        dirty={dirty}
        onMenu={() => setSheet(sheet === 'start' ? null : 'start')}
        onExit={() => go('/disenos')}
        onGarment={() => setSheet(sheet === 'garment' ? null : 'garment')}
        mode3d={mode3d}
        onMode3d={setMode3d}
        view3d={
          design.data.blank ? (
            <div className="design-3d-blank">
              <p>Este lienzo aún no tiene prenda.</p>
              <p className="muted small">Para verlo en 3D, elige qué prenda es: sus vistas se ponen en línea en el lienzo y lo que pintes encima pasa a la prenda 3D.</p>
              <button className="lz-btn primary" onClick={() => setSheet('start')}>
                Elegir la prenda
              </button>
            </div>
          ) : (
            <Design3D template={template} data={design.data} materials={materials} client={client} designId={id} runtimeId={runtimeId} />
          )
        }
        pendingImage={pendingImage}
        onPendingImage={() => setPendingImage(null)}
      >
        {error && <p className="lz-error">{error}</p>}
        {sheet === 'start' && (
          <StartPanel
            draft={!id}
            current={id ?? null}
            onClose={() => setSheet(null)}
            onBlank={() => setSheet(null)}
            onGarment={(entry, gender) => {
              // Prenda base elegida para el borrador: sus vistas en línea, debajo de lo pintado
              const hasOwn = canvas.layers.some((l) => l.kind === 'mockup' && !l.template)
              const layers = hasOwn ? canvas.layers : [...ownMockups(), ...canvas.layers]
              history.set({
                ...design,
                name: design.name === 'Diseño sin título' || design.name.endsWith(' sin título') ? `${entry.name}${gender === 'mujer' ? ' de mujer' : ''} sin título` : design.name,
                template: entry.template.id,
                data: { ...defaultDesign(entry.template, { ...entry.options, genero: gender }), canvas: { ...canvas, layers } },
              })
              setSheet(null)
            }}
            onImage={(file) => {
              setPendingImage(file)
              setSheet(null)
            }}
            onBrand={async (d) => {
              const { brandTemplate: _b, ...data } = structuredClone(d.data)
              try {
                const created = await api.createDesign({ name: `${d.name} (nuevo)`, template: d.template, clientId: design.clientId, projectId: design.projectId, data })
                go(`/disenador/${created.id}`)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
            onOpen={(designId) => go(`/disenador/${designId}`)}
            onDeletedCurrent={() => navigate('/disenador')}
            onNew={() => go('/disenador')}
            onLeave={go}
          />
        )}
        {sheet === 'garment' && (
          <GarmentPanel
            id={id ?? null}
            design={design}
            template={template}
            materials={materials}
            library={library.data ?? []}
            clients={clients.data ?? []}
            body={body}
            bodyLabel={bodyLabel}
            onChange={history.set}
            onClose={() => setSheet(null)}
            onDeleted={() => navigate('/disenador')}
            onSaveNow={save}
            onRestored={reloadDesign}
          />
        )}
      </Lienzo>
    </div>
  )
}
