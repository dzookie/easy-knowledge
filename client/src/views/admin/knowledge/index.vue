<script setup lang="ts">
/**
 * 知识库管理 — 卡片布局 + 新增/编辑/删除
 *
 * 权限:
 *  - admin: 看到全部知识库(卡片上显示「创建者」)
 *  - 普通用户: 只看到自己创建的
 *
 * 功能:
 *  - 卡片网格展示知识库信息(名称/描述/图标/状态/文档数/切片数/模型/创建者/创建时间)
 *  - 新增知识库(名称/描述/向量模型/切片策略/切片大小/重叠/可见性)
 *  - 编辑/删除(非创建者按钮隐藏)
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { onMounted, reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Edit,
  Delete,
  Refresh,
  Collection,
  Document,
  Grid,
  User,
  Warning,
  Link,
} from '@element-plus/icons-vue'
import { knowledgeApis } from '@/apis'
import { useAuthStore } from '@/stores/auth'
import type { Creator, KnowledgeRow, KnowledgeForm } from '@/types'

const router = useRouter()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.isAdmin)

/* ===== 状态 ===== */
const loading = ref(false)
const list = ref<KnowledgeRow[]>([])

/* 弹窗 */
const dialogVisible = ref(false)
const dialogTitle = ref('新增知识库')
const submitting = ref(false)

const defaultForm = (): KnowledgeForm => ({
  name: '',
  description: '',
  embeddingModel: 'qwen3.7-text-embedding',
  chunkStrategy: 'recursive',
  chunkSize: 500,
  chunkOverlap: 50,
  visibility: 0,
  status: 1,
})

const form = reactive<KnowledgeForm>(defaultForm())

/* ===== 选项 ===== */
const modelOptions = [
  { label: 'qwen3.7-text-embedding(阿里云千问,1024维)', value: 'qwen3.7-text-embedding' },
]
const strategyOptions = [
  { label: '递归切分(推荐)', value: 'recursive' },
  { label: '语义切分(慢但精准)', value: 'semantic' },
  { label: '固定长度', value: 'fixed' },
]
const visibilityOptions = [
  { label: '私有', value: 0 },
  // { label: '团队(暂未开放)', value: 1, disabled: true },
  // { label: '公开(暂未开放)', value: 2, disabled: true },
]

/* ===== 方法 ===== */

async function loadList() {
  loading.value = true
  try {
    list.value = await knowledgeApis.listKnowledge()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialogTitle.value = '新增知识库'
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row: KnowledgeRow) {
  dialogTitle.value = '编辑知识库'
  Object.assign(form, defaultForm(), {
    id: row.id,
    name: row.name,
    description: row.description || '',
    embeddingModel: row.embeddingModel,
    chunkStrategy: row.chunkStrategy,
    chunkSize: row.chunkSize,
    chunkOverlap: row.chunkOverlap,
    visibility: row.visibility,
    status: row.status,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入知识库名称')
    return
  }

  submitting.value = true
  try {
    if (form.id) {
      await knowledgeApis.updateKnowledge(form.id, form)
      ElMessage.success('知识库修改成功')
    } else {
      await knowledgeApis.createKnowledge(form)
      ElMessage.success('知识库创建成功')
    }
    dialogVisible.value = false
    await loadList()
  } catch {
    // 拦截器已处理
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: KnowledgeRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除知识库「${row.name}」吗?已上传的文档与切片将被清理(异步)。此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await knowledgeApis.deleteKnowledge(row.id)
    ElMessage.success('知识库删除成功')
    await loadList()
  } catch (e: any) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      // http 拦截器已处理
    }
  }
}

/* 是否可编辑/删除: admin 或本人 */
function canOperate(row: KnowledgeRow): boolean {
  return isAdmin.value || row.createdBy === authStore.user?.id
}

/* 策略 label */
function strategyLabel(v: string): string {
  return strategyOptions.find((o) => o.value === v)?.label ?? v
}

