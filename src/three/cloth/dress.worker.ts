/// <reference lib="webworker" />
import { dressPatternGarment, type DressInput } from './dress'

/** Hilo aparte que calcula la prenda, para que la página no se congele mientras la tela se asienta. */
self.onmessage = (e: MessageEvent<{ id: number; input: DressInput }>) => {
  const { id, input } = e.data
  try {
    const out = dressPatternGarment(input)
    const buffers = [out.position, out.normal, out.uv, out.skinIndex, out.skinWeight, out.index, out.surface.points, out.surface.normals, out.occlusion, out.wrinkle].map((a) => a.buffer)
    self.postMessage({ id, out }, { transfer: buffers as ArrayBuffer[] })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
