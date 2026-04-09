import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppProvider } from './state/AppContext'
import App from './App'
import CookieConsentGate from './components/CookieConsentGate'
import './styles/global.css'

// TODO: Register service worker for offline support (§13).
// import { registerSW } from 'virtual:pwa-register'
// registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CookieConsentGate>
      <AppProvider>
        <App />
      </AppProvider>
    </CookieConsentGate>
  </React.StrictMode>
)
