<script setup lang="ts">
/**
 * 主控台 (Dashboard) — 登录后默认首页
 * 展示系统关键指标、最近活动、系统状态
 * 数据为 mock, 后端就绪后替换为真实 API
 */
import { ref } from 'vue'
import {
  Collection, Document, ChatDotRound, User,
  TrendCharts, Cpu, DataLine, CircleCheck,
  ArrowUp, ArrowDown,
} from '@element-plus/icons-vue'

/* -------- 统计卡片 -------- */
const stats = ref([
  {
    key: 'knowledge',
    label: '知识库总数',
    value: 12,
    unit: '个',
    trend: 2,
    trendUp: true,
    icon: Collection,
    color: 'primary',
  },
  {
    key: 'documents',
    label: '文档总数',
    value: 386,
    unit: '份',
    trend: 18,
    trendUp: true,
    icon: Document,
    color: 'success',
  },
  {
    key: 'queries',
    label: '本月问答',
    value: 1284,
    unit: '次',
    trend: 12.5,
    trendUp: true,
    icon: ChatDotRound,
    color: 'warning',
  },
  {
    key: 'users',
    label: '活跃用户',
    value: 24,
    unit: '人',
    trend: 3,
    trendUp: false,
    icon: User,
    color: 'info',
  },
])

/* -------- 知识库容量分布 -------- */
const kbDistribution = ref([
  { name: '产品手册', docs: 86, percent: 75 },
  { name: 'FAQ 整理', docs: 124, percent: 92 },
  { name: '历史工单', docs: 132, percent: 88 },
  { name: '研发规范', docs: 44, percent: 35 },
])

/* -------- 最近问答活动 -------- */
const recentChats = ref([
  {
    user: '张明',
    question: '产品 V2.3 的登录流程是怎样的?',
    kb: '产品手册',
    time: '2 分钟前',
    status: 'success',
  },
  {
    user: '李华',
    question: '如何配置切片重叠参数?',
    kb: '研发规范',
    time: '15 分钟前',
    status: 'success',
  },
  {
    user: '王芳',
    question: '历史工单里关于退款的处理时效?',
    kb: '历史工单',
    time: '1 小时前',
    status: 'success',
  },
  {
    user: '赵强',
    question: 'FAQ 中有关于会员升级的说明吗?',
    kb: 'FAQ 整理',
    time: '3 小时前',
    status: 'partial',
  },
  {
    user: '陈静',
    question: '系统支持哪些 Embedding 模型?',
    kb: '产品手册',
    time: '昨天',
    status: 'success',
  },
])

/* -------- 系统状态 -------- */
const systemStatus = ref([
  { name: 'API 服务', healthy: true, latency: '32ms' },
  { name: 'MySQL 数据库', healthy: true, latency: '4ms' },
  { name: 'Qdrant 向量库', healthy: true, latency: '12ms' },
  { name: 'Redis 缓存', healthy: true, latency: '1ms' },
  { name: 'MinIO 对象存储', healthy: true, latency: '8ms' },
  { name: 'Embedding 服务', healthy: false, latency: '超时' },
])

function statusTag(s: string) {
  return s === 'success' ? 'success' : 'warning'
}
function statusLabel(s: string) {
  return s === 'success' ? '已命中' : '部分命中'
}
</script>

