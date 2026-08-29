/**
 * HTTP 客户端 — 基于 fetch 的轻量封装
 * - 自动携带 Authorization Bearer token
 * - 适配后端统一响应格式 { code, message, data }
 * - 401 自动登出
 */
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number        // 200=成功, 其他=错误
  message: string
  data: T | null
}

export class HttpError extends Error {
  constructor(
    public code: number,
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

  // 解析响应体(后端始终返回 { code, message, data })
  let body: ApiResponse<T>
  try {
    body = await response.json() as ApiResponse<T>
  } catch {
    throw new HttpError(500, '响应解析失败')
  }

  // 401: token 失效, 清除登录态
  if (body.code === 401 || response.status === 401) {
    auth.logout(true)
    ElMessage.error(body.message || '登录已过期,请重新登录')
    throw new HttpError(401, body.message || '登录已过期')
  }

  // 非 200: 业务错误
  if (body.code !== 200) {
    ElMessage.error(body.message)
    throw new HttpError(body.code, body.message)
  }

  // 成功: 取出 data 返回
  return body.data as T
}

export const http = {
  get: <T = unknown>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(url: string) =>
    request<T>(url, { method: 'DELETE' }),
}
