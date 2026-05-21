import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { replayPendingActions } from '../syncEngine'
import type { Vacation, Expense } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVacation(overrides: Partial<Vacation> = {}): Vacation {
  return {
    id: 'vac-1',
    name: 'Test Vacation',
    baseCurrency: 'EUR',
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    createdBy: 'user-1',
    creatorUsername: 'Alice',
    createdAt: new Date().toISOString(),
    participants: [{ userId: 'user-1', username: 'Alice', email: 'alice@test.com', splitWeight: 1 }],
    ...overrides,
  }
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    vacationId: 'vac-1',
    paidByUserId: 'user-1',
    paidByUsername: 'Alice',
    amount: 50,
    currency: 'EUR',
    amountInBaseCurrency: 50,
    description: 'Test',
    category: 'Food',
    date: '2026-01-01',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await db.vacations.clear()
  await db.expenses.clear()
  await db.pendingActions.clear()
  await db.summaries.clear()

  // Default mocks
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'token' ? 'fake-token' : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('replayPendingActions', () => {
  it('successful POST resolves temp ID', async () => {
    await db.vacations.put(makeVacation({ id: 'temp-vac', name: 'Test' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-vac',
      entityType: 'vacation',
      status: 'pending',
    })

    const serverVacation = { ...makeVacation({ id: 'real-vac', name: 'Test' }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(serverVacation),
    }))

    await replayPendingActions()

    expect(await db.vacations.get('real-vac')).toBeDefined()
    expect(await db.vacations.get('temp-vac')).toBeUndefined()
    expect(await db.pendingActions.count()).toBe(0)
  })

  it('POST resolves ID and subsequent PUT uses real ID', async () => {
    await db.expenses.put(makeExpense({ id: 'temp-exp', vacationId: 'vac-1' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations/vac-1/expenses',
      localId: 'temp-exp',
      entityType: 'expense',
      status: 'pending',
      body: { amount: 50, currency: 'EUR', description: 'Test', category: 'Food', date: '2026-01-01', paidByUserId: 'user-1' },
    })
    await db.pendingActions.add({
      seq: 2,
      method: 'PUT',
      endpoint: '/vacations/vac-1/expenses/temp-exp',
      entityType: 'expense',
      status: 'pending',
      body: { description: 'Updated' },
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'real-exp', amountInBaseCurrency: 42, paidByUsername: 'Alice' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
      })
    vi.stubGlobal('fetch', fetchMock)

    await replayPendingActions()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const secondCallUrl: string = fetchMock.mock.calls[1][0]
    expect(secondCallUrl).toContain('real-exp')
    expect(secondCallUrl).not.toContain('temp-exp')

    expect(await db.pendingActions.count()).toBe(0)

    const expense = await db.expenses.get('real-exp')
    expect(expense?.amountInBaseCurrency).toBe(42)
  })

  it('network error stops loop, action stays pending', async () => {
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-1',
      entityType: 'vacation',
      status: 'pending',
      body: { name: 'V1' },
    })
    await db.pendingActions.add({
      seq: 2,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-2',
      entityType: 'vacation',
      status: 'pending',
      body: { name: 'V2' },
    })

    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await replayPendingActions()

    // stopped at first failure — only called once
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(2)
    expect(actions.every(a => a.status === 'pending')).toBe(true)
  })

  it('5xx stops loop without marking failed', async () => {
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-1',
      entityType: 'vacation',
      status: 'pending',
      body: { name: 'V1' },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }))

    await replayPendingActions()

    const action = (await db.pendingActions.toArray())[0]
    expect(action.status).toBe('pending')
  })

  it('4xx marks action failed and continues to next action', async () => {
    await db.pendingActions.add({
      seq: 1,
      method: 'PUT',
      endpoint: '/vacations/x',
      entityType: 'vacation',
      status: 'pending',
    })
    await db.pendingActions.add({
      seq: 2,
      method: 'DELETE',
      endpoint: '/vacations/y',
      entityType: 'vacation',
      status: 'pending',
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await replayPendingActions()

    const actions = await db.pendingActions.toArray()
    // First action marked failed, second deleted (success)
    expect(actions).toHaveLength(1)
    expect(actions[0].status).toBe('failed')
    expect(actions[0].endpoint).toBe('/vacations/x')
  })

  it('resets failed POST creation actions before each run', async () => {
    await db.vacations.put(makeVacation({ id: 'temp-x', name: 'Test X' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-x',
      entityType: 'vacation',
      status: 'failed',
      error: 'HTTP 503: previous error',
      body: { name: 'Test X' },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...makeVacation({ id: 'real-x', name: 'Test X' }) }),
    }))

    await replayPendingActions()

    // Fetch was called — the failed creation was retried
    const fetchMock = vi.getMockFn ? undefined : undefined
    expect(await db.vacations.get('real-x')).toBeDefined()
    expect(await db.vacations.get('temp-x')).toBeUndefined()
    expect(await db.pendingActions.count()).toBe(0)
  })
})
