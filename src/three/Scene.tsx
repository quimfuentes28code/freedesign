import { ContactShadows, Environment, Lightformer, OrbitControls, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, type ReactNode } from 'react'
import type { Design, Measurements, ShoeStyle } from '../types'
import { Mannequin } from './Avatar'
import type { PoseId } from './pose'
import { useDressing } from './cloth/dressClient'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { PhotoStudio, StudioEffects, WARM } from './PhotoStudio'

interface Props {
  measurements: Measurements
  /** Prenda que lleva el maniquí (sin prenda no sale maniquí: solo el decorado). */
  design: Design | null
  /** Otras prendas que lleva el maniquí a la vez (van por debajo de `design`). */
  outfit?: Design[]
  autoRotate: boolean
  animate: boolean
  /** Ver el maniquí o solo la ropa. */
  showBody?: boolean
  /** Altura a la que mira la cámara, como fracción de la estatura (por defecto, el centro del cuerpo). */
  focus?: number
  /** Gorro o gorra que lleva además de la ropa. */
  hat?: Design | null
  /** Decorado: el estudio claro de siempre o el plató de fotos oscuro con fondo blanco y focos (portada). */
  stage?: 'neutral' | 'studio'
  /** Calzado del maniquí. */
  shoes?: ShoeStyle | null
  /** «demand» pinta solo cuando algo cambia (el decorado de fondo de los apartados, que no se mueve). */
  frameloop?: 'always' | 'demand'
  /** Se puede girar y acercar con el ratón. */
  interactive?: boolean
  /** Pose del maniquí. */
  pose?: PoseId
  /** Color de la zapatilla de modelo real que se puede teñir (las que llevan `tint`). */
  shoeColor?: string
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

/**
 * Revelado del estudio claro: sombra de contacto (oclusión ambiental) donde la ropa toca el cuerpo y otras prendas,
 * bajo el cuello, en las axilas y entre los pliegues. Es lo que hace que la ropa parezca puesta y no pegada encima.
 */
function NeutralEffects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.18} distanceFalloff={0.6} intensity={1.7} quality="medium" />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

/** Escena 3D: maniquí con la prenda, en un estudio con luces suaves y cámara orbital para verlo en 360°. */
/** Si el navegador puede pintar 3D (WebGL). Se comprueba una vez. */
let webglOk: boolean | null = null
function hasWebGL() {
  if (webglOk === null) {
    try {
      const c = document.createElement('canvas')
      webglOk = !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      webglOk = false
    }
  }
  return webglOk
}

/** Aviso en lugar del 3D cuando el navegador no puede pintarlo (el resto de la aplicación sigue funcionando). */
function No3D({ stage }: { stage: Props['stage'] }) {
  // El plató de fondo, sin aviso: simplemente no se pinta
  if (stage === 'studio') return null
  return (
    <div className="no-3d">
      <p>
        El 3D no está disponible en este navegador o equipo. Prueba a recargar la página, a activar la aceleración por hardware
        o con otro navegador.
      </p>
    </div>
  )
}

/** Atrapa los errores del 3D (p. ej. si el navegador pierde o bloquea WebGL) para que no se caiga toda la página. */
class Safe3D extends Component<{ stage: Props['stage']; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('El 3D ha fallado:', error)
  }
  render() {
    return this.state.failed ? <No3D stage={this.props.stage} /> : this.props.children
  }
}

/** Escena 3D protegida: sin WebGL o si falla, un aviso en su sitio en vez de romper la página. */
export function Scene(props: Props) {
  if (!hasWebGL()) return <No3D stage={props.stage} />
  return (
    <Safe3D stage={props.stage}>
      <SceneInner {...props} />
    </Safe3D>
  )
}

function SceneInner({ measurements, design, outfit, autoRotate, animate, showBody = true, focus = 0.53, stage = 'neutral', shoes, frameloop = 'always', interactive = true, hat, pose, shoeColor }: Props) {
  const studio = stage === 'studio'
  const H = measurements.height / 100
  // Aviso de carga fuera de la escena 3D (el modelo pesa varios MB)
  const { active } = useProgress()
  const dressing = useDressing()

  return (
    <>
      {design && active && <span className="loading">Cargando maniquí…</span>}
      {design && !active && dressing && <span className="busy">Ajustando prenda…</span>}
      <Canvas frameloop={frameloop} shadows="soft" dpr={[1, 2]} camera={{ position: studio ? [-0.35, 1.38, 4.1] : showBody ? [0, 1.2, 3.6] : design?.hat ? [0.35, H * focus + 0.08, 0.95] : [0, H * focus + 0.1, 3.2], fov: studio ? 38 : 36 }}>
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
        {/* Gris claro neutro, como un programa de patronaje 3D: la ropa y el maniquí blanco destacan sin dominar el color */}
        <color attach="background" args={['#d9d9d7']} />
        <fog attach="fog" args={['#d9d9d7', 6, 14]} />
        <NeutralEffects />

        <hemisphereLight args={['#ffffff', '#b7ae9f', 0.7]} />
        <directionalLight
          position={[2.5, 4.5, 3]}
          intensity={1.6}
          castShadow
          // Sombras finas y suaves: con menos resolución, la tela (capucha, pliegues) se manchaba con sombras dentadas
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0002}
          // Evita el "acné" de sombra (rayas discontinuas en la tela donde la luz llega rasante)
          shadow-normalBias={0.045}
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
          {design && <Mannequin measurements={measurements} design={design} outfit={outfit} animate={animate} showBody={showBody} shoes={shoes} hat={hat} pose={pose} shoeColor={shoeColor} />}
        </Suspense>

        <ContactShadows position={[0, 0.002, 0]} opacity={studio ? 0.65 : 0.5} scale={4} blur={2.2} far={2} resolution={512} />
        <OrbitControls
          target={[0, studio ? H * 0.55 : H * focus, 0]}
          enablePan={false}
          // Se puede acercar mucho para ver costuras y pespuntes
          minDistance={design?.hat ? 0.25 : 0.45}
          maxDistance={studio ? 7 : 6}
          // En el plató no se baja del suelo ni se pasa por detrás del fondo
          maxPolarAngle={studio ? Math.PI * 0.52 : Math.PI * 0.85}
          minAzimuthAngle={studio ? -1.25 : -Infinity}
          maxAzimuthAngle={studio ? 1.25 : Infinity}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          enabled={interactive}
          makeDefault
        />
        {import.meta.env.DEV && <DevHandle />}
      </Canvas>
    </>
  )
}
