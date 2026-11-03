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
}

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
