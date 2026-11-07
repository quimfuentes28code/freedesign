import { QUILT_SHAPES, type QuiltShape } from './quilt'
import { drawPants, PANTS_PIECES, type PantsCfg } from './pants'
import { CX } from './geometry'
import { drawTop, TOP_PIECES, type Neck, type TopCfg } from './top'
import { drawBeanie, drawCap, HEAD_PIECES, HEAD_UNITS_PER_CM, type CapCfg } from './head'
import { drawFemTop, FEMTOP_PIECES } from './femtop'
import { opt, type ChoiceOption, type GarmentTemplate, type OptionDef, type Options, type PieceDef, type ToggleOption } from './types'

/**
 * Catálogo de prendas base del Diseñador. Añadir una prenda = una entrada más en TEMPLATES
 * (las de torso reutilizan `drawTop` y los pantalones `drawPants`, con sus opciones).
 * Los ids de prendas, piezas y opciones se guardan en los diseños: no cambiarlos.
 */

const T = TOP_PIECES
const PP = PANTS_PIECES
const FABRIC = ['tejido'] as PieceDef['materials']
const TRIM = ['fornitura'] as PieceDef['materials']

/** Posiciones de estampado habituales en prendas de torso. */
const TOP_ZONES: GarmentTemplate['printZones'] = {
  front: [
    { id: 'pecho-izq', label: 'Pecho izquierdo', x: CX + 34, y: 152, w: 30 },
    { id: 'pecho', label: 'Centro pecho', x: CX, y: 162, w: 70 },
    { id: 'frontal', label: 'Frontal grande', x: CX, y: 196, w: 112 },
  ],
  back: [
    { id: 'nuca', label: 'Nuca', x: CX, y: 124, w: 30 },
    { id: 'espalda-alta', label: 'Espalda alta', x: CX, y: 150, w: 92 },
    { id: 'espalda', label: 'Espalda completa', x: CX, y: 206, w: 140 },
  ],
  side: [{ id: 'manga', label: 'Manga', x: CX + 6, y: 210, w: 28 }],
}

/** Posiciones de estampado habituales en pantalones. */
const PANTS_ZONES: GarmentTemplate['printZones'] = {
  front: [
    { id: 'muslo-izq', label: 'Muslo izquierdo', x: CX + 44, y: 170, w: 32 },
    { id: 'bajo-izq', label: 'Bajo de la pierna', x: CX + 46, y: 400, w: 28 },
  ],
  back: [{ id: 'bolsillo', label: 'Encima del bolsillo', x: CX + 46, y: 130, w: 34 }],
  side: [{ id: 'lateral', label: 'Lateral de la pierna', x: CX, y: 340, w: 28 }],
}

/** Shorts: el bajo de la pierna queda mucho más arriba. */
const SHORTS_ZONES: GarmentTemplate['printZones'] = {
  ...PANTS_ZONES,
  front: [
    { id: 'muslo-izq', label: 'Muslo izquierdo', x: CX + 44, y: 170, w: 32 },
    { id: 'bajo-izq', label: 'Bajo de la pierna', x: CX + 50, y: 226, w: 26 },
  ],
  side: [{ id: 'lateral', label: 'Lateral de la pierna', x: CX, y: 220, w: 26 }],
}

// --- Opciones que se repiten ---

const choice = (id: string, label: string, group: OptionDef['group'], choices: [string, string][], def: string): ChoiceOption => ({
  id,
  label,
  group,
  type: 'choice',
  choices: choices.map(([cid, clabel]) => ({ id: cid, label: clabel })),
  default: def,
})
const toggle = (id: string, label: string, group: OptionDef['group'], def: boolean): ToggleOption => ({ id, label, group, type: 'toggle', default: def })

/** Acolchado (puffer, chaleco): separación de los canales y su forma. */
const CHANNEL_STEP: Record<string, number> = { estrechos: 22, medios: 28, anchos: 34 }
const channelWidth = (def: string) => choice('canales', 'Ancho de los canales', 'detalles', [['estrechos', 'Estrechos'], ['medios', 'Medios'], ['anchos', 'Anchos']], def)
const channelShape = choice('formaCanales', 'Forma de los canales', 'detalles', QUILT_SHAPES.map((q) => [q.id, q.label] as [string, string]), 'rectos')

const stitchOption = choice('costuras', 'Pespuntes', 'acabados', [['simple', 'Simple'], ['doble', 'Doble']], 'simple')
const lengthOption = choice('largo', 'Largo', 'corte', [['crop', 'Crop'], ['normal', 'Normal'], ['largo', 'Largo']], 'normal')
const topFit = (def: string, ids = ['ajustado', 'regular', 'boxy', 'oversize']) =>
  choice('corte', 'Corte', 'corte', ids.map((i) => [i, { cenido: 'Ceñido (pegado al cuerpo)', ajustado: 'Ajustado', regular: 'Regular', boxy: 'Boxy', oversize: 'Oversize' }[i]!]), def)
const pantsFit = (def: string, ids = ['slim', 'regular', 'ancho', 'baggy']) =>
  choice('corte', 'Corte', 'corte', ids.map((i) => [i, { slim: 'Slim', regular: 'Regular', ancho: 'Ancho', baggy: 'Baggy' }[i]!]), def)
/** Cuello alto (cisne, chaquetas): pegado al cuello o separado de él. */
const neckFitOption = (def: 'cenido' | 'holgado') => choice('ajusteCuello', 'Ajuste del cuello alto', 'detalles', [['holgado', 'Holgado'], ['cenido', 'Ceñido']], def)
const sleeveOption = (def: string) => choice('manga', 'Manga', 'corte', [['corta', 'Corta'], ['larga', 'Larga']], def)

/** Configuración común de las prendas de torso (lo que cada prenda no cambia). */
const topBase = (o: Options, t: GarmentTemplate): Pick<TopCfg, 'fit' | 'length' | 'stitch' | 'cords' | 'sleevePocket' | 'zip' | 'pocket' | 'fem'> => ({
  fit: opt(t, o, 'corte'),
  length: opt(t, o, 'largo') ?? 'normal',
  stitch: opt(t, o, 'costuras'),
  cords: false,
  sleevePocket: false,
  zip: 'ninguna',
  pocket: 'ninguno',
  fem: o.genero === 'mujer',
})

