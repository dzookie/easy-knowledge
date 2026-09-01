<script setup lang="ts">
/**
 * 角色权限 — 左角色列表 + 右菜单树勾选
 *
 * 流程:
 *  - 左侧角色列表(含用户数 / 菜单数), 点击选中角色
 *  - 右侧菜单树(show-checkbox), 回显已分配菜单勾选
 *  - 修改勾选 → 保存 → PUT /api/role/:id/menus 全量覆盖
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { nextTick, onMounted, ref } from 'vue'
import { ElMessage, ElTree } from 'element-plus'
import { Refresh, Lock } from '@element-plus/icons-vue'
import { roleApis, menuApis } from '@/apis'
import { useMenuStore } from '@/stores/menu'
import type { RoleRow, MenuNode } from '@/types'

const menuStore = useMenuStore()

/* ===== 状态 ===== */
const loadingRoles = ref(false)
const loadingMenus = ref(false)
const submitting = ref(false)

const roles = ref<RoleRow[]>([])
const currentRoleId = ref<string | null>(null)
const menuTreeData = ref<MenuNode[]>([])

/** 树组件实例 */
const treeRef = ref<InstanceType<typeof ElTree>>()

/** 树节点 props: 子节点字段 */
const treeProps = {
  label: 'name',
  children: 'children',
}

/* ===== 方法 ===== */

/* 加载角色列表 */
async function loadRoles() {
  loadingRoles.value = true
  try {
    roles.value = await roleApis.listRole()
    // 默认选中第一个角色
    if (roles.value.length > 0 && !currentRoleId.value) {
      await selectRole(roles.value[0]!.id)
    }
  } finally {
    loadingRoles.value = false
  }
}

/* 加载全部菜单树 */
async function loadMenuTree() {
  loadingMenus.value = true
  try {
    menuTreeData.value = await menuApis.listMenu()
  } finally {
    loadingMenus.value = false
  }
}

/* 选中角色 → 加载已分配菜单并回显勾选 */
async function selectRole(id: string) {
  currentRoleId.value = id
  // 确保菜单树已加载
  if (menuTreeData.value.length === 0) {
    await loadMenuTree()
  }
  // 等待树组件挂载(v-if 由 currentRoleId 触发)
  await nextTick()
  await nextTick()
  if (!treeRef.value) return

  try {
    const { menuIds } = await roleApis.getRoleMenus(id)
    // 只勾选叶子节点, 父级由 tree 自动计算半选/全选
    // (若传入父节点 id, el-tree 会把该父级置为全选并联动勾选全部子级, 导致数据失真)
    const leafIdSet = collectLeafIds(menuTreeData.value)
    const checkedLeafIds = menuIds.filter((mid) => leafIdSet.has(mid))
    treeRef.value.setCheckedKeys(checkedLeafIds, false)
  } catch {
    // 拦截器已处理
  }
}

