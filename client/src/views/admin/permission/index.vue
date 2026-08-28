<script setup lang="ts">
/** 角色权限 — 占位 */
import { Lock } from '@element-plus/icons-vue'
import PagePlaceholder from '@/views/admin/components/PagePlaceholder.vue'
</script>

<template>
  <PagePlaceholder
    :icon="Lock"
    title="角色权限"
    description="为角色分配菜单权限与数据权限,支持按模块勾选、批量授权。"
  />
</template>
