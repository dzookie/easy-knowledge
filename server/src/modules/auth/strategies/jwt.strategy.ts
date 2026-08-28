import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * JwtPayload — JWT token 中携带的信息
 */
export interface JwtPayload {
  sub: string; // 用户 ID(字符串化的 BigInt)
  username: string;
  role: string;
}

/**
 * JwtStrategy — JWT 鉴权策略
 * 从 Authorization Bearer token 中解析用户身份
 * 验证通过后将 user 挂载到 req.user
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport 验证回调: token 解码后自动调用
   * 返回值会挂到 req.user 上
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: BigInt(payload.sub),
        deletedAt: null,
        status: 1,
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('token 已失效,请重新登录');
    }

    // BigInt 不能直接序列化为 JSON, 转为字符串
    return {
      ...user,
      id: user.id.toString(),
    };
  }
}
