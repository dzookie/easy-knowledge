<script setup lang="ts">
/**
 * 工作流管理 — 列表页
 *
 * 功能:
 *  - 卡片网格展示工作流(名称/描述/版本/状态/创建者/创建时间)
 *  - 新建工作流(弹窗: 名称 + 描述, 高级面板可编辑/导入 DSL)
 *  - 进入编辑器(点击卡片或编辑按钮)
 *  - 删除工作流
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Connection, User, Upload } from '@element-plus/icons-vue'
import { workflowApis } from '@/apis'
import { useAuthStore } from '@/stores/auth'
import type { WorkflowRow, WorkflowGraph } from '@/types/workflow'

const router = useRouter()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.isAdmin)

/* ===== 状态 ===== */
const loading = ref(false)
const list = ref<WorkflowRow[]>([])

/* 新建弹窗 */
const dialogVisible = ref(false)
const submitting = ref(false)
const form = ref({ name: '', description: '' })

/* 新建弹窗 - 高级 DSL 编辑 */
const advancedPanels = ref<string[]>([])
const dslText = ref('')
const dslError = ref('')
const dslFileRef = ref<HTMLInputElement | null>(null)

/** 默认工作流图 (start + end) */
function buildDefaultGraph(): WorkflowGraph {
  return {
    version: '1.0',
    nodes: [
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
          config: { outputs: [] },
        },
      },
    ],
    edges: [{ id: 'e_start_end', source: 'start', target: 'end', type: 'smoothstep' }],
  }
}

/* ===== 方法 ===== */
async function loadList() {
  loading.value = true
  try {
    list.value = await workflowApis.list()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { name: '', description: '' }
  dslText.value = JSON.stringify(buildDefaultGraph(), null, 2)
  dslError.value = ''
  advancedPanels.value = []
  dialogVisible.value = true
}

/** 触发本地文件选择 */
function pickDslFile() {
  dslFileRef.value?.click()
}

/** 读取导入的 DSL 文件内容到编辑框 */
function onDslFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    dslText.value = String(reader.result || '')
    dslError.value = ''
    advancedPanels.value = ['dsl']
  }
  reader.onerror = () => ElMessage.error('文件读取失败')
  reader.readAsText(file)
  // 重置 input, 允许重复选择同一个文件
  input.value = ''
}

/** 解析高级面板中的 DSL, 返回 null 表示格式有误 */
function parseDsl(): WorkflowGraph | null {
  const text = dslText.value.trim()
  if (!text) return buildDefaultGraph()
  let obj: any
  try {
    obj = JSON.parse(text)
  } catch (e: any) {
    dslError.value = 'JSON 解析失败: ' + (e?.message || '格式错误')
    return null
  }
  if (!Array.isArray(obj?.nodes) || !Array.isArray(obj?.edges)) {
    dslError.value = 'DSL 格式错误: 必须包含 nodes 和 edges 数组'
    return null
  }
  dslError.value = ''
  return {
    version: obj.version || '1.0',
    nodes: obj.nodes,
    edges: obj.edges,
  }
}

async function handleCreate() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入工作流名称')
    return
  }
  // 高级面板有内容时以编辑框中的 DSL 为准
  const graph = parseDsl()
  if (!graph) {
    ElMessage.error(dslError.value || 'DSL 格式错误')
    return
  }

  submitting.value = true
  try {
    await workflowApis.create({
      name: form.value.name,
      description: form.value.description,
      graph,
    })
    ElMessage.success('创建成功, 可在列表中点击进入编辑')
    dialogVisible.value = false
    await loadList()
  } catch {
    // http 拦截器已处理
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: WorkflowRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除工作流「${row.name}」吗? 此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await workflowApis.remove(row.id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (e: any) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      // http 拦截器已处理
    }
  }
}

function goEdit(row: WorkflowRow) {
  router.push({ name: 'admin-workflow-edit', params: { id: row.id } })
}

function canOperate(row: WorkflowRow): boolean {
  return isAdmin.value || row.creator?.id === authStore.user?.id
}

