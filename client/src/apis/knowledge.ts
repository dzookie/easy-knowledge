/**
 * 知识库相关 API 路径
 * listKnowledge: 全部知识库 (后端直接返回数组, 未分页, 普通用户只返回自己创建的)
 */
import { http } from '@/utils/http'
import type { KnowledgeRow, KnowledgeDetail, KnowledgeForm } from '@/types/knowledge'

export const knowledgeApis = {
  listKnowledge: (params?: Record<string, any>) =>
    http.get<KnowledgeRow[]>('/api/knowledge', { params }),

  getKnowledgeDetail: (id: string) =>
    http.get<KnowledgeDetail>(`/api/knowledge/${id}`),

  createKnowledge: (form: KnowledgeForm) =>
    http.post('/api/knowledge', form),

  updateKnowledge: (id: string, form: KnowledgeForm) =>
    http.put(`/api/knowledge/${id}`, form),

  deleteKnowledge: (id: string) =>
    http.delete(`/api/knowledge/${id}`),
}