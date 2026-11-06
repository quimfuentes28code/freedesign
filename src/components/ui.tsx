import type { ReactNode } from 'react'

/** Cabecera de una página: título, subtítulo opcional y acciones a la derecha. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-title">
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/** Apartado aún no construido: explica lo que habrá. */
export function ComingSoon({ title, intro, items }: { title: string; intro: string; items: string[] }) {
  return (
    <div className="page">
      <PageHeader title={title} subtitle="Próximamente" />
      <div className="card coming-soon">
        <p>{intro}</p>
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Campo de formulario con su etiqueta. `wide` ocupa toda la fila. */
export function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Precio con su unidad, p. ej. «4,50 € / metro». */
export function formatPrice(price: number | null, unit: string) {
  if (price === null) return 'Sin precio'
  return `${price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / ${unit}`
}

/** Mensajes de estado de carga y error. */
export function Status({ loading, error }: { loading?: boolean; error?: string | null }) {
  if (error) return <p className="status error">No se ha podido cargar: {error}</p>
  if (loading) return <p className="status">Cargando…</p>
  return null
}
