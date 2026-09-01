<script setup lang="ts">
/**
 * 角色管理 — 列表 + 新增/编辑/删除
 *
 * 功能:
 *  - 表格展示全部角色(含用户数、菜单数、状态)
 *  - 新增(编码/名称/描述/排序/状态)
 *  - 编辑
 *  - 删除(软删除, 内置角色 admin/user 不允许删除, 二次确认)
 *  - 跳转「角色权限」页分配菜单
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Lock, User } from '@element-plus/icons-vue'
import { roleApis } from '@/apis'

const router = useRouter()

/* ===== 类型 ===== */
interface RoleRow {
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

interface RoleForm {
  id?: string
  code: string
  name: string
  description: string
  sort: number
  status: number
}

/* ===== 状态 ===== */
const loading = ref(false)
const tableData = ref<RoleRow[]>([])

/* 弹窗 */
const dialogVisible = ref(false)
const dialogTitle = ref('新增角色')
const submitting = ref(false)

/* 表单默认值 */
const defaultForm = (): RoleForm => ({
  code: '',
  name: '',
  description: '',
  sort: 0,
  status: 1,
})

const form = reactive<RoleForm>(defaultForm())

/* ===== 方法 ===== */

/* 加载角色列表 */
async function loadRoles() {
  loading.value = true
  try {
    tableData.value = await roleApis.listRole()
  } finally {
    loading.value = false
  }
}

/* 打开新增弹窗 */
function openCreate() {
  dialogTitle.value = '新增角色'
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

/* 打开编辑弹窗 */
function openEdit(row: RoleRow) {
  dialogTitle.value = '编辑角色'
  Object.assign(form, defaultForm(), {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    sort: row.sort,
    status: row.status,
  })
  dialogVisible.value = true
}

/* 提交(新增/编辑) */
async function handleSubmit() {
  if (!form.code.trim()) {
    ElMessage.warning('请输入角色编码')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入角色名称')
    return
  }

  submitting.value = true
  try {
    if (form.id) {
      await roleApis.updateRole(form.id, form)
      ElMessage.success('角色修改成功')
    } else {
      await roleApis.createRole(form)
      ElMessage.success('角色新增成功')
    }
    dialogVisible.value = false
    await loadRoles()
  } catch {
    // 拦截器已处理
  } finally {
    submitting.value = false
  }
}

/* 删除 */
async function handleDelete(row: RoleRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除角色「${row.name}」吗?${row.userCount > 0 ? `该角色下仍有 ${row.userCount} 个用户,删除后这些用户将无法登录。` : ''}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await roleApis.deleteRole(row.id)
    ElMessage.success('角色删除成功')
    await loadRoles()
  } catch (e: any) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      // http 拦截器已处理
    }
  }
}

/* 跳转角色权限页 */
function goPermission(row: RoleRow) {
  router.push({
    path: '/admin/permission',
    query: { roleId: row.id },
  })
}

/* 是否内置角色(不允许删除) */
function isBuiltin(code: string): boolean {
  return ['admin', 'user'].includes(code)
}

/* 格式化日期 */
function formatDate(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19)
}

onMounted(loadRoles)
</script>

<template>
  <div class="role-page">
    <!-- 工具栏 -->
    <div class="role-toolbar">
      <div class="role-toolbar-left">
        <h2 class="role-page-title">角色管理</h2>
        <span class="role-page-desc">
          管理系统角色:新增、编辑、删除。菜单权限请前往「角色权限」页分配。
        </span>
      </div>
      <div class="role-toolbar-right">
        <el-button :icon="Refresh" @click="loadRoles">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增角色</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      class="role-table"
    >
      <el-table-column prop="name" label="角色名称" min-width="160">
        <template #default="{ row }">
          <div class="role-cell">
            <div class="role-icon">
              <el-icon><User /></el-icon>
            </div>
            <div class="role-info">
              <span class="role-name">
                {{ row.name }}
                <el-tag v-if="isBuiltin(row.code)" type="info" size="small" effect="plain">内置</el-tag>
              </span>
              <span class="role-code">{{ row.code }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="role-desc">{{ row.description || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="userCount" label="用户数" width="90" align="center">
        <template #default="{ row }">
          <el-tag type="primary" effect="plain" size="small">{{ row.userCount }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="menuCount" label="菜单数" width="90" align="center">
        <template #default="{ row }">
          <el-tag type="success" effect="plain" size="small">{{ row.menuCount }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="70" align="center" />

      <el-table-column prop="status" label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" effect="plain" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" label="创建时间" width="160" align="center">
        <template #default="{ row }">
          <span class="role-mono">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <el-button text type="primary" size="small" :icon="Lock" @click="goPermission(row)">权限</el-button>
          <el-button text type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button
            text
            type="danger"
            size="small"
            :icon="Delete"
            :disabled="isBuiltin(row.code)"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="80px" label-position="right" class="role-form">
        <el-form-item label="编码" required>
          <el-input
            v-model="form.code"
            placeholder="如: editor, viewer(小写字母)"
            maxlength="32"
            show-word-limit
            :disabled="!!form.id && isBuiltin(form.code)"
          />
        </el-form-item>

        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如: 编辑者" maxlength="64" show-word-limit />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="选填"
            maxlength="255"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" controls-position="right" />
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
.role-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 工具栏 */
.role-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.role-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.role-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.role-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.role-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 表格 */
.role-table {
  border-radius: var(--radius);
  overflow: hidden;
}
.role-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.role-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--muted);
  color: var(--muted-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.role-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.role-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.role-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}
.role-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.role-mono {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 表单 */
.role-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
</style>
