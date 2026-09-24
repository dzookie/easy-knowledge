/**
 * 动态路由生成器
 *
 * 职责: 把后端返回的菜单树转换成 Vue Router 子路由配置 (RouteRecordRaw[])
 *       供 router 守卫在登录后 / 刷新页面时 router.addRoute('admin', child) 注册
 *
 * 设计原则:
 *  - 纯函数, 不 import router / store, 避免循环依赖
 *  - 只处理 type===2 的菜单项 (叶子菜单), 目录 (type===1) 只递归 children 不产路由
 *  - component 路径匹配失败时用 MissingComponent 兜底, 菜单可见 + 控制台报错
 *  - 参数化子路由 (如 knowledge/:id) 走 EXTRA_SUB_ROUTES 附加表, 不污染菜单数据
 */
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import type { MenuItem } from '@/types'

/** 预加载 src/views 下所有 .vue 文件 (Vite 提供的 lazy 模块映射) */
const viewModules = import.meta.glob('/src/views/**/*.vue')

/**
 * 兜底组件: 菜单 component 字段填错时使用
 * 内联一个简单占位组件, 不依赖 PagePlaceholder, 避免额外的 props 适配
 */
const MissingComponent = defineComponent({
  name: 'RouteComponentMissing',
  render() {
    return h('div', { class: 'route-missing' }, [
      h('h2', '页面组件缺失'),
      h(
        'p',
        '菜单配置的 component 路径找不到对应 .vue 文件, 请检查菜单管理配置',
      ),
    ])
  },
})

/**
 * 参数化子路由附加表
 *
 * 处理菜单数据里不会出现的带参路由 (如详情页 :id), 当父菜单路径命中 parentPath 时,
 * 把 sub 一并注册进去. 短期方案, 长期可演进到 visible:false 菜单项通用方案.
 */
const EXTRA_SUB_ROUTES: Array<{
  parentPath: string
  sub: RouteRecordRaw
}> = [
  {
    parentPath: '/admin/knowledge',
    sub: {
      path: '/admin/knowledge',
      name: 'admin-knowledge',
      component: () => import('@/views/admin/knowledge/index.vue'),
      meta: { requiresAuth: true, title: '知识库 · MindFlow' },
    },
  },
  {
    parentPath: '/admin/knowledge',
    sub: {
      path: '/admin/knowledge/:id',
      name: 'admin-knowledge-detail',
      component: () => import('@/views/admin/knowledge/detail.vue'),
      meta: { requiresAuth: true, title: '知识库详情 · MindFlow' },
    },
  },
  {
    parentPath: '/admin/workflow',
    sub: {
      path: '/admin/workflow/:id/edit',
      name: 'admin-workflow-edit',
      component: () => import('@/views/admin/workflow/edit.vue'),
      meta: { requiresAuth: true, title: '工作流编辑器 · MindFlow' },
    },
  },
]

/** 记录已注册的动态路由 name, 供登出时 removeRoute (当前登出走硬刷新, 此集合留作扩展) */
export const DYNAMIC_ROUTE_NAMES: string[] = []

/**
 * 根据菜单 component 字段解析出对应的懒加载函数
 *
 * 兜底策略 (优先级从高到低):
 *  1) 用 component 字段 (显式填的值, 兼容多种格式)
 *  2) component 为空时, 按菜单 path 推算: "/admin/dashboard" → "admin/dashboard/index"
 *     即默认约定: 页面文件位于 src/views/{path 去掉 /admin 前缀}/index.vue
 *  3) 上述都失败: 返回 MissingComponent + console.error
 *
 * 兼容多种 component 填法 (容错):
 *  - "admin/dashboard/index"
 *  - "admin/dashboard/index.vue"
 *  - "/admin/dashboard/index"
 *  - "views/admin/dashboard/index.vue"
 *  - "src/views/admin/dashboard/index.vue"
 */
