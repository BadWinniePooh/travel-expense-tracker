import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useSync } from '@/contexts/SyncContext'
import { useEffect, useRef, useState } from 'react'

export function OfflineBanner() {
  const { isOnline, pendingCount } = useSync()
  const [justSynced, setJustSynced] = useState(false)
  const prevPendingRef = useRef(pendingCount)

  // Show a brief "Synced" confirmation when pendingCount transitions >0 → 0 while online
  useEffect(() => {
    const wasPositive = prevPendingRef.current > 0
    prevPendingRef.current = pendingCount
    if (isOnline && pendingCount === 0 && wasPositive) {
      setJustSynced(true)
      const t = setTimeout(() => setJustSynced(false), 3000)
      return () => clearTimeout(t)
    }
  }, [isOnline, pendingCount])

  if (isOnline && pendingCount === 0 && !justSynced) return null

  if (justSynced && pendingCount === 0) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-green-600 text-white text-sm px-4 py-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        All changes synced
      </div>
    )
  }

  if (!isOnline && pendingCount > 0) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-600 text-white text-sm px-4 py-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        You&apos;re offline &mdash; {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-slate-700 text-white text-sm px-4 py-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        You&apos;re offline &mdash; showing cached data
      </div>
    )
  }

  // Online but still pending (syncing in progress)
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm px-4 py-2">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
      Syncing {pendingCount} change{pendingCount !== 1 ? 's' : ''}…
    </div>
  )
}