/** Si la prenda lleva capucha con estas opciones (sudadera: casilla; el resto: el cuello «capucha»). */
const hasHood = (t: GarmentTemplate, o: Options) => opt<boolean>(t, o, 'capucha') === true || opt(t, o, 'cuello') === 'capucha'

/**
 * Extras de cuello y capucha que se combinan con lo demás: capucha cruzada, cuello alto bajo la capucha,
 * balaclava por dentro y lengüeta de cierre en el cuello alto. Se añaden a una prenda con `withNeckExtras`.
 */
const neckExtrasCfg = (t: GarmentTemplate, o: Options): Pick<TopCfg, 'hoodCross' | 'hoodCollar' | 'balaclava' | 'neckTab' | 'cords'> => {
  const hood = hasHood(t, o)
  return {
    // Cordones de la capucha (la sudadera y el cortavientos los ponen después con su propia opción)
    cords: hood && opt<boolean>(t, o, 'cordones') === true,
    hoodCross: hood && opt<boolean>(t, o, 'capuchaCruzada') === true,
    hoodCollar: hood && opt<boolean>(t, o, 'cuelloAltoCapucha') === true,
    balaclava: hood && opt<boolean>(t, o, 'balaclava') === true,
    neckTab: opt(t, o, 'lengueta') ?? 'ninguna',
  }
}

function withNeckExtras(t: GarmentTemplate, { tab }: { tab: boolean }) {
  const color = t.pieces.find((p) => p.id === T.body)?.defaultColor ?? '#cccccc'
  // Las prendas que no traen cordones propios los ganan como opción (la capucha de la puffer, la bomber o el chaleco)
  const ownCords = t.options.some((x) => x.id === 'cordones')
  const extra: OptionDef[] = [
    ...(ownCords ? [] : [toggle('cordones', 'Cordones de la capucha', 'detalles', false)]),
    toggle('capuchaCruzada', 'Capucha cruzada', 'detalles', false),
    toggle('cuelloAltoCapucha', 'Cuello alto bajo la capucha', 'detalles', false),
    toggle('balaclava', 'Balaclava dentro de la capucha', 'detalles', false),
    ...(tab ? [choice('lengueta', 'Lengüeta en el cuello', 'detalles', [['ninguna', 'Sin lengüeta'], ['automaticos', 'Con automáticos'], ['velcro', 'Con velcro']], 'ninguna')] : []),
  ]
  // Antes de los pespuntes (que van al final del grupo de acabados)
  const at = t.options.findIndex((x) => x.group === 'acabados')
  t.options.splice(at < 0 ? t.options.length : at, 0, ...extra)
  t.pieces.push({ id: T.balaclava, label: 'Balaclava', defaultColor: color, materials: FABRIC }, ...(tab ? [{ id: T.tab, label: 'Lengüeta', defaultColor: color, materials: FABRIC }] : []))
  if (!ownCords) t.pieces.push({ id: T.cords, label: 'Cordones', defaultColor: '#f4f1ea', materials: TRIM })
  if (!t.pieces.some((p) => p.id === T.collar)) t.pieces.push({ id: T.collar, label: 'Cuello', defaultColor: color, materials: FABRIC })
  const active = t.activePieces
  t.activePieces = (o) => {
    const c = neckExtrasCfg(t, o)
    const list = active(o)
    return [
      ...list,
      ...(c.balaclava ? [T.balaclava] : []),
      ...(!ownCords && c.cords ? [T.cords] : []),
      ...(c.hoodCollar && !list.includes(T.collar) ? [T.collar] : []),
      ...(c.neckTab !== 'ninguna' && (c.hoodCollar || opt(t, o, 'cuello') === 'alto') ? [T.tab] : []),
    ]
  }
  return t
}

// --- Sudadera ---

const sudadera: GarmentTemplate = {
  id: 'sudadera',
  family: 'top',
  name: 'Sudadera',
  description: 'Con o sin capucha, bolsillo canguro, cremallera, cordones y canalé.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.hood, label: 'Capucha', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#b9a78d', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#b9a78d', materials: FABRIC },
    { id: T.cords, label: 'Cordones', defaultColor: '#f4f1ea', materials: TRIM },
    { id: T.hardware, label: 'Cremallera', defaultColor: '#2b2b2b', materials: TRIM },
    { id: T.placket, label: 'Tapeta', defaultColor: '#c9b89f', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#f4f1ea', materials: TRIM },
  ],
  options: [
    topFit('oversize'),
    lengthOption,
    toggle('capucha', 'Capucha', 'detalles', true),
    choice('cuelloSin', 'Cuello (sin capucha)', 'detalles', [['redondo', 'Redondo'], ['alto', 'Alto'], ['polo', 'Polo']], 'redondo'),
    neckFitOption('cenido'),
    toggle('cordones', 'Cordones', 'detalles', true),
    choice('bolsillo', 'Bolsillo', 'detalles', [['canguro', 'Canguro'], ['ninguno', 'Sin bolsillo']], 'canguro'),
    choice('cremallera', 'Cremallera', 'detalles', [['ninguna', 'Sin cremallera'], ['media', 'Media'], ['completa', 'Completa']], 'ninguna'),
    choice('punos', 'Puños y bajo', 'acabados', [['canale', 'Canalé'], ['recto', 'Dobladillo']], 'canale'),
    stitchOption,
  ],
  activePieces: (o) => {
    const hood = opt<boolean>(sudadera, o, 'capucha')
    const rib = opt(sudadera, o, 'punos') === 'canale'
    return [
      T.body,
      T.sleeves,
      hood ? T.hood : T.collar,
      ...(opt(sudadera, o, 'bolsillo') === 'canguro' ? [T.pocket] : []),
      ...(rib ? [T.cuffs, T.hem] : []),
      ...(hood && opt<boolean>(sudadera, o, 'cordones') ? [T.cords] : []),
      ...(opt(sudadera, o, 'cremallera') !== 'ninguna' ? [T.hardware] : []),
      ...(!hood && opt(sudadera, o, 'cuelloSin') === 'polo' ? [T.placket, T.buttons] : []),
    ]
  },
  draw: (view, o, s) => {
    const rib = opt(sudadera, o, 'punos') === 'canale' ? 'canale' : 'recto'
    const hood = opt<boolean>(sudadera, o, 'capucha')
    const neck: Neck = hood ? 'capucha' : opt<Neck>(sudadera, o, 'cuelloSin')
    return drawTop(view, {
      ...topBase(o, sudadera),
      ...neckExtrasCfg(sudadera, o),
      sleeve: 'larga',
      neck,
      // Cuello polo en sudadera (estilo rugby): con tapeta corta de botones
      placket: neck === 'polo' ? 'corta' : 'ninguna',
      buttons: 3,
      hem: rib,
      cuff: rib,
      zip: opt(sudadera, o, 'cremallera'),
      pocket: opt(sudadera, o, 'bolsillo'),
      cords: opt<boolean>(sudadera, o, 'cordones'),
      scale: s,
    })
  },
}

