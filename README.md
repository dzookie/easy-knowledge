# Easy-Knowledge

一个基于 RAG（检索增强生成）的知识库问答系统，支持文档上传、语义切片、向量检索、AI 问答，以及通过 API Key 对外提供知识问答服务。

## 功能特性

- **知识库管理**：创建/编辑/删除知识库，配置向量模型与切片策略
- **文档处理**：支持 PDF / Word / Excel / PPT / Markdown / TXT / CSV，自动解析、切片、向量化
- **多种切片策略**：递归切分、语义切分（按 Markdown 标题边界）、固定长度
- **RAG 问答**：向量检索 + LLM 生成，流式输出（SSE），支持召回详情与 Prompt 调试
- **对外服务**：通过 API Key 对外提供问答接口，支持同步 / 流式（SSE）两种模式
- **权限系统**：基于角色（RBAC）的用户、菜单、权限管理
- **主控台**：知识库/文档/切片统计、系统状态监控、最近文档处理

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router |
| 后端 | NestJS + TypeScript |
| 数据库 | MySQL + Prisma ORM |
| 向量库 | Qdrant |
| LLM | DeepSeek（LangChain.js 调用） |
| 文档解析 | pdf-parse / mammoth / exceljs / csv-parse |

## 项目结构

```
easy-knowledge/
├── client/          # 前端 (Vue3 + Element Plus)
│   └── src/
│       ├── apis/        # API 封装 (按领域分文件)
│       ├── views/admin/ # 管理后台页面
│       ├── stores/      # Pinia 状态
│       └── utils/http.ts# axios 封装
├── server/          # 后端 (NestJS)
│   └── src/
│       ├── common/      # 基础设施 (Prisma/Qdrant/LLM/RAG/Storage/Guard)
│       └── modules/     # 业务模块
└── prisma/          # 数据模型
```

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0
- Qdrant（向量数据库）

### 后端

```bash
cd server
npm install --legacy-peer-deps    # @nestjs/passport@12 与 nest@10 peer 冲突, 需用 --legacy-peer-deps
cp .env.example .env              # 配置数据库、Qdrant、DeepSeek API Key
npx prisma migrate dev            # 初始化数据库
npx prisma db seed                # 初始化管理员账号
npm run start:dev                 # 启动开发服务 (默认端口 3030)
```

### 前端

```bash
cd client
npm install
npm run dev                       # 默认端口 5173
```

## 对外服务调用

知识库详情页 →「问答」Tab →「创建服务调用」→ 新建 API Key，即可通过 HTTP 调用：

```bash
# 同步模式
curl -X POST http://localhost:3030/api/service/chat \
  -H "X-API-Key: sk-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "你的问题"}'

# 流式模式 (SSE)
curl -X POST http://localhost:3030/api/service/chat \
  -H "X-API-Key: sk-xxxx" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query": "你的问题", "stream": true}'
```

## 核心模块

| 模块 | 说明 |
|------|------|
| `common/rag` | RAG 核心：检索 + Prompt 组装 + 流式生成（后台问答与对外服务共享） |
| `common/llm` | LLM 封装：同步 chat + 流式 chatStream（区分 thinking/content） |
| `common/embedding` | 文本向量化（DashScope 通义千问 embedding） |
| `document/chunkers` | 三种切片策略：recursive / semantic / fixed |
| `modules/service` | 对外 API Key 服务调用 |
| `modules/chat` | 后台 RAG 流式问答 |

## License

MIT
