import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // base requis pour GitHub Pages : le site est servi sous /BABIPLAY/
  base: '/BABIPLAY/',
  plugins: [react(), tailwindcss()],
})
