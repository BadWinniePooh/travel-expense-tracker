export interface User {
  id: string
  username: string
  email: string
  role: 'Member' | 'Admin'
  createdAt: string
}

export interface Participant {
  userId: string
  username: string
  email: string
  splitWeight: number
}

export interface Vacation {
  id: string
  name: string
  description?: string
  baseCurrency: string
  startDate: string
  endDate: string
  createdBy: string
  creatorUsername: string
  createdAt: string
  participants: Participant[]
}

export interface Expense {
  id: string
  vacationId: string
  paidByUserId: string
  paidByUsername: string
  amount: number
  currency: string
  amountInBaseCurrency: number
  description: string
  category: string
  date: string
  createdAt: string
}

export interface ParticipantBalance {
  userId: string
  username: string
  totalPaid: number
  fairShare: number
  balance: number
}

export interface Transfer {
  fromUserId: string
  fromUsername: string
  toUserId: string
  toUsername: string
  amount: number
}

export interface Summary {
  totalExpenses: number
  baseCurrency: string
  balances: ParticipantBalance[]
  transfers: Transfer[]
}

// Returned by the service worker when a mutation is queued for offline sync
export interface QueuedResponse {
  queued: true
}

export type ExpenseCategory =
  | 'Accommodation'
  | 'Food'
  | 'Transport'
  | 'Activities'
  | 'Shopping'
  | 'Healthcare'
  | 'Other'
