import { NavLink } from 'react-router'

/** Pestañas de la Biblioteca: materiales y proveedores. */
export function LibraryTabs() {
  return (
    <nav className="tabs" aria-label="Biblioteca">
      <NavLink to="/biblioteca" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
        Materiales
      </NavLink>
      <NavLink to="/biblioteca/proveedores" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
        Proveedores
      </NavLink>
    </nav>
  )
}
