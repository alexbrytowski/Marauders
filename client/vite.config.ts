import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.MARAUDERS_API_URL ?? 'http://localhost:5133',
      '/hubs': { target: process.env.MARAUDERS_API_URL ?? 'http://localhost:5133', ws: true },
    },
  },
})
