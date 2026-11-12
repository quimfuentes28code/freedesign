import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa'
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
