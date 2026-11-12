/**
 * /tableta/:token — «Móvil como tableta», lado del móvil (o del iPad con Apple Pencil). Se abre al escanear el QR del
 * lienzo; no necesita sesión (el token del QR es la llave). Enseña el papel tal como está en el ordenador y lo que se
 * dibuja aquí se pinta allí con el pincel, color y tamaño elegidos en el lienzo.
 * - Un dedo o el lápiz dibujan (si se usa lápiz, el dedo solo mueve la vista, como en el lienzo).
 * - Dos dedos acercan y mueven la vista del móvil (no la del ordenador); toque con dos dedos deshace y con tres rehace.
 * Protocolo en `src/shared/tablet.ts`; lado del ordenador en `src/lienzo/tablet.tsx`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { HostMessage, PadMessage, PadPoint, PadTool, RoomMessage } from '../../shared/tablet'
import './tablet.css'

type Conn = 'connecting' | 'waiting' | 'ready' | 'lost' | 'failed' | 'replaced'

interface View {
  s: number
  x: number
  y: number
}

interface Img {
  src: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Presión del dedo (no tiene): media, para que el pincel salga a su tamaño normal. */
const FINGER_PRESSURE = 0.6

export function TabletPad() {
  const { token = '' } = useParams()
  const [conn, setConn] = useState<Conn>('connecting')
  const [doc, setDoc] = useState<Extract<HostMessage, { t: 'doc' }> | null>(null)
  const [state, setState] = useState<{ tool: string; color: string; size: number }>({ tool: 'brush', color: '#000000', size: 10 })
  const [full, setFull] = useState<Img | null>(null)
  const [detail, setDetail] = useState<Img | null>(null)
  const [view, setViewState] = useState<View>({ s: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  const setView = (v: View) => {
    viewRef.current = v
    setViewState(v)
  }
  const stage = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const ws = useRef<WebSocket | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const stateRef = useRef(state)
  stateRef.current = state
  const fitted = useRef(false)

  // --- Conexión ---
  const send = useCallback((m: PadMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

  useEffect(() => {
    let alive = true
    let opened = false
    let retry = 0
    let tries = 0
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const sock = new WebSocket(`${proto}//${location.host}/api/tablet/${token}/pad`)
      ws.current = sock
      sock.onopen = () => {
        opened = true
        tries = 0
        setConn('waiting')
      }
      sock.onmessage = (e) => {
        if (typeof e.data !== 'string') return
        let m: HostMessage | RoomMessage
        try {
          m = JSON.parse(e.data)
        } catch {
          return
        }
        if (m.t === 'peer') setConn(m.on ? 'ready' : 'waiting')
        else if (m.t === 'doc') setDoc(m)
        else if (m.t === 'state') setState({ tool: m.tool, color: m.color, size: m.size })
        else if (m.t === 'img') {
          const img = { src: m.data, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 }
          if (m.full) {
            setFull(img)
            // Ya está en la imagen lo dibujado aquí antes de pedirla
            pending.current = pending.current.filter((s) => s.t > performance.now() - 150)
            drawOverlay()
          } else setDetail(img)
        }
      }
      sock.onclose = (e) => {
        if (!alive || ws.current !== sock) return
        if (e.code === 4000) return setConn('replaced')
        // Nunca llegó a abrir: token caducado o mal escrito
        if (!opened) return setConn('failed')
        setConn('lost')
        retry = window.setTimeout(open, Math.min(8000, 800 * 2 ** tries++))
      }
    }
    open()
    return () => {
      alive = false
      clearTimeout(retry)
      ws.current?.close(1000)
    }
  }, [token])

  // Pantalla siempre encendida mientras se dibuja
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    const ask = () => {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      wl?.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    ask()
    const onVis = () => document.visibilityState === 'visible' && ask()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [])

  // Sin zoom de la página ni rebote: aquí los gestos son del dibujo
  useEffect(() => {
    const meta = document.querySelector('meta[name=viewport]')
    const before = meta?.getAttribute('content') ?? ''
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.documentElement.classList.add('tablet-pad-page')
    return () => {
      meta?.setAttribute('content', before)
      document.removeEventListener('gesturestart', stop)
      document.documentElement.classList.remove('tablet-pad-page')
    }
  }, [])

  // --- Vista ---
  const fit = useCallback(() => {
    const d = docRef.current
    const el = stage.current
    if (!d || !el) return
    const { width, height } = el.getBoundingClientRect()
    const s = Math.min(width / d.w, height / d.h) * 0.94
    setView({ s, x: (width - d.w * s) / 2, y: (height - d.h * s) / 2 })
  }, [])
  useEffect(() => {
    if (doc && !fitted.current) {
      fitted.current = true
      fit()
    }
  }, [doc, fit])
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const c = overlay.current
      if (c) {
        const r = el.getBoundingClientRect()
        c.width = Math.round(r.width * devicePixelRatio)
        c.height = Math.round(r.height * devicePixelRatio)
      }
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  /** Pide al ordenador la zona que se ve, a la resolución de esta pantalla (al acercar se ve nítido). */
  const viewTimer = useRef(0)
  useEffect(() => {
    clearTimeout(viewTimer.current)
    drawOverlay()
    if (!doc || conn !== 'ready') return
    viewTimer.current = window.setTimeout(() => {
      const el = stage.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      const v = viewRef.current
      const x0 = Math.max(0, -v.x / v.s / doc.w)
      const y0 = Math.max(0, -v.y / v.s / doc.h)
      const x1 = Math.min(1, (width - v.x) / v.s / doc.w)
      const y1 = Math.min(1, (height - v.y) / v.s / doc.h)
      if (x1 <= x0 || y1 <= y0) return
      const dpr = Math.min(2, devicePixelRatio)
      send({ t: 'view', x0, y0, x1, y1, w: (x1 - x0) * doc.w * v.s * dpr, h: (y1 - y0) * doc.h * v.s * dpr })
    }, 220)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, doc, conn, send])

  // --- Trazo local (se ve al momento; lo de verdad llega luego en la imagen del ordenador) ---
  const current = useRef<{ pts: number[]; erase: boolean } | null>(null)
  const pending = useRef<{ pts: number[]; erase: boolean; color: string; size: number; t: number }[]>([])
  const drawOverlay = () => {
    const c = overlay.current
    if (!c) return
    const g = c.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    const v = viewRef.current
    const dpr = devicePixelRatio
    g.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const st = stateRef.current
    const all = [...pending.current, ...(current.current ? [{ ...current.current, color: st.color, size: st.size }] : [])]
    for (const s of all) {
      if (s.pts.length < 2) continue
      g.strokeStyle = s.erase ? 'rgba(255,255,255,0.85)' : s.color
      g.lineWidth = Math.max(1 / v.s, s.size * 0.8)
      g.beginPath()
      g.moveTo(s.pts[0], s.pts[1])
      for (let i = 2; i < s.pts.length; i += 2) g.lineTo(s.pts[i], s.pts[i + 1])
      if (s.pts.length === 2) g.lineTo(s.pts[0] + 0.01, s.pts[1])
      g.stroke()
    }
  }

  // --- Puntero ---
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const penSeen = useRef(false)
  const strokeInfo = useRef<{ id: number; t: number } | null>(null)
  const gesture = useRef<{ view: View; mid: { x: number; y: number }; dist: number; moved: boolean; count: number; t: number } | null>(null)
  const panning = useRef<{ x: number; y: number; view: View; id: number } | null>(null)
  const queue = useRef<PadPoint[]>([])
  const frame = useRef(0)

  const toPaper = (clientX: number, clientY: number, pressure: number): PadPoint => {
    const d = docRef.current!
    const r = stage.current!.getBoundingClientRect()
    const v = viewRef.current
    const x = (clientX - r.left - v.x) / v.s
    const y = (clientY - r.top - v.y) / v.s
    return [x / d.w, y / d.h, pressure]
  }
  const pressureOf = (e: { pointerType: string; pressure: number }) => (e.pointerType === 'pen' ? e.pressure || 0.5 : FINGER_PRESSURE)
  const flush = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    if (queue.current.length) send({ t: 'move', pts: queue.current })
    queue.current = []
  }
  const twoTouch = () => {
    const [a, b] = [...pointers.current.values()].filter((p) => p.type === 'touch')
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(b.x - a.x, b.y - a.y) }
  }
  const endStroke = (cancel: boolean, last?: PadPoint) => {
    if (!strokeInfo.current) return
    flush()
    if (cancel) send({ t: 'cancel' })
    else send({ t: 'up', p: last! })
    if (current.current && !cancel) pending.current.push({ ...current.current, color: stateRef.current.color, size: stateRef.current.size, t: performance.now() })
    current.current = null
    strokeInfo.current = null
    drawOverlay()
  }

  const onDown = (e: React.PointerEvent) => {
    if (!docRef.current || conn !== 'ready') return
    stage.current!.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    if (e.pointerType === 'pen') penSeen.current = true
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch')
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // Segundo dedo: era un gesto. Si el trazo acaba de empezar se anula; si no, se termina
      if (strokeInfo.current) endStroke(performance.now() - strokeInfo.current.t < 300, toPaper(e.clientX, e.clientY, FINGER_PRESSURE))
      panning.current = null
      const g = twoTouch()
      gesture.current = { view: viewRef.current, mid: g.mid, dist: g.dist, moved: false, count: touches.length, t: performance.now() }
      return
    }
    if (e.pointerType === 'touch' && penSeen.current) {
      panning.current = { x: e.clientX, y: e.clientY, view: viewRef.current, id: e.pointerId }
      return
    }
    if (strokeInfo.current) return
    const p = toPaper(e.clientX, e.clientY, pressureOf(e))
    strokeInfo.current = { id: e.pointerId, t: performance.now() }
    current.current = { pts: [p[0] * docRef.current.w, p[1] * docRef.current.h], erase: stateRef.current.tool === 'eraser' }
    send({ t: 'down', p })
    drawOverlay()
  }

  const onMove = (e: React.PointerEvent) => {
    const pt = pointers.current.get(e.pointerId)
    if (pt) {
      pt.x = e.clientX
      pt.y = e.clientY
    }
    const g = gesture.current
    if (g && e.pointerType === 'touch' && [...pointers.current.values()].filter((p) => p.type === 'touch').length >= 2) {
      const now = twoTouch()
      const k = now.dist / Math.max(1, g.dist)
      if (Math.abs(k - 1) > 0.03 || Math.hypot(now.mid.x - g.mid.x, now.mid.y - g.mid.y) > 8) g.moved = true
      const r = stage.current!.getBoundingClientRect()
      const mx = g.mid.x - r.left
      const my = g.mid.y - r.top
      const s = Math.min(g.view.s * 40, Math.max(g.view.s * 0.2, g.view.s * k))
      const f = s / g.view.s
      setView({ s, x: mx + (g.view.x - mx) * f + (now.mid.x - g.mid.x), y: my + (g.view.y - my) * f + (now.mid.y - g.mid.y) })
      return
    }
    const pan = panning.current
    if (pan && pan.id === e.pointerId) {
      setView({ ...pan.view, x: pan.view.x + e.clientX - pan.x, y: pan.view.y + e.clientY - pan.y })
      return
    }
    const st = strokeInfo.current
    if (!st || st.id !== e.pointerId || !docRef.current) return
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = toPaper(ev.clientX, ev.clientY, pressureOf(ev))
      queue.current.push(p)
      current.current?.pts.push(p[0] * docRef.current.w, p[1] * docRef.current.h)
    }
    // Se agrupan los puntos de cada fotograma en un solo mensaje
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0
      flush()
    })
    drawOverlay()
  }

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g) {
      const left = [...pointers.current.values()].filter((p) => p.type === 'touch').length
      if (left === 0) {
        // Toque rápido con varios dedos sin moverlos: deshacer (2) o rehacer (3)
        if (!g.moved && performance.now() - g.t < 350) {
          if (g.count === 2) send({ t: 'undo' })
          if (g.count >= 3) send({ t: 'redo' })
          pending.current = []
          drawOverlay()
        }
        gesture.current = null
      } else if (left >= 2) {
        const now = twoTouch()
        gesture.current = { ...g, view: viewRef.current, mid: now.mid, dist: now.dist }
      } else gesture.current = { ...g, count: Math.max(g.count, left + 1) }
      return
    }
    if (panning.current?.id === e.pointerId) {
      panning.current = null
      return
    }
    const st = strokeInfo.current
    if (st && st.id === e.pointerId) endStroke(false, toPaper(e.clientX, e.clientY, pressureOf(e)))
  }

  const onCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (strokeInfo.current?.id === e.pointerId) endStroke(true)
    if (panning.current?.id === e.pointerId) panning.current = null
    if (pointers.current.size === 0) gesture.current = null
  }

  const setTool = (t: PadTool) => {
    setState({ ...state, tool: t })
    send({ t: 'tool', tool: t })
  }

  const message =
    conn === 'connecting'
      ? 'Conectando…'
      : conn === 'waiting'
        ? 'Esperando al ordenador… Abre el lienzo en el ordenador.'
        : conn === 'lost'
          ? 'Se ha perdido la conexión. Reconectando…'
          : conn === 'failed'
            ? 'No se ha podido conectar: puede que el QR haya caducado. Genera uno nuevo en el lienzo del ordenador y escanéalo otra vez.'
            : conn === 'replaced'
              ? 'Otro dispositivo se ha conectado como tableta. Escanea el QR otra vez para usar este.'
              : !doc
                ? 'Cargando el dibujo…'
                : ''

  return (
    <div className="tpad">
      <header className="tpad-bar">
        <span className={conn === 'ready' ? 'tpad-dot on' : 'tpad-dot'} />
        <span className="tpad-name">{doc?.name || 'FreeDesign'}</span>
        <div className="tpad-tools">
          <button className={state.tool !== 'eraser' ? 'on' : ''} onClick={() => setTool('brush')} aria-label="Pincel" title="Pincel">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 3.5l2 2-8 8-3 1 1-3zM4 16.5c1.5 0 2.5-1 2.5-2.5" />
            </svg>
          </button>
          <button className={state.tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')} aria-label="Borrador" title="Borrador">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 16.5h9M3.5 12.5l7-7 5 5-6 6H7z" />
            </svg>
          </button>
          <span className="tpad-color" style={{ background: state.color }} title="Color (se elige en el ordenador)" />
          <button onClick={() => send({ t: 'undo' })} aria-label="Deshacer" title="Deshacer">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 5L3.5 8.5 7 12M4 8.5h8a4.5 4.5 0 010 9H9" />
            </svg>
          </button>
          <button onClick={() => send({ t: 'redo' })} aria-label="Rehacer" title="Rehacer">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 5l3.5 3.5L13 12M16 8.5H8a4.5 4.5 0 000 9h3" />
            </svg>
          </button>
          <button onClick={fit} aria-label="Encajar" title="Encajar el papel">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
            </svg>
          </button>
        </div>
      </header>
      <div className="tpad-size">
        <span>Tamaño</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={Math.log(Math.max(1, state.size)) / Math.log(500)}
          onChange={(e) => {
            const n = Math.max(1, Math.round(500 ** Number(e.target.value)))
            setState({ ...state, size: n })
            send({ t: 'size', size: n })
          }}
        />
        <span className="tpad-size-val">{Math.round(state.size)}</span>
      </div>

      <div ref={stage} className="tpad-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
        {doc && (
          <div className="tpad-paper" style={{ width: doc.w, height: doc.h, background: doc.paper, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            {full && <img src={full.src} alt="" draggable={false} />}
            {detail && view.s * doc.w > (stage.current?.clientWidth ?? 0) * 1.1 && (
              <img
                src={detail.src}
                alt=""
                draggable={false}
                style={{ left: detail.x0 * doc.w, top: detail.y0 * doc.h, width: (detail.x1 - detail.x0) * doc.w, height: (detail.y1 - detail.y0) * doc.h }}
              />
            )}
          </div>
        )}
        <canvas ref={overlay} className="tpad-overlay" />
        {message && (
          <div className="tpad-msg">
            {message}
            {(conn === 'failed' || conn === 'replaced') && (
              <div>
                <Link to="/tableta" className="tpad-again">
                  Escanear el QR
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
