import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import fieldImage from '@/game-template/assets/2026-field.png'
import fieldImageRed from '@/game-template/assets/2026-field-red.png'
import fieldImageBlue from '@/game-template/assets/2026-field-blue.png'
import { warmCriticalAssets } from '@/core/lib/pwaAssetWarmup'

const CRITICAL_OFFLINE_ASSETS = [fieldImage, fieldImageRed, fieldImageBlue]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // Clear stale SWs from previous production builds so they don't break local Vite
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => void reg.unregister())
    })
  } else if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          if (navigator.onLine) {
            void warmCriticalAssets(CRITICAL_OFFLINE_ASSETS)
          }

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  window.dispatchEvent(new CustomEvent('sw-update-available', {
                    detail: { waiting: newWorker }
                  }));
                }
              });
            }
          });
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });

      window.addEventListener('online', () => {
        void warmCriticalAssets(CRITICAL_OFFLINE_ASSETS)
      })
    });
  }
}
