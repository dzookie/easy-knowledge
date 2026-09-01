<script setup lang="ts">
/**
 * 知识库详情页 — 容器组件
 *
 * 布局(从上到下三块):
 *  1. 顶部: 返回知识库列表箭头 + 面包屑
 *  2. 中部: 知识库信息(纯文本行, 不使用卡片)
 *  3. 底部: el-tabs 引用四个子组件
 *     Tab1 原始文档: DocumentsTab
 *     Tab2 切片详情: ChunksTab
 *     Tab3 知识检索: RetrieveTab
 *     Tab4 知识问答: QaTab
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { knowledgeApis } from '@/apis'
import { useAuthStore } from '@/stores/auth'
import type { Creator, KnowledgeDetail, DocumentRow } from '@/types'
import DocumentsTab from './components/DocumentsTab.vue'
import ChunksTab from './components/ChunksTab.vue'
import RetrieveTab from './components/RetrieveTab.vue'
import QaTab from './components/QaTab.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const kbId = computed(() => String(route.params.id))

/* ===== 知识库详情 ===== */
const kbLoading = ref(false)
const kb = ref<KnowledgeDetail | null>(null)

async function loadKbDetail() {
  if (!kbId.value || kbId.value === 'undefined') return
  kbLoading.value = true
  try {
    kb.value = await knowledgeApis.getKnowledgeDetail(kbId.value)
  } finally {
    kbLoading.value = false
  }
}

function strategyLabel(s: string) {
  return { recursive: '递归切分', fixed: '固定长度', semantic: '语义切分' }[s] ?? s
}
function visibilityLabel(v: number) {
  return { 0: '私有', 1: '团队', 2: '公开' }[v] ?? '未知'
}
function formatDateTime(iso?: string) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}
function creatorLabel(c?: Creator) {
  if (!c) return '-'
  return c.nickname || c.username || '-'
}

const canOperate = computed(() => {
  if (!kb.value) return false
  return authStore.isAdmin || kb.value.createdBy === authStore.user?.id
})

function goBack() {
  router.push({ name: 'admin-knowledge' })
}

/* ===== Tab ===== */
const activeTab = ref('documents')

/* ===== Tab1 共享状态 (docsList 与 ChunksTab 共享做文档过滤) ===== */
const docsList = ref<DocumentRow[]>([])

/* Tab2 懒加载 */
const chunksTabRef = ref<InstanceType<typeof ChunksTab>>()
const chunksLoaded = ref(false)

function handleTabChange(tabName: string) {
  if (tabName === 'chunks' && !chunksLoaded.value) {
    chunksTabRef.value?.load(true)
    chunksLoaded.value = true
  }
}

/* 刷新 */
function refresh() {
  loadKbDetail()
  documentsTabRef.value?.loadDocs(true)
}

/* 子组件引用 */
const documentsTabRef = ref<InstanceType<typeof DocumentsTab>>()

let isFirstLoad = true
watch(kbId, (v, ov) => {
  if (v && v !== 'undefined' && v !== ov) {
    loadKbDetail()
    if (!isFirstLoad) {
      documentsTabRef.value?.loadDocs(true)
      chunksLoaded.value = false
    }
  }
}, { immediate: true })

onMounted(() => {
  isFirstLoad = false
  loadKbDetail()
  documentsTabRef.value?.loadDocs(true)
})
</script>

