/**
 * 文档 / 上传 相关 API 路径
 * listDocument: 后端返回 PaginationResult (items / total / page / pageSize)
 */
import { http } from '@/utils/http'
import type { DocumentRow, ChunkRow } from '@/types/knowledge'
import type { PaginationResult, PostFormOptions } from '@/types/api'

export const documentApis = {
  listDocument: (params?: Record<string, any>) =>
    http.get<PaginationResult<DocumentRow>>('/api/document', { params }),

  listChunks: (params?: Record<string, any>) =>
    http.get<PaginationResult<ChunkRow>>('/api/document/chunks', { params }),

  uploadDocument: <T = unknown>(
    form: FormData,
    opts: PostFormOptions = {},
  ) =>
    http.postForm<T>('/api/document/upload', form, opts),

  deleteDocument: (id: string) =>
    http.delete(`/api/document/${id}`),
}