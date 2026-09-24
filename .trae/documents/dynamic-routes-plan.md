# 动态路由改造方案

## Context

当前项目用"后端动态菜单 + 前端静态路由"的混合架构：菜单项来自后端接口 `GET /api/menu/current-user-menus`，但路由表硬编码在 `client/src/router/index.ts`。这导致每次新增菜单页都要同步改两处代码，容易遗漏（典型症状：新建 workflow 菜单后跳转错误落到 dashboard）。

后端菜单 DTO 已包含 `component` 字段（前端组件路径如 `admin/dashboard/index`），菜单管理表单也已支持填写"组件路径"。本次改造让前端在登录后根据后端菜单数据动态 `router.addRoute()` 注册路由，实现**菜单和路由永远同步**，新增菜单页只需在菜单管理里填 path + component，零代码改动。

预期收益：彻底消除"加菜单忘改路由"的运维事故；为未来多角色权限路由差异、菜单即时生效等能力打下基础。

## 关键设计决策

### 1. 模块拆分：避免循环依赖

- **新建** `client/src/router/dynamicRoutes.ts`：纯函数 `generateRouteRecords(menus)` 把菜单树转 `RouteRecordRaw[]`，导出 `DYNAMIC_ROUTE_NAMES`（已注册路由 name 集合）、`FALLBACK_COMPONENT`、`EXTRA_SUB_ROUTES`（参数化子路由附加表，处理 `knowledge/:id` 这类无菜单项的详情路由）
- **menuStore 不动 router**：仍只管 `fetchCurrentUserMenus` / `loaded` / `menus` / `flatMenus` / `reset`。彻底无循环依赖
- **router/index.ts 守卫内** 调 `router.addRoute('admin', child)` 完成注册

### 2. 静态 routes 数组瘦身

`client/src/router/index.ts` 静态 `routes` 只保留 3 条：
1. `/` redirect `/login`
2. `/login` (public)
3. `/admin` (layout, `meta: { requiresAuth: true }`, children 仅保留 `{ path: '', redirect: '/admin/dashboard' }`)

删除：`dashboard` / `knowledge` / `knowledge/:id` / `user` / `role` / `permission` / `menu` / `workflow` 共 8 条静态子路由，全部由动态注册接管。

**404 兜底路由从静态数组移除**，改为守卫里动态注册（必须最后 addRoute，避免动态路由还没注册就匹配到 404 死循环）。

### 3. 守卫改造：token 优先判断

当前守卫依赖 `to.matched.some(r => r.meta.requiresAuth)` 判断，但动态路由未注册时 `to.matched` 为空，判断失真。改造为：

```
1. 若 to.path 是 public 页(/login)：已登录跳 /admin，未登录放行
2. 若 !auth.isLoggedIn：跳 /login?redirect=to.fullPath
3. 若 auth.isLoggedIn && !menuStore.loaded：
   - await menuStore.fetchCurrentUserMenus() (401→跳/login, 网络错误→放行用缓存)
   - const children = generateRouteRecords(menuStore.menus)
   - for (const c of children) router.addRoute('admin', c)
   - router.addRoute({ path: '/:pathMatch(.*)*', name: 'not-found', redirect: '/login' })  // 最后
   - return { ...to, replace: true }  // 重新触发匹配
4. 已加载：设 document.title 放行
```

`return { ...to, replace: true }` 是 Vue Router 4 标准动态路由重匹配写法。

### 4. 子路由 path 处理

子路由 `path` 直接用菜单的绝对路径 `/admin/dashboard`（Vue Router 4 子路由支持绝对 path）。`route.path` 最终也是 `/admin/dashboard`，与 `el-menu-item :index="node.path"` 字符相等，`activeMenu = computed(() => route.path)` 高亮正常。

### 5. type=1 目录不注册路由

