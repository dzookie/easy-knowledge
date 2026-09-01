/**
 * 菜单相关 API 路径
 */
import { http } from '@/utils/http'
import type { MenuItem, MenuNode } from '@/types/menu'

export const menuApis = {
  getCurrentUserMenus: () =>
    http.get<MenuItem[]>('/api/menu/current-user-menus'),

  listMenu: () =>
    http.get<MenuNode[]>('/api/menu'),

  createMenu: (payload: Record<string, any>) =>
    http.post('/api/menu', payload),

  updateMenu: (id: string, payload: Record<string, any>) =>
    http.put(`/api/menu/${id}`, payload),

  deleteMenu: (id: string) =>
    http.delete(`/api/menu/${id}`),
}