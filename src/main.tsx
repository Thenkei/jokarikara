import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/outfit/wght.css'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa/registerServiceWorker.ts'
import { applyInitialDocumentLang } from './i18n/initialLang.ts'
import { captureInstallPrompt } from './pwa/installPrompt.ts'

// Before the first render: index.html ships lang="en" for every player.
applyInitialDocumentLang()
// Before the first render too: Chromium may announce installability early.
captureInstallPrompt()

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
