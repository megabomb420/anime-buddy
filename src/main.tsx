import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// PWA service worker (auto-update). In dev this is a no-op stub.
registerSW({ immediate: true })

const rawBase = import.meta.env.BASE_URL
const basename =
  !rawBase || rawBase === "/" || rawBase === "./"
    ? undefined
    : rawBase.replace(/\/$/, "")

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
