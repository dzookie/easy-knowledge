<script setup lang="ts">
/**
 * 工作流画布 — Vue Flow 容器
 *
 * 拖放方案: 在 document 上用捕获阶段监听 dragover/drop,
 *   判断事件目标是否在 .wf-canvas 内, 是则处理.
 *   这样不依赖 VueFlow 内部事件透传, 最可靠.
 */
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { VueFlow, type Connection, type Node, type Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import WorkflowNode from './WorkflowNode.vue'
import type { WorkflowNodeType } from '@/types/workflow'

type FlowInstance = InstanceType<typeof VueFlow>

const props = defineProps<{
  nodes: Node[]
  edges: Edge[]
}>()

const emit = defineEmits<{
  (e: 'update:nodes', nodes: Node[]): void
  (e: 'update:edges', edges: Edge[]): void
  (e: 'connect', conn: Connection): void
  (e: 'node-click', node: Node): void
  (e: 'node-double-click', node: Node): void
  (e: 'pane-click'): void
}>()

/** 自定义节点类型映射 */
const nodeTypes = computed(() => ({
  start: markRaw(WorkflowNode),
  end: markRaw(WorkflowNode),
  llm: markRaw(WorkflowNode),
  knowledge_retrieval: markRaw(WorkflowNode),
  template: markRaw(WorkflowNode),
  if_else: markRaw(WorkflowNode),
}) as Record<string, any>)

const flowRef = ref<FlowInstance>()
const canvasRef = ref<HTMLElement>()

const dragOver = ref(false)

/* 判断事件目标是否在画布内 */
function isInCanvas(target: EventTarget | null): boolean {
  if (!canvasRef.value || !target) return false
  return canvasRef.value.contains(target as Node)
}

/* document 级别捕获阶段监听 dragover — 必须 preventDefault 才能允许 drop */
function onDocDragOver(e: DragEvent) {
  if (!isInCanvas(e.target)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  dragOver.value = true
}

function onDocDragLeave(e: DragEvent) {
  if (!isInCanvas(e.target)) return
  const related = e.relatedTarget as globalThis.Node | null
  if (related && canvasRef.value?.contains(related)) return
  dragOver.value = false
}

function onDocDrop(e: DragEvent) {
  if (!isInCanvas(e.target)) return
  e.preventDefault()
  e.stopPropagation()
  dragOver.value = false

  const type = e.dataTransfer?.getData('application/workflow-node-type') as
    | WorkflowNodeType
    | undefined
  if (!type || !flowRef.value) return

  const position = flowRef.value.project({ x: e.clientX, y: e.clientY })
  const id = `${type}_${Date.now().toString(36)}`
  const newNode: Node = {
    id,
    type,
    position,
    data: {
      title: DEFAULT_TITLE[type],
      config: defaultConfig(type),
    },
  }
  emit('update:nodes', [...props.nodes, newNode])
}

onMounted(() => {
  document.addEventListener('dragover', onDocDragOver, true)
  document.addEventListener('dragleave', onDocDragLeave, true)
  document.addEventListener('drop', onDocDrop, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('dragover', onDocDragOver, true)
  document.removeEventListener('dragleave', onDocDragLeave, true)
  document.removeEventListener('drop', onDocDrop, true)
})

defineExpose({
  fitView: () => flowRef.value?.fitView(),
})

const DEFAULT_TITLE: Record<WorkflowNodeType, string> = {
  start: '开始',
  end: '结束',
  llm: 'LLM 节点',
  knowledge_retrieval: '知识检索',
  template: '模板节点',
  if_else: '条件分支',
}

function defaultConfig(type: WorkflowNodeType) {
  switch (type) {
    case 'start':
      return {
        variables: [{ name: 'query', label: '用户输入', type: 'string' as const, required: true }],
      }
    case 'end':
      return { outputs: [] }
    case 'llm':
      return { systemPrompt: '', userPrompt: '', temperature: 0.7, maxTokens: 2000 }
    case 'knowledge_retrieval':
      return { kbId: '', query: '', topK: 5, scoreThreshold: 0.5 }
    case 'template':
      return { template: '' }
    case 'if_else':
      return {
        branches: [{ id: 'branch_1', label: '条件 1', conditions: [] }],
        defaultBranchId: 'default',
      }
  }
}
</script>

<template>
  <div ref="canvasRef" class="wf-canvas" :class="{ 'wf-canvas-dragover': dragOver }">
    <VueFlow
      ref="flowRef"
      :nodes="props.nodes"
      :edges="props.edges"
      :node-types="nodeTypes"
      :default-edge-options="{ type: 'smoothstep', animated: false }"
      :min-zoom="0.2"
      :max-zoom="2"
      :delete-key-code="['Delete', 'Backspace']"
      fit-view-on-init
      @update:nodes="(v: Node[]) => emit('update:nodes', v)"
      @update:edges="(v: Edge[]) => emit('update:edges', v)"
      @connect="(conn: Connection) => emit('connect', conn)"
      @node-click="({ node }: { node: Node }) => emit('node-click', node)"
      @node-double-click="({ node }: { node: Node }) => emit('node-double-click', node)"
      @pane-click="() => emit('pane-click')"
    >
      <Background :gap="16" :size="1" pattern-color="#d1d5db" />
      <Controls position="bottom-right" />
      <MiniMap pannable zoomable :node-color="() => '#cbd5e1'" />
    </VueFlow>
  </div>
</template>

<style scoped>
.wf-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  background: #f9fafb;
}
.wf-canvas-dragover {
  background: #eff6ff;
}
.wf-canvas-dragover::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 2px dashed var(--el-color-primary);
  border-radius: 8px;
  pointer-events: none;
  z-index: 1000;
}

/* 连线样式 */
.wf-canvas :deep(.vue-flow__edge-path) {
  stroke: #9ca3af;
  stroke-width: 2;
}
.wf-canvas :deep(.vue-flow__edge.selected .vue-flow__edge-path),
.wf-canvas :deep(.vue-flow__edge:focus .vue-flow__edge-path) {
  stroke: var(--el-color-primary);
}

/* Controls */
.wf-canvas :deep(.vue-flow__controls) {
  right: 8px;
  bottom: 180px;
  margin: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  overflow: hidden;
}
.wf-canvas :deep(.vue-flow__controls-button) {
  width: 26px;
  height: 26px;
  font-size: 12px;
  border-bottom: 1px solid #f3f4f6;
}
.wf-canvas :deep(.vue-flow__controls-button:last-child) {
  border-bottom: none;
}

/* MiniMap */
.wf-canvas :deep(.vue-flow__minimap) {
  right: 8px;
  bottom: 8px;
  width: 160px;
  height: 120px;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  background: #fff;
  border: 1px solid #e5e7eb;
}
.wf-canvas :deep(.vue-flow__minimap svg) {
  background: #fff;
}
</style>
