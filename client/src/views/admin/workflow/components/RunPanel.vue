<script setup lang="ts">
/**
 * 运行调试弹窗 — 输入入参 + SSE 流式运行 + 节点 trace 展示
 *
 * 行为:
 *  - 由顶部工具栏「运行调试」按钮控制显隐 (v-model:visible)
 *  - 根据图里的 start 节点 config.variables 自动生成输入表单
 *  - 点击「开始运行」调 workflowApis.runStream + parseWorkflowStream
 *  - 实时显示: 节点开始/结束、LLM 思考、最终内容
 *  - 节点 trace 列表显示每个节点的耗时、输入和输出
 */
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, Loading } from '@element-plus/icons-vue'
import { workflowApis, parseWorkflowStream } from '@/apis'
import type { WorkflowGraph, WorkflowStreamEvent } from '@/types/workflow'
import type { Node, Edge } from '@vue-flow/core'

const props = defineProps<{
  visible: boolean
  workflowId: string
  nodes: Node[]
  edges: Edge[]
  /** 序列化当前画布为 DSL graph (运行前自动保存用) */
  serializeGraph: () => WorkflowGraph
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
}>()

const visible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

/* ===== 入参表单 ===== */
interface StartVarField {
  name: string
  label: string
  type: string
  required: boolean
  value: any
}
const startFields = computed<StartVarField[]>(() => {
  const start = props.nodes.find((n) => n.type === 'start')
  const vars = (start?.data?.config as any)?.variables || []
  return vars.map((v: any) => ({
    name: v.name,
    label: v.label || v.name,
    type: v.type,
    required: !!v.required,
    value: v.default ?? '',
  }))
})

const inputs = ref<Record<string, any>>({})
// 监听 startFields 变化, 同步默认值
import { watch } from 'vue'
watch(
  startFields,
  (fields) => {
    const next: Record<string, any> = {}
    for (const f of fields) {
      next[f.name] = inputs.value[f.name] ?? f.value
    }
    inputs.value = next
  },
  { immediate: true },
)

/* ===== 运行状态 ===== */
const running = ref(false)
const runError = ref<string | null>(null)
const events = ref<WorkflowStreamEvent[]>([])
const finalOutput = ref('')
const nodeTrace = ref<
  Array<{
    nodeId: string
    title: string
    status: 'running' | 'done' | 'error'
    durationMs?: number
    input?: any
    output?: any
    error?: string
  }>
>([])

const logContainer = ref<HTMLElement | null>(null)

async function run() {
  if (running.value) return

  // 校验必填
  for (const f of startFields.value) {
    if (f.required && !inputs.value[f.name]) {
      ElMessage.warning(`请填写入参: ${f.label}`)
      return
    }
  }

  running.value = true
  runError.value = null
  events.value = []
  finalOutput.value = ''
  nodeTrace.value = []

  try {
    // 运行前自动保存当前画布图到数据库, 确保后端拿到最新节点
    const graph = props.serializeGraph()
    await workflowApis.update(props.workflowId, { graph })

    const stream = await workflowApis.runStream(props.workflowId, inputs.value)
    for await (const ev of parseWorkflowStream(stream)) {
      events.value.push(ev)
      handleEvent(ev)
      await nextTick()
      scrollToBottom()
    }
    if (runError.value) {
      ElMessage.error('运行失败: ' + (runError.value || ''))
    } else {
      ElMessage.success('运行完成')
    }
  } catch (e: any) {
    runError.value = e?.message || '运行失败'
    ElMessage.error(runError.value || '运行失败')
  } finally {
    running.value = false
  }
}

function handleEvent(ev: WorkflowStreamEvent) {
  const d = ev.data || {}
  switch (ev.event) {
    case 'workflow_start':
      break
    case 'node_start': {
      const existing = nodeTrace.value.find((t) => t.nodeId === d.nodeId)
      if (existing) {
        existing.status = 'running'
      } else {
        nodeTrace.value.push({
          nodeId: d.nodeId,
          title: d.title || d.nodeId,
          status: 'running',
        })
      }
      break
    }
    case 'node_finish': {
      const t = nodeTrace.value.find((x) => x.nodeId === d.nodeId)
      if (t) {
        t.status = 'done'
        t.durationMs = d.durationMs
        t.input = d.inputs
        t.output = d.outputs
      }
      break
    }
    case 'node_error': {
      const t = nodeTrace.value.find((x) => x.nodeId === d.nodeId)
      if (t) {
        t.status = 'error'
        t.error = d.error
      }
      runError.value = d.error
      break
    }
    case 'content':
      finalOutput.value += d.content || ''
      break
    case 'workflow_finish':
      break
    case 'error':
      runError.value = d.message || d.error || '未知错误'
      break
  }
}

function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

/** 节点状态 → 颜色 */
function statusColor(s: string) {
  return s === 'done' ? '#22c55e' : s === 'error' ? '#ef4444' : '#3b82f6'
}

