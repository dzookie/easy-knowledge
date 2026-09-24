<script setup lang="ts">
/**
 * 工作流编辑器 — 主页面
 *
 * 布局:
 *  ┌─────────────────────────────────────────────────┐
 *  │ 顶部工具栏: 返回 / 名称 / 复制DSL / 运行调试 /  │
 *  │            保存 / 发布                          │
 *  ├──────────┬──────────────────────────────┬──────┤
 *  │ 节点面板 │       VueFlow 画布           │ (抽屉)│
 *  │ (240px)  │                              │      │
 *  └──────────┴──────────────────────────────┴──────┘
 *
 * 数据流:
 *  - workflowDetail (load) → nodes/edges (state) → Canvas (v-model)
 *  - Canvas connect/node-click → 修改 nodes/edges / 打开 ConfigDrawer
 *  - 保存: 把 nodes/edges 序列化成 WorkflowGraph → workflowApis.update
 *  - 运行调试: 顶部按钮打开 RunPanel 弹窗, 弹窗内调 workflowApis.runStream
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion, DocumentCopy, VideoPlay, Download } from '@element-plus/icons-vue'
import type { Node, Edge, Connection } from '@vue-flow/core'
import { workflowApis } from '@/apis'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@/types/workflow'
import NodeSidebar from './components/NodeSidebar.vue'
import Canvas from './components/Canvas.vue'
import ConfigDrawer from './components/ConfigDrawer.vue'
import RunPanel from './components/RunPanel.vue'

const route = useRoute()
const router = useRouter()
const workflowId = computed(() => String(route.params.id))

/* ===== 工作流元信息 ===== */
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const workflowName = ref('')
const workflowDesc = ref('')
const workflowVersion = ref(0)
const workflowStatus = ref(0)

/* ===== 图状态 (Vue Flow nodes/edges) ===== */
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

const canvasRef = ref<InstanceType<typeof Canvas>>()
/** 选中的节点(单击选中, 用于高亮/删除) */
const selectedNode = ref<Node | null>(null)
/** 配置面板打开的节点(双击才打开) */
const configNode = ref<Node | null>(null)
/** 运行调试弹窗显隐 */
const runVisible = ref(false)

/* ===== 加载 ===== */
async function loadWorkflow() {
  if (!workflowId.value || workflowId.value === 'undefined') return
  loading.value = true
  try {
    const detail = await workflowApis.getById(workflowId.value)
    workflowName.value = detail.name
    workflowDesc.value = detail.description || ''
    workflowVersion.value = detail.version
    workflowStatus.value = detail.status

    const graph = detail.graph
    if (graph && graph.nodes?.length > 0) {
      const mappedNodes: Node[] = graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        label: n.label,
        data: { title: n.data?.title, config: n.data?.config || {} },
      }))
      nodes.value = mappedNodes
      const mappedEdges: Edge[] = graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.type || 'smoothstep',
        animated: e.animated,
      }))
      edges.value = mappedEdges
    } else {
      // 空图, 给一个默认 start + end
      initDefaultGraph()
    }
  } catch (e) {
    ElMessage.error('加载工作流失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

function initDefaultGraph() {
  nodes.value = [
    {
      id: 'start',
      type: 'start',
      position: { x: 100, y: 200 },
      data: {
        title: '开始',
        config: {
          variables: [
            { name: 'query', label: '用户输入', type: 'string', required: true },
          ],
        },
      },
    },
    {
      id: 'end',
      type: 'end',
      position: { x: 600, y: 200 },
      data: {
        title: '结束',
        config: { outputs: [{ name: 'answer', value: '{{llm_1.content}}' }] },
      },
    },
  ]
  edges.value = [
    { id: 'e_start_end', source: 'start', target: 'end', type: 'smoothstep' },
  ]
}

/* ===== 画布事件 ===== */
function onConnect(conn: Connection) {
  const newEdge = {
    id: `e_${conn.source}_${conn.sourceHandle || 'out'}_${conn.target}_${Date.now().toString(36)}`,
    source: conn.source,
    target: conn.target,
    sourceHandle: conn.sourceHandle || undefined,
    targetHandle: conn.targetHandle || undefined,
    type: 'smoothstep' as const,
  }
  // Vue Flow 的 Edge 类型泛型嵌套较深, 此处用类型断言绕过 TS2589
  ;(edges.value as Edge[]).push(newEdge as Edge)
}

function onNodeClick(node: Node) {
  // 单击只选中(高亮), 不打开配置面板
  selectedNode.value = node
}

function onNodeDoubleClick(node: Node) {
  // 双击才打开右侧配置面板
  selectedNode.value = node
  configNode.value = node
}

function onPaneClick() {
  selectedNode.value = null
  configNode.value = null
}

/* ===== 添加节点到画布 ===== */
function addNodeToCanvas(type: WorkflowNodeType) {
  if (!canvasRef.value) return
  
  const position = { x: 300, y: 200 } // 默认位置，可以根据需要调整
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
  
  canvasRef.value.addNodes([newNode])
}

/* ===== 键盘删除 ===== */
function onKeydown(e: KeyboardEvent) {
  // 在输入框里不拦截
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode.value) {
    e.preventDefault()
    removeSelectedNode()
  }
}

function removeSelectedNode() {
  if (!selectedNode.value) return
  const id = selectedNode.value.id
  // 用 splice 原地删除, 避免 filter 返回 Node[] 触发 Vue Flow 泛型深递归 (TS2589)
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    if (nodes.value[i]?.id === id) {
      nodes.value.splice(i, 1)
    }
  }
  for (let i = edges.value.length - 1; i >= 0; i--) {
    const e = edges.value[i]
    if (e && (e.source === id || e.target === id)) {
      edges.value.splice(i, 1)
    }
  }
  selectedNode.value = null
  configNode.value = null
}

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

