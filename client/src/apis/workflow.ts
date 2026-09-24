import { http } from '@/utils/http'
import type {
  WorkflowRow,
  WorkflowDetail,
  WorkflowRunRow,
  WorkflowRunDetail,
  WorkflowGraph,
  WorkflowStreamEvent,
} from '@/types/workflow'

export const workflowApis = {
  /** 列表 */
  list: () => http.get<WorkflowRow[]>('/api/workflow'),

  /** 详情 */
  getById: (id: string) => http.get<WorkflowDetail>(`/api/workflow/${id}`),

  /** 创建 */
  create: (data: { name: string; description?: string; graph: WorkflowGraph }) =>
    http.post<{ id: string; code: string }>('/api/workflow', data),

  /** 更新 */
  update: (id: string, data: { name?: string; description?: string; graph?: WorkflowGraph }) =>
    http.patch<{ id: string }>(`/api/workflow/${id}`, data),

  /** 删除 */
  remove: (id: string) => http.delete(`/api/workflow/${id}`),

  /** 校验 DSL */
  validate: (graph: WorkflowGraph) =>
    http.post<{ valid: boolean; message: string }>('/api/workflow/validate', { graph }),

  /** 发布 */
  publish: (id: string) =>
    http.post<{ id: string; version: number }>(`/api/workflow/${id}/publish`),

  /** 同步运行 */
  run: (id: string, inputs: Record<string, any>) =>
    http.post<{
      runId: string
      outputs: Record<string, any>
      status: number
      errorMsg?: string
      durationMs: number
      nodeTrace: any[]
    }>(`/api/workflow/${id}/run`, { inputs }),

  /**
   * 流式运行 (SSE)
   * 使用 fetch 直接读取 SSE 流, 返回 ReadableStream
   */
  async runStream(id: string, inputs: Record<string, any>): Promise<ReadableStream<Uint8Array>> {
    const token = localStorage.getItem('ek-token') || ''
    const resp = await fetch(`/api/workflow/${id}/run/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inputs, stream: true }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      let msg = `HTTP ${resp.status}`
      try {
        const data = JSON.parse(text)
        msg = data?.message || msg
      } catch {
        // 非 JSON
      }
      throw new Error(msg)
    }

    if (!resp.body) throw new Error('响应流不可用')
    return resp.body
  },

  /** 运行历史 */
  listRuns: (workflowId: string) =>
    http.get<WorkflowRunRow[]>(`/api/workflow/${workflowId}/runs`),

  /** 运行详情 */
  getRun: (runId: string) =>
    http.get<WorkflowRunDetail>(`/api/workflow/run/${runId}`),
}

/** SSE 事件解析器: 把 ReadableStream 解析成事件流 */
export async function* parseWorkflowStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<WorkflowStreamEvent, void, unknown> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 协议: 事件以 \n\n 分隔
      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)

        // 解析 "data: {...}\n\n" 格式
        const lines = chunk.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr) continue
          try {
            const event = JSON.parse(jsonStr) as WorkflowStreamEvent
            yield event
          } catch {
            // 忽略解析失败的事件
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
