import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El plugin de Cloudflare arranca también la API (worker/) y la base de datos D1 local con `npm run dev`
export default defineConfig({
  plugins: [react(), cloudflare()],
})