// --- Camiseta ---

const camiseta: GarmentTemplate = {
  id: 'camiseta',
  family: 'top',
  name: 'Camiseta',
  description: 'Cuello redondo, de pico, cisne o henley, manga corta o larga, cortes regular, boxy u oversize.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#d9d4c7', materials: TRIM },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#f2efe8', materials: FABRIC },
  ],
  options: [
    topFit('boxy', ['cenido', 'ajustado', 'regular', 'boxy', 'oversize']),
    lengthOption,
    sleeveOption('corta'),
    choice('cuello', 'Cuello', 'detalles', [['redondo', 'Redondo'], ['pico', 'Pico'], ['alto', 'Cisne'], ['henley', 'Henley']], 'redondo'),
    neckFitOption('cenido'),
    toggle('bolsillo', 'Bolsillo de pecho', 'detalles', false),
    stitchOption,
  ],
  activePieces: (o) => {
    const henley = opt(camiseta, o, 'cuello') === 'henley'
    return [T.body, T.sleeves, T.collar, ...(henley ? [T.placket, T.buttons] : []), ...(opt<boolean>(camiseta, o, 'bolsillo') ? [T.pocket] : [])]
  },
  draw: (view, o, s) => {
    const neck = opt<string>(camiseta, o, 'cuello')
    return drawTop(view, {
      ...topBase(o, camiseta),
      sleeve: opt(camiseta, o, 'manga'),
      neck: neck === 'henley' ? 'redondo' : (neck as Neck),
      hem: 'recto',
      cuff: 'recto',
      pocket: opt<boolean>(camiseta, o, 'bolsillo') ? 'pecho' : 'ninguno',
      placket: neck === 'henley' ? 'corta' : 'ninguna',
      buttons: 3,
      scale: s,
    })
  },
}

// --- Polo ---

const polo: GarmentTemplate = {
  id: 'polo',
  family: 'top',
  name: 'Polo',
  description: 'Cuello polo, camisero o mao, tapeta de 2 a 4 botones, manga corta o larga con puño de canalé.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#1f2a44', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#1f2a44', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#1f2a44', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#1f2a44', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#f2efe8', materials: TRIM },
    { id: T.cuffs, label: 'Puños', defaultColor: '#1f2a44', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#1f2a44', materials: FABRIC },
  ],
  options: [
    topFit('regular'),
    lengthOption,
    sleeveOption('corta'),
    choice('cuello', 'Cuello', 'detalles', [['polo', 'Polo'], ['camisero', 'Camisero'], ['mao', 'Mao']], 'polo'),
    choice('botones', 'Botones', 'detalles', [['2', '2'], ['3', '3'], ['4', '4']], '3'),
    toggle('bolsillo', 'Bolsillo de pecho', 'detalles', false),
    choice('punos', 'Puños', 'acabados', [['canale', 'Canalé'], ['recto', 'Dobladillo']], 'canale'),
    stitchOption,
  ],
  activePieces: (o) => [
    T.body,
    T.sleeves,
    T.collar,
    T.placket,
    T.buttons,
    ...(opt(polo, o, 'punos') === 'canale' ? [T.cuffs] : []),
    ...(opt<boolean>(polo, o, 'bolsillo') ? [T.pocket] : []),
  ],
  draw: (view, o, s) =>
    drawTop(view, {
      ...topBase(o, polo),
      sleeve: opt(polo, o, 'manga'),
      neck: opt<Neck>(polo, o, 'cuello'),
      hem: 'recto',
      cuff: opt(polo, o, 'punos') === 'canale' ? 'canale' : 'recto',
      pocket: opt<boolean>(polo, o, 'bolsillo') ? 'pecho' : 'ninguno',
      placket: 'corta',
      buttons: Number(opt(polo, o, 'botones')),
      ribScale: 0.8,
      scale: s,
    }),
}

// --- Camisa ---

const camisa: GarmentTemplate = {
  id: 'camisa',
  family: 'top',
  name: 'Camisa',
  description: 'Manga larga con puño o manga corta, cuello camisero, mao o cubano, bajo curvo o recto y canesú.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#d9d4c7', materials: TRIM },
    { id: T.cuffs, label: 'Puños', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#f2efe8', materials: FABRIC },
  ],
  options: [
    topFit('regular'),
    lengthOption,
    sleeveOption('larga'),
    choice('cuello', 'Cuello', 'detalles', [['camisero', 'Camisero'], ['mao', 'Mao'], ['cubano', 'Cubano (abierto)']], 'camisero'),
    toggle('bolsillo', 'Bolsillo de pecho', 'detalles', true),
    toggle('canesu', 'Canesú en la espalda', 'detalles', true),
    choice('bajo', 'Bajo', 'acabados', [['curvo', 'Curvo'], ['recto', 'Recto']], 'curvo'),
    stitchOption,
  ],
  activePieces: (o) => [
    T.body,
    T.sleeves,
    T.collar,
    T.placket,
    T.buttons,
    ...(opt(camisa, o, 'manga') === 'larga' ? [T.cuffs] : []),
    ...(opt<boolean>(camisa, o, 'bolsillo') ? [T.pocket] : []),
  ],
  draw: (view, o, s) => {
    const long = opt(camisa, o, 'manga') === 'larga'
    return drawTop(view, {
      ...topBase(o, camisa),
      sleeve: long ? 'larga' : 'corta',
      neck: opt<Neck>(camisa, o, 'cuello'),
      hem: opt(camisa, o, 'bajo') === 'curvo' ? 'curvo' : 'recto',
      cuff: long ? 'camisero' : 'recto',
      pocket: opt<boolean>(camisa, o, 'bolsillo') ? 'pecho' : 'ninguno',
      placket: 'completa',
      yoke: opt<boolean>(camisa, o, 'canesu'),
      scale: s,
    })
  },
}

// --- Bomber ---

