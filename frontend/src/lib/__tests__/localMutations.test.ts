import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import type { Vacation, Expense } from '@/types'

// Mock replayPendingActions so it is always a no-op (prevents real fetch calls)
vi.mock('../syncEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../syncEngine')>()
  return {
    ...actual,
    replayPendingActions: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  createExpenseLocal,
  updateExpenseLocal,
  deleteExpenseLocal,
  deleteVacationLocal,
} from '../localMutations'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const testVacation: Vacation = {
  id: 'vac-1',
  name: 'Test Trip',
  baseCurrency: 'EUR',
  startDate: '2026-01-01',
  endDate: '2026-01-10',
  createdBy: 'user-1',
  creatorUsername: 'Alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  participants: [
    { userId: 'user-1', username: 'Alice', email: 'alice@test.com', splitWeight: 1 },
  ],
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
    description: 'Test expense',
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

  // Set navigator.onLine = false so enqueueMutation won't call replayPendingActions
  vi.stubGlobal('navigator', { onLine: false })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'token' ? 'fake-token' : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })

  // Seed a vacation for most tests
  await db.vacations.put(testVacation)
})

// ---------------------------------------------------------------------------
// createExpenseLocal
// ---------------------------------------------------------------------------

describe('createExpenseLocal', () => {
  it('stores expense in Dexie and queues POST', async () => {
    const expenseId = await createExpenseLocal(
      'vac-1',
      {
        paidByUserId: 'user-1',
        amount: 100,
        currency: 'JPY',
        description: 'test',
        category: 'Food',
        date: '2026-01-01',
      },
      testVacation
    )

    const expenses = await db.expenses.toArray()
    expect(expenses).toHaveLength(1)
    expect(expenses[0].amount).toBe(100)
    expect(expenses[0].currency).toBe('JPY')
    expect(expenses[0].id).toBe(expenseId)

    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(1)
    expect(actions[0].method).toBe('POST')
    expect(actions[0].entityType).toBe('expense')
    expect(actions[0].localId).toBe(expenseId)
  })
})

// ---------------------------------------------------------------------------
// updateExpenseLocal
// ---------------------------------------------------------------------------

