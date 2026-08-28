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

/**
 * AuthService — 认证业务逻辑
 * - 登录校验(用户名 + 密码)
 * - 生成 JWT
 * - 更新登录信息
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
   * 登录
   * @param dto 登录凭证
   * @param ip 登录 IP(从请求中提取)
   */
  async login(dto: LoginDto, ip?: string) {
    // 1. 查询用户(排除软删除)
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        deletedAt: null,
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

    // 5. 生成 JWT
    const payload = {
      sub: user.id.toString(),
      username: user.username,
      role: user.role,
    };
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    const token = await this.jwtService.signAsync(payload, { expiresIn });

    this.logger.log(`用户登录成功: ${user.username} (id=${user.id})`);

    return {
      token,
      user: {
        id: user.id.toString(),
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    };
  }

  /**
   * 验证 JWT(供 JwtStrategy 调用)
   */
  async validateUser(payload: {
    sub: string;
    username: string;
    role: string;
  }) {
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
    return user;
  }
}
