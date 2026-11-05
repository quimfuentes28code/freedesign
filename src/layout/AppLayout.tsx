import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ACCOUNT_TYPES, displayName } from '../shared/users'
import { Icon, type IconName } from './icons'

/** Apartados de la app, en el orden del menú. */
export const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/clientes', label: 'Clientes', icon: 'clients' },
  { to: '/disenador', label: 'Diseñador', icon: 'designer' },
  { to: '/proyectos', label: 'Proyectos', icon: 'projects' },
  { to: '/produccion', label: 'Producción', icon: 'production' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'library' },
  { to: '/economia', label: 'Economía', icon: 'economy' },
]

/** Estructura común: menú lateral (arriba en el móvil), la cuenta abajo y el contenido de cada apartado. */
export function AppLayout() {
  const { user, logout } = useAuth()
  const name = user ? displayName(user) : ''
  // En el editor de un diseño el menú se recoge a iconos
  const { pathname } = useLocation()
  const compact = /^\/disenador\/(?!nuevo$|3d$|probador$)[^/]+$/.test(pathname)
  // Inicio: el estudio de fotos 3D a pantalla completa, con el menú flotando encima
  const home = pathname === '/'
  return (
    <div className={['app', compact ? 'compact' : '', home ? 'home' : ''].filter(Boolean).join(' ')}>
      <aside className="sidebar">
        <Link to="/" className="brand brand-link" title="Inicio: el estudio">
          {compact ? 'FD' : 'FreeDesign'}
        </Link>
        <nav className="nav" aria-label="Apartados">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} title={compact ? s.label : undefined} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="account">
            <Link to="/perfil" className="account-link" title="Mi perfil">
              <span className="avatar" aria-hidden>
                {name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="account-text">
                <span className="account-name">{name}</span>
                <span className="account-type-label">{ACCOUNT_TYPES.find((t) => t.id === user.accountType)?.label}</span>
              </span>
            </Link>
            <button type="button" className="account-logout" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
