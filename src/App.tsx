import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, GuestOnly, RequireAuth } from './auth/AuthContext'
import { AppLayout } from './layout/AppLayout'
import { LoginPage, RegisterPage } from './pages/auth/AuthPages'

/**
 * Carga el código de un apartado. Si falla porque se ha publicado una versión nueva (los archivos de la anterior ya no
 * están en el servidor), recarga la página una vez para abrir la nueva; si vuelve a fallar, se ve el error.
 */
function fresh<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((err: unknown) => {
    const KEY = 'fd:recargada'
    let last = 0
    try {
      last = Number(sessionStorage.getItem(KEY) ?? 0)
      sessionStorage.setItem(KEY, String(Date.now()))
    } catch {
      // Sin almacenamiento: se recarga igual (una sola vez por carga de la página)
    }
    if (Date.now() - last > 30_000) {
      location.reload()
      return new Promise<T>(() => {})
    }
    throw err
  })
}

// Cada apartado se descarga solo al abrirlo (así la app arranca sin bajar el 3D, el lienzo o el creador de golpe)
const ProfilePage = lazy(() => fresh(() => import('./pages/account/Profile').then((m) => ({ default: m.ProfilePage }))))
const ClientForm = lazy(() => fresh(() => import('./pages/clients/ClientForm').then((m) => ({ default: m.ClientForm }))))
const ClientsList = lazy(() => fresh(() => import('./pages/clients/ClientsList').then((m) => ({ default: m.ClientsList }))))
const Dashboard = lazy(() => fresh(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))))
const StudioHome = lazy(() => fresh(() => import('./pages/StudioHome').then((m) => ({ default: m.StudioHome }))))
const DesignEditor = lazy(() => fresh(() => import('./pages/designer/DesignEditor').then((m) => ({ default: m.DesignEditor }))))
const DesignsGallery = lazy(() => fresh(() => import('./pages/designer/DesignsGallery').then((m) => ({ default: m.DesignsGallery }))))
const Probador = lazy(() => fresh(() => import('./pages/designer/Probador').then((m) => ({ default: m.Probador }))))
const Lookbook = lazy(() => fresh(() => import('./pages/designer/Lookbook').then((m) => ({ default: m.Lookbook }))))
const ArtworkCreator = lazy(() => fresh(() => import('./pages/library/ArtworkCreator').then((m) => ({ default: m.ArtworkCreator }))))
const ArtworksList = lazy(() => fresh(() => import('./pages/library/Artworks').then((m) => ({ default: m.ArtworksList }))))
const MaterialForm = lazy(() => fresh(() => import('./pages/library/MaterialForm').then((m) => ({ default: m.MaterialForm }))))
const MaterialsCatalog = lazy(() => fresh(() => import('./pages/library/MaterialsCatalog').then((m) => ({ default: m.MaterialsCatalog }))))
const SupplierForm = lazy(() => fresh(() => import('./pages/library/Suppliers').then((m) => ({ default: m.SupplierForm }))))
const SuppliersList = lazy(() => fresh(() => import('./pages/library/Suppliers').then((m) => ({ default: m.SuppliersList }))))
const CollectionsPage = lazy(() => fresh(() => import('./pages/projects/Collections').then((m) => ({ default: m.CollectionsPage }))))
const ProjectDetail = lazy(() => fresh(() => import('./pages/projects/ProjectDetail').then((m) => ({ default: m.ProjectDetail }))))
const ProjectPresentation = lazy(() => fresh(() => import('./pages/projects/ProjectPresentation').then((m) => ({ default: m.ProjectPresentation }))))
const ProjectsPage = lazy(() => fresh(() => import('./pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))))
const ProductionPage = lazy(() => fresh(() => import('./pages/production/ProductionPage').then((m) => ({ default: m.ProductionPage }))))
const TechPackPage = lazy(() => fresh(() => import('./pages/production/TechPack').then((m) => ({ default: m.TechPackPage }))))
const PatternPage = lazy(() => fresh(() => import('./pages/production/Pattern').then((m) => ({ default: m.PatternPage }))))
const EconomyPage = lazy(() => fresh(() => import('./pages/economy/EconomyPage').then((m) => ({ default: m.EconomyPage }))))
const ExpensesPage = lazy(() => fresh(() => import('./pages/economy/Expenses').then((m) => ({ default: m.ExpensesPage }))))
const NotFound = lazy(() => fresh(() => import('./pages/Sections').then((m) => ({ default: m.NotFound }))))
const TabletPad = lazy(() => fresh(() => import('./pages/tablet/TabletPad').then((m) => ({ default: m.TabletPad }))))

/** Rutas de la app. Entrar y crear cuenta son públicas; el resto necesita sesión. */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Móvil como tableta: se abre con el QR del lienzo, sin iniciar sesión (el token es la llave) */}
          <Route path="tableta/:token" element={<TabletPad />} />
          <Route element={<GuestOnly />}>
            <Route path="entrar" element={<LoginPage />} />
            <Route path="registro" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<StudioHome />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="perfil" element={<ProfilePage />} />
              <Route path="clientes" element={<ClientsList />} />
              <Route path="clientes/nuevo" element={<ClientForm />} />
              <Route path="clientes/:id" element={<ClientForm />} />
              <Route path="disenador" element={<DesignEditor />} />
              <Route path="disenador/nuevo" element={<ToDraft />} />
              <Route path="disenos" element={<DesignsGallery />} />
              {/* La vista 3D suelta de antes es ahora el Probador */}
              <Route path="disenador/3d" element={<Navigate to="/disenador/probador" replace />} />
              <Route path="disenador/probador" element={<Probador />} />
              <Route path="disenador/lookbook" element={<Lookbook />} />
              <Route path="disenador/:id" element={<DesignEditor />} />
              <Route path="proyectos" element={<ProjectsPage />} />
              <Route path="proyectos/nuevo" element={<ProjectDetail />} />
              <Route path="proyectos/colecciones" element={<CollectionsPage />} />
              <Route path="proyectos/:id" element={<ProjectDetail />} />
              <Route path="proyectos/:id/presentacion" element={<ProjectPresentation />} />
              <Route path="produccion" element={<ProductionPage />} />
              <Route path="produccion/ficha/:id" element={<TechPackPage />} />
              <Route path="produccion/patron/:id" element={<PatternPage />} />
              <Route path="biblioteca" element={<MaterialsCatalog />} />
              <Route path="biblioteca/nuevo" element={<MaterialForm />} />
              <Route path="biblioteca/graficos" element={<ArtworksList />} />
              <Route path="biblioteca/graficos/nuevo" element={<ArtworkCreator />} />
              <Route path="biblioteca/graficos/:id" element={<ArtworkCreator />} />
              <Route path="biblioteca/proveedores" element={<SuppliersList />} />
              <Route path="biblioteca/proveedores/nuevo" element={<SupplierForm />} />
              <Route path="biblioteca/proveedores/:id" element={<SupplierForm />} />
              <Route path="biblioteca/:id" element={<MaterialForm />} />
              <Route path="economia" element={<EconomyPage />} />
              <Route path="economia/gastos" element={<ExpensesPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

/** Mientras llega el código de una página (la primera vez que se abre). */
export function PageLoading() {
  return <p className="page-loading">Cargando…</p>
}

/** Enlaces antiguos a «Nuevo diseño»: el Diseñador ya abre un lienzo nuevo (con su cliente y proyecto, si vienen). */
function ToDraft() {
  const { search } = useLocation()
  return <Navigate to={`/disenador${search}`} replace />
}
