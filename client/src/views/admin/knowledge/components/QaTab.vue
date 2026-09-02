<script setup lang="ts">
/**
 * Tab4: 知识问答 — RAG 聊天界面
 * 左右布局: 左侧参数(Prompt配置/Top-K/阈值), 右侧聊天区(流式输出)
 */
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Promotion, ChatDotRound, Document, ArrowRight } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { chatApis } from '@/apis'
import type { ChatMessage, ChatSource } from '@/types/knowledge'

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
})

function renderMarkdown(text: string): string {
  return md.render(text || '')
}

const props = defineProps<{
  kbId: string
}>()

/* ============ 参数 ============ */
const topK = ref(5)
const threshold = ref(0)
const systemPrompt = ref('')
const sending = ref(false)

const defaultPrompt = `你是一个专业的知识库问答助手。请根据以下参考资料回答用户的问题。

要求：
1. 回答必须基于参考资料，不要编造信息
2. 如果参考资料不足以回答问题，请坦诚说明
3. 回答要清晰、准确、有条理
4. 在回答中引用相关资料时，使用 [1] [2] 等标注`

/* ============ 聊天状态 ============ */
const messages = ref<ChatMessage[]>([])
const input = ref('')
const chatListRef = ref<HTMLElement>()

/* ============ 滚动 ============ */
function scrollToBottom() {
  nextTick(() => {
    if (chatListRef.value) {
      chatListRef.value.scrollTop = chatListRef.value.scrollHeight
    }
  })
}

