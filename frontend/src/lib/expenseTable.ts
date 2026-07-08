import type { Expense } from '@/types'

export type ExpenseSortField = 'date' | 'description' | 'category' | 'paidBy' | 'amount' | 'amountBase'

export const SORT_COLUMNS: { field: ExpenseSortField; label: string }[] = [
  { field: 'date', label: 'Date' },
  { field: 'description', label: 'Description' },
  { field: 'category', label: 'Category' },
  { field: 'paidBy', label: 'Paid By' },
  { field: 'amount', label: 'Amount' },
  { field: 'amountBase', label: 'In Base Currency' },
]

// Display-only ordering — never mutates `list` and never feeds into summary calculations.
export function sortExpenses(list: Expense[], field: ExpenseSortField, dir: 'asc' | 'desc'): Expense[] {
  const sorted = [...list].sort((a, b) => {
    switch (field) {
      case 'date':
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'description':
        return a.description.localeCompare(b.description)
      case 'category':
        return a.category.localeCompare(b.category)
      case 'paidBy':
        return a.paidByUsername.localeCompare(b.paidByUsername)
      case 'amount':
        return a.amount - b.amount
      case 'amountBase':
        return a.amountInBaseCurrency - b.amountInBaseCurrency
    }
  })
  return dir === 'asc' ? sorted : sorted.reverse()
}

export interface ExpenseFilters {
  search: string
  category: string | 'all'
  paidByUserId: string | 'all'
}

// Display-only filtering — case-insensitive description substring match plus
// exact category/payer matches. Never touches the underlying expenses list.
export function filterExpenses(list: Expense[], filters: ExpenseFilters): Expense[] {
  const query = filters.search.trim().toLowerCase()
  return list.filter((e) => {
    if (filters.category !== 'all' && e.category !== filters.category) return false
    if (filters.paidByUserId !== 'all' && e.paidByUserId !== filters.paidByUserId) return false
    if (query && !e.description.toLowerCase().includes(query)) return false
    return true
  })
}
