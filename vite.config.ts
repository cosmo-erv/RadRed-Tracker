import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // One JS chunk: it keeps the single-file build (scripts/build-single.mjs)
    // a straight inline, and both chunks were always loaded together anyway.
    rollupOptions: {
      output: { manualChunks: undefined, inlineDynamicImports: true }
    }
  }
})
