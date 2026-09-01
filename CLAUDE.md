# CLAUDE.md — EasyKnowledge 项目上下文

> 本文件供 Trae / Claude / Cursor 等 AI IDE 自动读取, 帮助 AI 快速理解项目架构与编码约定.

## 项目概述

EasyKnowledge 是一个类似火山方舟的知识库管理系统, 支持文档上传、解析、切片、向量化、检索和问答.

- **后端** (`server/`): NestJS 10 + Prisma + MySQL + Qdrant
- **前端** (`client/`): Vue 3 + Vite + Element Plus + Pinia
- **前后端分离**, 独立部署, 非 monorepo

## 技术栈

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | ^10.0.0 | Web 框架 |
| Prisma | ^6.19.3 | ORM (MySQL) |
| @qdrant/js-client-rest | ^1.19.0 | 向量数据库客户端 |
| passport-jwt | ^4.0.1 | JWT 鉴权 |
| class-validator + class-transformer | — | DTO 校验与转换 |
| pdf-parse / mammoth / exceljs / csv-parse | — | 文档解析 |
| multer | ^2.3.0 | 文件上传 |
| uuid | ^14.0.2 | Qdrant point ID 生成 |

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | ^3.5.40 | 前端框架 |
| Vite | ^8.1.5 | 构建工具 |
| Element Plus | ^2.9.1 | UI 组件库 |
| Pinia | ^4.0.2 | 状态管理 |
| Vue Router | ^5.2.0 | 路由 |

### 基础设施
| 服务 | 地址 | 说明 |
|------|------|------|
| MySQL | localhost:3306 | 数据库名 easy_knowledge, root/admin123 |
| Qdrant | http://127.0.0.1:6333 | Docker 启动, 无 API Key |
| 千问 Embedding | https://dashscope.aliyuncs.com/compatible-mode/v1 | 阿里云 DashScope 兼容端点 |

## 环境变量 (server/.env)

```
DATABASE_URL          MySQL 连接串
JWT_SECRET            JWT 签名密钥
JWT_EXPIRES_IN        Token 有效期 (7d)
PORT                  后端端口 (3030)
CLIENT_ORIGIN         前端地址 (http://localhost:3031)
QDRANT_URL           Qdrant 地址
QDRANT_API_KEY        Qdrant API Key (本地无需)
QDRANT_VECTOR_SIZE    向量维度 (1024)
DASHSCOPE_API_KEY     千问 API Key
DASHSCOPE_BASE_URL    千问 API 端点
EMBEDDING_MODEL       向量化模型 (qwen3.7-text-embedding)
EMBEDDING_DIMENSION   向量维度 (1024)
UPLOAD_DIR            文件上传目录 (uploads)
UPLOAD_MAX_FILE_BYTES 单文件大小上限 (150MB)
```

## 常用命令

```bash
# 后端
cd server
npm install --legacy-peer-deps   # 必须加 --legacy-peer-deps, @nestjs/passport@12 与 nest@10 有 peer 冲突
npm run start:dev                  # 开发启动 (ts-node 直接跑, 监听 3030)
npm run build                      # 编译
npx prisma db push                 # 同步 schema 到 MySQL
npx prisma generate                # 生成 Prisma Client
npm run db:seed                    # 种子数据

# 前端
cd client
npm install
npm run dev                        # 开发启动 (Vite, 监听 3031)
npm run build                      # 生产构建
npm run type-check                 # 类型检查 (vue-tsc)
```

## 目录结构

### 后端 (server/src/)

