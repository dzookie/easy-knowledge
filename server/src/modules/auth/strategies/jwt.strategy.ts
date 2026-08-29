import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * JwtPayload — JWT token 中携带的信息
 * role 存的是 role.code (如 'admin' / 'user'), 不是 role.id
 * 这样前端权限判断不用每次查库, 但改角色后需重新登录生效
 */
export interface JwtPayload {
  sub: string;       // 用户 ID(字符串化的 BigInt)
  username: string;
  role: string;      // role.code (如 'admin' / 'user')
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
   *
   * 每次 JWT 鉴权都会查一次库, 确保用户仍然存在且未被禁用
   * include role 表拿 role.code, 挂到 req.user.role
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
        roleId: true,
        role: {
          select: { code: true, name: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('token 已失效,请重新登录');
    }

    // BigInt 不能直接序列化为 JSON, 转为字符串
    // role 返回的是 role.code (如 'admin'), 前端用它判断权限
    return {
      id: user.id.toString(),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      roleId: user.roleId.toString(),
      role: user.role.code,
    };
  }
}
