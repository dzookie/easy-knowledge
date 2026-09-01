import { http } from '@/utils/http'
import type { RetrievalResponse } from '@/types/knowledge'

export const retrievalApis = {
  /** 语义检索 */
  search(kbId: string, query: string, opts?: { topK?: number; scoreThreshold?: number }) {
    return http.post<RetrievalResponse>('/api/retrieval/search', {
      kbId,
      query,
      ...opts,
    })
  },
}