function resolveComponent(menuName: string, component: string | null, menuPath: string | null) {
  // 1. 决定要查找的 component 路径: 优先用 component 字段, 为空则按 path 推算
  let lookup = component?.trim() || ''

  if (!lookup) {
    // component 为空, 按 path 推算默认路径
    // "/admin/dashboard" → "admin/dashboard/index"
    if (!menuPath) {
      console.error(
        `[动态路由] 菜单 "${menuName}" 缺少 component 字段且 path 也为空, 无法推算默认组件`,
      )
      return MissingComponent
    }
    let derived = menuPath
    // 去掉前导斜杠和 /admin 前缀
    derived = derived.replace(/^\/+/, '')
    if (derived.toLowerCase().startsWith('admin/')) {
      derived = derived.slice('admin/'.length)
    }
    derived = derived.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!derived) {
      console.error(
        `[动态路由] 菜单 "${menuName}" 的 path "${menuPath}" 无法推算默认组件路径`,
      )
      return MissingComponent
    }
    lookup = `admin/${derived}/index`
  }

  // 2. 标准化: 去掉前导/后缀斜杠、去掉 .vue 后缀、去掉常见前缀
  let normalized = lookup
  normalized = normalized.replace(/^\/+/, '') // 去前导斜杠
  normalized = normalized.replace(/\.vue$/i, '') // 去 .vue 后缀
  // 去掉常见前缀 (用户可能填了完整路径)
  for (const prefix of ['src/views/', 'views/']) {
    if (normalized.toLowerCase().startsWith(prefix)) {
      normalized = normalized.slice(prefix.length)
      break
    }
  }
  normalized = normalized.replace(/^\/+/, '') // 再次去前导斜杠

  // 3. 主匹配: /src/views/${normalized}.vue
  const primaryPath = `/src/views/${normalized}.vue`
  if (viewModules[primaryPath]) {
    return viewModules[primaryPath] as () => Promise<{ default: Component }>
  }

  // 4. 反查兜底: 遍历所有模块 key, 找 endsWith(`/${normalized}.vue`)
  //    覆盖 "admin/dashboard/index" 命中 "/src/views/admin/dashboard/index.vue" 这种路径多嵌一层的情况
  const suffix = `/${normalized}.vue`
  const fallbackKey = Object.keys(viewModules).find((k) => k.endsWith(suffix))
  if (fallbackKey && viewModules[fallbackKey]) {
    return viewModules[fallbackKey] as () => Promise<{ default: Component }>
  }

  // 5. 全部失败: 打印可调试信息
  const sourceLabel = component ? `component "${component}"` : `path 推算 "${lookup}"`
  console.error(
    `[动态路由] 菜单 "${menuName}" 的 ${sourceLabel} 未找到 .vue 文件\n` +
      `  归一化后: "${normalized}"\n` +
      `  主匹配路径: ${primaryPath}\n` +
      `  反查后缀: ${suffix}\n` +
      `  可用模块示例: ${Object.keys(viewModules).slice(0, 5).join(', ')} ...\n` +
      `  提示: component 应形如 "admin/dashboard/index" (不带 src/views/ 前缀, 不带 .vue 后缀)`,
  )
  return MissingComponent
}

/**
 * 递归遍历菜单树, 生成 /admin 父路由下的子路由数组
 *
 * @param menus 菜单树
 * @returns RouteRecordRaw[] 子路由列表 (path 为绝对路径如 /admin/dashboard)
 */
export function generateRouteRecords(menus: MenuItem[]): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = []

  function walk(items: MenuItem[]) {
    for (const item of items) {
      // 目录: 只递归 children, 不产路由
      if (item.type === 1) {
        if (item.path) {
          console.warn(
            `[动态路由] 目录 "${item.name}" 不应配置 path, 已忽略 (path=${item.path})`,
          )
        }
        if (item.children.length > 0) walk(item.children)
        continue
      }

      // 只处理叶子菜单 (type===2), 按钮类型 (type===3) 后端已过滤, 兜底再过滤一次
      if (item.type !== 2) continue
      if (!item.path) continue

      const routeName = `admin-menu-${item.id}`
      const route: RouteRecordRaw = {
        path: item.path, // 绝对路径如 /admin/dashboard, Vue Router 4 子路由支持
        name: routeName,
        component: resolveComponent(item.name, item.component, item.path),
        meta: {
          requiresAuth: true,
          title: `${item.name} · MindFlow`,
        },
      }
      routes.push(route)
      DYNAMIC_ROUTE_NAMES.push(routeName)

      // 命中参数化附加路由 (如 knowledge/:id)
      for (const extra of EXTRA_SUB_ROUTES) {
        if (item.path === extra.parentPath) {
          routes.push(extra.sub)
          DYNAMIC_ROUTE_NAMES.push(extra.sub.name as string)
        }
      }
    }
  }

  walk(menus)
  return routes
}

/**
 * 构造 404 兜底路由 (必须在所有动态业务路由注册完之后再 addRoute)
 */
export function buildNotFoundRoute(): RouteRecordRaw {
  return {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/login',
  }
}
