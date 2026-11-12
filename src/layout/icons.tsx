import type { ReactNode } from 'react'

/*
 * Iconos propios del menú (24×24, trazo con el color del texto). Estilo «taller»: cada uno es un objeto del oficio
 * (patronaje, percha, máquina de coser…) dibujado en línea fina, con un detalle de taller en naranja (`.icon-accent`:
 * un pespunte, la cinta métrica, el piloto de la cámara). En el apartado activo el detalle pasa al color del texto.
 */

/** Pespunte: línea discontinua corta, como una costura. */
const STITCH = { strokeDasharray: '1.4 2.2' }

const ICONS = {
  // Inicio: tablero de corte con su cuadrícula y una regla
  dashboard: {
    main: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M9.5 4.5v15M9.5 11h11" />
      </>
    ),
    accent: <path d="M12.5 15h5.5" {...STITCH} />,
  },
  // Diseños: camiseta con el pespunte del bajo
  designer: {
    main: <path d="M9 3.8 4.3 6 2.8 10.2l2.9 1.3L7 10v10.5h10V10l1.3 1.5 2.9-1.3L19.7 6 15 3.8a3 3 0 0 1-6 0Z" />,
    accent: <path d="M8.6 18h6.8" {...STITCH} />,
  },
  // Probador: percha con la cinta métrica debajo
  probador: {
    main: <path d="M10 5.7a2 2 0 1 1 2 2v1.6l-8.3 5.9a1.3 1.3 0 0 0 .8 2.3h15a1.3 1.3 0 0 0 .8-2.3L12 9.3" />,
    accent: <path d="M5 20.5h14M8 20.5v-1M12 20.5v-1M16 20.5v-1" />,
  },
  // Lookbook: cámara de fotos con su piloto encendido
  lookbook: {
    main: (
      <>
        <path d="M3.5 9A1.5 1.5 0 0 1 5 7.5h2.6L9.2 5h5.6l1.6 2.5H19A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
        <circle cx="12" cy="13" r="3.3" />
      </>
    ),
    accent: <circle cx="17.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />,
  },
  // Biblioteca: muestrario de telas con el cosido de la muestra
  library: {
    main: (
      <>
        <rect x="3.5" y="3.5" width="12" height="17" rx="1.5" />
        <path d="m15.5 6.5 3.4.8a1 1 0 0 1 .8 1.2l-2.8 11.4a1 1 0 0 1-1.2.7l-.2-.1" />
      </>
    ),
    accent: <rect x="6.3" y="6.3" width="6.4" height="6.4" rx="0.6" {...STITCH} />,
  },
  // Proyectos: carpeta con pinza y una tarea marcada
  projects: {
    main: (
      <>
        <path d="M8.5 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-2" />
        <rect x="8.5" y="3" width="7" height="3" rx="1" />
        <path d="M8.5 10.5h7M8.5 14h3.5" />
      </>
    ),
    accent: <path d="m12.8 16.6 1.5 1.5 2.9-3.1" />,
  },
  // Producción: máquina de coser con la costura que va dejando
  production: {
    main: (
      <>
        <path d="M3.5 20h17M5 20v-3h14v3" />
        <path d="M16.5 17V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3h3" />
        <path d="M6.5 10v4.5M14 5V3.5" />
      </>
    ),
    accent: <path d="M8.8 14.6h5.4" {...STITCH} />,
  },
  // Clientes: busto con la cinta métrica al pecho
  clients: {
    main: (
      <>
        <circle cx="12" cy="7.5" r="3.5" />
        <path d="M5 20.5v-1.3A5.2 5.2 0 0 1 10.2 14h3.6a5.2 5.2 0 0 1 5.2 5.2v1.3" />
      </>
    ),
    accent: <path d="M7 17.6h10" {...STITCH} />,
  },
  // Economía: etiqueta de precio con su pespunte
  economy: {
    main: (
      <>
        <path d="M3.5 11.9V5A1.5 1.5 0 0 1 5 3.5h6.9a1.5 1.5 0 0 1 1 .4l7.2 7.2a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-7.2-7.2a1.5 1.5 0 0 1-.4-1Z" />
        <circle cx="7.8" cy="7.8" r="1.3" />
      </>
    ),
    accent: <path d="m10.6 17 6.4-6.4" {...STITCH} />,
  },
  // Móvil como tableta: el móvil con un lápiz y las esquinas del visor del QR
  tablet: {
    main: (
      <>
        <rect x="6.5" y="3" width="11" height="18" rx="2" />
        <path d="M10.5 18h3" />
      </>
    ),
    accent: <path d="M9 7.5V6.5h1M15 7.5V6.5h-1M9 12.5v1h1M15 12.5v1h-1" />,
  },
} satisfies Record<string, { main: ReactNode; accent: ReactNode }>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const icon = ICONS[name]
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.main}
      <g className="icon-accent">{icon.accent}</g>
    </svg>
  )
}
