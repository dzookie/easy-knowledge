# LangGraph.js RAG Agent 调试器方案

## Context

用户已选择"方向 1：RAG Agent 调试器"作为 LangGraph.js 接入的起点。

当前项目结构：
- 后端 RagService.ragChat() 已统一 RAG 流式问答流程（检索→prompt→thinking/content）
- 前端 QaTab.vue 已有完整的 SSE 流式对话 UI（messages 渲染、thinking 折叠、sources 展示）
- workflow/index.vue 是占位页，无任何逻辑

本方案目标：**最小改动验证 LangGraph.js 集成**，把 RagService 包装成 StateGraph 节点，在 workflow 页面做一个调试器，让用户能选知识库 + 输入 query，看到 Agent 节点流转图 + 流式回答。不破坏现有 `/api/service/chat` 和 QaTab 的逻辑。

## 关键设计决策

### 1. LangGraph 节点设计：3 节点 StateGraph

后端用 LangGraph.js 的 StateGraph 实现一个最小的 RAG 工作流：

```
START → retrieve → generate → END
```

- `retrieve` 节点：调用 `RagService.retrieve(collection, query, topK, scoreThreshold)`，结果存入 state.sources
- `generate` 节点：调用 `RagService.buildSystemPrompt()` + `LlmService.chatStream()`，流式输出

**不引入条件路由 / 评分 / 重试节点**——这些是方向 2/3 的能力，方向 1 保持最小，只验证集成跑通。

### 2. 流式输出对接：保持现有 SSE 协议

后端 LangGraph 工作流的输出**沿用 QaTab 已有的 `sources/prompt/thinking/content/done` 协议**，这样前端 SSE 接收代码可以直接复用 QaTab.vue 的实现。

LangGraph.js 的 `streamEvents()` 输出事件结构不同，所以在 generate 节点内部**不使用 LangGraph 的 streamEvents**，而是节点内部直接调 `llm.chatStream()` yield 事件，由 controller 转成 SSE。LangGraph 只负责状态流转，不负责流式 chunk 的产出（这是 LlmService 的事）。

### 3. 后端新增模块：`server/src/modules/workflow/`

新建独立 NestJS 模块，不污染现有 service / chat 模块：

- `workflow.module.ts` — 模块定义，依赖 RagModule / LlmModule
- `workflow.controller.ts` — 暴露 `POST /api/workflow/rag-agent/stream`（JWT 鉴权，复用现有 JwtAuthGuard）
- `workflow.service.ts` — 封装 LangGraph StateGraph，注入 RagService / LlmService
- `workflow.graph.ts` — StateGraph 定义（compile 后导出，单例复用）

### 4. 前端改造：workflow/index.vue 复用 QaTab 模式

把 workflow/index.vue 从占位页改成调试器界面，**复用 QaTab.vue 的 SSE 接收 + markdown 渲染逻辑**：

- 顶部工具栏：选知识库（下拉，复用 `knowledgeApis.listKnowledgeBases()`）+ topK + 阈值 + 系统提示词
- 中部对话区：messages 列表 + 流式输出（直接照搬 QaTab.vue 的 handleSend SSE 解析逻辑）
- 右侧（可选）：StateGraph 节点流转图（先做简化版——3 个 div 用箭头连，高亮当前节点；不上 @vue-flow/core，避免引入新依赖）

### 5. 知识库下拉数据源

复用现有 `knowledgeApis`（应该在 client/src/apis/knowledge.ts），调 `listKnowledgeBases()` 拿到所有知识库（id、name、collectionName）。调试器选知识库后，传 kbId 给后端，后端 workflow.service 内部按现有模式查 KnowledgeBase 表拿 collectionName。

### 6. 不引入新前端依赖

- 不装 `@vue-flow/core`，节点图先用纯 HTML/CSS 画简化版
- `markdown-it` 已装，直接复用
- 不引入额外 SSE 库，复用 QaTab.vue 的 fetch + ReadableStream 模式

### 7. 后端新增依赖

- `@langchain/langgraph` — 唯一新增依赖
- 安装命令：`cd server && npm install @langchain/langgraph --legacy-peer-deps`（沿用项目硬约束）

## 改动文件清单

### 后端新增
| 文件 | 内容 |
|---|---|
| `server/src/modules/workflow/workflow.module.ts` | 模块定义，import RagModule / LlmModule，注册 controller + service |
| `server/src/modules/workflow/workflow.controller.ts` | `POST /api/workflow/rag-agent/stream`（JWT，SSE 输出） |
| `server/src/modules/workflow/workflow.service.ts` | 注入 RagService / LlmService / Prisma，封装 runRagAgentStream() |
| `server/src/modules/workflow/workflow.graph.ts` | 定义 StateGraph（AgentState + retrieve 节点 + generate 节点），compile 导出 |
| `server/src/modules/workflow/dto/rag-agent.dto.ts` | 请求 DTO：kbId / query / history / topK / scoreThreshold / systemPrompt |

### 后端修改
| 文件 | 改动 |
|---|---|
| `server/src/app.module.ts` | 注册 WorkflowModule |
| `server/package.json` | 新增 `@langchain/langgraph` 依赖 |

### 前端修改
| 文件 | 改动 |
|---|---|
| `client/src/views/admin/workflow/index.vue` | 从占位页重写为调试器界面（工具栏 + 对话区 + 简化节点图） |
| `client/src/apis/workflow.ts` | **新建**：`ragAgentStream()` API 封装（fetch SSE，复用 chat.ts 模式） |
| `client/src/apis/index.ts` | 导出 workflowApis |

### 关键复用点
- 后端：`RagService.retrieve()` / `RagService.buildSystemPrompt()` / `LlmService.chatStream()` —— 直接复用，不重写
- 前端：QaTab.vue 的 SSE 解析逻辑、markdown-it 配置、ChatMessage 类型

## 验证清单

1. **依赖安装**：`npm install @langchain/langgraph --legacy-peer-deps` 成功，后端 tsc 通过
2. **后端启动**：`npm run start:dev` 无错，能看到 WorkflowModule 注册日志
3. **接口连通**：用 curl 或 Postman 调 `POST /api/workflow/rag-agent/stream`，带 JWT + kbId + query，能看到 SSE 流式输出 `sources/prompt/thinking/content/done`
4. **前端进入工作流页**：能选知识库 → 输入问题 → 看到流式回答 + 节点图高亮当前节点
5. **对比验证**：QaTab 的现有 RAG 问答仍正常（未破坏 `/api/service/chat` 和 `/api/chat/stream`）
6. **节点图**：retrieve 节点先高亮 → generate 节点后高亮，能看到流转
