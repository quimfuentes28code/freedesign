import type { ReactNode } from 'react'

/** Cabecera de una página: título, subtítulo opcional y acciones a la derecha. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
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

/** Mensajes de estado de carga y error. */
export function Status({ loading, error }: { loading?: boolean; error?: string | null }) {
  if (error) return <p className="status error">No se ha podido cargar: {error}</p>
  if (loading) return <p className="status">Cargando…</p>
  return null
}
