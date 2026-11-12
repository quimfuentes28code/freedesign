import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/*
 * Borrar con «Deshacer»: en vez de preguntar antes, se borra al momento a la vista y sale un aviso con «Deshacer»
 * unos segundos. La petición DELETE a la API se manda cuando el aviso se va (o al cerrar la página). Mientras tanto,
 * las listas que llegan de la API no enseñan lo que está por borrar (`hidePending` en `api/client.ts`).
 */

const WAIT = 6000

interface Pending {
  /** Ruta de la API sin /api (p. ej. /clients/abc): es lo que se borra y lo que se esconde de las listas. */
  path: string
  label: string
  timer: number
}

const pending = new Map<string, Pending>()
const listeners = new Set<() => void>()
/** Evento que avisa a las listas (`useApi`) para que se recarguen al deshacer o al terminar de borrar. */
export const PENDING_CHANGED = 'fd:pending-deletes'

function changed() {
  listeners.forEach((l) => l())
  window.dispatchEvent(new Event(PENDING_CHANGED))
}

/** ¿Está por borrar el elemento `id` de la lista `collection` (primer tramo de la ruta, p. ej. «clients»)? */
export function isPendingDelete(collection: string, id: string) {
  return pending.has(`/${collection}/${id}`)
}

async function run(p: Pending, keepalive = false) {
  pending.delete(p.path)
  window.clearTimeout(p.timer)
  try {
    const res = await fetch(`/api${p.path}`, { method: 'DELETE', keepalive, headers: { 'Content-Type': 'application/json' } })
    if (!res.ok && res.status !== 404) throw new Error()
  } catch {
    failed = `No se ha podido eliminar «${p.label}». Vuelve a intentarlo.`
  }
  changed()
}

let failed: string | null = null

/**
 * Borra `path` (ruta de la API, p. ej. `/clients/abc`) dentro de unos segundos, con un aviso para deshacerlo.
 * `label` es lo que sale en el aviso («Cliente Ana López»).
 */
export function deleteWithUndo(path: string, label: string) {
  const old = pending.get(path)
  if (old) window.clearTimeout(old.timer)
  const p: Pending = { path, label, timer: 0 }
  p.timer = window.setTimeout(() => run(p), WAIT)
  pending.set(path, p)
  failed = null
  changed()
}

function undo(path: string) {
  const p = pending.get(path)
  if (!p) return
  window.clearTimeout(p.timer)
  pending.delete(path)
  changed()
}

// Al cerrar o recargar la página, lo pendiente se borra ya (keepalive deja terminar la petición)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => [...pending.values()].forEach((p) => run(p, true)))
}

/** Avisos de «Eliminado · Deshacer». Va una vez en la app, encima de todo (también del lienzo). */
export function UndoToasts() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  useEffect(() => {
    if (!failed) return
    const t = window.setTimeout(() => {
      failed = null
      force((n) => n + 1)
    }, WAIT)
    return () => window.clearTimeout(t)
  })

  const items = [...pending.values()]
  if (!items.length && !failed) return null
  return createPortal(
    <div className="undo-toasts" role="status" aria-live="polite">
      {items.map((p) => (
        <div key={p.path} className="undo-toast">
          <span>
            Eliminado: <strong>{p.label}</strong>
          </span>
          <button type="button" onClick={() => undo(p.path)}>
            Deshacer
          </button>
        </div>
      ))}
      {failed && <div className="undo-toast error">{failed}</div>}
    </div>,
    document.body,
  )
}