/* ============ 发送 ============ */
async function handleSend() {
  const q = input.value.trim()
  if (!q || sending.value) return
  if (!props.kbId || props.kbId === 'undefined') {
    ElMessage.warning('知识库 ID 无效')
    return
  }

  // 添加用户消息
  messages.value.push({ role: 'user', content: q })
  input.value = ''
  scrollToBottom()

  // 添加助手消息占位
  const assistantIdx = messages.value.length
  messages.value.push({ role: 'assistant', content: '', sources: [] })
  sending.value = true
  scrollToBottom()

  // 构建历史 (最近 6 轮, 不含当前问题)
  const history = messages.value
    .slice(0, -2)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }))

  try {
    const stream = await chatApis.stream({
      kbId: props.kbId,
      query: q,
      history,
      topK: topK.value,
      topKScore: threshold.value,
      systemPrompt: systemPrompt.value.trim() || undefined,
    })

    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (!payload) continue

        try {
          const data = JSON.parse(payload)

          if (data.error) {
            ElMessage.error(data.error)
            messages.value[assistantIdx]!.content = `[错误] ${data.error}`
            break
          }

          if (data.event === 'done') continue

          if (data.event === 'sources') {
            const sources: ChatSource[] = JSON.parse(data.data)
            messages.value[assistantIdx]!.sources = sources
            continue
          }

          if (data.event === 'prompt') {
            messages.value[assistantIdx]!.prompt = data.data
            continue
          }

          if (data.event === 'thinking') {
            // 思考开始: 自动展开折叠面板
            if (!messages.value[assistantIdx]!.thinking) {
              thinkingExpanded.value.add(assistantIdx)
              thinkingExpanded.value = new Set(thinkingExpanded.value)
            }
            messages.value[assistantIdx]!.thinking = (messages.value[assistantIdx]!.thinking || '') + data.data
            scrollToBottom()
            continue
          }

          if (data.event === 'content') {
            // 第一个 content 到达: 收起思考面板
            if (!messages.value[assistantIdx]!.content) {
              thinkingExpanded.value.delete(assistantIdx)
              thinkingExpanded.value = new Set(thinkingExpanded.value)
            }
            messages.value[assistantIdx]!.content += data.data
            scrollToBottom()
            continue
          }
        } catch {
          // JSON 解析失败, 跳过
        }
      }
    }

    // 如果助手消息为空, 说明出错了
    if (!messages.value[assistantIdx]!.content) {
      messages.value[assistantIdx]!.content = '未能生成回答, 请重试.'
    }
  } catch (err: any) {
    const msg = err?.message || '问答请求失败'
    messages.value[assistantIdx]!.content = `[错误] ${msg}`
    ElMessage.error(msg)
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/* ============ 清空 ============ */
function handleClear() {
  messages.value = []
}

/* ============ 来源展开 ============ */
const expandedSources = ref<Set<number>>(new Set())
function toggleSource(idx: number) {
  if (expandedSources.value.has(idx)) expandedSources.value.delete(idx)
  else expandedSources.value.add(idx)
  expandedSources.value = new Set(expandedSources.value)
}

/* ============ 思考过程展开 ============ */
const thinkingExpanded = ref<Set<number>>(new Set())
function toggleThinking(idx: number) {
  if (thinkingExpanded.value.has(idx)) thinkingExpanded.value.delete(idx)
  else thinkingExpanded.value.add(idx)
  thinkingExpanded.value = new Set(thinkingExpanded.value)
}

/* ============ 召回详情抽屉 ============ */
const drawerVisible = ref(false)
const drawerData = ref<ChatSource[] | null>(null)
const drawerPrompt = ref<string>('')
function openDrawer(msg: ChatMessage) {
  drawerData.value = msg.sources || null
  drawerPrompt.value = msg.prompt || ''
  drawerVisible.value = true
}

/* ============ 卸载清理 ============ */
onBeforeUnmount(() => {
  messages.value = []
})
</script>

<template>
  <div class="kb-qa">
    <!-- 左侧: 参数面板 -->
    <div class="kb-qa-left">
      <div class="kb-qa-left-section">
        <div class="kb-qa-left-label">Prompt 配置</div>
        <el-input
          v-model="systemPrompt"
          type="textarea"
          :rows="8"
          :placeholder="defaultPrompt"
          resize="none"
        />
        <el-button v-if="systemPrompt" link type="primary" size="small" @click="systemPrompt = ''">恢复默认</el-button>
      </div>

      <div class="kb-qa-left-section">
        <div class="kb-qa-left-label">检索参数</div>
        <div class="kb-qa-left-options">
          <div class="kb-qa-option">
            <div class="kb-qa-option-head">
              <span class="kb-qa-option-label">Top-K</span>
              <span class="kb-qa-option-value">{{ topK }}</span>
            </div>
            <el-slider v-model="topK" :min="1" :max="100" :show-tooltip="false" size="small" />
          </div>
          <div class="kb-qa-option">
            <div class="kb-qa-option-head">
              <span class="kb-qa-option-label">相似度阈值</span>
              <span class="kb-qa-option-value">{{ threshold.toFixed(1) }}</span>
            </div>
            <el-slider v-model="threshold" :min="0" :max="1" :step="0.1" :show-tooltip="false" size="small" :marks="{ 0: '0', 0.5: '0.5', 1: '1' }" />
          </div>
        </div>
      </div>

      <div class="kb-qa-divider" />

      <el-button type="info" plain class="kb-qa-left-btn">
        <el-icon><Promotion /></el-icon>
        创建服务调用
      </el-button>
    </div>

    <!-- 右侧: 聊天区 -->
    <div class="kb-qa-right">
      <!-- 消息列表 -->
      <div ref="chatListRef" class="kb-qa-chat-list">
        <template v-if="messages.length > 0">
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="kb-qa-msg"
            :class="msg.role === 'user' ? 'kb-qa-msg-user' : 'kb-qa-msg-assistant'"
          >
            <div class="kb-qa-msg-avatar">
              <el-icon v-if="msg.role === 'user'"><ChatDotRound /></el-icon>
              <el-icon v-else><Document /></el-icon>
            </div>
            <div class="kb-qa-msg-body">
              <div class="kb-qa-msg-role">{{ msg.role === 'user' ? '我' : 'AI 助手' }}</div>
              <!-- 思考过程 (折叠面板) -->
              <div v-if="msg.role === 'assistant' && msg.thinking" class="kb-qa-thinking">
                <div class="kb-qa-thinking-header" @click="toggleThinking(idx)">
                  <el-icon class="kb-qa-thinking-arrow" :class="{ 'kb-qa-thinking-arrow-open': thinkingExpanded.has(idx) }"><ArrowRight /></el-icon>
                  <span class="kb-qa-thinking-title">思考过程</span>
                </div>
                <div v-if="thinkingExpanded.has(idx)" class="kb-qa-thinking-body">
                  <div class="kb-qa-thinking-section">
                    <div class="kb-qa-thinking-section-title">推理</div>
                    <pre class="kb-qa-thinking-reasoning">{{ msg.thinking }}</pre>
                  </div>
                </div>
              </div>
              <!-- 回答内容 -->
              <div class="kb-qa-msg-content">
                <div v-if="msg.content && msg.role === 'assistant'" class="kb-qa-msg-md" v-html="renderMarkdown(msg.content)" />
                <pre v-else-if="msg.content">{{ msg.content }}</pre>
                <span v-else class="kb-qa-msg-typing">
                  <span class="kb-qa-dot" />
                  <span class="kb-qa-dot" />
                  <span class="kb-qa-dot" />
                </span>
              </div>
              <!-- 召回详情按钮 -->
              <div v-if="msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && !sending" class="kb-qa-recall-btn">
                <el-button text size="small" @click="openDrawer(msg)">
                  <el-icon><Document /></el-icon>
                  召回详情 ({{ msg.sources.length }})
                </el-button>
              </div>
            </div>
          </div>
          <!-- 用户消息放右侧, 顺序不变但 flex-direction 反转 -->
          <!-- 上面通过 CSS class 控制对齐, 无需额外结构 -->
        </template>
        <div v-else class="kb-qa-empty">
          <el-icon :size="48"><ChatDotRound /></el-icon>
          <p>输入问题开始知识问答</p>
          <p class="kb-qa-empty-sub">基于 RAG 检索 + DeepSeek 生成回答</p>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="kb-qa-input-bar">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          placeholder="输入你的问题, Enter 发送, Shift+Enter 换行"
          resize="none"
          :disabled="sending"
          @keydown="handleKeydown"
        />
        <div class="kb-qa-input-actions">
          <el-button text size="small" @click="handleClear" :disabled="sending || messages.length === 0">清空对话</el-button>
          <el-button type="primary" :loading="sending" @click="handleSend">
            <el-icon v-if="!sending"><Promotion /></el-icon>
            {{ sending ? '生成中...' : '发送' }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 召回详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="召回详情" size="460px" direction="rtl">
      <template v-if="drawerData">
        <div class="kb-qa-drawer-body">
          <el-tabs>
            <el-tab-pane label="召回数据">
              <div class="kb-qa-drawer-meta">共召回 {{ drawerData.length }} 条切片</div>
              <div
                v-for="(src, sidx) in drawerData"
                :key="sidx"
                class="kb-qa-drawer-item"
              >
                <div class="kb-qa-drawer-item-head">
                  <el-tag size="small" effect="plain" type="info">[{{ sidx + 1 }}]</el-tag>
                  <el-icon :color="'#666'"><Document /></el-icon>
                  <span class="kb-qa-drawer-item-name" :title="src.fileName">{{ src.fileName }}</span>
                  <span class="kb-qa-drawer-item-score">相似度 {{ src.score.toFixed(3) }}</span>
                </div>
                <div class="kb-qa-drawer-item-content">{{ src.content }}</div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="Prompt 组装">
              <pre class="kb-qa-drawer-prompt">{{ drawerPrompt || '无 Prompt 数据' }}</pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.kb-qa { display: flex; gap: 16px; padding: 6px 0 0; height: 600px; }

/* 左侧 */
.kb-qa-left { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px; background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); align-self: flex-start; position: sticky; top: 8px; }
.kb-qa-left-section { display: flex; flex-direction: column; gap: 8px; }
.kb-qa-left-label { font-size: 13px; font-weight: 600; color: var(--muted-foreground); }
.kb-qa-left-options { display: flex; flex-direction: column; gap: 18px; }
.kb-qa-option { display: flex; flex-direction: column; gap: 6px; }
.kb-qa-option-head { display: flex; align-items: center; justify-content: space-between; }
.kb-qa-option-label { font-size: 13px; color: var(--muted-foreground); white-space: nowrap; }
.kb-qa-option-value { font-size: 13px; font-weight: 600; font-family: var(--font-mono); color: var(--primary); }
.kb-qa-divider { border-top: 1px dashed var(--border-100); margin: 4px 0 0; padding-top: 16px; }
.kb-qa-left-btn { width: 100%; }
:deep(.kb-qa-left .el-textarea__inner) { scrollbar-width: none; -ms-overflow-style: none; }
:deep(.kb-qa-left .el-textarea__inner::-webkit-scrollbar) { display: none; }

/* 右侧 */
.kb-qa-right { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
/* 隐藏滚动条但保留滚动 */
.kb-qa-chat-list { scrollbar-width: none; -ms-overflow-style: none; }
.kb-qa-chat-list::-webkit-scrollbar { display: none; }

/* 消息列表 */
.kb-qa-chat-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
.kb-qa-msg { display: flex; gap: 12px; max-width: 85%; }
.kb-qa-msg-assistant { align-self: flex-start; }
.kb-qa-msg-user { flex-direction: row-reverse; align-self: flex-end; }
.kb-qa-msg-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }
.kb-qa-msg-user .kb-qa-msg-avatar { background: var(--primary); color: #fff; }
.kb-qa-msg-assistant .kb-qa-msg-avatar { background: var(--accent); color: #fff; }
.kb-qa-msg-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.kb-qa-msg-user .kb-qa-msg-body { align-items: flex-end; }
.kb-qa-msg-role { font-size: 12px; font-weight: 600; color: var(--muted-foreground); }
.kb-qa-msg-content { font-size: 14px; line-height: 1.7; color: var(--foreground); }
.kb-qa-msg-content pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: var(--font-sans); }
.kb-qa-msg-user .kb-qa-msg-content pre { background: var(--primary); color: #fff; padding: 10px 14px; border-radius: 12px 4px 12px 12px; }

/* 打字动画 */
.kb-qa-msg-typing { display: inline-flex; gap: 4px; align-items: center; padding: 8px 0; }
.kb-qa-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted-foreground); animation: kb-qa-bounce 1.4s infinite ease-in-out both; }
.kb-qa-dot:nth-child(1) { animation-delay: -0.32s; }
.kb-qa-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes kb-qa-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

/* 召回详情按钮 */
.kb-qa-recall-btn { margin-top: 4px; }

/* 召回详情抽屉 */
.kb-qa-drawer-meta { font-size: 13px; color: var(--muted-foreground); margin-bottom: 12px; }
.kb-qa-drawer-item { background: rgba(0,0,0,0.02); border: 1px solid var(--border-100); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 10px; }
.kb-qa-drawer-item-head { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 8px; }
.kb-qa-drawer-item-name { color: var(--foreground); font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 180px; }
.kb-qa-drawer-item-score { margin-left: auto; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 11px; }
.kb-qa-drawer-item-content { font-size: 12px; line-height: 1.6; color: var(--muted-foreground); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.kb-qa-drawer-item-content::-webkit-scrollbar { display: none; }
.kb-qa-drawer-prompt { font-size: 12px; line-height: 1.6; color: var(--foreground); white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono, 'SF Mono', 'Consolas', monospace); padding: 12px; background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-sm, 6px); max-height: calc(100vh - 200px); overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.kb-qa-drawer-prompt::-webkit-scrollbar { display: none; }
.kb-qa-drawer-body :deep(.el-tab-pane) { padding: 8px 4px 0; }

/* 空状态 */
.kb-qa-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted-foreground); }
.kb-qa-empty p { margin: 0; font-size: 14px; }
.kb-qa-empty-sub { font-size: 12px !important; opacity: 0.7; }

