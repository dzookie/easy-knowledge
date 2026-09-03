/**
 * 调用 easy-knowledge 对外问答服务的最小示例
 * 依赖: Node.js 18+ (内置 fetch)
 *
 * 使用前:
 *   1. 在管理后台 → 知识库 → 服务调用 → 新建 API Key, 拿到 sk-xxxx
 *   2. 修改下面的 API_KEY 和 BASE_URL
 *   3. 确保 easy-knowledge 后端服务已启动 (默认 http://127.0.0.1:3030)
 *   4. 运行: node call.mjs
 */

const BASE_URL = 'http://127.0.0.1:3030'
const API_KEY = 'sk-8b9c9eafb80e7090428791f387ff7785'

/**
 * 调用对外问答接口
 * @param {string} query 用户问题
 * @param {object} [opts] 可选参数
 * @param {number} [opts.topK=5] 返回切片数
 * @param {number} [opts.scoreThreshold=0] 相似度阈值 0-1
 * @param {string} [opts.systemPrompt] 自定义系统提示词
 * @returns {Promise<{answer: string, sources: Array<{fileName: string, score: number, content: string}>}>}
 */
async function chat(query, opts = {}) {
  const res = await fetch(`${BASE_URL}/api/service/chat`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topK: opts.topK ?? 5,
      scoreThreshold: opts.scoreThreshold ?? 0,
      systemPrompt: opts.systemPrompt,
    }),
  })

  if (!res.ok) {
    // 后端统一异常过滤器返回 { code, message }, 这里读出错误信息
    let detail = ''
    try {
      const err = await res.json()
      detail = err.message || err.error || JSON.stringify(err)
    } catch {
      detail = await res.text()
    }
    throw new Error(`HTTP ${res.status}: ${detail}`)
  }

  // TransformInterceptor 会把成功响应包装成 { code: 200, message: 'success', data: ... }
  const json = await res.json()
  if (json.code !== 200) {
    throw new Error(`业务错误: ${json.message}`)
  }
  return json.data
}

// ===== 运行示例 =====
const question = process.argv[2] || '请用一句话介绍这个知识库的内容'

console.log('问题:', question)
console.log('正在调用 /api/service/chat ...\n')

chat(question, { topK: 3 })
  .then(({ answer, sources }) => {
    console.log('========== AI 回答 ==========')
    console.log(answer)
    console.log('\n========== 参考来源 ==========')
    if (sources && sources.length) {
      sources.forEach((s, i) => {
        console.log(`[${i + 1}] ${s.fileName}  (score: ${s.score})`)
        console.log(`    ${s.content}`)
      })
    } else {
      console.log('(未检索到相关切片)')
    }
  })
  .catch((err) => {
    console.error('调用失败:', err.message)
    process.exit(1)
  })
