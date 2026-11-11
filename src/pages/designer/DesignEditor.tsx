import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { defaultDesign, getTemplate, NEW_DESIGN_CATALOG } from '../../designer/templates'
import { clientBody, standardBody } from '../../production/measurements'
import { bodyKind, type CanvasDoc, type DesignInput, type MockupLayer } from '../../shared/designs'
import { Design3D } from './Design3D'
import { useHistory } from './useHistory'
import { Lienzo, type Mode3D } from '../../lienzo/Lienzo'
import { afterSave, dropRuntime, flushCanvas, moveRuntime } from '../../lienzo/engine'
import { StartPanel } from './StartPanel'
import { GarmentPanel } from './GarmentPanel'
import './designer.css'
import './studio-editor.css'

/** Id del lienzo en memoria mientras el diseño aún no existe (borrador). */
const DRAFT = 'borrador'

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
    data: { ...defaultDesign(e.template, { ...e.options, genero }), canvas: blankDoc() },
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
  const setMode3d = (m: Mode3D) => {
    setMode3dState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // Sin almacenamiento: solo mientras la página está abierta
    }
  }

  useEffect(() => {
    setError(null)
    if (!id) {
      // Borrador nuevo: lienzo en blanco
      dropRuntime(DRAFT)
      const d = newDraft(params)
      history.reset(d)
      setSaved(JSON.stringify(d))
      setSheet('start')
      return
    }
    api
      .getDesign(id)
      .then((d) => {
        const input: DesignInput = { name: d.name, template: d.template, clientId: d.clientId, projectId: d.projectId, data: d.data }
        history.reset(input)
        setSaved(JSON.stringify(input))
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const dirty = design !== null && JSON.stringify(design) !== saved
  const save = async () => {
    if (!design || saving) return
    setSaving(true)
    setError(null)
    try {
      // Antes, las capas pintadas del lienzo se suben como imágenes
      const canvas = await flushCanvas(runtimeId)
      const next = canvas ? { ...design, data: { ...design.data, canvas } } : design
      if (id) {
        if (canvas) history.set(next)
        await api.updateDesign(id, next)
        setSaved(JSON.stringify(next))
        afterSave(id)
      } else {
        // Primer guardado: se crea el diseño y el lienzo en memoria pasa a ser el suyo
        const created = await api.createDesign(next)
        moveRuntime(DRAFT, created.id)
        afterSave(created.id)
        history.reset(next)
        setSaved(JSON.stringify(next))
        navigate(`/disenador/${created.id}`, { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
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

  /** Ir a otra página del Diseñador o de la app, avisando si hay cambios sin guardar. */
  const go = (to: string) => {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) return
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
        onGarment={() => setSheet(sheet === 'garment' ? null : 'garment')}
        mode3d={mode3d}
        onMode3d={setMode3d}
        view3d={<Design3D template={template} data={design.data} materials={materials} client={client} designId={id} />}
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
          />
        )}
      </Lienzo>
    </div>
  )
}
