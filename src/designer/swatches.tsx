import { useId, type ReactNode } from 'react'
import { fileUrl, type Material } from '../shared/library'
import type { CatalogMaterial, Weave } from './materials'

/**
 * Texturas de los materiales en SVG, dibujadas por código: se usan en la muestra («swatch») que acompaña
 * al nombre de cada material y encima del color de cada pieza en el plano 2D.
 * Cada textura lleva sombras (negro) y luces (blanco) para que se vea tanto en colores claros como oscuros.
 */

const ink = (a: number) => `rgba(0,0,0,${a})`
const hi = (a: number) => `rgba(255,255,255,${a})`

/** Tamaño de una repetición (en unidades del lienzo) y su dibujo. `null` = sin textura (tejido liso). */
const WEAVES: Record<Weave, { size: number; draw: () => ReactNode } | null> = {
  liso: null,
  punto: {
    size: 4,
    draw: () => (
      <>
        <path d="M0 0 L1 2.6 L2 0 M2 0 L3 2.6 L4 0" fill="none" stroke={ink(0.16)} strokeWidth={0.45} />
        <path d="M0 2 L1 4 L2 2 M2 2 L3 4 L4 2" fill="none" stroke={hi(0.12)} strokeWidth={0.35} />
      </>
    ),
  },
  felpa: {
    size: 5,
    draw: () => (
      <>
        <path d="M0 0 L1.25 3 L2.5 0 L3.75 3 L5 0" fill="none" stroke={ink(0.1)} strokeWidth={0.6} />
        <circle cx={1.2} cy={4.2} r={0.5} fill={hi(0.12)} />
        <circle cx={3.8} cy={1.6} r={0.45} fill={ink(0.07)} />
      </>
    ),
  },
  canale: {
    size: 3,
    draw: () => (
      <>
        <rect x={0} y={0} width={1.1} height={3} fill={ink(0.2)} />
        <rect x={1.6} y={0} width={0.6} height={3} fill={hi(0.14)} />
      </>
    ),
  },
  pique: {
    size: 4,
    draw: () => (
      <>
        <path d="M0 2 L2 0 L4 2 L2 4 Z" fill="none" stroke={ink(0.18)} strokeWidth={0.5} />
        <circle cx={2} cy={2} r={0.6} fill={hi(0.14)} />
      </>
    ),
  },
  gofre: {
    size: 6,
    draw: () => (
      <>
        <rect x={0.5} y={0.5} width={5} height={5} rx={0.8} fill={ink(0.14)} />
        <path d="M0 0 H6 M0 0 V6" stroke={hi(0.22)} strokeWidth={0.9} />
      </>
    ),
  },
  malla: {
    size: 4,
    draw: () => (
      <>
        <circle cx={1} cy={1} r={0.75} fill={ink(0.35)} />
        <circle cx={3} cy={3} r={0.75} fill={ink(0.35)} />
        <circle cx={1.3} cy={0.7} r={0.35} fill={hi(0.12)} />
      </>
    ),
  },
  sarga: {
    size: 4,
    draw: () => (
      <>
        <path d="M-1 5 L5 -1 M-1 1 L1 -1 M3 5 L5 3" stroke={ink(0.17)} strokeWidth={0.7} />
        <path d="M-1 3 L3 -1 M1 5 L5 1" stroke={hi(0.1)} strokeWidth={0.5} />
      </>
    ),
  },
  denim: {
    size: 4,
    draw: () => (
      <>
        <path d="M-1 5 L5 -1 M-1 1 L1 -1 M3 5 L5 3" stroke={hi(0.22)} strokeWidth={0.7} />
        <path d="M-1 3 L3 -1 M1 5 L5 1" stroke={ink(0.18)} strokeWidth={0.6} />
      </>
    ),
  },
  lino: {
    size: 10,
    draw: () => (
      <>
        <path d="M0 1.5 H10 M0 4.2 H10 M0 7.8 H10" stroke={ink(0.09)} strokeWidth={0.5} />
        <path d="M2 2.8 H6.5 M5 6 H9.5" stroke={ink(0.16)} strokeWidth={0.8} />
        <path d="M1.5 0 V10 M6.8 0 V10" stroke={hi(0.1)} strokeWidth={0.4} />
      </>
    ),
  },
  oxford: {
    size: 4,
    draw: () => (
      <>
        <rect x={0} y={0} width={2} height={2} fill={ink(0.1)} />
        <rect x={2} y={2} width={2} height={2} fill={ink(0.1)} />
        <rect x={2} y={0} width={2} height={2} fill={hi(0.1)} />
      </>
    ),
  },
  pana: {
    size: 5,
    draw: () => (
      <>
        <rect x={0} y={0} width={1} height={5} fill={ink(0.26)} />
        <rect x={2} y={0} width={1.6} height={5} fill={hi(0.18)} />
      </>
    ),
  },
  terciopelo: {
    size: 12,
    draw: () => (
      <>
        <circle cx={3} cy={4} r={3} fill={hi(0.06)} />
        <circle cx={9} cy={9} r={3.5} fill={ink(0.06)} />
      </>
    ),
  },
  saten: {
    size: 10,
    draw: () => <path d="M-2 12 L12 -2" stroke={hi(0.12)} strokeWidth={2.5} />,
  },
  tweed: {
    size: 6,
    draw: () => (
      <>
        <path d="M0 6 L6 0 M-1 1 L1 -1 M5 7 L7 5" stroke={ink(0.2)} strokeWidth={0.8} />
        <path d="M0.8 2.2 h1.4 M3.6 4.4 h1.2" stroke={hi(0.35)} strokeWidth={0.6} />
        <path d="M2.5 0.6 v1.1 M4.6 2.4 v1" stroke="rgba(150,60,40,0.35)" strokeWidth={0.6} />
      </>
    ),
  },
  franela: {
    size: 8,
    draw: () => (
      <>
        <circle cx={2} cy={2} r={1.6} fill={hi(0.07)} />
        <circle cx={6} cy={6} r={1.8} fill={ink(0.05)} />
        <path d="M0 4.5 H8" stroke={ink(0.04)} strokeWidth={1.2} />
      </>
    ),
  },
  ripstop: {
    size: 7,
    draw: () => <path d="M0 0.4 H7 M0.4 0 V7" stroke={ink(0.22)} strokeWidth={0.55} />,
  },
  acolchado: {
    size: 18,
    draw: () => (
      <>
        <rect x={0} y={1} width={18} height={6} fill={hi(0.16)} />
        <rect x={0} y={12} width={18} height={5} fill={ink(0.12)} />
        <path d="M0 17.6 H18" stroke={ink(0.35)} strokeWidth={0.8} strokeDasharray="1.6 1" />
      </>
    ),
  },
  piel: {
    size: 12,
    draw: () => (
      <>
        <path d="M1 3 q2 -1 4 0 M6 8 q2 1 4 -0.5 M2 10 q1.5 0.8 3 0" fill="none" stroke={ink(0.14)} strokeWidth={0.4} />
        <circle cx={8} cy={3} r={0.4} fill={ink(0.15)} />
        <circle cx={4} cy={6} r={0.35} fill={hi(0.15)} />
      </>
    ),
  },
  ante: {
    size: 5,
    draw: () => (
      <>
        <circle cx={1} cy={1} r={0.4} fill={hi(0.12)} />
        <circle cx={3.4} cy={2.2} r={0.45} fill={ink(0.12)} />
        <circle cx={2} cy={4} r={0.35} fill={hi(0.1)} />
        <circle cx={4.4} cy={4.3} r={0.3} fill={ink(0.1)} />
      </>
    ),
  },
  borrego: {
    size: 6,
    draw: () => (
      <>
        <circle cx={1.5} cy={1.5} r={1.2} fill="none" stroke={hi(0.32)} strokeWidth={0.6} />
        <circle cx={4.5} cy={4.2} r={1.2} fill="none" stroke={hi(0.28)} strokeWidth={0.6} />
        <circle cx={4.5} cy={1.2} r={0.9} fill="none" stroke={ink(0.14)} strokeWidth={0.5} />
        <circle cx={1.4} cy={4.6} r={0.9} fill="none" stroke={ink(0.14)} strokeWidth={0.5} />
      </>
    ),
  },
  boucle: {
    size: 6,
    draw: () => (
      <>
        <circle cx={1.5} cy={1.5} r={1} fill={hi(0.22)} />
        <circle cx={4.5} cy={4.3} r={1.1} fill={hi(0.18)} />
        <circle cx={4.4} cy={1.4} r={0.8} fill={ink(0.16)} />
        <circle cx={1.3} cy={4.6} r={0.8} fill={ink(0.16)} />
      </>
    ),
  },
  trenzado: {
    size: 4,
    draw: () => (
      <>
        <path d="M0 0 L2 2 L0 4 M2 0 L4 2 L2 4" fill="none" stroke={ink(0.25)} strokeWidth={0.7} />
        <path d="M1 0 L3 2 L1 4" fill="none" stroke={hi(0.2)} strokeWidth={0.5} />
      </>
    ),
  },
  metal: null,
  espiral: {
    size: 3,
    draw: () => (
      <>
        <rect x={0} y={0} width={3} height={1.2} fill={ink(0.25)} />
        <rect x={0} y={1.6} width={3} height={0.6} fill={hi(0.3)} />
      </>
    ),
  },
}

