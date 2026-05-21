import { db, type PendingAction } from './db'
import type { Vacation, Expense, Summary } from '@/types'

const API = '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function apiFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    // Token expired — redirect to login so the user can re-authenticate.
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

// Replace a temp ID with the server-assigned real ID across all Dexie tables
// and in the endpoints/bodies of subsequent pending actions.
async function resolveId(tempId: string, realId: string, entityType: string): Promise<void> {
  if (entityType === 'vacation') {
    const vacation = await db.vacations.get(tempId)
    if (vacation) {
      await db.transaction('rw', db.vacations, db.expenses, db.pendingActions, async () => {
        await db.vacations.delete(tempId)
        await db.vacations.put({ ...vacation, id: realId })
        // Move expenses that referenced the temp vacation ID
        const exps = await db.expenses.where('vacationId').equals(tempId).toArray()
        for (const e of exps) {
          await db.expenses.update(e.id, { vacationId: realId })
        }
        await rewritePendingActionIds(tempId, realId)
      })
    }
  } else if (entityType === 'expense') {
    const expense = await db.expenses.get(tempId)
    if (expense) {
      await db.transaction('rw', db.expenses, db.pendingActions, async () => {
        await db.expenses.delete(tempId)
        await db.expenses.put({ ...expense, id: realId })
        await rewritePendingActionIds(tempId, realId)
      })
    }
  }
}

async function rewritePendingActionIds(tempId: string, realId: string): Promise<void> {
  const all = await db.pendingActions.toArray()
  for (const action of all) {
    const newEndpoint = action.endpoint.split(tempId).join(realId)
    const bodyStr = action.body ? JSON.stringify(action.body) : ''
    const newBody = bodyStr.includes(tempId)
      ? (JSON.parse(bodyStr.split(tempId).join(realId)) as Record<string, unknown>)
      : action.body
    if (newEndpoint !== action.endpoint || newBody !== action.body) {
      await db.pendingActions.update(action.id!, { endpoint: newEndpoint, body: newBody })
    }
  }
}

// Replay all pending actions in creation order, stopping on network failure.
export async function replayPendingActions(): Promise<void> {
  // Reset previously-failed creation actions so they are retried. Creation failures are
  // often transient (server unavailable, JWT expired) and the user's local record is the
  // source of truth until the server confirms it.
  await db.pendingActions
    .filter(a => a.status === 'failed' && a.method === 'POST' && a.localId != null)
    .modify({ status: 'pending', error: undefined })

  const actions = await db.pendingActions
    .where('status').equals('pending')
    .sortBy('seq')

  for (const action of actions) {
    try {
      // Re-read from DB so we pick up any endpoint/body rewrites made by a previous iteration
      // (e.g. a preceding POST resolved a temp ID that this action's endpoint still references).
      const fresh = await db.pendingActions.get(action.id!)
      if (!fresh || fresh.status !== 'pending') continue
      const result = await apiFetch<Record<string, unknown>>(fresh.method, fresh.endpoint, fresh.body)

      if (fresh.method === 'POST' && fresh.localId && result?.id) {
        const realId = result.id as string
        await resolveId(fresh.localId!, realId, fresh.entityType)

        // Patch in server-computed fields the client approximated
        if (fresh.entityType === 'expense') {
          const updates: Partial<Expense> = {}
          if (result.amountInBaseCurrency !== undefined)
            updates.amountInBaseCurrency = result.amountInBaseCurrency as number
          if (result.paidByUsername !== undefined)
            updates.paidByUsername = result.paidByUsername as string
          if (Object.keys(updates).length)
            await db.expenses.update(realId, updates)
        }
        if (fresh.entityType === 'vacation') {
          // Server may return computed fields (creatorUsername etc.)
          const serverVacation = result as unknown as Partial<Vacation>
          const stored = await db.vacations.get(realId)
          if (stored && serverVacation) {
            await db.vacations.put({ ...stored, ...serverVacation, id: realId })
          }
        }
      }

      await db.pendingActions.delete(fresh.id!)
    } catch (err) {
      if (err instanceof TypeError) {
        // Network failure — stop; will retry when back online
        break
      }
      const msg = String(err)
      const is5xx = /HTTP 5\d\d/.test(msg)
      if (is5xx) {
        // Transient server error (e.g. exchange-rate API down) — stop and retry next sync
        break
      }
      // Client error (4xx) — bad request, won't recover by retrying; mark failed and move on
      await db.pendingActions.update(action.id!, {
        status: 'failed',
        error: msg,
      })
    }
  }
}

// Populate Dexie from the server without overwriting locally-created records.
export async function seedFromServer(): Promise<void> {
  try {
    // Collect localIds from ALL pending actions regardless of status so that
    // failed-but-not-retried local records are not deleted by the cleanup pass.
    const allActions = await db.pendingActions.toArray()
    const localIds = new Set(
      allActions
        .filter(a => a.method === 'POST' && a.localId != null)
        .map(a => a.localId as string)
    )
    const protectedExpenseIds = new Set(
      allActions
        .filter(a => a.entityType === 'expense' && a.localId != null)
        .map(a => a.localId as string)
    )

    const vacations = await apiFetch<Vacation[]>('GET', '/vacations')

    for (const v of vacations) {
      if (!localIds.has(v.id)) {
        await db.vacations.put(v)
      }
    }

    // Remove vacations deleted on the server (skip local-only ones)
    const serverIds = new Set(vacations.map(v => v.id))
    const stored = await db.vacations.toArray()
    for (const sv of stored) {
      if (!serverIds.has(sv.id) && !localIds.has(sv.id)) {
        await db.vacations.delete(sv.id)
      }
    }

    // Seed expenses and summaries for each server vacation
    for (const v of vacations) {
      try {
        const expenses = await apiFetch<Expense[]>('GET', `/vacations/${v.id}/expenses`)
        for (const e of expenses) {
          if (!protectedExpenseIds.has(e.id)) {
            await db.expenses.put(e)
          }
        }
        // Remove expenses deleted on the server (skip any locally-created ones)
        const serverExpIds = new Set(expenses.map(e => e.id))
        const storedExps = await db.expenses.where('vacationId').equals(v.id).toArray()
        for (const se of storedExps) {
          if (!serverExpIds.has(se.id) && !protectedExpenseIds.has(se.id)) {
            await db.expenses.delete(se.id)
          }
        }

        const summary = await apiFetch<Summary>('GET', `/vacations/${v.id}/summary`)
        await db.summaries.put({ vacationId: v.id, data: summary, cachedAt: Date.now() })
      } catch { /* ignore per-vacation failures */ }
    }
  } catch { /* offline or auth error — use cached data */ }
}

export interface EnqueueOptions {
  method: PendingAction['method']
  endpoint: string
  body?: Record<string, unknown>
  localId?: string
  entityType: PendingAction['entityType']
}

// Write a mutation to the pending-actions table, then try to replay immediately if online.
export async function enqueueMutation(opts: EnqueueOptions): Promise<void> {
  await db.pendingActions.add({
    seq: Date.now(),
    method: opts.method,
    endpoint: opts.endpoint,
    body: opts.body,
    localId: opts.localId,
    entityType: opts.entityType,
    status: 'pending',
  })
  if (navigator.onLine) {
    await replayPendingActions()
  }
}
