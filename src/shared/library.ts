/**
 * Tipos de la Biblioteca (materiales y proveedores), compartidos por la web (src/) y la API (worker/).
 */

export const MATERIAL_CATEGORIES = [
  { id: 'tejido', label: 'Tejidos', single: 'Tejido' },
  { id: 'fornitura', label: 'Fornituras', single: 'Fornitura', hint: 'Cremalleras, botones, cordones, remaches…' },
  { id: 'hilo', label: 'Hilos', single: 'Hilo' },
  { id: 'etiqueta', label: 'Etiquetas', single: 'Etiqueta', hint: 'Etiquetas de marca, de talla, de composición…' },
  { id: 'estampado', label: 'Estampados', single: 'Estampado', hint: 'Serigrafía, bordado, transfer, vinilo…' },
  { id: 'acabado', label: 'Acabados', single: 'Acabado', hint: 'Lavados, tintes, tratamientos…' },
  { id: 'packaging', label: 'Packaging', single: 'Packaging' },
  { id: 'otro', label: 'Otros', single: 'Otro' },
] as const

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]['id']

export const PRICE_UNITS = ['metro', 'unidad', 'kg', 'rollo', 'cono', 'par', 'hora'] as const
export type PriceUnit = (typeof PRICE_UNITS)[number]

export interface Material {
  id: string
  category: MaterialCategory
  name: string
  description: string
  reference: string
  supplierId: string | null
  /** Nombre del proveedor (solo lectura, lo añade la API). */
  supplierName?: string
  /** Precio aproximado en euros por `priceUnit`. */
  price: number | null
  priceUnit: PriceUnit
  color: string
  composition: string
  weightGsm: number | null
  widthCm: number | null
  tags: string
  /** Clave de la foto en el almacén de archivos (vacía si no tiene). */
  photo: string
  /**
   * Textura en el Diseñador y el 3D: id de un material del catálogo integrado (`cat:…`, ver designer/materials.ts).
   * Vacía: la pieza se ve con el material por defecto de su prenda.
   */
  look: string
  createdAt: string
  updatedAt: string
}

export type MaterialInput = Omit<Material, 'id' | 'createdAt' | 'updatedAt' | 'supplierName'>

export const EMPTY_MATERIAL: MaterialInput = {
  category: 'tejido',
  name: '',
  description: '',
  reference: '',
  supplierId: null,
  price: null,
  priceUnit: 'metro',
  color: '',
  composition: '',
  weightGsm: null,
  widthCm: null,
  tags: '',
  photo: '',
  look: '',
}

/** Material básico para las cuentas nuevas (sin proveedor ni foto). */
type Basic = Omit<MaterialInput, 'supplierId' | 'photo' | 'reference' | 'color'>
const fabric = (name: string, composition: string, weightGsm: number, widthCm: number, price: number, look: string, description: string): Basic => ({
  category: 'tejido',
  name,
  description,
  price,
  priceUnit: 'metro',
  composition,
  weightGsm,
  widthCm,
  tags: 'básico',
  look,
})
const item = (category: MaterialCategory, name: string, price: number, priceUnit: PriceUnit, look: string, description: string): Basic => ({
  category,
  name,
  description,
  price,
  priceUnit,
  composition: '',
  weightGsm: null,
  widthCm: null,
  tags: 'básico',
  look,
})

/**
 * Tejidos, fornituras y recursos básicos con los que empieza cada cuenta: lo que se usa en sudaderas, camisetas,
 * camisas, pantalones y chaquetas, con su composición, gramaje, ancho, precio orientativo (€, sin IVA) y su textura
 * del catálogo, para que se vean como son en el Diseñador y el 3D. Cada cuenta los puede cambiar o borrar.
 */
