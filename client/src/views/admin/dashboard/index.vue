<script setup lang="ts">
/**
 * 主控台 (Dashboard) — 登录后默认首页
 * 展示系统关键指标、知识库分布、最近文档、系统状态
 */
import { ref, onMounted } from 'vue'
import {
  Collection, Document, ChatDotRound, User,
  TrendCharts, Cpu, DataLine, CircleCheck,
  Files,
} from '@element-plus/icons-vue'
import { dashboardApis } from '@/apis'
import type {
  OverviewStats,
  KbDistributionItem,
  RecentDocumentItem,
  SystemStatusItem,
} from '@/apis/dashboard'

/* -------- 数据 -------- */
const overview = ref<OverviewStats | null>(null)
const kbDistribution = ref<KbDistributionItem[]>([])
const recentDocs = ref<RecentDocumentItem[]>([])
const systemStatus = ref<SystemStatusItem[]>([])
const loading = ref(false)

/* -------- 统计卡片 -------- */
const statCards = ref([
  { key: 'knowledge', label: '知识库总数', value: 0, unit: '个', icon: Collection, color: 'primary' },
  { key: 'documents', label: '文档总数', value: 0, unit: '份', icon: Document, color: 'success' },
  { key: 'chunks', label: '切片总数', value: 0, unit: '条', icon: DataLine, color: 'warning' },
  { key: 'calls', label: 'API 调用', value: 0, unit: '次', icon: ChatDotRound, color: 'info' },
])

/* -------- 文档状态映射 -------- */
const docStatusMap: Record<number, { label: string; type: string }> = {
  0: { label: '等待处理', type: 'info' },
  1: { label: '处理中', type: 'warning' },
  2: { label: '成功', type: 'success' },
  3: { label: '失败', type: 'danger' },
}

function formatBytes(bytes: string): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return d.toLocaleDateString('zh-CN')
}

