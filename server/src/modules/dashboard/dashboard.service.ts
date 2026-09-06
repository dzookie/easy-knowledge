import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { AuthenticatedUser } from '@/common/types';

/**
 * DashboardService — 主控台统计数据
 *
 * 数据来源:
 *  - 知识库/文档/切片/API Key: Prisma 聚合查询
 *  - 系统状态: Qdrant health + MySQL ping
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
  ) {}

  /**
   * 总览统计
   *
   * 管理员: 全局统计
   * 普通用户: 仅自己创建的资源
   */
  async getOverview(user: AuthenticatedUser) {
    const isAdmin = user.role === 'admin';

    const where = isAdmin ? {} : { createdBy: BigInt(user.id) };
    const kbWhere = isAdmin ? {} : { createdBy: BigInt(user.id) };

    // 普通用户先查自己的知识库 ID 列表, 用于过滤切片
    const userKbIds = isAdmin
      ? []
      : (
          await this.prisma.knowledgeBase.findMany({
            where: { createdBy: BigInt(user.id), deletedAt: null },
            select: { id: true },
          })
        ).map((k) => k.id);

    // 并行查询
    const [kbCount, docCount, chunkCount, apiKeyCount, totalCalls, totalTokens, userCount] =
      await Promise.all([
        this.prisma.knowledgeBase.count({ where: { ...kbWhere, deletedAt: null } }),
        this.prisma.document.count({
          where: {
            ...where,
            deletedAt: null,
          },
        }),
        // 切片总数: 管理员查全局, 普通用户按自己的 kbId 过滤
        isAdmin
          ? this.prisma.documentChunk.count({ where: { deletedAt: null } })
          : this.prisma.documentChunk.count({
              where: { kbId: { in: userKbIds }, deletedAt: null },
            }),
        // API Key 数 (仅管理员看全局, 普通用户看自己的)
        this.prisma.apiKey.count({ where: isAdmin ? {} : { userId: BigInt(user.id) } }),
        // API 调用总次数
        this.prisma.apiKey.aggregate({
          where: isAdmin ? {} : { userId: BigInt(user.id) },
          _sum: { callCount: true },
        }),
        // 累计 token 消耗
        this.prisma.apiKey.aggregate({
          where: isAdmin ? {} : { userId: BigInt(user.id) },
          _sum: { tokenCount: true },
        }),
        // 用户数 (仅管理员)
        isAdmin ? this.prisma.user.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      ]);

    return {
      knowledgeBaseCount: kbCount,
      documentCount: docCount,
      chunkCount,
      apiKeyCount,
      totalCalls: totalCalls._sum.callCount ?? 0,
      totalTokens: totalTokens._sum.tokenCount ?? 0,
      userCount: isAdmin ? userCount : 0,
      isAdmin,
    };
  }

  /**
   * 知识库文档分布 TOP N
   *
   * 返回每个知识库的文档数和切片数, 按文档数降序
   */
  async getKbDistribution(user: AuthenticatedUser, limit = 5) {
    const isAdmin = user.role === 'admin';
    const where = isAdmin ? { deletedAt: null } : { createdBy: BigInt(user.id), deletedAt: null };

    const kbs = await this.prisma.knowledgeBase.findMany({
      where,
      select: {
        id: true,
        name: true,
        documentCount: true,
        chunkCount: true,
      },
      orderBy: { documentCount: 'desc' },
      take: limit,
    });

    if (kbs.length === 0) return [];

    // 计算最大文档数, 用于百分比
    const maxDocs = Math.max(...kbs.map((k) => k.documentCount), 1);

    return kbs.map((k) => ({
      id: k.id.toString(),
      name: k.name,
      docs: k.documentCount,
      chunks: k.chunkCount,
      percent: Math.round((k.documentCount / maxDocs) * 100),
    }));
  }

  /**
   * 最近处理的文档 (替代"最近问答", 因为问答日志尚未持久化)
   *
   * 返回最近 N 个文档的处理状态
   */
  async getRecentDocuments(user: AuthenticatedUser, limit = 10) {
    const isAdmin = user.role === 'admin';
    const where = isAdmin
      ? { deletedAt: null }
      : { uploadedBy: BigInt(user.id), deletedAt: null };

    const docs = await this.prisma.document.findMany({
      where,
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        uploader: { select: { id: true, username: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return docs.map((d) => ({
      id: d.id.toString(),
      fileName: d.fileName,
      fileType: d.fileType,
      sizeBytes: d.sizeBytes.toString(),
      status: d.status,
      chunkCount: d.chunkCount,
      kbName: d.knowledgeBase?.name || '-',
      uploader: d.uploader?.nickname || d.uploader?.username || '未知',
      createdAt: d.createdAt,
      finishedAt: d.finishedAt,
      errorMsg: d.errorMsg,
    }));
  }

  /**
   * 系统健康状态
   *
   * 检测: MySQL / Qdrant
   * Embedding 服务暂不检测 (调用会消耗 token)
   */
  async getSystemStatus() {
    const results: { name: string; healthy: boolean; latency?: string; error?: string }[] = [];

    // 1. MySQL
    const mysqlStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      results.push({
        name: 'MySQL 数据库',
        healthy: true,
        latency: `${Date.now() - mysqlStart}ms`,
      });
    } catch (e) {
      results.push({
        name: 'MySQL 数据库',
        healthy: false,
        error: (e as Error).message,
      });
    }

    // 2. Qdrant
    const qdrantStart = Date.now();
    try {
      const h = await this.qdrant.health();
      results.push({
        name: 'Qdrant 向量库',
        healthy: h.ok,
        latency: h.ok ? `${Date.now() - qdrantStart}ms` : '失败',
        error: h.error,
      });
    } catch (e) {
      results.push({
        name: 'Qdrant 向量库',
        healthy: false,
        error: (e as Error).message,
      });
    }

    return results;
  }
}
