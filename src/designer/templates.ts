import { drawPants, PANTS_PIECES, type PantsCfg } from './pants'
import { CX } from './geometry'
import { drawTop, TOP_PIECES, type Neck, type TopCfg } from './top'
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

const stitchOption = choice('costuras', 'Pespuntes', 'acabados', [['simple', 'Simple'], ['doble', 'Doble']], 'simple')
const lengthOption = choice('largo', 'Largo', 'corte', [['crop', 'Crop'], ['normal', 'Normal'], ['largo', 'Largo']], 'normal')
const topFit = (def: string, ids = ['ajustado', 'regular', 'boxy', 'oversize']) =>
  choice('corte', 'Corte', 'corte', ids.map((i) => [i, { ajustado: 'Ajustado', regular: 'Regular', boxy: 'Boxy', oversize: 'Oversize' }[i]!]), def)
const pantsFit = (def: string, ids = ['slim', 'regular', 'ancho', 'baggy']) =>
  choice('corte', 'Corte', 'corte', ids.map((i) => [i, { slim: 'Slim', regular: 'Regular', ancho: 'Ancho', baggy: 'Baggy' }[i]!]), def)
const sleeveOption = (def: string) => choice('manga', 'Manga', 'corte', [['corta', 'Corta'], ['larga', 'Larga']], def)

/** Configuración común de las prendas de torso (lo que cada prenda no cambia). */
const topBase = (o: Options, t: GarmentTemplate): Pick<TopCfg, 'fit' | 'length' | 'stitch' | 'cords' | 'sleevePocket' | 'zip' | 'pocket'> => ({
  fit: opt(t, o, 'corte'),
  length: opt(t, o, 'largo') ?? 'normal',
  stitch: opt(t, o, 'costuras'),
  cords: false,
  sleevePocket: false,
  zip: 'ninguna',
  pocket: 'ninguno',
})

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
    topFit('boxy'),
    lengthOption,
    sleeveOption('corta'),
    choice('cuello', 'Cuello', 'detalles', [['redondo', 'Redondo'], ['pico', 'Pico'], ['alto', 'Cisne'], ['henley', 'Henley']], 'redondo'),
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
    choice('canales', 'Canales', 'detalles', [['estrechos', 'Estrechos'], ['anchos', 'Anchos']], 'anchos'),
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
      sleeve: 'larga',
      neck: opt(puffer, o, 'cuello') === 'capucha' ? 'capucha' : 'alto',
      hem: rib,
      cuff: rib,
      zip: 'completa',
      pocket: opt(puffer, o, 'bolsillos') === 'ojal' ? 'ojal' : 'ninguno',
      quilt: opt(puffer, o, 'canales') === 'estrechos' ? 22 : 34,
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
    pantsFit('regular'),
    choice('largo', 'Largo', 'corte', [['corto', 'Corto'], ['bermuda', 'Bermuda']], 'corto'),
    choice('cintura', 'Cintura', 'detalles', [['elastica', 'Elástica'], ['trabillas', 'Con trabillas y botón']], 'elastica'),
    toggle('laterales', 'Bolsillos laterales', 'detalles', true),
    toggle('cargo', 'Bolsillos cargo', 'detalles', false),
    toggle('traseros', 'Bolsillos traseros', 'detalles', true),
    toggle('cordon', 'Cordón', 'detalles', true),
    choice('bajo', 'Bajo', 'acabados', [['recto', 'Recto'], ['vuelto', 'Vuelto'], ['puno', 'Con puño']], 'recto'),
    stitchOption,
  ],
  activePieces: (o) => pantsActive(pantalonCorto, o, opt(pantalonCorto, o, 'cintura')),
  draw: (view, o, s) => drawPants(view, pantsCfg(pantalonCorto, o, opt(pantalonCorto, o, 'cintura'), s)),
}

export const TEMPLATES: GarmentTemplate[] = [sudadera, camiseta, polo, camisa, bomber, puffer, pantalon, pantalonAncho, pantalonCorto]

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id)
}

/** Opciones y piezas por defecto de una prenda base (punto de partida de un diseño nuevo). */
export function defaultDesign(t: GarmentTemplate) {
  const options: Options = {}
  for (const o of t.options) options[o.id] = o.default
  const pieces = Object.fromEntries(t.pieces.map((p) => [p.id, { color: p.defaultColor, materialId: null }]))
  return { options, pieces, notes: '' }
}
