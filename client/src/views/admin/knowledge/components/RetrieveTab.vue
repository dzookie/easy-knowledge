<script setup lang="ts">
/**
 * Tab3: 知识检索 — 左右布局, 左侧参数, 右侧结果卡片
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, QuestionFilled } from '@element-plus/icons-vue'
import { retrievalApis } from '@/apis'
import type { RetrievalResult } from '@/types'

const props = defineProps<{
  kbId: string
}>()

const query = ref('')
const topK = ref(5)
const threshold = ref(0)
const loading = ref(false)
const results = ref<RetrievalResult[]>([])
const searched = ref(false)
const expanded = ref<Set<string>>(new Set())
const overflow = ref<Set<string>>(new Set())

function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

function scoreColor(score: number): string {
  if (score >= 0.8) return '#67c23a'
  if (score >= 0.6) return '#409eff'
  if (score >= 0.4) return '#e6a23c'
  return '#909399'
}

async function handleRetrieve() {
  if (!query.value.trim()) {
    ElMessage.warning('请输入检索内容')
    return
  }
  loading.value = true
  searched.value = true
  try {
    const res = await retrievalApis.search(props.kbId, query.value.trim(), {
      topK: topK.value,
      scoreThreshold: threshold.value,
    })
    results.value = res.results
    requestAnimationFrame(() => {
      const set = new Set<string>()
      document.querySelectorAll('.kb-retrieve-card-content').forEach(el => {
        const pre = el as HTMLElement
        if (pre.scrollHeight > pre.clientHeight + 2) {
          const vid = pre.dataset.vid
          if (vid) set.add(vid)
        }
      })
      overflow.value = set
    })
  } catch (err: any) {
    ElMessage.error(err?.message || '检索失败')
    results.value = []
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="kb-retrieve">
    <!-- 左侧: 检索参数 -->
    <div class="kb-retrieve-left">
      <div class="kb-retrieve-left-section">
        <div class="kb-retrieve-left-label">查询内容</div>
        <el-input v-model="query" placeholder="输入检索问题或关键词..." clearable @keydown.enter="handleRetrieve" />
      </div>
      <div class="kb-retrieve-left-section">
        <div class="kb-retrieve-left-label">检索参数</div>
        <div class="kb-retrieve-left-options">
          <div class="kb-retrieve-option">
            <div class="kb-retrieve-option-head">
              <span class="kb-retrieve-option-label">Top-K</span>
              <span class="kb-retrieve-option-value">{{ topK }}</span>
            </div>
            <el-slider v-model="topK" :min="1" :max="100" :show-tooltip="false" size="small" />
          </div>
          <div class="kb-retrieve-option">
            <div class="kb-retrieve-option-head">
              <span class="kb-retrieve-option-label">相似度阈值</span>
              <span class="kb-retrieve-option-value">{{ threshold.toFixed(1) }}</span>
            </div>
            <el-slider v-model="threshold" :min="0" :max="1" :step="0.1" :show-tooltip="false" size="small" :marks="{ 0: '0', 0.5: '0.5', 1: '1' }" />
          </div>
        </div>
      </div>
      <div class="kb-retrieve-divider" />
      <el-button type="primary" :loading="loading" @click="handleRetrieve" class="kb-retrieve-btn">
        <el-icon v-if="!loading"><Search /></el-icon>
        {{ loading ? '检索中...' : '检索' }}
      </el-button>
    </div>

    <!-- 右侧: 检索结果 -->
    <div class="kb-retrieve-right" v-loading="loading">
      <template v-if="!loading && results.length > 0">
        <div class="kb-retrieve-meta"><span>共命中 {{ results.length }} 条切片</span></div>
        <div class="kb-retrieve-list">
          <div v-for="(row, idx) in results" :key="row.vectorId" class="kb-retrieve-card">
            <div class="kb-retrieve-card-head">
              <span class="kb-retrieve-card-rank">#{{ idx + 1 }}</span>
              <span class="kb-retrieve-card-score" :style="{ color: scoreColor(row.score) }">{{ row.score.toFixed(3) }}</span>
              <el-tag size="small" :type="row.chunkType === 'text' ? 'info' : 'warning'" effect="plain">{{ row.chunkType }}</el-tag>
              <span class="kb-retrieve-card-doc">
                <el-icon :color="({ pdf: '#C96442', docx: '#2c5fb8', doc: '#2c5fb8', xlsx: '#2e8b57', xls: '#2e8b57', pptx: '#c27a22', ppt: '#c27a22', md: '#555', txt: '#555', csv: '#2e8b57' }[row.fileType] as string) || '#666'"><QuestionFilled /></el-icon>
                <span :title="row.fileName">{{ row.fileName }}</span>
              </span>
            </div>
            <div class="kb-retrieve-card-body">
              <pre class="kb-retrieve-card-content" :class="{ 'kb-retrieve-card-content-expanded': expanded.has(row.vectorId) }" :data-vid="row.vectorId">{{ row.content }}</pre>
              <el-button v-if="overflow.has(row.vectorId)" link type="primary" size="small" class="kb-retrieve-card-toggle" @click="toggle(row.vectorId)">{{ expanded.has(row.vectorId) ? '收起' : '展开全部' }}</el-button>
            </div>
            <div class="kb-retrieve-card-foot">
              <span class="kb-retrieve-card-meta-item"><span class="kb-retrieve-card-meta-key">切片#</span><span class="mono">{{ row.chunkIndex }}</span></span>
              <span class="kb-retrieve-card-meta-item" v-if="row.position" :title="row.position"><span class="kb-retrieve-card-meta-key">位置</span><span class="mono small">{{ row.position.slice(0, 30) }}</span></span>
              <span class="kb-retrieve-card-meta-item" :title="row.vectorId"><span class="kb-retrieve-card-meta-key">向量</span><span class="mono small">{{ row.vectorId.slice(0, 8) }}</span></span>
            </div>
          </div>
        </div>
      </template>
      <div class="kb-retrieve-empty" v-else-if="!loading && searched">
        <el-icon :size="40"><Search /></el-icon>
        <p>未命中相关切片, 请尝试调整查询内容或降低阈值</p>
      </div>
      <div class="kb-retrieve-empty" v-else>
        <el-icon :size="40"><Search /></el-icon>
        <p>输入查询内容进行语义检索</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-retrieve { display: flex; gap: 16px; padding: 6px 0 0; min-height: 500px; }
.kb-retrieve-left { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px; background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); align-self: flex-start; position: sticky; top: 8px; }
.kb-retrieve-left-section { display: flex; flex-direction: column; gap: 8px; }
.kb-retrieve-left-label { font-size: 13px; font-weight: 600; color: var(--muted-foreground); }
.kb-retrieve-left-options { display: flex; flex-direction: column; gap: 18px; }
.kb-retrieve-option { display: flex; flex-direction: column; gap: 6px; }
.kb-retrieve-option-head { display: flex; align-items: center; justify-content: space-between; }
.kb-retrieve-option-label { font-size: 13px; color: var(--muted-foreground); white-space: nowrap; }
.kb-retrieve-option-value { font-size: 13px; font-weight: 600; font-family: var(--font-mono); color: var(--primary); }
.kb-retrieve-divider { border-top: 1px dashed var(--border-100); margin: 16px 0 0; padding-top: 16px; }
.kb-retrieve-btn { width: 100%; }
.kb-retrieve-right { flex: 1; min-width: 0; min-height: 400px; }
.kb-retrieve-meta { font-size: 13px; color: var(--muted-foreground); margin-bottom: 10px; }
.kb-retrieve-list { display: flex; flex-direction: column; gap: 12px; }
.kb-retrieve-card { background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--shadow-sm); transition: border-color .15s ease, box-shadow .15s ease; }
.kb-retrieve-card:hover { border-color: color-mix(in srgb, var(--primary) 30%, var(--border-100)); box-shadow: var(--shadow-md); }
.kb-retrieve-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kb-retrieve-card-rank { font-size: 14px; font-weight: 700; color: var(--primary); min-width: 28px; }
.kb-retrieve-card-score { font-size: 14px; font-weight: 700; font-family: var(--font-mono); }
.kb-retrieve-card-doc { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted-foreground); margin-left: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 200px; }
.kb-retrieve-card-body { display: flex; flex-direction: column; gap: 4px; }
.kb-retrieve-card-content { margin: 0; padding: 10px 12px; background: rgba(0, 0, 0, 0.02); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 72px; overflow: hidden; color: var(--foreground); transition: max-height .25s ease; }
.kb-retrieve-card-content-expanded { max-height: 500px; overflow-y: auto; }
.kb-retrieve-card-toggle { align-self: flex-start; padding: 0; font-size: 12px; }
.kb-retrieve-card-foot { display: flex; flex-wrap: wrap; gap: 14px; padding-top: 8px; border-top: 1px dashed var(--border-100); }
.kb-retrieve-card-meta-item { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; }
.kb-retrieve-card-meta-key { color: var(--muted-foreground); }
.kb-retrieve-empty { padding: 60px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--muted-foreground); background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.mono.small { font-size: 12px; }
</style>