/* 可见性 label */
function visibilityLabel(v: number): string {
  return visibilityOptions.find((o) => o.value === v)?.label ?? String(v)
}

/* 格式化日期 */
function formatDate(iso: string): string {
  return iso.replace('T', ' ').slice(0, 10)
}

/* 创建者显示 */
function creatorLabel(c: Creator): string {
  return c.nickname || c.username
}

/* 创建者首字母(头像 fallback) */
function creatorAvatarLetter(c: Creator): string {
  const s = c.nickname || c.username
  return s ? s.slice(0, 1).toUpperCase() : '?'
}

/* 跳转知识库详情 */
function goDetail(kb: KnowledgeRow) {
  if (kb.status !== 1) {
    ElMessage.warning('该知识库已禁用')
    return
  }
  router.push({ name: 'admin-knowledge-detail', params: { id: kb.id } })
}

onMounted(loadList)
</script>

<template>
  <div class="kb-page">
    <!-- 工具栏 -->
    <div class="kb-toolbar">
      <div class="kb-toolbar-left">
        <h2 class="kb-page-title">知识库管理</h2>
        <span class="kb-page-desc">
          创建与管理知识库,配置向量模型与切片策略。文档上传与解析在知识库详情页操作。
        </span>
      </div>
      <div class="kb-toolbar-right">
        <el-button :icon="Refresh" @click="loadList">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建知识库</el-button>
      </div>
    </div>

    <!-- 统计行(可选) -->
    <div class="kb-stats" v-if="!loading">
      <div class="kb-stat-card">
        <div class="kb-stat-icon kb-stat-icon-1">
          <el-icon><Collection /></el-icon>
        </div>
        <div class="kb-stat-body">
          <span class="kb-stat-num">{{ list.length }}</span>
          <span class="kb-stat-label">知识库总数</span>
        </div>
      </div>
      <div class="kb-stat-card">
        <div class="kb-stat-icon kb-stat-icon-2">
          <el-icon><Document /></el-icon>
        </div>
        <div class="kb-stat-body">
          <span class="kb-stat-num">{{ list.reduce((s, k) => s + k.documentCount, 0) }}</span>
          <span class="kb-stat-label">文档总数</span>
        </div>
      </div>
      <div class="kb-stat-card">
        <div class="kb-stat-icon kb-stat-icon-3">
          <el-icon><Grid /></el-icon>
        </div>
        <div class="kb-stat-body">
          <span class="kb-stat-num">{{ list.reduce((s, k) => s + k.chunkCount, 0) }}</span>
          <span class="kb-stat-label">切片总数</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && list.length === 0" class="kb-empty">
      <el-icon class="kb-empty-icon"><Collection /></el-icon>
      <p class="kb-empty-title">还没有知识库</p>
      <p class="kb-empty-desc">点击右上角「新建知识库」开始创建你的第一个知识库吧</p>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建知识库</el-button>
    </div>

    <!-- 卡片网格 -->
    <div v-if="!loading && list.length > 0" class="kb-grid">
      <div
        v-for="kb in list"
        :key="kb.id"
        class="kb-card kb-card-clickable"
        :class="{ 'kb-card-disabled': kb.status !== 1 }"
        @click="goDetail(kb)"
      >
        <!-- 顶部图标区:封面 / 图标 + 状态 tag -->
        <div class="kb-card-top">
          <div class="kb-cover">
            <el-icon :size="34"><Collection /></el-icon>
          </div>
          <div class="kb-tags">
            <el-tag
              v-if="kb.status === 1"
              type="success"
              effect="light"
              size="small"
              round
            >正常</el-tag>
            <el-tag
              v-else
              type="info"
              effect="light"
              size="small"
              round
            >已禁用</el-tag>
            <el-tag
              :type="kb.visibility === 0 ? 'warning' : 'primary'"
              effect="plain"
              size="small"
              round
            >
              {{ visibilityLabel(kb.visibility) }}
            </el-tag>
          </div>
        </div>

        <!-- 主体:名称 + 描述 -->
        <div class="kb-card-body">
          <h3 class="kb-card-title">
            {{ kb.name }}
          </h3>
          <p class="kb-card-desc">{{ kb.description || '暂未填写描述' }}</p>
        </div>

        <!-- 指标行 -->
        <div class="kb-metrics">
          <div class="kb-metric">
            <el-icon class="kb-metric-icon"><Document /></el-icon>
            <span class="kb-metric-val">{{ kb.documentCount }}</span>
            <span class="kb-metric-key">文档</span>
          </div>
          <div class="kb-metric">
            <el-icon class="kb-metric-icon"><Grid /></el-icon>
            <span class="kb-metric-val">{{ kb.chunkCount }}</span>
            <span class="kb-metric-key">切片</span>
          </div>
          <div class="kb-metric">
            <el-icon class="kb-metric-icon"><Link /></el-icon>
            <span class="kb-metric-val kb-metric-mono">{{ kb.chunkSize }}</span>
            <span class="kb-metric-key">chunk</span>
          </div>
        </div>

        <!-- 元信息行 -->
        <div class="kb-meta">
          <div class="kb-meta-row">
            <span class="kb-meta-key">模型</span>
            <el-tag type="primary" effect="plain" size="small">
              {{ kb.embeddingModel }}
            </el-tag>
          </div>
          <div class="kb-meta-row">
            <span class="kb-meta-key">策略</span>
            <span class="kb-meta-val">{{ strategyLabel(kb.chunkStrategy) }}</span>
          </div>
          <div class="kb-meta-row" v-if="isAdmin || kb.createdBy === authStore.user?.id">
            <span class="kb-meta-key">集合</span>
            <span class="kb-meta-val kb-meta-mono" :title="kb.collection">
              {{ kb.collection }}
            </span>
          </div>
        </div>

        <!-- 底部:创建者 + 创建时间 + 操作 -->
        <div class="kb-card-foot">
          <div class="kb-creator">
            <div
              v-if="kb.creator.avatar"
              class="kb-creator-avatar"
              :style="{ backgroundImage: `url(${kb.creator.avatar})` }"
            />
            <div v-else class="kb-creator-avatar kb-creator-avatar-text">
              {{ creatorAvatarLetter(kb.creator) }}
            </div>
            <div class="kb-creator-info">
              <span class="kb-creator-name">
                {{ creatorLabel(kb.creator) }}
                <el-tag
                  v-if="kb.createdBy === authStore.user?.id"
                  type="primary"
                  effect="dark"
                  size="small"
                  style="margin-left: 6px; height: 18px; padding: 0 6px; font-size: 11px;"
                >我创建</el-tag>
              </span>
              <span class="kb-creator-date">{{ formatDate(kb.createdAt) }}</span>
            </div>
          </div>
          <div class="kb-actions" v-if="canOperate(kb)">
            <el-button
              text
              type="primary"
              size="small"
              :icon="Edit"
              @click.stop="openEdit(kb)"
            >编辑</el-button>
            <el-button
              text
              type="danger"
              size="small"
              :icon="Delete"
              @click.stop="handleDelete(kb)"
            >删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        :model="form"
        label-width="96px"
        label-position="right"
        class="kb-form"
      >
        <el-form-item label="知识库名称" required>
          <el-input
            v-model="form.name"
            placeholder="如: 产品文档中心 / 员工手册知识库"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="选填,用于卡片页快速识别知识库用途"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <el-divider content-position="left">向量与切片配置</el-divider>

        <el-form-item label="向量模型">
          <el-select v-model="form.embeddingModel" style="width: 100%">
            <el-option
              v-for="o in modelOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
          <p v-if="!form.id" class="kb-form-tip">
            <el-icon style="margin-right: 4px;"><Warning /></el-icon>
            创建后无法修改
          </p>
        </el-form-item>

        <el-form-item label="切片策略">
          <el-select v-model="form.chunkStrategy" style="width: 100%">
            <el-option
              v-for="o in strategyOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="切片大小">
          <el-input-number
            v-model="form.chunkSize"
            :min="50"
            :max="10000"
            :step="50"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="切片重叠">
          <el-input-number
            v-model="form.chunkOverlap"
            :min="0"
            :max="2000"
            :step="10"
            style="width: 100%"
          />
        </el-form-item>

        <el-divider content-position="left">其他</el-divider>

        <el-form-item label="可见性">
          <el-radio-group v-model="form.visibility">
            <el-radio v-for="o in visibilityOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="状态" v-if="form.id">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.kb-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ============ 工具栏 ============ */
