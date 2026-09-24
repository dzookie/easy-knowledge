import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { HttpError } from '@/utils/http'
import { generateRouteRecords, buildNotFoundRoute } from './dynamicRoutes'

/**
 * 静态路由表 (只含无需权限判断的固定路由)
 *  - /admin 的业务子路由全部由守卫在登录后动态 addRoute 注册
 *  - 404 兜底也由守卫在动态路由注册完成后才 addRoute, 避免刷新时抢先匹配 → 跳 /login 死循环
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/authForm/index.vue'),
    meta: { public: true, title: '登录 · Easy-Knowledge' },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/index.vue'),
    meta: { requiresAuth: true },
    children: [
      // 进入 /admin 本身时默认跳 dashboard (dashboard 子路由会由动态注册接管)
      { path: '', redirect: '/admin/dashboard' },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/** 标记动态路由是否已注册, 避免 menuStore.loaded=true 时守卫仍重复 addRoute */
let dynamicRoutesRegistered = false

/**
 * 路由守卫
 *
 * 改造为 token 优先判断 (不依赖 to.matched.meta.requiresAuth, 因为动态路由未注册时 matched 为空判断失真)
 *
 * 流程:
 *  1) to 是 public 页(/login): 已登录跳 /admin, 未登录放行
 *  2) 未登录访问其他页: 跳 /login?redirect=xxx
 *  3) 已登录但菜单未加载: fetchCurrentUserMenus + addRoute 业务子路由 + addRoute 404 兜底
 *     return { ...to, replace: true } 触发重新匹配
 *  4) 已登录但用户信息未加载: fetchCurrentUserDetail (保证角色变更立即生效)
 *  5) 设置 document.title, 放行
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const menuStore = useMenuStore()
  const isPublic = to.path === '/login'

  // 1. public 路由
  if (isPublic) {
    if (auth.isLoggedIn) return { path: '/admin' }
    return true
  }

  // 2. 未登录
  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 3. 已登录但动态路由未注册: 加载菜单 + 注册路由 + 重新匹配
  if (!dynamicRoutesRegistered) {
    try {
      if (!menuStore.loaded) {
        await menuStore.fetchCurrentUserMenus()
      }
      const children = generateRouteRecords(menuStore.menus)
      for (const child of children) {
        router.addRoute('admin', child)
      }
      // 404 兜底必须最后注册, 否则会在业务路由注册前抢先匹配 → 跳 /login 死循环
      router.addRoute(buildNotFoundRoute())
      dynamicRoutesRegistered = true
    } catch (err) {
      // 401: token 无效, http 拦截器已 logout, 跳登录
      if (err instanceof HttpError && err.code === 401) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      // 网络错误(后端没启动): 不阻断, 用空菜单注册 (业务子路由为空, 404 兜底仍生效)
      // 避免刷新时 fetch 失败 → 守卫卡住 → 用户无法操作
      router.addRoute(buildNotFoundRoute())
      dynamicRoutesRegistered = true
    }
    // 重新触发匹配, 让刚注册的动态路由生效
    return { ...to, replace: true }
  }

  // 4. 已登录但用户信息未加载 (登录后首次跳转 / 刷新页面后 userLoaded=false)
  if (!auth.userLoaded) {
    try {
      await auth.fetchCurrentUserDetail()
    } catch (err) {
      if (err instanceof HttpError && err.code === 401) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      // 网络错误: 放行用 localStorage 缓存的用户信息
    }
  }

  // 5. 设置标题, 放行
  if (to.meta.title) {
    document.title = to.meta.title as string
  }

  return true
})

/** 退出登录时调用: 重置动态路由注册标志 (登出本身走硬刷新, 此函数留作扩展) */
export function resetDynamicRoutes() {
  dynamicRoutesRegistered = false
}

export default router