<template>
  <div class="kb-detail-page">
    <!-- ============ 第一块: 返回箭头 + 面包屑 ============ -->
    <div class="kb-detail-header">
      <div class="kb-detail-header-left">
        <el-button text size="large" class="kb-back-btn" :icon="ArrowLeft" @click="goBack">
          知识库管理
        </el-button>
        <el-divider direction="vertical" class="kb-crumb-divider" />
        <span class="kb-crumb-name" :title="kb?.name">
          {{ kbLoading ? '加载中...' : kb?.name || '未知知识库' }}
        </span>
      </div>
      <div class="kb-detail-header-right">
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      </div>
    </div>

    <!-- ============ 第二块: 知识库信息 ============ -->
    <div class="kb-detail-meta" v-loading="kbLoading">
      <div class="kb-meta-desc">{{ kb?.description || '暂未填写描述' }}</div>

      <div class="kb-meta-row-2">
        <span class="kb-meta-item">
          <span class="kb-meta-label">创建人：</span>
          <span class="kb-meta-value">{{ creatorLabel(kb?.creator) }}</span>
          <el-tag v-if="kb?.createdBy === authStore.user?.id" type="primary" effect="plain" size="small" round style="margin-left: 4px;">我</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item"><span class="kb-meta-label">创建时间：</span><span class="kb-meta-value mono">{{ formatDateTime(kb?.createdAt) }}</span></span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item"><span class="kb-meta-label">更新时间：</span><span class="kb-meta-value mono">{{ formatDateTime(kb?.updatedAt) }}</span></span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">状态：</span>
          <el-tag v-if="kb?.status === 1" type="success" effect="light" size="small" round>正常</el-tag>
          <el-tag v-else type="info" effect="light" size="small" round>已禁用</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">可见性：</span>
          <el-tag :type="kb?.visibility === 0 ? 'warning' : 'primary'" effect="plain" size="small" round>{{ visibilityLabel(kb?.visibility ?? 0) }}</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item"><span class="kb-meta-label">文档数：</span><span class="kb-meta-value mono">{{ kb?.documentCount ?? 0 }}</span></span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item"><span class="kb-meta-label">切片数：</span><span class="kb-meta-value mono">{{ kb?.chunkCount ?? 0 }}</span></span>
      </div>

      <div class="kb-meta-row-3">
        <span class="kb-meta-item">
          <span class="kb-meta-label">向量模型：</span>
          <el-tag type="primary" effect="plain" size="small">{{ kb?.embeddingModel || '-' }}</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">切片策略：</span>
          <span class="kb-meta-value">{{ strategyLabel(kb?.chunkStrategy ?? '') }}</span>
          <span class="kb-meta-value mono"> / {{ kb?.chunkSize ?? '-' }}字</span>
          <span class="kb-meta-value mono"> / 重叠 {{ kb?.chunkOverlap ?? '-' }}</span>
        </span>
        <template v-if="canOperate">
          <span class="kb-meta-dot">·</span>
          <span class="kb-meta-item" :title="kb?.collection">
            <span class="kb-meta-label">Qdrant 集合：</span>
            <span class="kb-meta-value mono small">{{ kb?.collection || '-' }}</span>
          </span>
        </template>
      </div>
    </div>

    <!-- ============ 第三块: Tabs ============ -->
    <el-tabs v-model="activeTab" type="border-card" class="kb-detail-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="原始文档" name="documents">
        <DocumentsTab
          ref="documentsTabRef"
          :kb-id="kbId"
          :can-operate="canOperate"
          v-model:docs-list="docsList"
          @refresh="loadKbDetail"
        />
      </el-tab-pane>

      <el-tab-pane label="切片详情" name="chunks">
        <ChunksTab ref="chunksTabRef" :kb-id="kbId" :docs-list="docsList" />
      </el-tab-pane>

      <el-tab-pane label="知识检索" name="retrieve">
        <RetrieveTab :kb-id="kbId" />
      </el-tab-pane>

      <el-tab-pane label="知识问答" name="qa">
        <QaTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.kb-detail-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ============ 第一块: 顶部 ============ */
.kb-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 2px;
}
.kb-detail-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.kb-back-btn {
  height: 32px;
  padding-left: 0 !important;
  font-size: 14px !important;
  font-weight: 500;
  color: var(--muted-foreground) !important;
}
.kb-back-btn:hover {
  color: var(--primary) !important;
}
.kb-crumb-divider {
  height: 16px;
  border-color: var(--border-100);
}
.kb-crumb-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--muted-foreground);
  max-width: 520px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ============ 第二块: 知识库信息 ============ */
.kb-detail-meta {
  background: var(--card);
  border: 1px solid var(--border-100);
  border-radius: var(--radius-lg);
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--shadow-sm);
}
.kb-meta-desc {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
  line-height: 1.6;
}
.kb-meta-row-2,
.kb-meta-row-3 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding-top: 6px;
}
.kb-meta-row-2 { border-top: 1px dashed var(--border-100); }
.kb-meta-row-3 { border-top: 1px dashed var(--border-100); }
.kb-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.kb-meta-label { color: var(--muted-foreground); }
.kb-meta-value { color: var(--foreground); font-weight: 500; }
.kb-meta-value.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.kb-meta-value.small { font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-meta-dot { color: var(--border-200, #cbd5e1); font-weight: 600; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* ============ 第三块: Tabs ============ */
.kb-detail-tabs { margin: 0; }
:deep(.kb-detail-tabs .el-tabs__header) { margin: 0; }
:deep(.kb-detail-tabs .el-tabs__nav) { border: none; }
:deep(.kb-detail-tabs .el-tabs__item) { font-size: 14px; font-weight: 500; height: 42px; line-height: 42px; }
:deep(.kb-detail-tabs .el-tabs__item.is-active) { color: var(--primary); font-weight: 600; }
</style>

<style>
/* tooltip 全局样式 (ChunksTab 使用) */
.kb-chunk-tooltip.el-popper {
  max-width: 520px;
  max-height: 320px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.6;
  font-family: var(--font-sans);
  background: var(--popover) !important;
  color: var(--popover-foreground) !important;
  border: 1px solid var(--border-200) !important;
  border-radius: var(--radius-sm) !important;
  box-shadow: var(--shadow-md) !important;
  padding: 10px 14px !important;
}
.kb-chunk-tooltip.el-popper .el-popper__arrow::before {
  background: var(--popover) !important;
  border-color: var(--border-200) !important;
}
</style>
