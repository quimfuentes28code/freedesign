/**
 * App instalable (PWA): registra el service worker (`public/sw.js`) y gestiona las actualizaciones y la instalación.
 *
 * Actualizaciones: al abrir la app o volver a ella se mira si hay versión nueva. Si la hay, se descarga por detrás y se
 * cambia a ella cuando la app pasa a segundo plano (no a media pincelada); la próxima vez que se abra ya es la nueva.
 * Instalación: Android y Chrome de ordenador avisan con `beforeinstallprompt` y se instala con un botón; en iPhone y
 * iPad no hay aviso y se hace desde Compartir → «Añadir a pantalla de inicio» (ver `InstallAppCard`).
 */
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })

  window.addEventListener('load', async () => {
    let reg: ServiceWorkerRegistration
    try {
      reg = await navigator.serviceWorker.register('/sw.js')
    } catch {
      return
    }
    const hadController = !!navigator.serviceWorker.controller

    // Pasa a la versión nueva cuando la app no se está mirando
    const applyWhenHidden = (worker: ServiceWorker) => {
      const apply = () => {
        if (document.visibilityState === 'hidden') {
          worker.postMessage('SKIP_WAITING')
          document.removeEventListener('visibilitychange', apply)
        }
      }
      document.addEventListener('visibilitychange', apply)
      apply()
    }
    if (reg.waiting && hadController) applyWhenHidden(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) applyWhenHidden(worker)
      })
    })

    // Ya con la versión nueva activa: recargar (estando en segundo plano no se nota)
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return
      reloading = true
      if (document.visibilityState === 'hidden') window.location.reload()
      else document.addEventListener('visibilitychange', () => window.location.reload(), { once: true })
    })

    // Mirar si hay versión nueva cada vez que se vuelve a la app (en iPad la app puede quedarse abierta días)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  })
}

/** ¿Se está usando ya como app instalada? */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone o iPad (el iPad moderno se presenta como Mac con pantalla táctil). */
export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** Estado de la instalación para la interfaz: si se puede instalar con un botón y la función que lo hace. */
export function useInstallPrompt() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const install = async () => {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    notify()
    return outcome === 'accepted'
  }
  return { canPrompt: !!deferredPrompt, install }
}
