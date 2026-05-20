import apiClient from './client'
import type { User } from '../types'

export interface LoginResponse {
  token: string
  username: string
  email: string
  role: string
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { username, password })
  return data
}

export const getMe = async (): Promise<User> => {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}
