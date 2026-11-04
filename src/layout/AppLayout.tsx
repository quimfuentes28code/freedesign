import { NavLink, Outlet } from 'react-router'
import { Icon, type IconName } from './icons'

/** Apartados de la app, en el orden del menú. */
export const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/clientes', label: 'Clientes', icon: 'clients' },
  { to: '/disenador', label: 'Diseñador', icon: 'designer' },
  { to: '/proyectos', label: 'Proyectos', icon: 'projects' },
  { to: '/produccion', label: 'Producción', icon: 'production' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'library' },
  { to: '/economia', label: 'Economía', icon: 'economy' },
]

/** Estructura común: menú lateral (arriba en el móvil) y el contenido de cada apartado. */
export function AppLayout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">FreeDesign</div>
        <nav className="nav" aria-label="Apartados">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
