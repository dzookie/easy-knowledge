import { http } from '@/utils/http'

export interface ApiKeyRow {
  id: string
  key: string
  name: string
  kbId: string
  kbName: string
  status: number
  callCount: number
  tokenCount: number
  dailyLimit: number
  expiresAt: string | null
  createdAt: string
}

export const serviceApis = {
  listApiKeys: (kbId?: string) =>
    http.get<ApiKeyRow[]>('/api/service-key', { params: kbId ? { kbId } : undefined }),
  createApiKey: (data: { name: string; kbId: string; dailyLimit?: number }) =>
    http.post<ApiKeyRow>('/api/service-key', data),
  deleteApiKey: (id: string) => http.delete(`/api/service-key/${id}`),
  toggleApiKey: (id: string) => http.patch<{ id: string; status: number }>(`/api/service-key/${id}/toggle`),
}