.kb-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.kb-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kb-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.kb-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.kb-toolbar-right {
  display: flex;
  gap: 8px;
}

/* ============ 统计卡片 ============ */
.kb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.kb-stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--card);
  border: 1px solid var(--border-100);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}
.kb-stat-icon {
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
.kb-stat-icon-1 { background: var(--brand-500); }
.kb-stat-icon-2 { background: var(--success-500, var(--success)); }
.kb-stat-icon-3 { background: #7C5CFF; }
.kb-stat-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.kb-stat-num {
  font: 600 22px/1 var(--font-display);
  color: var(--foreground);
  letter-spacing: -0.01em;
}
.kb-stat-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* ============ 空状态 ============ */
.kb-empty {
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
.kb-empty-icon {
  font-size: 48px;
  color: var(--muted);
  margin-bottom: 6px;
}
.kb-empty-title {
  margin: 0;
  font: 600 18px var(--font-display);
  color: var(--foreground);
}
.kb-empty-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted-foreground);
}

/* ============ 卡片网格 ============ */
.kb-grid {
  display: grid;
  /* minmax 最小值调大, 限制宽屏下列数, 避免卡片过窄拥挤 */
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}
.kb-card {
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
}
.kb-card-clickable {
  cursor: pointer;
}
.kb-card-clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border-100));
}
.kb-card-disabled {
  opacity: .6;
}
.kb-card-disabled.kb-card-clickable {
  cursor: not-allowed;
}
.kb-card-disabled:hover {
  transform: none;
  border-color: var(--border-100);
}

