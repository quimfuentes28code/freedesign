import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import type { DressInput, DressOutput } from './dress'

let worker: Worker | null = null
let nextId = 0
let latest = 0
let busy = false
const listeners = new Set<() => void>()
const setBusy = (v: boolean) => {
  busy = v
  listeners.forEach((l) => l())
}

/**
 * Calcula la prenda en un Web Worker y devuelve su geometría. Si llega una petición nueva antes de terminar,
 * la anterior se descarta (solo importa la última).
 */
export function dressInWorker(input: DressInput): Promise<THREE.BufferGeometry | null> {
  worker ??= new Worker(new URL('./dress.worker.ts', import.meta.url), { type: 'module' })
  const id = ++nextId
  latest = id
  setBusy(true)
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; out?: DressOutput; error?: string }>) => {
      if (e.data.id !== id) return
      worker!.removeEventListener('message', onMessage)
      if (id === latest) setBusy(false)
      if (e.data.error) return reject(new Error(e.data.error))
      if (import.meta.env.DEV) console.info('Prenda calculada (ms):', e.data.out?.timings)
      resolve(id === latest ? toGeometry(e.data.out!) : null)
    }
    worker!.addEventListener('message', onMessage)
    // Depuración: en la consola, window.__dressSeconds = 0 muestra la prenda sin asentar
    const seconds = (globalThis as { __dressSeconds?: number }).__dressSeconds
    worker!.postMessage({ id, input: seconds === undefined ? input : { ...input, seconds } })
  })
}

function toGeometry(out: DressOutput) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(out.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(out.skinWeight, 4))
  g.setIndex(new THREE.BufferAttribute(out.index, 1))
  for (const [start, count, material] of out.groups) g.addGroup(start, count, material)
  return g
}

/** `true` mientras se está calculando una prenda (para mostrar "Ajustando prenda…"). */
export function useDressing() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => busy,
  )
}
