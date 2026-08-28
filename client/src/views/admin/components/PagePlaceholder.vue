<script setup lang="ts">
/**
 * PagePlaceholder — 业务页面占位组件
 * 子页面开发前统一展示「功能开发中」状态
 * 后续各子页面就绪后,此组件可保留用于其他未开发页面的占位
 */
import type { Component } from 'vue'

defineProps<{
  title: string
  description?: string
  icon?: Component
}>()
</script>

<template>
  <div class="placeholder">
    <div class="placeholder-icon" v-if="icon">
      <el-icon :size="32"><component :is="icon" /></el-icon>
    </div>
    <h2 class="placeholder-title">{{ title }}</h2>
    <p class="placeholder-desc">
      {{ description || '该模块功能开发中,敬请期待。' }}
    </p>
    <el-tag type="info" effect="plain" size="small">PLACEHOLDER</el-tag>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 80px 24px;
  min-height: 60vh;
}
.placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  margin-bottom: 24px;
}
.placeholder-title {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 24px;
  line-height: 1.3;
  color: var(--foreground);
}
.placeholder-desc {
  margin: 0 0 20px;
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted-foreground);
  max-width: 420px;
}
</style>
