<script setup lang="ts">
/**
 * 工作流自定义节点 — 统一组件覆盖 6 种节点类型
 *
 * 样式: Dify 风格圆角卡片, 左侧彩色竖条标识类型, 图标 + 标题 + 描述
 * Handle: start 只有 source(右), end 只有 target(左), 其他单入单出, if_else 多分支出
 */
import { computed, type PropType } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import {
  VideoPlay,
  Flag,
  ChatDotRound,
  Document,
  Files,
  Switch,
} from '@element-plus/icons-vue'
import type { WorkflowNodeType, IfElseNodeConfig } from '@/types/workflow'

const props = defineProps({
  id: { type: String, required: true },
  type: { type: String as PropType<WorkflowNodeType>, required: true },
  data: {
    type: Object as PropType<{ title?: string; config: any }>,
    required: true,
  },
  selected: { type: Boolean, default: false },
})

/** 节点类型 → 图标/颜色/默认标题/描述 */
const NODE_META: Record<
  WorkflowNodeType,
  { icon: any; color: string; defaultTitle: string; desc: string }
> = {
  start: { icon: VideoPlay, color: '#22c55e', defaultTitle: '开始', desc: '工作流入口' },
  end: { icon: Flag, color: '#ef4444', defaultTitle: '结束', desc: '工作流出口' },
  llm: { icon: ChatDotRound, color: '#3b82f6', defaultTitle: 'LLM', desc: '大模型调用' },
  knowledge_retrieval: {
    icon: Document,
    color: '#a855f7',
    defaultTitle: '知识检索',
    desc: '从知识库检索切片',
  },
  template: { icon: Files, color: '#f97316', defaultTitle: '模板', desc: '字符串模板拼装' },
  if_else: { icon: Switch, color: '#06b6d4', defaultTitle: '条件分支', desc: '按条件走分支' },
}

const nodeType = computed(() => props.type as WorkflowNodeType)
const meta = computed(() => NODE_META[nodeType.value] || NODE_META.start)
const title = computed(() => props.data?.title || meta.value.defaultTitle)
const cfg = computed(() => props.data?.config || {})

/** if_else 分支列表 */
const ifElseBranches = computed(() => {
  if (nodeType.value !== 'if_else') return []
  const c = cfg.value as IfElseNodeConfig | undefined
  return c?.branches || []
})

const hasSource = computed(() => nodeType.value !== 'end')
const hasTarget = computed(() => nodeType.value !== 'start')

/* ===== 节点摘要 (直接在节点上展示关键配置) ===== */

/** 截断字符串 */
function truncate(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** start: 入参变量名列表 */
const startVars = computed(() => {
  if (nodeType.value !== 'start') return []
  return (cfg.value.variables || []).map((v: any) => v.name).filter(Boolean)
})

/** end: 输出字段名列表 */
const endOutputs = computed(() => {
  if (nodeType.value !== 'end') return []
  return (cfg.value.outputs || []).map((o: any) => o.name).filter(Boolean)
})

/** llm: prompt 预览 */
const llmPreview = computed(() => {
  if (nodeType.value !== 'llm') return null
  const c = cfg.value
  return {
    system: truncate(c.systemPrompt || '', 40),
    user: truncate(c.userPrompt || '', 40),
    temp: c.temperature ?? 0.7,
  }
})

/** knowledge_retrieval: 摘要 */
const kbPreview = computed(() => {
  if (nodeType.value !== 'knowledge_retrieval') return null
  const c = cfg.value
  return {
    query: truncate(c.query || '', 30),
    topK: c.topK ?? 5,
  }
})

/** template: 模板预览 */
const tplPreview = computed(() => {
  if (nodeType.value !== 'template') return ''
  return truncate(cfg.value.template || '', 50)
})
</script>

<template>
  <div class="wf-node" :class="{ 'wf-node-selected': props.selected }">
    <!-- 左侧 target handle -->
    <Handle
      v-if="hasTarget"
      type="target"
      :position="Position.Left"
      class="wf-handle wf-handle-left"
    />

    <!-- 节点主体 -->
    <div class="wf-node-body">
      <div class="wf-node-icon" :style="{ background: meta.color }">
        <el-icon :size="16" color="#fff">
          <component :is="meta.icon" />
        </el-icon>
      </div>
      <div class="wf-node-text">
        <div class="wf-node-title">{{ title }}</div>
        <div class="wf-node-desc">{{ meta.desc }}</div>
      </div>
    </div>

    <!-- 节点配置摘要 -->
    <div v-if="nodeType === 'start' && startVars.length" class="wf-node-summary">
      <span class="wf-summary-label">入参</span>
      <span v-for="v in startVars" :key="v" class="wf-summary-tag">{{ v }}</span>
    </div>
    <div v-else-if="nodeType === 'end' && endOutputs.length" class="wf-node-summary">
      <span class="wf-summary-label">输出</span>
      <span v-for="o in endOutputs" :key="o" class="wf-summary-tag">{{ o }}</span>
    </div>
    <div v-else-if="nodeType === 'llm' && llmPreview" class="wf-node-summary">
      <div v-if="llmPreview.system" class="wf-summary-line">
        <span class="wf-summary-label">SYS</span>
        <span class="wf-summary-text">{{ llmPreview.system }}</span>
      </div>
      <div class="wf-summary-line">
        <span class="wf-summary-label">USER</span>
        <span class="wf-summary-text">{{ llmPreview.user || '(空, 自动兜底)' }}</span>
      </div>
      <div class="wf-summary-line">
        <span class="wf-summary-label">T</span>
        <span class="wf-summary-text">{{ llmPreview.temp }}</span>
      </div>
    </div>
    <div v-else-if="nodeType === 'knowledge_retrieval' && kbPreview" class="wf-node-summary">
      <div class="wf-summary-line">
        <span class="wf-summary-label">Q</span>
        <span class="wf-summary-text">{{ kbPreview.query || '(未设置)' }}</span>
      </div>
      <div class="wf-summary-line">
        <span class="wf-summary-label">K</span>
        <span class="wf-summary-text">{{ kbPreview.topK }}</span>
      </div>
    </div>
    <div v-else-if="nodeType === 'template' && tplPreview" class="wf-node-summary">
      <span class="wf-summary-text">{{ tplPreview }}</span>
    </div>

    <!-- if_else 多分支 -->
    <template v-if="nodeType === 'if_else'">
      <div class="wf-branches">
        <div v-for="b in ifElseBranches" :key="b.id" class="wf-branch">
          <span class="wf-branch-label">{{ b.label || b.id }}</span>
          <Handle
            :id="b.id"
            type="source"
            :position="Position.Right"
            class="wf-handle wf-handle-branch"
          />
        </div>
        <div class="wf-branch">
          <span class="wf-branch-label">默认</span>
          <Handle
            id="default"
            type="source"
            :position="Position.Right"
            class="wf-handle wf-handle-branch"
          />
        </div>
      </div>
    </template>

    <!-- 普通 source handle -->
    <Handle
      v-else-if="hasSource"
      type="source"
      :position="Position.Right"
      class="wf-handle wf-handle-right"
    />
  </div>
</template>

<style scoped>
.wf-node {
  position: relative;
  min-width: 180px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.15s, border-color 0.15s;
  /* 不能用 overflow: hidden, 否则会裁剪掉边缘外侧的 handle */
  overflow: visible;
}
.wf-node:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #d1d5db;
}
.wf-node-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
}

