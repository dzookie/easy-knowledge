/**
 * 用户管理相关 API 路径
 * listUser: 查询全部用户 (后端直接返回数组, 未分页)
 * listRoleOptions: 角色下拉选项 (复用 /api/role 的非分页数组)
 */
import { http } from '@/utils/http'
import type { UserRow, RoleOption, UserForm } from '@/types/user'

export const userApis = {
  listUser: (params?: Record<string, any>) =>
    http.get<UserRow[]>('/api/user', { params }),

  createUser: (form: UserForm) =>
    http.post('/api/user', form),

  updateUser: (id: string, payload: UserForm) =>
    http.put(`/api/user/${id}`, payload),

  deleteUser: (id: string) =>
    http.delete(`/api/user/${id}`),

  resetPassword: (id: string, payload: { password: string }) =>
    http.put(`/api/user/${id}/reset-password`, payload),

  listRoleOptions: () =>
    http.get<RoleOption[]>('/api/role'),
}