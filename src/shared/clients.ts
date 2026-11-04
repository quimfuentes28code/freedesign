/**
 * Tipos de los clientes, compartidos por la web (src/) y la API (worker/).
 */

/** Medidas corporales en cm. Todas opcionales: se rellenan las que se hayan tomado. */
export type Measurements = Partial<Record<MeasurementKey, number>>

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  instagram: string
  city: string
  address: string
  /** AAAA-MM-DD o vacío. */
  birthday: string
  preferences: string
  notes: string
  measurements: Measurements
  /** Fecha (AAAA-MM-DD) en que se tomaron las medidas. */
  measuredAt: string
  createdAt: string
  updatedAt: string
}

/** Lo que se envía al crear o editar un cliente. */
export type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>

export const EMPTY_CLIENT: ClientInput = {
  name: '',
  email: '',
  phone: '',
  instagram: '',
  city: '',
  address: '',
  birthday: '',
  preferences: '',
  notes: '',
  measurements: {},
  measuredAt: '',
}

/** Medidas que se toman, agrupadas como en una ficha de taller. */
export const MEASUREMENT_GROUPS = [
  {
    title: 'General',
    items: [
      { key: 'altura', label: 'Altura' },
      { key: 'peso', label: 'Peso', unit: 'kg' },
    ],
  },
  {
    title: 'Torso',
    items: [
      { key: 'cuello', label: 'Contorno de cuello' },
      { key: 'hombros', label: 'Ancho de hombros' },
      { key: 'pecho', label: 'Contorno de pecho' },
      { key: 'bajoPecho', label: 'Bajo pecho' },
      { key: 'cintura', label: 'Contorno de cintura' },
      { key: 'cadera', label: 'Contorno de cadera' },
      { key: 'talleDelantero', label: 'Talle delantero' },
      { key: 'talleEspalda', label: 'Talle espalda' },
      { key: 'anchoEspalda', label: 'Ancho de espalda' },
    ],
  },
  {
    title: 'Brazos',
    items: [
      { key: 'largoBrazo', label: 'Largo de brazo' },
      { key: 'biceps', label: 'Contorno de bíceps' },
      { key: 'antebrazo', label: 'Contorno de antebrazo' },
      { key: 'muneca', label: 'Contorno de muñeca' },
    ],
  },
  {
    title: 'Piernas',
    items: [
      { key: 'tiro', label: 'Tiro' },
      { key: 'entrepierna', label: 'Largo de entrepierna' },
      { key: 'largoPierna', label: 'Largo de pierna' },
      { key: 'muslo', label: 'Contorno de muslo' },
      { key: 'rodilla', label: 'Contorno de rodilla' },
      { key: 'gemelo', label: 'Contorno de gemelo' },
      { key: 'tobillo', label: 'Contorno de tobillo' },
    ],
  },
] as const satisfies readonly { title: string; items: readonly { key: string; label: string; unit?: string }[] }[]

export type MeasurementKey = (typeof MEASUREMENT_GROUPS)[number]['items'][number]['key']