const bomber: GarmentTemplate = {
  id: 'bomber',
  family: 'top',
  name: 'Chaqueta bomber',
  description: 'Cuello de canalé, alto, de solapa o capucha; cremallera o botones; bolsillos de ojal o con solapa.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.hood, label: 'Capucha', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillos', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#b8b8b8', materials: TRIM },
    { id: T.hardware, label: 'Cremallera y fornituras', defaultColor: '#b8b8b8', materials: TRIM },
  ],
  options: [
    topFit('boxy', ['regular', 'boxy', 'oversize']),
    choice('largo', 'Largo', 'corte', [['crop', 'Crop'], ['normal', 'Normal']], 'normal'),
    choice('cuello', 'Cuello', 'detalles', [['canale', 'Canalé'], ['alto', 'Alto'], ['solapa', 'Solapa'], ['capucha', 'Capucha']], 'canale'),
    neckFitOption('holgado'),
    choice('cierre', 'Cierre', 'detalles', [['cremallera', 'Cremallera'], ['botones', 'Botones']], 'cremallera'),
    choice('bolsillos', 'Bolsillos', 'detalles', [['ojal', 'De ojal'], ['solapa', 'Con solapa'], ['ninguno', 'Sin bolsillos']], 'ojal'),
    toggle('bolsilloManga', 'Bolsillo en la manga', 'detalles', true),
    stitchOption,
  ],
  activePieces: (o) => {
    const neck = opt(bomber, o, 'cuello')
    const buttons = opt(bomber, o, 'cierre') === 'botones'
    return [
      T.body,
      T.sleeves,
      neck === 'capucha' ? T.hood : T.collar,
      T.cuffs,
      T.hem,
      ...(opt(bomber, o, 'bolsillos') !== 'ninguno' || opt<boolean>(bomber, o, 'bolsilloManga') ? [T.pocket] : []),
      ...(buttons ? [T.placket, T.buttons] : []),
      T.hardware,
    ]
  },
  draw: (view, o, s) => {
    const neck = opt<string>(bomber, o, 'cuello')
    const buttons = opt(bomber, o, 'cierre') === 'botones'
    return drawTop(view, {
      ...topBase(o, bomber),
      ...neckExtrasCfg(bomber, o),
      sleeve: 'larga',
      neck: neck === 'canale' ? 'bomber' : (neck as Neck),
      hem: 'canale',
      cuff: 'canale',
      zip: buttons ? 'ninguna' : 'completa',
      placket: buttons ? 'completa' : 'ninguna',
      pocket: opt(bomber, o, 'bolsillos'),
      sleevePocket: opt(bomber, o, 'bolsilloManga'),
      ribScale: 1.35,
      scale: s,
    })
  },
}

// --- Puffer ---

