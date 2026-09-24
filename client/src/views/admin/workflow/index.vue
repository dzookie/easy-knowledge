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
import { Plus, Edit, Delete, Refresh, Connection, Upload } from '@element-plus/icons-vue'
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

/** 无头像时取首字母作为占位 */
function creatorAvatarLetter(c: WorkflowRow['creator']): string {
  if (!c) return '?'
  const s = c.nickname || c.username
  return s ? s.slice(0, 1).toUpperCase() : '?'
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
            <span class="wf-meta-key">编码</span>
            <span class="wf-meta-val wf-meta-mono" :title="wf.code">{{ wf.code }}</span>
          </div>
          <div class="wf-meta-row">
            <span class="wf-meta-key">更新时间</span>
            <span class="wf-meta-val">{{ formatDate(wf.updatedAt) }}</span>
          </div>
        </div>

        <!-- 底部: 创建者 + 创建时间 + 操作 -->
        <div class="wf-card-foot">
          <div class="wf-creator">
            <div
              v-if="wf.creator?.avatar"
              class="wf-creator-avatar"
              :style="{ backgroundImage: `url(${wf.creator.avatar})` }"
            />
            <div v-else class="wf-creator-avatar wf-creator-avatar-text">
              {{ creatorAvatarLetter(wf.creator) }}
            </div>
            <div class="wf-creator-info">
              <span class="wf-creator-name">
                {{ creatorLabel(wf.creator) }}
                <el-tag
                  v-if="wf.creator?.id === authStore.user?.id"
                  type="primary"
                  effect="dark"
                  size="small"
                  style="margin-left: 6px; height: 18px; padding: 0 6px; font-size: 11px;"
                >我创建</el-tag>
              </span>
              <span class="wf-creator-date">{{ formatDate(wf.createdAt) }}</span>
            </div>
          </div>
          <div v-if="canOperate(wf)" class="wf-actions" @click.stop>
            <el-button text type="primary" size="small" :icon="Edit" @click="goEdit(wf)">编辑</el-button>
            <el-button text type="danger" size="small" :icon="Delete" @click="handleDelete(wf)">删除</el-button>
          </div>
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.wf-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.wf-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wf-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.wf-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.wf-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 统计行 */
.wf-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.wf-stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--card);
  border: 1px solid var(--border-100);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}
.wf-stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #fff;
  flex-shrink: 0;
}
.wf-stat-icon-1 { background: var(--brand-500); }
.wf-stat-icon-2 { background: var(--success-500, var(--success)); }
.wf-stat-icon-3 { background: #7C5CFF; }
.wf-stat-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.wf-stat-num {
  font: 600 22px/1 var(--font-display);
  color: var(--foreground);
  letter-spacing: -0.01em;
}
.wf-stat-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 空状态 */
.wf-empty {
  margin-top: 40px;
  padding: 64px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: var(--card);
  border: 1px dashed var(--border-300);
  border-radius: var(--radius-xl);
}
.wf-empty-icon {
  font-size: 48px;
  color: var(--muted);
  margin-bottom: 6px;
}
.wf-empty-title {
  margin: 0;
  font: 600 18px var(--font-display);
  color: var(--foreground);
}
.wf-empty-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted-foreground);
}

/* 卡片网格 */
.wf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}
.wf-card {
  position: relative;
  background: var(--card);
  border: 1px solid var(--border-100);
  border-radius: var(--radius-xl);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-sm);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  cursor: pointer;
}
.wf-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border-100));
}

/* 顶部: 图标 + 状态/版本 tag */
.wf-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.wf-cover {
  width: 52px;
  height: 52px;
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 85%, #fff), var(--primary));
  color: var(--primary-foreground, #fff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--primary) 30%, transparent);
}
.wf-tags {
  display: flex;
  gap: 6px;
}

/* 名称 + 描述 */
.wf-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 64px;
}
.wf-card-title {
  margin: 0;
  font: 600 16px/1.35 var(--font-sans);
  color: var(--foreground);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wf-card-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted-foreground);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 40px;
}

/* 元信息 */
.wf-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--border-100);
}
.wf-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.wf-meta-key {
  flex-shrink: 0;
  width: 48px;
  color: var(--muted-foreground);
}
.wf-meta-val {
  flex: 1;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wf-meta-mono {
  font-family: var(--font-mono);
}

/* 底部: 创建者 + 操作 */
.wf-card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 2px;
}
.wf-creator {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
.wf-creator-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.wf-creator-avatar-text {
  background: var(--muted);
  color: var(--muted-foreground);
  font: 600 12px var(--font-sans);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wf-creator-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}
.wf-creator-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground);
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-creator-date {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
.wf-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* 新建弹窗 - 高级 DSL 面板 */
.wf-advanced {
  margin-top: 8px;
  border-top: 1px solid #f3f4f6;
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

/* 响应式 */
@media (max-width: 640px) {
  .wf-card {
    padding: 14px;
  }
  .wf-stats {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
