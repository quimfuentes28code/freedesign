import { useMemo } from 'react'
import * as THREE from 'three'
import { FABRICS } from '../data/fabrics'
import type { Design } from '../types'
import { FIT_EASE, TORSO_DEPTH, garmentProfile, type BodyDims } from './body'

/** Proporción del brazo que cubre cada tipo de manga. */
const SLEEVE_COVERAGE = { camiseta: 0.3, 'manga-larga': 0.95 } as const

/** Prenda generada a partir de las medidas del cuerpo, el tipo, el ajuste y la tela. */
export function Garment({ d, design }: { d: BodyDims; design: Design }) {
  const ease = FIT_EASE[design.fit]
  const profile = useMemo(() => garmentProfile(d, design.garment, ease), [d, design.garment, ease])
  const fabric = FABRICS[design.fabric]

  const material = (
    <meshPhysicalMaterial
      color={design.color}
      roughness={fabric.roughness}
      sheen={fabric.sheen}
      sheenRoughness={fabric.sheenRoughness}
      sheenColor={design.color}
      clearcoat={fabric.clearcoat}
      side={THREE.DoubleSide}
    />
  )

  const sleeve = design.garment === 'camiseta' || design.garment === 'manga-larga' ? SLEEVE_COVERAGE[design.garment] : 0
  const sleeveLength = d.armLength * sleeve
  const sleeveEase = ease * 0.6 + 0.004
  const legLength = d.legTop - d.legBottom

  return (
    <group>
      <mesh castShadow scale={[1, 1, TORSO_DEPTH]}>
        <latheGeometry args={[profile, 64]} />
        {material}
      </mesh>

      {sleeve > 0 &&
        [-1, 1].map((side) => (
          <group key={side} position={[side * d.shoulderX, d.shoulderY, 0]} rotation={[0, 0, side * d.armAngle]}>
            <mesh castShadow position={[0, -sleeveLength / 2, 0]}>
              <cylinderGeometry
                args={[
                  THREE.MathUtils.lerp(d.armRadiusTop, d.armRadiusBottom, sleeve) + sleeveEase,
                  d.armRadiusTop + sleeveEase,
                  sleeveLength,
                  24,
                  1,
                  true,
                ]}
              />
              {material}
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[d.armRadiusTop + sleeveEase, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
              {material}
            </mesh>
          </group>
        ))}

      {design.garment === 'pantalon' &&
        [-1, 1].map((side) => (
          <mesh key={side} castShadow position={[side * d.legX, d.legBottom + legLength / 2 + 0.01, 0]}>
            <cylinderGeometry
              args={[d.legRadiusTop + ease, d.legRadiusBottom + ease * 1.5 + 0.01, legLength, 24, 1, true]}
            />
            {material}
          </mesh>
        ))}
    </group>
  )
}
