import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Dos portales: index.html (equipo del negocio) y pedidos.html (clientes, tazon-pedidos.web.app)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        negocio: 'index.html',
        pedidos: 'pedidos.html',
      },
    },
  },
})
