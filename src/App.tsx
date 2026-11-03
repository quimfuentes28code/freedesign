import { BrowserRouter, Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { ClientForm } from './pages/clients/ClientForm'
import { ClientsList } from './pages/clients/ClientsList'
import { Dashboard } from './pages/Dashboard'
import { Preview3D } from './pages/designer/Preview3D'
import { MaterialForm } from './pages/library/MaterialForm'
import { MaterialsCatalog } from './pages/library/MaterialsCatalog'
import { SupplierForm, SuppliersList } from './pages/library/Suppliers'
import { Designer, Economy, NotFound, Production, Projects } from './pages/Sections'

/** Rutas de la app. Cada apartado del menú es una página. */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="clientes" element={<ClientsList />} />
          <Route path="clientes/nuevo" element={<ClientForm />} />
          <Route path="clientes/:id" element={<ClientForm />} />
          <Route path="disenador" element={<Designer />} />
          <Route path="disenador/3d" element={<Preview3D />} />
          <Route path="proyectos" element={<Projects />} />
          <Route path="produccion" element={<Production />} />
          <Route path="biblioteca" element={<MaterialsCatalog />} />
          <Route path="biblioteca/nuevo" element={<MaterialForm />} />
          <Route path="biblioteca/proveedores" element={<SuppliersList />} />
          <Route path="biblioteca/proveedores/nuevo" element={<SupplierForm />} />
          <Route path="biblioteca/proveedores/:id" element={<SupplierForm />} />
          <Route path="biblioteca/:id" element={<MaterialForm />} />
          <Route path="economia" element={<Economy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
