<script setup lang="ts">
/**
 * 用户管理 — 列表 + 新增/编辑/删除/重置密码
 *
 * 功能:
 *  - 表格展示全部用户(含角色、状态、最后登录)
 *  - 新增(用户名/密码/昵称/邮箱/手机/角色/状态)
 *  - 编辑(不含密码)
 *  - 删除(软删除, 不可删除自己, 二次确认)
 *  - 重置密码
 *  - 保存成功/失败提示(符合用户偏好)
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Key } from '@element-plus/icons-vue'
import { userApis } from '@/apis'
import { useAuthStore } from '@/stores/auth'
import type { UserRow, RoleOption, UserForm } from '@/types'

const auth = useAuthStore()

/* ===== 状态 ===== */
const loading = ref(false)
const tableData = ref<UserRow[]>([])
const roleOptions = ref<RoleOption[]>([])

/* 新增/编辑弹窗 */
const dialogVisible = ref(false)
const dialogTitle = ref('新增用户')
const submitting = ref(false)

/* 重置密码弹窗 */
const pwdDialogVisible = ref(false)
const pwdSubmitting = ref(false)
const pwdForm = reactive({ id: '', username: '', newPassword: '' })

/* 表单默认值 */
const defaultForm = (): UserForm => ({
  username: '',
  password: '',
  nickname: '',
  email: '',
  phone: '',
  roleId: '',
  status: 1,
})

const form = reactive<UserForm>(defaultForm())

/* ===== 方法 ===== */

/* 加载用户列表 */
async function loadUsers() {
  loading.value = true
  try {
    tableData.value = await userApis.listUser()
  } finally {
    loading.value = false
  }
}

/* 加载角色列表(下拉选项) */
async function loadRoles() {
  roleOptions.value = await userApis.listRoleOptions()
  // 新增时默认选第一个角色
  if (roleOptions.value.length > 0) {
    form.roleId = roleOptions.value[0]!.id
  }
}

/* 打开新增弹窗 */
function openCreate() {
  dialogTitle.value = '新增用户'
  Object.assign(form, defaultForm())
  if (roleOptions.value.length > 0) {
    form.roleId = roleOptions.value[0]!.id
  }
  dialogVisible.value = true
}

/* 打开编辑弹窗 */
function openEdit(row: UserRow) {
  dialogTitle.value = '编辑用户'
  Object.assign(form, defaultForm(), {
    id: row.id,
    username: row.username,
    password: '',
    nickname: row.nickname || '',
    email: row.email || '',
    phone: row.phone || '',
    roleId: row.roleId,
    status: row.status,
  })
  dialogVisible.value = true
}

/* 提交(新增/编辑) */
async function handleSubmit() {
  if (!form.username.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }
  if (!form.id && !form.password) {
    ElMessage.warning('请输入密码')
    return
  }
  if (!form.roleId) {
    ElMessage.warning('请选择角色')
    return
  }

  submitting.value = true
  try {
    if (form.id) {
      // 编辑(不含 password)
      const { password, ...payload } = form
      await userApis.updateUser(form.id, payload)
      ElMessage.success('用户修改成功')
    } else {
      await userApis.createUser(form)
      ElMessage.success('用户新增成功')
    }
    dialogVisible.value = false
    await loadUsers()
  } catch {
    // 拦截器已处理
  } finally {
    submitting.value = false
  }
}

/* 删除 */
async function handleDelete(row: UserRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除用户「${row.username}」吗?该操作为软删除,可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await userApis.deleteUser(row.id)
    ElMessage.success('用户删除成功')
    await loadUsers()
  } catch (e: any) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      // http 拦截器已处理
    }
  }
}

/* 打开重置密码弹窗 */
function openResetPwd(row: UserRow) {
  pwdForm.id = row.id
  pwdForm.username = row.username
  pwdForm.newPassword = ''
  pwdDialogVisible.value = true
}

/* 提交重置密码 */
async function handleResetPwd() {
  if (!pwdForm.newPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  pwdSubmitting.value = true
  try {
    await userApis.resetPassword(pwdForm.id, {
      password: pwdForm.newPassword,
    })
    ElMessage.success('密码重置成功')
    pwdDialogVisible.value = false
  } catch {
    // 拦截器已处理
  } finally {
    pwdSubmitting.value = false
  }
}

/* 是否当前登录用户(禁止删除自己) */
function isCurrentUser(id: string): boolean {
  return auth.user?.id === id
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadRoles()])
})
</script>

