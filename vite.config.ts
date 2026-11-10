import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Hébergement : Vercel (déploiement automatique depuis main).
// base '/' : le site est servi à la racine du domaine.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