describe('updateExpenseLocal', () => {
  it('when POST is pending, merges into POST body instead of queuing PUT', async () => {
    await db.expenses.put(makeExpense({ id: 'exp-temp' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations/vac-1/expenses',
      localId: 'exp-temp',
      entityType: 'expense',
      status: 'pending',
      body: { amount: 100, currency: 'JPY', description: 'old', category: 'Food', date: '2026-01-01', paidByUserId: 'user-1' },
    })

    await updateExpenseLocal('vac-1', 'exp-temp', { description: 'new' }, testVacation)

    const actions = await db.pendingActions.toArray()
    // No new action queued — still only the original POST
    expect(actions).toHaveLength(1)
    expect(actions[0].method).toBe('POST')
    expect((actions[0].body as Record<string, unknown>).description).toBe('new')

    const expense = await db.expenses.get('exp-temp')
    expect(expense?.description).toBe('new')
  })

  it('when no pending POST, queues PUT', async () => {
    await db.expenses.put(makeExpense({ id: 'real-exp' }))

    await updateExpenseLocal('vac-1', 'real-exp', { description: 'updated' }, testVacation)

    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(1)
    expect(actions[0].method).toBe('PUT')
    expect(actions[0].endpoint).toContain('real-exp')
  })
})

// ---------------------------------------------------------------------------
// deleteExpenseLocal
// ---------------------------------------------------------------------------

describe('deleteExpenseLocal', () => {
  it('when POST is pending, cancels POST and queues no DELETE', async () => {
    await db.expenses.put(makeExpense({ id: 'exp-temp' }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations/vac-1/expenses',
      localId: 'exp-temp',
      entityType: 'expense',
      status: 'pending',
    })

    await deleteExpenseLocal('vac-1', 'exp-temp')

    expect(await db.expenses.get('exp-temp')).toBeUndefined()
    expect(await db.pendingActions.count()).toBe(0)
  })

  it('when no pending POST, queues DELETE', async () => {
    await db.expenses.put(makeExpense({ id: 'real-exp' }))

    await deleteExpenseLocal('vac-1', 'real-exp')

    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(1)
    expect(actions[0].method).toBe('DELETE')
    expect(actions[0].endpoint).toContain('real-exp')
  })
})

// ---------------------------------------------------------------------------
// Split overrides
// ---------------------------------------------------------------------------

const twoParticipantVacation: Vacation = {
  ...testVacation,
  id: 'vac-2',
  participants: [
    { userId: 'user-1', username: 'Alice', email: 'alice@test.com', splitWeight: 0.6 },
    { userId: 'user-2', username: 'Bob', email: 'bob@test.com', splitWeight: 0.4 },
  ],
}

describe('split overrides', () => {
  beforeEach(async () => {
    await db.vacations.put(twoParticipantVacation)
  })

  it('createExpenseLocal without splits defaults to tracking the vacation split (no override stored)', async () => {
    const expenseId = await createExpenseLocal(
      'vac-2',
      { paidByUserId: 'user-1', amount: 100, currency: 'EUR', description: 'Dinner', category: 'Food', date: '2026-01-01' },
      twoParticipantVacation
    )
    const expense = await db.expenses.get(expenseId)
    expect(expense?.isSplitCustom).toBe(false)
    expect(expense?.splits).toEqual([])
  })

  it('createExpenseLocal with splits stores a pinned custom override', async () => {
    const expenseId = await createExpenseLocal(
      'vac-2',
      {
        paidByUserId: 'user-1', amount: 100, currency: 'EUR', description: 'Dinner', category: 'Food', date: '2026-01-01',
        splits: [{ userId: 'user-1', weight: 0.9 }, { userId: 'user-2', weight: 0.1 }],
      },
      twoParticipantVacation
    )
    const expense = await db.expenses.get(expenseId)
    expect(expense?.isSplitCustom).toBe(true)
    expect(expense?.splits).toEqual([
      { userId: 'user-1', weight: 0.9, username: 'Alice' },
      { userId: 'user-2', weight: 0.1, username: 'Bob' },
    ])

    const action = (await db.pendingActions.toArray())[0]
    expect((action.body as Record<string, unknown>).splits).toEqual([
      { userId: 'user-1', weight: 0.9 }, { userId: 'user-2', weight: 0.1 },
    ])
  })

  it('updateExpenseLocal sets a custom override on a previously-default expense', async () => {
    await db.expenses.put(makeExpense({ id: 'exp-1', vacationId: 'vac-2', isSplitCustom: false, splits: [] }))

    await updateExpenseLocal('vac-2', 'exp-1', {
      splits: [{ userId: 'user-1', weight: 0.9 }, { userId: 'user-2', weight: 0.1 }],
    }, twoParticipantVacation)

    const expense = await db.expenses.get('exp-1')
    expect(expense?.isSplitCustom).toBe(true)
    expect(expense?.splits).toEqual([
      { userId: 'user-1', weight: 0.9, username: 'Alice' },
      { userId: 'user-2', weight: 0.1, username: 'Bob' },
    ])
  })

  it('updateExpenseLocal with resetSplit reverts a custom override to default', async () => {
    await db.expenses.put(makeExpense({
      id: 'exp-1', vacationId: 'vac-2', isSplitCustom: true,
      splits: [{ userId: 'user-1', weight: 0.9, username: 'Alice' }, { userId: 'user-2', weight: 0.1, username: 'Bob' }],
    }))

    await updateExpenseLocal('vac-2', 'exp-1', { resetSplit: true }, twoParticipantVacation)

    const expense = await db.expenses.get('exp-1')
    expect(expense?.isSplitCustom).toBe(false)
    expect(expense?.splits).toEqual([])

    const action = (await db.pendingActions.toArray())[0]
    expect(action.method).toBe('PUT')
    expect((action.body as Record<string, unknown>).resetSplit).toBe(true)
  })

  it('merges a custom split into a still-pending creation POST instead of queuing a second action', async () => {
    await db.expenses.put(makeExpense({ id: 'exp-temp', vacationId: 'vac-2', isSplitCustom: false, splits: [] }))
    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations/vac-2/expenses',
      localId: 'exp-temp',
      entityType: 'expense',
      status: 'pending',
      body: { amount: 100, currency: 'EUR', description: 'Dinner', category: 'Food', date: '2026-01-01', paidByUserId: 'user-1' },
    })

    await updateExpenseLocal('vac-2', 'exp-temp', {
      splits: [{ userId: 'user-1', weight: 0.9 }, { userId: 'user-2', weight: 0.1 }],
    }, twoParticipantVacation)

    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(1)
    expect((actions[0].body as Record<string, unknown>).splits).toEqual([
      { userId: 'user-1', weight: 0.9 }, { userId: 'user-2', weight: 0.1 },
    ])

    const expense = await db.expenses.get('exp-temp')
    expect(expense?.isSplitCustom).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// deleteVacationLocal
// ---------------------------------------------------------------------------

describe('deleteVacationLocal', () => {
  it('when vacation POST is pending, cancels all related actions and queues no DELETE', async () => {
    await db.vacations.clear()
    await db.vacations.put({
      ...testVacation,
      id: 'vac-temp',
    })
    await db.expenses.put(makeExpense({ id: 'exp-temp', vacationId: 'vac-temp' }))

    await db.pendingActions.add({
      seq: 1,
      method: 'POST',
      endpoint: '/vacations',
      localId: 'vac-temp',
      entityType: 'vacation',
      status: 'pending',
      body: { name: 'Temp Vacation' },
    })
    await db.pendingActions.add({
      seq: 2,
      method: 'POST',
      endpoint: '/vacations/vac-temp/expenses',
      localId: 'exp-temp',
      entityType: 'expense',
      status: 'pending',
      body: { amount: 50 },
    })

    await deleteVacationLocal('vac-temp')

    expect(await db.vacations.get('vac-temp')).toBeUndefined()
    // No DELETE action should be queued — the vacation never existed on the server
    const actions = await db.pendingActions.toArray()
    expect(actions).toHaveLength(0)
  })
})
