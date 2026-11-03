import { drawPants, PANTS_PIECES, type PantsCfg } from './pants'
import { drawTop, TOP_PIECES, type TopCfg } from './top'
import { opt, type GarmentTemplate, type OptionDef, type Options, type PieceDef } from './types'

/** Catálogo de prendas base del Diseñador. Añadir una prenda = una entrada más en TEMPLATES. */

const T = TOP_PIECES
const FABRIC = ['tejido'] as PieceDef['materials']
const TRIM = ['fornitura'] as PieceDef['materials']

const stitchOption: OptionDef = {
  id: 'costuras',
  label: 'Pespuntes',
  group: 'acabados',
  type: 'choice',
  choices: [
    { id: 'simple', label: 'Simple' },
    { id: 'doble', label: 'Doble' },
  ],
  default: 'simple',
}

const lengthOption: OptionDef = {
  id: 'largo',
  label: 'Largo',
  group: 'corte',
  type: 'choice',
  choices: [
    { id: 'crop', label: 'Crop' },
    { id: 'normal', label: 'Normal' },
    { id: 'largo', label: 'Largo' },
  ],
  default: 'normal',
}

const sudadera: GarmentTemplate = {
  id: 'sudadera',
  name: 'Sudadera',
  description: 'Con o sin capucha, bolsillo canguro, cremallera, cordones y canalé.',
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
  ],
  options: [
    {
      id: 'corte',
      label: 'Corte',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'ajustado', label: 'Ajustado' },
        { id: 'regular', label: 'Regular' },
        { id: 'boxy', label: 'Boxy' },
        { id: 'oversize', label: 'Oversize' },
      ],
      default: 'oversize',
    },
    lengthOption,
    { id: 'capucha', label: 'Capucha', group: 'detalles', type: 'toggle', default: true },
    { id: 'cordones', label: 'Cordones', group: 'detalles', type: 'toggle', default: true },
    {
      id: 'bolsillo',
      label: 'Bolsillo',
      group: 'detalles',
      type: 'choice',
      choices: [
        { id: 'canguro', label: 'Canguro' },
        { id: 'ninguno', label: 'Sin bolsillo' },
      ],
      default: 'canguro',
    },
    {
      id: 'cremallera',
      label: 'Cremallera',
      group: 'detalles',
      type: 'choice',
      choices: [
        { id: 'ninguna', label: 'Sin cremallera' },
        { id: 'media', label: 'Media' },
        { id: 'completa', label: 'Completa' },
      ],
      default: 'ninguna',
    },
    {
      id: 'punos',
      label: 'Puños y bajo',
      group: 'acabados',
      type: 'choice',
      choices: [
        { id: 'canale', label: 'Canalé' },
        { id: 'recto', label: 'Dobladillo' },
      ],
      default: 'canale',
    },
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
    ]
  },
  draw: (view, o) => {
    const rib = opt(sudadera, o, 'punos') === 'canale' ? 'canale' : 'recto'
    const cfg: TopCfg = {
      fit: opt(sudadera, o, 'corte'),
      length: opt(sudadera, o, 'largo'),
      sleeve: 'larga',
      neck: opt<boolean>(sudadera, o, 'capucha') ? 'capucha' : 'redondo',
      hem: rib,
      cuff: rib,
      zip: opt(sudadera, o, 'cremallera'),
      pocket: opt(sudadera, o, 'bolsillo'),
      cords: opt<boolean>(sudadera, o, 'cordones'),
      sleevePocket: false,
      stitch: opt(sudadera, o, 'costuras'),
    }
    return drawTop(view, cfg)
  },
}

const camiseta: GarmentTemplate = {
  id: 'camiseta',
  name: 'Camiseta',
  description: 'Cuello redondo o de pico, manga corta o larga, cortes regular, boxy u oversize.',
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#f2efe8', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillo', defaultColor: '#f2efe8', materials: FABRIC },
  ],
  options: [
    {
      id: 'corte',
      label: 'Corte',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'ajustado', label: 'Ajustado' },
        { id: 'regular', label: 'Regular' },
        { id: 'boxy', label: 'Boxy' },
        { id: 'oversize', label: 'Oversize' },
      ],
      default: 'boxy',
    },
    lengthOption,
    {
      id: 'manga',
      label: 'Manga',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'corta', label: 'Corta' },
        { id: 'larga', label: 'Larga' },
      ],
      default: 'corta',
    },
    {
      id: 'cuello',
      label: 'Cuello',
      group: 'detalles',
      type: 'choice',
      choices: [
        { id: 'redondo', label: 'Redondo' },
        { id: 'pico', label: 'Pico' },
      ],
      default: 'redondo',
    },
    { id: 'bolsillo', label: 'Bolsillo de pecho', group: 'detalles', type: 'toggle', default: false },
    stitchOption,
  ],
  activePieces: (o) => [T.body, T.sleeves, T.collar, ...(opt<boolean>(camiseta, o, 'bolsillo') ? [T.pocket] : [])],
  draw: (view, o) =>
    drawTop(view, {
      fit: opt(camiseta, o, 'corte'),
      length: opt(camiseta, o, 'largo'),
      sleeve: opt(camiseta, o, 'manga'),
      neck: opt(camiseta, o, 'cuello'),
      hem: 'recto',
      cuff: 'recto',
      zip: 'ninguna',
      pocket: opt<boolean>(camiseta, o, 'bolsillo') ? 'pecho' : 'ninguno',
      cords: false,
      sleevePocket: false,
      stitch: opt(camiseta, o, 'costuras'),
    }),
}

