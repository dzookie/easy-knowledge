# RAG Agent 改造为 ReAct 循环模式

## Context（为什么改）

当前 `server/src/modules/workflow/workflow.graph.ts` 的状态图是**线性**流程：

```
START → retrieve → generate → END
```

retrieve 只执行一次，generate 完就结束。当检索结果不足以回答问题时，LLM 只能在回答里说"参考资料不足"，没有"再检索一次"的能力。

改造目标：引入 **ReAct 式循环**——generate 完成后由 LLM 自评"是否需要再检索"，若是则带着可选的查询重写回到 retrieve 节点，如此反复直到 LLM 给出最终回答或达到最大迭代次数。

最终状态图：

```
START → retrieve → generate → evaluate → (条件边)
                                    ├─ needRetrieve && iteration < MAX → retrieve（循环）
                                    └─ 否则 → END
```

---

## 涉及文件

| 文件 | 改动 |
|---|---|
| [workflow.graph.ts](file:///f:/dzcoder/easy-knowledge/server/src/modules/workflow/workflow.graph.ts) | AgentState 扩展字段、状态图重构、新增 evaluate 节点与条件边 |
| [workflow.service.ts](file:///f:/dzcoder/easy-knowledge/server/src/modules/workflow/workflow.service.ts) | initialState 新增字段、流式事件协议扩展、消费 evaluate 节点输出 |
| [llm.service.ts](file:///f:/dzcoder/easy-knowledge/server/src/common/llm/llm.service.ts) | 新增 `evaluateAnswer()` 方法，非流式 JSON 输出 |
| [rag.service.ts](file:///f:/dzcoder/easy-knowledge/server/src/common/rag/rag.service.ts) | `buildSystemPrompt` 不变；新增 `buildEvaluatePrompt` 供 evaluate 节点使用 |
| [workflow/index.vue](file:///f:/dzcoder/easy-knowledge/client/src/views/admin/workflow/index.vue) | 处理新增 `iteration` 事件，多轮 sources 累积展示，上一轮 content 转 thinking |

API 路径、SSE 控制器、类型定义文件原则上不变。

---

## 设计方案

### 1. AgentState 扩展（workflow.graph.ts）

在现有 `Annotation.Root` 基础上新增字段：

```typescript
const AgentState = Annotation.Root({
  // 原有输入字段保持不变
  query: Annotation<string>(),
  collection: Annotation<string>(),
  topK: Annotation<number>(),
  scoreThreshold: Annotation<number>(),
  systemPrompt: Annotation<string>(),
  history: Annotation<...>(),

  // 中间产物 —— sources 改为累积 reducer（多轮检索去重合并）
  sources: Annotation<RagSource[]>({
    reducer: (prev, next) => {
      const seen = new Set(prev.map(s => s.vectorId));
      return [...prev, ...next.filter(s => !seen.has(s.vectorId))];
    },
    default: () => [],
  }),
  fullPrompt: Annotation<string>(),

  // 输出
  answer: Annotation<string>(),

  // ===== 新增 =====
  iteration: Annotation<number>({
    reducer: (_prev, next) => next,   // 由 retrieve 节点覆盖式自增
    default: () => 0,
  }),
  maxIterations: Annotation<number>(),   // 请求级配置，默认 3
  needRetrieve: Annotation<boolean>(),   // evaluate 节点输出
  rewrittenQuery: Annotation<string>(), // evaluate 节点输出，可选
  attemptedAnswers: Annotation<string[]>({  // 每轮 generate 的回答留档
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});
```

### 2. 状态图重构（workflow.graph.ts）

```typescript
export function buildRagAgentGraph(ctx: WorkflowContext) {
  const graph = new StateGraph(AgentState)
    .addNode('retrieve', async (state) => {
      const q = state.rewrittenQuery?.trim() || state.query;
      const newSources = await ctx.retrieve(
        state.collection, q, state.topK, state.scoreThreshold,
      );
      // iteration 由 retrieve 节点自增
      return { sources: newSources, iteration: state.iteration + 1 };
    })
    .addNode('generate', async (state) => {
      const fullPrompt = ctx.buildPrompt(state.systemPrompt, state.sources);
      // generate 内部 yield 的流式 chunk 由 WorkflowService 直接消费
      // 节点返回 fullPrompt 和占位 answer 给状态流转
      return { fullPrompt };
    })
    .addNode('evaluate', async (state) => {
      const result = await ctx.evaluate(state.query, state.sources, state.answer, state.history);
      return {
        needRetrieve: result.need_retrieve,
        rewrittenQuery: result.rewritten_query ?? '',
      };
    })
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', 'evaluate')
    .addConditionalEdges('evaluate', (state) => {
      if (state.needRetrieve && state.iteration < state.maxIterations) {
        return 'retrieve';
      }
      return END;
    })
    .addEdge('generate', END);  // 注意：这条边被 conditional 取代，删除

  return graph.compile();
}
```

注意：原 `.addEdge('generate', END)` 删除，由 evaluate → conditional 接管终止权。

### 3. WorkflowContext 扩展（workflow.graph.ts）

接口新增 `evaluate` 方法：

```typescript
export interface WorkflowContext {
  retrieve: (...) => Promise<RagSource[]>;
  buildPrompt: (...) => string;
  generate: (...) => AsyncGenerator<{ type: 'reasoning' | 'content'; text: string }>;
  // 新增
  evaluate: (
    query: string,
    sources: RagSource[],
    answer: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ) => Promise<{ need_retrieve: boolean; reason: string; rewritten_query?: string }>;
}
```

### 4. evaluate 节点的 LLM 调用（llm.service.ts）

在 `LlmService` 新增方法：

```typescript
async evaluateAnswer(
  query: string,
  sources: RagSource[],
  answer: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ need_retrieve: boolean; reason: string; rewritten_query?: string }> {
  const sys = `你是一个 RAG 评估器。判断下面这个回答是否完整回答了用户问题。
输出 JSON：
- 回答完整且基于参考资料 → {"need_retrieve": false, "reason": "..."}
- 回答含糊/未基于资料/明确说"资料不足" → {"need_retrieve": true, "reason": "...", "rewritten_query": "建议的新查询词"}
只输出 JSON，不要其他文字。`;

  const messages = [
    new SystemMessage(sys),
    new HumanMessage(
      `用户问题: ${query}\n\n参考资料:\n${sources.map((s,i)=>`[${i+1}] ${s.content}`).join('\n')}\n\n回答:\n${answer}`
    ),
  ];

  const res = await this.chatModel.invoke(messages, {
    response_format: { type: 'json_object' },  // OpenAI 兼容模型支持
  });

  return JSON.parse((res as AIMessage).content as string);
}
```

**风险**：若使用的 LLM 不支持 `response_format: json_object`，需 fallback 到提示词约束 + try/parse/catch。在实现时先做能力探测或直接 try/catch。

### 5. WorkflowService 流式事件协议扩展（workflow.service.ts）

新增事件：

| event | data | 时机 |
|---|---|---|
| `iteration` | `{ iteration: N, reason: string, rewritten_query: string }` | evaluate 判定需重试，进入下一轮 retrieve 之前发送 |

现有事件保持：
- `sources`：每轮 retrieve 后都发，前端累积（已有逻辑支持）
- `prompt`：每轮 generate 前发
- `thinking` / `content`：generate 流式输出，保持
- `done` / `error`：保持

**关键修改点** — [workflow.service.ts:88-129](file:///f:/dzcoder/easy-knowledge/server/src/modules/workflow/workflow.service.ts#L88-L129) 的 chunk 消费循环：

1. `initialState` 加 `maxIterations: 3`、`iteration: 0`
2. `WorkflowContext` 注入新的 `evaluate` 方法（绑定到 `llmService.evaluateAnswer`）
3. chunk 消费循环中，遇到 `evaluate` 节点更新时检查 `needRetrieve`：
   - 若 true 且未达 max：yield `iteration` 事件，让循环继续（LangGraph 会自动跑下一轮 retrieve）
   - 若 false 或达 max：循环自然结束
4. 多轮 generate 的流式 chunk 自然 yield 给前端（每轮都会发 prompt + thinking + content）

### 6. 前端改造（workflow/index.vue）

[workflow/index.vue:172-246](file:///f:/dzcoder/easy-knowledge/client/src/views/admin/workflow/index.vue#L172-L246) 的 SSE 消费循环新增分支：

```typescript
if (data.event === 'iteration') {
  // 进入新一轮：把上一轮 content 转入 thinking，清空 content
  const msg = messages.value[assistantIdx]!
  msg.thinking = (msg.thinking || '') + `\n[第${data.data.iteration - 1}轮回答] ${msg.content}\n`
  msg.content = ''
  // 可选：在 thinking 区显示"重新检索：${reason}"
  // 节点状态：把 retrieve 重新标记为 running
  markRunning('retrieve')
  continue
}
```

累积展示 sources 已有逻辑，无需改动。

### 7. maxIterations 默认值

`initialState.maxIterations = 3`。即最多检索 3 次、生成 3 次。可后续作为请求参数从 API 传入。

---

## 验证

### 单元/集成测试

1. **基础回归**：选一个能直接回答的知识库，提问。应只跑 1 轮就结束，行为与改造前一致。
2. **重试场景**：问一个知识库里只有部分信息的问题。期望看到：
   - 第 1 轮 retrieve → sources 显示
   - 第 1 轮 generate → content 流式输出
   - `iteration` 事件 → 前端把第 1 轮 content 转入 thinking
   - 第 2 轮 retrieve → 新 sources 累积
   - 第 2 轮 generate → 最终 content
3. **死循环防护**：构造一个永远触发 needRetrieve 的场景（如查询一个知识库里完全没有的话题），应 3 轮后强制结束，最终回答基于第 3 轮的尝试。
4. **SSE 事件流验证**：
   ```bash
   curl -N -X POST http://localhost:3000/api/workflow/rag-agent/stream \
     -H "Content-Type: application/json" \
     -d '{"kbId":"<id>","query":"<test>","history":[]}'
   ```
   观察事件序列：`sources → prompt → thinking → content → [iteration → sources → prompt → thinking → content →] done`

### 启动命令

```bash
cd server && npm run start:dev    # 后端
cd client && npm run dev          # 前端
```

访问 `/admin/workflow` 页面进行上述测试。

---

## 风险与权衡

| 项 | 影响 | 缓解 |
|---|---|---|
| 每次 generate 后多一次 LLM 调用（evaluate） | 成本约 ×2 | 只在不确定时才重试，平均成本可控；evaluate 用短 prompt 单次调用 |
| 第一轮 content 会先吐出再被覆盖 | 体验略突兀 | 前端用"重新思考中"标记 + thinking 区展示历史尝试 |
| LLM 不支持 `response_format: json_object` | evaluate 解析失败 | try/catch + 提示词约束，失败时默认 `need_retrieve=false` 不死循环 |
| 状态图复杂度提升 | 可读性下降 | 仍只 3 节点 + 1 条条件边，比 LangGraph 官方 CRAG 教程更简单 |
| sources 累积可能引入噪声 | 第 N 轮检索结果可能与前几轮重复 | reducer 用 `vectorId` 去重 |

---

## 不做的事

- **不**改 `RagService.DEFAULT_SYSTEM_PROMPT`：generate 依然按现有规则回答
- **不**改 API 路径和 SSE 控制器：对外契约不变
- **不**改 `LlmService.chatStream`：流式生成逻辑不变
- **不**做 tool calling 绑定：evaluate 用 JSON 输出足够，避免引入 tool schema 复杂度
