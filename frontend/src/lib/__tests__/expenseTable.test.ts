import { describe, it, expect } from 'vitest'
import { sortExpenses, filterExpenses } from '../expenseTable'
import type { Expense } from '@/types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    vacationId: 'vac-1',
    paidByUserId: 'user-1',
    paidByUsername: 'Alice',
    amount: 50,
    currency: 'EUR',
    amountInBaseCurrency: 50,
    description: 'Dinner',
    category: 'Food',
    date: '2026-01-01',
    createdAt: new Date().toISOString(),
    isSplitCustom: false,
    splits: [],
    ...overrides,
  }
}

describe('sortExpenses', () => {
  const a = makeExpense({ id: 'a', date: '2026-01-02', description: 'Zoo', category: 'Activities', paidByUsername: 'Bob', amount: 30, amountInBaseCurrency: 30 })
  const b = makeExpense({ id: 'b', date: '2026-01-01', description: 'Apple', category: 'Food', paidByUsername: 'Alice', amount: 10, amountInBaseCurrency: 10 })
  const c = makeExpense({ id: 'c', date: '2026-01-03', description: 'Mall', category: 'Shopping', paidByUsername: 'Carl', amount: 20, amountInBaseCurrency: 20 })
  const list = [a, b, c]

  it('does not mutate the input array', () => {
    const copy = [...list]
    sortExpenses(list, 'date', 'asc')
    expect(list).toEqual(copy)
  })

  it('sorts by date ascending and descending', () => {
    expect(sortExpenses(list, 'date', 'asc').map(e => e.id)).toEqual(['b', 'a', 'c'])
    expect(sortExpenses(list, 'date', 'desc').map(e => e.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by description', () => {
    expect(sortExpenses(list, 'description', 'asc').map(e => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by category', () => {
    expect(sortExpenses(list, 'category', 'asc').map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by paidBy', () => {
    expect(sortExpenses(list, 'paidBy', 'asc').map(e => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by amount', () => {
    expect(sortExpenses(list, 'amount', 'asc').map(e => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by amountBase', () => {
    expect(sortExpenses(list, 'amountBase', 'asc').map(e => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('filterExpenses', () => {
  const food = makeExpense({ id: 'food', category: 'Food', paidByUserId: 'user-1', description: 'Pizza night' })
  const transport = makeExpense({ id: 'transport', category: 'Transport', paidByUserId: 'user-2', description: 'Taxi ride' })

  it('returns all expenses when filters are unset', () => {
    expect(filterExpenses([food, transport], { search: '', category: 'all', paidByUserId: 'all' })).toEqual([food, transport])
  })

  it('filters by category', () => {
    expect(filterExpenses([food, transport], { search: '', category: 'Food', paidByUserId: 'all' })).toEqual([food])
  })

  it('filters by paidByUserId', () => {
    expect(filterExpenses([food, transport], { search: '', category: 'all', paidByUserId: 'user-2' })).toEqual([transport])
  })

  it('filters by case-insensitive description search', () => {
    expect(filterExpenses([food, transport], { search: 'PIZZA', category: 'all', paidByUserId: 'all' })).toEqual([food])
  })

  it('combines filters with AND semantics', () => {
    expect(filterExpenses([food, transport], { search: 'taxi', category: 'Food', paidByUserId: 'all' })).toEqual([])
  })

  it('returns empty array when nothing matches', () => {
    expect(filterExpenses([food, transport], { search: 'nonexistent', category: 'all', paidByUserId: 'all' })).toEqual([])
  })
})
