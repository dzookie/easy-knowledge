<script setup lang="ts">
/**
 * 登录页 — Claude Design System 风格
 * 布局: 左侧品牌展示区 + 右侧登录表单
 * 主题: 暖纸色背景 + 赤陶主色 + Newsreader 衬线大标题
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock, Collection, ChatDotRound, Tools } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { theme, toggle } = useTheme()

// 暴露给模板使用
const _msg = ElMessage
function hint(msg: string) {
  _msg.info(msg)
}

const formRef = ref<FormInstance>()
const loading = ref(false)
const remember = ref(true)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 32, message: '长度 3–32 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '长度 6–64 个字符', trigger: 'blur' },
  ],
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      await auth.login(form.username, form.password)
      ElMessage.success('登录成功,正在进入控制台...')
      const redirect = (route.query.redirect as string) || '/admin'
      router.push({ path: redirect })
    } catch (e) {
      ElMessage.error((e as Error).message || '登录失败,请重试')
    } finally {
      loading.value = false
    }
  })
}
</script>

<template>
  <div class="auth-layout">
    <!-- ============ 左侧品牌展示区 ============ -->
    <section class="auth-brand">
      <div class="auth-brand-inner">
        <div class="auth-logo">
          <span class="auth-logo-mark">E</span>
          <span class="auth-logo-text">Easy-Knowledge</span>
        </div>
        <h1 class="auth-hero-title">
          让知识<br /> searchable &amp; conversational
        </h1>
        <p class="auth-hero-desc">
          上传文档,自动切分、向量化,基于 RAG 进行可追溯的智能问答。
          温暖书卷气,克制赤陶色,为阅读与对话而生。
        </p>
        <ul class="auth-features">
          <li>
            <el-icon><Collection /></el-icon>
            <div>
              <strong>知识库管理</strong>
              <span>创建、上传、切片策略配置</span>
            </div>
          </li>
          <li>
            <el-icon><ChatDotRound /></el-icon>
            <div>
              <strong>RAG 问答</strong>
              <span>引用可追溯,流式渲染</span>
            </div>
          </li>
          <li>
            <el-icon><Tools /></el-icon>
            <div>
              <strong>多模型适配</strong>
              <span>bge-m3 / Doubao / Ollama 自由切换</span>
            </div>
          </li>
        </ul>
      </div>
      <!-- 装饰元素 -->
      <div class="auth-deco auth-deco-1" />
      <div class="auth-deco auth-deco-2" />
    </section>

    <!-- ============ 右侧登录表单 ============ -->
    <section class="auth-form-side">
      <div class="auth-form-toolbar">
        <el-button text size="small" @click="toggle">
          {{ theme === 'dark' ? '☀ 亮模式' : '☾ 暗模式' }}
        </el-button>
      </div>

      <div class="auth-form-wrap">
        <header class="auth-form-head">
          <h2>欢迎回来</h2>
          <p>登录以继续使用 Easy-Knowledge</p>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="auth-form"
          @submit.prevent="submit"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              :prefix-icon="User"
              placeholder="请输入用户名"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password
              @keyup.enter="submit"
            />
          </el-form-item>

          <div class="auth-form-options">
            <el-checkbox v-model="remember">记住我</el-checkbox>
            <el-button text type="primary" size="small" @click="hint('请联系管理员重置密码')">
              忘记密码?
            </el-button>
          </div>

          <el-button
            type="primary"
            size="large"
            class="auth-submit"
            :loading="loading"
            @click="submit"
          >
            {{ loading ? '登录中…' : '登 录' }}
          </el-button>
        </el-form>

        <footer class="auth-form-footer">
          <span>还没有账号?</span>
          <el-button text type="primary" size="small" @click="hint('注册功能暂未开放')">
            联系管理员开通
          </el-button>
        </footer>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ===== 布局 ===== */
.auth-layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  min-height: 100vh;
  background: var(--background);
}

/* ===== 左侧品牌区 ===== */
.auth-brand {
  position: relative;
  overflow: hidden;
  padding: 56px 64px;
  background:
    radial-gradient(ellipse at top left, color-mix(in srgb, var(--primary) 10%, transparent), transparent 60%),
    radial-gradient(ellipse at bottom right, color-mix(in srgb, var(--success-500, var(--success)) 8%, transparent), transparent 50%),
    var(--card);
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border-100);
}
.auth-brand-inner {
  position: relative;
  z-index: 1;
  max-width: 480px;
}
.auth-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 64px;
}
.auth-logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-sm);
  font: 600 18px var(--font-sans);
}
.auth-logo-text {
  font: 600 16px/1.2 var(--font-sans);
  letter-spacing: .02em;
  color: var(--foreground);
}
.auth-hero-title {
  margin: 0 0 20px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 48px;
  line-height: 1.15;
  color: var(--foreground);
  letter-spacing: -0.01em;
}
.auth-hero-desc {
  margin: 0 0 40px;
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted-foreground);
  max-width: 420px;
}
.auth-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 16px;
}
.auth-features li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.auth-features .el-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--popover);
  border: 1px solid var(--border-100);
  border-radius: var(--radius-sm);
  color: var(--primary);
  font-size: 18px;
}
.auth-features strong {
  display: block;
  font: 600 14px/1.3 var(--font-sans);
  color: var(--foreground);
  margin-bottom: 2px;
}
.auth-features span {
  font-size: 13px;
  color: var(--muted-foreground);
}

/* 装饰圆点 */
.auth-deco {
  position: absolute;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  filter: blur(2px);
  pointer-events: none;
}
.auth-deco-1 {
  width: 280px;
  height: 280px;
  top: -80px;
  right: -100px;
  opacity: .5;
}
.auth-deco-2 {
  width: 180px;
  height: 180px;
  bottom: -60px;
  left: 40%;
  background: color-mix(in srgb, var(--success-500, var(--success)) 16%, transparent);
  opacity: .35;
}

/* ===== 右侧表单区 ===== */
.auth-form-side {
  display: flex;
  flex-direction: column;
  background: var(--background);
}
.auth-form-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 16px 24px;
}
.auth-form-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 64px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}
.auth-form-head {
  margin-bottom: 32px;
}
.auth-form-head h2 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 32px;
  line-height: 1.2;
  color: var(--foreground);
}
.auth-form-head p {
  margin: 0;
  font-size: 14px;
  color: var(--muted-foreground);
}

/* 表单 */
.auth-form {
  width: 100%;
}
.auth-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: var(--text-700);
  padding-bottom: 6px;
}
.auth-form :deep(.el-input__wrapper) {
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.auth-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--ring) inset, var(--shadow-sm);
}
.auth-form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 24px;
}
.auth-submit {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .04em;
  border-radius: var(--radius);
}

/* Footer */
.auth-form-footer {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border-100);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  color: var(--muted-foreground);
}

/* ===== 响应式 ===== */
@media (max-width: 960px) {
  .auth-layout {
    grid-template-columns: 1fr;
  }
  .auth-brand {
    display: none;
  }
  .auth-form-wrap {
    padding: 24px;
  }
}
@media (max-width: 480px) {
  .auth-form-head h2 { font-size: 26px; }
  .auth-submit { height: 48px; font-size: 15px; }
  .auth-form-toolbar { padding: 12px 16px; }
}
</style>
