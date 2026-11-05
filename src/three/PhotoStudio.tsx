import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Plató de fotos para la portada: fondo infinito blanco (suelo y pared unidos por una curva), focos de estudio con
 * ventana octogonal y luz cálida, y el resto del estudio a oscuras. Todo en metros, con el suelo en y = 0 y el
 * maniquí en el centro, mirando hacia +z.
 */

/** Luz cálida de tungsteno (unos 3 000 K). */
export const WARM = '#ffd3a3'

/** Fondo infinito: perfil (z, y) del suelo, la curva y la pared, repetido a lo ancho. */
function cycloramaGeometry(width: number, front: number, back: number, radius: number, height: number) {
  const profile: [number, number][] = []
  // Suelo (de delante hacia la curva)
  for (let i = 0; i <= 6; i++) profile.push([front - ((front - back) * i) / 6, 0])
  // Curva: un cuarto de círculo
  for (let i = 1; i <= 20; i++) {
    const a = (i / 20) * (Math.PI / 2)
    profile.push([back - Math.sin(a) * radius, radius - Math.cos(a) * radius])
  }
  // Pared
  for (let i = 1; i <= 6; i++) profile.push([back - radius, radius + ((height - radius) * i) / 6])

  const cols = 24
  const pos: number[] = []
  const uv: number[] = []
  for (const [z, y] of profile) {
    for (let c = 0; c <= cols; c++) {
      const x = -width / 2 + (width * c) / cols
      pos.push(x, y, z)
      uv.push(c / cols, y / height)
    }
  }
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

/** Halo de luz (degradado radial) para que la ventana del foco parezca encendida. */
function glowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,214,160,0.9)')
  g.addColorStop(0.35, 'rgba(255,190,120,0.35)')
  g.addColorStop(1, 'rgba(255,170,90,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const metal = new THREE.MeshStandardMaterial({ color: '#1b1b1c', metalness: 0.85, roughness: 0.35 })
const fabric = new THREE.MeshStandardMaterial({ color: '#0e0e0f', roughness: 0.85, side: THREE.DoubleSide })

interface LampProps {
  position: [number, number, number]
  /** Altura de la ventana del foco. */
  height?: number
  /** Punto al que apunta. */
  target: [number, number, number]
  /** Ancho y alto de la ventana (un octógono si son iguales; una tira si es alta y estrecha). */
  size?: [number, number]
  intensity: number
  castShadow?: boolean
  glow: THREE.Texture
}

/** Foco de estudio: trípode, mástil y ventana (softbox) encendida con su luz. */
function StudioLamp({ position, height = 1.95, target, size = [1.1, 1.1], intensity, castShadow, glow }: LampProps) {
  const head = useRef<THREE.Group>(null)
  const light = useRef<THREE.SpotLight>(null)
  const [x, , z] = position
  const headPos = useMemo(() => new THREE.Vector3(x, height, z), [x, height, z])
  const aim = useMemo(() => new THREE.Vector3(...target), [target])
  useLayoutEffect(() => {
    head.current?.lookAt(aim)
    if (light.current) {
      light.current.target.position.copy(aim)
      light.current.target.updateMatrixWorld()
    }
  }, [aim])
  const legs = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]
  const strip = size[1] > size[0] * 1.6
  const hub = 0.55
  return (
    <group>
      {/* Trípode */}
      {legs.map((a) => {
        const foot = new THREE.Vector3(x + Math.cos(a) * 0.42, 0.01, z + Math.sin(a) * 0.42)
        const top = new THREE.Vector3(x, hub, z)
        const mid = foot.clone().add(top).multiplyScalar(0.5)
        const len = foot.distanceTo(top)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize())
        return (
          <mesh key={a} position={mid} quaternion={q} material={metal} castShadow>
            <cylinderGeometry args={[0.011, 0.011, len, 8]} />
          </mesh>
        )
      })}
      {/* Mástil */}
      <mesh position={[x, (hub + height) / 2, z]} material={metal} castShadow>
        <cylinderGeometry args={[0.017, 0.02, height - hub, 10]} />
      </mesh>
      {/* Ventana: caja de tela negra abierta hacia el maniquí, con el difusor encendido */}
      <group ref={head} position={headPos}>
        <group scale={[size[0], size[1], 1]}>
          <mesh rotation-x={Math.PI / 2} position-z={0.22} material={fabric} castShadow>
            <cylinderGeometry args={[0.5, 0.09, 0.44, strip ? 4 : 8, 1, true]} />
          </mesh>
          <mesh position-z={0.441} rotation-z={strip ? Math.PI / 4 : Math.PI / 8}>
            <circleGeometry args={[0.5, strip ? 4 : 8]} />
            <meshBasicMaterial color="#fff1dc" toneMapped={false} />
          </mesh>
        </group>
        <sprite position-z={0.6} scale={[size[0] * 2.4, size[1] * 2.4, 1]}>
          <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.55} toneMapped={false} />
        </sprite>
        <mesh position-z={-0.02} material={metal}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 12]} />
        </mesh>
      </group>
      <spotLight
        ref={light}
        position={headPos}
        color={WARM}
        intensity={intensity}
        angle={0.75}
        penumbra={1}
        decay={2}
        castShadow={castShadow}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />
    </group>
  )
}

/** El plató: fondo infinito, suelo del estudio a oscuras y tres focos (principal, relleno y contraluz) más el del fondo. */
export function PhotoStudio() {
  const cyc = useMemo(() => cycloramaGeometry(7, 3.2, -1.4, 1.5, 5), [])
  const glow = useMemo(() => glowTexture(), [])
  const wallLight = useRef<THREE.SpotLight>(null)
  useLayoutEffect(() => {
    const l = wallLight.current
    if (!l) return
    l.target.position.set(0, 1.4, -2.9)
    l.target.updateMatrixWorld()
  }, [])
  return (
    <group>
      <mesh geometry={cyc} receiveShadow>
        <meshStandardMaterial color="#efe9df" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Suelo del estudio, fuera del fondo blanco */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#17130f" roughness={0.9} />
      </mesh>

      {/* Principal: grande, a la izquierda y por delante */}
      <StudioLamp position={[-2.5, 0, 0.7]} height={2.1} target={[0, 1.2, 0]} size={[1, 1]} intensity={42} castShadow glow={glow} />
      {/* Relleno: a la derecha, más suave */}
      <StudioLamp position={[2.6, 0, 0.4]} height={1.85} target={[0, 1.05, 0]} size={[0.85, 0.85]} intensity={16} glow={glow} />
      {/* Contraluz: tira alta detrás, a la derecha, que perfila la silueta */}
      <StudioLamp position={[1.5, 0, -1.2]} height={1.6} target={[0, 1.2, 0.2]} size={[0.4, 1.4]} intensity={12} glow={glow} />

      {/* Luz del fondo: un foco bajo, escondido detrás del maniquí, que dibuja un halo cálido en la pared */}
      <spotLight ref={wallLight} position={[0, 0.25, -1.1]} color={WARM} intensity={10} angle={0.9} penumbra={1} decay={2} />
    </group>
  )
}
