/**
 * 菜单相关类型
 */

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

/** 菜单树节点 (权限管理页面用, children 可选) */
export interface MenuNode {
  id: string
  parentId: string
  name: string
  type: number        // 1目录 2菜单 3按钮
  path: string | null
  icon: string | null
  sort: number
  children?: MenuNode[]
}
