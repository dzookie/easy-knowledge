import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
    component: () => import('@/views/admin/index.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/dashboard/index.vue'),
        meta: { requiresAuth: true, title: '主控台 · Easy-Knowledge' },
      },
      {
        path: 'knowledge',
        name: 'admin-knowledge',
        component: () => import('@/views/admin/knowledge/index.vue'),
        meta: { requiresAuth: true, title: '知识库管理 · Easy-Knowledge' },
      },
      {
        path: 'user',
        name: 'admin-user',
        component: () => import('@/views/admin/user/index.vue'),
        meta: { requiresAuth: true, title: '用户管理 · Easy-Knowledge' },
      },
      {
        path: 'role',
        name: 'admin-role',
        component: () => import('@/views/admin/role/index.vue'),
        meta: { requiresAuth: true, title: '角色管理 · Easy-Knowledge' },
      },
      {
        path: 'permission',
        name: 'admin-permission',
        component: () => import('@/views/admin/permission/index.vue'),
        meta: { requiresAuth: true, title: '角色权限 · Easy-Knowledge' },
      },
      {
        path: 'menu',
        name: 'admin-menu',
        component: () => import('@/views/admin/menu/index.vue'),
        meta: { requiresAuth: true, title: '菜单管理 · Easy-Knowledge' },
      },
    ],
  },
  // 404 兜底
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * 路由守卫
 * - public 路由(如 /login): 已登录则跳转 /admin, 避免重复登录
 * - requiresAuth 路由:
 *   1) 无 token → 跳 /login?redirect=xxx
 *   2) 有 token 但尚未加载用户信息 → 调 fetchCurrentUserDetail() 刷新
 *      (保证管理员禁用/改角色等变更能立即生效)
 *   3) fetchCurrentUserDetail 失败(401/网络) → 跳 /login
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)
  const isPublic = to.matched.some((r) => r.meta.public)

  // 已登录访问公开页(如登录页) → 跳后台
  if (isPublic && auth.isLoggedIn) {
    return { path: '/admin' }
  }

  // 需要鉴权的页面
  if (requiresAuth) {
    if (!auth.isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 有 token 但用户信息未加载 → 拉一次最新信息
    // (登录后首次跳转 / 刷新页面后 userLoaded 会被重置为 false)
    if (!auth.userLoaded) {
      try {
        await auth.fetchCurrentUserDetail()
      } catch {
        // 拉取失败(401 已被 http 拦截器 logout, 这里兜底跳登录)
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }
  }

  if (to.meta.title) {
    document.title = to.meta.title as string
  }

  return true
})

export default router
