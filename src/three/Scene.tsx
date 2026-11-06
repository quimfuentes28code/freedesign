import { ContactShadows, Environment, Lightformer, OrbitControls, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import type { Design, Measurements, ShoeStyle } from '../types'
import { Mannequin } from './Avatar'
import { useDressing } from './cloth/dressClient'
import { PhotoStudio, StudioEffects, WARM } from './PhotoStudio'

interface Props {
  measurements: Measurements
  design: Design
  /** Otras prendas que lleva el maniquí a la vez (van por debajo de `design`). */
  outfit?: Design[]
  autoRotate: boolean
  animate: boolean
  /** Ver el maniquí o solo la ropa. */
  showBody?: boolean
  /** Altura a la que mira la cámara, como fracción de la estatura (por defecto, el centro del cuerpo). */
  focus?: number
  /** Decorado: el estudio claro de siempre o el plató de fotos oscuro con fondo blanco y focos (portada). */
  stage?: 'neutral' | 'studio'
  /** Calzado del maniquí. */
  shoes?: ShoeStyle | null
}

/**
 * Solo en desarrollo: deja la escena en `window.__three` para poder mover la cámara desde la consola
 * y revisar detalles (p. ej. `__three.look([0, 1.4, -1], [0, 1.3, 0])`).
 */
function DevHandle() {
  const { camera, controls, scene, invalidate } = useThree()
  useEffect(() => {
    const w = window as unknown as { __three?: unknown }
    w.__three = {
      camera,
      scene,
      look: (pos: [number, number, number], target: [number, number, number]) => {
        camera.position.set(...pos)
        const c = controls as unknown as { target: { set: (...v: number[]) => void }; update: () => void } | null
        c?.target.set(...target)
        c?.update()
        invalidate()
      },
    }
    return () => {
      delete w.__three
    }
  }, [camera, controls, scene, invalidate])
  return null
}

/** Escena 3D: maniquí con la prenda, en un estudio con luces suaves y cámara orbital para verlo en 360°. */
export function Scene({ measurements, design, outfit, autoRotate, animate, showBody = true, focus = 0.53, stage = 'neutral', shoes }: Props) {
  const studio = stage === 'studio'
  const H = measurements.height / 100
  // Aviso de carga fuera de la escena 3D (el modelo pesa varios MB)
  const { active } = useProgress()
  const dressing = useDressing()

  return (
    <>
      {active && <span className="loading">Cargando maniquí…</span>}
      {!active && dressing && <span className="busy">Ajustando prenda…</span>}
      <Canvas shadows={studio ? 'soft' : true} dpr={[1, 2]} camera={{ position: studio ? [-0.35, 1.38, 4.1] : showBody ? [0, 1.2, 3.6] : [0, H * focus + 0.1, 3.2], fov: studio ? 38 : 36 }}>
        {studio ? (
          <>
            <color attach="background" args={['#0b0907']} />
            <fog attach="fog" args={['#0b0907', 7, 15]} />
            <hemisphereLight args={['#fff1e0', '#1a130d', 0.12]} />
            <PhotoStudio />
            <StudioEffects />
            <Environment resolution={128} frames={1}>
              <Lightformer intensity={0.6} color={WARM} position={[-3, 2, 2]} rotation-y={Math.PI / 3} scale={[2.5, 2.5, 1]} />
              <Lightformer intensity={0.3} color={WARM} position={[3, 1.8, 1.5]} rotation-y={-Math.PI / 3} scale={[2, 2, 1]} />
              <Lightformer intensity={0.15} color="#ffffff" position={[0, 1.5, -3]} scale={[6, 4, 1]} />
            </Environment>
          </>
        ) : (
          <>
        <color attach="background" args={['#e4dfd6']} />
        <fog attach="fog" args={['#e4dfd6', 6, 14]} />

        <hemisphereLight args={['#ffffff', '#b7ae9f', 0.7]} />
        <directionalLight
          position={[2.5, 4.5, 3]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0002}
          // Evita el "acné" de sombra (rayas discontinuas en la tela donde la luz llega rasante)
          shadow-normalBias={0.025}
        >
          <orthographicCamera attach="shadow-camera" args={[-1.5, 1.5, 2.5, -0.5, 0.1, 12]} />
        </directionalLight>
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />

        {/* Luz de estudio suave generada en local (sin descargar mapas de entorno) */}
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={1.5} position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer intensity={1.2} position={[-4, 1.6, 2]} rotation-y={Math.PI / 2.5} scale={[2, 5, 1]} />
          <Lightformer intensity={0.8} position={[4, 1.6, 1]} rotation-y={-Math.PI / 2.5} scale={[2, 5, 1]} />
        </Environment>
          </>
        )}

        <Suspense fallback={null}>
          <Mannequin measurements={measurements} design={design} outfit={outfit} animate={animate} showBody={showBody} shoes={shoes} />
        </Suspense>

        <ContactShadows position={[0, 0.002, 0]} opacity={studio ? 0.65 : 0.5} scale={4} blur={2.2} far={2} resolution={512} />
        <OrbitControls
          target={[0, studio ? H * 0.55 : H * focus, 0]}
          enablePan={false}
          // Se puede acercar mucho para ver costuras y pespuntes
          minDistance={0.45}
          maxDistance={studio ? 7 : 6}
          // En el plató no se baja del suelo ni se pasa por detrás del fondo
          maxPolarAngle={studio ? Math.PI * 0.52 : Math.PI * 0.85}
          minAzimuthAngle={studio ? -1.25 : -Infinity}
          maxAzimuthAngle={studio ? 1.25 : Infinity}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          makeDefault
        />
        {import.meta.env.DEV && <DevHandle />}
      </Canvas>
    </>
  )
}
