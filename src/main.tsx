import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa/registerServiceWorker.ts'
import { applyInitialDocumentLang } from './i18n/initialLang.ts'

// Before the first render: index.html ships lang="en" for every player.
applyInitialDocumentLang()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// After `load`: precaching re-downloads the app, so it must not compete with
// the first paint. Fire-and-forget; failures are logged inside.
window.addEventListener('load', () => {
  void registerServiceWorker()
})
