<script setup lang="ts">
/**
 * 右侧配置抽屉 — 根据选中节点类型显示不同表单
 *
 * 设计:
 *  - 接收 selectedNode (Node | null), 不为 null 时打开抽屉
 *  - 用 v-model 与父组件双向同步节点 data
 *  - 每次修改直接写回 selectedNode.data (Vue Flow 节点 data 是响应式的)
 *  - 知识库下拉需要加载 knowledgeApis.listKnowledge
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { knowledgeApis } from '@/apis'
import type { KnowledgeRow } from '@/types'
import type {
  WorkflowNodeType,
  StartNodeConfig,
  EndNodeConfig,
  LlmNodeConfig,
  KnowledgeRetrievalNodeConfig,
  TemplateNodeConfig,
  IfElseNodeConfig,
  IfElseBranch,
  WorkflowVariable,
  VariableType,
} from '@/types/workflow'
import type { Node, Edge } from '@vue-flow/core'

const props = defineProps<{
  node: Node | null
  nodes: Node[]
  edges: Edge[]
}>()

const emit = defineEmits<{
  (e: 'update:node', node: Node): void
}>()

const visible = computed({
  get: () => props.node !== null,
  set: (v: boolean) => {
    if (!v) emit('update:node', null as any)
  },
})

/** 当前节点类型 */
const nodeType = computed(() => props.node?.type as WorkflowNodeType | undefined)

/** 当前节点 data.title 双向绑定 */
const title = computed({
  get: () => props.node?.data?.title || '',
  set: (v: string) => {
    if (props.node) {
      props.node.data.title = v
    }
  },
})

/** 节点类型 → 中文名 */
const typeLabel = computed(() => {
  const map: Record<WorkflowNodeType, string> = {
    start: '开始节点',
    end: '结束节点',
    llm: 'LLM 节点',
    knowledge_retrieval: '知识检索节点',
    template: '模板节点',
    if_else: '条件分支节点',
  }
  return nodeType.value ? map[nodeType.value] : ''
})

/* ===== 类型守卫: 安全读取/写入各种 config ===== */
function getConfig<T>(fallback: T): T {
  if (!props.node?.data?.config) return fallback
  return props.node.data.config as T
}

function patchConfig(patch: Record<string, any>) {
  if (!props.node) return
  props.node.data.config = { ...props.node.data.config, ...patch }
}

/* ===== start: 入参变量 ===== */
const startVars = computed(() => getConfig<StartNodeConfig>({ variables: [] }).variables)
function addStartVar() {
  const vars = [...startVars.value, { name: '', type: 'string' as VariableType, required: false }]
  patchConfig({ variables: vars })
}
function removeStartVar(i: number) {
  const vars = startVars.value.slice()
  vars.splice(i, 1)
  patchConfig({ variables: vars })
}
function patchStartVar(i: number, patch: Partial<WorkflowVariable>) {
  const vars = startVars.value.slice()
  vars[i] = { ...vars[i], ...patch } as WorkflowVariable
  patchConfig({ variables: vars })
}

/* ===== end: 输出 ===== */
const endOutputs = computed(() => getConfig<EndNodeConfig>({ outputs: [] }).outputs || [])

/** 输出字段名规范: 字母/数字/下划线, 首字符不能是数字 (对外 API 的 key) */
const OUTPUT_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/
function isInvalidOutputName(name: string) {
  return !!name && !OUTPUT_NAME_PATTERN.test(name)
}

function addEndOutput() {
  const outs = [...endOutputs.value, { name: '', value: '' }]
  patchConfig({ outputs: outs })
}
function removeEndOutput(i: number) {
  const outs = endOutputs.value.slice()
  outs.splice(i, 1)
  patchConfig({ outputs: outs })
}
function patchEndOutput(i: number, patch: Partial<{ name: string; label: string; value: string }>) {
  const outs = endOutputs.value.slice()
  outs[i] = { ...outs[i], ...patch } as { name: string; label?: string; value: string }
  patchConfig({ outputs: outs })
}

