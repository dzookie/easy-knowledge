<script setup lang="ts">
/**
 * 知识库详情页
 *
 * 布局(从上到下三块):
 *  1. 顶部: 返回知识库列表箭头 + 面包屑
 *  2. 中部: 知识库信息(纯文本行, 不使用卡片)
 *     - 第一行: 名称 + 描述 + 类型Tag
 *     - 第二行: 创建人 · 创建时间 · 更新时间 · 状态 · 可见性 · 文档数 · 切片数
 *     - 第三行: 向量模型 · 切片策略/大小/重叠 · Qdrant集合(仅创建者/admin)
 *  3. 底部: Element Plus 原生 el-tabs (type=border-card 卡片风格)
 *     Tab1 原始文档: 完整 UI (上传按钮 + 文档表格 + 分页 20/页)
 *     Tab2 切片详情 / Tab3 知识检索 / Tab4 知识问答: 占位符
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  UploadFilled,
  Refresh,
  Search,
  Delete,
  Warning,
  Download,
  Document,
  Grid,
  QuestionFilled,
} from '@element-plus/icons-vue'
import { http } from '@/utils/http'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const kbId = computed(() => String(route.params.id))

/* ===== 类型 ===== */
interface Creator {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
}
interface KnowledgeDetail {
  id: string
  name: string
  description: string | null
  coverImage: string | null
  embeddingModel: string
  collection: string
  chunkStrategy: string
  chunkSize: number
  chunkOverlap: number
  documentCount: number
  chunkCount: number
  visibility: number
  status: number
  createdBy: string
  creator: Creator
  createdAt: string
  updatedAt: string
}
interface DocumentRow {
  id: string
  fileName: string
  fileType: string
  sizeBytes: number
  chunkCount: number
  totalChars: number
  status: number        // 0等待 1处理中 2成功 3失败
  errorMsg: string | null
  uploadedBy: string
  uploader: Creator
  createdAt: string
  processMs: number | null
  /** 前端本地占位: true 表示文件还在上传阶段, 后端文档记录尚未生成 (id 为本地临时负数) */
  _localTemp?: boolean
  /** 本地占位时的上传进度 0-100 */
  _progress?: number
}

/* ===== 上传中队列项 ===== */
interface UploadTaskItem {
  /** el-upload 的 uid, 用于跟回调对齐 */
  uid: number | string
  fileName: string
  fileType: string
  sizeBytes: number
  /** 0-100 */
  progress: number
  /** uploading=传输中 / done=HTTP 完成,进入处理队列 / error=上传失败 */
  status: 'uploading' | 'done' | 'error'
  errorMsg?: string
  /** 本地临时占位文档行的临时 id(负数), 避免与后端真实 ID 冲突 */
  tempId: string
}

/* ===== 知识库详情 ===== */
const kbLoading = ref(false)
const kb = ref<KnowledgeDetail | null>(null)

async function loadKbDetail() {
  if (!kbId.value || kbId.value === 'undefined') return
  kbLoading.value = true
  try {
    kb.value = await http.get<KnowledgeDetail>(`/api/knowledge/${kbId.value}`)
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
function formatDate(iso?: string) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 10)
}
function creatorLabel(c?: Creator) {
  if (!c) return '-'
  return c.nickname || c.username || '-'
}

/* 是否能操作(创建者或 admin) */
const canOperate = computed(() => {
  if (!kb.value) return false
  return authStore.isAdmin || kb.value.createdBy === authStore.user?.id
})

/* 返回知识库列表 */
function goBack() {
  router.push({ name: 'admin-knowledge' })
}

/* ===== Tab ===== */
const activeTab = ref('documents')

/* ===== 原始文档列表 ===== */
const docsLoading = ref(false)
const docsList = ref<DocumentRow[]>([])
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})
const searchKeyword = ref('')

