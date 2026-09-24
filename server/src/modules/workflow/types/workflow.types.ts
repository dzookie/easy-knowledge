/**
 * 工作流 DSL 类型定义
 *
 * 设计参考 Dify: 由节点(nodes)+边(edges)组成有向无环图(DAG),
 * 节点类型包括 start/end/llm/knowledge_retrieval/template/if_else.
 * 节点之间通过 `{{nodeId.varName}}` 模板语法传递变量.
 */

/** 节点类型枚举 */
export type WorkflowNodeType =
  | 'start' // 起始节点: 声明入参
  | 'end' // 结束节点: 输出映射
  | 'llm' // LLM 节点: 调用大模型
  | 'knowledge_retrieval' // 知识检索节点: 复用 RagService
  | 'template' // 模板节点: Mustache 渲染
  | 'if_else'; // 条件分支: LangGraph conditionalEdges

/** 变量类型 */
export type VariableType = 'string' | 'number' | 'boolean' | 'object';

/** 起始节点声明的入参变量 */
export interface WorkflowVariable {
  /** 变量名, 仅字母数字下划线 */
  name: string;
  /** 变量标题, 用于展示 */
  label?: string;
  type: VariableType;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: any;
  /** 可选项(枚举值) */
  options?: string[];
}

/** 节点位置 (Vue Flow 坐标) */
export interface NodePosition {
  x: number;
  y: number;
}

/** 节点配置 (每种节点类型的特有配置) */
export interface BaseNodeConfig {
  // 通用配置, 由子类型扩展
}

/** start 节点配置: 声明入参变量 */
export interface StartNodeConfig extends BaseNodeConfig {
  variables: WorkflowVariable[];
}

/** end 节点配置: 输出变量映射 */
export interface EndNodeConfig extends BaseNodeConfig {
  /** 输出变量列表: { name, value(模板字符串) } */
  outputs: Array<{
    name: string;
    label?: string;
    /** 值模板, 支持 {{nodeId.var}} 语法 */
    value: string;
  }>;
}

/** llm 节点配置 */
export interface LlmNodeConfig extends BaseNodeConfig {
  /** system prompt 模板, 支持 {{nodeId.var}} */
  systemPrompt: string;
  /** user prompt 模板, 支持 {{nodeId.var}} */
  userPrompt: string;
  /** 温度, 默认 0.3 */
  temperature?: number;
  /** 最大 token, 默认 4096 */
  maxTokens?: number;
}

/** knowledge_retrieval 节点配置 */
export interface KnowledgeRetrievalNodeConfig extends BaseNodeConfig {
  /** 知识库 ID */
  kbId: string;
  /** 查询语句模板, 支持 {{nodeId.var}} */
  query: string;
  /** topK, 默认 5 */
  topK?: number;
  /** 相似度阈值, 默认 0 */
  scoreThreshold?: number;
}

/** template 节点配置 */
export interface TemplateNodeConfig extends BaseNodeConfig {
  /** Mustache 模板内容, 支持 {{nodeId.var}} */
  template: string;
}

/** if_else 节点配置: 多分支条件 */
export interface IfElseNodeConfig extends BaseNodeConfig {
  /** 分支列表 */
  branches: Array<{
    /** 分支标识, 对应 edge.targetHandle */
    id: string;
    /** 分支标题 */
    label?: string;
    /** 条件表达式数组 (AND 关系) */
    conditions: Array<{
      /** 左值变量引用, 如 "{{start.query}}" */
      left: string;
      /** 比较运算符 */
      operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with';
      /** 右值 (字面量字符串, 或变量引用 {{nodeId.var}}) */
      right: string;
    }>;
  }>;
  /** 默认分支标识 (所有 conditions 都不满足时) */
  defaultBranchId: string;
}

/** 所有节点配置类型 */
export type WorkflowNodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | LlmNodeConfig
  | KnowledgeRetrievalNodeConfig
  | TemplateNodeConfig
  | IfElseNodeConfig;

/** 工作流节点 */
export interface WorkflowNode {
  /** 节点 ID, 全图唯一 */
  id: string;
  type: WorkflowNodeType;
  /** 画布坐标 */
  position: NodePosition;
  /** 节点数据 */
  data: {
    /** 节点标题(展示用), 缺省时回退到节点 ID */
    title?: string;
    config: WorkflowNodeConfig;
  };
}

/** 工作流边 (连接) */
export interface WorkflowEdge {
  /** 边 ID */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
  /** 源节点 handle (if_else 分支出口) */
  sourceHandle?: string;
  /** 目标节点 handle */
  targetHandle?: string;
  /** 边类型 (smoothstep / bezier 等) */
  type?: string;
}

/** 工作流图 DSL */
export interface WorkflowGraph {
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** ============ 执行期类型 ============ */

/** 节点执行上下文 */
export interface NodeExecutionContext {
  /** 工作流图 */
  graph: WorkflowGraph;
  /** 起始节点入参 (用户输入) */
  inputs: Record<string, any>;
  /** 已执行节点的输出: { [nodeId]: { [varName]: any } } */
  nodeOutputs: Record<string, Record<string, any>>;
  /** 当前节点 ID */
  currentNodeId: string;
}

/** 节点执行结果 */
export interface NodeExecutionResult {
  /** 节点实际消费的输入 (变量解析后的值, 供 trace 展示) */
  inputs?: Record<string, any>;
  /** 节点输出变量 */
  outputs: Record<string, any>;
  /** 节点执行耗时(ms) */
  durationMs: number;
  /** token 消耗 (LLM 节点) */
  tokenCount?: number;
}

/** SSE 事件 (流式执行) */
export type WorkflowStreamEvent =
  | { event: 'workflow_start'; data: { runId: string; graph: WorkflowGraph } }
  | { event: 'node_start'; data: { nodeId: string; nodeType: WorkflowNodeType; title: string } }
  | {
      event: 'node_finish';
      data: {
        nodeId: string;
        inputs?: Record<string, any>;
        outputs: Record<string, any>;
        durationMs: number;
      };
    }
  | { event: 'sources'; data: any[] } // 知识检索结果
  | { event: 'prompt'; data: string } // LLM 组装后的 prompt
  | { event: 'thinking'; data: string } // LLM 思考过程
  | { event: 'content'; data: string } // LLM 回答内容
  | { event: 'node_error'; data: { nodeId: string; message: string } }
  | { event: 'workflow_finish'; data: { outputs: Record<string, any>; durationMs: number } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: '' };

/** 工作流状态枚举 (与 Prisma 一致) */
export enum WorkflowStatus {
  DRAFT = 0,
  PUBLISHED = 1,
  ARCHIVED = 2,
}

/** 工作流运行状态枚举 (与 Prisma 一致) */
export enum WorkflowRunStatus {
  PENDING = 0,
  RUNNING = 1,
  SUCCESS = 2,
  FAILED = 3,
  CANCELED = 4,
}