<template>
  <div class="user-page">
    <!-- 工具栏 -->
    <div class="user-toolbar">
      <div class="user-toolbar-left">
        <h2 class="user-page-title">用户管理</h2>
        <span class="user-page-desc">管理系统用户账号:新增、编辑、启停用、重置密码、分配角色。</span>
      </div>
      <div class="user-toolbar-right">
        <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      class="user-table"
    >
      <el-table-column prop="username" label="用户名" min-width="120">
        <template #default="{ row }">
          <div class="user-cell">
            <div class="user-avatar">{{ (row.nickname || row.username).slice(0, 2).toUpperCase() }}</div>
            <div class="user-info">
              <span class="user-username">{{ row.username }}</span>
              <span v-if="row.nickname" class="user-nickname">{{ row.nickname }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="角色" width="120" align="center">
        <template #default="{ row }">
          <el-tag
            :type="row.roleCode === 'admin' ? 'danger' : 'primary'"
            effect="plain"
            size="small"
          >
            {{ row.roleName }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="user-mono">{{ row.email || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="phone" label="手机" width="130" align="center">
        <template #default="{ row }">
          <span class="user-mono">{{ row.phone || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" effect="plain" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="lastLoginAt" label="最后登录" min-width="160">
        <template #default="{ row }">
          <div v-if="row.lastLoginAt" class="user-login">
            <span class="user-mono">{{ row.lastLoginIp || '-' }}</span>
            <span class="user-login-time">{{ row.lastLoginAt?.replace('T', ' ').slice(0, 19) }}</span>
          </div>
          <span v-else class="user-mono">从未登录</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="240" fixed="right" align="center">
        <template #default="{ row }">
          <el-button text type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button text type="warning" size="small" :icon="Key" @click="openResetPwd(row)">重置密码</el-button>
          <el-button
            text
            type="danger"
            size="small"
            :icon="Delete"
            :disabled="isCurrentUser(row.id)"
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
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="80px" label-position="right" class="user-form">
        <el-form-item label="用户名" required>
          <el-input
            v-model="form.username"
            placeholder="3-32 位字符"
            maxlength="32"
            show-word-limit
            :disabled="!!form.id"
          />
        </el-form-item>

        <el-form-item v-if="!form.id" label="密码" required>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="至少 6 位"
            show-password
            maxlength="64"
          />
        </el-form-item>

        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="选填" maxlength="32" />
        </el-form-item>

        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="选填" maxlength="128" />
        </el-form-item>

        <el-form-item label="手机">
          <el-input v-model="form.phone" placeholder="选填" maxlength="20" />
        </el-form-item>

        <el-form-item label="角色" required>
          <el-select v-model="form.roleId" placeholder="选择角色" style="width: 100%">
            <el-option
              v-for="r in roleOptions"
              :key="r.id"
              :label="r.name"
              :value="r.id"
            />
          </el-select>
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

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="pwdDialogVisible"
      title="重置密码"
      width="440px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="80px" class="user-form">
        <el-form-item label="用户">
          <span class="pwd-username">{{ pwdForm.username }}</span>
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="pwdForm.newPassword"
            type="password"
            placeholder="至少 6 位"
            show-password
            maxlength="64"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="handleResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 工具栏 */
.user-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.user-toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
}
.user-page-desc {
  font-size: 13px;
  color: var(--muted-foreground);
}
.user-toolbar-right {
  display: flex;
  gap: 8px;
}

/* 表格 */
.user-table {
  border-radius: var(--radius);
  overflow: hidden;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 600 12px var(--font-sans);
  flex-shrink: 0;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.user-username {
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
}
.user-nickname {
  font-size: 12px;
  color: var(--muted-foreground);
}
.user-mono {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}
.user-login {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.user-login-time {
  font-size: 11px;
  color: var(--muted-foreground);
}

/* 表单 */
.user-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.pwd-username {
  font-weight: 600;
  color: var(--foreground);
}
</style>
