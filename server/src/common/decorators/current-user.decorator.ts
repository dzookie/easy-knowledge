import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '@/common/types';

/**
 * @CurrentUser() — 从请求中取出当前登录用户
 *
 * 用法:
 *   async someMethod(@CurrentUser() user: AuthenticatedUser) { ... }
 *   async someMethod(@CurrentUser('id') userId: string) { ... }
 *
 * 前置条件: 接口必须经过 JwtAuthGuard 鉴权, 否则 req.user 为 undefined
 *
 * 注意: AuthenticatedUser 类型定义已移至 @/common/types/auth.types.ts
 */
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
