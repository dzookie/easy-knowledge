/**
 * useMenuStore — 菜单状态管理
 *
 * 职责:
 *  - fetchCurrentUserMenus(): 进入后台时调用后端接口拉取当前用户菜单树
 *  - 缓存菜单, 避免重复请求
 *  - 提供 flatMenus(扁平列表, 用于标题映射) 计算属性
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

export interface MenuItem {
  id: string
  parentId: string
  name: string
  type: number          // 1目录 2菜单 3按钮
  path: string | null
  icon: string | null
  sort: number
  visible: boolean
  children: MenuItem[]
}

export const useMenuStore = defineStore('menu', () => {
  const menus = ref<MenuItem[]>([])
  const loaded = ref(false)

  /** 拉取当前登录用户的菜单树 */
  async function fetchCurrentUserMenus(): Promise<void> {
    const data = await http.get<MenuItem[]>('/api/menu/current-user-menus')
    menus.value = data
    loaded.value = true
  }

  /** 扁平化菜单列表(用于 path → name 映射,如 Header 标题) */
  const flatMenus = computed(() => {
    const result: Array<{ path: string; name: string }> = []
    function walk(items: MenuItem[]) {
      for (const item of items) {
        if (item.path) {
          result.push({ path: item.path, name: item.name })
        }
        if (item.children.length > 0) {
          walk(item.children)
        }
      }
    }
    walk(menus.value)
    return result
  })

  /** 根据 path 查菜单名 */
  function getMenuName(path: string): string {
    return flatMenus.value.find((m) => m.path === path)?.name || '管理后台'
  }

  function reset() {
    menus.value = []
    loaded.value = false
  }

  return {
    menus,
    loaded,
    flatMenus,
    fetchCurrentUserMenus,
    getMenuName,
    reset,
  }
})