function statusLabel(s: number) {
  return { 0: '草稿', 1: '已发布', 2: '已归档' }[s] ?? '未知'
}
function statusType(s: number): any {
  return { 0: 'warning', 1: 'success', 2: 'info' }[s] ?? 'info'
}

function formatDate(iso: string): string {
  return iso.replace('T', ' ').slice(0, 10)
}

function creatorLabel(c: WorkflowRow['creator']): string {
  if (!c) return '-'
  return c.nickname || c.username
}

onMounted(loadList)
</script>

<template>
  <div class="wf-page">
    <!-- 工具栏 -->
    <div class="wf-toolbar">
      <div class="wf-toolbar-left">
        <h2 class="wf-page-title">工作流管理</h2>
        <span class="wf-page-desc">
          可视化编排工作流: 拖拽节点 + 连线 + 自定义走向, 支持 LLM、知识检索、条件分支等节点。
        </span>
      </div>
      <div class="wf-toolbar-right">
        <el-button :icon="Refresh" @click="loadList">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建工作流</el-button>
      </div>
    </div>

    <!-- 统计行 -->
    <div class="wf-stats" v-if="!loading">
      <div class="wf-stat-card">
        <div class="wf-stat-icon wf-stat-icon-1">
          <el-icon><Connection /></el-icon>
        </div>
        <div class="wf-stat-body">
          <span class="wf-stat-num">{{ list.length }}</span>
          <span class="wf-stat-label">工作流总数</span>
        </div>
      </div>
      <div class="wf-stat-card">
        <div class="wf-stat-icon wf-stat-icon-2">
          <el-icon><Connection /></el-icon>
        </div>
        <div class="wf-stat-body">
          <span class="wf-stat-num">{{ list.filter((w) => w.status === 1).length }}</span>
          <span class="wf-stat-label">已发布</span>
        </div>
      </div>
      <div class="wf-stat-card">
        <div class="wf-stat-icon wf-stat-icon-3">
          <el-icon><Connection /></el-icon>
        </div>
        <div class="wf-stat-body">
          <span class="wf-stat-num">{{ list.filter((w) => w.status === 0).length }}</span>
          <span class="wf-stat-label">草稿</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && list.length === 0" class="wf-empty">
      <el-icon class="wf-empty-icon"><Connection /></el-icon>
      <p class="wf-empty-title">还没有工作流</p>
      <p class="wf-empty-desc">点击右上角「新建工作流」开始可视化编排你的第一个工作流</p>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建工作流</el-button>
    </div>

    <!-- 卡片网格 -->
    <div v-if="!loading && list.length > 0" class="wf-grid">
      <div
        v-for="wf in list"
        :key="wf.id"
        class="wf-card"
        @click="goEdit(wf)"
      >
        <!-- 顶部 -->
        <div class="wf-card-top">
          <div class="wf-cover">
            <el-icon :size="30"><Connection /></el-icon>
          </div>
          <div class="wf-tags">
            <el-tag size="small" round :type="statusType(wf.status)" effect="light">
              {{ statusLabel(wf.status) }}
            </el-tag>
            <el-tag size="small" round type="primary" effect="plain">v{{ wf.version }}</el-tag>
          </div>
        </div>

        <!-- 主体 -->
        <div class="wf-card-body">
          <h3 class="wf-card-title">{{ wf.name }}</h3>
          <p class="wf-card-desc">{{ wf.description || '暂未填写描述' }}</p>
        </div>

        <!-- 元信息 -->
        <div class="wf-meta">
          <div class="wf-meta-row">
            <span class="wf-meta-key">创建者</span>
            <span class="wf-meta-val">
              <el-icon><User /></el-icon>
              {{ creatorLabel(wf.creator) }}
            </span>
          </div>
          <div class="wf-meta-row">
            <span class="wf-meta-key">创建时间</span>
            <span class="wf-meta-val">{{ formatDate(wf.createdAt) }}</span>
          </div>
          <div class="wf-meta-row">
            <span class="wf-meta-key">更新时间</span>
            <span class="wf-meta-val">{{ formatDate(wf.updatedAt) }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div v-if="canOperate(wf)" class="wf-card-actions" @click.stop>
          <el-button text size="small" :icon="Edit" @click="goEdit(wf)">编辑</el-button>
          <el-button text size="small" type="danger" :icon="Delete" @click="handleDelete(wf)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 新建弹窗 -->
    <el-dialog v-model="dialogVisible" title="新建工作流" width="640px">
      <el-form label-position="top">
        <el-form-item label="工作流名称" required>
          <el-input v-model="form.name" placeholder="给工作流起个名字" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="简要描述这个工作流的用途 (可选)"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <!-- 高级: DSL 编辑 / 导入 -->
      <el-collapse v-model="advancedPanels" class="wf-advanced">
        <el-collapse-item name="dsl">
          <template #title>
            <span>高级: 编辑 / 导入 DSL</span>
          </template>

          <div class="wf-advanced-actions">
            <el-button size="small" :icon="Upload" @click="pickDslFile">导入 DSL 文件</el-button>
            <span class="wf-advanced-tip">也可直接编辑下方内容, 创建时以此为准</span>
          </div>

          <el-input
            v-model="dslText"
            type="textarea"
            :rows="14"
            resize="vertical"
            class="wf-dsl-input"
            placeholder="粘贴或编辑工作流 DSL (JSON)"
          />
          <div v-if="dslError" class="wf-dsl-error">{{ dslError }}</div>

          <input
            ref="dslFileRef"
            type="file"
            accept=".json,application/json"
            hidden
            @change="onDslFileChange"
          />
        </el-collapse-item>
      </el-collapse>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">创建并进入编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.wf-page {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.wf-page::-webkit-scrollbar {
  display: none;
}
.wf-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.wf-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wf-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}
.wf-page-desc {
  font-size: 13px;
  color: #6b7280;
}
.wf-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 统计行 */
.wf-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.wf-stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.wf-stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.wf-stat-icon-1 {
  background: #3b82f6;
}
.wf-stat-icon-2 {
  background: #22c55e;
}
.wf-stat-icon-3 {
  background: #f97316;
}
.wf-stat-body {
  display: flex;
  flex-direction: column;
}
.wf-stat-num {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.2;
}
.wf-stat-label {
  font-size: 12px;
  color: #6b7280;
}

