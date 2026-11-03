import { useState } from 'react'
import { DesignPanel } from './components/DesignPanel'
import { Scene } from './three/Scene'
import type { Design, Measurements } from './types'

const DEFAULT_MEASUREMENTS: Measurements = { height: 172, chest: 92, waist: 76, hips: 98 }
const DEFAULT_DESIGN: Design = {
  garment: 'sudadera',
  fit: 'holgado',
  fabric: 'felpa',
  color: '#c9b89f',
  hood: true,
  pocket: true,
  bodyLength: 70,
  sleeveLength: 64,
}

export default function App() {
  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS)
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [autoRotate, setAutoRotate] = useState(true)
  // Animación activada salvo que el sistema pida reducir el movimiento
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  return (
    <div className="layout">
      <main className="viewport">
        <Scene measurements={measurements} design={design} autoRotate={autoRotate} animate={animate} />
        <p className="hint">Arrastra para girar · Rueda o pellizca para acercar</p>
      </main>
      <DesignPanel
        measurements={measurements}
        onMeasurementsChange={setMeasurements}
        design={design}
        onDesignChange={setDesign}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        animate={animate}
        onAnimateChange={setAnimate}
      />
    </div>
  )
}