/* ===== llm ===== */
const llmCfg = computed(() =>
  getConfig<LlmNodeConfig>({ systemPrompt: '', userPrompt: '', temperature: 0.7, maxTokens: 2000 }),
)
function patchLlm(patch: Partial<LlmNodeConfig>) {
  patchConfig(patch)
}

/* ===== knowledge_retrieval ===== */
const kbList = ref<KnowledgeRow[]>([])
const kbLoading = ref(false)
async function loadKbList() {
  kbLoading.value = true
  try {
    kbList.value = await knowledgeApis.listKnowledge()
  } finally {
    kbLoading.value = false
  }
}
const kbCfg = computed(() =>
  getConfig<KnowledgeRetrievalNodeConfig>({ kbId: '', query: '', topK: 5, scoreThreshold: 0.5 }),
)
function patchKb(patch: Partial<KnowledgeRetrievalNodeConfig>) {
  patchConfig(patch)
}

/* ===== template ===== */
const tplCfg = computed(() => getConfig<TemplateNodeConfig>({ template: '' }))
function patchTpl(patch: Partial<TemplateNodeConfig>) {
  patchConfig(patch)
}

/* ===== if_else: 分支 ===== */
const ifElseCfg = computed(() =>
  getConfig<IfElseNodeConfig>({ branches: [], defaultBranchId: 'default' }),
)
function addBranch() {
  const cfg = ifElseCfg.value
  const newId = `branch_${Date.now().toString(36)}`
  const branches = [
    ...cfg.branches,
    { id: newId, label: `条件 ${cfg.branches.length + 1}`, conditions: [] },
  ]
  patchConfig({ branches })
}
function removeBranch(id: string) {
  const cfg = ifElseCfg.value
  patchConfig({ branches: cfg.branches.filter((b) => b.id !== id) })
}
function patchBranch(branchId: string, patch: Partial<IfElseBranch>) {
  const cfg = ifElseCfg.value
  const branches = cfg.branches.map((b) => (b.id === branchId ? { ...b, ...patch } : b))
  patchConfig({ branches })
}
function addCondition(branchId: string) {
  const cfg = ifElseCfg.value
  const branches = cfg.branches.map((b) =>
    b.id === branchId
      ? { ...b, conditions: [...b.conditions, { left: '', operator: '==' as const, right: '' }] }
      : b,
  )
  patchConfig({ branches })
}
function removeCondition(branchId: string, i: number) {
  const cfg = ifElseCfg.value
  const branches = cfg.branches.map((b) => {
    if (b.id !== branchId) return b
    const conds = b.conditions.slice()
    conds.splice(i, 1)
    return { ...b, conditions: conds }
  })
  patchConfig({ branches })
}
function patchCondition(branchId: string, i: number, patch: any) {
  const cfg = ifElseCfg.value
  const branches = cfg.branches.map((b) => {
    if (b.id !== branchId) return b
    const conds = b.conditions.slice()
    conds[i] = { ...conds[i], ...patch }
    return { ...b, conditions: conds }
  })
  patchConfig({ branches })
}

const OPERATOR_OPTIONS = [
  { label: '==', value: '==' },
  { label: '!=', value: '!=' },
  { label: '>', value: '>' },
  { label: '<', value: '<' },
  { label: '>=', value: '>=' },
  { label: '<=', value: '<=' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'not_contains' },
  { label: '以…开头', value: 'starts_with' },
  { label: '以…结尾', value: 'ends_with' },
]

const VARIABLE_TYPE_OPTIONS = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '对象', value: 'object' },
]

/* ===== 可用变量 (上游节点输出) ===== */
/** 各节点类型输出的变量名 */
const NODE_OUTPUT_VARS: Record<string, string[]> = {
  start: [], // 动态: 从 config.variables 读取
  llm: ['text', 'thinking'],
  knowledge_retrieval: ['sources', 'context', 'query'],
  template: ['result'],
  if_else: ['_branchId'],
  end: [],
}

