import apiClient from './client'
import type { Vacation, Expense, Summary, QueuedResponse } from '../types'

export const getVacations = async (): Promise<Vacation[]> => {
  const { data } = await apiClient.get<Vacation[]>('/vacations')
  return data
}

export const getVacation = async (id: string): Promise<Vacation> => {
  const { data } = await apiClient.get<Vacation>(`/vacations/${id}`)
  return data
}

export const createVacation = async (payload: {
  name: string
  description?: string
  baseCurrency: string
  startDate: string
  endDate: string
}): Promise<Vacation> => {
  const { data } = await apiClient.post<Vacation>('/vacations', payload)
  return data
}

export const updateVacation = async (
  id: string,
  payload: {
    name?: string
    description?: string
    baseCurrency?: string
    startDate?: string
    endDate?: string
  }
): Promise<Vacation> => {
  const { data } = await apiClient.put<Vacation>(`/vacations/${id}`, payload)
  return data
}

export const deleteVacation = async (id: string): Promise<void> => {
  await apiClient.delete(`/vacations/${id}`)
}

// Participants
export const addParticipant = async (
  vacationId: string,
  payload: { userId: string; splitWeight: number }
): Promise<QueuedResponse | void> => {
  const { data } = await apiClient.post<QueuedResponse | undefined>(`/vacations/${vacationId}/participants`, payload)
  return data
}

export const updateParticipant = async (
  vacationId: string,
  userId: string,
  payload: { splitWeight: number }
): Promise<QueuedResponse | void> => {
  const { data } = await apiClient.put<QueuedResponse | undefined>(`/vacations/${vacationId}/participants/${userId}`, payload)
  return data
}

export const removeParticipant = async (vacationId: string, userId: string): Promise<QueuedResponse | void> => {
  const { data } = await apiClient.delete<QueuedResponse | undefined>(`/vacations/${vacationId}/participants/${userId}`)
  return data
}

// Expenses
export const getExpenses = async (vacationId: string): Promise<Expense[]> => {
  const { data } = await apiClient.get<Expense[]>(`/vacations/${vacationId}/expenses`)
  return data
}

export const createExpense = async (
  vacationId: string,
  payload: {
    paidByUserId: string
    amount: number
    currency: string
    description: string
    category: string
    date: string
  }
): Promise<Expense | QueuedResponse> => {
  const { data } = await apiClient.post<Expense | QueuedResponse>(`/vacations/${vacationId}/expenses`, payload)
  return data
}

export const updateExpense = async (
  vacationId: string,
  expenseId: string,
  payload: {
    paidByUserId?: string
    amount?: number
    currency?: string
    description?: string
    category?: string
    date?: string
  }
): Promise<Expense | QueuedResponse> => {
  const { data } = await apiClient.put<Expense | QueuedResponse>(
    `/vacations/${vacationId}/expenses/${expenseId}`,
    payload
  )
  return data
}

export const deleteExpense = async (vacationId: string, expenseId: string): Promise<QueuedResponse | void> => {
  const { data } = await apiClient.delete<QueuedResponse | undefined>(`/vacations/${vacationId}/expenses/${expenseId}`)
  return data
}

export const getSummary = async (vacationId: string): Promise<Summary> => {
  const { data } = await apiClient.get<Summary>(`/vacations/${vacationId}/summary`)
  return data
}
