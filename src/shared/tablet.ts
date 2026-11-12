/**
 * «Móvil como tableta»: mensajes entre el lienzo del ordenador (host) y el móvil o tableta que dibuja (pad).
 * Viajan como JSON por un WebSocket que reenvía el Durable Object `TabletRoom` (worker/tablet.ts).
 * Las coordenadas van en el papel normalizado (0..1 de ancho y alto), así no dependen de la pantalla de ninguno.
 */

/** Un punto del trazo: x, y (0..1 del papel) y presión (0..1). */
export type PadPoint = [number, number, number]

export type PadTool = 'brush' | 'eraser'

/** Del móvil al ordenador. */
export type PadMessage =
  | { t: 'down'; p: PadPoint }
  | { t: 'move'; pts: PadPoint[] }
  | { t: 'up'; p: PadPoint }
  | { t: 'cancel' }
  | { t: 'undo' }
  | { t: 'redo' }
  | { t: 'tool'; tool: PadTool }
  | { t: 'size'; size: number }
  /** Zona del papel que enseña el móvil (0..1) y su tamaño en píxeles: el ordenador manda esa zona a esa resolución. */
  | { t: 'view'; x0: number; y0: number; x1: number; y1: number; w: number; h: number }

/** Del ordenador al móvil. */
export type HostMessage =
  | { t: 'doc'; w: number; h: number; paper: string; name: string }
  | { t: 'state'; tool: string; color: string; size: number }
  /** Imagen del papel: la entera (`full`) o la zona pedida con `view`. `data` es un data URL JPEG. */
  | { t: 'img'; full: boolean; x0: number; y0: number; x1: number; y1: number; data: string }

/** Avisos de la sala (los manda el servidor). */
export type RoomMessage = { t: 'peer'; on: boolean } | { t: 'closed'; reason: string }

/** Tiempo para escanear el QR y conectar el móvil por primera vez. */
export const PAIR_MS = 10 * 60 * 1000
/** Lo que dura una sesión ya emparejada (el móvil puede reconectar mientras tanto). */
export const SESSION_MS = 12 * 60 * 60 * 1000
