import { db } from './db'
import { enqueueMutation } from './syncEngine'
import type { Vacation, Expense, User } from '@/types'

// ── Vacations ──────────────────────────────────────────────────────────────────

export async function createVacationLocal(
  data: { name: string; description?: string; baseCurrency: string; startDate: string; endDate: string },
  currentUser: User
): Promise<string> {
  const id = crypto.randomUUID()
  await db.vacations.put({
    id,
    name: data.name,
    description: data.description,
    baseCurrency: data.baseCurrency,
    startDate: data.startDate,
    endDate: data.endDate,
    createdBy: currentUser.id,
    creatorUsername: currentUser.username,
    createdAt: new Date().toISOString(),
    participants: [{ userId: currentUser.id, username: currentUser.username, email: currentUser.email, splitWeight: 1.0 }],
  })
  await enqueueMutation({ method: 'POST', endpoint: '/vacations', body: data as Record<string, unknown>, localId: id, entityType: 'vacation' })
  return id
}

export async function deleteVacationLocal(vacationId: string): Promise<void> {
  await db.vacations.delete(vacationId)
  await db.expenses.where('vacationId').equals(vacationId).delete()
  await db.summaries.delete(vacationId)
  await enqueueMutation({ method: 'DELETE', endpoint: `/vacations/${vacationId}`, entityType: 'vacation' })
}

// ── Expenses ───────────────────────────────────────────────────────────────────

export async function createExpenseLocal(
  vacationId: string,
  data: { paidByUserId: string; amount: number; currency: string; description: string; category: string; date: string },
  vacation: Vacation
): Promise<string> {
  const id = crypto.randomUUID()
  const participant = vacation.participants.find(p => p.userId === data.paidByUserId)
  // amountInBaseCurrency is approximate until the server recalculates exchange rates on sync
  const amountInBaseCurrency = data.currency === vacation.baseCurrency ? data.amount : data.amount
  await db.expenses.put({
    id,
    vacationId,
    paidByUserId: data.paidByUserId,
    paidByUsername: participant?.username ?? '',
    amount: data.amount,
    currency: data.currency,
    amountInBaseCurrency,
    description: data.description,
    category: data.category,
    date: data.date,
    createdAt: new Date().toISOString(),
  } as Expense)
  await enqueueMutation({ method: 'POST', endpoint: `/vacations/${vacationId}/expenses`, body: data as Record<string, unknown>, localId: id, entityType: 'expense' })
  return id
}

export async function updateExpenseLocal(
  vacationId: string,
  expenseId: string,
  data: { paidByUserId?: string; amount?: number; currency?: string; description?: string; category?: string; date?: string },
  vacation: Vacation
): Promise<void> {
  const existing = await db.expenses.get(expenseId)
  if (!existing) return
  const updates: Partial<Expense> = { ...data }
  if (data.paidByUserId) {
    updates.paidByUsername = vacation.participants.find(p => p.userId === data.paidByUserId)?.username ?? existing.paidByUsername
  }
  const newAmount = data.amount ?? existing.amount
  const newCurrency = data.currency ?? existing.currency
  updates.amountInBaseCurrency = newCurrency === vacation.baseCurrency ? newAmount : newAmount
  await db.expenses.update(expenseId, updates)
  await enqueueMutation({ method: 'PUT', endpoint: `/vacations/${vacationId}/expenses/${expenseId}`, body: data as Record<string, unknown>, entityType: 'expense' })
}

export async function deleteExpenseLocal(vacationId: string, expenseId: string): Promise<void> {
  await db.expenses.delete(expenseId)
  await enqueueMutation({ method: 'DELETE', endpoint: `/vacations/${vacationId}/expenses/${expenseId}`, entityType: 'expense' })
}

// ── Participants ───────────────────────────────────────────────────────────────

export async function addParticipantLocal(
  vacationId: string,
  payload: { userId: string; splitWeight: number },
  userInfo: Pick<User, 'id' | 'username' | 'email'>
): Promise<void> {
  const vacation = await db.vacations.get(vacationId)
  if (!vacation) return
  await db.vacations.update(vacationId, {
    participants: [...vacation.participants, { userId: payload.userId, username: userInfo.username, email: userInfo.email, splitWeight: payload.splitWeight }],
  })
  await enqueueMutation({ method: 'POST', endpoint: `/vacations/${vacationId}/participants`, body: payload as unknown as Record<string, unknown>, entityType: 'participant' })
}

export async function updateParticipantLocal(vacationId: string, userId: string, splitWeight: number): Promise<void> {
  const vacation = await db.vacations.get(vacationId)
  if (!vacation) return
  await db.vacations.update(vacationId, {
    participants: vacation.participants.map(p => p.userId === userId ? { ...p, splitWeight } : p),
  })
  await enqueueMutation({ method: 'PUT', endpoint: `/vacations/${vacationId}/participants/${userId}`, body: { splitWeight }, entityType: 'participant' })
}

export async function removeParticipantLocal(vacationId: string, userId: string): Promise<void> {
  const vacation = await db.vacations.get(vacationId)
  if (!vacation) return
  await db.vacations.update(vacationId, {
    participants: vacation.participants.filter(p => p.userId !== userId),
  })
  await enqueueMutation({ method: 'DELETE', endpoint: `/vacations/${vacationId}/participants/${userId}`, entityType: 'participant' })
}
