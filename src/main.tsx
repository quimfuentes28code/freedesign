import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
// Modo oscuro de toda la app
import './dark.css'
// Estilo «Estudio + Taller técnico» (se carga el último: manda sobre los dos de arriba)
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
