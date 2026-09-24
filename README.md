# MindFlow

一个面向企业的 AI 工作流编排与知识库问答平台，融合可视化 DAG 工作流编排与 RAG 知识库问答能力，支持拖拽式节点编排、条件分支路由、流式运行调试，以及文档向量化存储、检索增强生成与 API Key 鉴权的对外服务接口。

## 功能特性

- **知识库管理**：创建/编辑/删除知识库，配置向量模型与切片策略
- **文档处理**：支持 PDF / Word / Excel / PPT / Markdown / TXT / CSV，自动解析、切片、向量化
- **多种切片策略**：递归切分、语义切分（按 Markdown 标题边界）、固定长度
- **RAG 问答**：向量检索 + LLM 生成，流式输出（SSE），支持召回详情与 Prompt 调试
- **工作流编排**：可视化流程编辑器，支持开始/结束、LLM、知识检索、模板、条件分支等节点，拖拽连线，运行调试
- **DAG 执行引擎**：基于 Kahn 拓扑排序调度执行顺序，可达性集合支持并行分支与 if-else 条件路由，AsyncGenerator + SSE 实现节点执行轨迹与流式输出实时推送
- **对外服务**：通过 API Key 对外提供问答接口，支持同步 / 流式（SSE）两种模式
- **权限系统**：基于角色（RBAC）的用户、菜单、权限管理
- **主控台**：知识库/文档/切片统计、系统状态监控、最近文档处理

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + Vue Flow |
| 后端 | NestJS + TypeScript |
| 数据库 | MySQL + Prisma ORM |
| 向量库 | Qdrant |
| Embedding | Ollama (qllama/bge-m3:latest) |
| LLM | DeepSeek (LangChain.js 调用) |
| 文档解析 | pdf-parse / mammoth / exceljs / csv-parse |

## 项目结构

```
mindflow/
├── client/                    # 前端 (Vue3 + Element Plus + Vue Flow)
│   └── src/
│       ├── apis/                  # API 封装 (按领域分文件)
│       ├── views/admin/           # 管理后台页面 (knowledge/workflow/...)
│       ├── stores/                # Pinia 状态
│       ├── types/                 # TypeScript 类型定义 (按领域分文件)
│       └── utils/http.ts          # axios 封装
├── client/                    # 前端 (Vue3 + Element Plus + Vue Flow)
├── server/                    # 后端 (NestJS)
│   ├── prisma/                    # Prisma 数据模型、迁移文件与种子脚本
│   │   ├── schema.prisma          # 数据库模型定义
│   │   ├── migrations/            # 数据库迁移 SQL (已提交到 Git)
│   │   └── seed.ts                # 初始化管理员账号
│   ├── .env.example               # 环境变量模板
│   └── src/
│       ├── common/                # 基础设施
│       │   ├── embedding/         # 文本向量化 (Ollama)
│       │   ├── llm/               # LLM 封装 (DeepSeek + LangChain.js)
│       │   ├── qdrant/            # 向量数据库
│       │   ├── rag/               # RAG 核心：检索 + Prompt 组装 + 流式生成
│       │   ├── storage/           # 本地文件存储
│       │   ├── guards/            # JWT / API Key 鉴权守卫
│       │   └── prisma/            # Prisma ORM 服务封装
│       └── modules/               # 业务模块
│           ├── knowledge/         # 知识库管理
│           ├── document/          # 文档上传/解析/切片/向量化
│           ├── chat/              # 后台 RAG 流式问答
│           ├── retrieval/         # 检索接口
│           ├── service/           # 对外 API Key 服务调用
│           ├── workflow/          # 工作流编排与执行
│           │   └── executor/      # DAG 执行引擎 (拓扑排序 + 节点 handler)
│           ├── auth/              # 认证登录
│           ├── user/role/menu/    # 用户/角色/菜单 (RBAC)
│           └── dashboard/         # 主控台统计
└── db/                        # 数据库备份 SQL（备选初始化方式）
    └── mindflow.sql              # 完整建表 + 初始数据
```

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0
- Qdrant（向量数据库，Docker 启动）
- Ollama（本地 Embedding 服务，需拉取 qllama/bge-m3:latest）

### 1. 启动依赖服务

```bash
# 启动 Qdrant 向量数据库
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# 启动 Ollama 并拉取 embedding 模型
ollama serve
ollama pull qllama/bge-m3:latest
```

### 2. 后端

```bash
cd server
npm install --legacy-peer-deps    # @nestjs/passport@12 与 nest@10 peer 冲突, 需用 --legacy-peer-deps

# 配置环境变量 (参考下方 .env 配置说明)
cp .env.example .env

# 初始化数据库（二选一）
# 方式 A: 使用 Prisma 迁移（推荐，与 schema 保持同步）
npm run db:migrate                # 运行 Prisma 迁移
npm run db:seed                   # 初始化管理员账号 (admin/admin123)

# 方式 B: 直接导入 SQL 备份（已含表结构 + 初始数据）
mysql -u root -p mindflow < ../db/mindflow.sql

# 启动开发服务 (默认端口 3030)
npm run start:dev
```

### 3. 前端

```bash
cd client
npm install
npm run dev                       # 默认端口 3031
```

访问 `http://localhost:3031`，使用 `admin / admin123` 登录。

## .env 配置说明

后端根目录需创建 `.env` 文件，关键配置项：

```env
# 数据库
DATABASE_URL="mysql://root:password@localhost:3306/mindflow"

# JWT
JWT_SECRET="your-jwt-secret"
JWT_EXPIRES_IN="7d"

# 服务端口
PORT=3030

# 前端地址 (CORS)
CLIENT_ORIGIN="http://localhost:3031"

# Qdrant 向量数据库
QDRANT_URL="http://127.0.0.1:6333"
QDRANT_VECTOR_SIZE=1024

# Embedding (本地 Ollama)
EMBEDDING_BASE_URL="http://127.0.0.1:11434/v1"
EMBEDDING_MODEL="qllama/bge-m3:latest"
EMBEDDING_DIMENSION=1024

# LLM (DeepSeek)
DEEPSEEK_API_KEY="sk-xxxx"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"
```

## 工作流编排引擎

### 节点类型

| 节点 | 说明 |
|------|------|
| start | 工作流入口，声明入参变量 |
| end | 工作流出口，输出最终结果 |
| llm | 调用大模型生成回答 |
| knowledge_retrieval | 从知识库检索相关切片 |
| template | 用 `{{node.var}}` 拼装字符串 |
| if_else | 按条件走不同分支 |

### 执行原理

1. **拓扑排序**：使用 Kahn 算法对 DAG 图进行校验与执行顺序调度，保证每个节点执行时所有上游节点已完成
2. **可达性集合**：普通节点执行后标记所有下游为可达（支持并行），if_else 节点只标记命中分支的下游为可达，其他分支跳过
3. **流式执行**：基于 AsyncGenerator + SSE，通过 `yield*` 将 LLM 的流式 token 直接透传到前端，实现节点执行轨迹与输出的实时推送
4. **变量解析**：支持 `{{node_id.variable_name}}` 语法，执行时从已完成节点的 outputs 中取值

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
| `common/embedding` | 文本向量化（本地 Ollama qllama/bge-m3:latest） |
| `document/chunkers` | 三种切片策略：recursive / semantic / fixed |
| `workflow/executor` | DAG 执行引擎：拓扑排序、节点 handler、条件分支、流式执行 |
| `modules/service` | 对外 API Key 服务调用 |
| `modules/chat` | 后台 RAG 流式问答 |

## License

MIT
