import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { seedFromServer, replayPendingActions } from '@/lib/syncEngine'

interface SyncContextValue {
  isOnline: boolean
  pendingCount: number
}

const SyncContext = createContext<SyncContextValue>({ isOnline: true, pendingCount: 0 })

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const pendingCount = useLiveQuery(
    () => db.pendingActions.where('status').equals('pending').count(),
    [],
    0
  ) ?? 0

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

  // Seed local DB on first load (if online and authenticated)
  useEffect(() => {
    if (navigator.onLine && localStorage.getItem('token')) {
      replayPendingActions().then(() => seedFromServer())
    }
  }, [])

  // On reconnect: replay queued mutations, then refresh local DB from server
  useEffect(() => {
    if (isOnline && localStorage.getItem('token')) {
      replayPendingActions().then(() => seedFromServer())
    }
  }, [isOnline])

  return (
    <SyncContext.Provider value={{ isOnline, pendingCount }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext)
}
