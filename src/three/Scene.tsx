import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Design, Measurements } from '../types'
import { Avatar } from './Avatar'
import { Garment } from './Garment'
import { bodyDims } from './body'

interface Props {
  measurements: Measurements
  design: Design
  autoRotate: boolean
}

/** Escena 3D: maniquí + prenda, con cámara orbital para verlo en 360°. */
export function Scene({ measurements, design, autoRotate }: Props) {
  const d = useMemo(() => bodyDims(measurements), [measurements])

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.3, 3.4], fov: 38 }}>
      <color attach="background" args={['#ecebe7']} />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 1.1]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} />

      <Avatar d={d} />
      <Garment d={d} design={design} />

      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={4} blur={2.4} far={2} />
      <OrbitControls
        target={[0, d.H * 0.55, 0]}
        enablePan={false}
        minDistance={1.2}
        maxDistance={6}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
      />
    </Canvas>
  )
}
