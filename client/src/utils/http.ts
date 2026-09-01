/**
 * HTTP 客户端 — 基于 axios 的封装
 * - 自动携带 Authorization Bearer token
 * - 适配后端统一响应格式 { code, message, data }
 * - 401 自动登出
 *
 * 注意: ApiResponse / RequestOptions / PostFormOptions 类型定义已移至 @/types/api.ts
 *       此处 re-export 保持向后兼容 (已有大量文件从 @/utils/http 导入这些类型)
 */
import axios, {
  type AxiosResponse,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type Method,
} from 'axios'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import type { ApiResponse, RequestOptions, PostFormOptions } from '@/types'
export type { ApiResponse, RequestOptions, PostFormOptions }

export class HttpError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
  }
}

/** axios 实例
 *  - 不设 baseURL: 调用方传 /api/... 走 Vite proxy
 *  - 不设 timeout: 上传大文件不应被前端超时打断 (后端 multer 已限单文件 150MB)
 */
const axiosInstance: AxiosInstance = axios.create({
  // 兼容原 RequestOptions.params 的处理方式:
  //   - undefined / null 跳过
  //   - 数组 join(',') (后端按逗号分隔接收)
  //   - 空串跳过, 避免后端收到 kbId=&... 被当成空值
  paramsSerializer: {
    serialize: (params: Record<string, any>) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue
        const s = Array.isArray(v) ? v.join(',') : String(v)
        if (s === '') continue
        qs.append(k, s)
      }
      return qs.toString()
    },
  },
})

/** 请求拦截: 注入 token + 防御性清理 FormData 的 Content-Type */
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  // FormData 必须让浏览器自动加 boundary, axios 检测到 FormData 已会自动处理,
  // 这里清掉调用方误传的 Content-Type 避免破坏 boundary
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type')
  }
  return config
})

/** 响应拦截: 解包 { code, message, data } 并统一错误处理
 *  返回 body.data -> 调用方拿到的就是业务数据, 不再包 AxiosResponse
 */
axiosInstance.interceptors.response.use(
  // HTTP 2xx 进入成功分支
  (response) => {
    const body = response.data as ApiResponse
    // 401: token 失效, 清除登录态
    if (body.code === 401) {
      const auth = useAuthStore()
      auth.logout(true)
      ElMessage.error(body.message || '登录已过期,请重新登录')
      throw new HttpError(401, body.message || '登录已过期')
    }
    // 非 200: 业务错误
    if (body.code !== 200) {
      ElMessage.error(body.message)
      throw new HttpError(body.code, body.message)
    }
    // 成功: 直接返回 data, 让调用方拿到业务数据 (拦截器返回值会被 axios 当成 AxiosResponse,
    // 但运行时实际就是 body.data, 类型层做一次断言绕过)
    return body.data as unknown as AxiosResponse
  },
  // HTTP 4xx/5xx 进入错误分支
  (error) => {
    // 401: 后端可能直接以 HTTP 401 返回 (例如 token 完全无效)
    if (error.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout(true)
      const msg = error.response.data?.message || '登录已过期,请重新登录'
      ElMessage.error(msg)
      throw new HttpError(401, msg)
    }
    // 后端业务错误以 HTTP 4xx 返回时, body 里仍带 code/message
    const body = error.response?.data as ApiResponse | undefined
    if (body && typeof body.code === 'number') {
      ElMessage.error(body.message || '请求失败')
      throw new HttpError(body.code, body.message || '请求失败')
    }
    // 网络错误 / 超时 / 后端未启动
    const msg = error.code === 'ECONNABORTED'
      ? '请求超时'
      : error.message?.includes('Network Error')
        ? '网络异常 (请检查后端是否启动)'
        : `HTTP ${error.response?.status ?? 0} 请求失败`
    ElMessage.error(msg)
    throw new HttpError(error.response?.status ?? 0, msg)
  },
)

/** RequestOptions -> axios config 映射 */
function toAxiosConfig(opts: RequestOptions): AxiosRequestConfig {
  return {
    method: (opts.method || 'GET') as Method,
    headers: opts.headers,
    params: opts.params,
    data: opts.body,
  }
}

export const http = {
  get: <T = unknown>(url: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    axiosInstance.request<T, T>({ url, ...toAxiosConfig(opts), method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    axiosInstance.request<T, T>({ url, ...toAxiosConfig(opts), method: 'POST', data: body }),
  put: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    axiosInstance.request<T, T>({ url, ...toAxiosConfig(opts), method: 'PUT', data: body }),
  patch: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    axiosInstance.request<T, T>({ url, ...toAxiosConfig(opts), method: 'PATCH', data: body }),
  delete: <T = unknown>(url: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    axiosInstance.request<T, T>({ url, ...toAxiosConfig(opts), method: 'DELETE' }),
  /** 上传 multipart/form-data (含文件), 回调百分比, 返回解包后的 data */
  postForm: <T = unknown>(url: string, form: FormData, opts: PostFormOptions = {}) =>
    axiosInstance.post<T, T>(url, form, {
      headers: opts.headers,
      params: opts.params,
      onUploadProgress: (e) => {
        if (e.total && e.total > 0) {
          const p = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)))
          opts.onProgress?.(p)
        }
      },
    }),
}
