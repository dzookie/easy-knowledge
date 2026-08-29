<script setup lang="ts">
/**
 * 菜单管理 — 树形表格 + 新增/编辑/删除
 *
 * 功能:
 *  - 折叠树形表格渲染全部菜单(含目录/菜单/按钮权限点)
 *  - 新增(支持在指定节点下新增子菜单)
 *  - 编辑(修改菜单信息)
 *  - 删除(级联删除子菜单, 二次确认)
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Menu as MenuIcon, Search, Close } from '@element-plus/icons-vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { http } from '@/utils/http'
import { useMenuStore } from '@/stores/menu'

const menuStore = useMenuStore()

/* ===== 图标全集(用于图标选择器) ===== */
const iconMap = ElementPlusIconsVue as unknown as Record<string, any>
const iconList = Object.keys(iconMap)
  .filter((k) => typeof iconMap[k] === 'object' && k !== 'default')
  .map((name) => ({ name, component: iconMap[name] }))

/* ===== 类型 ===== */
interface MenuRow {
  id: string
  parentId: string
  name: string
  type: number        // 1目录 2菜单 3按钮
  path: string | null
  component: string | null
  icon: string | null
  permission: string | null
  sort: number
  visible: boolean
  status: number
  children?: MenuRow[]
}

interface MenuForm {
  id?: string
  parentId: string
  name: string
  type: number
  path: string
  component: string
  icon: string
  permission: string
  sort: number
  visible: number
  status: number
}

/* ===== 状态 ===== */
const loading = ref(false)
const tableData = ref<MenuRow[]>([])

/* 弹窗 */
const dialogVisible = ref(false)
const dialogTitle = ref('新增菜单')
const submitting = ref(false)

/* 表单默认值 */
const defaultForm = (): MenuForm => ({
  parentId: '0',
  name: '',
  type: 2,
  path: '',
  component: '',
  icon: '',
  permission: '',
  sort: 0,
  visible: 1,
  status: 1,
})

const form = reactive<MenuForm>(defaultForm())

/* 父菜单选项(扁平化, 用于 select) */
const parentOptions = ref<Array<{ id: string; name: string; depth: number }>>([])

/* 类型选项(全量) */
const allTypeOptions = [
  { label: '目录', value: 1 },
  { label: '菜单', value: 2 },
  { label: '按钮', value: 3 },
]

/* 类型选项(动态): 根菜单只能选目录, 子菜单可选全部 */
const typeOptions = computed(() => {
  if (form.parentId === '0') {
    return allTypeOptions.filter((t) => t.value === 1)
  }
  return allTypeOptions
})

/* 图标选择器状态 */
const iconPopoverVisible = ref(false)
const iconSearch = ref('')
/* 过滤后的图标列表(按搜索词) */
const filteredIcons = computed(() => {
  const kw = iconSearch.value.trim().toLowerCase()
  if (!kw) return iconList
  return iconList.filter((it) => it.name.toLowerCase().includes(kw))
})

/* 当前选中图标的组件(用于预览) */
const currentIconComp = computed(() => {
  if (!form.icon) return null
  return iconMap[form.icon] || null
})

/* 选择图标 */
function pickIcon(name: string) {
  form.icon = name
  iconPopoverVisible.value = false
  iconSearch.value = ''
}

/* 清除图标 */
function clearIcon() {
  form.icon = ''
}

/* 父菜单变化时, 若为根菜单强制类型为目录 */
watch(
  () => form.parentId,
  (newId) => {
    if (newId === '0' && form.type !== 1) {
      form.type = 1
    }
  },
)

/* ===== 方法 ===== */

/* 加载菜单树 */
async function loadMenus() {
  loading.value = true
  try {
    tableData.value = await http.get<MenuRow[]>('/api/menu')
    buildParentOptions()
  } finally {
    loading.value = false
  }
}

/* 构建父菜单下拉选项(扁平化树, 目录才能作为父) */
function buildParentOptions() {
  const options: Array<{ id: string; name: string; depth: number }> = []
  function walk(nodes: MenuRow[], depth: number) {
    for (const n of nodes) {
      if (n.type !== 3) {
        // 按钮不能作为父
        options.push({ id: n.id, name: n.name, depth })
      }
      if (n.children && n.children.length > 0) {
        walk(n.children, depth + 1)
      }
    }
  }
  options.unshift({ id: '0', name: '根菜单', depth: 0 })
  walk(tableData.value, 0)
  parentOptions.value = options
}

