/**
 * 知识库相关类型
 *
 * Creator / KnowledgeRow / KnowledgeForm / KnowledgeDetail / DocumentRow / UploadTaskItem
 * 原来散在 index.vue 和 detail.vue 里且 Creator 重复定义了两遍, 此处统一提取.
 */

/** 知识库/文档的创建者信息 (后端 include uploader/creator 返回) */
export interface Creator {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
}

/** 知识库列表行 */
export interface KnowledgeRow {
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

/** 知识库详情 (与 KnowledgeRow 字段一致, 单独定义便于以后扩展详情独有字段) */
export interface KnowledgeDetail {
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

/** 创建/编辑知识库表单 */
export interface KnowledgeForm {
  id?: string
  name: string
  description: string
  embeddingModel: string
  chunkStrategy: string
  chunkSize: number
  chunkOverlap: number
  visibility: number
  status: number
}

/** 文档列表行 */
export interface DocumentRow {
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

/** 上传中队列项 */
export interface UploadTaskItem {
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
  /** 本地临时占位文档行的临时 id (负数), 避免与后端真实 ID 冲突 */
  tempId: string
}

/** 切片列表行 */
export interface ChunkRow {
  id: string
  documentId: string
  chunkIndex: number
  content: string
  chunkType: string
  position: string | null
  charCount: number
  tokenCount: number
  vectorId: string
  indexed: number
  createdAt: string
  document: {
    id: string
    fileName: string
    fileType: string
  }
}

/** 知识检索单条结果 */
export interface RetrievalResult {
  vectorId: string
  score: number
  content: string
  chunkIndex: number
  chunkType: string
  position: string | null
  docId: string | null
  fileName: string
  fileType: string
}

/** 知识检索响应 */
export interface RetrievalResponse {
  query: string
  kbId: string
  kbName: string
  total: number
  results: RetrievalResult[]
}

