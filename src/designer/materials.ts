import type { FabricLook } from '../data/fabrics'
import type { Material } from '../shared/library'
import type { PieceDef } from './types'

/**
 * Catálogo de materiales del Diseñador: tejidos y fornituras habituales en confección, listos para usar
 * sin tener que crearlos antes en la Biblioteca. Cada uno sabe cómo se ve:
 * - `weave`: dibujo de su textura en el plano 2D y en la muestra (ver swatches.tsx)
 * - `gloss`: brillo en 2D (0 = mate, 1 = muy brillante)
 * - `look`: cómo se ve y cae en 3D
 * Sus ids empiezan por «cat:» para no confundirlos con los materiales de la Biblioteca (que son UUID).
 */

export type Weave =
  | 'liso'
  | 'punto'
  | 'felpa'
  | 'canale'
  | 'pique'
  | 'gofre'
  | 'malla'
  | 'sarga'
  | 'denim'
  | 'lino'
  | 'oxford'
  | 'pana'
  | 'terciopelo'
  | 'saten'
  | 'tweed'
  | 'franela'
  | 'ripstop'
  | 'acolchado'
  | 'piel'
  | 'ante'
  | 'borrego'
  | 'boucle'
  | 'trenzado'
  | 'metal'
  | 'espiral'

export interface CatalogMaterial {
  id: string
  name: string
  category: 'tejido' | 'fornitura'
  group: string
  composition: string
  /** Gramaje o grosor orientativo. */
  weight: string
  /** Para qué se suele usar. */
  uses: string
  weave: Weave
  gloss: number
  look: FabricLook
  /** Color propio del material (metales): al elegirlo, la pieza toma este color. */
  tint?: string
}

type L = FabricLook
const look = (roughness: number, sheen: number, knit: L['knit'], knitDepth: number, stiffness: number, extra: Partial<L> = {}): L => ({
  roughness,
  sheen,
  sheenRoughness: Math.max(0.3, roughness),
  clearcoat: 0,
  knit,
  knitDepth,
  stiffness,
  ...extra,
})

const T = (
  id: string,
  group: string,
  name: string,
  composition: string,
  weight: string,
  uses: string,
  weave: Weave,
  gloss: number,
  l: L,
): CatalogMaterial => ({ id: `cat:${id}`, name, category: 'tejido', group, composition, weight, uses, weave, gloss, look: l })

const F = (id: string, group: string, name: string, composition: string, uses: string, weave: Weave, gloss: number, l: L, tint?: string): CatalogMaterial => ({
  id: `cat:${id}`,
  name,
  category: 'fornitura',
  group,
  composition,
  weight: '',
  uses,
  weave,
  gloss,
  look: l,
  tint,
})