.wf-node-body {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.wf-node-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wf-node-text {
  min-width: 0;
}
.wf-node-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.3;
}
.wf-node-desc {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
  line-height: 1.3;
}

/* 节点配置摘要 */
.wf-node-summary {
  border-top: 1px dashed #e5e7eb;
  padding: 6px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.wf-summary-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.wf-summary-label {
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  flex-shrink: 0;
}
.wf-summary-text {
  font-size: 11px;
  color: #4b5563;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.wf-summary-tag {
  font-size: 10px;
  background: #f3f4f6;
  color: #4b5563;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

/* if_else 分支 */
.wf-branches {
  border-top: 1px dashed #e5e7eb;
  padding: 6px 12px 6px 16px;
}
.wf-branch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 11px;
  color: #4b5563;
}
.wf-branch-label {
  background: #f3f4f6;
  padding: 1px 8px;
  border-radius: 4px;
}

/* handle — "+" 号样式, 提示用户从这里拖出连线 */
:deep(.vue-flow__handle.wf-handle) {
  width: 20px;
  height: 20px;
  background: #fff;
  border: 2px solid var(--el-color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: crosshair;
  transition: all 0.15s;
  z-index: 10;
}
/* "+" 号: 用伪元素画两条线, 必须用 top/left + margin 精确居中,
   不能用 transform (会和 hover 的 scale 冲突导致偏移) */
:deep(.vue-flow__handle.wf-handle)::before,
:deep(.vue-flow__handle.wf-handle)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  background: var(--el-color-primary);
  border-radius: 1px;
  transition: background 0.15s;
}
:deep(.vue-flow__handle.wf-handle)::before {
  /* 横线: 10x2, 居中需要 margin -1px 0 0 -5px */
  width: 10px;
  height: 2px;
  margin: -1px 0 0 -5px;
}
:deep(.vue-flow__handle.wf-handle)::after {
  /* 竖线: 2x10, 居中需要 margin -5px 0 0 -1px */
  width: 2px;
  height: 10px;
  margin: -5px 0 0 -1px;
}
:deep(.vue-flow__handle.wf-handle):hover {
  background: var(--el-color-primary);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-8);
}
:deep(.vue-flow__handle.wf-handle):hover::before,
:deep(.vue-flow__handle.wf-handle):hover::after {
  background: #fff;
}
/* hover 时 scale 必须和 Vue Flow 的 translate 一起写, 否则会覆盖定位导致偏移 */
:deep(.vue-flow__handle.wf-handle-left:hover) {
  transform: translate(-50%, -50%) scale(1.15);
}
:deep(.vue-flow__handle.wf-handle-right:hover) {
  transform: translate(50%, -50%) scale(1.15);
}
:deep(.vue-flow__handle.wf-handle-left) {
  left: -11px;
}
:deep(.vue-flow__handle.wf-handle-right) {
  right: -11px;
}
:deep(.vue-flow__handle.wf-handle-branch) {
  position: relative;
  right: -2px;
}
</style>