/* ===== 序列化保存 ===== */
function serializeGraph(): WorkflowGraph {
  return {
    version: '1.0',
    nodes: nodes.value.map<WorkflowNode>((n) => ({
      id: n.id,
      type: n.type as any,
      label: n.label as string | undefined,
      position: { x: n.position.x, y: n.position.y },
      data: {
        title: n.data?.title,
        config: n.data?.config || {},
      },
    })),
    edges: edges.value.map<WorkflowEdge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      type: e.type,
      animated: e.animated,
    })),
  }
}

/* ===== 保存 ===== */
async function save() {
  if (saving.value) return
  // 基础校验: 至少有 start 和 end
  const hasStart = nodes.value.some((n) => n.type === 'start')
  const hasEnd = nodes.value.some((n) => n.type === 'end')
  if (!hasStart || !hasEnd) {
    ElMessage.warning('工作流至少需要一个开始节点和一个结束节点')
    return
  }

  saving.value = true
  try {
    const graph = serializeGraph()
    await workflowApis.update(workflowId.value, {
      name: workflowName.value,
      description: workflowDesc.value,
      graph,
    })
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

/* ===== 发布 ===== */
async function publish() {
  if (publishing.value) return
  try {
    await ElMessageBox.confirm(
      '发布后该工作流将可被外部调用, 当前草稿版本会被固化。是否继续?',
      '发布确认',
      { type: 'warning', confirmButtonText: '发布', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  // 先保存
  saving.value = true
  try {
    const graph = serializeGraph()
    await workflowApis.update(workflowId.value, {
      name: workflowName.value,
      description: workflowDesc.value,
      graph,
    })
  } catch (e: any) {
    saving.value = false
    ElMessage.error('保存失败: ' + (e?.message || '未知错误'))
    return
  }
  saving.value = false

  publishing.value = true
  try {
    const res = await workflowApis.publish(workflowId.value)
    workflowVersion.value = res.version
    workflowStatus.value = 1
    ElMessage.success(`发布成功, 版本 v${res.version}`)
  } catch (e: any) {
    ElMessage.error('发布失败: ' + (e?.message || '未知错误'))
  } finally {
    publishing.value = false
  }
}

/* ===== 复制为代码 ===== */
async function copyAsJson() {
  const graph = serializeGraph()
  const json = JSON.stringify(graph, null, 2)
  try {
    await navigator.clipboard.writeText(json)
    ElMessage.success('DSL 已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败, 请手动选择')
  }
}

/* ===== 导出 DSL 为本地文件 ===== */
function exportAsFile() {
  const graph = serializeGraph()
  const json = JSON.stringify(graph, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${workflowName.value || 'workflow'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ElMessage.success('DSL 已导出到本地')
}

/* ===== 返回 ===== */
function goBack() {
  // 用 path 而非 name, 因为列表页路由名是 admin-menu-{菜单id}, 不可预测
  router.push('/admin/workflow')
}

onMounted(() => {
  loadWorkflow()
  window.addEventListener('keydown', onKeydown)
  
  // 监听节点点击创建事件
  const handleNodeClick = (e: CustomEvent) => {
    const { type } = e.detail
    addNodeToCanvas(type)
  }
  document.addEventListener('node-click', handleNodeClick as EventListener)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('node-click', handleNodeClick as EventListener)
})
</script>

<template>
  <div class="wf-editor" v-loading="loading">
    <!-- 顶部工具栏 -->
    <div class="wf-editor-top">
      <div class="wf-editor-top-left">
        <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
        <el-divider direction="vertical" />
        <el-input
          v-model="workflowName"
          placeholder="工作流名称"
          size="default"
          class="wf-editor-name-input"
        />
        <el-tag size="small" type="info">v{{ workflowVersion }}</el-tag>
        <el-tag
          v-if="workflowStatus === 1"
          size="small"
          type="success"
          effect="plain"
        >已发布</el-tag>
        <el-tag v-else size="small" type="warning" effect="plain">草稿</el-tag>
      </div>
      <div class="wf-editor-top-right">
        <el-button :icon="DocumentCopy" @click="copyAsJson">复制 DSL</el-button>
        <el-button :icon="Download" @click="exportAsFile">导出 DSL</el-button>
        <el-button :icon="VideoPlay" class="wf-btn-run" @click="runVisible = true">运行调试</el-button>
        <el-button :icon="Check" type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button :icon="Promotion" type="success" :loading="publishing" @click="publish">发布</el-button>
      </div>
    </div>

    <!-- 中间主体 -->
    <div class="wf-editor-main">
      <NodeSidebar />
      <div class="wf-editor-canvas-wrap">
        <Canvas
          ref="canvasRef"
          v-model:nodes="nodes"
          v-model:edges="edges"
          @connect="onConnect"
          @node-click="onNodeClick"
          @node-double-click="onNodeDoubleClick"
          @pane-click="onPaneClick"
        />
      </div>
    </div>

    <!-- 右侧配置抽屉 -->
    <ConfigDrawer :node="configNode" :nodes="nodes" :edges="edges" @update:node="configNode = $event" />

    <!-- 运行调试弹窗 -->
    <RunPanel
      v-model:visible="runVisible"
      :workflow-id="workflowId"
      :nodes="nodes"
      :edges="edges"
      :serialize-graph="serializeGraph"
    />
  </div>
</template>

<style scoped>
.wf-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
}
.wf-editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.wf-editor-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wf-editor-name-input {
  width: 260px;
}
.wf-editor-name-input :deep(.el-input__wrapper) {
  box-shadow: none;
  border-bottom: 1px solid transparent;
}
.wf-editor-name-input :deep(.el-input__wrapper:hover) {
  border-bottom-color: var(--el-color-primary);
}
.wf-editor-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 运行调试按钮 — 蓝色系 (项目主题 primary 为赤陶色, 此处单独覆盖) */
.wf-btn-run {
  --el-button-text-color: #2563eb;
  --el-button-bg-color: #eff6ff;
  --el-button-border-color: #bfdbfe;
  --el-button-hover-text-color: #ffffff;
  --el-button-hover-bg-color: #3b82f6;
  --el-button-hover-border-color: #3b82f6;
  --el-button-active-text-color: #ffffff;
  --el-button-active-bg-color: #2563eb;
  --el-button-active-border-color: #2563eb;
}
.wf-editor-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.wf-editor-canvas-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
}
</style>
