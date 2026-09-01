/**
 * 用户管理相关类型
 */

export interface UserRow {
  id: string
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  roleId: string
  roleName: string
  roleCode: string
  status: number
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
}

export interface RoleOption {
  id: string
  name: string
  code: string
}

export interface UserForm {
  id?: string
  username: string
  password?: string
  nickname: string
  email: string
  phone: string
  roleId: string
  status: number
}

/** 角色管理列表行 */
export interface RoleRow {
  id: string
  code: string
  name: string
  description: string | null
  sort: number
  status: number
  userCount: number
  menuCount: number
  createdAt: string
}
