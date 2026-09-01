/**
 * 角色管理相关 API 路径
 * listRole: 查询全部角色 (后端直接返回数组, 未分页)
 */
import { http } from '@/utils/http'
import type { RoleRow } from '@/types/user'

export const roleApis = {
  listRole: (params?: Record<string, any>) =>
    http.get<RoleRow[]>('/api/role', { params }),

  createRole: (form: Record<string, any>) =>
    http.post('/api/role', form),

  updateRole: (id: string, form: Record<string, any>) =>
    http.put(`/api/role/${id}`, form),

  deleteRole: (id: string) =>
    http.delete(`/api/role/${id}`),

  getRoleMenus: (roleId: string) =>
    http.get<{ menuIds: string[] }>(`/api/role/${roleId}/menus`),

  assignMenus: (roleId: string, menuIds: string[]) =>
    http.put(`/api/role/${roleId}/menus`, { menuIds }),
}