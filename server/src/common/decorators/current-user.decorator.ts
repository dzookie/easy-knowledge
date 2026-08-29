import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() — 从请求中取出当前登录用户
 *
 * 用法:
 *   async someMethod(@CurrentUser() user: AuthenticatedUser) { ... }
 *   async someMethod(@CurrentUser('id') userId: string) { ... }
 *
 * 前置条件: 接口必须经过 JwtAuthGuard 鉴权, 否则 req.user 为 undefined
 */
export interface AuthenticatedUser {
  id: string;            // 用户 ID(已字符串化的 BigInt)
  username: string;
  nickname: string | null;
  avatar: string | null;
  roleId: string;        // 角色 ID(已字符串化的 BigInt, 关联 role 表)
  role: string;          // role.code (如 'admin' / 'user')
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
