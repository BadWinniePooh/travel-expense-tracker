import React, { createContext, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wb } from '@/lib/pwa'

interface SyncContextValue {
  isOnline: boolean
  pendingCount: number
}

const SyncContext = createContext<SyncContextValue>({ isOnline: true, pendingCount: 0 })

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const queryClient = useQueryClient()

  // Track browser online/offline state
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Count mutations queued while offline (dispatched by axios interceptor)
  useEffect(() => {
    const handler = () => setPendingCount((n) => n + 1)
    window.addEventListener('sync-queued', handler)
    return () => window.removeEventListener('sync-queued', handler)
  }, [])

  // When service worker signals sync is complete, refresh all cached queries
  useEffect(() => {
    if (!wb) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        setPendingCount(0)
        queryClient.invalidateQueries()
      }
    }
    wb.addEventListener('message', handler)
    return () => wb?.removeEventListener('message', handler)
  }, [queryClient])

  // When coming back online, explicitly register the Background Sync tag so
  // Chrome can replay queued requests even if the SW hasn't fired yet.
  useEffect(() => {
    if (!isOnline || pendingCount === 0) return
    navigator.serviceWorker?.ready
      .then((reg) => {
        const syncReg = reg as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> }
        }
        return syncReg.sync?.register('offline-mutations')
      })
      .catch(() => {
        // Browser may not support Background Sync API — Workbox handles fallback
      })
  }, [isOnline, pendingCount])

  return (
    <SyncContext.Provider value={{ isOnline, pendingCount }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext)
}
