import { http } from '@/utils/http'
import type { ChatMessage } from '@/types/knowledge'

export const chatApis = {
  /**
   * 知识问答 SSE 流式调用
   *
   * 使用 fetch 直接读取 SSE 流 (不走 axios 拦截器)
   * 返回 ReadableStream, 调用方逐 chunk 解析
   */
  async stream(params: {
    kbId: string
    query: string
    history?: { role: 'user' | 'assistant'; content: string }[]
    topK?: number
    topKScore?: number
    temperature?: number
    systemPrompt?: string
  }): Promise<ReadableStream<Uint8Array>> {
    const token = localStorage.getItem('ek-token') || ''
    const resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    })

    if (!resp.ok) {
      const text = await resp.text()
      let msg = `HTTP ${resp.status}`
      try {
        const data = JSON.parse(text)
        msg = data?.message || msg
      } catch {
        // 非 JSON 响应
      }
      throw new Error(msg)
    }

    if (!resp.body) throw new Error('响应流不可用')
    return resp.body
  },
}
