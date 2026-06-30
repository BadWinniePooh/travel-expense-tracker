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

  it('returns zeroed balances and no transfers when there are no expenses', () => {
    const summary = computeSummary(vacation, [])
    expect(summary.totalExpenses).toBe(0)
    expect(summary.balances).toEqual([
      { userId: 'user-1', username: 'Alice', totalPaid: 0, fairShare: 0, balance: 0 },
      { userId: 'user-2', username: 'Bob', totalPaid: 0, fairShare: 0, balance: 0 },
    ])
    expect(summary.transfers).toEqual([])
  })

  it('ignores a custom split entry for a user who is no longer a participant', () => {
    const summary = computeSummary(vacation, [
      makeExpense({
        amountInBaseCurrency: 100,
        amount: 100,
        isSplitCustom: true,
        splits: [
          { userId: 'user-1', username: 'Alice', weight: 0.5 },
          { userId: 'user-removed', username: 'Removed', weight: 0.5 },
        ],
      }),
    ])
    const alice = summary.balances.find(b => b.userId === 'user-1')!
    const bob = summary.balances.find(b => b.userId === 'user-2')!
    // Only Alice's half is counted; Bob's fair share stays 0 since he's not in the split
    expect(alice.fairShare).toBe(50)
    expect(bob.fairShare).toBe(0)
  })

  it('produces no transfer when every balance nets to exactly zero', () => {
    const summary = computeSummary(vacation, [
      makeExpense({ id: 'exp-1', amountInBaseCurrency: 100, amount: 100, paidByUserId: 'user-1' }),
      makeExpense({ id: 'exp-2', amountInBaseCurrency: 100, amount: 100, paidByUserId: 'user-2', paidByUsername: 'Bob' }),
    ])
    expect(summary.balances.every(b => b.balance === 0)).toBe(true)
    expect(summary.transfers).toEqual([])
  })

  it('chains a single debtor across multiple creditors (greedy settlement)', () => {
    const threeWay: Vacation = {
      ...vacation,
      participants: [
        { userId: 'user-1', username: 'Alice', email: 'a@test.com', splitWeight: 1 / 3 },
        { userId: 'user-2', username: 'Bob', email: 'b@test.com', splitWeight: 1 / 3 },
        { userId: 'user-3', username: 'Carl', email: 'c@test.com', splitWeight: 1 / 3 },
      ],
    }
    const summary = computeSummary(threeWay, [
      makeExpense({ id: 'exp-1', amountInBaseCurrency: 150, amount: 150, paidByUserId: 'user-1', paidByUsername: 'Alice' }),
      makeExpense({ id: 'exp-2', amountInBaseCurrency: 150, amount: 150, paidByUserId: 'user-3', paidByUsername: 'Carl' }),
    ])

    // Alice +50, Bob -100, Carl +50 — Bob (the lone debtor) settles with both creditors
    const bobTransfers = summary.transfers.filter(t => t.fromUserId === 'user-2')
    expect(bobTransfers).toHaveLength(2)
    expect(bobTransfers.reduce((s, t) => s + t.amount, 0)).toBe(100)
    expect(new Set(bobTransfers.map(t => t.toUserId))).toEqual(new Set(['user-1', 'user-3']))
  })

  it('rounds totals and fair shares to 2 decimal places', () => {
    const summary = computeSummary(vacation, [
      makeExpense({ amountInBaseCurrency: 100.005, amount: 100.005 }),
    ])
    const alice = summary.balances.find(b => b.userId === 'user-1')!
    expect(Number.isInteger(alice.fairShare * 100)).toBe(true)
    expect(Number.isInteger(summary.totalExpenses * 100)).toBe(true)
  })
})
