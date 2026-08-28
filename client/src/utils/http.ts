/**
 * HTTP 客户端 — 基于 fetch 的轻量封装
 * - 自动携带 Authorization Bearer token
 * - 统一错误处理
 * - 自动 JSON 解析
 */
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

export interface ApiResponse<T = unknown> {
  data: T
  message?: string
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  // 自动携带 token
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  }

  const response = await fetch(url, { ...options, headers })

  // 401: token 失效, 清除登录态
  if (response.status === 401) {
    auth.logout(true)
    ElMessage.error('登录已过期,请重新登录')
    throw new HttpError(401, '登录已过期')
  }

  // 非 2xx: 尝试解析错误消息
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const errorBody = await response.json()
      message = errorBody.message || message
    } catch {
      // 非 JSON 错误体
    }
    throw new HttpError(response.status, message)
  }

  return response.json() as Promise<T>
}

export const http = {
  get: <T = unknown>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = unknown>(url: string) =>
    request<T>(url, { method: 'DELETE' }),
}
