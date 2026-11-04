import type { DesignData, Print } from '../shared/designs'
import { fileUrl } from '../shared/library'
import type { Body } from '../production/measurements'
import { CX } from './geometry'
import { drawScale } from './measures'
import { printSize } from './prints'
import { isPants, type GarmentTemplate, type View } from './types'

/**
 * Estampados para la vista 3D: los de una vista del dibujo (delantero o espalda) pintados en una imagen que
 * abarca el cuerpo de la prenda, de costado a costado y del punto más alto del hombro al bajo (o, en el pantalón,
 * de la cintura al bajo). La prenda 3D proyecta esa imagen sobre su propio cuerpo con el mismo encuadre,
 * así cada estampado cae en el mismo sitio y con el mismo tamaño relativo que en el dibujo.
 */

/** Encuadre del cuerpo de la prenda en el dibujo: centro, semiancho y alto (unidades del lienzo). */
export interface BodyFrame {
  half: number
  top: number
  bottom: number
}

/** Piezas que forman el «cuerpo» de cada tipo de prenda (las mismas que en 3D llevan los estampados). */
const BODY_PIECES = (t: GarmentTemplate) => (isPants(t) ? ['perneras', 'cinturilla'] : ['cuerpo'])

/** Encuadre del cuerpo a partir de los puntos de sus trazados. */
export function bodyFrame(t: GarmentTemplate, data: DesignData, view: View, body?: Body): BodyFrame | null {
  const pieces = BODY_PIECES(t)
  let half = 0
  let top = Infinity
  let bottom = -Infinity
  for (const s of t.draw(view, data.options, drawScale(t, data, body))) {
    if (s.kind !== 'fill' || !s.piece || !pieces.includes(s.piece)) continue
    const n = (s.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    for (let i = 0; i + 1 < n.length; i += 2) {
      half = Math.max(half, Math.abs(n[i] - CX))
      top = Math.min(top, n[i + 1])
      bottom = Math.max(bottom, n[i + 1])
    }
  }
  return half > 0 && bottom > top ? { half, top, bottom } : null
}

const images = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(file: string) {
  let p = images.get(file)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = fileUrl(file)
    })
    images.set(file, p)
  }
  return p
}

/** Alto de la imagen en píxeles (el ancho sale de la proporción del cuerpo). */
const HEIGHT = 1024

/** Imagen con los estampados de una vista, o null si esa vista no tiene. */
export async function printLayer(t: GarmentTemplate, data: DesignData, view: View, body?: Body): Promise<HTMLCanvasElement | null> {
  const prints = (data.prints ?? []).filter((p) => p.view === view && !p.hidden)
  const f = bodyFrame(t, data, view, body)
  if (!prints.length || !f) return null
  const k = HEIGHT / (f.bottom - f.top)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(f.half * 2 * k)
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const loaded = await Promise.all(prints.map((p) => (p.kind === 'artwork' ? loadImage(p.file) : Promise.resolve(null))))
  prints.forEach((p, i) => draw(ctx, p, loaded[i], f, k))
  return canvas
}

function draw(ctx: CanvasRenderingContext2D, p: Print, img: HTMLImageElement | null, f: BodyFrame, k: number) {
  const { w, h } = printSize(p)
  ctx.save()
  ctx.translate((p.x - (CX - f.half)) * k, (p.y - f.top) * k)
  ctx.rotate((p.rotation * Math.PI) / 180)
  if (p.kind === 'artwork') {
    if (img) ctx.drawImage(img, (-w / 2) * k, (-h / 2) * k, w * k, h * k)
  } else {
    ctx.font = `${p.bold ? 700 : 400} ${p.size * k}px ${p.font || 'sans-serif'}`
    ctx.fillStyle = p.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.text, 0, 0)
  }
  ctx.restore()
}
