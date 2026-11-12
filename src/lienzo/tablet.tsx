/**
 * «Móvil como tableta», lado del ordenador: crea la sala, enseña el QR y convierte lo que llega del móvil en trazos
 * del lienzo (como si fuera un lápiz con presión sobre el papel). También manda al móvil la imagen del papel para que
 * vea lo que dibuja: la entera y, si ha acercado, la zona que enseña a su resolución.
 * Protocolo en `src/shared/tablet.ts`; servidor en `worker/tablet.ts`; página del móvil en `pages/tablet/TabletPad.tsx`.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { renderSVG } from 'uqr'
import type { HostMessage, PadMessage, PadPoint, PadTool, RoomMessage } from '../shared/tablet'

/** Lo que el lienzo deja hacer al móvil (se rellena en cada render de `Lienzo`, así siempre es lo último). */
export interface TabletApi {
  down(p: PadPoint): void
  move(pts: PadPoint[]): void
  up(p: PadPoint): void
  cancel(): void
  undo(): void
  redo(): void
  tool(t: PadTool): void
  size(n: number): void
  /** El papel compuesto (todas las capas visibles) a tamaño real. */
  snapshot(): HTMLCanvasElement
  /** ¿Hay un trazo a medias? (no se manda imagen hasta que acaba) */
  drawing(): boolean
  doc: { w: number; h: number; paper: string; name: string }
  state: { tool: string; color: string; size: number }
}

export type TabletStatus = 'off' | 'creating' | 'waiting' | 'connected' | 'error'

const FULL_PX = 900
const MAX_VIEW_PX = 1600

export function useTabletHost(api: RefObject<TabletApi | null>) {
  const [status, setStatus] = useState<TabletStatus>('off')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ws = useRef<WebSocket | null>(null)
  const peer = useRef(false)
  const view = useRef<Extract<PadMessage, { t: 'view' }> | null>(null)
  const timers = useRef({ snap: 0, later: 0, retry: 0 })
  const stopped = useRef(true)
  const lastState = useRef('')

  const send = (m: HostMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN && peer.current) ws.current.send(JSON.stringify(m))
  }

  /** Manda la imagen del papel (entera y la zona que mira el móvil). */
  const sendImages = useCallback((onlyView = false) => {
    const a = api.current
    if (!a || !peer.current) return
    if (a.drawing()) {
      // A media pincelada no: se vuelve a intentar enseguida
      clearTimeout(timers.current.snap)
      timers.current.snap = window.setTimeout(() => sendImages(onlyView), 120)
      return
    }
    const src = a.snapshot()
    if (!onlyView) send(crop(src, 0, 0, 1, 1, FULL_PX, FULL_PX, true))
    const v = view.current
    // Solo merece la pena la zona si el móvil ha acercado (si no, ya vale la entera)
    if (v && (v.x1 - v.x0 < 0.85 || v.y1 - v.y0 < 0.85)) send(crop(src, v.x0, v.y0, v.x1, v.y1, v.w, v.h, false))
  }, [api])

  const sendDoc = useCallback(() => {
    const a = api.current
    if (!a) return
    send({ t: 'doc', ...a.doc })
    send({ t: 'state', ...a.state })
    lastState.current = JSON.stringify(a.state)
  }, [api])

  const onMessage = useCallback(
    (raw: string) => {
      let m: PadMessage | RoomMessage
      try {
        m = JSON.parse(raw)
      } catch {
        return
      }
      const a = api.current
      if (!a) return
      switch (m.t) {
        case 'peer':
          peer.current = m.on
          setStatus(m.on ? 'connected' : 'waiting')
          if (m.on) {
            sendDoc()
            sendImages()
          }
          return
        case 'down':
          return a.down(m.p)
        case 'move':
          return a.move(m.pts)
        case 'up':
          a.up(m.p)
          return
        case 'cancel':
          return a.cancel()
        case 'undo':
          return a.undo()
        case 'redo':
          return a.redo()
        case 'tool':
          return a.tool(m.tool)
        case 'size':
          return a.size(m.size)
        case 'view':
          view.current = {
            ...m,
            w: Math.min(MAX_VIEW_PX, Math.max(16, Math.round(m.w))),
            h: Math.min(MAX_VIEW_PX, Math.max(16, Math.round(m.h))),
          }
          clearTimeout(timers.current.snap)
          timers.current.snap = window.setTimeout(() => sendImages(true), 60)
          return
      }
    },
    [api, sendDoc, sendImages],
  )

  const connect = useCallback(
    (t: string) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const sock = new WebSocket(`${proto}//${location.host}/api/tablet/${t}/host`)
      ws.current = sock
      sock.onmessage = (e) => typeof e.data === 'string' && onMessage(e.data)
      sock.onclose = (e) => {
        if (ws.current !== sock) return
        peer.current = false
        if (stopped.current) return
        if (e.code === 1006 || e.code === 1001 || e.code === 1000) {
          // Se ha cortado (red, servidor que se reinicia…): se reconecta solo
          setStatus('waiting')
          timers.current.retry = window.setTimeout(() => connect(t), 1500)
        } else {
          setStatus('error')
          setError('Se ha cerrado la conexión. Genera un QR nuevo.')
        }
      }
    },
    [onMessage],
  )

  const start = useCallback(async () => {
    stopped.current = false
    setStatus('creating')
    setError('')
    try {
      const res = await fetch('/api/tablet', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se ha podido crear la conexión')
      const { token: t } = (await res.json()) as { token: string }
      setToken(t)
      setStatus('waiting')
      connect(t)
    } catch (err) {
      setStatus('error')
      setError((err as Error).message)
    }
  }, [connect])

  const stop = useCallback(() => {
    stopped.current = true
    clearTimeout(timers.current.retry)
    const sock = ws.current
    ws.current = null
    peer.current = false
    sock?.close(1000)
    setStatus('off')
    setToken(null)
  }, [])

  useEffect(() => stop, [stop])

  /**
   * El lienzo llama a esto en cada render con algo que cambia cuando cambia el papel: si hay móvil, le manda la imagen
   * nueva (agrupando los cambios seguidos) y otra vez un poco después (por si alguna imagen aún estaba cargando).
   */
  const changed = useCallback(() => {
    if (!peer.current) return
    const a = api.current
    if (a) {
      const st = JSON.stringify(a.state)
      if (st !== lastState.current) {
        lastState.current = st
        send({ t: 'state', ...a.state })
      }
    }
    clearTimeout(timers.current.snap)
    clearTimeout(timers.current.later)
    timers.current.snap = window.setTimeout(() => sendImages(), 250)
    timers.current.later = window.setTimeout(() => sendImages(), 1800)
  }, [api, sendImages])

  const url = token ? `${location.origin}/tableta/${token}` : null
  return { status, error, url, start, stop, changed, sendDoc }
}

