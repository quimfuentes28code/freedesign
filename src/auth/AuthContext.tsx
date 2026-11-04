import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { api, SESSION_EXPIRED } from '../api/client'
import type { RegisterInput, User } from '../shared/users'

interface AuthState {
  /** Cuenta con la sesión iniciada (null si no hay sesión). */
  user: User | null
  /** Mientras se comprueba si hay sesión al abrir la app. */
  checking: boolean
  /** Se ha cerrado la sesión a propósito (no caducado): al volver a entrar se empieza desde el inicio. */
  loggedOut: boolean
  login: (email: string, password: string) => Promise<void>
  register: (r: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

/** Guarda la cuenta con la sesión iniciada y la comparte con toda la app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
    // Si la sesión caduca mientras se usa la app, volvemos a la pantalla de entrar
    const expired = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => window.removeEventListener(SESSION_EXPIRED, expired)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api.login(email, password))
    setLoggedOut(false)
  }, [])
  const register = useCallback(async (r: RegisterInput) => {
    setUser(await api.register(r))
    setLoggedOut(false)
  }, [])
  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setLoggedOut(true)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, checking, loggedOut, login, register, logout, setUser }),
    [user, checking, loggedOut, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** Rutas que necesitan sesión: sin ella se va a /entrar (y luego se vuelve a donde se quería ir). */
export function RequireAuth() {
  const { user, checking, loggedOut } = useAuth()
  const location = useLocation()
  if (checking) return <p className="status auth-checking">Cargando…</p>
  if (!user) return <Navigate to="/entrar" replace state={loggedOut ? null : { from: location.pathname + location.search }} />
  return <Outlet />
}

/** Rutas solo para quien no ha iniciado sesión (entrar, crear cuenta). */
export function GuestOnly() {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return <p className="status auth-checking">Cargando…</p>
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />
  return <Outlet />
}