export const CATALOG: CatalogMaterial[] = [
  // --- Punto ---
  T('jersey', 'Punto', 'Punto jersey de algodón', '100% algodón', '160–200 g/m²', 'Camisetas, básicos', 'punto', 0.05, look(0.9, 0.3, 'punto', 0.4, 0.8)),
  T('jersey-organico', 'Punto', 'Jersey de algodón orgánico', '100% algodón orgánico', '180 g/m²', 'Camisetas sostenibles', 'punto', 0.05, look(0.92, 0.3, 'punto', 0.45, 0.85)),
  T('jersey-pesado', 'Punto', 'Jersey pesado (heavyweight)', '100% algodón peinado', '240–280 g/m²', 'Camisetas boxy y oversize', 'punto', 0.04, look(0.93, 0.3, 'punto', 0.5, 1.2)),
  T('interlock', 'Punto', 'Interlock', '100% algodón', '200 g/m²', 'Infantil, polos, camisetas', 'liso', 0.06, look(0.88, 0.35, 'punto', 0.2, 0.9)),
  T('pique', 'Punto', 'Piqué', '100% algodón', '220 g/m²', 'Polos', 'pique', 0.04, look(0.95, 0.25, 'gofre', 0.5, 1)),
  T('felpa-perchada', 'Punto', 'Felpa perchada (fleece)', '80% algodón · 20% poliéster', '300–350 g/m²', 'Sudaderas y joggers', 'felpa', 0.03, look(0.95, 0.6, 'punto', 0.5, 1.6)),
  T('french-terry', 'Punto', 'Felpa french terry', '100% algodón', '280–400 g/m²', 'Sudaderas, pantalones de chándal', 'felpa', 0.03, look(0.95, 0.5, 'punto', 0.55, 1.5)),
  T('felpa-pesada', 'Punto', 'Felpa pesada (heavy fleece)', '100% algodón', '450–500 g/m²', 'Sudaderas premium', 'felpa', 0.02, look(0.97, 0.6, 'punto', 0.6, 2)),
  T('canale-1x1', 'Punto', 'Canalé 1x1', '95% algodón · 5% elastano', '220 g/m²', 'Puños, bajos, cuellos, tops', 'canale', 0.04, look(0.9, 0.35, 'canale', 0.9, 1.3)),
  T('canale-2x2', 'Punto', 'Canalé 2x2', '97% algodón · 3% elastano', '300 g/m²', 'Puños y bajos de sudadera', 'canale', 0.04, look(0.9, 0.35, 'canale', 1, 1.5)),
  T('gofre', 'Punto', 'Punto gofre (waffle)', '100% algodón', '250 g/m²', 'Henleys, manga larga', 'gofre', 0.03, look(0.95, 0.3, 'gofre', 0.9, 1.1)),
  T('polar', 'Punto', 'Forro polar', '100% poliéster', '280 g/m²', 'Chaquetas y forros', 'borrego', 0.02, look(1, 0.8, 'rizo', 0.35, 1.3)),
  T('malla', 'Punto', 'Malla deportiva (mesh)', '100% poliéster', '140 g/m²', 'Camisetas de fútbol, forros', 'malla', 0.12, look(0.7, 0.3, 'rejilla', 0.9, 0.7)),
  T('licra', 'Punto', 'Licra (punto elástico)', '80% poliamida · 20% elastano', '190 g/m²', 'Ropa deportiva, mallas', 'liso', 0.45, look(0.45, 0.6, 'liso', 0, 0.5)),
  T('scuba', 'Punto', 'Neopreno / scuba', '95% poliéster · 5% elastano', '320 g/m²', 'Sudaderas estructuradas, faldas', 'liso', 0.15, look(0.7, 0.3, 'liso', 0, 2.4)),

  // --- Tejido plano ---
  T('popelin', 'Tejido plano', 'Popelín', '100% algodón', '110–120 g/m²', 'Camisas', 'liso', 0.12, look(0.75, 0.25, 'liso', 0, 0.8)),
  T('oxford', 'Tejido plano', 'Oxford', '100% algodón', '140 g/m²', 'Camisas, overshirts', 'oxford', 0.06, look(0.9, 0.2, 'gofre', 0.25, 1)),
  T('lino', 'Tejido plano', 'Lino', '100% lino', '180 g/m²', 'Camisas y pantalones de verano', 'lino', 0.04, look(1, 0.2, 'liso', 0, 1.2)),
  T('chino', 'Tejido plano', 'Sarga / chino (twill)', '98% algodón · 2% elastano', '260 g/m²', 'Pantalones chino, chaquetas', 'sarga', 0.06, look(0.88, 0.15, 'sarga', 0.45, 1.8)),
  T('gabardina', 'Tejido plano', 'Gabardina', '100% algodón', '240 g/m²', 'Trench, chaquetas, pantalones', 'sarga', 0.1, look(0.8, 0.15, 'sarga', 0.3, 1.9)),
  T('denim-rigido', 'Tejido plano', 'Denim rígido 14 oz', '100% algodón', '475 g/m²', 'Vaqueros, chaquetas', 'denim', 0.03, look(1, 0.1, 'sarga', 0.6, 2.2)),
  T('denim-stretch', 'Tejido plano', 'Denim elástico 10 oz', '98% algodón · 2% elastano', '340 g/m²', 'Vaqueros ajustados', 'denim', 0.04, look(1, 0.1, 'sarga', 0.55, 1.6)),
  T('chambray', 'Tejido plano', 'Chambray', '100% algodón', '150 g/m²', 'Camisas', 'oxford', 0.05, look(0.9, 0.15, 'liso', 0, 0.9)),
  T('lona', 'Tejido plano', 'Lona (canvas)', '100% algodón', '340–400 g/m²', 'Chaquetas de trabajo, bolsas', 'oxford', 0.03, look(1, 0.1, 'gofre', 0.35, 2.6)),
  T('pana', 'Tejido plano', 'Pana (corduroy)', '100% algodón', '300 g/m²', 'Pantalones, overshirts', 'pana', 0.15, look(0.85, 0.7, 'pana', 1, 1.8)),
  T('franela', 'Tejido plano', 'Franela', '100% algodón cardado', '200 g/m²', 'Camisas de cuadros, pijamas', 'franela', 0.02, look(1, 0.6, 'liso', 0, 1)),
  T('viscosa', 'Tejido plano', 'Viscosa', '100% viscosa', '120 g/m²', 'Camisas fluidas, vestidos', 'liso', 0.25, look(0.55, 0.5, 'liso', 0, 0.4)),
  T('tencel', 'Tejido plano', 'Tencel (lyocell)', '100% lyocell', '150 g/m²', 'Camisas, pantalones fluidos', 'liso', 0.22, look(0.6, 0.45, 'liso', 0, 0.5)),
  T('seda', 'Tejido plano', 'Seda', '100% seda', '60–90 g/m²', 'Camisas, vestidos, pañuelos', 'saten', 0.6, look(0.35, 1, 'liso', 0, 0.3, { sheenRoughness: 0.3 })),
  T('saten', 'Tejido plano', 'Satén', '100% poliéster', '120 g/m²', 'Forros, chaquetas bomber, vestidos', 'saten', 0.7, look(0.3, 1, 'liso', 0, 0.45, { sheenRoughness: 0.3 })),
  T('gasa', 'Tejido plano', 'Gasa / chiffon', '100% poliéster', '50 g/m²', 'Blusas y vestidos vaporosos', 'liso', 0.2, look(0.6, 0.6, 'liso', 0, 0.2)),
  T('terciopelo', 'Tejido plano', 'Terciopelo', '90% poliéster · 10% elastano', '280 g/m²', 'Chándales, vestidos de fiesta', 'terciopelo', 0.35, look(0.75, 1, 'liso', 0, 1.2, { sheenRoughness: 0.5 })),

  // --- Lana ---
  T('punto-lana', 'Lana', 'Punto de lana', '100% lana', '350 g/m²', 'Jerséis y cárdigans', 'punto', 0.02, look(1, 0.7, 'punto', 0.9, 1.4)),
  T('merino', 'Lana', 'Lana merino (punto fino)', '100% lana merino', '200 g/m²', 'Jerséis finos, básicos térmicos', 'punto', 0.04, look(0.95, 0.6, 'punto', 0.5, 0.9)),
  T('cachemira', 'Lana', 'Cachemira', '100% cachemira', '250 g/m²', 'Jerséis y bufandas premium', 'franela', 0.03, look(1, 0.9, 'punto', 0.3, 0.9)),
  T('pano-lana', 'Lana', 'Paño de lana', '80% lana · 20% poliamida', '500 g/m²', 'Abrigos, chaquetas varsity', 'franela', 0.02, look(1, 0.6, 'liso', 0, 2.8)),
  T('tweed', 'Lana', 'Tweed', '100% lana', '420 g/m²', 'Americanas, abrigos, gorras', 'tweed', 0.02, look(1, 0.5, 'sarga', 0.5, 2.4)),
  T('boucle', 'Lana', 'Bouclé', '60% lana · 40% poliéster', '400 g/m²', 'Chaquetas, abrigos', 'boucle', 0.02, look(1, 0.6, 'rizo', 0.8, 2)),

  // --- Técnicos ---
  T('ripstop', 'Técnicos', 'Nylon ripstop', '100% poliamida', '70 g/m²', 'Cortavientos, cargos técnicos', 'ripstop', 0.3, look(0.55, 0.2, 'rejilla', 0.15, 0.9, { clearcoat: 0.2 })),
  T('poliester-tecnico', 'Técnicos', 'Poliéster técnico (dry-fit)', '100% poliéster', '140 g/m²', 'Camisetas de deporte', 'malla', 0.18, look(0.65, 0.35, 'rejilla', 0.25, 0.6)),
  T('softshell', 'Técnicos', 'Softshell', '94% poliéster · 6% elastano, membrana', '300 g/m²', 'Chaquetas de exterior', 'liso', 0.15, look(0.7, 0.3, 'liso', 0, 2.2)),
  T('impermeable', 'Técnicos', 'Nylon impermeable (recubierto)', '100% poliamida con PU', '120 g/m²', 'Chubasqueros, anoraks', 'liso', 0.55, look(0.35, 0.2, 'liso', 0, 1.6, { clearcoat: 0.6 })),
  T('nylon-bomber', 'Técnicos', 'Nylon de bomber (MA-1)', '100% poliamida', '160 g/m²', 'Chaquetas bomber', 'saten', 0.45, look(0.4, 0.5, 'liso', 0, 1.4, { clearcoat: 0.3 })),
  T('acolchado', 'Técnicos', 'Acolchado (puffer)', 'Nylon con relleno de poliéster', '—', 'Plumíferos y chalecos', 'acolchado', 0.4, look(0.45, 0.3, 'acolchado', 1, 2.6, { clearcoat: 0.3 })),

  // --- Pieles y pelo ---
  T('cuero', 'Pieles y pelo', 'Piel de vacuno (cuero)', '100% piel bovina', '1,1–1,3 mm', 'Chaquetas, detalles', 'piel', 0.35, look(0.45, 0, 'grano', 0.35, 3, { clearcoat: 0.4 })),
  T('napa', 'Pieles y pelo', 'Napa de cordero', '100% piel ovina', '0,7 mm', 'Chaquetas finas, pantalones', 'piel', 0.4, look(0.4, 0.1, 'grano', 0.2, 1.8, { clearcoat: 0.45 })),
  T('ante', 'Pieles y pelo', 'Ante (serraje)', '100% piel', '1 mm', 'Chaquetas, overshirts', 'ante', 0.02, look(1, 0.8, 'liso', 0, 2.2)),
  T('polipiel', 'Pieles y pelo', 'Polipiel (cuero sintético)', 'PU sobre base textil', '0,9 mm', 'Chaquetas, pantalones', 'piel', 0.45, look(0.38, 0, 'grano', 0.25, 2.2, { clearcoat: 0.5 })),
  T('charol', 'Pieles y pelo', 'Charol', 'PU brillante', '0,8 mm', 'Detalles, prendas de fiesta', 'liso', 0.9, look(0.12, 0, 'liso', 0, 2.4, { clearcoat: 1 })),
  T('borrego', 'Pieles y pelo', 'Borrego / sherpa', '100% poliéster', '400 g/m²', 'Chaquetas, cuellos, forros', 'borrego', 0.02, look(1, 0.9, 'rizo', 1, 1.6)),
  T('pelo-sintetico', 'Pieles y pelo', 'Pelo sintético', '100% acrílico', '600 g/m²', 'Abrigos, cuellos', 'borrego', 0.08, look(1, 1, 'rizo', 1, 1.4)),

  // --- Fornituras ---
  F('cordon-algodon', 'Cordones', 'Cordón de algodón trenzado', '100% algodón', 'Capuchas, cinturas', 'trenzado', 0.03, look(0.95, 0.4, 'sarga', 0.9, 1)),
  F('cordon-poliester', 'Cordones', 'Cordón plano de poliéster', '100% poliéster', 'Capuchas, cinturas', 'trenzado', 0.2, look(0.6, 0.4, 'sarga', 0.6, 1)),
  F('cordon-reflectante', 'Cordones', 'Cordón reflectante', 'Poliéster con hilo reflectante', 'Prendas técnicas', 'trenzado', 0.6, look(0.3, 0.2, 'sarga', 0.5, 1, { clearcoat: 0.6 })),
  F('metal-laton', 'Cremalleras y metales', 'Metal latón (dorado)', 'Latón', 'Cremalleras, remaches, ojales', 'metal', 0.8, look(0.4, 0, 'liso', 0, 1, { metalness: 0.65, clearcoat: 0.3 }), '#b08d57'),
  F('metal-niquel', 'Cremalleras y metales', 'Metal níquel (plateado)', 'Níquel', 'Cremalleras, remaches, ojales', 'metal', 0.85, look(0.38, 0, 'liso', 0, 1, { metalness: 0.6, clearcoat: 0.3 }), '#c9c9c9'),
  F('metal-pavonado', 'Cremalleras y metales', 'Metal pavonado (negro)', 'Latón pavonado', 'Cremalleras y fornituras discretas', 'metal', 0.5, look(0.45, 0, 'liso', 0, 1, { metalness: 0.5, clearcoat: 0.2 }), '#2b2b2b'),
  F('metal-cobre', 'Cremalleras y metales', 'Metal cobre envejecido', 'Cobre', 'Vaqueros, workwear', 'metal', 0.6, look(0.45, 0, 'liso', 0, 1, { metalness: 0.6, clearcoat: 0.2 }), '#8a5a3c'),
  F('cremallera-vislon', 'Cremalleras y metales', 'Cremallera de plástico (Vislon)', 'Poliacetal', 'Chaquetas, sudaderas', 'espiral', 0.35, look(0.4, 0, 'liso', 0, 1, { clearcoat: 0.4 })),
  F('cremallera-nylon', 'Cremalleras y metales', 'Cremallera de nylon (espiral)', 'Poliamida', 'Sudaderas, bolsillos', 'espiral', 0.2, look(0.5, 0, 'liso', 0, 1)),
  F('cremallera-invisible', 'Cremalleras y metales', 'Cremallera invisible', 'Poliéster', 'Vestidos, faldas', 'liso', 0.15, look(0.6, 0, 'liso', 0, 1)),
  F('boton-resina', 'Botones', 'Botón de resina', 'Poliéster', 'Camisas, polos', 'liso', 0.45, look(0.35, 0, 'liso', 0, 1, { clearcoat: 0.5 })),
  F('boton-nacar', 'Botones', 'Botón de nácar', 'Nácar natural', 'Camisas de vestir', 'liso', 0.7, look(0.25, 0.2, 'liso', 0, 1, { clearcoat: 0.8 }), '#ece6dc'),
  F('boton-corozo', 'Botones', 'Botón de corozo', 'Corozo (tagua)', 'Chaquetas, abrigos', 'liso', 0.25, look(0.5, 0, 'liso', 0, 1, { clearcoat: 0.3 })),
  F('boton-metal', 'Botones', 'Botón metálico (vaquero)', 'Latón', 'Vaqueros, pantalones, workwear', 'metal', 0.8, look(0.4, 0, 'liso', 0, 1, { metalness: 0.65, clearcoat: 0.3 }), '#9a8a6a'),
  F('automatico', 'Botones', 'Botón automático (corchete)', 'Latón niquelado', 'Chaquetas, bombers', 'metal', 0.8, look(0.38, 0, 'liso', 0, 1, { metalness: 0.6, clearcoat: 0.3 }), '#c9c9c9'),
]

