<script setup lang="ts">
/**
 * Tab1: 原始文档 — 上传 + 文档表格 + 分页
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  UploadFilled,
  Refresh,
  Search,
  Delete,
  Download,
  QuestionFilled,
} from '@element-plus/icons-vue'
import { documentApis } from '@/apis'
import { useAuthStore } from '@/stores/auth'
import type { Creator, DocumentRow, UploadTaskItem } from '@/types'

const props = defineProps<{
  kbId: string
  canOperate: boolean
  docsList: DocumentRow[]
}>()

const emit = defineEmits<{
  (e: 'update:docsList', v: DocumentRow[]): void
  (e: 'refresh'): void
}>()

const authStore = useAuthStore()

/* 内部状态 */
const docsLoading = ref(false)
const searchKeyword = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const uploading = ref(false)
const uploadRef = ref()
const uploadQueue = ref<UploadTaskItem[]>([])
let tempIdSeq = -1
function nextTempId(): string {
  tempIdSeq -= 1
  return `tmp_${tempIdSeq}`
}
const uploadAccept = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.md,.txt,.csv'
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${authStore.token}`,
}))

const fileTypeColor: Record<string, string> = {
  pdf: 'danger', docx: 'primary', doc: 'primary',
  xlsx: 'success', xls: 'success', pptx: 'warning', ppt: 'warning',
  md: 'info', txt: 'info', csv: 'success',
}
function fileTypeLabel(type: string) { return type ? type.toUpperCase() : '-' }
function statusTag(s: number) {
  return {
    0: { label: '等待处理', type: 'info' },
    1: { label: '处理中', type: 'warning' },
    2: { label: '处理成功', type: 'success' },
    3: { label: '处理失败', type: 'danger' },
  }[s] ?? { label: '未知', type: 'info' }
}
function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 0)} ${units[i]}`
}
function formatDateTime(iso?: string) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}
function creatorLabel(c?: Creator) {
  if (!c) return '-'
  return c.nickname || c.username || '-'
}

/* 本地镜像: 跟踪最新加载的列表, 避免依赖 props 的异步更新 */
let latestList: DocumentRow[] = []

/* 加载文档 */
async function loadDocs(resetPage = false) {
  if (!props.kbId || props.kbId === 'undefined') return
  if (resetPage) pagination.page = 1
  docsLoading.value = true
  await nextTick()
  try {
    const params: Record<string, any> = {
      kbId: props.kbId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (searchKeyword.value && searchKeyword.value.trim()) {
      params.keyword = searchKeyword.value.trim()
    }
    const res = await documentApis.listDocument(params)
    const items = (res.items || []) as DocumentRow[]
    const seen = new Set<string>()
    const merged: DocumentRow[] = []
    for (const r of items) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      merged.push(r)
    }
    for (const r of props.docsList) {
      if (!r._localTemp) continue
      if (seen.has(r.id)) continue
      seen.add(r.id)
      merged.unshift(r)
    }
    latestList = merged
    emit('update:docsList', merged)
    pagination.total = Number(res.total || 0) + (merged.length - items.length)
  } catch (e: any) {
    const msg = e?.message || e?.data?.message || String(e || '加载文档失败')
    ElMessage.error(`加载文档列表失败: ${msg}`)
  } finally {
    docsLoading.value = false
    startPollIfNeeded()
  }
}

