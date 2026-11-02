import { useMemo } from 'react'
import { TORSO_DEPTH, bodyProfile, type BodyDims } from './body'

const SKIN = '#d9d2c7'

/** Maniquí paramétrico hecho con formas simples. Más adelante se puede sustituir por un modelo .glb. */
export function Avatar({ d }: { d: BodyDims }) {
  const profile = useMemo(() => bodyProfile(d), [d])
  const skin = <meshStandardMaterial color={SKIN} roughness={0.6} />
  const legLength = d.legTop - d.legBottom

  return (
    <group>
      <mesh castShadow scale={[1, 1, TORSO_DEPTH]}>
        <latheGeometry args={[profile, 64]} />
        {skin}
      </mesh>

      <mesh castShadow position={[0, 0.86 * d.H, 0]}>
        <cylinderGeometry args={[d.neckR, d.neckR * 1.1, 0.06 * d.H, 24]} />
        {skin}
      </mesh>
      <mesh castShadow position={[0, 0.935 * d.H, 0.005]} scale={[1, 1.2, 1.05]}>
        <sphereGeometry args={[0.052 * d.H, 32, 32]} />
        {skin}
      </mesh>

      {[-1, 1].map((side) => (
        <group key={`arm${side}`} position={[side * d.shoulderX, d.shoulderY, 0]} rotation={[0, 0, side * d.armAngle]}>
          <mesh castShadow position={[0, -d.armLength / 2, 0]}>
            <cylinderGeometry args={[d.armRadiusBottom, d.armRadiusTop, d.armLength, 20]} />
            {skin}
          </mesh>
          <mesh castShadow position={[0, -d.armLength - 0.03 * d.s, 0]} scale={[0.8, 1.3, 0.5]}>
            <sphereGeometry args={[0.04 * d.s, 16, 16]} />
            {skin}
          </mesh>
          <mesh castShadow>
            <sphereGeometry args={[d.armRadiusTop * 1.05, 20, 20]} />
            {skin}
          </mesh>
        </group>
      ))}

      {[-1, 1].map((side) => (
        <group key={`leg${side}`}>
          <mesh castShadow position={[side * d.legX, d.legBottom + legLength / 2, 0]}>
            <cylinderGeometry args={[d.legRadiusTop, d.legRadiusBottom, legLength, 24]} />
            {skin}
          </mesh>
          <mesh castShadow position={[side * d.legX, 0.02 * d.H, 0.04 * d.s]}>
            <boxGeometry args={[0.08 * d.s, 0.04 * d.H, 0.22 * d.s]} />
            {skin}
          </mesh>
        </group>
      ))}
    </group>
  )
}
