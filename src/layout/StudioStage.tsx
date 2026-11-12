import { mannequinMeasurements } from '../designer/to3d'
import { Scene } from '../three/Scene'
import type { StageLook } from './StudioBackdrop'

const DEFAULT_MEASUREMENTS = mannequinMeasurements(undefined, 'hombre')

/** El plató de fotos con el maniquí (se carga aparte: lleva three.js, que solo hace falta en la portada). */
export default function StudioStage({ look }: { look: StageLook | null }) {
  return (
    <Scene
      stage="studio"
      measurements={look?.measurements ?? DEFAULT_MEASUREMENTS}
      design={look?.design ?? null}
      outfit={look?.outfit}
      shoes={look?.shoes}
      animate={look?.animate ?? false}
      autoRotate={false}
      frameloop="always"
      interactive
    />
  )
}
