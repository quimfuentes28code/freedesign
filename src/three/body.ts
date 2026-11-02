import * as THREE from 'three'
import type { Fit, GarmentType, Measurements } from '../types'

/** El torso es elíptico: la profundidad (eje Z) es este factor de la anchura. */
export const TORSO_DEPTH = 0.75

/** Holgura que añade cada ajuste sobre el cuerpo, en metros. */
export const FIT_EASE: Record<Fit, number> = {
  ajustado: 0.008,
  normal: 0.022,
  holgado: 0.05,
}

export interface BodyDims {
  /** Altura en metros. Todas las demás proporciones se derivan de ella. */
  H: number
  /** Escala respecto a una figura de referencia de 1,75 m. */
  s: number
  chestR: number
  waistR: number
  hipR: number
  neckR: number
  shoulderX: number
  shoulderY: number
  armLength: number
  armAngle: number
  armRadiusTop: number
  armRadiusBottom: number
  legX: number
  legTop: number
  legBottom: number
  legRadiusTop: number
  legRadiusBottom: number
}

/** Convierte un contorno en cm al radio (m) de un torso elíptico con ese perímetro. */
function radiusFromCircumference(cm: number) {
  return cm / 100 / (2 * Math.PI * ((1 + TORSO_DEPTH) / 2))
}

export function bodyDims(m: Measurements): BodyDims {
  const H = m.height / 100
  const s = H / 1.75
  const chestR = radiusFromCircumference(m.chest)
  const waistR = radiusFromCircumference(m.waist)
  const hipR = radiusFromCircumference(m.hips)
  return {
    H,
    s,
    chestR,
    waistR,
    hipR,
    neckR: 0.055 * s,
    shoulderX: chestR * 1.05,
    shoulderY: 0.8 * H,
    armLength: 0.36 * H,
    armAngle: 0.18,
    armRadiusTop: 0.045 * s,
    armRadiusBottom: 0.03 * s,
    legX: hipR * 0.48,
    legTop: 0.5 * H,
    legBottom: 0.04 * H,
    legRadiusTop: hipR * 0.52,
    legRadiusBottom: 0.04 * s,
  }
}

type ProfilePoint = [radius: number, y: number]

/** Perfil del torso desde la cintura hasta el cuello. Se gira (lathe) para crear la superficie. */
function upperTorso(d: BodyDims): ProfilePoint[] {
  const { H } = d
  return [
    [d.waistR, 0.62 * H],
    [d.chestR, 0.71 * H],
    [d.chestR * 0.97, 0.77 * H],
    [d.chestR * 0.75, 0.815 * H],
    [d.neckR * 1.3, 0.835 * H],
  ]
}

function smooth(points: ProfilePoint[], ease = 0) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r + ease, y)))
  return curve.getPoints(64)
}

export function bodyProfile(d: BodyDims) {
  const { H } = d
  const pts = smooth([[d.hipR * 0.8, 0.47 * H], [d.hipR, 0.52 * H], ...upperTorso(d)])
  // Cerramos el perfil por arriba y por abajo para que el torso sea sólido.
  return [new THREE.Vector2(0.001, 0.465 * H), ...pts, new THREE.Vector2(0.001, 0.84 * H)]
}

/** Perfil de la parte de la prenda que rodea el torso (null si la prenda no lo cubre). */
export function garmentProfile(d: BodyDims, garment: GarmentType, ease: number) {
  const { H } = d
  switch (garment) {
    case 'camiseta':
    case 'manga-larga':
      return smooth([[d.hipR * 1.02, 0.45 * H], [d.hipR, 0.52 * H], ...upperTorso(d)], ease)
    case 'vestido':
      return smooth(
        [[d.hipR * 1.5, 0.27 * H], [d.hipR * 1.2, 0.4 * H], [d.hipR, 0.52 * H], ...upperTorso(d)],
        ease,
      )
    case 'pantalon':
      return smooth([[d.hipR * 0.9, 0.465 * H], [d.hipR, 0.52 * H], [d.waistR, 0.62 * H]], ease)
  }
}