```
src/
├── common/                     # 跨模块共享
│   ├── decorators/             # @CurrentUser, @Public 装饰器
│   ├── embedding/              # 千问 Embedding 全局模块
│   ├── enums/                   # ResponseCode 枚举
│   ├── filters/                # HttpExceptionFilter 全局异常
│   ├── guards/                 # JwtAuthGuard 鉴权守卫
│   ├── interceptors/          # TransformInterceptor 统一响应格式
│   ├── prisma/                 # PrismaService 数据库连接
│   ├── qdrant/                 # QdrantService 向量数据库
│   ├── storage/                # StorageService 本地文件存储
│   ├── types/                  # 共享类型 (AuthenticatedUser, JwtPayload, PaginationResult)
│   └── utils/                  # encoding.ts (中文文件名 mojibake 修复)
├── modules/                    # 业务模块 (按域划分)
│   ├── auth/                   # 认证: 登录, JWT, 获取用户信息
│   ├── document/               # 文档: 上传, 列表, 删除, 解析, 切片, 向量化流水线
│   │   ├── parsers/            # PDF/Docx/Markdown/TXT/XLSX/CSV 解析器
│   │   ├── chunkers/           # 递归/固定长度切片器
│   │   ├── pipeline.service.ts # 异步处理流水线编排
│   │   └── dto/                 # DocumentListQueryDto
│   ├── knowledge/              # 知识库: CRUD, Qdrant collection 管理
│   ├── menu/                   # 菜单: 动态菜单树
│   ├── role/                   # 角色: CRUD, 菜单权限分配
│   └── user/                   # 用户: CRUD, 重置密码
├── app.module.ts               # 根模块
└── main.ts                     # 启动入口 (listen 0.0.0.0:3030 双栈)
```

### 前端 (client/src/)

```
src/
├── types/                     # 共享类型集中管理
│   ├── auth.ts                 # UserRole, UserInfo
│   ├── api.ts                  # ApiResponse, RequestOptions, PostFormOptions, PaginationResult
│   ├── menu.ts                 # MenuItem, MenuNode
│   ├── user.ts                 # UserRow, RoleOption, UserForm, RoleRow
│   ├── knowledge.ts            # Creator, KnowledgeRow, KnowledgeDetail, KnowledgeForm, DocumentRow, UploadTaskItem
│   └── index.ts                # 统一出口 re-export
├── stores/                     # Pinia 状态管理
│   ├── auth.ts                 # 登录状态, token, 用户信息
│   └── menu.ts                 # 动态菜单树
├── utils/
│   └── http.ts                 # fetch 封装 + postForm (XMLHttpRequest 上传进度)
├── composables/
│   └── useTheme.ts             # 主题切换 (亮/暗)
├── router/
│   └── index.ts                # 路由定义 + 鉴权守卫
├── views/
│   ├── authForm/               # 登录页
│   └── admin/                  # 管理后台
│       ├── index.vue           # 主框架 (侧边栏 + 顶栏 + 子路由出口)
│       ├── dashboard/          # 仪表盘
│       ├── knowledge/          # 知识库管理 (列表 + 详情)
│       ├── user/               # 用户管理
│       ├── role/               # 角色管理
│       ├── permission/         # 权限管理
│       └── menu/               # 菜单管理
└── main.ts                     # 应用入口
```

## 数据库模型 (Prisma)

```
User              用户 (id, username, password, nickname, email, phone, avatar, roleId, status, ...)
Role              角色 (id, code, name, description, sort, status, ...)
Menu              菜单 (id, parentId, name, type, path, icon, sort, visible, ...)
RoleMenu          角色-菜单关联 (roleId, menuId)
KnowledgeBase     知识库 (id, name, description, embeddingModel, collection, chunkStrategy, chunkSize, chunkOverlap, documentCount, chunkCount, visibility, status, createdBy, ...)
Document          文档 (id, kbId, fileName, fileType, filePath, fileSize, status, chunkCount, totalChars, uploadedBy, startedAt, finishedAt, processMs, pageCount, errorMsg, deletedBy, ...)
DocumentChunk     文档切片 (id, docId, kbId, vectorId, content, chunkIndex, charCount, tokenCount, position, deletedAt, ...)
```

## API 路由

所有 API 前缀 /api, 统一响应格式 { code: number, message: string, data: T | null }.

| 模块 | 前缀 | 主要接口 |
|------|------|---------|
| 认证 | /api/auth | POST /login, GET /current-user-detail |
| 知识库 | /api/knowledge | CRUD + 分页列表 |
| 文档 | /api/document | POST /upload (multipart), GET / (分页), DELETE /:id |
| 用户 | /api/user | CRUD + 重置密码 |
| 角色 | /api/role | CRUD + 分配菜单 |
| 菜单 | /api/menu | CRUD + 当前用户菜单树 |

## 前端路由

```
/login                          登录页 (public)
/admin                          管理后台主框架 (requiresAuth)
  /admin/dashboard              仪表盘
  /admin/knowledge              知识库列表
  /admin/knowledge/:id          知识库详情 (4 Tab: 原始文档/切片详情/知识检索/知识问答)
  /admin/user                   用户管理
  /admin/role                   角色管理
  /admin/permission             权限管理
  /admin/menu                   菜单管理
```

