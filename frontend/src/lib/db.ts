import Dexie, { type Table } from 'dexie'
import type { Vacation, Expense, Summary } from '@/types'

export interface PendingAction {
  id?: number            // auto-increment primary key
  seq: number            // Date.now() at creation — used for replay ordering
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  endpoint: string       // e.g. '/vacations/abc/expenses'
  body?: Record<string, unknown>
  localId?: string       // temp UUID assigned to a locally-created entity
  entityType: 'vacation' | 'expense' | 'participant'
  status: 'pending' | 'failed'
  error?: string
}

export interface CachedSummary {
  vacationId: string   // primary key
  data: Summary
  cachedAt: number
}

class AppDB extends Dexie {
  vacations!: Table<Vacation, string>
  expenses!: Table<Expense, string>
  summaries!: Table<CachedSummary, string>
  pendingActions!: Table<PendingAction, number>

  constructor() {
    super('TravelExpenseTracker')
    this.version(1).stores({
      vacations: 'id',
      expenses: 'id, vacationId',
      summaries: 'vacationId',
      pendingActions: '++id, seq, status',
    })
  }
}

export const db = new AppDB()