interface AvailableVar {
  nodeId: string
  nodeTitle: string
  varName: string
  ref: string // {{nodeId.varName}}
}

/** 递归找上游节点 (通过 edges 反向追溯) */
const upstreamVars = computed<AvailableVar[]>(() => {
  if (!props.node) return []
  const currentId = props.node.id
  const visited = new Set<string>()
  const result: AvailableVar[] = []

  function collect(nodeId: string) {
    // 找所有 target === nodeId 的边, 其 source 是上游
    for (const edge of props.edges) {
      if (edge.target !== nodeId) continue
      const srcId = edge.source
      if (visited.has(srcId)) continue
      visited.add(srcId)
      const srcNode = props.nodes.find((n) => n.id === srcId)
      if (!srcNode) continue
      const title = srcNode.data?.title || srcId
      const type = srcNode.type as string
      const varNames = NODE_OUTPUT_VARS[type] || []
      for (const varName of varNames) {
        result.push({ nodeId: srcId, nodeTitle: title, varName, ref: `{{${srcId}.${varName}}}` })
      }
      // start 节点: 从 config.variables 动态读取
      if (type === 'start') {
        const cfg = srcNode.data?.config as StartNodeConfig | undefined
        for (const v of cfg?.variables || []) {
          if (v.name) {
            result.push({ nodeId: srcId, nodeTitle: title, varName: v.name, ref: `{{${srcId}.${v.name}}}` })
          }
        }
      }
      // 递归向上
      collect(srcId)
    }
  }
  collect(currentId)
  return result
})

/**
 * 变量引用下拉选项: 上游可用变量 + 当前已填写的自定义值
 * @param current 当前值, 不在选项里时补一条, 避免回显丢失
 */
function varRefOptions(current: string) {
  const opts = upstreamVars.value.map((v) => ({
    label: `${v.nodeTitle}.${v.varName}`,
    value: v.ref,
  }))
  if (current && !opts.some((o) => o.value === current)) {
    opts.unshift({ label: current, value: current })
  }
  return opts
}

