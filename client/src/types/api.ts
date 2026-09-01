/**
 * HTTP 通用类型
 *
 * 注意: HttpError 是 class 不是 interface, 仍然在 utils/http.ts 中定义和导出
 *       需要 HttpError 时: import { HttpError } from '@/utils/http'
 */

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number        // 200=成功, 其他=错误
  message: string
  data: T | null
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

/** postForm 上传表单 (含文件) 选项 */
export interface PostFormOptions {
  /** 查询参数 */
  params?: Record<string, any>
  /** 自定义请求头 (不要手动写 Content-Type, 由浏览器自动处理 boundary) */
  headers?: Record<string, string>
  /** 上传进度百分比回调 0-100 (基于 XMLHttpRequest.upload.onprogress) */
  onProgress?: (percent: number) => void
}

/** 分页查询结果 (与后端 PaginationResult<T> 对齐) */
export interface PaginationResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
