/**
 * useTheme — 暗模式切换 (通过给 <html> 加 .dark 类触发)
 * 配合 styles/theme.css 的 .dark 选择器
 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'ek-theme'
type Theme = 'light' | 'dark'

function readInitial(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  // 首次访问跟随系统
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<Theme>(readInitial())

function apply(t: Theme) {
  const root = document.documentElement
  if (t === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

// 启动时立即同步一次
apply(theme.value)

watch(theme, (t) => {
  apply(t)
  localStorage.setItem(STORAGE_KEY, t)
})

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, toggle }
}
