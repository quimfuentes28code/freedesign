import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Plató de fotos para la portada, lo más parecido a uno de verdad: fondo infinito blanco (suelo y pared unidos por
 * una curva) en una nave a oscuras con suelo de hormigón, flashes de estudio con su modificador (octabox, paraguas
 * y stripbox) sobre pies telescópicos con sacos de arena y cables, un V-flat y cajas de producción. Todo en metros,
 * con el suelo en y = 0 y el maniquí en el centro mirando hacia +z.
 */

/** Luz cálida de tungsteno (unos 3 200 K), algo desaturada para que el blanco siga pareciendo blanco. */
export const WARM = '#ffe4c4'

// --- Texturas hechas en el navegador (sin descargar nada) ---

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  paint(canvas.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 8
  return t
}

/** Ruido suave (manchas grandes y grano fino). */
function speckle(ctx: CanvasRenderingContext2D, size: number, base: string, dark: number, light: number, blobs: number) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < blobs; i++) {
    const r = size * (0.05 + Math.random() * 0.2)
    const x = Math.random() * size
    const y = Math.random() * size
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() < 0.5 ? `rgba(0,0,0,${dark})` : `rgba(255,255,255,${light})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

/** Hormigón pulido del suelo de la nave, con juntas. */
const concrete = () =>
  canvasTexture(
    512,
    (ctx, s) => {
      speckle(ctx, s, '#3a3632', 0.25, 0.05, 60)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, s - 1)
      ctx.lineTo(s, s - 1)
      ctx.moveTo(s - 1, 0)
      ctx.lineTo(s - 1, s)
      ctx.stroke()
    },
    8,
  )

/** Pintura blanca del fondo infinito: casi lisa, con algo de suciedad y marcas de pisadas abajo. */
const cycPaint = () =>
  canvasTexture(1024, (ctx, s) => {
    speckle(ctx, s, '#f3f1ec', 0.025, 0.02, 40)
    // Marcas de pisadas y roces en la zona del suelo (la parte de abajo de la imagen)
    for (let i = 0; i < 70; i++) {
      const x = s * (0.25 + Math.random() * 0.5)
      const y = s * (0.02 + Math.random() * 0.22)
      ctx.fillStyle = `rgba(90,80,70,${0.02 + Math.random() * 0.04})`
      ctx.beginPath()
      ctx.ellipse(x, y, 6 + Math.random() * 14, 3 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  })

/** Difusor de la ventana: blanco con el centro más brillante (el flash detrás) y el borde que cae. */
const diffuserTexture = (strip = false) =>
  canvasTexture(256, (ctx, s) => {
    const g = strip ? ctx.createLinearGradient(0, 0, s, 0) : ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    if (strip) {
      g.addColorStop(0, '#b9a58c')
      g.addColorStop(0.5, '#ffffff')
      g.addColorStop(1, '#b9a58c')
    } else {
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.55, '#fbf2e6')
      g.addColorStop(0.92, '#d8c6ae')
      g.addColorStop(1, '#8c7a66')
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })

// --- Materiales ---

const M = {
  metal: new THREE.MeshStandardMaterial({ color: '#202022', metalness: 0.9, roughness: 0.32 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#b9b9bd', metalness: 1, roughness: 0.18 }),
  knob: new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.5 }),
  strobe: new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.2, roughness: 0.45 }),
  fabric: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.72, side: THREE.DoubleSide }),
  silver: new THREE.MeshStandardMaterial({ color: '#d9d9dc', metalness: 0.85, roughness: 0.3, side: THREE.BackSide }),
  sand: new THREE.MeshStandardMaterial({ color: '#2b2722', roughness: 0.95 }),
  cable: new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.8 }),
  foamWhite: new THREE.MeshStandardMaterial({ color: '#ecebe7', roughness: 0.95 }),
  foamBlack: new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.95 }),
}

/** Material que brilla (pasa del blanco: la cámara lo ve encendido y el «bloom» le da el halo). */
const glowMaterial = (map: THREE.Texture, power: number) =>
  new THREE.MeshBasicMaterial({ map, color: new THREE.Color(WARM).multiplyScalar(power), toneMapped: false, side: THREE.DoubleSide })

// --- Geometría ---

/** Fondo infinito: perfil (z, y) del suelo, la curva y la pared, repetido a lo ancho. */
function cycloramaGeometry(width: number, front: number, back: number, radius: number, height: number) {
  const profile: [number, number][] = []
  for (let i = 0; i <= 8; i++) profile.push([front - ((front - back) * i) / 8, 0])
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2)
    profile.push([back - Math.sin(a) * radius, radius - Math.cos(a) * radius])
  }
  for (let i = 1; i <= 8; i++) profile.push([back - radius, radius + ((height - radius) * i) / 8])
  // Longitud a lo largo del perfil (para la textura)
  const dist = [0]
  for (let i = 1; i < profile.length; i++) dist.push(dist[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
  const total = dist[dist.length - 1]
  const cols = 32
  const pos: number[] = []
  const uv: number[] = []
  profile.forEach(([z, y], r) => {
    for (let c = 0; c <= cols; c++) {
      pos.push(-width / 2 + (width * c) / cols, y, z)
      uv.push(c / cols, dist[r] / total)
    }
  })
  const index: number[] = []
  for (let r = 0; r < profile.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c
      const b = a + cols + 1
      index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

type V3 = [number, number, number]

/** Un cilindro entre dos puntos. */
function Rod({ from, to, r, material }: { from: V3; to: V3; r: number; material: THREE.Material }) {
  const { mid, q, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    return { mid: a.clone().add(b).multiplyScalar(0.5), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), length: dir.length() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.join(), to.join()])
  return (
    <mesh position={mid} quaternion={q} material={material} castShadow>
      <cylinderGeometry args={[r, r, length, 10]} />
    </mesh>
  )
}

/** Cable que baja del flash y se queda tirado por el suelo. */
function Cable({ points }: { points: V3[] }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 80, 0.006, 6), [JSON.stringify(points)])
  return <mesh geometry={geo} material={M.cable} castShadow />
}

/** Pie de luz: trípode con patas abiertas, tubos telescópicos de dos grosores, roscas y un saco de arena en una pata. */
function LightStand({ x, z, height, legAngle = 0 }: { x: number; z: number; height: number; legAngle?: number }) {
  const hub = 0.62
  const spread = 0.48
  const legs = [0, 1, 2].map((i) => legAngle + (i * 2 * Math.PI) / 3)
  const top: V3 = [x, hub, z]
  return (
    <group>
      {legs.map((a) => {
        const foot: V3 = [x + Math.cos(a) * spread, 0.012, z + Math.sin(a) * spread]
        const brace: V3 = [x + Math.cos(a) * spread * 0.55, hub * 0.55 + 0.012 * 0.45, z + Math.sin(a) * spread * 0.55]
        return (
          <group key={a}>
            <Rod from={foot} to={top} r={0.012} material={M.metal} />
            {/* Tirante de la pata al tubo */}
            <Rod from={brace} to={[x, hub - 0.22, z]} r={0.006} material={M.metal} />
            <mesh position={foot} material={M.knob}>
              <sphereGeometry args={[0.018, 10, 8]} />
            </mesh>
          </group>
        )
      })}
      {/* Saco de arena sobre la primera pata */}
      <mesh position={[x + Math.cos(legs[0]) * spread * 0.62, 0.05, z + Math.sin(legs[0]) * spread * 0.62]} rotation={[0, -legs[0], Math.PI / 2]} material={M.sand} castShadow receiveShadow>
        <capsuleGeometry args={[0.045, 0.18, 6, 12]} />
      </mesh>
      {/* Tubos: el de abajo más grueso, con sus roscas */}
      <mesh position={[x, (0.45 + hub + 0.55) / 2, z]} material={M.metal} castShadow>
        <cylinderGeometry args={[0.02, 0.02, hub + 0.1, 12]} />
      </mesh>
      <mesh position={[x, (hub + 0.55 + height) / 2, z]} material={M.chrome} castShadow>
        <cylinderGeometry args={[0.014, 0.014, height - hub - 0.55, 12]} />
      </mesh>
      {[hub - 0.15, hub + 0.55].map((y) => (
        <group key={y}>
          <mesh position={[x, y, z]} material={M.knob}>
            <cylinderGeometry args={[0.027, 0.027, 0.04, 14]} />
          </mesh>
          <mesh position={[x + 0.04, y, z]} rotation-z={Math.PI / 2} material={M.knob}>
            <cylinderGeometry args={[0.008, 0.008, 0.05, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Cabeza de flash: cuerpo cilíndrico con rejillas de ventilación, asa y la horquilla que lo une al pie. */
function StrobeHead() {
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position-z={-0.12} material={M.strobe} castShadow>
        <cylinderGeometry args={[0.065, 0.075, 0.24, 20]} />
      </mesh>
      {[-0.17, -0.12, -0.07].map((z) => (
        <mesh key={z} position-z={z} material={M.knob}>
          <torusGeometry args={[0.073, 0.004, 6, 24]} />
        </mesh>
      ))}
      <mesh position={[0, 0.07, -0.18]} rotation-y={Math.PI / 2} material={M.knob}>
        <torusGeometry args={[0.04, 0.008, 6, 16, Math.PI]} />
      </mesh>
      <mesh position={[0, -0.09, -0.12]} material={M.metal}>
        <boxGeometry args={[0.03, 0.08, 0.05]} />
      </mesh>
    </group>
  )
}

type Modifier = 'octa' | 'umbrella' | 'strip'

interface LampProps {
  position: V3
  height: number
  target: V3
  modifier: Modifier
  /** Tamaño del modificador (diámetro; en la stripbox, el alto). */
  size: number
  intensity: number
  castShadow?: boolean
  cable: V3[]
  legAngle?: number
}

/** Flash de estudio con su modificador, sobre su pie, con su luz (un foco cálido que apunta al maniquí). */
function StudioLamp({ position, height, target, modifier, size, intensity, castShadow, cable, legAngle }: LampProps) {
  const head = useRef<THREE.Group>(null)
  const light = useRef<THREE.SpotLight>(null)
  const [x, , z] = position
  const headPos = useMemo(() => new THREE.Vector3(x, height, z), [x, height, z])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aim = useMemo(() => new THREE.Vector3(...target), [target.join()])
  const diffuser = useMemo(() => glowMaterial(diffuserTexture(modifier === 'strip'), modifier === 'umbrella' ? 2.2 : 3), [modifier])
  useLayoutEffect(() => {
    head.current?.lookAt(aim)
    if (light.current) {
      light.current.target.position.copy(aim)
      light.current.target.updateMatrixWorld()
    }
  }, [aim])
  const r = size / 2
  const cap = Math.PI / 3.2
  return (
    <group>
      <LightStand x={x} z={z} height={height - 0.12} legAngle={legAngle} />
      <Cable points={cable} />
      <group ref={head} position={headPos}>
        <StrobeHead />
        {modifier === 'octa' && (
          <group>
            {/* Octabox: ocho paneles de tela negra hasta el difusor, con el borde por delante */}
            <mesh rotation-x={Math.PI / 2} position-z={0.2} material={M.fabric} castShadow>
              <cylinderGeometry args={[r, 0.11, 0.4, 8, 1, true]} />
            </mesh>
            <mesh position-z={0.4} rotation-z={Math.PI / 8} material={M.fabric}>
              <ringGeometry args={[r * 0.93, r * 1.02, 8]} />
            </mesh>
            <mesh position-z={0.392} rotation-z={Math.PI / 8} material={diffuser}>
              <circleGeometry args={[r * 0.94, 8]} />
            </mesh>
            <mesh rotation-x={Math.PI / 2} position-z={0.01} material={M.metal}>
              <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
            </mesh>
          </group>
        )}
        {modifier === 'umbrella' && (
          <group>
            {/* Paraguas plateado abierto hacia el maniquí, con su vástago */}
            <group position-z={0.45 + r * Math.cos(cap)} rotation-x={Math.PI / 2}>
              <mesh material={M.silver} castShadow>
                <sphereGeometry args={[r, 16, 8, 0, Math.PI * 2, Math.PI - cap, cap]} />
              </mesh>
              <mesh material={M.fabric}>
                <sphereGeometry args={[r * 1.01, 16, 8, 0, Math.PI * 2, Math.PI - cap, cap]} />
              </mesh>
            </group>
            {/* Punto caliente: el reflejo del flash en el fondo del paraguas */}
            <mesh position-z={0.46 + r * Math.cos(cap) - r} material={diffuser}>
              <circleGeometry args={[r * 0.38, 16]} />
            </mesh>
            <Rod from={[0, 0, -0.05]} to={[0, 0, 0.5]} r={0.005} material={M.chrome} />
          </group>
        )}
        {modifier === 'strip' && (
          <group>
            {/* Stripbox: caja estrecha y alta */}
            <mesh position-z={0.17} material={M.fabric} castShadow>
              <boxGeometry args={[size * 0.28, size, 0.32]} />
            </mesh>
            <mesh position-z={0.332} material={diffuser}>
              <planeGeometry args={[size * 0.25, size * 0.97]} />
            </mesh>
          </group>
        )}
      </group>
      <spotLight
        ref={light}
        position={headPos}
        color={WARM}
        intensity={intensity}
        angle={0.8}
        penumbra={1}
        decay={2}
        castShadow={castShadow}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={8}
      />
    </group>
  )
}

/** V-flat: dos paneles de cartón pluma unidos, blancos por dentro y negros por fuera. */
function VFlat({ position, rotation }: { position: V3; rotation: number }) {
  const w = 1.2
  const h = 2.4
  const panel = (side: number) => (
    <group rotation-y={side * 0.55}>
      <mesh position={[side * (w / 2), h / 2, 0]} material={M.foamWhite} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.05]} />
      </mesh>
      <mesh position={[side * (w / 2), h / 2, -0.027]} rotation-y={Math.PI} material={M.foamBlack}>
        <planeGeometry args={[w, h]} />
      </mesh>
    </group>
  )
  return (
    <group position={position} rotation-y={rotation}>
      {panel(-1)}
      {panel(1)}
    </group>
  )
}

/** Cajas de producción («apple boxes») apiladas. */
function AppleBoxes({ position }: { position: V3 }) {
  const boxes: [number, number, number, number, number][] = [
    [0, 0.1, 0, 0, 0.2],
    [0.02, 0.3, -0.01, 0.12, 0.2],
    [-0.01, 0.45, 0.01, -0.08, 0.1],
  ]
  return (
    <group position={position}>
      {boxes.map(([x, y, z, r, h], i) => (
        <mesh key={i} position={[x, y, z]} rotation-y={r} material={M.wood} castShadow receiveShadow>
          <boxGeometry args={[0.5, h, 0.3]} />
        </mesh>
      ))}
    </group>
  )
}

/** El plató completo: fondo, nave, flashes y atrezo. */
export function PhotoStudio() {
  const cyc = useMemo(() => cycloramaGeometry(5.4, 3.2, -1.5, 1.6, 5), [])
  const paint = useMemo(() => cycPaint(), [])
  const floor = useMemo(() => concrete(), [])
  const wallLight = useRef<THREE.SpotLight>(null)
  useLayoutEffect(() => {
    const l = wallLight.current
    if (!l) return
    l.target.position.set(0, 1.6, -3.1)
    l.target.updateMatrixWorld()
  }, [])
  return (
    <group>
      <mesh geometry={cyc} receiveShadow>
        <meshStandardMaterial map={paint} color="#ffffff" roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {/* Suelo de la nave, fuera del fondo blanco */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.003} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial map={floor} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Pared de la nave, a lo lejos */}
      <mesh position={[0, 4, -7]}>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#1c1a18" roughness={1} />
      </mesh>

      {/* Principal: octabox grande delante a la derecha */}
      <StudioLamp
        position={[1.75, 0, 0.6]}
        height={2.05}
        target={[0, 1.25, 0]}
        modifier="octa"
        size={1.2}
        intensity={36}
        castShadow
        legAngle={2.6}
        cable={[[1.75, 1.9, 0.45], [1.77, 1.2, 0.55], [1.79, 0.02, 0.67], [1.4, 0.006, 1.4], [0.9, 0.006, 2.5], [0.4, 0.006, 3.9]]}
      />
      {/* Relleno: paraguas plateado delante a la izquierda */}
      <StudioLamp
        position={[-2.35, 0, 0.7]}
        height={1.8}
        target={[0, 1.1, 0]}
        modifier="umbrella"
        size={1.05}
        intensity={13}
        legAngle={0.3}
        cable={[[-2.3, 1.68, 0.6], [-2.36, 0.9, 0.7], [-2.4, 0.02, 0.72], [-2.9, 0.006, 1.3], [-3.6, 0.006, 2.6]]}
      />
      {/* Contraluz: stripbox detrás a la izquierda, que perfila la silueta */}
      <StudioLamp
        position={[-1.4, 0, -1.25]}
        height={1.55}
        target={[0, 1.3, 0.2]}
        modifier="strip"
        size={1.35}
        intensity={12}
        legAngle={1}
        cable={[[-1.45, 1.4, -1.35], [-1.41, 0.6, -1.26], [-1.42, 0.02, -1.2], [-2.2, 0.006, -0.9], [-3.4, 0.006, -0.6]]}
      />
      {/* Luz del fondo: un foco escondido detrás del maniquí que deja un halo cálido en la pared */}
      <spotLight ref={wallLight} position={[0, 0.3, -1.2]} color={WARM} intensity={6} angle={0.85} penumbra={1} decay={2} />

      <VFlat position={[3.3, 0, -0.9]} rotation={-0.9} />
      <AppleBoxes position={[-3.0, 0, -0.2]} />
    </group>
  )
}

/** Revelado de la foto: oclusión ambiental (sombras de contacto), halo de los flashes, viñeta y algo de grano. */
export function StudioEffects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.6} distanceFalloff={0.8} intensity={2.2} quality="medium" />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} radius={0.75} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.28} darkness={0.62} />
      <Noise premultiply opacity={0.35} />
    </EffectComposer>
  )
}
