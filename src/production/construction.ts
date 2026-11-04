import { opt, type GarmentTemplate, type Options } from '../designer/types'
import type { ConstructionRow } from '../shared/production'

/**
 * Confección por defecto de cada prenda base según sus opciones: qué costuras lleva, con qué máquina,
 * y en qué orden se monta. Es el punto de partida; en la ficha se puede retocar todo.
 */

const OVERLOCK = 'Remalladora 4 hilos'
const COVER = 'Recubridora 2 agujas'
const FLAT = 'Plana (pespunte recto)'
const BARTACK = 'Presilladora'

export function defaultConstruction(t: GarmentTemplate, o: Options): ConstructionRow[] {
  const get = <T extends string | boolean>(id: string) => opt<T>(t, o, id)
  const double = get('costuras') === 'doble'
  const topstitch = { area: 'Pespuntes', operation: double ? 'Pespunte doble a 0,6 cm' : 'Pespunte simple a 0,3 cm', machine: double ? COVER : FLAT }
  const rows: Omit<ConstructionRow, 'id'>[] = []
  const add = (area: string, operation: string, machine: string, notes = '') => rows.push({ area, operation, machine, notes })

  if (t.id === 'sudadera' || t.id === 'camiseta') {
    add('Hombros', 'Unir delantero y espalda', OVERLOCK, 'Margen 1 cm. Cinta de refuerzo en el hombro')
    if (t.id === 'sudadera' && get<boolean>('capucha')) {
      add('Capucha', 'Unir las dos mitades y montar al escote', OVERLOCK, 'Borde delantero con vista doble y pespunte')
      if (get<boolean>('cordones')) add('Capucha', 'Ojales para el cordón a 2 cm del borde', 'Remachadora de ojales', 'Colocar antes de cerrar la vista')
    } else if (t.id === 'camiseta' && get('cuello') === 'pico') {
      add('Cuello', 'Canalé 1x1 montado al escote con cruce en el pico', OVERLOCK, 'Cinta de limpieza de hombro a hombro')
    } else {
      add('Cuello', 'Canalé cerrado en anillo, doblado y montado al escote', OVERLOCK, 'Repartir el canalé tensándolo un 10 %. Cinta de limpieza en la espalda')
    }
    add('Mangas', 'Montar las mangas a la sisa (en plano)', OVERLOCK)
    add('Costados', 'Cerrar costados y bajo de manga de una vez', OVERLOCK, 'Casar las costuras de la sisa')
    if (t.id === 'sudadera' && get('bolsillo') === 'canguro') {
      add('Bolsillo canguro', 'Dobladillar las bocas y aplicar al delantero', COVER)
      add('Bolsillo canguro', 'Presillas en las esquinas de las bocas', BARTACK)
    }
    if (t.id === 'camiseta' && get<boolean>('bolsillo')) add('Bolsillo de pecho', 'Dobladillo arriba y aplicado al delantero izquierdo', FLAT, 'Presillas arriba')
    const zip = t.id === 'sudadera' ? get<string>('cremallera') : 'ninguna'
    if (zip !== 'ninguna') add('Cremallera', `Montar la cremallera ${zip === 'media' ? 'media' : 'separable'} al delantero`, `${FLAT} con prensatelas de cremallera`, 'Pespunte a 0,6 cm')
    if (t.id === 'sudadera' && get('punos') === 'canale') {
      add('Puños y bajo', 'Canalé doblado, tensado y montado', OVERLOCK, 'Repartir el canalé en cuartos')
    } else {
      add('Puños y bajo', `Dobladillo de ${t.id === 'camiseta' ? 2 : 2.5} cm`, COVER)
    }
  }

  if (t.id === 'bomber') {
    const pockets = get<string>('bolsillos')
    if (pockets !== 'ninguno') add('Bolsillos', pockets === 'ojal' ? 'Bolsillos de ojal con vivo' : 'Bolsillos de ojal con solapa', FLAT, 'Entretela termoadhesiva en la boca. Bolsas de forro')
    if (get<boolean>('bolsilloManga')) add('Bolsillo de manga', 'Bolsillo con cremallera en la manga izquierda', FLAT, 'Coser antes de cerrar la manga')
    add('Hombros y mangas', 'Unir hombros y montar mangas', FLAT, 'Margen 1 cm, costuras cargadas con pespunte')
    add('Costados', 'Cerrar costados y bajo de manga', FLAT, 'Acabar los márgenes con remalladora de 3 hilos')
    add('Cremallera', 'Cremallera separable entre el cuerpo y la vista', `${FLAT} con prensatelas de cremallera`)
    add('Cuello, puños y bajo', 'Canalé doblado y montado', OVERLOCK, 'Repartir el canalé en cuartos')
    add('Forro', 'Forro completo unido por la vista y el canalé', FLAT, 'Pliegue de holgura de 2 cm en el centro de la espalda')
  }

  if (t.id === 'pantalon') {
    if (get<boolean>('laterales')) add('Bolsillos laterales', 'Bolsillo de costado con vista y bolsa', FLAT, 'Remallar las bolsas')
    if (get<boolean>('traseros')) add('Bolsillos traseros', 'Bolsillos de parche en la espalda', FLAT, 'Presillas en las esquinas')
    if (get<boolean>('cargo')) add('Bolsillos cargo', 'Bolsillo de fuelle con solapa aplicado al costado', FLAT, 'Presillas y cierre (velcro o automático)')
    add('Costados', 'Cerrar los costados', OVERLOCK, 'Pespunte de carga hacia atrás')
    add('Tiro', 'Unir tiro delantero y trasero', OVERLOCK, 'Doble costura de refuerzo en la entrepierna')
    add('Entrepierna', 'Cerrar la entrepierna de un bajo al otro', OVERLOCK)
    add('Cinturilla', 'Cinturilla con elástico de 4 cm encanalado', `${OVERLOCK} + ${COVER}`, get<boolean>('cordon') ? 'Dos ojales para el cordón en el centro delantero' : '')
    if (get('bajo') === 'puno') add('Bajos', 'Puño de canalé doblado y montado', OVERLOCK)
    else add('Bajos', 'Dobladillo de 3 cm', COVER)
  }

  rows.push({ ...topstitch, notes: t.id === 'pantalon' ? 'En costados, bolsillos y cinturilla' : 'En hombros, sisas y escote' })
  add(
    'Etiquetas',
    t.id === 'pantalon'
      ? 'Marca en el centro de la cinturilla trasera; talla y composición en el costado izquierdo'
      : 'Marca y talla en la nuca; composición y cuidados en el costado izquierdo, a 8 cm del bajo',
    FLAT,
  )
  return rows.map((r, i) => ({ id: `c${i + 1}`, ...r }))
}

