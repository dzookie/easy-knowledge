<script setup lang="ts">
/**
 * 管理后台主框架
 * 布局: 左侧 Sidebar(品牌 + 导航) + 右侧主内容区(Header + 子路由出口)
 *
 * 菜单从后端动态获取(根据当前登录用户角色), 不再前端写死
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { Sunny, Moon, SwitchButton } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore, type MenuItem } from '@/stores/menu'

const route = useRoute()
const router = useRouter()
const { theme, toggle } = useTheme()
const auth = useAuthStore()
const menuStore = useMenuStore()

// Element Plus 图标全集(用于动态渲染 <component :is="iconMap[name]" />)
const iconMap = ElementPlusIconsVue as unknown as Record<string, any>

/* 菜单加载状态 */
const menuLoading = ref(false)

/* 拉取菜单 */
async function loadMenus() {
  if (menuStore.loaded) return
  menuLoading.value = true
  try {
    await menuStore.fetchCurrentUserMenus()
  } catch {
    // 401 由 http 拦截器处理, 这里兜底
  } finally {
    menuLoading.value = false
  }
}

onMounted(loadMenus)

/* 当前激活的菜单 key(取路由 path) */
const activeMenu = computed(() => route.path)

/* 菜单点击: EP Menu 的 router 模式会自动跳转, 这里仅兜底 */
function onMenuSelect(index: string) {
  router.push(index)
}

/* 当前页面标题(从菜单数据查, 查不到用默认) */
const pageTitle = computed(() => menuStore.getMenuName(route.path))

/* 头像首字母 */
const avatarText = computed(() => {
  const name = auth.user?.username || 'U'
  return name.slice(0, 2).toUpperCase()
})

/* 退出登录 */
function logout() {
  auth.logout()          // store 内部统一弹提示
  menuStore.reset()
  router.push('/login')
}

/* 递归渲染菜单项 */
function renderIcon(iconName: string | null) {
  if (!iconName) return null
  const IconComp = iconMap[iconName]
  return IconComp || null
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
        <template v-if="menuLoading">
          <div class="admin-menu-loading">加载菜单中...</div>
        </template>
        <template v-else>
          <template v-for="node in menuStore.menus" :key="node.id">
            <!-- 目录: 渲染为 group 分组标题 + 子菜单 -->
            <el-menu-item-group v-if="node.type === 1" :title="node.name">
              <el-menu-item
                v-for="child in node.children"
                :key="child.id"
                :index="child.path || ''"
              >
                <el-icon v-if="renderIcon(child.icon)">
                  <component :is="renderIcon(child.icon)" />
                </el-icon>
                <span>{{ child.name }}</span>
              </el-menu-item>
            </el-menu-item-group>

            <!-- 菜单(无子项): 直接渲染 -->
            <el-menu-item v-else-if="node.type === 2" :index="node.path || ''">
              <el-icon v-if="renderIcon(node.icon)">
                <component :is="renderIcon(node.icon)" />
              </el-icon>
              <span>{{ node.name }}</span>
            </el-menu-item>
          </template>
        </template>
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
.admin-menu-loading {
  padding: 16px 12px;
  color: var(--muted-foreground);
  font-size: 13px;
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
