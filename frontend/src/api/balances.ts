import apiClient from './client'
import type { Balances, Repayment } from '../types'

export const getBalances = async (): Promise<Balances> => {
  const { data } = await apiClient.get<Balances>('/balances')
  return data
}

export const createRepayment = async (payload: {
  fromUserId: string
  toUserId: string
  amount: number
  note?: string
  date?: string
}): Promise<Repayment> => {
  const { data } = await apiClient.post<Repayment>('/balances/repayments', payload)
  return data
}

export const deleteRepayment = async (id: string): Promise<void> => {
  await apiClient.delete(`/balances/repayments/${id}`)
}
