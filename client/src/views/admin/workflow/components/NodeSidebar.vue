<script setup lang="ts">
/**
 * 左侧节点面板 — 6 种节点类型的拖拽源
 *
 * 用法:
 *  - 用户按住节点项拖动 → dragstart 把 type 写入 dataTransfer
 *  - 拖到画布释放 → Canvas.vue 监听 drop, 读取 type 创建节点
 *
 * 不直接 addNode: 创建逻辑统一在 Canvas 的 drop 处理里, 这里只负责"宣告拖的是什么"
 */
import { h } from 'vue'
import {
  VideoPlay,
  Flag,
  ChatDotRound,
  Document,
  Files,
  Switch,
} from '@element-plus/icons-vue'
import type { WorkflowNodeType } from '@/types/workflow'

const NODE_LIST: Array<{
  type: WorkflowNodeType
  label: string
  desc: string
  color: string
  icon: ReturnType<typeof h>
}> = [
  { type: 'start', label: '开始', desc: '工作流入口, 声明入参变量', color: '#22c55e', icon: h(VideoPlay) },
  { type: 'end', label: '结束', desc: '工作流出口, 输出最终结果', color: '#ef4444', icon: h(Flag) },
  { type: 'llm', label: 'LLM', desc: '调用大模型生成回答', color: '#3b82f6', icon: h(ChatDotRound) },
  { type: 'knowledge_retrieval', label: '知识检索', desc: '从知识库检索相关切片', color: '#a855f7', icon: h(Document) },
  { type: 'template', label: '模板', desc: '用 {{node.var}} 拼装字符串', color: '#f97316', icon: h(Files) },
  { type: 'if_else', label: '条件分支', desc: '按条件走不同分支', color: '#06b6d4', icon: h(Switch) },
]

function onDragStart(e: DragEvent, type: WorkflowNodeType) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/workflow-node-type', type)
  e.dataTransfer.effectAllowed = 'copy'
}

function onNodeClick(type: WorkflowNodeType) {
  // 点击节点时触发创建
  const event = new CustomEvent('node-click', { detail: { type } })
  document.dispatchEvent(event)
}
</script>

<template>
  <div class="wf-sidebar">
    <div class="wf-sidebar-header">
      <span>节点</span>
    </div>
    <div class="wf-sidebar-tip">拖动下方节点到画布</div>
    <div class="wf-sidebar-list">
      <div
        v-for="item in NODE_LIST"
        :key="item.type"
        class="wf-sidebar-item"
        draggable="true"
        @dragstart="onDragStart($event, item.type)"
        @click="onNodeClick(item.type)"
      >
        <div class="wf-sidebar-icon" :style="{ backgroundColor: item.color }">
          <el-icon :size="14" color="#fff">
            <component :is="() => item.icon" />
          </el-icon>
        </div>
        <div class="wf-sidebar-text">
          <div class="wf-sidebar-label">{{ item.label }}</div>
          <div class="wf-sidebar-desc">{{ item.desc }}</div>
        </div>
      </div>
    </div>

    <div class="wf-sidebar-legend">
      <div class="wf-sidebar-legend-title">变量引用语法</div>
      <code class="wf-sidebar-legend-code" v-pre>{{node_id.variable_name}}</code>
      <p class="wf-sidebar-legend-desc">在 LLM/模板/条件分支里引用上游节点输出</p>
    </div>
  </div>
</template>

<style scoped>
.wf-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.wf-sidebar-header {
  padding: 14px 16px 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.wf-sidebar-tip {
  padding: 0 16px 12px;
  font-size: 12px;
  color: #6b7280;
}
.wf-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  scrollbar-width: none;
}
.wf-sidebar-list::-webkit-scrollbar {
  display: none;
}
.wf-sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.wf-sidebar-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: #f9fafb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.wf-sidebar-item:active {
  cursor: grabbing;
}
.wf-sidebar-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wf-sidebar-text {
  min-width: 0;
}
.wf-sidebar-label {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.2;
}
.wf-sidebar-desc {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-sidebar-legend {
  margin: 8px 12px 12px;
  padding: 10px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px dashed #e5e7eb;
}
.wf-sidebar-legend-title {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 4px;
}
.wf-sidebar-legend-code {
  display: block;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  color: var(--el-color-primary);
  background: #fff;
  padding: 4px 6px;
  border-radius: 4px;
  margin-bottom: 4px;
}
.wf-sidebar-legend-desc {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.4;
}
</style>
