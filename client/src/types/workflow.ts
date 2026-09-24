/**
 * 工作流前端类型定义
 *
 * 与后端 types/workflow.types.ts 保持一致, 用于 Vue Flow 画布和配置面板.
 */

/** 节点类型 */
export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'llm'
  | 'knowledge_retrieval'
  | 'template'
  | 'if_else'

/** 变量类型 */
export type VariableType = 'string' | 'number' | 'boolean' | 'object'

/** 起始节点入参变量 */
export interface WorkflowVariable {
  name: string
  label?: string
  type: VariableType
  required?: boolean
  default?: any
  options?: string[]
}

export interface NodePosition {
  x: number
  y: number
}

/** 节点配置基类 */
export interface BaseNodeConfig {}

export interface StartNodeConfig extends BaseNodeConfig {
  variables: WorkflowVariable[]
}

export interface EndNodeConfig extends BaseNodeConfig {
  outputs: Array<{
    name: string
    label?: string
    value: string
  }>
}

export interface LlmNodeConfig extends BaseNodeConfig {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

export interface KnowledgeRetrievalNodeConfig extends BaseNodeConfig {
  kbId: string
  query: string
  topK?: number
  scoreThreshold?: number
}

export interface TemplateNodeConfig extends BaseNodeConfig {
  template: string
}

export interface IfElseBranch {
  id: string
  label?: string
  conditions: Array<{
    left: string
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
    right: string
  }>
}

export interface IfElseNodeConfig extends BaseNodeConfig {
  branches: IfElseBranch[]
  defaultBranchId: string
}

export type WorkflowNodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | LlmNodeConfig
  | KnowledgeRetrievalNodeConfig
  | TemplateNodeConfig
  | IfElseNodeConfig

/** 工作流节点 (与 Vue Flow 节点兼容) */
export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  /** 节点标题 (前端展示用, 存在 label 里以兼容 Vue Flow) */
  label?: string
  position: NodePosition
  data: {
    title?: string
    config: WorkflowNodeConfig
  }
}

/** 工作流边 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  animated?: boolean
}

/** 工作流图 DSL */
export interface WorkflowGraph {
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

/** 工作流状态 */
export enum WorkflowStatus {
  DRAFT = 0,
  PUBLISHED = 1,
  ARCHIVED = 2,
}

/** 工作流运行状态 */
export enum WorkflowRunStatus {
  PENDING = 0,
  RUNNING = 1,
  SUCCESS = 2,
  FAILED = 3,
  CANCELED = 4,
}

/** 工作流列表行 */
export interface WorkflowRow {
  id: string
  code: string
  name: string
  description: string | null
  version: number
  status: number
  createdAt: string
  updatedAt: string
  creator: { id: string; username: string; nickname: string | null; avatar: string | null } | null
}

/** 工作流详情 */
export interface WorkflowDetail extends WorkflowRow {
  graph: WorkflowGraph
}

/** 运行历史行 */
export interface WorkflowRunRow {
  id: string
  status: number
  durationMs: number | null
  totalTokens: number | null
  trigger: string
  errorMsg: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  executor: { id: string; username: string; nickname: string | null } | null
}

/** 运行详情 */
export interface WorkflowRunDetail extends WorkflowRunRow {
  workflowId: string
  workflowName: string
  inputs: Record<string, any>
  outputs: Record<string, any>
  nodeTrace: Array<{
    nodeId: string
    type: string
    title: string
    status: number
    durationMs: number
    outputs: Record<string, any>
    errorMsg?: string
  }>
}

/** SSE 事件 */
export interface WorkflowStreamEvent {
  event: string
  data: any
}
