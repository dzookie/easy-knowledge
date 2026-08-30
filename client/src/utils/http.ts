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

/** 额外请求选项 */
export interface RequestOptions {
  /** 查询参数 (自动拼到 URL 上, value=undefined/null 会跳过) */
  params?: Record<string, any>
  /** 请求体 (POST/PUT/PATCH 等用, 默认 JSON 序列化) */
  body?: unknown
  /** 自定义请求头 (Content-Type 缺省默认 application/json; 传 form-data 时请不要写 Content-Type 让浏览器自动处理) */
  headers?: Record<string, string>
  /** HTTP method, 主要给 request 内部用, http.get/post 等已固定 */
  method?: string
}

/** postForm 上传表单(含文件)选项 */
export interface PostFormOptions {
  /** 查询参数 */
  params?: Record<string, any>
  /** 自定义请求头 (不要手动写 Content-Type, 由浏览器自动处理 boundary) */
  headers?: Record<string, string>
  /** 上传进度百分比回调 0-100 (基于 XMLHttpRequest.upload.onprogress) */
  onProgress?: (percent: number) => void
}

/** 带上传进度的 FormData 请求 (基于 XMLHttpRequest)
 *
 * ⚠️ 为什么不用 fetch: fetch 标准至今仍不支持 request body 上传进度, 只能走 XMLHttpRequest
 *    响应体解析 / 错误处理和 request() 保持一致:
 *    - 成功解 { code: 200, message, data } 里的 data
 *    - code !== 200 / 401 / HTTP 错误 -> 抛 HttpError, 自动弹 ElMessage, 401 自动登出
 */
async function requestForm<T = unknown>(
  url: string,
  form: FormData,
  opts: PostFormOptions = {},
): Promise<T> {
  const auth = useAuthStore()
  return new Promise((resolve, reject) => {
    // 拼 query 参数
    let finalUrl = url
    if (opts.params && Object.keys(opts.params).length) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.params)) {
        if (v === undefined || v === null) continue
        const s = Array.isArray(v) ? v.join(',') : String(v)
        if (s === '') continue
        qs.append(k, s)
      }
      const str = qs.toString()
      if (str) finalUrl += (finalUrl.includes('?') ? '&' : '?') + str
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', finalUrl, true)
    // 自定义 headers
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) xhr.setRequestHeader(k, v)
    }
    // 鉴权
    if (auth.token) xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`)
    // ⚠️ 不要 setRequestHeader('Content-Type') — FormData 必须让浏览器自动带 boundary

    // 上传进度
    if (xhr.upload && opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const p = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)))
          opts.onProgress!(p)
        }
      }
    }

    xhr.onload = () => {
      let body: ApiResponse<T>
      try {
        body = JSON.parse(xhr.responseText) as ApiResponse<T>
      } catch {
        const msg =
          xhr.status >= 400 ? `上传失败: HTTP ${xhr.status}` : '响应解析失败 (非 JSON)'
        ElMessage.error(msg)
        reject(new HttpError(xhr.status || 500, msg))
        return
      }

      if (body.code === 401 || xhr.status === 401) {
        auth.logout(true)
        ElMessage.error(body.message || '登录已过期,请重新登录')
        reject(new HttpError(401, body.message || '登录已过期'))
        return
      }
      if (body.code !== 200) {
        ElMessage.error(body.message || '上传失败')
        reject(new HttpError(body.code, body.message || '上传失败'))
        return
      }
      resolve(body.data as T)
    }

    xhr.onerror = () => {
      const msg = '网络异常,上传失败 (请检查后端是否启动)'
      ElMessage.error(msg)
      reject(new HttpError(0, msg))
    }
    xhr.onabort = () => {
      reject(new HttpError(0, '上传已取消'))
    }

    xhr.send(form)
  })
}

async function request<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  }
  // 默认 JSON (上传 multipart/form-data 时, 调用方请显式把 Content-Type 设为 '' 或不写, 由浏览器自动带 boundary)
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (isFormData && headers['Content-Type']) {
    // FormData 必须让浏览器自动加 Content-Type: multipart/form-data; boundary=---xxx, 不能手动写
    delete headers['Content-Type']
  }

  // 自动携带 token
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  }

  // 拼 query 参数
  let finalUrl = url
  if (options.params && Object.keys(options.params).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(options.params)) {
      if (v === undefined || v === null) continue
      const s = Array.isArray(v) ? v.join(',') : String(v)
      if (s === '') continue // 空串也跳过, 避免后端收到 kbId=&... 被当成空值
      qs.append(k, s)
    }
    const str = qs.toString()
    if (str) finalUrl += (finalUrl.includes('?') ? '&' : '?') + str
  }

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
  }
  if (options.body !== undefined) {
    fetchOptions.body = isFormData
      ? (options.body as FormData)
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
  }

  const response = await fetch(finalUrl, fetchOptions)

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
  get: <T = unknown>(url: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(url, { ...opts, method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(url, { ...opts, method: 'POST', body }),
  put: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(url, { ...opts, method: 'PUT', body }),
  patch: <T = unknown>(url: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(url, { ...opts, method: 'PATCH', body }),
  delete: <T = unknown>(url: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(url, { ...opts, method: 'DELETE' }),
  /** 上传 multipart/form-data (含文件), 回调百分比, 返回解包后的 data */
  postForm: <T = unknown>(url: string, form: FormData, opts: PostFormOptions = {}) =>
    requestForm<T>(url, form, opts),
}