/* 顶部: 图标 + 状态/可见性 tag */
.kb-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.kb-cover {
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
.kb-tags {
  display: flex;
  gap: 6px;
}

/* 名称 + 描述 */
.kb-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 64px;
}
.kb-card-title {
  margin: 0;
  font: 600 16px/1.35 var(--font-sans);
  color: var(--foreground);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.kb-card-desc {
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

/* 指标行: 文档数 / 切片数 / chunk */
.kb-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 12px;
  background: var(--muted);
  border-radius: var(--radius);
}
.kb-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.kb-metric-icon {
  color: var(--primary);
  font-size: 15px;
}
.kb-metric-val {
  font: 600 15px/1.1 var(--font-sans);
  color: var(--foreground);
}
.kb-metric-mono {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 13px;
}
.kb-metric-key {
  font-size: 11px;
  color: var(--muted-foreground);
}

/* 元信息 */
.kb-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--border-100);
}
.kb-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.kb-meta-key {
  flex-shrink: 0;
  width: 32px;
  color: var(--muted-foreground);
}
.kb-meta-val {
  flex: 1;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-meta-mono {
  font-family: var(--font-mono);
}

/* 底部 */
.kb-card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 2px;
}
.kb-creator {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
.kb-creator-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.kb-creator-avatar-text {
  background: var(--muted);
  color: var(--muted-foreground);
  font: 600 12px var(--font-sans);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.kb-creator-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}
.kb-creator-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground);
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kb-creator-date {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
.kb-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* 弹窗 */
.kb-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.kb-form-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--warning-500, #E0A13E);
  display: inline-flex;
  align-items: center;
}

/* 响应式 */
@media (max-width: 640px) {
  .kb-card {
    padding: 14px;
  }
  .kb-stats {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
