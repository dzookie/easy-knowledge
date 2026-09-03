/**
 * APIs 统一出口
 *
 * 用法: import { authApis, userApis, ... } from '@/apis'
 * 所有接口路径集中在 apis/ 各模块文件里管理, 业务组件不直接写 URL
 */
export { authApis } from './auth'
export { menuApis } from './menu'
export { userApis } from './user'
export { roleApis } from './role'
export { knowledgeApis } from './knowledge'
export { documentApis } from './document'
export { retrievalApis } from './retrieval'
export { chatApis } from './chat'
export { serviceApis } from './service'