/* 空状态 */
.wf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}
.wf-empty-icon {
  font-size: 64px;
  color: var(--el-color-primary-light-5);
  margin-bottom: 12px;
}
.wf-empty-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.wf-empty-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: #6b7280;
}

/* 卡片网格 */
.wf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.wf-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.wf-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
.wf-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
}
.wf-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.wf-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}
.wf-card-body {
  padding: 10px 14px;
}
.wf-card-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.wf-card-desc {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wf-meta {
  padding: 8px 14px;
  border-top: 1px solid #f3f4f6;
}
.wf-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}
.wf-meta-key {
  color: #9ca3af;
}
.wf-meta-val {
  color: #4b5563;
  display: flex;
  align-items: center;
  gap: 4px;
}
.wf-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid #f3f4f6;
  background: #fafbfc;
}

/* 新建弹窗 - 高级 DSL 面板
   去掉 el-collapse 默认的白底 + 上下边框外壳, 让标题直接落在弹窗内容流里 */
.wf-advanced {
  margin-top: 8px;
  border-top: 1px solid #f3f4f6;
  border-bottom: none;
}
.wf-advanced :deep(.el-collapse-item__header),
.wf-advanced :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
}
.wf-advanced :deep(.el-collapse-item__header) {
  justify-content: flex-start;
  height: 40px;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
}
.wf-advanced :deep(.el-collapse-item__header:hover) {
  color: var(--el-color-primary);
}
.wf-advanced :deep(.el-collapse-item__arrow) {
  margin: 0 0 0 6px;
  color: #9ca3af;
}
.wf-advanced :deep(.el-collapse-item__content) {
  padding: 4px 0 0;
}
.wf-advanced-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.wf-advanced-tip {
  font-size: 12px;
  color: #9ca3af;
}
.wf-dsl-input :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.wf-dsl-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
}
</style>