<template>
  <div class="dashboard">
    <!-- 欢迎横幅 -->
    <section class="welcome-banner">
      <div class="welcome-content">
        <h2 class="welcome-title">欢迎回来 👋</h2>
        <p class="welcome-desc">
          今天有 <strong>12</strong> 条新的问答请求,
          <strong>3</strong> 份文档待解析。
          系统运行稳定,继续探索你的知识库吧。
        </p>
        <div class="welcome-actions">
          <el-button type="primary" :icon="ChatDotRound">开始问答</el-button>
          <el-button :icon="Document">上传文档</el-button>
        </div>
      </div>
      <div class="welcome-deco" />
    </section>

    <!-- 统计卡片 -->
    <section class="stats-grid">
      <el-card v-for="s in stats" :key="s.key" shadow="never" class="stat-card">
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
            <div class="stat-trend" :class="s.trendUp ? 'stat-trend--up' : 'stat-trend--down'">
              <el-icon :size="12">
                <component :is="s.trendUp ? ArrowUp : ArrowDown" />
              </el-icon>
              <span>{{ s.trend }}% 较上周</span>
            </div>
          </div>
        </div>
      </el-card>
    </section>

    <!-- 中部: 分布 + 状态 -->
    <section class="middle-grid">
      <!-- 知识库容量分布 -->
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><DataLine /></el-icon>
              <span class="panel-title">知识库文档分布</span>
            </div>
            <el-tag size="small" effect="plain">TOP 4</el-tag>
          </div>
        </template>
        <div class="kb-list">
          <div v-for="kb in kbDistribution" :key="kb.name" class="kb-item">
            <div class="kb-item-head">
              <span class="kb-name">{{ kb.name }}</span>
              <span class="kb-count">{{ kb.docs }} 份</span>
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
      </el-card>

      <!-- 系统状态 -->
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><Cpu /></el-icon>
              <span class="panel-title">系统状态</span>
            </div>
            <el-tag type="success" size="small" effect="light">
              <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>
              5/6 正常
            </el-tag>
          </div>
        </template>
        <ul class="status-list">
          <li v-for="item in systemStatus" :key="item.name" class="status-item">
            <span class="status-dot" :class="item.healthy ? 'status-dot--ok' : 'status-dot--err'" />
            <span class="status-name">{{ item.name }}</span>
            <span class="status-latency" :class="!item.healthy && 'status-latency--err'">
              {{ item.latency }}
            </span>
          </li>
        </ul>
      </el-card>
    </section>

    <!-- 最近问答活动 -->
    <section class="recent-section">
      <el-card shadow="never" class="panel-card">
        <template #header>
          <div class="panel-head">
            <div class="panel-head-left">
              <el-icon class="panel-icon"><TrendCharts /></el-icon>
              <span class="panel-title">最近问答活动</span>
            </div>
            <el-button text type="primary" size="small">查看全部</el-button>
          </div>
        </template>
        <el-table :data="recentChats" style="width: 100%;">
          <el-table-column label="用户" width="100">
            <template #default="{ row }">
              <div class="chat-user">
                <div class="chat-user-avatar">{{ row.user.slice(0, 1) }}</div>
                <span>{{ row.user }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="question" label="问题" min-width="280" show-overflow-tooltip />
          <el-table-column prop="kb" label="命中知识库" width="140">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.kb }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="time" label="时间" width="120" />
        </el-table>
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

/* ===== 欢迎横幅 ===== */
.welcome-banner {
  position: relative;
  overflow: hidden;
  padding: 32px;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(ellipse at top right, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%),
    radial-gradient(ellipse at bottom left, color-mix(in srgb, var(--success) 8%, transparent), transparent 50%),
    var(--card);
  border: 1px solid var(--border-100);
}
.welcome-content {
  position: relative;
  z-index: 1;
  max-width: 640px;
}
.welcome-title {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 28px;
  line-height: 1.2;
  color: var(--foreground);
}
.welcome-desc {
  margin: 0 0 20px;
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted-foreground);
}
.welcome-desc strong {
  color: var(--primary);
  font-weight: 600;
}
.welcome-actions {
  display: flex;
  gap: 10px;
}
.welcome-deco {
  position: absolute;
  top: -60px;
  right: -40px;
  width: 220px;
  height: 220px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  filter: blur(2px);
  pointer-events: none;
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
  margin-bottom: 6px;
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
.stat-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
}
.stat-trend--up { color: var(--success); }
.stat-trend--down { color: var(--destructive); }

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

/* ===== 最近问答 ===== */
.recent-section :deep(.el-card__body) {
  padding: 0;
}
.chat-user {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-user-avatar {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 600 11px var(--font-sans);
  flex-shrink: 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .welcome-banner { padding: 20px; }
  .welcome-title { font-size: 22px; }
  .welcome-actions { flex-wrap: wrap; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .middle-grid { grid-template-columns: 1fr; }
}
</style>
