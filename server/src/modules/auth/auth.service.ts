import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '@/common/types';

/**
 * AuthService — 认证业务逻辑
 *
 * 职责:
 *  - login(): 校验账号密码, 签发 JWT, 仅返回 token
 *  - getCurrentUserDetail(): 根据 JWT payload 查询当前登录用户详情(含角色信息)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 登录校验
   * @param dto 登录凭证
   * @param ip 登录 IP(从请求中提取)
   * @returns 只返回 token, 用户信息走 /auth/current-user-detail
   */
  async login(dto: LoginDto, ip?: string): Promise<{ token: string }> {
    // 1. 查询用户(排除软删除), include role 拿 role.code
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        deletedAt: null,
      },
      include: {
        role: {
          select: { code: true, name: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 2. 校验密码
    const passwordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 3. 校验账号状态
    if (user.status !== 1) {
      throw new UnauthorizedException('账号已被禁用,请联系管理员');
    }

    // 4. 更新登录信息
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip || null,
      },
    });

    // 5. 签发 JWT
    // payload.role 存 role.code (如 'admin' / 'user'), 前端用它判断权限
    const payload: JwtPayload = {
      sub: user.id.toString(),
      username: user.username,
      role: user.role.code,
    };
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    const token = await this.jwtService.signAsync(payload, { expiresIn });

    this.logger.log(`用户登录成功: ${user.username} (id=${user.id}, role=${user.role.code})`);

    return { token };
  }

  /**
   * 查询当前登录用户详情
   * @param payload JWT 解码后的 payload(sub 为用户 ID)
   * @returns 用户信息(含角色, 用于前端 Header 渲染 + 权限判断)
   */
  async getCurrentUserDetail(payload: JwtPayload) {
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
        email: true,
        phone: true,
        lastLoginAt: true,
        lastLoginIp: true,
        roleId: true,
        role: {
          select: { code: true, name: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    // BigInt / DateTime 不能直接 JSON 序列化, 转为字符串
    return {
      id: user.id.toString(),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      lastLoginIp: user.lastLoginIp,
      roleId: user.roleId.toString(),
      role: user.role.code,
      roleName: user.role.name,
    };
  }
}