const BY_ID = new Map(CATALOG.map((m) => [m.id, m]))
export const getCatalogMaterial = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined)
export const isCatalogId = (id: string | null | undefined) => !!id && id.startsWith('cat:')

/** Materiales del catálogo que tienen sentido para una pieza (tela o fornitura). */
export const catalogFor = (piece: Pick<PieceDef, 'materials'>) => CATALOG.filter((m) => piece.materials.includes(m.category))

/** Grupos del catálogo, en orden, con sus materiales. */
export function groupCatalog(items: CatalogMaterial[]) {
  const groups = new Map<string, CatalogMaterial[]>()
  for (const m of items) groups.set(m.group, [...(groups.get(m.group) ?? []), m])
  return [...groups]
}

/** Material con el que se ve cada pieza si aún no se ha elegido ninguno (según la prenda base). */
const DEFAULTS: Record<string, Record<string, string>> = {
  sudadera: { balaclava: 'cat:canale-1x1', '*': 'cat:felpa-perchada', punos: 'cat:canale-2x2', bajo: 'cat:canale-2x2', cuello: 'cat:canale-2x2', cordones: 'cat:cordon-algodon', fornituras: 'cat:metal-niquel', botones: 'cat:boton-resina' },
  camiseta: { '*': 'cat:jersey', cuello: 'cat:canale-1x1', botones: 'cat:boton-resina' },
  pantalon: { '*': 'cat:french-terry', punos: 'cat:canale-2x2', cinturilla: 'cat:canale-2x2', cordon: 'cat:cordon-algodon' },
  bomber: { balaclava: 'cat:canale-1x1', '*': 'cat:nylon-bomber', cuello: 'cat:canale-2x2', punos: 'cat:canale-2x2', bajo: 'cat:canale-2x2', fornituras: 'cat:metal-niquel', botones: 'cat:automatico' },
  polo: { '*': 'cat:pique', cuello: 'cat:canale-1x1', punos: 'cat:canale-1x1', botones: 'cat:boton-resina' },
  camisa: { '*': 'cat:popelin', botones: 'cat:boton-resina' },
  puffer: { balaclava: 'cat:canale-1x1', '*': 'cat:ripstop', punos: 'cat:licra', bajo: 'cat:licra', fornituras: 'cat:cremallera-vislon' },
  'pantalon-ancho': { '*': 'cat:chino', cordon: 'cat:cordon-algodon', botones: 'cat:boton-corozo' },
  top: { '*': 'cat:jersey', lazo: 'cat:saten', ribete: 'cat:popelin', cordones: 'cat:saten', fornituras: 'cat:metal-niquel' },
  chaleco: { balaclava: 'cat:canale-1x1', '*': 'cat:ripstop', bajo: 'cat:licra', fornituras: 'cat:cremallera-vislon', botones: 'cat:automatico' },
  cazadora: { '*': 'cat:denim-rigido', botones: 'cat:boton-metal' },
  cortavientos: { balaclava: 'cat:canale-1x1', '*': 'cat:ripstop', punos: 'cat:licra', bajo: 'cat:licra', cordones: 'cat:cordon-algodon', fornituras: 'cat:cremallera-vislon' },
  gorro: { '*': 'cat:canale-2x2', pompon: 'cat:punto-lana' },
  gorra: { '*': 'cat:chino', trasera: 'cat:malla', visera: 'cat:chino', boton: 'cat:chino', cierre: 'cat:metal-niquel', ojetes: 'cat:chino' },
  'pantalon-corto': { '*': 'cat:french-terry', punos: 'cat:canale-2x2', cinturilla: 'cat:canale-2x2', cordon: 'cat:cordon-algodon', botones: 'cat:boton-metal' },
}

export function defaultMaterialFor(template: string, piece: string) {
  const d = DEFAULTS[template] ?? {}
  return BY_ID.get(d[piece] ?? d['*'] ?? 'cat:jersey')!
}

/** Material de una pieza para dibujarla: el elegido (catálogo o Biblioteca) o el de por defecto. */
export interface ResolvedMaterial {
  /** Material del catálogo con el que se ve (el elegido, o el de por defecto si es de la Biblioteca o no hay). */
  catalog: CatalogMaterial
  /** Material de la Biblioteca elegido (para usar su foto). */
  library?: Material
  /** Si se ha elegido uno a propósito. */
  chosen: boolean
}

export function resolveMaterial(template: string, piece: string, materialId: string | null | undefined, library?: Map<string, Material>): ResolvedMaterial {
  const cat = getCatalogMaterial(materialId)
  if (cat) return { catalog: cat, chosen: true }
  const lib = materialId ? library?.get(materialId) : undefined
  // Un material propio con textura se ve como ese material del catálogo
  return { catalog: getCatalogMaterial(lib?.look) ?? defaultMaterialFor(template, piece), library: lib, chosen: !!lib }
}
