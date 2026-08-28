<script setup lang="ts">
/**
 * 管理后台主框架
 * 布局: 左侧 Sidebar(品牌 + 导航) + 右侧主内容区(Header + 子路由出口)
 * 子路由出口由 router-view 渲染, 各业务页面在 views/admin/{模块}/index.vue
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Collection, User, Avatar, Lock, Menu, Odometer,
  Sunny, Moon, SwitchButton,
} from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const { theme, toggle } = useTheme()
const auth = useAuthStore()

/* 当前激活的菜单 key(取路由 path 的最后一段) */
const activeMenu = computed(() => route.path)

/* 菜单点击: EP Menu 的 router 模式会自动跳转, 这里仅兜底 */
function onMenuSelect(index: string) {
  router.push(index)
}

/* 当前页面标题(用于 Header 显示) */
const pageTitleMap: Record<string, string> = {
  '/admin/dashboard': '主控台',
  '/admin/knowledge': '知识库管理',
  '/admin/user': '用户管理',
  '/admin/role': '角色管理',
  '/admin/permission': '角色权限',
  '/admin/menu': '菜单管理',
}
const pageTitle = computed(() => pageTitleMap[route.path] || '管理后台')

/* 头像首字母 */
const avatarText = computed(() => {
  const name = auth.user?.username || 'U'
  return name.slice(0, 2).toUpperCase()
})

/* 退出登录 */
function logout() {
  auth.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<template>
  <div class="admin-layout">
    <!-- ============ 侧栏 ============ -->
    <aside class="admin-sidebar">
      <div class="admin-brand">
        <span class="admin-brand-mark">E</span>
        <span class="admin-brand-text">Easy-Knowledge</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="admin-menu"
        :router="true"
        @select="onMenuSelect"
      >
        <el-menu-item-group title="概览">
          <el-menu-item index="/admin/dashboard">
            <el-icon><Odometer /></el-icon>
            <span>主控台</span>
          </el-menu-item>
        </el-menu-item-group>
        <el-menu-item-group title="知识库">
          <el-menu-item index="/admin/knowledge">
            <el-icon><Collection /></el-icon>
            <span>知识库管理</span>
          </el-menu-item>
        </el-menu-item-group>
        <el-menu-item-group title="系统">
          <el-menu-item index="/admin/user">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/role">
            <el-icon><Avatar /></el-icon>
            <span>角色管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/permission">
            <el-icon><Lock /></el-icon>
            <span>角色权限</span>
          </el-menu-item>
          <el-menu-item index="/admin/menu">
            <el-icon><Menu /></el-icon>
            <span>菜单管理</span>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>
    </aside>

    <!-- ============ 主内容 ============ -->
    <div class="admin-main">
      <!-- 顶部 Header -->
      <header class="admin-header">
        <div class="admin-header-title">
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="admin-header-actions">
          <el-button text @click="toggle">
            <el-icon class="admin-header-icon">
              <component :is="theme === 'dark' ? Sunny : Moon" />
            </el-icon>
            {{ theme === 'dark' ? '亮模式' : '暗模式' }}
          </el-button>
          <el-tag type="primary" effect="plain" size="small">v0.1.0</el-tag>
          <el-dropdown trigger="click" @command="(c: string) => c === 'logout' && logout()">
            <div class="admin-avatar-wrap">
              <div class="admin-avatar">{{ avatarText }}</div>
              <span class="admin-username">{{ auth.user?.username || '未登录' }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout" :icon="SwitchButton">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 子路由出口 -->
      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ===== 布局 ===== */
.admin-layout {
  display: grid;
  grid-template-columns: 236px 1fr;
  min-height: 100vh;
  background: var(--background);
}

/* Sidebar */
.admin-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid var(--border-100);
  background: var(--sidebar);
  padding: 16px 12px;
}
.admin-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-100);
}
.admin-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-sm);
  font: 600 13px var(--font-sans);
}
.admin-brand-text {
  font: 600 13px/1.2 var(--font-sans);
  letter-spacing: .02em;
  color: var(--sidebar-foreground);
}
.admin-menu {
  border-right: none;
  background: transparent;
}

/* Main */
.admin-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Header */
.admin-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 32px;
  background: color-mix(in srgb, var(--background) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-100);
}
.admin-header-title h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 20px;
  line-height: 1.2;
  color: var(--foreground);
}
.admin-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-header-icon {
  margin-right: 4px;
  vertical-align: -2px;
}
.admin-avatar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background .16s ease;
}
.admin-avatar-wrap:hover {
  background: var(--accent);
}
.admin-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 600 12px var(--font-sans);
}
.admin-username {
  font-size: 13px;
  color: var(--foreground);
}

/* Content */
.admin-content {
  flex: 1;
  padding: 32px;
  max-width: 1280px;
  width: 100%;
}

/* 响应式 */
@media (max-width: 900px) {
  .admin-layout { grid-template-columns: 1fr; }
  .admin-sidebar { display: none; }
  .admin-content { padding: 20px; }
  .admin-header { padding: 12px 20px; }
  .admin-header-title h1 { font-size: 18px; }
  .admin-username { display: none; }
}
</style>
