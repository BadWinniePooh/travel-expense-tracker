/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { Queue } from 'workbox-background-sync'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>
}

cleanupOutdatedCaches()
// self.__WB_MANIFEST is the literal token workbox-build replaces with the precache list
precacheAndRoute(self.__WB_MANIFEST)

// API GETs: NetworkFirst — fresh when online, cached copy when offline
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 86_400 }),
    ],
  })
)

// Mutation queue: holds POST/PUT/DELETE/PATCH that failed due to no network
const mutationQueue = new Queue('offline-mutations', {
  maxRetentionTime: 24 * 60, // keep for 24 h
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request)
      } catch (err) {
        // Re-enqueue and abort — Background Sync will retry
        await queue.unshiftRequest(entry)
        throw err
      }
    }
    // All queued requests replayed — tell every open window to refetch
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_COMPLETE' })
    }
  },
})

// Intercept mutations: try the network; on TypeError (offline) queue and
// return a synthetic 202 so the app knows the change was saved locally.
const mutationHandler = async ({ request }: { request: Request }): Promise<Response> => {
  const cloned = request.clone()
  try {
    return await fetch(request)
  } catch (err) {
    if (err instanceof TypeError) {
      await mutationQueue.pushRequest({ request: cloned })
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json', 'X-Sync-Queued': 'true' },
      })
    }
    throw err
  }
}

for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
  registerRoute(
    ({ url }) => url.pathname.startsWith('/api/'),
    mutationHandler,
    method
  )
}
