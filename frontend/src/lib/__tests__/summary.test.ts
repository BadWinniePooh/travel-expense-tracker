import { describe, it, expect } from 'vitest'
import { computeSummary } from '../summary'
import type { Vacation, Expense } from '@/types'

const vacation: Vacation = {
  id: 'vac-1',
  name: 'Test Trip',
  baseCurrency: 'EUR',
  startDate: '2026-01-01',
  endDate: '2026-01-10',
  createdBy: 'user-1',
  creatorUsername: 'Alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  participants: [
    { userId: 'user-1', username: 'Alice', email: 'alice@test.com', splitWeight: 0.5 },
    { userId: 'user-2', username: 'Bob', email: 'bob@test.com', splitWeight: 0.5 },
  ],
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    vacationId: 'vac-1',
    paidByUserId: 'user-1',
    paidByUsername: 'Alice',
    amount: 100,
    currency: 'EUR',
    amountInBaseCurrency: 100,
    description: 'Dinner',
    category: 'Food',
    date: '2026-01-01',
    createdAt: new Date().toISOString(),
    isSplitCustom: false,
    splits: [],
    ...overrides,
  }
}

describe('computeSummary', () => {
  it('splits evenly by default vacation weights and produces a settling transfer', () => {
    const summary = computeSummary(vacation, [makeExpense({ amountInBaseCurrency: 100, amount: 100 })])

    expect(summary.totalExpenses).toBe(100)
    const alice = summary.balances.find(b => b.userId === 'user-1')!
    const bob = summary.balances.find(b => b.userId === 'user-2')!
    expect(alice.totalPaid).toBe(100)
    expect(alice.fairShare).toBe(50)
    expect(alice.balance).toBe(50)
    expect(bob.totalPaid).toBe(0)
    expect(bob.fairShare).toBe(50)
    expect(bob.balance).toBe(-50)

    expect(summary.transfers).toEqual([
      { fromUserId: 'user-2', fromUsername: 'Bob', toUserId: 'user-1', toUsername: 'Alice', amount: 50 },
    ])
  })

  it('uses a pinned custom split instead of the live vacation weights', () => {
    const summary = computeSummary(vacation, [
      makeExpense({
        amountInBaseCurrency: 100,
        amount: 100,
        isSplitCustom: true,
        splits: [
          { userId: 'user-1', username: 'Alice', weight: 0.9 },
          { userId: 'user-2', username: 'Bob', weight: 0.1 },
        ],
      }),
    ])

    const bob = summary.balances.find(b => b.userId === 'user-2')!
    expect(bob.fairShare).toBe(10)
  })

  it('counts each expense exactly once across multiple expenses', () => {
    const summary = computeSummary(vacation, [
      makeExpense({ id: 'exp-1', amountInBaseCurrency: 40, amount: 40 }),
      makeExpense({ id: 'exp-2', amountInBaseCurrency: 60, amount: 60, paidByUserId: 'user-2', paidByUsername: 'Bob' }),
    ])

    expect(summary.totalExpenses).toBe(100)
    const alice = summary.balances.find(b => b.userId === 'user-1')!
    const bob = summary.balances.find(b => b.userId === 'user-2')!
    expect(alice.fairShare).toBe(50)
    expect(bob.fairShare).toBe(50)
    expect(alice.totalPaid).toBe(40)
    expect(bob.totalPaid).toBe(60)
  })
})
