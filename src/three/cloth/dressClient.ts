import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import type { DressInput, DressOutput, Underlay } from './dress'

let worker: Worker | null = null
let nextId = 0
/** Último encargo de cada prenda (por su clave): los anteriores de la misma prenda se descartan. */
const latest = new Map<string, number>()
/** Encargos en marcha (para el aviso «Ajustando prenda…»). */
const pending = new Set<number>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Encargos esperando turno: el worker hace uno cada vez y solo se le manda el siguiente al terminar. */
interface Job {
  id: number
  key: string
  input: DressInput
  resolve: (g: THREE.BufferGeometry | null) => void
  reject: (e: Error) => void
}
const queue: Job[] = []
let running: Job | null = null

/** Manda al worker el siguiente encargo vigente; los que ya tienen uno más nuevo de la misma prenda se descartan sin calcular. */
function runNext() {
  if (running) return
  while (queue.length) {
    const job = queue.shift()!
    if (latest.get(job.key) !== job.id) {
      pending.delete(job.id)
      job.resolve(null)
      continue
    }
    running = job
    worker ??= new Worker(new URL('./dress.worker.ts', import.meta.url), { type: 'module' })
    const onMessage = (e: MessageEvent<{ id: number; out?: DressOutput; error?: string }>) => {
      if (e.data.id !== job.id) return
      worker!.removeEventListener('message', onMessage)
      running = null
      pending.delete(job.id)
      if (e.data.error) job.reject(new Error(e.data.error))
      else {
        if (import.meta.env.DEV) console.info('Prenda calculada (ms):', e.data.out?.timings)
        job.resolve(latest.get(job.key) === job.id ? toGeometry(e.data.out!) : null)
      }
      notify()
      // Un momento antes del siguiente: al terminar una prenda de debajo, la de encima vuelve a pedir su cálculo sobre ella
      // (tras repintar React); así el encargo que ha quedado viejo se descarta en vez de calcularse
      setTimeout(runNext, 80)
    }
    worker.addEventListener('message', onMessage)
    // Depuración: en la consola, window.__dressSeconds = 0 muestra la prenda sin asentar
    const seconds = (globalThis as { __dressSeconds?: number }).__dressSeconds
    worker.postMessage({ id: job.id, input: seconds === undefined ? job.input : { ...job.input, seconds } })
    return
  }
  notify()
}

/**
 * Calcula la prenda en un Web Worker y devuelve su geometría. Cada prenda puesta (`key`: la de arriba, el pantalón…)
 * tiene su propio turno: si llega una petición nueva de la misma prenda antes de empezar, la anterior se descarta sin
 * calcularla (con la calidad alta, cada cálculo tarda unos segundos); las de otras prendas siguen su curso.
 */
export function dressInWorker(input: DressInput, key = 'prenda'): Promise<THREE.BufferGeometry | null> {
  const id = ++nextId
  latest.set(key, id)
  pending.add(id)
  notify()
  return new Promise((resolve, reject) => {
    queue.push({ id, key, input, resolve, reject })
    runNext()
  })
}

function toGeometry(out: DressOutput) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(out.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2))
  g.setAttribute('edge', new THREE.BufferAttribute(out.edge, 3))
  g.setAttribute('occlusion', new THREE.BufferAttribute(out.occlusion, 1))
  g.setAttribute('wrinkle', new THREE.BufferAttribute(out.wrinkle, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(out.skinWeight, 4))
  g.setIndex(new THREE.BufferAttribute(out.index, 1))
  for (const [start, count, material] of out.groups) g.addGroup(start, count, material)
  g.userData.pocket = out.pocket
  g.userData.surface = out.surface
  return g
}

// --- Prendas de debajo asentadas: cada capa se calcula sobre las que tiene debajo ---
let underlays = new Map<number, Underlay>()
const underListeners = new Set<() => void>()

/** Cada capa avisa de su superficie al terminar (o null al quitarse). */
export function setUnderlay(layer: number, u: Underlay | null) {
  const next = new Map(underlays)
  if (u) next.set(layer, u)
  else next.delete(layer)
  underlays = next
  underListeners.forEach((l) => l())
}

/** Superficies de todas las capas puestas (cambia cuando alguna se recalcula). */
export function useUnderlays() {
  return useSyncExternalStore(
    (cb) => {
      underListeners.add(cb)
      return () => underListeners.delete(cb)
    },
    () => underlays,
  )
}

/** Las superficies de varias capas juntas, o `undefined` si alguna aún no está calculada. */
export function mergeUnderlays(all: Map<number, Underlay>, layers: number[]): Underlay | null | undefined {
  if (!layers.length) return null
  const list = layers.map((l) => all.get(l))
  if (list.some((u) => !u)) return undefined
  const size = list.reduce((n, u) => n + u!.points.length, 0)
  const points = new Float32Array(size)
  const normals = new Float32Array(size)
  let at = 0
  for (const u of list) {
    points.set(u!.points, at)
    normals.set(u!.normals, at)
    at += u!.points.length
  }
  return { points, normals }
}

/** `true` mientras se está calculando alguna prenda (para mostrar "Ajustando prenda…"). */
export function useDressing() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => pending.size > 0,
  )
}
