/**
 * 认证相关共享类型
 *
 * AuthenticatedUser — JWT 鉴权通过后挂载到 req.user 的用户信息
 * JwtPayload       — JWT token 中携带的信息
 *
 * 这两个类型原来散在 current-user.decorator.ts 和 jwt.strategy.ts 里,
 * 提取到此处统一管理, 避免循环依赖和跨模块导入混乱.
 */

/**
 * 当前登录用户 (JWT 鉴权通过后, JwtStrategy.validate 返回的对象)
 *
 * 用法:
 *   async someMethod(@CurrentUser() user: AuthenticatedUser) { ... }
 *   async someMethod(@CurrentUser('id') userId: string) { ... }
 */
export interface AuthenticatedUser {
  id: string;            // 用户 ID (已字符串化的 BigInt)
  username: string;
  nickname: string | null;
  avatar: string | null;
  roleId: string;        // 角色 ID (已字符串化的 BigInt, 关联 role 表)
  role: string;          // role.code (如 'admin' / 'user')
}

/**
 * JWT token 中携带的信息
 *
 * role 存的是 role.code (如 'admin' / 'user'), 不是 role.id
 * 这样前端权限判断不用每次查库, 但改角色后需重新登录生效
 */
export interface JwtPayload {
  sub: string;       // 用户 ID (字符串化的 BigInt)
  username: string;
  role: string;      // role.code (如 'admin' / 'user')
}
