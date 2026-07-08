import { Workbox } from 'workbox-window'

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return

  const wb = new Workbox('/sw.js', { scope: '/' })
  wb.addEventListener('installed', (event) => {
    if (!event.isUpdate) {
      console.info('[PWA] App is ready to work offline')
    }
  })
  wb.register().catch((err) => {
    console.error('[PWA] Service worker registration failed', err)
  })
}