/** 在 textarea 光标处插入变量引用 */
function insertVar(
  ref: string,
  field: 'systemPrompt' | 'userPrompt' | 'query' | 'template',
  event: MouseEvent,
) {
  const textarea = (event.currentTarget as HTMLElement)
    .closest('.el-form-item')
    ?.querySelector('textarea')
  if (!textarea) {
    // 找不到 textarea, 直接追加到末尾
    const current = getConfig<any>({})
    const val = (current as any)[field] || ''
    patchConfig({ [field]: val + ref })
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const current = getConfig<any>({})
  const val = (current as any)[field] || ''
  const newVal = val.slice(0, start) + ref + val.slice(end)
  patchConfig({ [field]: newVal })
  // 恢复光标位置
  nextTick(() => {
    textarea.focus()
    const pos = start + ref.length
    textarea.setSelectionRange(pos, pos)
  })
}

onMounted(loadKbList)
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="`${typeLabel} 配置`"
    direction="rtl"
    size="420px"
    :close-on-click-modal="true"
    :destroy-on-close="false"
  >
    <div v-if="props.node" class="wf-cfg">
      <!-- 通用: 节点标题 -->
      <el-form label-position="top" class="wf-cfg-form">
        <el-form-item label="节点标题">
          <el-input v-model="title" placeholder="给节点起个名字" />
        </el-form-item>

        <!-- start: 入参变量 -->
        <template v-if="nodeType === 'start'">
          <div class="wf-cfg-section">
            <div class="wf-cfg-section-head">
              <span>入参变量</span>
              <el-button text size="small" :icon="Plus" @click="addStartVar">添加</el-button>
            </div>
            <div v-for="(v, i) in startVars" :key="i" class="wf-cfg-row">
              <div class="wf-cfg-row-head">
                <span class="wf-cfg-row-index">#{{ i + 1 }}</span>
                <el-button text size="small" :icon="Delete" @click="removeStartVar(i)" />
              </div>
              <el-input
                :model-value="v.name"
                @update:model-value="(val: string) => patchStartVar(i, { name: val })"
                placeholder="变量名 (英文)"
                size="small"
              />
              <el-input
                :model-value="v.label"
                @update:model-value="(val: string) => patchStartVar(i, { label: val })"
                placeholder="显示名 (可选)"
                size="small"
              />
              <div class="wf-cfg-row-line">
                <el-select
                  :model-value="v.type"
                  @update:model-value="(val: any) => patchStartVar(i, { type: val })"
                  size="small"
                  style="flex: 1"
                >
                  <el-option
                    v-for="o in VARIABLE_TYPE_OPTIONS"
                    :key="o.value"
                    :label="o.label"
                    :value="o.value"
                  />
                </el-select>
                <el-checkbox
                  :model-value="!!v.required"
                  @update:model-value="(val: any) => patchStartVar(i, { required: !!val })"
                >必填</el-checkbox>
              </div>
              <el-input
                :model-value="v.default?.toString() || ''"
                @update:model-value="(val: string) => patchStartVar(i, { default: val })"
                placeholder="默认值 (可选)"
                size="small"
              />
            </div>
            <div v-if="startVars.length === 0" class="wf-cfg-empty">暂无入参, 至少需要一个用于运行</div>
          </div>
        </template>

        <!-- end: 输出 -->
        <template v-else-if="nodeType === 'end'">
          <div class="wf-cfg-section">
            <div class="wf-cfg-section-head">
              <span>输出字段</span>
              <el-button text size="small" :icon="Plus" @click="addEndOutput">添加</el-button>
            </div>
            <div v-for="(o, i) in endOutputs" :key="i" class="wf-cfg-row">
              <div class="wf-cfg-row-head">
                <span class="wf-cfg-row-index">#{{ i + 1 }}</span>
                <el-button text size="small" :icon="Delete" @click="removeEndOutput(i)" />
              </div>
              <el-input
                :model-value="o.name"
                @update:model-value="(val: string) => patchEndOutput(i, { name: val })"
                placeholder="输出字段名 (如 answer)"
                size="small"
              />
              <div v-if="isInvalidOutputName(o.name)" class="wf-cfg-field-error">
                只能包含字母/数字/下划线, 且首字符不能是数字
              </div>
              <el-select
                :model-value="o.value"
                @update:model-value="(val: any) => patchEndOutput(i, { value: val })"
                size="small"
                filterable
                allow-create
                default-first-option
                placeholder="选择变量或输入字面量"
                style="width: 100%"
              >
                <el-option
                  v-for="opt in varRefOptions(o.value)"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
            <div v-if="endOutputs.length === 0" class="wf-cfg-empty">暂无输出字段</div>
            <div class="wf-cfg-tip">
              字段名就是对外调用返回的 key, 建议用英文小写+下划线 (如 <code>answer</code>);
              值用 <code v-pre>{{node_id.var}}</code> 引用上游输出。发布前必须配置。
            </div>
          </div>
        </template>

        <!-- llm -->
        <template v-else-if="nodeType === 'llm'">
          <!-- 可用变量 -->
          <div v-if="upstreamVars.length > 0" class="wf-cfg-vars">
            <div class="wf-cfg-vars-title">可用变量 (点击插入)</div>
            <div class="wf-cfg-vars-list">
              <span
                v-for="v in upstreamVars"
                :key="v.ref"
                class="wf-cfg-var-chip"
                @click="insertVar(v.ref, 'userPrompt', $event)"
                :title="`插入 ${v.ref}`"
              >{{ v.nodeTitle }}.{{ v.varName }}</span>
            </div>
          </div>
          <el-form-item label="系统提示词 (System Prompt)">
            <el-input
              :model-value="llmCfg.systemPrompt"
              @update:model-value="(val: string) => patchLlm({ systemPrompt: val })"
              type="textarea"
              :rows="4"
              placeholder="你是一个有帮助的助手..."
            />
          </el-form-item>
          <el-form-item label="用户提示词 (User Prompt)">
            <el-input
              :model-value="llmCfg.userPrompt"
              @update:model-value="(val: string) => patchLlm({ userPrompt: val })"
              type="textarea"
              :rows="6"
              placeholder="留空则自动使用上游节点输出"
            />
            <div class="wf-cfg-tip">留空时自动拼接上游输出; 也可用 <code v-pre>{{node_id.var}}</code> 手动引用</div>
          </el-form-item>
          <el-form-item label="温度 (Temperature)">
            <el-slider
              :model-value="llmCfg.temperature ?? 0.7"
              @update:model-value="(val: any) => patchLlm({ temperature: val })"
              :min="0"
              :max="2"
              :step="0.1"
              show-input
            />
          </el-form-item>
          <el-form-item label="最大 Tokens">
            <el-input-number
              :model-value="llmCfg.maxTokens ?? 2000"
              @update:model-value="(val: any) => patchLlm({ maxTokens: val })"
              :min="100"
              :max="32000"
              :step="100"
            />
          </el-form-item>
        </template>

        <!-- knowledge_retrieval -->
        <template v-else-if="nodeType === 'knowledge_retrieval'">
          <div v-if="upstreamVars.length > 0" class="wf-cfg-vars">
            <div class="wf-cfg-vars-title">可用变量 (点击插入)</div>
            <div class="wf-cfg-vars-list">
              <span
                v-for="v in upstreamVars"
                :key="v.ref"
                class="wf-cfg-var-chip"
                @click="insertVar(v.ref, 'query', $event)"
                :title="`插入 ${v.ref}`"
              >{{ v.nodeTitle }}.{{ v.varName }}</span>
            </div>
          </div>
          <el-form-item label="知识库">
            <el-select
              :model-value="kbCfg.kbId"
              @update:model-value="(val: any) => patchKb({ kbId: val })"
              :loading="kbLoading"
              placeholder="选择知识库"
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="kb in kbList"
                :key="kb.id"
                :label="kb.name"
                :value="kb.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="查询语句">
            <el-input
              :model-value="kbCfg.query"
              @update:model-value="(val: string) => patchKb({ query: val })"
              type="textarea"
              :rows="2"
              placeholder="留空则自动使用上游节点输出"
            />
            <div class="wf-cfg-tip">留空时自动拼接上游输出; 也可用 <code v-pre>{{node_id.var}}</code> 手动引用</div>
          </el-form-item>
          <el-form-item label="Top K">
            <el-input-number
              :model-value="kbCfg.topK ?? 5"
              @update:model-value="(val: any) => patchKb({ topK: val })"
              :min="1"
              :max="20"
            />
          </el-form-item>
          <el-form-item label="分数阈值">
            <el-slider
              :model-value="kbCfg.scoreThreshold ?? 0.5"
              @update:model-value="(val: any) => patchKb({ scoreThreshold: val })"
              :min="0"
              :max="1"
              :step="0.05"
              show-input
            />
          </el-form-item>
        </template>

        <!-- template -->
        <template v-else-if="nodeType === 'template'">
          <div v-if="upstreamVars.length > 0" class="wf-cfg-vars">
            <div class="wf-cfg-vars-title">可用变量 (点击插入)</div>
            <div class="wf-cfg-vars-list">
              <span
                v-for="v in upstreamVars"
                :key="v.ref"
                class="wf-cfg-var-chip"
                @click="insertVar(v.ref, 'template', $event)"
                :title="`插入 ${v.ref}`"
              >{{ v.nodeTitle }}.{{ v.varName }}</span>
            </div>
          </div>
          <el-form-item label="模板内容">
            <el-input
              :model-value="tplCfg.template"
              @update:model-value="(val: string) => patchTpl({ template: val })"
              type="textarea"
              :rows="10"
              placeholder="Hello, {{start.query}}! 检索结果: {{knowledge_1.result}}"
            />
            <div class="wf-cfg-tip">用 <code v-pre>{{node_id.var}}</code> 引用其他节点输出, 输出名为 <code>result</code></div>
          </el-form-item>
        </template>

        <!-- if_else -->
        <template v-else-if="nodeType === 'if_else'">
          <div class="wf-cfg-section">
            <div class="wf-cfg-section-head">
              <span>分支</span>
              <el-button text size="small" :icon="Plus" @click="addBranch">添加分支</el-button>
            </div>
            <div v-for="b in ifElseCfg.branches" :key="b.id" class="wf-cfg-branch">
              <div class="wf-cfg-branch-head">
                <el-input
                  :model-value="b.label"
                  @update:model-value="(val: string) => patchBranch(b.id, { label: val })"
                  size="small"
                  style="flex: 1"
                />
                <el-button text size="small" :icon="Delete" @click="removeBranch(b.id)" />
              </div>
              <div class="wf-cfg-tip">Handle id: <code>{{ b.id }}</code> (连线时使用)</div>

              <div v-for="(c, ci) in b.conditions" :key="ci" class="wf-cfg-cond">
                <el-select
                  :model-value="c.left"
                  @update:model-value="(val: any) => patchCondition(b.id, ci, { left: val })"
                  size="small"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择变量"
                  style="flex: 1"
                >
                  <el-option
                    v-for="o in varRefOptions(c.left)"
                    :key="o.value"
                    :label="o.label"
                    :value="o.value"
                  />
                </el-select>
                <el-select
                  :model-value="c.operator"
                  @update:model-value="(val: any) => patchCondition(b.id, ci, { operator: val })"
                  size="small"
                  style="width: 110px"
                >
                  <el-option
                    v-for="o in OPERATOR_OPTIONS"
                    :key="o.value"
                    :label="o.label"
                    :value="o.value"
                  />
                </el-select>
                <el-input
                  :model-value="c.right"
                  @update:model-value="(val: string) => patchCondition(b.id, ci, { right: val })"
                  size="small"
                  placeholder="右值"
                  style="flex: 1"
                />
                <el-button text size="small" :icon="Delete" @click="removeCondition(b.id, ci)" />
              </div>
              <el-button text size="small" :icon="Plus" @click="addCondition(b.id)">添加条件</el-button>
            </div>
            <div v-if="ifElseCfg.branches.length === 0" class="wf-cfg-empty">暂无分支, 至少添加一个</div>
            <div class="wf-cfg-tip">连线时, 从节点右侧对应分支的 handle 拉出, sourceHandle 会自动保存为分支 id; 默认分支 handle id 为 <code>default</code></div>
          </div>
        </template>
      </el-form>
    </div>
  </el-drawer>
</template>

<style scoped>
.wf-cfg {
  padding: 0 4px;
}
.wf-cfg-form :deep(.el-form-item) {
  margin-bottom: 14px;
}
.wf-cfg-tip {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;
}
.wf-cfg-tip code {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: var(--el-color-primary);
}
.wf-cfg-field-error {
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.5;
}
.wf-cfg-section {
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
  margin-top: 6px;
}
.wf-cfg-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}
.wf-cfg-row {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wf-cfg-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wf-cfg-row-index {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
}
.wf-cfg-row-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wf-cfg-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 12px 0;
  text-align: center;
}

.wf-cfg-branch {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 10px;
}
.wf-cfg-branch-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.wf-cfg-cond {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

/* 变量选择器 */
.wf-cfg-vars {
  margin-bottom: 14px;
}
.wf-cfg-vars-title {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 6px;
}
.wf-cfg-vars-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wf-cfg-var-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  background: #eff6ff;
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.wf-cfg-var-chip:hover {
  background: var(--el-color-primary);
  color: #fff;
}
</style>
