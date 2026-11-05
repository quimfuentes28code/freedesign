/**
 * Tipos de las cuentas de usuario, compartidos por la web (src/) y la API (worker/).
 */

export const ACCOUNT_TYPES = [
  { id: 'particular', label: 'Particular' },
  { id: 'empresa', label: 'Empresa' },
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]['id']

/** La cuenta con la sesión iniciada (sin datos secretos). */
export interface User {
  id: string
  email: string
  accountType: AccountType
  /** Nombre de la persona (en empresas, la persona de contacto). */
  name: string
  companyName: string
  taxId: string
  phone: string
  /** Paleta de colores de la marca (sale en el creador de gráficos y en el Diseñador). */
  brandColors: BrandColor[]
  createdAt: string
}

/** Color de la marca: código hexadecimal, nombre y código de referencia (p. ej. Pantone). */
export interface BrandColor {
  hex: string
  name: string
  code: string
}

export const MAX_BRAND_COLORS = 24

/** Datos del perfil que se pueden editar. */
export type ProfileInput = Pick<User, 'accountType' | 'name' | 'companyName' | 'taxId' | 'phone'>

export interface RegisterInput extends ProfileInput {
  email: string
  password: string
}

export const MIN_PASSWORD = 8

/** Nombre que se muestra de una cuenta: el de la empresa si lo es, si no el de la persona. */
export const displayName = (u: Pick<User, 'accountType' | 'name' | 'companyName'>) =>
  u.accountType === 'empresa' && u.companyName ? u.companyName : u.name