const puffer: GarmentTemplate = {
  id: 'puffer',
  family: 'top',
  name: 'Chaqueta puffer',
  description: 'Acolchada, con cuello alto o capucha, canales estrechos o anchos y cremallera completa.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.hood, label: 'Capucha', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillos', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#1d1d1f', materials: FABRIC },
    { id: T.hardware, label: 'Cremallera', defaultColor: '#2b2b2b', materials: TRIM },
  ],
  options: [
    topFit('boxy', ['regular', 'boxy', 'oversize']),
    lengthOption,
    choice('cuello', 'Cuello', 'detalles', [['alto', 'Alto'], ['capucha', 'Capucha']], 'alto'),
    neckFitOption('holgado'),
    channelWidth('anchos'),
    channelShape,
    choice('bolsillos', 'Bolsillos', 'detalles', [['ojal', 'De ojal'], ['ninguno', 'Sin bolsillos']], 'ojal'),
    choice('punos', 'Puños y bajo', 'acabados', [['recto', 'Ribete elástico'], ['canale', 'Canalé']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => {
    const rib = opt(puffer, o, 'punos') === 'canale'
    return [
      T.body,
      T.sleeves,
      opt(puffer, o, 'cuello') === 'capucha' ? T.hood : T.collar,
      ...(opt(puffer, o, 'bolsillos') === 'ojal' ? [T.pocket] : []),
      ...(rib ? [T.cuffs, T.hem] : []),
      T.hardware,
    ]
  },
  draw: (view, o, s) => {
    const rib = opt(puffer, o, 'punos') === 'canale' ? 'canale' : 'recto'
    return drawTop(view, {
      ...topBase(o, puffer),
      ...neckExtrasCfg(puffer, o),
      sleeve: 'larga',
      neck: opt(puffer, o, 'cuello') === 'capucha' ? 'capucha' : 'alto',
      hem: rib,
      cuff: rib,
      zip: 'completa',
      pocket: opt(puffer, o, 'bolsillos') === 'ojal' ? 'ojal' : 'ninguno',
      quilt: CHANNEL_STEP[opt<string>(puffer, o, 'canales')] ?? 34,
      quiltShape: opt<QuiltShape>(puffer, o, 'formaCanales'),
      ribScale: 0.8,
      scale: s,
    })
  },
}

// --- Pantalones ---

const pantsPieces = (legs: string): PieceDef[] => [
  { id: PP.legs, label: 'Perneras', defaultColor: legs, materials: FABRIC },
  { id: PP.waistband, label: 'Cinturilla', defaultColor: legs, materials: FABRIC },
  { id: PP.pockets, label: 'Bolsillos', defaultColor: legs, materials: FABRIC },
  { id: PP.cuffs, label: 'Puños', defaultColor: legs, materials: FABRIC },
  { id: PP.cord, label: 'Cordón', defaultColor: '#f4f1ea', materials: TRIM },
  { id: PP.buttons, label: 'Botón', defaultColor: '#8a8780', materials: TRIM },
  { id: PP.stripe, label: 'Banda lateral', defaultColor: '#f2efe8', materials: FABRIC },
]

/** Piezas que salen en un pantalón con estas opciones. */
function pantsActive(t: GarmentTemplate, o: Options, waist: 'elastica' | 'trabillas') {
  return [
    PP.legs,
    PP.waistband,
    ...(opt<boolean>(t, o, 'cargo') || opt<boolean>(t, o, 'traseros') ? [PP.pockets] : []),
    ...(opt(t, o, 'bajo') === 'puno' ? [PP.cuffs] : []),
    ...(waist === 'elastica' && opt<boolean>(t, o, 'cordon') ? [PP.cord] : []),
    ...(waist === 'trabillas' ? [PP.buttons] : []),
    ...(opt<boolean>(t, o, 'banda') ? [PP.stripe] : []),
  ]
}

function pantsCfg(t: GarmentTemplate, o: Options, waist: 'elastica' | 'trabillas', s: PantsCfg['scale']): PantsCfg {
  return {
    fit: opt(t, o, 'corte'),
    length: opt(t, o, 'largo'),
    hem: opt(t, o, 'bajo'),
    waist,
    pleats: opt<boolean>(t, o, 'pinzas') ?? false,
    sidePockets: opt(t, o, 'laterales'),
    cargo: opt<boolean>(t, o, 'cargo') ?? false,
    backPockets: opt(t, o, 'traseros'),
    cord: waist === 'elastica' && (opt<boolean>(t, o, 'cordon') ?? false),
    stitch: opt(t, o, 'costuras'),
    fem: o.genero === 'mujer',
    stripe: opt<boolean>(t, o, 'banda') ? 12 : 0,
    scale: s,
  }
}

const pantalon: GarmentTemplate = {
  id: 'pantalon',
  family: 'pants',
  name: 'Pantalón jogger / cargo',
  description: 'Cintura elástica con cordón, bolsillos laterales, cargo y traseros, bajo con puño o recto.',
  printZones: PANTS_ZONES,
  pieces: pantsPieces('#4b4f45').filter((p) => p.id !== PP.buttons),
  options: [
    pantsFit('regular'),
    choice('largo', 'Largo', 'corte', [['tobillero', 'Tobillero'], ['largo', 'Largo']], 'largo'),
    choice('bajo', 'Bajo', 'corte', [['puno', 'Con puño (jogger)'], ['recto', 'Recto']], 'puno'),
    toggle('laterales', 'Bolsillos laterales', 'detalles', true),
    toggle('cargo', 'Bolsillos cargo', 'detalles', true),
    toggle('traseros', 'Bolsillos traseros', 'detalles', true),
    toggle('cordon', 'Cordón', 'detalles', true),
    toggle('banda', 'Banda lateral', 'detalles', false),
    stitchOption,
  ],
  activePieces: (o) => pantsActive(pantalon, o, 'elastica'),
  draw: (view, o, s) => drawPants(view, pantsCfg(pantalon, o, 'elastica', s)),
}

const pantalonAncho: GarmentTemplate = {
  id: 'pantalon-ancho',
  family: 'pants',
  name: 'Pantalón ancho',
  description: 'Pierna ancha de vestir o skater: cintura con trabillas o elástica, pinzas, raya y bajo vuelto.',
  printZones: PANTS_ZONES,
  pieces: pantsPieces('#3a3a3c').filter((p) => p.id !== PP.cuffs),
  options: [
    pantsFit('ancho', ['regular', 'ancho', 'baggy']),
    choice('largo', 'Largo', 'corte', [['tobillero', 'Tobillero'], ['largo', 'Largo']], 'largo'),
    choice('cintura', 'Cintura', 'detalles', [['trabillas', 'Con trabillas y botón'], ['elastica', 'Elástica']], 'trabillas'),
    toggle('pinzas', 'Pinzas', 'detalles', true),
    toggle('laterales', 'Bolsillos laterales', 'detalles', true),
    toggle('traseros', 'Bolsillos traseros', 'detalles', true),
    toggle('cordon', 'Cordón (cintura elástica)', 'detalles', false),
    choice('bajo', 'Bajo', 'acabados', [['recto', 'Recto'], ['vuelto', 'Vuelto']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => pantsActive(pantalonAncho, o, opt(pantalonAncho, o, 'cintura')),
  draw: (view, o, s) => drawPants(view, { ...pantsCfg(pantalonAncho, o, opt(pantalonAncho, o, 'cintura'), s), wide: true }),
}

const pantalonCorto: GarmentTemplate = {
  id: 'pantalon-corto',
  family: 'pants',
  name: 'Pantalón corto',
  description: 'Shorts o bermudas: cintura elástica con cordón o con trabillas, bolsillos laterales, cargo y traseros.',
  printZones: SHORTS_ZONES,
  pieces: pantsPieces('#4b4f45'),
  options: [
    pantsFit('ancho'),
    choice('largo', 'Largo', 'corte', [['mini', 'Mini'], ['corto', 'Corto'], ['bermuda', 'Bermuda']], 'corto'),
    choice('cintura', 'Cintura', 'detalles', [['elastica', 'Elástica'], ['trabillas', 'Con trabillas y botón']], 'elastica'),
    toggle('laterales', 'Bolsillos laterales', 'detalles', true),
    toggle('cargo', 'Bolsillos cargo', 'detalles', false),
    toggle('traseros', 'Bolsillos traseros', 'detalles', true),
    toggle('cordon', 'Cordón', 'detalles', true),
    toggle('banda', 'Banda lateral', 'detalles', false),
    choice('bajo', 'Bajo', 'acabados', [['recto', 'Recto'], ['vuelto', 'Vuelto'], ['puno', 'Con puño']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => pantsActive(pantalonCorto, o, opt(pantalonCorto, o, 'cintura')),
  draw: (view, o, s) => drawPants(view, pantsCfg(pantalonCorto, o, opt(pantalonCorto, o, 'cintura'), s)),
}

// --- Chaleco ---

const chaleco: GarmentTemplate = {
  id: 'chaleco',
  family: 'top',
  name: 'Chaleco',
  description: 'Sin mangas, acolchado o de tela, con cuello alto, redondo o capucha, cremallera o botones.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.hood, label: 'Capucha', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillos', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#2f3a2e', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#b8b8b8', materials: TRIM },
    { id: T.hardware, label: 'Cremallera', defaultColor: '#2b2b2b', materials: TRIM },
  ],
  options: [
    topFit('boxy', ['regular', 'boxy', 'oversize']),
    lengthOption,
    choice('tipo', 'Tipo', 'corte', [['acolchado', 'Acolchado'], ['tela', 'De tela']], 'acolchado'),
    channelWidth('medios'),
    channelShape,
    choice('cuello', 'Cuello', 'detalles', [['alto', 'Alto'], ['redondo', 'Redondo'], ['pico', 'Pico'], ['capucha', 'Capucha']], 'alto'),
    neckFitOption('holgado'),
    choice('cierre', 'Cierre', 'detalles', [['cremallera', 'Cremallera'], ['botones', 'Botones']], 'cremallera'),
    choice('bolsillos', 'Bolsillos', 'detalles', [['ojal', 'De ojal'], ['solapa', 'Con solapa'], ['ninguno', 'Sin bolsillos']], 'ojal'),
    choice('bajo', 'Bajo', 'acabados', [['recto', 'Ribete'], ['canale', 'Canalé']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => {
    const neck = opt(chaleco, o, 'cuello')
    const buttons = opt(chaleco, o, 'cierre') === 'botones'
    return [
      T.body,
      neck === 'capucha' ? T.hood : T.collar,
      ...(opt(chaleco, o, 'bolsillos') !== 'ninguno' ? [T.pocket] : []),
      ...(opt(chaleco, o, 'bajo') === 'canale' ? [T.hem] : []),
      ...(buttons ? [T.placket, T.buttons] : [T.hardware]),
    ]
  },
  draw: (view, o, s) => {
    const buttons = opt(chaleco, o, 'cierre') === 'botones'
    return drawTop(view, {
      ...topBase(o, chaleco),
      ...neckExtrasCfg(chaleco, o),
      sleeve: 'sin',
      neck: opt<Neck>(chaleco, o, 'cuello'),
      hem: opt(chaleco, o, 'bajo') === 'canale' ? 'canale' : 'recto',
      cuff: 'recto',
      zip: buttons ? 'ninguna' : 'completa',
      placket: buttons ? 'completa' : 'ninguna',
      pocket: opt(chaleco, o, 'bolsillos'),
      quilt: opt(chaleco, o, 'tipo') === 'acolchado' ? (CHANNEL_STEP[opt<string>(chaleco, o, 'canales')] ?? 30) : 0,
      quiltShape: opt<QuiltShape>(chaleco, o, 'formaCanales'),
      scale: s,
    })
  },
}

// --- Cazadora ---

const cazadora: GarmentTemplate = {
  id: 'cazadora',
  family: 'top',
  name: 'Cazadora',
  description: 'Tipo trucker o vaquera: cuello camisero, canesú delantero, bolsillos de pecho con tapeta, botones y pretina.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillos', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.placket, label: 'Tapeta', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.hem, label: 'Pretina', defaultColor: '#3b5b86', materials: FABRIC },
    { id: T.buttons, label: 'Botones', defaultColor: '#b08d57', materials: TRIM },
  ],
  options: [
    topFit('boxy', ['regular', 'boxy', 'oversize']),
    choice('largo', 'Largo', 'corte', [['crop', 'Crop'], ['normal', 'Normal']], 'normal'),
    choice('cuello', 'Cuello', 'detalles', [['camisero', 'Camisero'], ['mao', 'Mao'], ['solapa', 'Solapa']], 'camisero'),
    toggle('canesu', 'Canesú delantero', 'detalles', true),
    choice('bolsillos', 'Bolsillos', 'detalles', [['pecho-tapeta', 'De pecho con tapeta'], ['solapa', 'Bajos con solapa'], ['ninguno', 'Sin bolsillos']], 'pecho-tapeta'),
    choice('bajo', 'Bajo', 'acabados', [['pretina', 'Pretina'], ['recto', 'Dobladillo']], 'pretina'),
    choice('punos', 'Puños', 'acabados', [['boton', 'Con botón'], ['sin', 'Sin puño']], 'boton'),
    toggle('canesuEspalda', 'Canesú en la espalda', 'acabados', true),
    // Las cazadoras vaqueras llevan pespunte doble
    { ...stitchOption, default: 'doble' },
  ],
  activePieces: (o) => [
    T.body,
    T.sleeves,
    T.collar,
    T.placket,
    T.buttons,
    ...(opt(cazadora, o, 'punos') !== 'sin' ? [T.cuffs] : []),
    ...(opt(cazadora, o, 'bolsillos') !== 'ninguno' ? [T.pocket] : []),
    ...(opt(cazadora, o, 'bajo') === 'pretina' ? [T.hem] : []),
  ],
  draw: (view, o, s) =>
    drawTop(view, {
      ...topBase(o, cazadora),
      sleeve: 'larga',
      neck: opt<Neck>(cazadora, o, 'cuello'),
      hem: opt(cazadora, o, 'bajo') === 'pretina' ? 'pretina' : 'recto',
      cuff: opt(cazadora, o, 'punos') === 'sin' ? 'recto' : 'camisero',
      placket: 'completa',
      pocket: opt(cazadora, o, 'bolsillos'),
      frontYoke: opt<boolean>(cazadora, o, 'canesu'),
      yoke: opt<boolean>(cazadora, o, 'canesuEspalda'),
      scale: s,
    }),
}

// --- Cortavientos ---

const cortavientos: GarmentTemplate = {
  id: 'cortavientos',
  family: 'top',
  name: 'Cortavientos',
  description: 'Nylon ligero con capucha o cuello alto, cremallera entera o media (anorak), bolsillo canguro o de ojal y ribetes elásticos.',
  printZones: TOP_ZONES,
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#5b6d8c', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#5b6d8c', materials: FABRIC },
    { id: T.hood, label: 'Capucha', defaultColor: '#5b6d8c', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#5b6d8c', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#5b6d8c', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#2b2b2b', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#2b2b2b', materials: FABRIC },
    { id: T.cords, label: 'Cordones', defaultColor: '#f4f1ea', materials: TRIM },
    { id: T.hardware, label: 'Cremallera', defaultColor: '#2b2b2b', materials: TRIM },
  ],
  options: [
    topFit('oversize', ['regular', 'boxy', 'oversize']),
    lengthOption,
    choice('cuello', 'Cuello', 'detalles', [['capucha', 'Capucha'], ['alto', 'Alto']], 'capucha'),
    neckFitOption('holgado'),
    choice('cremallera', 'Cremallera', 'detalles', [['completa', 'Entera'], ['media', 'Media (anorak)']], 'completa'),
    choice('bolsillo', 'Bolsillo', 'detalles', [['ojal', 'De ojal'], ['canguro', 'Canguro'], ['ninguno', 'Sin bolsillo']], 'ojal'),
    toggle('cordones', 'Cordones', 'detalles', true),
    choice('punos', 'Puños y bajo', 'acabados', [['recto', 'Ribete elástico'], ['canale', 'Canalé']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => {
    const hood = opt(cortavientos, o, 'cuello') === 'capucha'
    return [
      T.body,
      T.sleeves,
      hood ? T.hood : T.collar,
      ...(opt(cortavientos, o, 'bolsillo') !== 'ninguno' ? [T.pocket] : []),
      ...(opt(cortavientos, o, 'punos') === 'canale' ? [T.cuffs, T.hem] : []),
      ...(hood && opt<boolean>(cortavientos, o, 'cordones') ? [T.cords] : []),
      T.hardware,
    ]
  },
  draw: (view, o, s) => {
    const rib = opt(cortavientos, o, 'punos') === 'canale' ? 'canale' : 'recto'
    return drawTop(view, {
      ...topBase(o, cortavientos),
      ...neckExtrasCfg(cortavientos, o),
      sleeve: 'larga',
      neck: opt(cortavientos, o, 'cuello') === 'capucha' ? 'capucha' : 'alto',
      hem: rib,
      cuff: rib,
      zip: opt(cortavientos, o, 'cremallera'),
      pocket: opt(cortavientos, o, 'bolsillo'),
      cords: opt<boolean>(cortavientos, o, 'cordones'),
      ribScale: 0.6,
      scale: s,
    })
  },
}

// --- Top de mujer ---

const FT = FEMTOP_PIECES

const top: GarmentTemplate = {
  id: 'top',
  family: 'top',
  name: 'Top',
  description: 'De tirantes, palabra de honor, halter, cruzado o corsé; escote recto, en pico, redondo o corazón; crop o largo.',
  printZones: {
    front: [
      { id: 'pecho', label: 'Centro pecho', x: CX, y: 200, w: 50 },
      { id: 'bajo', label: 'Bajo', x: CX + 30, y: 240, w: 26 },
    ],
    back: [{ id: 'espalda', label: 'Espalda', x: CX, y: 210, w: 50 }],
    side: [],
  },
  pieces: [
    { id: FT.body, label: 'Cuerpo', defaultColor: '#1d1c1a', materials: FABRIC },
    { id: FT.straps, label: 'Tirantes', defaultColor: '#1d1c1a', materials: FABRIC },
    { id: FT.tie, label: 'Lazo', defaultColor: '#1d1c1a', materials: FABRIC },
    { id: FT.binding, label: 'Ballenas (canales)', defaultColor: '#1d1c1a', materials: FABRIC },
    { id: FT.cords, label: 'Cordones', defaultColor: '#1d1c1a', materials: TRIM },
    { id: FT.hardware, label: 'Cierre', defaultColor: '#b8b8b8', materials: TRIM },
  ],
  options: [
    choice('tipo', 'Tipo', 'corte', [['tirantes', 'De tirantes'], ['bandeau', 'Palabra de honor'], ['halter', 'Halter (al cuello)'], ['cruzado', 'Cruzado'], ['corse', 'Corsé / bustier']], 'tirantes'),
    choice('corte', 'Corte', 'corte', [['ajustado', 'Ajustado'], ['regular', 'Regular'], ['holgado', 'Holgado']], 'ajustado'),
    choice('largo', 'Largo', 'corte', [['crop', 'Crop'], ['cintura', 'A la cintura'], ['cadera', 'A la cadera']], 'crop'),
    choice('escote', 'Escote', 'detalles', [['recto', 'Recto'], ['pico', 'En pico'], ['redondo', 'Redondo'], ['corazon', 'Corazón']], 'recto'),
    choice('tirantes', 'Tirantes', 'detalles', [['finos', 'Finos'], ['anchos', 'Anchos']], 'finos'),
    toggle('fruncido', 'Fruncido', 'detalles', false),
    choice('cierre', 'Cierre (corsé)', 'detalles', [['cordones', 'Cordones a la espalda'], ['cremallera', 'Cremallera'], ['corchetes', 'Corchetes delante']], 'cordones'),
    toggle('ballenas', 'Ballenas (corsé)', 'acabados', true),
    stitchOption,
  ],
  activePieces: (o) => {
    const kind = opt(top, o, 'tipo')
    return [
      FT.body,
      ...(kind !== 'bandeau' && kind !== 'corse' ? [FT.straps] : []),
      ...(kind === 'halter' || kind === 'cruzado' ? [FT.tie] : []),
      ...(kind === 'corse' && opt<boolean>(top, o, 'ballenas') ? [FT.binding] : []),
      ...(kind === 'corse' && opt(top, o, 'cierre') === 'cordones' ? [FT.cords] : []),
      ...(kind === 'corse' && opt(top, o, 'cierre') !== 'cordones' ? [FT.hardware] : []),
      ...(kind === 'corse' && opt(top, o, 'cierre') === 'cordones' ? [FT.hardware] : []),
    ]
  },
  draw: (view, o, s) =>
    drawFemTop(view, {
      kind: opt(top, o, 'tipo'),
      fit: opt(top, o, 'corte'),
      length: opt(top, o, 'largo'),
      neckline: opt(top, o, 'escote'),
      straps: opt(top, o, 'tirantes'),
      gathers: opt<boolean>(top, o, 'fruncido'),
      closure: opt(top, o, 'cierre'),
      boning: opt<boolean>(top, o, 'ballenas'),
      stitch: opt(top, o, 'costuras'),
      scale: s,
    }),
}

// --- Gorro y gorra ---

const H = HEAD_PIECES

const gorro: GarmentTemplate = {
  id: 'gorro',
  family: 'head',
  unitsPerCm: HEAD_UNITS_PER_CM,
  name: 'Gorro',
  description: 'Gorro de punto (beanie): normal o corto de pescador, con o sin vuelta y pompón.',
  printZones: {
    front: [
      { id: 'vuelta', label: 'En la vuelta', x: CX, y: 270, w: 70 },
      { id: 'frente', label: 'Frente', x: CX, y: 200, w: 80 },
    ],
    back: [{ id: 'trasera', label: 'Trasera', x: CX, y: 220, w: 70 }],
    side: [{ id: 'lateral', label: 'Lateral', x: CX, y: 220, w: 50 }],
  },
  pieces: [
    { id: H.crown, label: 'Copa', defaultColor: '#2d3a4a', materials: FABRIC },
    { id: H.cuff, label: 'Vuelta', defaultColor: '#2d3a4a', materials: FABRIC },
    { id: H.pompom, label: 'Pompón', defaultColor: '#f2efe8', materials: TRIM },
  ],
  options: [
    choice('alto', 'Alto', 'corte', [['normal', 'Normal'], ['corto', 'Corto (pescador)']], 'normal'),
    toggle('vuelta', 'Vuelta', 'detalles', true),
    toggle('pompon', 'Pompón', 'detalles', false),
    choice('punto', 'Punto', 'acabados', [['canale', 'Canalé'], ['liso', 'Liso']], 'canale'),
  ],
  activePieces: (o) => [H.crown, ...(opt<boolean>(gorro, o, 'vuelta') ? [H.cuff] : []), ...(opt<boolean>(gorro, o, 'pompon') ? [H.pompom] : [])],
  draw: (view, o) =>
    drawBeanie(view, {
      height: opt(gorro, o, 'alto'),
      cuff: opt<boolean>(gorro, o, 'vuelta'),
      pompom: opt<boolean>(gorro, o, 'pompon'),
      knit: opt(gorro, o, 'punto'),
    }),
}

const gorra: GarmentTemplate = {
  id: 'gorra',
  family: 'head',
  unitsPerCm: HEAD_UNITS_PER_CM,
  name: 'Gorra',
  description: 'Gorra de 5 o 6 paneles, visera curva o plana, trasera de malla (trucker) y cierre snapback, hebilla o velcro.',
  printZones: {
    front: [{ id: 'frontal', label: 'Frontal', x: CX, y: 196, w: 80 }],
    back: [{ id: 'trasera', label: 'Trasera', x: CX, y: 190, w: 50 }],
    side: [{ id: 'lateral', label: 'Lateral', x: CX + 24, y: 200, w: 40 }],
  },
  pieces: [
    { id: H.crown, label: 'Copa', defaultColor: '#1f2a44', materials: FABRIC },
    { id: H.back, label: 'Trasera de malla', defaultColor: '#f2efe8', materials: FABRIC },
    { id: H.brim, label: 'Visera', defaultColor: '#1f2a44', materials: FABRIC },
    { id: H.button, label: 'Botón y hebilla', defaultColor: '#1f2a44', materials: TRIM },
    { id: H.closure, label: 'Cierre', defaultColor: '#2b2b2b', materials: TRIM },
    { id: H.eyelets, label: 'Ojetes', defaultColor: '#1f2a44', materials: TRIM },
  ],
  options: [
    choice('paneles', 'Paneles', 'corte', [['6', '6 paneles'], ['5', '5 paneles']], '6'),
    choice('visera', 'Visera', 'corte', [['curva', 'Curva'], ['plana', 'Plana']], 'curva'),
    toggle('malla', 'Trasera de malla (trucker)', 'detalles', false),
    choice('cierre', 'Cierre', 'detalles', [['snapback', 'Snapback'], ['hebilla', 'Hebilla'], ['velcro', 'Velcro'], ['cerrada', 'Cerrada (fitted)']], 'snapback'),
    stitchOption,
  ],
  activePieces: (o) => [
    H.crown,
    ...(opt<boolean>(gorra, o, 'malla') ? [H.back] : []),
    H.brim,
    H.button,
    ...(opt(gorra, o, 'cierre') !== 'cerrada' ? [H.closure] : []),
    H.eyelets,
  ],
  draw: (view, o) =>
    drawCap(view, {
      panels: Number(opt(gorra, o, 'paneles')) as CapCfg['panels'],
      brim: opt(gorra, o, 'visera'),
      closure: opt(gorra, o, 'cierre'),
      mesh: opt<boolean>(gorra, o, 'malla'),
      stitch: opt(gorra, o, 'costuras'),
    }),
}

withNeckExtras(sudadera, { tab: false })
withNeckExtras(bomber, { tab: false })
withNeckExtras(puffer, { tab: true })
withNeckExtras(chaleco, { tab: true })
withNeckExtras(cortavientos, { tab: true })

export const TEMPLATES: GarmentTemplate[] = [sudadera, camiseta, polo, camisa, bomber, puffer, chaleco, cazadora, cortavientos, top, pantalon, pantalonAncho, pantalonCorto, gorro, gorra]

/**
 * Lo que sale en «Nuevo diseño»: las prendas base y atajos que son una prenda base con otras opciones de partida
 * (p. ej. la camiseta de manga larga es la camiseta con la manga larga elegida).
 */
export interface CatalogEntry {
  id: string
  name: string
  description: string
  template: GarmentTemplate
  options?: Options
  /** Solo para este cuerpo (los tops y los shorts son de mujer); sin poner, para todos. */
  only?: 'hombre' | 'mujer'
}

const entry = (t: GarmentTemplate, extra?: Omit<CatalogEntry, 'template'>): CatalogEntry => ({ id: t.id, name: t.name, description: t.description, template: t, ...extra })

export const NEW_DESIGN_CATALOG: CatalogEntry[] = [
  entry(sudadera),
  entry(camiseta),
  entry(camiseta, { id: 'camiseta-ml', name: 'Camiseta de manga larga', description: 'La camiseta con manga larga.', options: { manga: 'larga' } }),
  entry(polo),
  entry(polo, { id: 'polo-ml', name: 'Polo de manga larga', description: 'El polo con manga larga y puño de canalé.', options: { manga: 'larga' } }),
  entry(camisa),
  entry(camisa, { id: 'camisa-mc', name: 'Camisa de manga corta', description: 'La camisa con manga corta.', options: { manga: 'corta' } }),
  entry(bomber),
  entry(puffer),
  entry(chaleco),
  entry(cazadora),
  entry(cortavientos),
  entry(pantalon),
  entry(pantalon, {
    id: 'chandal',
    name: 'Pantalón de chándal',
    description: 'Jogger de chándal con banda lateral, cordón y puño.',
    options: { banda: true, cargo: false, traseros: false },
  }),
  entry(top, { id: 'top', name: 'Top', description: top.description, only: 'mujer' }),
  entry(pantalonAncho),
  entry(pantalonCorto),
  entry(pantalonCorto, {
    id: 'shorts',
    name: 'Shorts',
    description: 'Shorts de mujer: mini, de tiro alto con trabillas y bajo vuelto.',
    options: { largo: 'mini', cintura: 'trabillas', bajo: 'vuelto', cargo: false, cordon: false, corte: 'regular' },
    only: 'mujer',
  }),
  entry(gorro),
  entry(gorra),
]

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id)
}

/** Opciones y piezas por defecto de una prenda base (punto de partida de un diseño nuevo). */
export function defaultDesign(t: GarmentTemplate, preset?: Options) {
  const options: Options = {}
  for (const o of t.options) options[o.id] = o.default
  Object.assign(options, preset)
  const pieces = Object.fromEntries(t.pieces.map((p) => [p.id, { color: p.defaultColor, materialId: null }]))
  return { options, pieces, notes: '' }
}