/* 类型 tag 颜色 */
const fileTypeColor: Record<string, string> = {
  pdf: 'danger',
  docx: 'primary',
  doc: 'primary',
  xlsx: 'success',
  xls: 'success',
  pptx: 'warning',
  ppt: 'warning',
  md: 'info',
  txt: 'info',
  csv: 'success',
}
function fileTypeLabel(type: string) {
  return type ? type.toUpperCase() : '-'
}

/* 状态 tag */
function statusTag(s: number) {
  return {
    0: { label: '等待处理', type: 'info' },
    1: { label: '处理中', type: 'warning' },
    2: { label: '处理成功', type: 'success' },
    3: { label: '处理失败', type: 'danger' },
  }[s] ?? { label: '未知', type: 'info' }
}

/* 文件大小格式化 */
function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 0)} ${units[i]}`
}

/* 加载文档列表 */
async function loadDocs(resetPage = false) {
  if (!kbId.value || kbId.value === 'undefined') {
    return
  }
  if (resetPage) pagination.page = 1
  docsLoading.value = true
  // ⚠️ nextTick 让 v-loading 先把骨架屏渲染出来(强制 el-table DOM 全量重建),
  // 避免 Element Plus 按 index 复用 DOM 导致"数据已到但视图不刷新,筛选一次才出来"的经典问题
  await nextTick()
  try {
    const params: Record<string, any> = {
      kbId: kbId.value,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (searchKeyword.value && searchKeyword.value.trim()) {
      params.keyword = searchKeyword.value.trim()
    }
    const res: any = await http.get('/api/document', { params })
    const items = (res.items || []) as DocumentRow[]
    // ⚠️ 生成新引用 + 按 id 去重（避免占位行还在时真实数据回来重复渲染）
    const seen = new Set<string>()
    const merged: DocumentRow[] = []
    // 先放真实数据
    for (const r of items) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      merged.push(r)
    }
    // 再放本地占位行(若有), 它们 id 是 tmp_xx 不会和真实冲突
    for (const r of docsList.value) {
      if (!r._localTemp) continue
      if (seen.has(r.id)) continue
      seen.add(r.id)
      merged.unshift(r)
    }
    docsList.value = merged
    pagination.total = Number(res.total || 0) + (merged.length - items.length)
    /* eslint-disable no-console */
    console.log(
      `[KB loadDocs] kb=${kbId.value} page=${pagination.page}/${pagination.pageSize} realItems=${items.length} totalInDb=${res.total} merged=${merged.length} first3Ids=${merged.slice(0,3).map((x)=>`${x.id}:${x.fileName}`).join(' | ')}`,
    )
  } catch (e: any) {
    // ❌ 代理挂了/后端不可达时, 明确报错, 不要静默失败
    const msg = e?.message || e?.data?.message || String(e || '加载文档失败')
    console.error('[KB loadDocs ERROR]', e)
    ElMessage.error(`加载文档列表失败: ${msg}`)
    // 仍然保持 merged (保留占位行, 不让用户感觉"清空了")
  } finally {
    docsLoading.value = false
    startPollIfNeeded()
  }
}

/* 处理中轮询(默认不做,这里给用户手动点刷新。如果文档里存在 status=0/1, 给个 5s 间隔轮询最多 2 分钟) */
let pollTimer: any = null
function startPollIfNeeded() {
  stopPoll()
  const pending = docsList.value.some((d) => d.status === 0 || d.status === 1)
  if (!pending) return
  let count = 0
  pollTimer = setInterval(() => {
    count++
    if (count > 24) { stopPoll(); return } // 2 分钟后停
    loadDocs(false).then(() => {
      const still = docsList.value.some((d) => d.status === 0 || d.status === 1)
      if (!still) stopPoll()
    })
  }, 5000)
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

/* 分页改变 */
function onPageChange(p: number) {
  pagination.page = p
  loadDocs()
}
function onSizeChange(s: number) {
  pagination.pageSize = s
  loadDocs(true)
}

/* 刷新 */
function refresh() {
  loadDocs(true)
  loadKbDetail()
}

/* ===== 上传文档 ===== */
const uploading = ref(false)
const uploadRef = ref()
const uploadFileList = ref<any[]>([])  // 受控: v-model:file-list 绑定, 保证响应式及时
const uploadQueue = ref<UploadTaskItem[]>([])
/** 本地临时占位 ID 生成器, 用负数递增 (避免跟后端 BigInt 转成的字符串冲突) */
let tempIdSeq = -1
function nextTempId(): string {
  tempIdSeq -= 1
  return `tmp_${tempIdSeq}`
}
const uploadAccept = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.md,.txt,.csv'
/* 上传地址: 走 Vite dev server 代理到后端 3030 (/api -> http://localhost:3030) */
const uploadAction = '/api/document/upload'
/* 上传请求头封装(computed, 保证 token 更新后响应) */
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${authStore.token}`,
}))

