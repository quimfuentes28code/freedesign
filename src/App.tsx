import { BrowserRouter, Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { ClientForm } from './pages/clients/ClientForm'
import { ClientsList } from './pages/clients/ClientsList'
import { Dashboard } from './pages/Dashboard'
import { Preview3D } from './pages/designer/Preview3D'
import { Designer, Economy, Library, NotFound, Production, Projects } from './pages/Sections'

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
          <Route path="biblioteca" element={<Library />} />
          <Route path="economia" element={<Economy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