/* -------- 加载数据 -------- */
async function loadAll() {
  loading.value = true
  try {
    const [ov, dist, docs, status] = await Promise.all([
      dashboardApis.getOverview(),
      dashboardApis.getKbDistribution(5),
      dashboardApis.getRecentDocuments(8),
      dashboardApis.getSystemStatus(),
    ])

    overview.value = ov
    statCards.value[0].value = ov.knowledgeBaseCount
    statCards.value[1].value = ov.documentCount
    statCards.value[2].value = ov.chunkCount
    statCards.value[3].value = ov.totalCalls

    kbDistribution.value = dist
    recentDocs.value = docs
    systemStatus.value = status
  } catch (e) {
    console.error('加载主控台数据失败', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <!-- 统计卡片 -->
    <section class="stats-grid">
      <el-card v-for="s in statCards" :key="s.key" shadow="never" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" :class="`stat-icon--${s.color}`">
            <el-icon :size="20"><component :is="s.icon" /></el-icon>
          </div>
          <div class="stat-content">
            <span class="stat-label">{{ s.label }}</span>
            <div class="stat-value-row">
              <span class="stat-value">{{ s.value.toLocaleString() }}</span>
              <span class="stat-unit">{{ s.unit }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </section>

    <!-- 中部: 分布 + 状态 -->
    <section class="middle-grid">
      <!-- 知识库文档分布 -->
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><DataLine /></el-icon>
              <span class="panel-title">知识库文档分布</span>
            </div>
            <el-tag size="small" effect="plain">TOP {{ kbDistribution.length }}</el-tag>
          </div>
        </template>
        <div v-if="kbDistribution.length" class="kb-list">
          <div v-for="kb in kbDistribution" :key="kb.id" class="kb-item">
            <div class="kb-item-head">
              <span class="kb-name">{{ kb.name }}</span>
              <span class="kb-count">{{ kb.docs }} 份 / {{ kb.chunks }} 切片</span>
            </div>
            <el-progress
              :percentage="kb.percent"
              :stroke-width="8"
              :show-text="false"
              :color="kb.percent > 85 ? '#D64545' : 'var(--primary)'"
            />
            <span class="kb-percent">{{ kb.percent }}%</span>
          </div>
        </div>
        <el-empty v-else description="暂无知识库" :image-size="80" />
      </el-card>

      <!-- 系统状态 -->
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><Cpu /></el-icon>
              <span class="panel-title">系统状态</span>
            </div>
            <el-tag
              v-if="systemStatus.length"
              :type="systemStatus.every((s) => s.healthy) ? 'success' : 'danger'"
              size="small"
              effect="light"
            >
              <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>
              {{ systemStatus.filter((s) => s.healthy).length }}/{{ systemStatus.length }} 正常
            </el-tag>
          </div>
        </template>
        <ul class="status-list">
          <li v-for="item in systemStatus" :key="item.name" class="status-item">
            <span class="status-dot" :class="item.healthy ? 'status-dot--ok' : 'status-dot--err'" />
            <span class="status-name">{{ item.name }}</span>
            <span class="status-latency" :class="!item.healthy && 'status-latency--err'">
              {{ item.healthy ? item.latency : item.error || '异常' }}
            </span>
          </li>
        </ul>
      </el-card>
    </section>

    <!-- 最近文档处理 -->
    <section class="recent-section">
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><Files /></el-icon>
              <span class="panel-title">最近文档处理</span>
            </div>
            <el-button text type="primary" size="small" @click="$router.push('/knowledge')">前往知识库</el-button>
          </div>
        </template>
        <el-table v-if="recentDocs.length" :data="recentDocs" style="width: 100%;">
          <el-table-column label="文档名" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="doc-name-cell">
                <span class="doc-ext">{{ row.fileType.toUpperCase() }}</span>
                <span class="doc-file-name">{{ row.fileName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="kbName" label="所属知识库" width="140" show-overflow-tooltip />
          <el-table-column prop="uploader" label="上传者" width="100" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
          </el-table-column>
          <el-table-column label="切片" width="80">
            <template #default="{ row }">{{ row.chunkCount || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="docStatusMap[row.status]?.type" size="small">
                {{ docStatusMap[row.status]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="120">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无文档记录" :image-size="80" />
      </el-card>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== 统计卡片 ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px;
}
.stat-card :deep(.el-card__body) {
  padding: 20px;
}
.stat-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.stat-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.stat-icon--primary {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary);
}
.stat-icon--success {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}
.stat-icon--warning {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}
.stat-icon--info {
  background: color-mix(in srgb, var(--info-500, var(--muted-foreground)) 14%, transparent);
  color: var(--info-500, var(--muted-foreground));
}
.stat-content {
  flex: 1;
  min-width: 0;
}
.stat-label {
  display: block;
  font: 500 12px var(--font-sans);
  color: var(--muted-foreground);
  margin-bottom: 6px;
}
.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-value {
  font: 600 24px/1.1 var(--font-display);
  color: var(--foreground);
  letter-spacing: -0.01em;
}
.stat-unit {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* ===== 中部网格 ===== */
.middle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: 16px;
}
.panel-card {
  height: 100%;
}
.panel-card :deep(.el-card__header) {
  padding: 16px 20px;
}
.panel-card :deep(.el-card__body) {
  padding: 20px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-icon {
  color: var(--primary);
  font-size: 16px;
}
.panel-title {
  font: 600 15px/1.2 var(--font-sans);
  color: var(--foreground);
}

/* 知识库分布 */
.kb-list {
  display: grid;
  gap: 16px;
}
.kb-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 12px;
}
.kb-item-head {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.kb-name {
  font: 500 13px var(--font-sans);
  color: var(--foreground);
}
.kb-count {
  font-size: 12px;
  color: var(--muted-foreground);
}
.kb-item :deep(.el-progress) {
  grid-column: 1;
}
.kb-percent {
  grid-column: 2;
  font: 600 12px var(--font-mono);
  color: var(--muted-foreground);
}

/* 系统状态 */
.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--background);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.status-dot--ok {
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
}
.status-dot--err {
  background: var(--destructive);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent);
}
.status-name {
  flex: 1;
  font-size: 13px;
  color: var(--foreground);
}
.status-latency {
  font: 500 12px var(--font-mono);
  color: var(--muted-foreground);
}
.status-latency--err {
  color: var(--destructive);
}

/* ===== 最近文档 ===== */
.recent-section :deep(.el-card__body) {
  padding: 0;
}
.doc-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-ext {
  display: inline-block;
  min-width: 40px;
  text-align: center;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
  font: 600 11px var(--font-mono);
}
.doc-file-name {
  font-size: 13px;
  color: var(--foreground);
}

/* 响应式 */
@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .middle-grid { grid-template-columns: 1fr; }
}
</style>
