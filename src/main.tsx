import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa'
// Todo el CSS va al arrancar y en el mismo orden que cuando la app era un solo paquete (el de los apartados primero y
// el general después, que manda): así ningún apartado se queda sin estilos que viven en el CSS de otro. Lo que se
// carga por apartados (React.lazy en App.tsx) es el código, que es lo que pesa.
import './pages/projects/projects.css'
import './pages/designer/studio.css'
import './pages/home.css'
import './pages/library/creator.css'
import './lienzo/lienzo.css'
import './pages/designer/designer.css'
import './pages/designer/studio-editor.css'
import './pages/designer/lookbook.css'
import './pages/projects/presentation.css'
import './pages/production/production.css'
import './pages/economy/economy.css'
import './pages/tablet/tablet.css'
import './styles.css'
// Modo oscuro de toda la app
import './dark.css'
// Estilo «Estudio + Taller técnico» (se carga el último: manda sobre los dos de arriba)
import './theme.css'

// App instalable: service worker, actualizaciones automáticas e instalación
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
