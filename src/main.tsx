/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { aplicarTema, lerTemaPref } from './lib/tema'

registerSW({ immediate: true }) // recarrega sozinho quando um SW novo é instalado

aplicarTema(lerTemaPref())
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (lerTemaPref() === 'sistema') aplicarTema('sistema')
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)