import { NavLink } from 'react-router'

/** Pestañas de la Biblioteca: materiales, gráficos para estampar y proveedores. */
export function LibraryTabs() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <nav className="tabs" aria-label="Biblioteca">
      <NavLink to="/biblioteca" end className={cls}>
        Materiales
      </NavLink>
      <NavLink to="/biblioteca/graficos" className={cls}>
        Gráficos
      </NavLink>
      <NavLink to="/biblioteca/proveedores" className={cls}>
        Proveedores
      </NavLink>
    </nav>
  )
}
