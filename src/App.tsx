import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider, GuestOnly, RequireAuth } from './auth/AuthContext'
import { AppLayout } from './layout/AppLayout'
import { ProfilePage } from './pages/account/Profile'
import { LoginPage, RegisterPage } from './pages/auth/AuthPages'
import { ClientForm } from './pages/clients/ClientForm'
import { ClientsList } from './pages/clients/ClientsList'
import { Dashboard } from './pages/Dashboard'
import { StudioHome } from './pages/StudioHome'
import { DesignEditor } from './pages/designer/DesignEditor'
import { DesignsList, NewDesign } from './pages/designer/Designs'
import { Preview3D } from './pages/designer/Preview3D'
import { Probador } from './pages/designer/Probador'
import { ArtworkCreator } from './pages/library/ArtworkCreator'
import { ArtworksList } from './pages/library/Artworks'
import { MaterialForm } from './pages/library/MaterialForm'
import { MaterialsCatalog } from './pages/library/MaterialsCatalog'
import { SupplierForm, SuppliersList } from './pages/library/Suppliers'
import { CollectionsPage } from './pages/projects/Collections'
import { ProjectDetail } from './pages/projects/ProjectDetail'
import { ProjectsPage } from './pages/projects/ProjectsPage'
import { ProductionPage } from './pages/production/ProductionPage'
import { TechPackPage } from './pages/production/TechPack'
import { EconomyPage } from './pages/economy/EconomyPage'
import { ExpensesPage } from './pages/economy/Expenses'
import { NotFound } from './pages/Sections'

/** Rutas de la app. Entrar y crear cuenta son públicas; el resto necesita sesión. */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
              <Route path="disenador" element={<DesignsList />} />
              <Route path="disenador/nuevo" element={<NewDesign />} />
              <Route path="disenador/3d" element={<Preview3D />} />
              <Route path="disenador/probador" element={<Probador />} />
              <Route path="disenador/:id" element={<DesignEditor />} />
              <Route path="proyectos" element={<ProjectsPage />} />
              <Route path="proyectos/nuevo" element={<ProjectDetail />} />
              <Route path="proyectos/colecciones" element={<CollectionsPage />} />
              <Route path="proyectos/:id" element={<ProjectDetail />} />
              <Route path="produccion" element={<ProductionPage />} />
              <Route path="produccion/ficha/:id" element={<TechPackPage />} />
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
      </AuthProvider>
    </BrowserRouter>
  )
}