/* 打开新增弹窗 */
function openCreate(parentId = '0') {
  dialogTitle.value = '新增菜单'
  // 根菜单只能创建目录
  const defaultType = parentId === '0' ? 1 : 2
  Object.assign(form, defaultForm(), { parentId, type: defaultType })
  dialogVisible.value = true
}

/* 打开编辑弹窗 */
function openEdit(row: MenuRow) {
  dialogTitle.value = '编辑菜单'
  Object.assign(form, defaultForm(), {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    type: row.type,
    path: row.path || '',
    component: row.component || '',
    icon: row.icon || '',
    permission: row.permission || '',
    sort: row.sort,
    visible: row.visible ? 1 : 0,
    status: row.status,
  })
  dialogVisible.value = true
}

/* 提交(新增/编辑) */
async function handleSubmit() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入菜单名称')
    return
  }
  if (form.type === 2 && !form.path.trim()) {
    ElMessage.warning('菜单类型必须填写路由路径')
    return
  }
  if (form.type === 3 && !form.permission.trim()) {
    ElMessage.warning('按钮类型必须填写权限标识')
    return
  }

  submitting.value = true
  try {
    const payload = { ...form }
    if (form.id) {
      await http.put(`/api/menu/${form.id}`, payload)
      ElMessage.success('菜单修改成功')
    } else {
      delete (payload as any).id
      await http.post('/api/menu', payload)
      ElMessage.success('菜单新增成功')
    }
    dialogVisible.value = false
    await loadMenus()
    // 刷新侧栏菜单缓存(不刷新页面, 体验更好)
    await menuStore.fetchCurrentUserMenus()
  } catch {
    // http 拦截器已弹错误提示
  } finally {
    submitting.value = false
  }
}

/* 删除 */
async function handleDelete(row: MenuRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除菜单「${row.name}」吗?${row.children?.length ? '其下所有子菜单将一并删除。' : ''}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await http.delete(`/api/menu/${row.id}`)
    ElMessage.success('菜单删除成功')
    await loadMenus()
    // 刷新侧栏菜单缓存
    await menuStore.fetchCurrentUserMenus()
  } catch (e: any) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      // http 拦截器已处理
    }
  }
}

onMounted(loadMenus)
</script>

