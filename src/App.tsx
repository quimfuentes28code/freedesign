import { useState } from 'react'
import { DesignPanel } from './components/DesignPanel'
import { Scene } from './three/Scene'
import type { Design, Measurements } from './types'

const DEFAULT_MEASUREMENTS: Measurements = { height: 172, chest: 92, waist: 76, hips: 98 }
const DEFAULT_DESIGN: Design = { garment: 'camiseta', fit: 'normal', fabric: 'algodon', color: '#c4643a' }

export default function App() {
  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS)
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [autoRotate, setAutoRotate] = useState(true)

  return (
    <div className="layout">
      <main className="viewport">
        <Scene measurements={measurements} design={design} autoRotate={autoRotate} />
        <p className="hint">Arrastra para girar · Rueda o pellizca para acercar</p>
      </main>
      <DesignPanel
        measurements={measurements}
        onMeasurementsChange={setMeasurements}
        design={design}
        onDesignChange={setDesign}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
      />
    </div>
  )
}
