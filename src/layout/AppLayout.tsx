import { Suspense } from 'react'
import { PageLoading } from '../components/ui'
import { Fragment } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ACCOUNT_TYPES, displayName } from '../shared/users'
import { Icon, type IconName } from './icons'
import { StudioBackdrop } from './StudioBackdrop'
import { UndoToasts } from '../components/undo'

/**
 * Apartados de la app, en el orden del menú, agrupados por el momento del trabajo: crear, fabricar (taller) y
 * cobrar (negocio). `group` va en el primero de cada grupo. `also`: otras rutas en las que el apartado sale marcado.
 */
export const SECTIONS: { to: string; label: string; icon: IconName; group?: string; also?: RegExp }[] = [
  { to: '/dashboard', label: 'Inicio', icon: 'dashboard' },
  { to: '/disenos', label: 'Diseños', icon: 'designer', group: 'Crear', also: /^\/disenador(\/(?!probador|lookbook)[^/]+)?$/ },
  { to: '/disenador/probador', label: 'Probador', icon: 'probador' },
  { to: '/disenador/lookbook', label: 'Lookbook', icon: 'lookbook' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'library' },
  { to: '/proyectos', label: 'Proyectos', icon: 'projects', group: 'Taller' },
  { to: '/produccion', label: 'Producción', icon: 'production' },
  { to: '/clientes', label: 'Clientes', icon: 'clients', group: 'Negocio' },
  { to: '/economia', label: 'Economía', icon: 'economy' },
]

/** Estructura común: menú lateral (arriba en el móvil), la cuenta abajo y el contenido de cada apartado. */
export function AppLayout() {
  const { user, logout } = useAuth()
  const name = user ? displayName(user) : ''
  // En el editor de un diseño el menú se recoge a iconos
  const { pathname } = useLocation()
  const compact = /^\/disenador\/(?!nuevo$|3d$|probador$|lookbook$)[^/]+$/.test(pathname)
  // Inicio: el estudio de fotos 3D a pantalla completa, con el menú flotando encima
  const home = pathname === '/'
  return (
    <StudioBackdrop home={home}>
    <div className={['app', compact ? 'compact' : '', home ? 'home' : ''].filter(Boolean).join(' ')}>
      <aside className="sidebar">
        <Link to="/" className="brand brand-link" title="Inicio: el estudio">
          {compact ? (
            'FD'
          ) : (
            <>
              <span className="brand-full">FreeDesign</span>
              <span className="brand-short">FD</span>
            </>
          )}
        </Link>
        <nav className="nav" aria-label="Apartados">
          {SECTIONS.map((s) => (
            <Fragment key={s.to}>
              {s.group && <span className="nav-group">{s.group}</span>}
              <NavLink
                to={s.to}
                title={s.label}
                className={({ isActive }) => (isActive || s.also?.test(pathname) ? 'nav-link active' : 'nav-link')}
              >
                <Icon name={s.icon} />
                <span>{s.label}</span>
              </NavLink>
            </Fragment>
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
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <UndoToasts />
    </div>
    </StudioBackdrop>
  )
}