/* 输入区 */
.kb-qa-input-bar { border-top: 1px solid var(--border-100); padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.kb-qa-input-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

/* Markdown 渲染 */
.kb-qa-msg-md { font-size: 14px; line-height: 1.7; color: var(--foreground); }
.kb-qa-msg-assistant .kb-qa-msg-md { background: rgba(0,0,0,0.02); padding: 10px 14px; border-radius: 4px 12px 12px 12px; }

/* 思考过程折叠面板 */
.kb-qa-thinking { margin-bottom: 6px; border: 1px solid var(--border-100); border-radius: var(--radius-sm); overflow: hidden; }
.kb-qa-thinking-header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(0,0,0,0.02); cursor: pointer; user-select: none; font-size: 12px; color: var(--muted-foreground); }
.kb-qa-thinking-header:hover { background: rgba(0,0,0,0.04); }
.kb-qa-thinking-arrow { transition: transform .2s ease; font-size: 12px; }
.kb-qa-thinking-arrow-open { transform: rotate(90deg); }
.kb-qa-thinking-title { font-weight: 600; }
.kb-qa-thinking-badge { margin-left: auto; padding: 1px 8px; background: var(--primary); color: #fff; border-radius: 10px; font-size: 11px; }
.kb-qa-thinking-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.kb-qa-thinking-section { display: flex; flex-direction: column; gap: 6px; }
.kb-qa-thinking-section-title { font-size: 11px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: .5px; }
.kb-qa-thinking-source { display: flex; align-items: flex-start; gap: 4px; flex-wrap: wrap; font-size: 12px; line-height: 1.5; }
.kb-qa-thinking-source-rank { color: var(--primary); font-weight: 600; }
.kb-qa-thinking-source-name { color: var(--foreground); font-weight: 500; }
.kb-qa-thinking-source-score { color: var(--muted-foreground); font-family: var(--font-mono); font-size: 11px; }
.kb-qa-thinking-source-content { flex-basis: 100%; color: var(--muted-foreground); white-space: pre-wrap; word-break: break-word; max-height: 60px; overflow: hidden; }
.kb-qa-thinking-reasoning { margin: 0; padding: 8px 10px; background: rgba(0,0,0,0.02); border-radius: var(--radius-sm); font-size: 12px; line-height: 1.6; color: var(--muted-foreground); white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.kb-qa-thinking-reasoning::-webkit-scrollbar { display: none; }
.kb-qa-msg-md :deep(p) { margin: 0 0 8px; }
.kb-qa-msg-md :deep(p:last-child) { margin-bottom: 0; }
.kb-qa-msg-md :deep(ul), .kb-qa-msg-md :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.kb-qa-msg-md :deep(li) { margin: 2px 0; }
.kb-qa-msg-md :deep(h1), .kb-qa-msg-md :deep(h2), .kb-qa-msg-md :deep(h3), .kb-qa-msg-md :deep(h4) { margin: 12px 0 6px; font-weight: 600; }
.kb-qa-msg-md :deep(h1) { font-size: 18px; }
.kb-qa-msg-md :deep(h2) { font-size: 16px; }
.kb-qa-msg-md :deep(h3) { font-size: 15px; }
.kb-qa-msg-md :deep(h4) { font-size: 14px; }
.kb-qa-msg-md :deep(code) { background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 4px; font-size: 13px; font-family: var(--font-mono); }
.kb-qa-msg-md :deep(pre) { background: rgba(0,0,0,0.04); padding: 10px 12px; border-radius: var(--radius-sm); overflow-x: auto; margin: 0 0 8px; }
.kb-qa-msg-md :deep(pre code) { background: none; padding: 0; }
.kb-qa-msg-md :deep(blockquote) { border-left: 3px solid var(--border-200); padding-left: 12px; margin: 0 0 8px; color: var(--muted-foreground); }
.kb-qa-msg-md :deep(a) { color: var(--primary); text-decoration: none; }
.kb-qa-msg-md :deep(a:hover) { text-decoration: underline; }
.kb-qa-msg-md :deep(table) { border-collapse: collapse; width: 100%; margin: 0 0 8px; font-size: 13px; }
.kb-qa-msg-md :deep(th), .kb-qa-msg-md :deep(td) { border: 1px solid var(--border-100); padding: 6px 10px; text-align: left; }
.kb-qa-msg-md :deep(th) { background: rgba(0,0,0,0.02); font-weight: 600; }
.kb-qa-msg-md :deep(hr) { border: none; border-top: 1px solid var(--border-100); margin: 12px 0; }
</style>