## 编码约定

### 通用
- 语言: TypeScript 严格模式, 禁止 any (ESLint 已关闭 no-explicit-any 和 no-unused-vars)
- 命名: 变量/函数 camelCase, 类/接口/类型 PascalCase, 常量 UPPER_SNAKE_CASE
- 注释: 中文, 解释 "为什么" 而非 "做什么"
- 响应格式: 后端统一 { code, message, data }, code=200 成功, 401 未授权

### 后端
- 路径别名: @/ 指向 server/src/ (tsconfig paths)
- 模块划分: modules/ 下按业务域, 每个域含 controller/service/module/dto
- 共享类型: 放 common/types/, 通过 import { X } from '@/common/types' 导入
- 模块内类型: 如 ParsedResult/ChunkItem 留在模块内部 (parsers/types.ts), 不提取
- DTO 校验: class-validator + class-transformer, @Transform 处理空字符串, @Type(()=>Number) 处理 query 参数类型转换
- 权限控制: @CurrentUser() 装饰器 + user.role === 'admin' 判断, 非 admin 只能操作自己创建的资源
- 文件上传: Multer memoryStorage, 文件名 mojibake 修复 (encoding.ts), 存储路径用时间戳+随机串不用中文
- 向量数据库: Qdrant point ID 用 UUID v4 (不支持自定义字符串 ID), 删除按 payload.docId filter
- 异步流水线: PipelineService 不阻塞 HTTP, document.status: 0=等待 1=处理中 2=成功 3=失败

### 前端
- 路径别名: @/ 指向 client/src/ (tsconfig paths)
- 组件风格: script setup lang="ts" Composition API, 不用 Options API
- 类型导入: import type { X } from '@/types', 不在组件内定义 interface
- HTTP 请求: http.get/post/put/patch/delete + http.postForm (上传进度)
- 状态管理: Pinia stores, stores/auth.ts 和 stores/menu.ts
- el-upload 上传: 用 :http-request 自定义上传, 不用 :action 原生方式 (状态机不稳定)
- el-table: 必须指定 row-key, 避免 Vue Diff 按下标复用 DOM 导致视图不更新
- 路由守卫: 网络错误不跳登录页 (放行用缓存), 只有 401 才跳登录
- 代理配置: Vite proxy target 必须用 http://127.0.0.1:3030, 不能用 localhost (Windows IPv6 解析问题)

## 已知坑 (踩过的)

1. npm install 冲突: @nestjs/passport@12 要求 @nestjs/common@^11, 项目用 @10. 必须 --legacy-peer-deps
2. Windows localhost IPv6: Vite proxy localhost 会解析成 ::1, NestJS 只绑 IPv4 -> ECONNREFUSED. 用 127.0.0.1 + listen(0.0.0.0)
3. Qdrant point ID 格式: 只支持 unsigned integer 或 UUID, 不支持 doc_2_chunk_0 这种字符串
4. Prisma BigInt: MySQL bigint 在 Prisma 里是 BigInt, JSON 序列化前要 .toString()
5. Element Plus el-upload 状态机: file.status 在不同版本值不一致 (success/done/undefined), 用 :http-request 自定义上传绕过
6. Element Plus el-table row-key: 不指定时 Vue Diff 按数组下标复用 DOM, 数据已到但视图不渲染, "筛选一次才出来"
7. 中文文件名 mojibake: HTTP multipart Content-Disposition 的 filename= 被按 latin-1 解码, 需要 Buffer.from(name, 'latin1').toString('utf-8') 修复
8. Vue watch TDZ: watch(x, fn, {immediate: true}) 在 setup 早期执行会触发暂时性死区, 必须放在所有 const 声明之后
9. fetch 不支持上传进度: 文件上传进度必须用 XMLHttpRequest, fetch 标准至今不支持

## 待开发功能

- [ ] 切片详情 Tab (查看文档切片内容, 分页)
- [ ] 知识检索 Tab (向量相似度搜索)
- [ ] 知识问答 Tab (RAG 检索增强生成)
- [ ] v2: MinIO/OSS 替换本地文件存储
- [ ] v2: 前后端共享类型包 (monorepo)
