import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // The dex/game data is a single chunk so the service worker can cache it once.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('src/data/') ? 'gamedata' : undefined)
      }
    }
  }
})