const pantalon: GarmentTemplate = {
  id: 'pantalon',
  name: 'Pantalón jogger / cargo',
  description: 'Cintura elástica con cordón, bolsillos laterales, cargo y traseros, bajo con puño o recto.',
  pieces: [
    { id: PANTS_PIECES.legs, label: 'Perneras', defaultColor: '#4b4f45', materials: FABRIC },
    { id: PANTS_PIECES.waistband, label: 'Cinturilla', defaultColor: '#4b4f45', materials: FABRIC },
    { id: PANTS_PIECES.pockets, label: 'Bolsillos', defaultColor: '#4b4f45', materials: FABRIC },
    { id: PANTS_PIECES.cuffs, label: 'Puños', defaultColor: '#43473d', materials: FABRIC },
    { id: PANTS_PIECES.cord, label: 'Cordón', defaultColor: '#f4f1ea', materials: TRIM },
  ],
  options: [
    {
      id: 'corte',
      label: 'Corte',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'slim', label: 'Slim' },
        { id: 'regular', label: 'Regular' },
        { id: 'ancho', label: 'Ancho' },
        { id: 'baggy', label: 'Baggy' },
      ],
      default: 'regular',
    },
    {
      id: 'largo',
      label: 'Largo',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'tobillero', label: 'Tobillero' },
        { id: 'largo', label: 'Largo' },
      ],
      default: 'largo',
    },
    {
      id: 'bajo',
      label: 'Bajo',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'puno', label: 'Con puño (jogger)' },
        { id: 'recto', label: 'Recto' },
      ],
      default: 'puno',
    },
    { id: 'laterales', label: 'Bolsillos laterales', group: 'detalles', type: 'toggle', default: true },
    { id: 'cargo', label: 'Bolsillos cargo', group: 'detalles', type: 'toggle', default: true },
    { id: 'traseros', label: 'Bolsillos traseros', group: 'detalles', type: 'toggle', default: true },
    { id: 'cordon', label: 'Cordón', group: 'detalles', type: 'toggle', default: true },
    stitchOption,
  ],
  activePieces: (o) => {
    const p = PANTS_PIECES
    return [
      p.legs,
      p.waistband,
      ...(opt<boolean>(pantalon, o, 'cargo') || opt<boolean>(pantalon, o, 'traseros') ? [p.pockets] : []),
      ...(opt(pantalon, o, 'bajo') === 'puno' ? [p.cuffs] : []),
      ...(opt<boolean>(pantalon, o, 'cordon') ? [p.cord] : []),
    ]
  },
  draw: (view, o) => {
    const cfg: PantsCfg = {
      fit: opt(pantalon, o, 'corte'),
      length: opt(pantalon, o, 'largo'),
      hem: opt(pantalon, o, 'bajo'),
      sidePockets: opt(pantalon, o, 'laterales'),
      cargo: opt(pantalon, o, 'cargo'),
      backPockets: opt(pantalon, o, 'traseros'),
      cord: opt(pantalon, o, 'cordon'),
      stitch: opt(pantalon, o, 'costuras'),
    }
    return drawPants(view, cfg)
  },
}

const bomber: GarmentTemplate = {
  id: 'bomber',
  name: 'Chaqueta bomber',
  description: 'Cremallera completa, cuello, puños y bajo de canalé, bolsillos de ojal o con solapa.',
  pieces: [
    { id: T.body, label: 'Cuerpo', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.sleeves, label: 'Mangas', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.collar, label: 'Cuello', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.cuffs, label: 'Puños', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.hem, label: 'Bajo', defaultColor: '#1f2420', materials: FABRIC },
    { id: T.pocket, label: 'Bolsillos', defaultColor: '#3c4a3a', materials: FABRIC },
    { id: T.hardware, label: 'Cremallera y fornituras', defaultColor: '#b8b8b8', materials: TRIM },
  ],
  options: [
    {
      id: 'corte',
      label: 'Corte',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'regular', label: 'Regular' },
        { id: 'boxy', label: 'Boxy' },
        { id: 'oversize', label: 'Oversize' },
      ],
      default: 'boxy',
    },
    {
      id: 'largo',
      label: 'Largo',
      group: 'corte',
      type: 'choice',
      choices: [
        { id: 'crop', label: 'Crop' },
        { id: 'normal', label: 'Normal' },
      ],
      default: 'normal',
    },
    {
      id: 'bolsillos',
      label: 'Bolsillos',
      group: 'detalles',
      type: 'choice',
      choices: [
        { id: 'ojal', label: 'De ojal' },
        { id: 'solapa', label: 'Con solapa' },
        { id: 'ninguno', label: 'Sin bolsillos' },
      ],
      default: 'ojal',
    },
    { id: 'bolsilloManga', label: 'Bolsillo en la manga', group: 'detalles', type: 'toggle', default: true },
    stitchOption,
  ],
  activePieces: (o) => [
    T.body,
    T.sleeves,
    T.collar,
    T.cuffs,
    T.hem,
    ...(opt(bomber, o, 'bolsillos') !== 'ninguno' || opt<boolean>(bomber, o, 'bolsilloManga') ? [T.pocket] : []),
    T.hardware,
  ],
  draw: (view, o) =>
    drawTop(view, {
      fit: opt(bomber, o, 'corte'),
      length: opt(bomber, o, 'largo'),
      sleeve: 'larga',
      neck: 'bomber',
      hem: 'canale',
      cuff: 'canale',
      zip: 'completa',
      pocket: opt(bomber, o, 'bolsillos'),
      cords: false,
      sleevePocket: opt(bomber, o, 'bolsilloManga'),
      stitch: opt(bomber, o, 'costuras'),
      ribScale: 1.35,
    }),
}

export const TEMPLATES: GarmentTemplate[] = [sudadera, camiseta, pantalon, bomber]

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
