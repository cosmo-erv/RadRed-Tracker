import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Skipped for the single-file build, which has nothing to fetch.
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.__SPRITE_DATA__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the app works fine without it.
    })
  })
}