/** `<pattern>` con la textura de un tejido (o nada si es liso). `scale` agranda el dibujo (p. ej. en las muestras). */
export function WeavePattern({ id, weave, scale = 1 }: { id: string; weave: Weave; scale?: number }) {
  const w = WEAVES[weave]
  if (!w) return null
  const s = w.size * scale
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={s} height={s}>
      <g transform={`scale(${scale})`}>{w.draw()}</g>
    </pattern>
  )
}

export const hasWeave = (weave: Weave) => !!WEAVES[weave]

/** Degradado de brillo (luz arriba a la izquierda) para materiales satinados, de piel o metálicos. */
export function GlossGradient({ id, metal }: { id: string; metal?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity={metal ? 0.9 : 0.75} />
      <stop offset={metal ? 0.35 : 0.45} stopColor="#fff" stopOpacity={0} />
      <stop offset={metal ? 0.6 : 0.7} stopColor="#000" stopOpacity={0} />
      <stop offset="1" stopColor="#000" stopOpacity={metal ? 0.45 : 0.25} />
    </linearGradient>
  )
}

/**
 * Muestra de un material: un cuadradito con el color de la pieza, la textura y el brillo del material,
 * como un trocito de tela de un muestrario. Los materiales de la Biblioteca con foto muestran su foto.
 */