/* 收集树中所有叶子节点 id(无 children 或 children 为空) */
function collectLeafIds(nodes: MenuNode[]): Set<string> {
  const result = new Set<string>()
  function walk(list: MenuNode[]) {
    for (const node of list) {
      if (!node.children || node.children.length === 0) {
        result.add(node.id)
      } else {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return result
}

/* 保存分配(全量覆盖) */
async function handleSave() {
  if (!currentRoleId.value) {
    ElMessage.warning('请先选择角色')
    return
  }
  // 收集: 完全勾选 + 半选(父级目录), 确保侧栏能渲染完整目录层级
  const checkedKeys = treeRef.value?.getCheckedKeys(false) as string[]
  const halfCheckedKeys = treeRef.value?.getHalfCheckedKeys() as string[]
  const menuIds = [...new Set([...(checkedKeys || []), ...(halfCheckedKeys || [])])]

  submitting.value = true
  try {
    await roleApis.assignMenus(currentRoleId.value, menuIds)
    ElMessage.success('权限保存成功')
    // 刷新角色列表以更新 menuCount
    await loadRolesSilently()
    // 刷新当前登录用户的侧栏菜单(若当前用户属于该角色, 立即生效)
    await menuStore.fetchCurrentUserMenus()
  } catch {
    // 拦截器已处理
  } finally {
    submitting.value = false
  }
}

/* 静默刷新角色列表(保留当前选中) */
async function loadRolesSilently() {
  const list = await roleApis.listRole()
  roles.value = list
}

/* 角色名加内置标记 */
function isBuiltin(code: string) {
  return ['admin', 'user'].includes(code)
}

onMounted(async () => {
  // 先加载菜单树, 再加载角色(角色列表会触发 selectRole, 此时菜单树已就绪)
  await loadMenuTree()
  await loadRoles()
})
</script>

<template>
  <div class="permission-page">
    <!-- 工具栏 -->
    <div class="permission-toolbar">
      <div class="permission-toolbar-left">
        <h2 class="permission-page-title">角色权限</h2>
        <span class="permission-page-desc">
          选择左侧角色 → 勾选右侧菜单 → 点击保存,权限以全量覆盖方式写入。保存后对应用户重新登录或刷新页面生效。
        </span>
      </div>
      <div class="permission-toolbar-right">
        <el-button :icon="Refresh" @click="loadRoles(); loadMenuTree()">刷新</el-button>
      </div>
    </div>

    <!-- 主体: 左角色列表 + 右菜单树 -->
    <div class="permission-body">
      <!-- 左侧角色列表 -->
      <div class="role-panel" v-loading="loadingRoles">
        <div class="panel-header">角色列表</div>
        <div class="role-list">
          <div
            v-for="role in roles"
            :key="role.id"
            class="role-item"
            :class="{ active: role.id === currentRoleId }"
            @click="selectRole(role.id)"
          >
            <div class="role-item-header">
              <span class="role-name">
                {{ role.name }}
                <el-tag v-if="isBuiltin(role.code)" type="info" size="small" effect="plain">内置</el-tag>
              </span>
              <el-tag
                :type="role.status === 1 ? 'success' : 'danger'"
                size="small"
                effect="plain"
              >
                {{ role.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </div>
            <div class="role-item-meta">
              <span class="role-code">{{ role.code }}</span>
              <span class="role-counts">
                用户 {{ role.userCount }} · 菜单 {{ role.menuCount }}
              </span>
            </div>
            <div v-if="role.description" class="role-item-desc">{{ role.description }}</div>
          </div>
          <el-empty v-if="roles.length === 0" description="暂无角色" :image-size="80" />
        </div>
      </div>

      <!-- 右侧菜单树 -->
      <div class="menu-panel">
        <div class="panel-header">
          <span>菜单权限</span>
          <span v-if="currentRoleId" class="panel-header-hint">
            当前角色: {{ roles.find(r => r.id === currentRoleId)?.name || '-' }}
          </span>
        </div>
        <div class="menu-tree-wrapper" v-loading="loadingMenus">
          <el-tree
            v-if="currentRoleId"
            ref="treeRef"
            :data="menuTreeData"
            :props="treeProps"
            node-key="id"
            show-checkbox
            default-expand-all
            :expand-on-click-node="false"
            class="menu-tree"
          >
            <template #default="{ data }">
              <span class="tree-node">
                <span class="tree-node-label">{{ data.name }}</span>
                <el-tag
                  :type="data.type === 1 ? 'info' : data.type === 2 ? 'primary' : 'warning'"
                  size="small"
                  effect="plain"
                  class="tree-node-type"
                >
                  {{ data.type === 1 ? '目录' : data.type === 2 ? '菜单' : '按钮' }}
                </el-tag>
                <span v-if="data.path" class="tree-node-path">{{ data.path }}</span>
                <span v-if="data.icon" class="tree-node-icon">{{ data.icon }}</span>
              </span>
            </template>
          </el-tree>
          <el-empty
            v-else
            description="请先在左侧选择角色"
            :image-size="80"
          />
        </div>
        <div v-if="currentRoleId" class="menu-panel-footer">
          <el-button type="primary" :loading="submitting" :icon="Lock" @click="handleSave">
            保存权限
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.permission-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 工具栏 */
.permission-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.permission-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.permission-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.permission-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  max-width: 720px;
}
.permission-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 主体布局 */
.permission-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  min-height: 480px;
}

/* 面板通用 */
.role-panel,
.menu-panel {
  background: var(--card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  border-bottom: 1px solid var(--border);
  background: var(--muted);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-header-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-foreground);
}

/* 角色列表 */
.role-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.role-item {
  padding: 10px 12px;
  border-radius: calc(var(--radius) - 4px);
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}
.role-item:hover {
  background: var(--muted);
}
.role-item.active {
  background: var(--accent);
  color: var(--accent-foreground);
}
.role-item.active .role-code,
.role-item.active .role-counts,
.role-item.active .role-item-desc {
  color: var(--accent-foreground);
  opacity: 0.85;
}
.role-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.role-name {
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.role-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
}
.role-code {
  font-family: var(--font-mono);
  color: var(--muted-foreground);
}
.role-counts {
  color: var(--muted-foreground);
}
.role-item-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 菜单树 */
.menu-tree-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.menu-tree :deep(.el-tree-node__content) {
  height: 32px;
}
.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tree-node-label {
  font-size: 14px;
}
.tree-node-type {
  transform: scale(0.85);
}
.tree-node-path,
.tree-node-icon {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
}

/* 底部保存 */
.menu-panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