/** 根据文件扩展名取类型(小写不带点) */
function extFromName(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/* 上传前校验 */
function beforeUpload(file: any) {
  const maxSize = 100 * 1024 * 1024 // 100MB
  if (file.size > maxSize) {
    ElMessage.error(`文件不能超过 100MB: ${file.name}`)
    return false
  }
  return true
}

/** 乐观插入本地占位行到 docsList 顶部 (用户立即看到文件, 不用等 HTTP round trip) */
function ensureTempRow(task: UploadTaskItem) {
  // 相同 tempId 不重复加
  if (docsList.value.some((r) => r.id === task.tempId)) return
  const me = authStore.user
  const tempRow: DocumentRow = {
    id: task.tempId,
    fileName: task.fileName,
    fileType: task.fileType,
    sizeBytes: task.sizeBytes,
    chunkCount: 0,
    totalChars: 0,
    status: 0,
    errorMsg: null,
    uploadedBy: me?.id || '',
    uploader: me
      ? { id: me.id, username: me.username, nickname: me.nickname || null, avatar: me.avatar || null }
      : (null as unknown as Creator),
    createdAt: new Date().toISOString(),
    processMs: null,
    _localTemp: true,
    _progress: task.progress,
  }
  docsList.value = [tempRow, ...docsList.value]
  pagination.total = Number(pagination.total || 0) + 1
}

/** 从 docsList 里移除本地占位行 */
function removeTempRow(tempId: string) {
  const before = docsList.value.length
  docsList.value = docsList.value.filter((r) => r.id !== tempId)
  const removed = before - docsList.value.length
  if (removed > 0) pagination.total = Math.max(0, Number(pagination.total || 0) - removed)
}

/** 同步占位行的上传进度 (让表格里的状态列也能显示上传中) */
function syncTempProgress(uid: number | string, progress: number) {
  const t = uploadQueue.value.find((x) => x.uid === uid)
  if (!t) return
  t.progress = progress
  const row = docsList.value.find((r) => r.id === t.tempId)
  if (row && row._localTemp) row._progress = progress
}

/* on-change: 只负责「选好文件就立刻入队 + 插占位」.
 * 真正的上传 Promise / 进度 / 成功 / 失败全交给 customUploadRequest.
 * 彻底绕开 Element Plus 的 file.status 状态机 (不同版本值不一致是万年坑).
 */
function onUploadChange(info: any) {
  const raw = info.file
  if (!raw || !raw.uid) return
  const uid = raw.uid

  // 只要 uid 不在队列里, 无脑入队 + 插占位行 (用户立即能看到)
  const task = uploadQueue.value.find((t) => t.uid === uid)
  if (task) return

  const fileName = raw.name || '未命名文件'
  const fileType = extFromName(fileName) || 'bin'
  const newTask: UploadTaskItem = {
    uid,
    fileName,
    fileType,
    sizeBytes: Number(raw.size || 0),
    progress: 0,
    status: 'uploading',
    tempId: nextTempId(),
  }
  uploadQueue.value = [...uploadQueue.value, newTask]
  ensureTempRow(newTask)
  uploading.value = true
}

/** ✅ 自定义上传实现 (http-request), 这是按你的需求"数据库写入完就立刻拉列表"写的:
 *
 *  1. 调 http.postForm → XMLHttpRequest 上传, 百分比回调实时写到上传队列 + 表格占位行
 *  2. Promise resolve = HTTP 200 + code=200, 说明:
 *     - 后端 document.create 事务已提交
 *     - pipeline 也已经异步启动了 (setImmediate -> processDocument)
 *  3. 立即:
 *     - removeTempRow  -> 清空本地占位
 *     - loadDocs(true)  -> 拉 DB 里真实 document (此时 status=0 等待处理, 会在表格里显示)
 *     - loadKbDetail    -> 更新知识库统计总数
 *     - 5s 轮询接着刷 status, 直到处理成功
 *  4. Promise reject = 任何错误 (网络 / 业务错误), 把队列 + 占位行都标红, 显示具体原因
 */
async function customUploadRequest(options: any) {
  const file: File | undefined = options?.file
  const uid: number | string | undefined = file && (file as any).uid != null ? (file as any).uid : options?.file?.uid
  if (!file || !uid) return
  const task = uploadQueue.value.find((t) => t.uid === uid)
  if (!task) {
    // 兜底: onUploadChange 没触发过也不应该出现, 出现了就补 task
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
  }
  const currentTask = uploadQueue.value.find((t) => t.uid === uid)!
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('kbId', String(kbId.value))

    const doc = await http.postForm<any>('/api/document/upload', form, {
      onProgress: (p) => {
        currentTask.progress = p
        syncTempProgress(uid, p)
      },
    })

    // ✅ 数据库写入完成 (HTTP 响应已返回, document 在 DB 里了)
    currentTask.status = 'done'
    currentTask.progress = 100
    syncTempProgress(uid, 100)
    uploading.value = uploadQueue.value.some((t) => t.status === 'uploading')
    ElMessage.success(`${currentTask.fileName} 上传完成, 正在解析并向量化… (文档 id=${doc?.id ?? '?'})`)

    // 给 UI 600ms 展示"上传完成 100%", 然后立刻拉真实列表
    setTimeout(() => {
      removeTempRow(currentTask.tempId)
      uploadQueue.value = uploadQueue.value.filter((t) => t.uid !== uid)
      uploadRef.value?.clearFiles()
      loadDocs(true)
      loadKbDetail()
    }, 600)
  } catch (e: any) {
    currentTask.status = 'error'
    const msg = e?.message || `上传失败: ${currentTask.fileName}`
    currentTask.errorMsg = msg
    uploading.value = uploadQueue.value.some((t) => t.status === 'uploading')
    const row = docsList.value.find((r) => r.id === currentTask.tempId)
    if (row) {
      row.status = 3
      row.errorMsg = msg
      if (row._localTemp) row._progress = 0
    }
    setTimeout(() => uploadRef.value?.clearFiles(), 600)
  }
}

