import { useCallback, useRef, useState } from 'react'

/**
 * Estado con deshacer y rehacer. Los cambios seguidos (arrastrar un estampado, mover el selector de color)
 * se agrupan en un solo paso si llegan con menos de medio segundo entre ellos.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState(initial)
  const current = useRef(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const last = useRef(0)
  const [, bump] = useState(0)

  const apply = (v: T) => {
    current.current = v
    setState(v)
    bump((n) => n + 1)
  }

  const set = useCallback((next: T) => {
    const t = Date.now()
    if (t - last.current > 500) {
      past.current.push(current.current)
      if (past.current.length > 100) past.current.shift()
    }
    last.current = t
    future.current = []
    apply(next)
  }, [])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(current.current)
    last.current = 0
    apply(prev)
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(current.current)
    last.current = 0
    apply(next)
  }, [])

  /** Empieza de cero (al cargar), sin historial. */
  const reset = useCallback((v: T) => {
    past.current = []
    future.current = []
    last.current = 0
    apply(v)
  }, [])

  return { state, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}
