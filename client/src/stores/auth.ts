/**
 * useAuthStore — 认证状态管理
 *
 * 策略(方案 B):
 *  - login(): 只提交账号密码, 后端只返回 token, 本地只存 token
 *  - fetchCurrentUserDetail(): 用 token 调 /auth/current-user-detail 获取完整用户信息
 *  - 每次进入 requiresAuth 路由前, 守卫调用 fetchCurrentUserDetail() 刷新用户状态
 *    (保证管理员禁用/改角色等变更能立即生效)
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { http, HttpError } from '@/utils/http'

const TOKEN_KEY = 'ek-token'
const USER_KEY = 'ek-user'

export type UserRole = 'admin' | 'user'

export interface UserInfo {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  roleId: string         // 角色 ID(关联后端 role 表)
  role: UserRole         // role.code: 'admin' / 'user'
  roleName: string       // 角色名称(展示用,如"管理员")
  email: string | null
  phone: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
}

function readUser(): UserInfo | null {
  const s = localStorage.getItem(USER_KEY)
  return s ? (JSON.parse(s) as UserInfo) : null
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<UserInfo | null>(readUser())

  /** 用户信息是否已加载(避免路由守卫重复请求) */
  const userLoaded = ref(false)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  /**
   * 登录 — 提交账号密码, 仅保存 token
   * 用户信息不在这里拉取, 由路由守卫统一调 fetchCurrentUserDetail()
   */
  async function login(username: string, password: string): Promise<void> {
    const res = await http.post<{ token: string }>('/api/auth/login', {
      username,
      password,
    })
    token.value = res.token
    userLoaded.value = false
    localStorage.setItem(TOKEN_KEY, res.token)
  }

  /**
   * 拉取当前登录用户详情
   * - 进入后台前调用, 刷新本地缓存的用户信息
   * - 用户已被禁用/删除时返回 401, 自动登出
   */
  async function fetchCurrentUserDetail(): Promise<void> {
    if (!token.value) return
    try {
      const detail = await http.get<UserInfo>('/api/auth/current-user-detail')
      user.value = detail
      userLoaded.value = true
      localStorage.setItem(USER_KEY, JSON.stringify(detail))
    } catch (err) {
      // 401 由 http 拦截器统一处理(自动 logout), 这里只兜底其他错误
      if (err instanceof HttpError) {
        throw err
      }
      throw new Error('获取用户信息失败,请重试')
    }
  }

  function logout(silent = false) {
    token.value = ''
    user.value = null
    userLoaded.value = false
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    if (!silent) {
      // ElMessage 在外部按需引入, 避免在 store 层硬依赖
      import('element-plus').then(({ ElMessage }) => {
        ElMessage.success('已退出登录')
      })
    }
  }

  return {
    token,
    user,
    userLoaded,
    isLoggedIn,
    isAdmin,
    login,
    fetchCurrentUserDetail,
    logout,
  }
})