/** 用户点击"上传中队列"里失败项的删除/重试 这里提供移除单条占位/队列的入口 */
function dismissUploadTask(uid: number | string) {
  const t = uploadQueue.value.find((x) => x.uid === uid)
  if (t) removeTempRow(t.tempId)
  uploadQueue.value = uploadQueue.value.filter((x) => x.uid !== uid)
}

/* 删除文档 */
function handleDeleteDoc(row: DocumentRow) {
  ElMessageBox.confirm(
    `确定删除文档「${row.fileName}」吗? 相关切片也会一并清理(Qdrant 向量同步删除)。`,
    '删除文档',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(async () => {
    try {
      await http.delete(`/api/document/${row.id}`)
      ElMessage.success('删除成功,相关向量和切片正在异步清理')
      loadDocs()
      loadKbDetail()
    } catch {}
  }).catch(() => {})
}

/* ===== 监听路由 kbId: 所有依赖 (pagination/docsList/loadDocs) 都已声明后再注册, 避免 immediate TDZ ===== */
watch(kbId, (v, ov) => {
  if (v && v !== 'undefined' && v !== ov) {
    loadKbDetail()
    loadDocs(true)
  }
}, { immediate: true })
onMounted(stopPoll) // onMounted 占位(真正的首请求由 watch immediate 负责)
onBeforeUnmount(stopPoll) // 切走页面必须清轮询, 否则继续打后端
</script>

<template>
  <div class="kb-detail-page">

    <!-- ============ 第一块: 返回箭头 + 面包屑 ============ -->
    <div class="kb-detail-header">
      <div class="kb-detail-header-left">
        <el-button
          text
          size="large"
          class="kb-back-btn"
          :icon="ArrowLeft"
          @click="goBack"
        >
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

    <!-- ============ 第二块: 知识库信息(纯文本,不用卡片) ============ -->
    <div class="kb-detail-meta" v-loading="kbLoading">
      <!-- 行1: 名称 + 描述 -->
      <div class="kb-meta-row-1">
        <h1 class="kb-meta-name" :title="kb?.name">{{ kb?.name || '知识库名称' }}</h1>
      </div>
      <div class="kb-meta-desc">
        {{ kb?.description || '暂未填写描述' }}
      </div>

      <!-- 行2: 创建人 · 创建时间 · 更新时间 · 状态 · 可见性 · 文档数 · 切片数 -->
      <div class="kb-meta-row-2">
        <span class="kb-meta-item">
          <span class="kb-meta-label">创建人：</span>
          <span class="kb-meta-value">{{ creatorLabel(kb?.creator) }}</span>
          <el-tag
            v-if="kb?.createdBy === authStore.user?.id"
            type="primary"
            effect="plain"
            size="small"
            round
            style="margin-left: 4px;"
          >我</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">创建时间：</span>
          <span class="kb-meta-value mono">{{ formatDateTime(kb?.createdAt) }}</span>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">更新时间：</span>
          <span class="kb-meta-value mono">{{ formatDateTime(kb?.updatedAt) }}</span>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">状态：</span>
          <el-tag
            v-if="kb?.status === 1"
            type="success"
            effect="light"
            size="small"
            round
          >正常</el-tag>
          <el-tag v-else type="info" effect="light" size="small" round>已禁用</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">可见性：</span>
          <el-tag
            :type="kb?.visibility === 0 ? 'warning' : 'primary'"
            effect="plain"
            size="small"
            round
          >{{ visibilityLabel(kb?.visibility ?? 0) }}</el-tag>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">文档数：</span>
          <span class="kb-meta-value mono">{{ kb?.documentCount ?? 0 }}</span>
        </span>
        <span class="kb-meta-dot">·</span>
        <span class="kb-meta-item">
          <span class="kb-meta-label">切片数：</span>
          <span class="kb-meta-value mono">{{ kb?.chunkCount ?? 0 }}</span>
        </span>
      </div>

      <!-- 行3: 向量模型 · 切片策略/大小/重叠 · Qdrant集合 -->
      <div class="kb-meta-row-3">
        <span class="kb-meta-item">
          <span class="kb-meta-label">向量模型：</span>
          <el-tag type="primary" effect="plain" size="small">
            {{ kb?.embeddingModel || '-' }}
          </el-tag>
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

    <!-- ============ 第三块: Element Plus 原生卡片风格 Tabs ============ -->
    <el-tabs
      v-model="activeTab"
      type="border-card"
      class="kb-detail-tabs"
    >
      <!-- Tab1: 原始文档 -->
      <el-tab-pane label="原始文档" name="documents">
        <div class="kb-documents-tab">
          <!-- 工具栏 -->
          <div class="kb-doc-toolbar">
            <div class="kb-doc-toolbar-left">
              <el-upload
                ref="uploadRef"
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
              <div class="kb-doc-tip">
                支持 {{ uploadAccept }} · 单文件 ≤ 100MB
              </div>
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

          <!-- 上传中队列(传输中/已失败) -->
          <div class="kb-upload-queue" v-if="uploadQueue.length > 0">
            <div
              v-for="t in uploadQueue"
              :key="t.uid"
              class="kb-upload-queue-item"
            >
              <div class="kb-upload-queue-item-left">
                <el-icon
                  class="kb-upload-queue-icon"
                  :color="
                    { pdf: '#C96442', docx: '#2c5fb8', doc: '#2c5fb8', xlsx: '#2e8b57', xls: '#2e8b57', pptx: '#c27a22', ppt: '#c27a22', md: '#555', txt: '#555', csv: '#2e8b57' }[t.fileType] || '#666'
                  "
                ><QuestionFilled /></el-icon>
                <div class="kb-upload-queue-meta">
                  <div class="kb-upload-queue-name" :title="t.fileName">{{ t.fileName }}</div>
                  <div class="kb-upload-queue-sub">
                    <span class="mono">{{ formatSize(t.sizeBytes) }}</span>
                    <el-tag
                      v-if="t.status === 'uploading'"
                      size="small"
                      type="primary"
                      effect="plain"
                      round
                    >
                      上传中 {{ t.progress }}%
                    </el-tag>
                    <el-tag
                      v-else-if="t.status === 'done'"
                      size="small"
                      type="success"
                      effect="light"
                      round
                    >
                      上传完成, 正在处理…
                    </el-tag>
                    <el-tooltip
                      v-else-if="t.status === 'error'"
                      :content="t.errorMsg"
                      placement="top"
                    >
                      <el-tag size="small" type="danger" effect="light" round>
                        上传失败
                      </el-tag>
                    </el-tooltip>
                  </div>
                  <el-progress
                    v-if="t.status === 'uploading'"
                    :percentage="t.progress"
                    :stroke-width="4"
                    :show-text="false"
                    style="margin-top: 6px"
                  />
                  <el-progress
                    v-else-if="t.status === 'done'"
                    :percentage="100"
                    :stroke-width="4"
                    status="success"
                    :show-text="false"
                    style="margin-top: 6px"
                  />
                  <el-progress
                    v-else
                    :percentage="100"
                    :stroke-width="4"
                    status="exception"
                    :show-text="false"
                    style="margin-top: 6px"
                  />
                </div>
              </div>
              <el-button
                v-if="t.status !== 'uploading'"
                text
                size="small"
                type="danger"
                @click="dismissUploadTask(t.uid)"
              >
                移除
              </el-button>
            </div>
          </div>

          <!-- 文档表格 -->
          <div class="kb-doc-table-wrap" v-loading="docsLoading">
            <el-table
              :data="docsList"
              row-key="id"
              stripe
              style="width: 100%"
              empty-text="暂无文档,点击上方「上传文档」开始吧"
            >
              <el-table-column prop="fileName" label="文件名" min-width="260" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="kb-doc-name">
                    <el-icon
                      class="kb-doc-name-icon"
                      :color="
                        { pdf: '#C96442', docx: '#2c5fb8', doc: '#2c5fb8', xlsx: '#2e8b57', xls: '#2e8b57', pptx: '#c27a22', ppt: '#c27a22', md: '#555', txt: '#555', csv: '#2e8b57' }[row.fileType] || '#666'
                      "
                    ><QuestionFilled /></el-icon>
                    <span :title="row.fileName">{{ row.fileName }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="类型" width="86" align="center">
                <template #default="{ row }">
                  <el-tag
                    :type="(fileTypeColor[row.fileType] as any) ?? 'info'"
                    effect="light"
                    size="small"
                    round
                  >
                    {{ fileTypeLabel(row.fileType) }}
                  </el-tag>
                </template>
              </el-table-column>

              <el-table-column label="大小" width="110" align="right">
                <template #default="{ row }">
                  <span class="mono">{{ formatSize(row.sizeBytes) }}</span>
                </template>
              </el-table-column>

              <el-table-column prop="chunkCount" label="切片" width="86" align="center">
                <template #default="{ row }">
                  <span class="mono">{{ row.chunkCount || 0 }}</span>
                </template>
              </el-table-column>

              <el-table-column label="状态" width="130" align="center">
                <template #default="{ row }">
                  <!-- 本地占位行: 上传中显示百分比, 失败显示失败 -->
                  <template v-if="row._localTemp">
                    <el-tag
                      v-if="row.status === 3"
                      type="danger"
                      effect="light"
                      size="small"
                      round
                    >
                      上传失败
                    </el-tag>
                    <el-tag
                      v-else
                      type="primary"
                      effect="plain"
                      size="small"
                      round
                    >
                      上传中 {{ row._progress ?? 0 }}%
                    </el-tag>
                  </template>
                  <template v-else>
                    <el-tooltip
                      v-if="row.status === 3 && row.errorMsg"
                      :content="row.errorMsg"
                      placement="top"
                    >
                      <el-tag
                        :type="(statusTag(row.status).type as any)"
                        effect="light"
                        size="small"
                        round
                      >
                        {{ statusTag(row.status).label }}
                      </el-tag>
                    </el-tooltip>
                    <el-tag
                      v-else
                      :type="(statusTag(row.status).type as any)"
                      effect="light"
                      size="small"
                      round
                    >
                      {{ statusTag(row.status).label }}
                    </el-tag>
                  </template>
                </template>
              </el-table-column>

              <el-table-column label="上传者" width="110" align="center">
                <template #default="{ row }">
                  <div class="kb-doc-uploader" :title="creatorLabel(row.uploader)">
                    <div
                      v-if="row.uploader?.avatar"
                      class="kb-doc-uploader-avatar"
                      :style="{ backgroundImage: `url(${row.uploader.avatar})` }"
                    />
                    <div v-else class="kb-doc-uploader-avatar kb-doc-uploader-avatar-text">
                      {{ (row.uploader?.nickname || row.uploader?.username || '?').slice(0, 1).toUpperCase() }}
                    </div>
                    <span class="kb-doc-uploader-name">{{ creatorLabel(row.uploader) }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="上传时间" width="170" align="center">
                <template #default="{ row }">
                  <span class="mono small">{{ formatDateTime(row.createdAt) }}</span>
                </template>
              </el-table-column>

              <el-table-column label="操作" width="140" fixed="right" align="center" v-if="canOperate">
                <template #default="{ row }">
                  <el-button
                    text
                    type="primary"
                    size="small"
                    :icon="Download"
                    disabled
                    title="下载功能待开发"
                  >下载</el-button>
                  <el-button
                    text
                    type="danger"
                    size="small"
                    :icon="Delete"
                    :disabled="row._localTemp"
                    :title="row._localTemp ? '上传完成后可删除' : '删除文档及所有切片'"
                    @click="handleDeleteDoc(row)"
                  >删除</el-button>
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
      </el-tab-pane>

      <!-- Tab2: 切片详情 (占位) -->
      <el-tab-pane label="切片详情" name="chunks">
        <div class="kb-placeholder">
          <el-icon class="kb-placeholder-icon"><Grid /></el-icon>
          <h3 class="kb-placeholder-title">切片详情</h3>
          <p class="kb-placeholder-desc">
            展示该知识库下所有文档的切片清单: 原始 chunk 文本、chunk 类型(text/表格行)、
            在原文中的位置、Qdrant vectorId、是否已索引。后续开发。
          </p>
        </div>
      </el-tab-pane>

      <!-- Tab3: 知识检索 (占位) -->
      <el-tab-pane label="知识检索" name="retrieve">
        <div class="kb-placeholder">
          <el-icon class="kb-placeholder-icon"><Search /></el-icon>
          <h3 class="kb-placeholder-title">知识检索</h3>
          <p class="kb-placeholder-desc">
            手动输入查询, 实时走向量检索 + 重排, 可视化 topK 命中的 chunk、
            相似度打分、原文位置高亮。后续开发。
          </p>
        </div>
      </el-tab-pane>

      <!-- Tab4: 知识问答 (占位) -->
      <el-tab-pane label="知识问答" name="qa">
        <div class="kb-placeholder">
          <el-icon class="kb-placeholder-icon"><Warning /></el-icon>
          <h3 class="kb-placeholder-title">知识问答</h3>
          <p class="kb-placeholder-desc">
            基于该知识库的完整 RAG 对话: 引用来源、流式输出、
            可切换大模型、可调整 topK / 相似度阈值 / 重排器开关。后续开发。
          </p>
        </div>
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
  padding: 10px 4px 2px;
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

/* ============ 第二块: 知识库信息(纯文本) ============ */
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
.kb-meta-row-1 {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.kb-meta-name {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--font-serif);
  line-height: 1.25;
  word-break: break-all;
}
.kb-meta-type-tag {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  flex-shrink: 0;
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
.kb-meta-row-2 {
  border-top: 1px dashed var(--border-100);
}
.kb-meta-row-3 {
  border-top: 1px dashed var(--border-100);
}
.kb-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.kb-meta-label {
  color: var(--muted-foreground);
}
.kb-meta-value {
  color: var(--foreground);
  font-weight: 500;
}
.kb-meta-value.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.kb-meta-value.small {
  font-size: 12px;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-meta-dot {
  color: var(--border-200, #cbd5e1);
  font-weight: 600;
}
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.mono.small { font-size: 12px; }

/* ============ 第三块: Tabs ============ */
.kb-detail-tabs {
  margin: 0;
}

/* 覆盖 EP border-card tabs 头部 padding,让按钮区更紧凑 */
:deep(.kb-detail-tabs .el-tabs__header) {
  margin: 0;
}
:deep(.kb-detail-tabs .el-tabs__nav) {
  border: none;
}
:deep(.kb-detail-tabs .el-tabs__item) {
  font-size: 14px;
  font-weight: 500;
  height: 42px;
  line-height: 42px;
}
:deep(.kb-detail-tabs .el-tabs__item.is-active) {
  color: var(--primary);
  font-weight: 600;
}

/* ============ Tab1: 原始文档 ============ */
.kb-documents-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 0 0;
}
.kb-doc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.kb-doc-toolbar-left,
.kb-doc-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.kb-doc-tip {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* ===== 上传中队列 ===== */
.kb-upload-queue {
  margin: 12px 0;
  border: 1px solid var(--border-100);
  border-radius: var(--radius-md);
  background: rgba(64, 158, 255, 0.025);
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kb-upload-queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}
.kb-upload-queue-item:hover {
  background: rgba(64, 158, 255, 0.04);
}
.kb-upload-queue-item-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.kb-upload-queue-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.kb-upload-queue-meta {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}
.kb-upload-queue-name {
  font-size: 14px;
  color: var(--foreground);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.kb-upload-queue-sub {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.kb-doc-table-wrap {
  border: 1px solid var(--border-100);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.kb-doc-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kb-doc-name-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.kb-doc-uploader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  overflow: hidden;
}
.kb-doc-uploader-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.kb-doc-uploader-avatar-text {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 10px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
}
.kb-doc-uploader-name {
  font-size: 12px;
  color: var(--foreground);
  max-width: 62px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.kb-doc-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

/* ============ 占位 ============ */
.kb-placeholder {
  padding: 70px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.kb-placeholder-icon {
  font-size: 56px;
  color: var(--muted-foreground);
  opacity: .55;
}
.kb-placeholder-title {
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--font-serif);
}
.kb-placeholder-desc {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
  line-height: 1.6;
  max-width: 480px;
}
</style>
