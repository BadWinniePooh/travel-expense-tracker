import { Workbox } from 'workbox-window'

export let wb: Workbox | null = null

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return

  wb = new Workbox('/sw.js', { scope: '/' })

  wb.addEventListener('installed', (event) => {
    if (!event.isUpdate) {
      console.info('[PWA] App is ready to work offline')
    }
  })

  wb.register().catch((err) => {
    console.error('[PWA] Service worker registration failed', err)
  })
}

export type QueuedResponse = { queued: true }

export function isQueued(data: unknown): data is QueuedResponse {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).queued === true
}
