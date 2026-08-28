/**
 * useAuthStore — 认证状态管理
 * - token 持久化到 localStorage
 * - 用户信息(id/username/nickname/avatar/role)
 * - 登录/登出逻辑(调用后端真实 API)
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { http, HttpError } from '@/utils/http'

const TOKEN_KEY = 'ek-token'
const USER_KEY = 'ek-user'

export type UserRole = 'ADMIN' | 'USER'

export interface UserInfo {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  role: UserRole
}

interface LoginResponse {
  token: string
  user: UserInfo
}

function readUser(): UserInfo | null {
  const s = localStorage.getItem(USER_KEY)
  return s ? (JSON.parse(s) as UserInfo) : null
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<UserInfo | null>(readUser())

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  /**
   * 登录 — 调用后端 /api/auth/login
   */
  async function login(username: string, password: string): Promise<void> {
    try {
      const res = await http.post<LoginResponse>('/api/auth/login', {
        username,
        password,
      })

      token.value = res.token
      user.value = res.user
      localStorage.setItem(TOKEN_KEY, res.token)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
    } catch (err) {
      if (err instanceof HttpError) {
        throw new Error(err.message)
      }
      throw new Error('网络异常,请稍后重试')
    }
  }

  function logout(silent = false) {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    if (!silent) ElMessage.success('已退出登录')
  }

  return { token, user, isLoggedIn, isAdmin, login, logout }
})
