<script setup lang="ts">
/**
 * Tab2: 切片详情 — 卡片网格 + 分页 + 按文档过滤
 */
import { reactive, ref } from 'vue'
import { Refresh, Grid, QuestionFilled } from '@element-plus/icons-vue'
import { documentApis } from '@/apis'
import type { ChunkRow, DocumentRow } from '@/types'

const props = defineProps<{
  kbId: string
  docsList: DocumentRow[]
}>()

const loading = ref(false)
const list = ref<ChunkRow[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const docFilter = ref<string>('')
const loaded = ref(false)

async function load(resetPage = false) {
  if (!props.kbId || props.kbId === 'undefined') return
  if (resetPage) pagination.page = 1
  loading.value = true
  try {
    const params: Record<string, any> = {
      kbId: props.kbId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (docFilter.value) params.docId = docFilter.value
    const res = await documentApis.listChunks(params)
    list.value = res.items
    pagination.total = res.total
    loaded.value = true
  } catch {
    // 拦截器已处理
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) { pagination.page = p; load() }
function onSizeChange(s: number) { pagination.pageSize = s; load(true) }

defineExpose({ load, loaded })
</script>

<template>
  <div class="kb-chunks-tab">
    <!-- 工具栏 -->
    <div class="kb-chunks-toolbar">
      <div class="kb-chunks-toolbar-left">
        <el-select
          v-model="docFilter"
          placeholder="按文档过滤"
          clearable
          filterable
          style="width: 280px"
          @change="load(true)"
        >
          <el-option
            v-for="d in docsList.filter((x) => !x._localTemp)"
            :key="d.id"
            :label="d.fileName"
            :value="d.id"
          />
        </el-select>
        <span class="kb-chunks-tip">共 {{ pagination.total }} 条切片</span>
      </div>
      <div class="kb-chunks-toolbar-right">
        <el-button :icon="Refresh" @click="load(true)">刷新</el-button>
      </div>
    </div>

    <!-- 切片卡片列表 -->
    <div class="kb-chunk-grid" v-loading="loading">
      <div v-for="row in list" :key="row.id" class="kb-chunk-card">
        <div class="kb-chunk-card-head">
          <div class="kb-chunk-card-doc">
            <el-icon
              class="kb-chunk-card-doc-icon"
              :color="({ pdf: '#C96442', docx: '#2c5fb8', doc: '#2c5fb8', xlsx: '#2e8b57', xls: '#2e8b57', pptx: '#c27a22', ppt: '#c27a22', md: '#555', txt: '#555', csv: '#2e8b57' }[row.document.fileType] as string) || '#666'"
            ><QuestionFilled /></el-icon>
            <span class="kb-chunk-card-doc-name" :title="row.document.fileName">{{ row.document.fileName }}</span>
          </div>
          <div class="kb-chunk-card-tags">
            <el-tag size="small" :type="row.chunkType === 'text' ? 'info' : 'warning'" effect="plain">{{ row.chunkType }}</el-tag>
            <el-tag size="small" :type="row.indexed === 1 ? 'success' : 'danger'" effect="plain">{{ row.indexed === 1 ? '已索引' : '未索引' }}</el-tag>
          </div>
        </div>
        <div class="kb-chunk-card-body">
          <el-tooltip
            :content="row.content"
            :disabled="row.content.length <= 150"
            placement="top"
            effect="light"
            :show-after="200"
            popper-class="kb-chunk-tooltip"
          >
            <pre class="kb-chunk-card-content">{{ row.content }}</pre>
          </el-tooltip>
        </div>
        <div class="kb-chunk-card-foot">
          <span class="kb-chunk-card-meta-item"><span class="kb-chunk-card-meta-key">#</span><span class="mono">{{ row.chunkIndex }}</span></span>
          <span class="kb-chunk-card-meta-item"><span class="kb-chunk-card-meta-key">字数</span><span class="mono">{{ row.charCount }}</span></span>
          <span class="kb-chunk-card-meta-item" :title="row.vectorId"><span class="kb-chunk-card-meta-key">向量</span><span class="mono small">{{ row.vectorId.slice(0, 8) }}</span></span>
          <span class="kb-chunk-card-meta-item" v-if="row.position" :title="row.position"><span class="kb-chunk-card-meta-key">位置</span><span class="mono small">{{ row.position.slice(0, 30) }}</span></span>
        </div>
      </div>
      <div class="kb-chunk-empty" v-if="!loading && list.length === 0">
        <el-icon :size="40"><Grid /></el-icon>
        <p>暂无切片数据</p>
      </div>
    </div>

    <!-- 分页 -->
    <div class="kb-chunks-pagination">
      <el-pagination
        :current-page="pagination.page"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @size-change="onSizeChange"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.kb-chunks-tab { display: flex; flex-direction: column; gap: 14px; padding: 6px 0 0; }
.kb-chunks-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.kb-chunks-toolbar-left, .kb-chunks-toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kb-chunks-tip { font-size: 12px; color: var(--muted-foreground); }
.kb-chunk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; min-height: 120px; }
.kb-chunk-card { background: var(--card); border: 1px solid var(--border-100); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-sm); transition: border-color .15s ease, box-shadow .15s ease; }
.kb-chunk-card:hover { border-color: color-mix(in srgb, var(--primary) 30%, var(--border-100)); box-shadow: var(--shadow-md); }
.kb-chunk-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.kb-chunk-card-doc { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
.kb-chunk-card-doc-icon { flex-shrink: 0; font-size: 14px; }
.kb-chunk-card-doc-name { font-size: 13px; font-weight: 500; color: var(--foreground); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kb-chunk-card-tags { display: flex; gap: 6px; flex-shrink: 0; }
.kb-chunk-card-body { display: flex; flex-direction: column; }
.kb-chunk-card-content { margin: 0; padding: 10px 12px; background: rgba(0, 0, 0, 0.02); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 72px; overflow: hidden; color: var(--foreground); cursor: default; }
.kb-chunk-card-foot { display: flex; flex-wrap: wrap; gap: 14px; padding-top: 10px; border-top: 1px dashed var(--border-100); }
.kb-chunk-card-meta-item { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; }
.kb-chunk-card-meta-key { color: var(--muted-foreground); }
.kb-chunk-empty { grid-column: 1 / -1; padding: 60px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--muted-foreground); }
.kb-chunks-pagination { display: flex; justify-content: flex-end; padding-top: 4px; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.mono.small { font-size: 12px; }
</style>
