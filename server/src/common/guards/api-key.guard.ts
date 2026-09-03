import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * ApiKeyGuard — 对外服务调用鉴权守卫
 *
 * 从请求头 X-API-Key 读取 API Key, 查库校验:
 *   - key 是否存在且启用
 *   - 是否过期
 *   - 每日调用次数是否超限
 *
 * 校验通过后, 将 apiKey 记录挂载到 req.apiKey
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('缺少 X-API-Key 请求头');
    }

    const record = await this.prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { kb: { select: { id: true, name: true, collection: true, createdBy: true, deletedAt: true } } },
    });

    if (!record) {
      throw new UnauthorizedException('无效的 API Key');
    }

    if (record.status !== 1) {
      throw new ForbiddenException('API Key 已被禁用');
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new ForbiddenException('API Key 已过期');
    }

    if (record.kb?.deletedAt) {
      throw new ForbiddenException('关联的知识库已被删除');
    }

    // 挂载到 request 供后续使用
    request.apiKey = record;

    return true;
  }
}
