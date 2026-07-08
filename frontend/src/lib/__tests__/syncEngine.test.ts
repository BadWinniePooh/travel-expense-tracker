import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { replayPendingActions, seedFromServer, enqueueMutation } from '../syncEngine'
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
    isSplitCustom: false,
    splits: [],
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

  it('resolving a temp vacation ID moves its expenses to the real vacation ID', async () => {
    await db.vacations.put(makeVacation({ id: 'temp-vac', name: 'Test' }))
    await db.expenses.put(makeExpense({ id: 'exp-1', vacationId: 'temp-vac' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-vac',
      entityType: 'vacation',
      status: 'pending',
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...makeVacation({ id: 'real-vac', name: 'Test' }) }),
    }))

    await replayPendingActions()

    const expense = await db.expenses.get('exp-1')
    expect(expense?.vacationId).toBe('real-vac')
  })

  it('rewrites a temp ID embedded in a later pending action body', async () => {
    await db.vacations.put(makeVacation({ id: 'temp-vac', name: 'Test' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'temp-vac',
      entityType: 'vacation',
      status: 'pending',
    })
    await db.pendingActions.add({
      seq: 2,
      method: 'POST',
      endpoint: '/vacations/temp-vac/expenses',
      entityType: 'expense',
      status: 'pending',
      body: { vacationId: 'temp-vac', amount: 10 },
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ...makeVacation({ id: 'real-vac', name: 'Test' }) }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' })
    vi.stubGlobal('fetch', fetchMock)

    await replayPendingActions()

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondCallBody.vacationId).toBe('real-vac')
  })

  it('clears the session and redirects to /login on a 401 response', async () => {
    await db.pendingActions.add({
      seq: 1,
      method: 'PUT',
      endpoint: '/vacations/x',
      entityType: 'vacation',
      status: 'pending',
    })

    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'token' ? 'fake-token' : null),
      setItem: vi.fn(),
      removeItem,
      clear: vi.fn(),
    })
    vi.stubGlobal('location', { pathname: '/vacations/x', href: '' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))

    await replayPendingActions()

    expect(removeItem).toHaveBeenCalledWith('token')
    expect(removeItem).toHaveBeenCalledWith('user')
    expect(window.location.href).toContain('/login')
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

    expect(await db.vacations.get('real-x')).toBeDefined()
    expect(await db.vacations.get('temp-x')).toBeUndefined()
    expect(await db.pendingActions.count()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// seedFromServer
// ---------------------------------------------------------------------------

function mockApiByUrl(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [path, body] of Object.entries(handlers)) {
      if (url.endsWith(path)) {
        if (body instanceof Error) throw body
        return { ok: true, status: 200, text: async () => JSON.stringify(body) }
      }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

describe('seedFromServer', () => {
  it('seeds vacations, expenses, and summary from the server', async () => {
    const serverVacation = makeVacation({ id: 'vac-server' })
    const serverExpense = makeExpense({ id: 'exp-server', vacationId: 'vac-server' })
    const summary = { totalExpenses: 50, baseCurrency: 'EUR', balances: [], transfers: [] }

    vi.stubGlobal('fetch', mockApiByUrl({
      '/vacations': [serverVacation],
      '/vacations/vac-server/expenses': [serverExpense],
      '/vacations/vac-server/summary': summary,
    }))

    await seedFromServer()

    expect(await db.vacations.get('vac-server')).toEqual(serverVacation)
    expect(await db.expenses.get('exp-server')).toEqual(serverExpense)
    const cached = await db.summaries.get('vac-server')
    expect(cached?.data).toEqual(summary)
  })

  it('does not overwrite a vacation that has a pending local POST (not yet on server)', async () => {
    await db.vacations.put(makeVacation({ id: 'local-only', name: 'Local Draft' }))
    await db.pendingActions.add({
      seq: 1, method: 'POST', endpoint: '/vacations', localId: 'local-only',
      entityType: 'vacation', status: 'pending', body: { name: 'Local Draft' },
    })

    vi.stubGlobal('fetch', mockApiByUrl({ '/vacations': [] }))

    await seedFromServer()

    const vacation = await db.vacations.get('local-only')
    expect(vacation?.name).toBe('Local Draft')
  })

  it('removes a locally-cached vacation that was deleted on the server', async () => {
    await db.vacations.put(makeVacation({ id: 'deleted-vac' }))

    vi.stubGlobal('fetch', mockApiByUrl({ '/vacations': [] }))

    await seedFromServer()

    expect(await db.vacations.get('deleted-vac')).toBeUndefined()
  })

  it('removes a locally-cached expense that was deleted on the server, but protects pending-create expenses', async () => {
    const serverVacation = makeVacation({ id: 'vac-1' })
    await db.expenses.put(makeExpense({ id: 'stale-exp', vacationId: 'vac-1' }))
    await db.expenses.put(makeExpense({ id: 'pending-exp', vacationId: 'vac-1' }))
    await db.pendingActions.add({
      seq: 1, method: 'POST', endpoint: '/vacations/vac-1/expenses', localId: 'pending-exp',
      entityType: 'expense', status: 'pending', body: {},
    })

    vi.stubGlobal('fetch', mockApiByUrl({
      '/vacations': [serverVacation],
      '/vacations/vac-1/expenses': [],
      '/vacations/vac-1/summary': { totalExpenses: 0, baseCurrency: 'EUR', balances: [], transfers: [] },
    }))

    await seedFromServer()

    expect(await db.expenses.get('stale-exp')).toBeUndefined()
    expect(await db.expenses.get('pending-exp')).toBeDefined()
  })

  it('continues seeding other vacations when one vacation fetch fails', async () => {
    const v1 = makeVacation({ id: 'vac-fails' })
    const v2 = makeVacation({ id: 'vac-ok' })
    vi.stubGlobal('fetch', mockApiByUrl({
      '/vacations': [v1, v2],
      '/vacations/vac-fails/expenses': new Error('boom'),
      '/vacations/vac-ok/expenses': [],
      '/vacations/vac-ok/summary': { totalExpenses: 0, baseCurrency: 'EUR', balances: [], transfers: [] },
    }))

    await seedFromServer()

    expect(await db.summaries.get('vac-fails')).toBeUndefined()
    expect(await db.summaries.get('vac-ok')).toBeDefined()
  })

  it('silently no-ops when the top-level vacations fetch fails (offline)', async () => {
    await db.vacations.put(makeVacation({ id: 'existing' }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(seedFromServer()).resolves.toBeUndefined()
    expect(await db.vacations.get('existing')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// enqueueMutation
// ---------------------------------------------------------------------------

describe('enqueueMutation', () => {
  it('replays immediately when online', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' }))

    await enqueueMutation({ method: 'DELETE', endpoint: '/vacations/vac-1', entityType: 'vacation' })

    expect(await db.pendingActions.count()).toBe(0)
  })

  it('does not replay when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await enqueueMutation({ method: 'DELETE', endpoint: '/vacations/vac-1', entityType: 'vacation' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await db.pendingActions.count()).toBe(1)
  })
})