/** Orden de montaje por defecto. */
export function defaultAssembly(t: GarmentTemplate, o: Options, withPrints: boolean): string[] {
  const get = <T extends string | boolean>(id: string) => opt<T>(t, o, id)
  const prints = withPrints ? ['Estampar o bordar las piezas sueltas antes de coser (ver estampados)'] : []
  const start = ['Revisar el tejido y dejarlo reposar 24 h antes de cortar', 'Cortar todas las piezas al hilo, marcando piquetes', ...prints]
  const end = ['Coser etiquetas', 'Rematar hilos, planchar y control de calidad (medidas con tolerancia)']

  if (t.id === 'pantalon') {
    return [
      ...start,
      ...(get<boolean>('laterales') ? ['Preparar y montar los bolsillos laterales'] : []),
      ...(get<boolean>('traseros') ? ['Aplicar los bolsillos traseros'] : []),
      ...(get<boolean>('cargo') ? ['Preparar los bolsillos cargo y aplicarlos a las perneras'] : []),
      'Cerrar costados',
      'Unir el tiro delantero y el trasero',
      'Cerrar la entrepierna',
      'Preparar y montar la cinturilla con el elástico',
      ...(get<boolean>('cordon') ? ['Pasar el cordón y rematar sus puntas'] : []),
      get('bajo') === 'puno' ? 'Montar los puños' : 'Hacer los dobladillos',
      ...end,
    ]
  }
  if (t.id === 'bomber') {
    return [
      ...start,
      'Pegar entretelas en vistas y bocas de bolsillo',
      ...(get('bolsillos') !== 'ninguno' ? ['Hacer los bolsillos del delantero'] : []),
      ...(get<boolean>('bolsilloManga') ? ['Hacer el bolsillo de la manga'] : []),
      'Unir hombros, montar mangas y cerrar costados',
      'Montar el forro por separado (mismo orden)',
      'Montar la cremallera y las vistas',
      'Montar cuello, puños y bajo de canalé',
      'Unir el forro y volver la prenda',
      ...end,
    ]
  }
  const hood = t.id === 'sudadera' && get<boolean>('capucha')
  return [
    ...start,
    ...(t.id === 'sudadera' && get('bolsillo') === 'canguro' ? ['Preparar el bolsillo canguro y aplicarlo al delantero'] : []),
    ...(t.id === 'camiseta' && get<boolean>('bolsillo') ? ['Aplicar el bolsillo de pecho'] : []),
    'Unir hombros con cinta de refuerzo',
    hood ? 'Montar la capucha (con ojales y vista) al escote' : 'Montar el cuello',
    ...(t.id === 'sudadera' && get('cremallera') !== 'ninguna' ? ['Montar la cremallera'] : []),
    'Montar las mangas',
    'Cerrar costados y mangas',
    t.id === 'sudadera' && get('punos') === 'canale' ? 'Montar puños y bajo de canalé' : 'Hacer los dobladillos de mangas y bajo',
    ...(hood && get<boolean>('cordones') ? ['Pasar los cordones y rematar sus puntas'] : []),
    ...end,
  ]
}