export function Swatch({ material, library, color, size = 36 }: { material?: CatalogMaterial; library?: Material; color: string; size?: number }) {
  const uid = useId().replace(/:/g, '')
  const photo = library?.photo
  const weave = material?.weave ?? 'liso'
  const metal = weave === 'metal'
  const fill = material?.tint ?? color
  const gloss = material?.gloss ?? 0
  return (
    <svg className="material-swatch" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        {material && <WeavePattern id={`${uid}-w`} weave={weave} scale={0.8} />}
        <GlossGradient id={`${uid}-g`} metal={metal} />
        <clipPath id={`${uid}-c`}>
          <rect width="24" height="24" rx="5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-c)`}>
        <rect width="24" height="24" fill={photo ? '#ddd' : fill} />
        {photo ? (
          <image href={fileUrl(photo)} width="24" height="24" preserveAspectRatio="xMidYMid slice" />
        ) : (
          <>
            {material && hasWeave(weave) && <rect width="24" height="24" fill={`url(#${uid}-w)`} />}
            {/* Sombra en la esquina de abajo, como una tela doblada */}
            <path d="M24 14 L24 24 L14 24 Z" fill="rgba(0,0,0,0.12)" />
            {gloss > 0.05 && <rect width="24" height="24" fill={`url(#${uid}-g)`} opacity={Math.min(1, gloss * 1.1)} />}
          </>
        )}
      </g>
      <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" fill="none" stroke="rgba(0,0,0,0.18)" />
    </svg>
  )
}
