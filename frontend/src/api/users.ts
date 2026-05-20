import apiClient from './client'
import type { User } from '../types'

export const getUsers = async (): Promise<User[]> => {
  const { data } = await apiClient.get<User[]>('/users')
  return data
}

export const createUser = async (payload: {
  username: string
  email: string
  password: string
  role: string
}): Promise<User> => {
  const { data } = await apiClient.post<User>('/users', payload)
  return data
}

export const updateUser = async (
  id: string,
  payload: { username?: string; email?: string; password?: string; role?: string }
): Promise<User> => {
  const { data } = await apiClient.put<User>(`/users/${id}`, payload)
  return data
}

export const deleteUser = async (id: string): Promise<void> => {
  await apiClient.delete(`/users/${id}`)
}
