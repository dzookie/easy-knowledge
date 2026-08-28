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
 * - requiresAuth 路由: 未登录跳转 /login
 * - public 路由(如 /login): 已登录则跳转 /admin(避免重复登录)
 */
router.beforeEach((to) => {
  const auth = useAuthStore()
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)
  const isPublic = to.matched.some((r) => r.meta.public)

  if (requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (isPublic && auth.isLoggedIn) {
    return { path: '/admin' }
  }

  if (to.meta.title) {
    document.title = to.meta.title as string
  }

  return true
})

export default router
