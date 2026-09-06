/**
 * 主控台统计 API
 */
import { http } from '@/utils/http'

export interface OverviewStats {
  knowledgeBaseCount: number
  documentCount: number
  chunkCount: number
  apiKeyCount: number
  totalCalls: number
  totalTokens: number
  userCount: number
  isAdmin: boolean
}

export interface KbDistributionItem {
  id: string
  name: string
  docs: number
  chunks: number
  percent: number
}

export interface RecentDocumentItem {
  id: string
  fileName: string
  fileType: string
  sizeBytes: string
  status: number
  chunkCount: number
  kbName: string
  uploader: string
  createdAt: string
  finishedAt: string | null
  errorMsg: string | null
}

export interface SystemStatusItem {
  name: string
  healthy: boolean
  latency?: string
  error?: string
}

export const dashboardApis = {
  /** 总览统计 */
  getOverview: () => http.get<OverviewStats>('/api/dashboard/overview'),

  /** 知识库文档分布 TOP N */
  getKbDistribution: (limit = 5) =>
    http.get<KbDistributionItem[]>('/api/dashboard/kb-distribution', { params: { limit } }),

  /** 最近处理的文档 */
  getRecentDocuments: (limit = 10) =>
    http.get<RecentDocumentItem[]>('/api/dashboard/recent-documents', { params: { limit } }),

  /** 系统健康状态 */
  getSystemStatus: () => http.get<SystemStatusItem[]>('/api/dashboard/system-status'),
}