/** Recorta la zona (0..1) del papel y la reduce a como mucho w × h píxeles, en JPEG. */
function crop(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, w: number, h: number, full: boolean): HostMessage {
  const sx = x0 * src.width
  const sy = y0 * src.height
  const sw = Math.max(1, (x1 - x0) * src.width)
  const sh = Math.max(1, (y1 - y0) * src.height)
  // Nunca más grande que el original
  const k = Math.min(1, w / sw, h / sh)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * k))
  c.height = Math.max(1, Math.round(sh * k))
  c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return { t: 'img', full, x0, y0, x1, y1, data: c.toDataURL('image/jpeg', full ? 0.8 : 0.86) }
}

/** Ventana del lienzo con el QR para conectar el móvil, y su estado. */
export function TabletPanel({ tablet, onClose }: { tablet: ReturnType<typeof useTabletHost>; onClose: () => void }) {
  const { status, error, url, start, stop } = tablet
  useEffect(() => {
    if (status === 'off') start()
    // Solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const qr = url ? renderSVG(url, { border: 2, whiteColor: '#ffffff', blackColor: '#111111' }) : ''

  return (
    <div className="lz-tablet" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lz-tablet-head">
        <strong>Móvil como tableta</strong>
        <button className="lz-btn" onClick={onClose} title="Cerrar (la conexión sigue)">
          ✕
        </button>
      </div>
      {status === 'connected' ? (
        <>
          <p className="lz-tablet-ok">● Móvil conectado</p>
          <p className="lz-tablet-note">
            Dibuja en el móvil: los trazos salen aquí con el pincel, el color y el tamaño elegidos. Dos dedos acercan y mueven
            la vista del móvil; toque con dos dedos deshace y con tres rehace.
          </p>
          <button className="lz-btn" onClick={stop}>
            Desconectar
          </button>
        </>
      ) : status === 'error' ? (
        <>
          <p className="lz-tablet-err">{error}</p>
          <button className="lz-btn primary" onClick={start}>
            Generar otro QR
          </button>
        </>
      ) : (
        <>
          <div className="lz-tablet-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="lz-tablet-note">
            Escanea el QR con la cámara del móvil o la tableta. No hace falta iniciar sesión en él. El QR sirve durante 10
            minutos.
          </p>
          {url && (
            <button className="lz-btn" onClick={() => navigator.clipboard?.writeText(url)} title={url}>
              Copiar enlace
            </button>
          )}
          {status === 'waiting' && <p className="lz-tablet-wait">Esperando al móvil…</p>}
        </>
      )}
    </div>
  )
}