export const BASIC_MATERIALS: Basic[] = [
  fabric('Punto jersey de algodón', '100% algodón', 180, 180, 8, 'cat:jersey', 'Camisetas y básicos.'),
  fabric('Jersey pesado (heavyweight)', '100% algodón peinado', 260, 180, 10.5, 'cat:jersey-pesado', 'Camisetas boxy y oversize.'),
  fabric('Felpa perchada (fleece)', '80% algodón · 20% poliéster', 320, 180, 12, 'cat:felpa-perchada', 'Sudaderas y joggers, interior cepillado.'),
  fabric('Felpa french terry', '100% algodón', 350, 180, 13, 'cat:french-terry', 'Sudaderas y pantalones de chándal, interior de rizo.'),
  fabric('Canalé 2x2', '97% algodón · 3% elastano', 300, 100, 11, 'cat:canale-2x2', 'Puños, bajos y cuellos de sudadera.'),
  fabric('Canalé 1x1', '95% algodón · 5% elastano', 220, 100, 9, 'cat:canale-1x1', 'Cuellos de camiseta y tops.'),
  fabric('Piqué', '100% algodón', 220, 180, 9.5, 'cat:pique', 'Polos.'),
  fabric('Popelín', '100% algodón', 115, 145, 7.5, 'cat:popelin', 'Camisas.'),
  fabric('Oxford', '100% algodón', 140, 145, 8.5, 'cat:oxford', 'Camisas y sobrecamisas.'),
  fabric('Sarga / chino', '98% algodón · 2% elastano', 260, 145, 9, 'cat:chino', 'Pantalones chino y chaquetas.'),
  fabric('Denim 14 oz', '100% algodón', 475, 150, 12, 'cat:denim-rigido', 'Vaqueros y cazadoras.'),
  fabric('Lona (canvas)', '100% algodón', 380, 150, 10, 'cat:lona', 'Chaquetas de trabajo y bolsas.'),
  fabric('Nylon de bomber', '100% poliamida', 160, 150, 9, 'cat:nylon-bomber', 'Chaquetas bomber y cortavientos.'),
  fabric('Acolchado (puffer)', 'Nylon con relleno de poliéster', 220, 140, 16, 'cat:acolchado', 'Plumíferos y chalecos.'),
  fabric('Forro polar', '100% poliéster', 280, 150, 7, 'cat:polar', 'Chaquetas y forros.'),
  fabric('Malla deportiva', '100% poliéster', 140, 160, 5, 'cat:malla', 'Forros y traseras de gorra.'),
  item('fornitura', 'Cordón de algodón trenzado', 0.35, 'metro', 'cat:cordon-algodon', 'Capuchas y cinturas.'),
  item('fornitura', 'Cremallera de nylon (espiral)', 1.2, 'unidad', 'cat:cremallera-nylon', 'Sudaderas y bolsillos.'),
  item('fornitura', 'Cremallera metálica (latón)', 2.5, 'unidad', 'cat:metal-laton', 'Chaquetas y vaqueros.'),
  item('fornitura', 'Botón de resina', 0.15, 'unidad', 'cat:boton-resina', 'Camisas y polos.'),
  item('fornitura', 'Botón metálico (vaquero)', 0.35, 'unidad', 'cat:boton-metal', 'Vaqueros, pantalones y cazadoras.'),
  item('fornitura', 'Botón automático (corchete)', 0.3, 'unidad', 'cat:automatico', 'Chaquetas y bombers.'),
  item('hilo', 'Hilo de poliéster para costura', 3.5, 'cono', '', 'Cono de 5000 m, para coser y pespuntear.'),
  item('etiqueta', 'Etiqueta tejida de marca', 0.25, 'unidad', '', 'Etiqueta de cuello con el logo.'),
  item('etiqueta', 'Etiqueta de composición y lavado', 0.08, 'unidad', '', 'Etiqueta interior con composición, talla y cuidados.'),
]

export interface Supplier {
  id: string
  name: string
  contact: string
  email: string
  phone: string
  website: string
  city: string
  notes: string
  /** Cuántos materiales tiene en la biblioteca (solo lectura, lo añade la API). */
  materials?: number
  createdAt: string
  updatedAt: string
}

export type SupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'materials'>

export const EMPTY_SUPPLIER: SupplierInput = {
  name: '',
  contact: '',
  email: '',
  phone: '',
  website: '',
  city: '',
  notes: '',
}

/** URL pública (dentro de la app) de un archivo guardado. */
export const fileUrl = (key: string) => `/api/files/${key}`