/* 轮询 */
let pollTimer: any = null
function startPollIfNeeded() {
  stopPoll()
  const pending = latestList.some((d) => d.status === 0 || d.status === 1)
  if (!pending) return
  let count = 0
  pollTimer = setInterval(() => {
    count++
    if (count > 24) { stopPoll(); return }
    loadDocs(false).then(() => {
      const still = latestList.some((d) => d.status === 0 || d.status === 1)
      if (!still) {
        stopPoll()
        // 轮询结束后刷新知识库统计 (文档数/切片数)
        emit('refresh')
      }
    })
  }, 5000)
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function onPageChange(p: number) { pagination.page = p; loadDocs() }
function onSizeChange(s: number) { pagination.pageSize = s; pagination.page = 1; loadDocs() }

function extFromName(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function beforeUpload(file: any) {
  const maxSize = 100 * 1024 * 1024
  if (file.size > maxSize) {
    ElMessage.error(`文件不能超过 100MB: ${file.name}`)
    return false
  }
  return true
}

function ensureTempRow(task: UploadTaskItem) {
  if (props.docsList.some((r) => r.id === task.tempId)) return
  const me = authStore.user
  const tempRow: DocumentRow = {
    id: task.tempId,
    fileName: task.fileName,
    fileType: task.fileType,
    sizeBytes: task.sizeBytes,
    chunkCount: 0, totalChars: 0, status: 0, errorMsg: null,
    uploadedBy: me?.id || '',
    uploader: me
      ? { id: me.id, username: me.username, nickname: me.nickname || null, avatar: me.avatar || null }
      : (null as unknown as Creator),
    createdAt: new Date().toISOString(),
    processMs: null, _localTemp: true, _progress: task.progress,
  }
  const newList = [tempRow, ...props.docsList]
  latestList = newList
  emit('update:docsList', newList)
  pagination.total = Number(pagination.total || 0) + 1
}

function removeTempRow(tempId: string) {
  const before = props.docsList.length
  const newList = props.docsList.filter((r) => r.id !== tempId)
  const removed = before - newList.length
  if (removed > 0) {
    latestList = newList
    emit('update:docsList', newList)
    pagination.total = Math.max(0, Number(pagination.total || 0) - removed)
  }
}

function syncTempProgress(uid: number | string, progress: number) {
  const t = uploadQueue.value.find((x) => x.uid === uid)
  if (!t) return
  t.progress = progress
  const row = props.docsList.find((r) => r.id === t.tempId)
  if (row && row._localTemp) row._progress = progress
}

function onUploadChange(info: any) {
  const raw = info.file
  if (!raw || !raw.uid) return
  const uid = raw.uid
  const task = uploadQueue.value.find((t) => t.uid === uid)
  if (task) return
  const fileName = raw.name || '未命名文件'
  const fileType = extFromName(fileName) || 'bin'
  const newTask: UploadTaskItem = {
    uid, fileName, fileType, sizeBytes: Number(raw.size || 0),
    progress: 0, status: 'uploading', tempId: nextTempId(),
  }
  uploadQueue.value = [...uploadQueue.value, newTask]
  ensureTempRow(newTask)
  uploading.value = true
}

async function customUploadRequest(options: any) {
  const file: File | undefined = options?.file
  const uid: number | string | undefined = file && (file as any).uid != null ? (file as any).uid : options?.file?.uid
  if (!file || !uid) return
  // 兜底: onUploadChange 没触发过也不应该出现, 出现了就补 task
  let currentTask = uploadQueue.value.find((t) => t.uid === uid)
  if (!currentTask) {
    const name = file.name || '未命名文件'
    const t: UploadTaskItem = {
      uid,
      fileName: name,
      fileType: extFromName(name) || 'bin',
      sizeBytes: Number(file.size || 0),
      progress: 0,
      status: 'uploading',
      tempId: nextTempId(),
    }
    uploadQueue.value = [...uploadQueue.value, t]
    ensureTempRow(t)
    currentTask = t
  }
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('kbId', String(props.kbId))
    const doc = await documentApis.uploadDocument<any>(form, {
      onProgress: (p) => { currentTask.progress = p; syncTempProgress(uid, p) },
    })
    currentTask.status = 'done'
    currentTask.progress = 100
    syncTempProgress(uid, 100)
    uploading.value = uploadQueue.value.some((t) => t.status === 'uploading')
    ElMessage.success(`${currentTask.fileName} 上传完成, 正在解析并向量化… (文档 id=${doc?.id ?? '?'})`)
    setTimeout(() => {
      removeTempRow(currentTask.tempId)
      uploadQueue.value = uploadQueue.value.filter((t) => t.uid !== uid)
      uploadRef.value?.clearFiles()
      loadDocs(true)
      emit('refresh')
    }, 600)
  } catch (e: any) {
    currentTask.status = 'error'
    const msg = e?.message || `上传失败: ${currentTask.fileName}`
    currentTask.errorMsg = msg
    uploading.value = uploadQueue.value.some((t) => t.status === 'uploading')
    const row = props.docsList.find((r) => r.id === currentTask.tempId)
    if (row) { row.status = 3; row.errorMsg = msg; if (row._localTemp) row._progress = 0 }
    setTimeout(() => uploadRef.value?.clearFiles(), 600)
  }
}

function dismissUploadTask(uid: number | string) {
  const t = uploadQueue.value.find((x) => x.uid === uid)
  if (t) removeTempRow(t.tempId)
  uploadQueue.value = uploadQueue.value.filter((x) => x.uid !== uid)
}

function handleDeleteDoc(row: DocumentRow) {
  ElMessageBox.confirm(
    `确定删除文档「${row.fileName}」吗? 相关切片也会一并清理(Qdrant 向量同步删除)。`,
    '删除文档',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(async () => {
    try {
      await documentApis.deleteDocument(row.id)
      ElMessage.success('删除成功,相关向量和切片正在异步清理')
      loadDocs()
      emit('refresh')
    } catch {}
  }).catch(() => {})
}

onBeforeUnmount(stopPoll)

defineExpose({ loadDocs })
</script>

<template>
  <div class="kb-documents-tab">
    <!-- 工具栏 -->
    <div class="kb-doc-toolbar">
      <div class="kb-doc-toolbar-left">
        <el-upload
          ref="uploadRef"
          action="#"
          :http-request="customUploadRequest"
          :multiple="true"
          :accept="uploadAccept"
          :before-upload="beforeUpload"
          :on-change="onUploadChange"
          :show-file-list="false"
          :auto-upload="true"
        >
          <el-button
            type="primary"
            :icon="UploadFilled"
            :loading="uploading"
            :disabled="!canOperate"
          >
            {{ uploading ? '上传中...' : '上传文档' }}
          </el-button>
        </el-upload>
        <div class="kb-doc-tip">支持 {{ uploadAccept }} · 单文件 ≤ 100MB</div>
      </div>
      <div class="kb-doc-toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索文件名"
          :prefix-icon="Search"
          clearable
          style="width: 240px"
          @keyup.enter="loadDocs(true)"
          @clear="loadDocs(true)"
        />
        <el-button :icon="Refresh" @click="loadDocs(true)">刷新</el-button>
      </div>
    </div>

    <!-- 上传中队列 -->
    <div class="kb-upload-queue" v-if="uploadQueue.length > 0">
      <div v-for="t in uploadQueue" :key="t.uid" class="kb-upload-queue-item">
        <div class="kb-upload-queue-item-left">
          <el-icon
            class="kb-upload-queue-icon"
            :color="({ pdf: '#C96442', docx: '#2c5fb8', doc: '#2c5fb8', xlsx: '#2e8b57', xls: '#2e8b57', pptx: '#c27a22', ppt: '#c27a22', md: '#555', txt: '#555', csv: '#2e8b57' }[t.fileType] as string) || '#666'"
          ><QuestionFilled /></el-icon>
          <div class="kb-upload-queue-meta">
            <div class="kb-upload-queue-name" :title="t.fileName">{{ t.fileName }}</div>
            <div class="kb-upload-queue-sub">
              <span class="mono">{{ formatSize(t.sizeBytes) }}</span>
              <el-tag v-if="t.status === 'uploading'" size="small" type="primary" effect="plain" round>上传中 {{ t.progress }}%</el-tag>
              <el-tag v-else-if="t.status === 'done'" size="small" type="success" effect="light" round>上传完成, 正在处理…</el-tag>
              <el-tooltip v-else-if="t.status === 'error'" :content="t.errorMsg" placement="top">
                <el-tag size="small" type="danger" effect="light" round>上传失败</el-tag>
              </el-tooltip>
            </div>
            <el-progress v-if="t.status === 'uploading'" :percentage="t.progress" :stroke-width="4" :show-text="false" style="margin-top: 6px" />
            <el-progress v-else-if="t.status === 'done'" :percentage="100" :stroke-width="4" status="success" :show-text="false" style="margin-top: 6px" />
            <el-progress v-else :percentage="100" :stroke-width="4" status="exception" :show-text="false" style="margin-top: 6px" />
          </div>
        </div>
        <el-button v-if="t.status !== 'uploading'" text size="small" type="danger" @click="dismissUploadTask(t.uid)">移除</el-button>
      </div>
    </div>

    <!-- 文档表格 -->
    <div class="kb-doc-table-wrap" v-loading="docsLoading">
      <el-table :data="docsList" row-key="id" stripe style="width: 100%" empty-text="暂无文档,点击上方「上传文档」开始吧">
        <el-table-column prop="fileName" label="文件名" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="kb-doc-name">
              <el-icon class="kb-doc-name-icon" :color="(fileTypeColor[row.fileType as string] as string) || '#666'"><QuestionFilled /></el-icon>
              <span :title="row.fileName">{{ row.fileName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="86" align="center">
          <template #default="{ row }">
            <el-tag :type="(fileTypeColor[row.fileType as string] as any) ?? 'info'" effect="light" size="small" round>{{ fileTypeLabel(row.fileType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="110" align="right">
          <template #default="{ row }"><span class="mono">{{ formatSize(row.sizeBytes) }}</span></template>
        </el-table-column>
        <el-table-column prop="chunkCount" label="切片" width="86" align="center">
          <template #default="{ row }"><span class="mono">{{ row.chunkCount || 0 }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="130" align="center">
          <template #default="{ row }">
            <template v-if="row._localTemp">
              <el-tag v-if="row.status === 3" type="danger" effect="light" size="small" round>上传失败</el-tag>
              <el-tag v-else type="primary" effect="plain" size="small" round>上传中 {{ row._progress ?? 0 }}%</el-tag>
            </template>
            <template v-else>
              <el-tooltip v-if="row.status === 3 && row.errorMsg" :content="row.errorMsg" placement="top">
                <el-tag :type="(statusTag(row.status).type as any)" effect="light" size="small" round>{{ statusTag(row.status).label }}</el-tag>
              </el-tooltip>
              <el-tag v-else :type="(statusTag(row.status).type as any)" effect="light" size="small" round>{{ statusTag(row.status).label }}</el-tag>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="上传者" width="110" align="center">
          <template #default="{ row }">
            <div class="kb-doc-uploader" :title="creatorLabel(row.uploader)">
              <div v-if="row.uploader?.avatar" class="kb-doc-uploader-avatar" :style="{ backgroundImage: `url(${row.uploader.avatar})` }" />
              <div v-else class="kb-doc-uploader-avatar kb-doc-uploader-avatar-text">{{ (row.uploader?.nickname || row.uploader?.username || '?').slice(0, 1).toUpperCase() }}</div>
              <span class="kb-doc-uploader-name">{{ creatorLabel(row.uploader) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="上传时间" width="170" align="center">
          <template #default="{ row }"><span class="mono small">{{ formatDateTime(row.createdAt) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right" align="center" v-if="canOperate">
          <template #default="{ row }">
            <el-button text type="primary" size="small" :icon="Download" disabled title="下载功能待开发">下载</el-button>
            <el-button text type="danger" size="small" :icon="Delete" :disabled="row._localTemp" :title="row._localTemp ? '上传完成后可删除' : '删除文档及所有切片'" @click="handleDeleteDoc(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="kb-doc-pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="onSizeChange"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.kb-documents-tab { display: flex; flex-direction: column; gap: 14px; padding: 6px 0 0; }
.kb-doc-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.kb-doc-toolbar-left, .kb-doc-toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kb-doc-tip { font-size: 12px; color: var(--muted-foreground); }
.kb-upload-queue { margin: 12px 0; border: 1px solid var(--border-100); border-radius: var(--radius-md); background: rgba(64, 158, 255, 0.025); padding: 8px 4px; display: flex; flex-direction: column; gap: 4px; }
.kb-upload-queue-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: var(--radius-sm); transition: background 0.15s ease; }
.kb-upload-queue-item:hover { background: rgba(64, 158, 255, 0.04); }
.kb-upload-queue-item-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
.kb-upload-queue-icon { margin-top: 2px; flex-shrink: 0; }
.kb-upload-queue-meta { flex: 1; min-width: 0; max-width: 100%; }
.kb-upload-queue-name { font-size: 14px; color: var(--foreground); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.kb-upload-queue-sub { margin-top: 2px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted-foreground); }
.kb-doc-table-wrap { border: 1px solid var(--border-100); border-radius: var(--radius-md); overflow: hidden; }
.kb-doc-name { display: flex; align-items: center; gap: 8px; }
.kb-doc-name-icon { flex-shrink: 0; font-size: 16px; }
.kb-doc-uploader { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; overflow: hidden; }
.kb-doc-uploader-avatar { width: 20px; height: 20px; border-radius: 50%; background-size: cover; background-position: center; flex-shrink: 0; }
.kb-doc-uploader-avatar-text { display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 10px; color: var(--primary); background: color-mix(in srgb, var(--primary) 16%, transparent); }
.kb-doc-uploader-name { font-size: 12px; color: var(--foreground); max-width: 62px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kb-doc-pagination { display: flex; justify-content: flex-end; padding-top: 4px; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.mono.small { font-size: 12px; }
</style>