`admin/index.vue` 用 `el-menu-item-group` 渲染目录，目录本身无 index 不会被点击。生成器遇到 `type===1` 只递归 `children`，不产 RouteRecordRaw。若目录填了 path，`console.warn` 提示数据卫生问题。

### 6. 参数化子路由（knowledge/:id）

菜单管理表单不允许填 `:id` 形式的 path（UI 不合理），所以详情路由不在菜单数据里。方案：

在 `dynamicRoutes.ts` 维护 `EXTRA_SUB_ROUTES` 静态附加表：

```
const EXTRA_SUB_ROUTES = [
  {
    parentPath: '/admin/knowledge',
    sub: {
      path: '/admin/knowledge/:id',
      name: 'admin-knowledge-detail',
      component: () => import('@/views/admin/knowledge/detail.vue'),
    },
  },
]
```

生成器遍历菜单时，命中 `parentPath` 就把 `sub` 一并 push 进结果数组。短期改动小、不污染菜单数据。长期可演进到"visible:false 菜单项"通用方案。

### 7. 组件路径匹配失败兜底

`import.meta.glob('/src/views/**/*.vue')` 预加载所有 .vue 文件（lazy 模式），key 形如 `/src/views/admin/dashboard/index.vue`。生成器拿菜单 `component`（如 `admin/dashboard/index`）拼成完整路径去查：

- **命中**：用对应懒加载函数作为 `component`
- **未命中**：`console.error` 提示 + 用 `FALLBACK_COMPONENT`（基于已有 `views/admin/components/PagePlaceholder.vue` 包装"页面组件缺失"提示页）兜底，菜单可见、点击有反馈、运维能立即发现填错

### 8. 登出清理：硬刷新

`admin/index.vue` 的 `logout()` 改为 `window.location.href = '/login'`，让 router 重新初始化。失去 SPA 切换体验，但登出本来就要切页面，用户感知不大，且彻底避免"路由名残留导致切角色看到无权限页面"问题。

### 9. 菜单管理页变更生效

菜单管理页保存成功后，路由不会自动同步。简化方案：`ElMessage.success('菜单已保存，刷新页面后生效')`。后续可演进 `reloadDynamicRoutes()` 函数。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `client/src/types/menu.ts` | **前置阻塞**：`MenuItem` 接口补 `component: string \| null`、`permission: string \| null`（与后端 DTO 对齐） |
| `client/src/router/dynamicRoutes.ts` | **新建**：`generateRouteRecords` / `DYNAMIC_ROUTE_NAMES` / `FALLBACK_COMPONENT` / `EXTRA_SUB_ROUTES` |
| `client/src/router/index.ts` | 静态 routes 瘦身（删 8 条子路由 + 删静态 404）；守卫重写为 token 优先 + 动态注册 + 404 最后 + return replace |
| `client/src/views/admin/index.vue` | 删 `onMounted(loadMenus)`（守卫统一加载）；`logout()` 改硬刷新 |
| `client/src/views/admin/menu/index.vue` | `handleSubmit` 保存成功提示加"刷新页面后生效" |

menuStore (`client/src/stores/menu.ts`) 无需改动，职责保持纯数据。

## 验证清单

1. 普通用户刷新 `/admin/dashboard`：守卫触发 → 加载菜单 → addRoute → 重新匹配 → 进入页面
2. admin 用户刷新 `/admin/knowledge/123`：详情路由通过 `EXTRA_SUB_ROUTES` 注册成功，能正常进入
3. 菜单 `component` 故意填错：兜底页"页面组件缺失"出现 + 控制台报错
4. 切角色登出硬刷新：旧路由全部清空，新角色只看到自己的菜单和路由
5. 菜单管理页新增菜单保存：提示刷新生效，刷新后点击新菜单能正常进入
6. 404 兜底：访问 `/admin/not-exist` 跳 `/login`（已登录会再被守卫跳回 /admin）
7. el-menu 高亮：当前路由对应菜单项正常高亮
