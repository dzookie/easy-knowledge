<script setup lang="ts">
/**
 * Tab4: 知识问答 — 占位
 */
import { Warning } from '@element-plus/icons-vue'
</script>

<template>
  <div class="kb-placeholder">
    <el-icon class="kb-placeholder-icon"><Warning /></el-icon>
    <h3 class="kb-placeholder-title">知识问答</h3>
    <p class="kb-placeholder-desc">
      基于该知识库的完整 RAG 对话: 引用来源、流式输出、
      可切换大模型、可调整 topK / 相似度阈值 / 重排器开关。后续开发。
    </p>
  </div>
</template>

<style scoped>
.kb-placeholder { padding: 70px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.kb-placeholder-icon { font-size: 56px; color: var(--muted-foreground); opacity: .55; }
.kb-placeholder-title { margin: 6px 0 0; font-size: 18px; font-weight: 600; color: var(--foreground); font-family: var(--font-serif); }
.kb-placeholder-desc { margin: 0; font-size: 13px; color: var(--muted-foreground); line-height: 1.6; max-width: 480px; }
</style>
