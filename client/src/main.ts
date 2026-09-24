/**
 * main.ts — Vue3 + Pinia + Router + Element Plus
 * 主题色已由 styles/index.css 统一导入
 * 组件全部使用 Element Plus, 不再自建 UI 组件库
 */
import './styles/index.css'

/* Vue Flow 样式 (工作流编辑器依赖) */
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
  size: 'default',
})

app.mount('#app')
