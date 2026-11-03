import { NavLink } from 'react-router'
import { PROJECT_STATUSES, type ProjectStatus } from '../../shared/projects'

export const statusLabel = (s: ProjectStatus) => PROJECT_STATUSES.find((x) => x.id === s)?.label ?? s

/** Importe en euros, p. ej. «1.234,50 €». */
export const euro = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Fecha corta, p. ej. «12 nov». */
export const shortDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '')

/** ¿Ya ha pasado esta fecha (AAAA-MM-DD)? */
export const isOverdue = (d: string) => !!d && d < new Date().toISOString().slice(0, 10)

/** Margen (%) entre coste y precio de venta. */
export const margin = (cost: number, price: number | null) => (price ? ((price - cost) / price) * 100 : null)

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge s-${status}`}>{statusLabel(status)}</span>
}

/** Pestañas del apartado Proyectos. */
export function ProjectsTabs() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <nav className="tabs" aria-label="Proyectos">
      <NavLink to="/proyectos" end className={cls}>
        Proyectos
      </NavLink>
      <NavLink to="/proyectos/colecciones" className={cls}>
        Colecciones
      </NavLink>
    </nav>
  )
}
