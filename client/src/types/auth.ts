/**
 * 认证相关类型
 */

export type UserRole = 'admin' | 'user'

export interface UserInfo {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  roleId: string         // 角色 ID (关联后端 role 表)
  role: UserRole         // role.code: 'admin' / 'user'
  roleName: string       // 角色名称 (展示用, 如"管理员")
  email: string | null
  phone: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
}
