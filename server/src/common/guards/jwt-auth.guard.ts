import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

/**
 * JwtAuthGuard — JWT 鉴权守卫
 *
 * 行为:
 *   - 标记了 @Public() 的接口 → 跳过鉴权, 直接放行
 *   - 其他接口 → 必须带有效 Bearer token
 *
 * 用法:
 *   1. 全局注册(main.ts): app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)))
 *   2. 局部使用: @UseGuards(JwtAuthGuard)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
