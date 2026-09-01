/**
 * 认证相关 API 路径
 */
import { http } from '@/utils/http'
import type { UserInfo } from '@/types/auth'

export const authApis = {
  login: (payload: { username: string; password: string }) =>
    http.post<{ token: string }>('/api/auth/login', payload),

  register: (payload: { username: string; password: string; nickname?: string }) =>
    http.post('/api/auth/register', payload),

  getCurrentUserDetail: () =>
    http.get<UserInfo>('/api/auth/current-user-detail'),
}