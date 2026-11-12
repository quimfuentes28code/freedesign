/**
 * /tableta — escáner del QR del «Móvil como tableta» dentro de la app. Hace falta porque, con la app instalada en el
 * móvil, la cámara del sistema abre el enlace del QR en el navegador y no en la app. Abre la cámara trasera, lee el QR
 * y va a /tableta/<token> (TabletPad). Usa el lector de códigos del navegador si lo tiene (Chrome en Android) y si no
 * (Safari en iPhone/iPad) `jsqr`, que se descarga solo al abrir esta página. Si no hay cámara, se puede pegar el enlace.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './tablet.css'

type Phase = 'starting' | 'scanning' | 'denied' | 'nocam'

/** Saca el token de un enlace del QR (de cualquier dominio de la app) o de un token pegado tal cual. */
export function tokenFrom(text: string): string | null {
  const t = text.trim()
  const m = t.match(/\/tableta\/([A-Za-z0-9_-]{32})(?:[/?#]|$)/) ?? t.match(/^([A-Za-z0-9_-]{32})$/)
  return m ? m[1] : null
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

export function TabletScan() {
  const navigate = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [hint, setHint] = useState('')
  const [pasted, setPasted] = useState('')

  useEffect(() => {
    let alive = true
    let stream: MediaStream | null = null
    let timer = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    const found = (text: string) => {
      const token = tokenFrom(text)
      if (!token) {
        setHint('Este QR no es el del lienzo de FreeDesign.')
        return false
      }
      if (navigator.vibrate) navigator.vibrate(40)
      alive = false
      navigate(`/tableta/${token}`, { replace: true })
      return true
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setPhase('nocam')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (err) {
        const name = (err as DOMException).name
        return setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'nocam')
      }
      if (!alive) return
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      setPhase('scanning')

      // Lector del navegador si sabe leer QR; si no, jsQR
      let detector: Detector | null = null
      const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
      if (BD) {
        try {
          const formats = (await BD.getSupportedFormats?.()) ?? ['qr_code']
          if (formats.includes('qr_code')) detector = new BD({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }
      const jsQR = detector ? null : (await import('jsqr')).default

      const tick = async () => {
        if (!alive) return
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              const codes = await detector.detect(v)
              for (const c of codes) if (found(c.rawValue)) return
            } else if (jsQR) {
              // Se reduce el fotograma: más rápido y lee igual
              const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight))
              canvas.width = Math.round(v.videoWidth * k)
              canvas.height = Math.round(v.videoHeight * k)
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
              if (code?.data && found(code.data)) return
            }
          } catch {
            // Fotograma raro: se prueba con el siguiente
          }
        }
        timer = window.setTimeout(tick, 120)
      }
      tick()
    }
    start()
    return () => {
      alive = false
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [navigate])

  const submitPasted = () => {
    const token = tokenFrom(pasted)
    if (token) navigate(`/tableta/${token}`, { replace: true })
    else setHint('Ese enlace no es el del QR del lienzo.')
  }

  return (
    <div className="tscan">
      <header className="tpad-bar">
        <Link to="/" className="tscan-back" aria-label="Volver">
          ‹ Volver
        </Link>
        <span className="tpad-name">Usar este dispositivo como tableta</span>
      </header>
      <div className="tscan-view">
        <video ref={video} className="tscan-video" playsInline muted autoPlay />
        {phase === 'scanning' && <div className="tscan-frame" aria-hidden />}
        {phase !== 'scanning' && (
          <div className="tpad-msg tscan-msg">
            {phase === 'starting' && 'Abriendo la cámara…'}
            {phase === 'denied' && 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o de la app (Ajustes → Safari → Cámara en iPhone) o pega el enlace abajo.'}
            {phase === 'nocam' && 'Este dispositivo no tiene cámara disponible. Pega el enlace del QR abajo.'}
          </div>
        )}
      </div>
      <div className="tscan-help">
        <p>
          En el ordenador, abre el diseño en el lienzo y pulsa el botón <strong>del móvil con lápiz</strong> (arriba a la
          derecha): sale un QR. Apunta la cámara a él.
        </p>
        {hint && <p className="tscan-hint">{hint}</p>}
        <form
          className="tscan-paste"
          onSubmit={(e) => {
            e.preventDefault()
            submitPasted()
          }}
        >
          <input placeholder="…o pega aquí el enlace del QR" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button type="submit" disabled={!pasted.trim()}>
            Conectar
          </button>
        </form>
      </div>
    </div>
  )
}