<template>
  <div class="menu-page">
    <!-- 工具栏 -->
    <div class="menu-toolbar">
      <div class="menu-toolbar-left">
        <h2 class="menu-page-title">菜单管理</h2>
        <span class="menu-page-desc">维护系统菜单结构:新增、编辑、排序、启停用,支持多级菜单与按钮权限点。</span>
      </div>
      <div class="menu-toolbar-right">
        <el-button :icon="Refresh" @click="loadMenus">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate('0')">新增菜单</el-button>
      </div>
    </div>

    <!-- 树形表格 -->
    <el-table
      v-loading="loading"
      :data="tableData"
      row-key="id"
      border
      default-expand-all
      :tree-props="{ children: 'children' }"
      class="menu-table"
    >
      <el-table-column prop="name" label="菜单名称" min-width="180">
        <template #default="{ row }">
          <el-icon class="menu-name-icon">
            <component :is="row.icon ? iconMap[row.icon] : MenuIcon" />
          </el-icon>
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="type" label="类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag
            :type="row.type === 1 ? 'info' : row.type === 2 ? 'primary' : 'warning'"
            effect="plain"
            size="small"
          >
            {{ row.type === 1 ? '目录' : row.type === 2 ? '菜单' : '按钮' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="path" label="路由路径" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="menu-path">{{ row.path || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="icon" label="图标" width="80" align="center">
        <template #default="{ row }">
          <el-icon v-if="row.icon" :size="18" class="menu-icon-preview">
            <component :is="iconMap[row.icon]" />
          </el-icon>
          <span v-else class="menu-icon-empty">-</span>
        </template>
      </el-table-column>

      <el-table-column prop="permission" label="权限标识" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="menu-permission">{{ row.permission || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="70" align="center" />

      <el-table-column prop="visible" label="显示" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.visible ? 'success' : 'info'" effect="plain" size="small">
            {{ row.visible ? '显示' : '隐藏' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" effect="plain" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button text type="primary" size="small" :icon="Plus" @click="openCreate(row.id)">新增</el-button>
          <el-button text type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button text type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="92px" label-position="right" class="menu-form">
        <el-form-item label="父菜单">
          <el-select v-model="form.parentId" placeholder="选择父菜单" style="width: 100%">
            <el-option
              v-for="opt in parentOptions"
              :key="opt.id"
              :label="opt.depth === 0 ? opt.name : '├ ' + '—'.repeat(opt.depth - 1) + ' ' + opt.name"
              :value="opt.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio-button v-for="t in typeOptions" :key="t.value" :value="t.value">
              {{ t.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如:知识库管理" maxlength="64" show-word-limit />
        </el-form-item>

        <el-form-item v-if="form.type === 2" label="路由路径" required>
          <el-input v-model="form.path" placeholder="如:/admin/knowledge" maxlength="128" />
        </el-form-item>

        <el-form-item v-if="form.type === 2" label="组件路径">
          <el-input v-model="form.component" placeholder="如:admin/knowledge/index" maxlength="128" />
        </el-form-item>

        <el-form-item v-if="form.type !== 3" label="图标">
          <el-popover
            v-model:visible="iconPopoverVisible"
            placement="bottom-start"
            :width="360"
            trigger="click"
            :popper-class="'icon-picker-popover'"
          >
            <template #reference>
              <div class="icon-picker-trigger" @click="iconSearch = ''">
                <el-icon v-if="currentIconComp" class="icon-picker-preview">
                  <component :is="currentIconComp" />
                </el-icon>
                <span v-else class="icon-picker-placeholder">点击选择图标</span>
                <span v-if="form.icon" class="icon-picker-name">{{ form.icon }}</span>
                <el-button
                  v-if="form.icon"
                  link
                  size="small"
                  :icon="Close"
                  class="icon-picker-clear"
                  @click.stop="clearIcon"
                />
              </div>
            </template>

            <!-- 弹出层: 搜索 + 图标网格 -->
            <div class="icon-picker">
              <el-input
                v-model="iconSearch"
                placeholder="搜索图标名称(如: Setting, Menu)"
                size="small"
                clearable
                :prefix-icon="Search"
                class="icon-picker-search"
              />
              <div class="icon-picker-grid">
                <div
                  v-for="item in filteredIcons"
                  :key="item.name"
                  class="icon-picker-item"
                  :class="{ active: item.name === form.icon }"
                  :title="item.name"
                  @click="pickIcon(item.name)"
                >
                  <el-icon :size="18">
                    <component :is="item.component" />
                  </el-icon>
                </div>
                <el-empty
                  v-if="filteredIcons.length === 0"
                  description="无匹配图标"
                  :image-size="48"
                />
              </div>
            </div>
          </el-popover>
        </el-form-item>

        <el-form-item v-if="form.type === 3" label="权限标识" required>
          <el-input v-model="form.permission" placeholder="如:menu:list" maxlength="128" />
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" controls-position="right" />
        </el-form-item>

        <el-form-item label="是否显示">
          <el-switch v-model="form.visible" :active-value="1" :inactive-value="0" />
        </el-form-item>

        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.menu-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 工具栏 */
.menu-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.menu-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.menu-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.menu-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.menu-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 表格 */
.menu-table {
  border-radius: var(--radius);
  overflow: hidden;
}
.menu-name-icon {
  margin-right: 6px;
  color: var(--muted-foreground);
  vertical-align: -2px;
}
.menu-path,
.menu-permission {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}
.menu-icon-preview {
  color: var(--foreground);
  vertical-align: middle;
}
.menu-icon-empty {
  color: var(--muted-foreground);
}

/* 表单 */
.menu-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

/* 图标选择器触发器 */
.icon-picker-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 0.15s;
}
.icon-picker-trigger:hover {
  border-color: var(--accent);
}
.icon-picker-preview {
  color: var(--foreground);
}
.icon-picker-placeholder {
  color: var(--muted-foreground);
  font-size: 13px;
}
.icon-picker-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}
.icon-picker-clear {
  margin-left: auto;
}
</style>

<!-- 非 scoped: popover 内容 teleport 到 body, 需全局样式 -->
<style>
.icon-picker-popover.el-popover.el-popper {
  padding: 12px !important;
}
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.icon-picker-search {
  width: 100%;
}
.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}
.icon-picker-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  border-radius: calc(var(--radius) - 4px);
  cursor: pointer;
  color: var(--muted-foreground);
  transition: all 0.15s;
}
.icon-picker-item:hover {
  background: var(--muted);
  color: var(--foreground);
}
.icon-picker-item.active {
  background: var(--accent);
  color: var(--accent-foreground);
}
.icon-picker-item .el-icon {
  font-size: 18px;
}
</style>
