import { SetMetadata } from '@nestjs/common';

/**
 * @Public() — 标记接口为公开访问,跳过 JWT 鉴权
 *
 * 用法:
 *   @Public()
 *   @Post('login')
 *   async login(...) { ... }
 *
 * 需配合全局 JwtAuthGuard + PublicOrAuthGuard 使用
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
