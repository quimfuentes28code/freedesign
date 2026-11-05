import { isPants, opt, type GarmentTemplate, type Options } from '../designer/types'
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

  if (t.id === 'polo' || t.id === 'camisa') {
    const shirt = t.id === 'camisa'
    const neck = get<string>('cuello')
    if (shirt && get<boolean>('canesu')) add('Canesú', 'Canesú doble (con vista) que une delanteros y espalda', FLAT, 'Pespunte de carga a 0,2 cm')
    else add('Hombros', 'Unir delantero y espalda', shirt ? FLAT : OVERLOCK, shirt ? 'Costura cargada' : 'Cinta de refuerzo en el hombro')
    add(
      'Tapeta',
      shirt ? 'Tapeta delantera entretelada y doblada, de arriba al bajo' : `Abrir el corte de la tapeta y montar la tapeta doble (${get('botones')} botones)`,
      FLAT,
      'Entretela termoadhesiva ligera',
    )
    add('Ojales y botones', shirt ? 'Ojales verticales en la tapeta derecha; botones en la izquierda' : 'Ojales horizontales en la tapeta', 'Ojaladora + botonadora', 'Botón extra de repuesto en el costado')
    add(
      'Cuello',
      neck === 'mao'
        ? 'Tira de cuello entretelada montada al escote'
        : neck === 'cubano'
          ? 'Cuello abierto de una pieza con vista, montado al escote'
          : neck === 'polo'
            ? 'Cuello de punto tricotado montado al escote, con vista en la nuca'
            : 'Cuello con pie, los dos entretelados y pespunteados',
      FLAT,
      neck === 'polo' ? 'Remallar la vista' : 'Volver las puntas y planchar',
    )
    add('Mangas', 'Montar las mangas a la sisa (en plano)', shirt ? `${FLAT} + remalladora 3 hilos` : OVERLOCK)
    add('Costados', 'Cerrar costados y bajo de manga de una vez', shirt ? `${FLAT} (costura francesa o cargada)` : OVERLOCK)
    if (get('manga') === 'larga' && shirt) add('Puños', 'Abertura con tapetilla y puño entretelado con ojal y botón', FLAT)
    else if (get('punos') === 'canale') add('Puños', 'Puño de canalé doblado y montado', OVERLOCK)
    else add('Bajo de manga', 'Dobladillo de 2 cm', shirt ? FLAT : COVER)
    if (get<boolean>('bolsillo')) add('Bolsillo de pecho', 'Bolsillo de parche en el delantero izquierdo', FLAT, 'Presillas arriba')
    add('Bajo', shirt && get('bajo') === 'curvo' ? 'Dobladillo estrecho de 0,6 cm siguiendo la curva' : 'Dobladillo de 2 cm', shirt ? `${FLAT} con prensatelas dobladillador` : COVER, shirt ? '' : 'Aberturas laterales opcionales de 4 cm')
  }

  if (t.id === 'puffer') {
    const step = get('canales') === 'estrechos' ? 11 : 17
    add('Acolchado', `Pespuntear los canales: exterior, guata y forro juntos, cada ${step} cm`, FLAT, 'Guata de 120–160 g/m² (o plumón en canales cerrados)')
    if (get('bolsillos') === 'ojal') add('Bolsillos', 'Bolsillos de ojal con cremallera o vivo', FLAT, 'Entretela en la boca; bolsas de forro')
    add('Hombros y mangas', 'Unir hombros y montar mangas haciendo coincidir los canales', FLAT, 'Casar los canales del cuerpo y la manga')
    add('Costados', 'Cerrar costados y bajo de manga', FLAT, 'Acabar los márgenes con remalladora de 3 hilos')
    add(get('cuello') === 'capucha' ? 'Capucha' : 'Cuello alto', get('cuello') === 'capucha' ? 'Capucha acolchada con vista de forro' : 'Cuello alto acolchado con vista de forro', FLAT)
    add('Cremallera', 'Cremallera separable con solapa interior contra el viento', `${FLAT} con prensatelas de cremallera`)
    add('Puños y bajo', get('punos') === 'canale' ? 'Canalé doblado y montado' : 'Ribete elástico de 1,5 cm', get('punos') === 'canale' ? OVERLOCK : FLAT)
    add('Forro', 'Forro de nylon unido por la vista y el bajo', FLAT)
  }

  if (t.id === 'chaleco') {
    const quilted = get('tipo') === 'acolchado'
    if (quilted) add('Acolchado', 'Pespuntear los canales: exterior, guata y forro juntos', FLAT, 'Guata de 100–140 g/m²')
    if (get('bolsillos') !== 'ninguno') add('Bolsillos', get('bolsillos') === 'ojal' ? 'Bolsillos de ojal con vivo' : 'Bolsillos con solapa', FLAT, 'Entretela en la boca')
    add('Hombros y costados', 'Unir hombros y cerrar costados', FLAT, 'Acabar los márgenes con remalladora de 3 hilos')
    add('Sisas', 'Ribetear las sisas con bies del mismo tejido', FLAT)
    add(get('cuello') === 'capucha' ? 'Capucha' : 'Cuello', get('cuello') === 'capucha' ? 'Capucha con vista de forro' : 'Cuello con vista de forro', FLAT)
    add('Cierre', get('cierre') === 'botones' ? 'Tapeta con ojales y botones' : 'Cremallera separable', FLAT)
    add('Bajo', get('bajo') === 'canale' ? 'Canalé doblado y montado' : 'Ribete elástico', get('bajo') === 'canale' ? OVERLOCK : FLAT)
  }

  if (t.id === 'cazadora') {
    if (get<boolean>('canesu')) add('Canesú delantero', 'Montar el canesú en pico al delantero', FLAT, 'Pespunte doble de carga')
    if (get('bolsillos') === 'pecho-tapeta') add('Bolsillos de pecho', 'Bolsillos de parche con tapeta en pico, ojal y botón', FLAT, 'Presillas en las esquinas')
    if (get('bolsillos') === 'solapa') add('Bolsillos', 'Bolsillos bajos con solapa', FLAT)
    if (get<boolean>('canesuEspalda')) add('Canesú de espalda', 'Montar el canesú a la espalda', FLAT)
    add('Hombros y mangas', 'Unir hombros y montar mangas', FLAT, 'Costuras cargadas con pespunte doble')
    add('Costados', 'Cerrar costados y bajo de manga', `${FLAT} + remalladora 3 hilos`)
    add('Cuello', 'Cuello entretelado montado al escote', FLAT)
    add('Puños', 'Puño con abertura, ojal y botón', FLAT)
    add('Tapeta', 'Tapeta delantera con ojales y botones (metálicos de presión o de pata)', FLAT)
    if (get('bajo') === 'pretina') add('Pretina', 'Pretina de 5 cm con botones de ajuste en los costados', FLAT)
    else add('Bajo', 'Dobladillo de 2,5 cm', FLAT)
  }

  if (t.id === 'cortavientos') {
    if (get('bolsillo') === 'canguro') add('Bolsillo canguro', 'Bolsillo canguro aplicado con boca a los lados', FLAT)
    if (get('bolsillo') === 'ojal') add('Bolsillos', 'Bolsillos de ojal con cremallera', FLAT, 'Entretela en la boca')
    add('Hombros y mangas', 'Unir hombros y montar mangas', FLAT, 'Costuras cargadas; sellar si es impermeable')
    add('Costados', 'Cerrar costados y bajo de manga', FLAT)
    add(get('cuello') === 'capucha' ? 'Capucha' : 'Cuello alto', get('cuello') === 'capucha' ? 'Capucha con cordón y topes' : 'Cuello alto con vista', FLAT)
    add('Cremallera', get('cremallera') === 'media' ? 'Media cremallera con vista (anorak)' : 'Cremallera separable con solapa contra el viento', `${FLAT} con prensatelas de cremallera`)
    add('Puños y bajo', get('punos') === 'canale' ? 'Canalé doblado y montado' : 'Ribete elástico de 1,5 cm', get('punos') === 'canale' ? OVERLOCK : FLAT)
  }

  if (t.id === 'top') {
    const kind = get<string>('tipo')
    if (kind === 'corse') {
      add('Paneles', 'Unir los paneles del corsé (delanteros, costados y espalda)', FLAT, 'Entretela o coutil en todos los paneles')
      if (get<boolean>('ballenas')) add('Ballenas', 'Coser los canales y meter las ballenas en cada costura', FLAT, 'Ballenas espirales o de acero plano')
      add('Cierre', get('cierre') === 'cordones' ? 'Ojetes metálicos a los dos lados de la espalda y cordón cruzado' : get('cierre') === 'cremallera' ? 'Cremallera invisible en la espalda' : 'Corchetes (busk) en el centro delantero', get('cierre') === 'cordones' ? 'Remachadora de ojetes' : FLAT)
      add('Forro', 'Forro completo cosido por el borde de arriba', FLAT)
    } else {
      add('Costados', 'Cerrar los costados', OVERLOCK)
      if (kind === 'bandeau') add('Borde superior', get<boolean>('fruncido') ? 'Elástico de silicona fruncido en el borde de arriba' : 'Elástico de silicona en el borde de arriba', COVER, 'Para que no resbale')
      else add('Escote y sisas', 'Ribete de bies en el escote y las sisas', COVER)
      if (kind === 'tirantes') add('Tirantes', `Tirantes ${get('tirantes') === 'anchos' ? 'anchos' : 'finos (espagueti)'} cosidos al escote delantero y a la espalda`, FLAT, 'Opcional: reguladores')
      if (kind === 'halter') add('Tirantes', 'Tirantes que suben al cuello y se atan detrás', FLAT)
      if (kind === 'cruzado') add('Cruce', 'Delanteros cruzados y lazo en el costado', FLAT)
    }
    add('Bajo', 'Dobladillo de 1,5 cm', COVER)
  }

  if (t.id === 'gorro') {
    add('Tejido', 'Tejer en circular (máquina rectilínea o circular de gorros)', 'Tricotosa', get('punto') === 'canale' ? 'Canalé 1x1 o 2x2' : 'Punto liso')
    add('Coronilla', 'Menguar y cerrar la coronilla', 'Remalladora o remallado a mano')
    if (get<boolean>('vuelta')) add('Vuelta', 'Doblar la vuelta y fijarla en la costura trasera', FLAT)
    if (get<boolean>('pompon')) add('Pompón', 'Hacer el pompón y coserlo en la coronilla', 'A mano')
  }

  if (t.id === 'gorra') {
    add('Paneles', `Unir los ${get('paneles')} paneles de la copa`, FLAT, 'Cinta interior en las costuras')
    add('Frontal', 'Entretelar los paneles delanteros (copa estructurada)', 'Prensa', 'Bucram o entretela gruesa')
    add('Ojetes', 'Ojetes bordados o metálicos en los paneles', 'Ojaladora')
    add('Visera', 'Cubrir la visera de plástico con el tejido y pespuntearla', FLAT, get('visera') === 'curva' ? 'Curvar antes de montar' : 'Visera plana')
    add('Montaje', 'Montar la visera a la copa y la cinta de sudor interior', FLAT)
    add('Botón', 'Botón forrado en la coronilla', 'A mano')
    if (get('cierre') !== 'cerrada') add('Cierre', `Cierre ${get('cierre')} en la abertura trasera`, FLAT)
  }

  if (isPants(t)) {
    const fixed = get('cintura') === 'trabillas'
    if (get<boolean>('banda')) add('Banda lateral', 'Coser la banda en la costura exterior, de la cinturilla al bajo', FLAT, 'Pespunte a los dos lados')
    if (get<boolean>('pinzas')) add('Pinzas', 'Dos pinzas en cada delantero, planchadas hacia el costado', FLAT)
    if (get<boolean>('laterales')) add('Bolsillos laterales', 'Bolsillo de costado con vista y bolsa', FLAT, 'Remallar las bolsas')
    if (get<boolean>('traseros')) add('Bolsillos traseros', fixed ? 'Bolsillos de ojal con vivo y botón' : 'Bolsillos de parche en la espalda', FLAT, 'Presillas en las esquinas')
    if (get<boolean>('cargo')) add('Bolsillos cargo', 'Bolsillo de fuelle con solapa aplicado al costado', FLAT, 'Presillas y cierre (velcro o automático)')
    if (fixed) add('Bragueta', 'Bragueta con cremallera y vista', `${FLAT} con prensatelas de cremallera`, 'Pespunte en J')
    add('Costados', 'Cerrar los costados', fixed ? `${FLAT} + remalladora 3 hilos` : OVERLOCK, fixed ? 'Costuras abiertas y planchadas' : 'Pespunte de carga hacia atrás')
    add('Tiro', 'Unir tiro delantero y trasero', OVERLOCK, 'Doble costura de refuerzo en la entrepierna')
    add('Entrepierna', 'Cerrar la entrepierna de un bajo al otro', OVERLOCK)
    if (fixed) {
      add('Cinturilla', 'Cinturilla entretelada con 5 o 6 trabillas, ojal y botón', FLAT, 'Trabillas de 1 × 5 cm con presillas')
    } else {
      add('Cinturilla', 'Cinturilla con elástico de 4 cm encanalado', `${OVERLOCK} + ${COVER}`, get<boolean>('cordon') ? 'Dos ojales para el cordón en el centro delantero' : '')
    }
    if (get('bajo') === 'puno') add('Bajos', 'Puño de canalé doblado y montado', OVERLOCK)
    else if (get('bajo') === 'vuelto') add('Bajos', 'Bajo vuelto de 4 cm, sujeto en las costuras', FLAT, 'Planchar el doblez hacia fuera')
    else add('Bajos', 'Dobladillo de 3 cm', fixed ? 'Punto invisible' : COVER)
  }

  // Extras de cuello y capucha (en cualquier prenda que los tenga)
  if (get<boolean>('capuchaCruzada')) add('Capucha cruzada', 'Solapar los delanteros de la capucha y fijarlos al escote', OVERLOCK, 'Hilvanar el cruce antes de montar')
  if (get<boolean>('cuelloAltoCapucha')) add('Cuello alto', 'Cuello alto doble montado al escote, por delante de la capucha', OVERLOCK, 'La capucha se monta por detrás del cuello')
  if (get<boolean>('balaclava')) add('Balaclava', 'Balaclava de punto con la abertura de los ojos ribeteada, cosida por dentro de la capucha', `${FLAT} + ${COVER}`, 'Fijarla en la costura del escote')
  const tab = get<string>('lengueta')
  if (tab && tab !== 'ninguna') add('Lengüeta del cuello', tab === 'velcro' ? 'Lengüeta con velcro que cruza la cremallera' : 'Lengüeta con dos automáticos que cruza la cremallera', FLAT, 'Entretelada')
  if (t.family !== 'head') rows.push({ ...topstitch, notes: isPants(t) ? 'En costados, bolsillos y cinturilla' : 'En hombros, sisas y escote' })
  add(
    'Etiquetas',
    t.family === 'head'
      ? 'Marca en la cinta interior o en la costura trasera; composición en una etiqueta interior'
      : isPants(t)
      ? 'Marca en el centro de la cinturilla trasera; talla y composición en el costado izquierdo'
      : 'Marca y talla en la nuca; composición y cuidados en el costado izquierdo, a 8 cm del bajo',
    FLAT,
  )
  return rows.map((r, i) => ({ id: `c${i + 1}`, ...r }))
}