/** 节点 id → 标题 */
function nodeTitle(id: string) {
  const n = props.nodes.find((x) => x.id === id)
  return n?.data?.title || id
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="运行调试"
    width="760px"
    top="6vh"
    :close-on-click-modal="false"
    class="wf-run-dialog"
  >
    <div class="wf-run">
      <!-- 操作栏 -->
      <div class="wf-run-head">
        <el-button
          type="primary"
          :icon="running ? Loading : VideoPlay"
          :loading="running"
          @click="run"
        >{{ running ? '运行中...' : '开始运行' }}</el-button>
        <span v-if="running" class="wf-run-status">正在执行工作流...</span>
        <span v-else-if="runError" class="wf-run-status wf-run-status-error">运行失败</span>
        <span v-else-if="nodeTrace.length" class="wf-run-status wf-run-status-ok">运行完成</span>
      </div>

      <div class="wf-run-body">
        <!-- 入参 -->
        <div class="wf-run-section">
          <div class="wf-run-section-title">入参</div>
          <div v-if="startFields.length === 0" class="wf-run-empty">未检测到 start 节点的入参变量</div>
          <div v-else class="wf-run-fields">
            <div v-for="f in startFields" :key="f.name" class="wf-run-field">
              <label class="wf-run-field-label">
                {{ f.label }}
                <span v-if="f.required" class="wf-run-field-required">*</span>
              </label>
              <el-input
                v-model="inputs[f.name]"
                :placeholder="`输入 ${f.label}`"
                size="small"
                :type="f.type === 'number' ? 'number' : 'text'"
              />
            </div>
          </div>
        </div>

        <!-- 节点 trace -->
        <div class="wf-run-section">
          <div class="wf-run-section-title">节点执行轨迹</div>
          <div v-if="nodeTrace.length === 0" class="wf-run-empty">点击「开始运行」执行工作流</div>
          <div v-else class="wf-run-trace">
            <div v-for="t in nodeTrace" :key="t.nodeId" class="wf-run-trace-item">
              <span class="wf-run-trace-dot" :style="{ background: statusColor(t.status) }"></span>
              <span class="wf-run-trace-title">{{ nodeTitle(t.nodeId) }}</span>
              <el-tag v-if="t.status === 'running'" size="small" type="primary">运行中</el-tag>
              <el-tag v-else-if="t.status === 'done'" size="small" type="success">
                完成{{ t.durationMs ? ` · ${t.durationMs}ms` : '' }}
              </el-tag>
              <el-tag v-else size="small" type="danger">失败</el-tag>
              <div v-if="t.error" class="wf-run-trace-error">{{ t.error }}</div>
              <details v-if="t.input && Object.keys(t.input).length" class="wf-run-trace-out wf-run-trace-in">
                <summary>输入</summary>
                <pre>{{ JSON.stringify(t.input, null, 2) }}</pre>
              </details>
              <details v-if="t.output" class="wf-run-trace-out">
                <summary>输出</summary>
                <pre>{{ JSON.stringify(t.output, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>

        <!-- 最终输出 -->
        <div v-if="finalOutput" class="wf-run-section">
          <div class="wf-run-section-title">最终输出</div>
          <div ref="logContainer" class="wf-run-output">{{ finalOutput }}</div>
        </div>

        <!-- 错误 -->
        <div v-if="runError" class="wf-run-section">
          <div class="wf-run-section-title wf-run-status-error">错误</div>
          <div class="wf-run-output wf-run-output-error">{{ runError }}</div>
        </div>

        <!-- 原始事件流 (调试用, 折叠) -->
        <details v-if="events.length > 0" class="wf-run-section">
          <summary class="wf-run-section-title">原始事件流 ({{ events.length }})</summary>
          <div class="wf-run-output">
            <div v-for="(ev, i) in events" :key="i" class="wf-run-raw-event">
              <span class="wf-run-raw-event-type">{{ ev.event }}</span>
              <pre>{{ JSON.stringify(ev.data) }}</pre>
            </div>
          </div>
        </details>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.wf-run {
  display: flex;
  flex-direction: column;
}
.wf-run-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}
.wf-run-status {
  font-size: 12px;
  color: #6b7280;
}
.wf-run-status-ok {
  color: #22c55e;
}
.wf-run-status-error {
  color: #ef4444;
}
.wf-run-body {
  max-height: 68vh;
  overflow-y: auto;
  padding-top: 12px;
}
.wf-run-body::-webkit-scrollbar {
  width: 6px;
}
.wf-run-body::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
.wf-run-section {
  margin-bottom: 14px;
}
.wf-run-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 6px;
  cursor: pointer;
}
.wf-run-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 6px 0;
}
.wf-run-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.wf-run-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wf-run-field-label {
  font-size: 12px;
  color: #4b5563;
}
.wf-run-field-required {
  color: #ef4444;
  margin-left: 2px;
}

.wf-run-trace {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wf-run-trace-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 8px;
  background: #f9fafb;
  border-radius: 4px;
  font-size: 12px;
}
.wf-run-trace-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.wf-run-trace-title {
  font-weight: 500;
  color: #1f2937;
  flex: 1;
}
.wf-run-trace-error {
  width: 100%;
  color: #ef4444;
  font-size: 11px;
  margin-top: 4px;
}
.wf-run-trace-out {
  width: 100%;
  margin-top: 4px;
}
.wf-run-trace-out summary {
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
}
.wf-run-trace-in summary {
  color: #2563eb;
}
.wf-run-trace-in pre {
  background: #f8fafc;
  border-left: 2px solid #93c5fd;
}
.wf-run-trace-out pre {
  font-size: 11px;
  background: #fff;
  padding: 6px;
  border-radius: 4px;
  margin-top: 4px;
  overflow-x: auto;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.wf-run-output {
  background: #1f2937;
  color: #e5e7eb;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: none;
}
.wf-run-output::-webkit-scrollbar {
  display: none;
}
.wf-run-output-error {
  background: #fef2f2;
  color: #991b1b;
}

.wf-run-raw-event {
  border-bottom: 1px dashed #374151;
  padding: 4px 0;
}
.wf-run-raw-event-type {
  display: inline-block;
  background: #374151;
  color: #93c5fd;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  margin-bottom: 4px;
}
.wf-run-raw-event pre {
  color: #d1d5db;
  font-size: 11px;
}
</style>