/** Orden de montaje por defecto. */
export function defaultAssembly(t: GarmentTemplate, o: Options, withPrints: boolean): string[] {
  // Los extras de cuello y capucha van antes de las etiquetas
  const steps = baseAssembly(t, o, withPrints)
  const get = <T extends string | boolean>(id: string) => opt<T>(t, o, id)
  const extras = [
    ...(get<boolean>('balaclava') ? ['Montar la balaclava por dentro de la capucha'] : []),
    ...(get<boolean>('cuelloAltoCapucha') ? ['Montar el cuello alto por delante de la capucha'] : []),
    ...(get<string>('lengueta') && get('lengueta') !== 'ninguna' ? ['Coser la lengüeta del cuello y sus cierres'] : []),
  ]
  const at = steps.indexOf('Coser etiquetas')
  return at < 0 ? [...steps, ...extras] : [...steps.slice(0, at), ...extras, ...steps.slice(at)]
}

function baseAssembly(t: GarmentTemplate, o: Options, withPrints: boolean): string[] {
  const get = <T extends string | boolean>(id: string) => opt<T>(t, o, id)
  const prints = withPrints ? ['Estampar o bordar las piezas sueltas antes de coser (ver estampados)'] : []
  const start = ['Revisar el tejido y dejarlo reposar 24 h antes de cortar', 'Cortar todas las piezas al hilo, marcando piquetes', ...prints]
  const end = ['Coser etiquetas', 'Rematar hilos, planchar y control de calidad (medidas con tolerancia)']

  if (isPants(t)) {
    const fixed = get('cintura') === 'trabillas'
    return [
      ...start,
      ...(get<boolean>('pinzas') ? ['Coser y planchar las pinzas'] : []),
      ...(get<boolean>('laterales') ? ['Preparar y montar los bolsillos laterales'] : []),
      ...(get<boolean>('traseros') ? ['Hacer los bolsillos traseros'] : []),
      ...(get<boolean>('cargo') ? ['Preparar los bolsillos cargo y aplicarlos a las perneras'] : []),
      ...(fixed ? ['Montar la bragueta con cremallera'] : []),
      'Cerrar costados',
      'Unir el tiro delantero y el trasero',
      'Cerrar la entrepierna',
      fixed ? 'Preparar las trabillas, montar la cinturilla, hacer el ojal y coser el botón' : 'Preparar y montar la cinturilla con el elástico',
      ...(!fixed && get<boolean>('cordon') ? ['Pasar el cordón y rematar sus puntas'] : []),
      get('bajo') === 'puno' ? 'Montar los puños' : get('bajo') === 'vuelto' ? 'Hacer el bajo vuelto y fijarlo en las costuras' : 'Hacer los dobladillos',
      ...end,
    ]
  }
  if (t.id === 'polo' || t.id === 'camisa') {
    const shirt = t.id === 'camisa'
    return [
      ...start,
      'Pegar entretelas en tapeta, cuello y puños',
      ...(get<boolean>('bolsillo') ? ['Aplicar el bolsillo de pecho'] : []),
      shirt ? 'Hacer la tapeta delantera' : 'Abrir y montar la tapeta del polo',
      ...(shirt && get<boolean>('canesu') ? ['Montar el canesú (unir delanteros y espalda)'] : ['Unir hombros']),
      'Preparar y montar el cuello',
      'Montar las mangas',
      'Cerrar costados y mangas',
      shirt && get('manga') === 'larga' ? 'Hacer las aberturas de manga y montar los puños' : get('punos') === 'canale' ? 'Montar los puños de canalé' : 'Hacer los dobladillos de manga',
      'Hacer el dobladillo del bajo',
      'Hacer los ojales y coser los botones',
      ...end,
    ]
  }
  if (t.id === 'puffer') {
    return [
      ...start,
      'Cortar exterior, guata y forro de cada pieza',
      'Pespuntear los canales del acolchado',
      ...(get('bolsillos') === 'ojal' ? ['Hacer los bolsillos del delantero'] : []),
      'Unir hombros, montar mangas y cerrar costados (casando los canales)',
      get('cuello') === 'capucha' ? 'Montar la capucha' : 'Montar el cuello alto',
      'Montar la cremallera con su solapa',
      'Montar puños y bajo',
      'Unir el forro y volver la prenda',
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
  if (t.id === 'gorro') {
    return [...start.slice(0, 1), 'Tejer el gorro', 'Menguar y cerrar la coronilla', ...(get<boolean>('vuelta') ? ['Doblar y fijar la vuelta'] : []), ...(get<boolean>('pompon') ? ['Coser el pompón'] : []), ...end]
  }
  if (t.id === 'gorra') {
    return [...start, 'Entretelar el frontal', 'Unir los paneles de la copa', 'Hacer los ojetes', 'Forrar la visera y pespuntearla', 'Montar la visera y la cinta de sudor', 'Coser el botón de la coronilla', ...(get('cierre') !== 'cerrada' ? ['Montar el cierre trasero'] : []), ...end]
  }
  if (t.id === 'chaleco' || t.id === 'cazadora' || t.id === 'cortavientos') {
    return [
      ...start,
      ...(t.id === 'chaleco' && get('tipo') === 'acolchado' ? ['Pespuntear los canales del acolchado'] : []),
      'Hacer los bolsillos',
      'Unir hombros',
      ...(t.id === 'chaleco' ? ['Cerrar costados', 'Ribetear las sisas'] : ['Montar las mangas', 'Cerrar costados y mangas']),
      get('cuello') === 'capucha' ? 'Montar la capucha' : 'Montar el cuello',
      t.id === 'cazadora' ? 'Hacer la tapeta, los ojales y coser los botones' : 'Montar la cremallera',
      t.id === 'cazadora' ? (get('bajo') === 'pretina' ? 'Montar la pretina' : 'Hacer el dobladillo') : 'Montar puños y bajo',
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
