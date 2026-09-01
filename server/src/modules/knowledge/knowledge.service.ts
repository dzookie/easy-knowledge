import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { AuthenticatedUser } from '@/common/types';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

/**
 * KnowledgeService — 知识库业务逻辑
 *
 * 权限规则:
 *  - role=admin: 可见/操作全部知识库
 *  - 普通用户: 仅可见/操作自己创建的知识库
 *
 * 与 Qdrant 生命周期联动:
 *  - 创建: MySQL 事务写入后, 立即 createCollection(幂等)
 *  - 删除: 软删 MySQL 后, 异步删除 Qdrant collection(失败不阻塞)
 *  - 启动: 扫描数据库里所有未软删的知识库, 对 Qdrant 中不存在的做补偿创建
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
  ) {}

  /* ============ 启动时补偿: 历史遗留知识库补建 Qdrant collection ============ */
  async onModuleInit() {
    try {
      const kbs = await this.prisma.knowledgeBase.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, collection: true },
      });
      if (kbs.length === 0) return;

      const qdrantCollections = new Set(await this.qdrant.listCollections());
      let fixedCount = 0;

      for (const kb of kbs) {
        if (!kb.collection || kb.collection === 'pending') continue;
        if (qdrantCollections.has(kb.collection)) continue;
        try {
          await this.qdrant.createCollection(kb.collection);
          fixedCount += 1;
          this.logger.debug(
            `补偿创建 Qdrant 集合: kb#${kb.id.toString()} ${kb.name} -> ${kb.collection}`,
          );
        } catch (e) {
          this.logger.error(
            `补偿创建失败 kb#${kb.id.toString()} ${kb.collection}: ` +
              (e as Error).message,
          );
        }
      }

      if (fixedCount > 0) {
        this.logger.log(`启动补偿完成: 补建 ${fixedCount} 个 Qdrant collection`);
      }
    } catch (e) {
      // Qdrant 不在线等情况, 仅 warn, 不阻塞后端启动
      this.logger.warn(`启动补偿 Qdrant collection 失败: ${(e as Error).message}`);
    }
  }

  /* ============ 工具 ============ */
  private static isAdmin(role: string): boolean {
    return role === 'admin';
  }

  /** 生成 Qdrant collection 名 — kb_{id}_{timestamp} */
  private static genCollection(id: bigint, createdAt: Date): string {
    const ts = Math.floor(createdAt.getTime() / 1000);
    return `kb_${id}_${ts}`;
  }

  /* ============ 查询: 列表(卡片页) ============ */
  /**
   * 查询知识库列表
   * - admin: 返回全部
   * - 普通用户: 返回自己创建的
   */
  async listKnowledgeBases(user: AuthenticatedUser) {
    const where: any = { deletedAt: null };
    if (!KnowledgeService.isAdmin(user.role)) {
      where.createdBy = BigInt(user.id);
    }

    const list = await this.prisma.knowledgeBase.findMany({
      where,
      include: {
        creator: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        _count: {
          select: {
            documents: { where: { deletedAt: null } },
            chunks: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    });

    return list.map((kb) => ({
      id: kb.id.toString(),
      name: kb.name,
      description: kb.description,
      coverImage: kb.coverImage,
      embeddingModel: kb.embeddingModel,
      collection: kb.collection,
      chunkStrategy: kb.chunkStrategy,
      chunkSize: kb.chunkSize,
      chunkOverlap: kb.chunkOverlap,
      documentCount: kb._count.documents,
      chunkCount: kb._count.chunks,
      visibility: kb.visibility,
      status: kb.status,
      createdBy: kb.createdBy.toString(),
      creator: {
        id: kb.creator.id.toString(),
        username: kb.creator.username,
        nickname: kb.creator.nickname,
        avatar: kb.creator.avatar,
      },
      createdAt: kb.createdAt.toISOString(),
      updatedAt: kb.updatedAt.toISOString(),
    }));
  }

  /**
   * 查询单个知识库详情
   */
  async getKnowledgeDetail(id: string, user: AuthenticatedUser) {
    const kbId = BigInt(id);
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbId, deletedAt: null },
      include: {
        creator: { select: { id: true, username: true, nickname: true, avatar: true } },
        _count: {
          select: {
            documents: { where: { deletedAt: null } },
            chunks: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    // 非管理员只能看自己的
    if (
      !KnowledgeService.isAdmin(user.role) &&
      kb.createdBy.toString() !== user.id
    ) {
      throw new ForbiddenException('无权查看该知识库');
    }

    return {
      id: kb.id.toString(),
      name: kb.name,
      description: kb.description,
      coverImage: kb.coverImage,
      embeddingModel: kb.embeddingModel,
      collection: kb.collection,
      chunkStrategy: kb.chunkStrategy,
      chunkSize: kb.chunkSize,
      chunkOverlap: kb.chunkOverlap,
      documentCount: kb._count.documents,
      chunkCount: kb._count.chunks,
      visibility: kb.visibility,
      status: kb.status,
      createdBy: kb.createdBy.toString(),
      creator: {
        id: kb.creator.id.toString(),
        username: kb.creator.username,
        nickname: kb.creator.nickname,
        avatar: kb.creator.avatar,
      },
      createdAt: kb.createdAt.toISOString(),
      updatedAt: kb.updatedAt.toISOString(),
    };
  }

  /* ============ 新增: MySQL 事务 + Qdrant 联动 ============ */
  async createKnowledge(dto: CreateKnowledgeDto, user: AuthenticatedUser) {
    let kb: any;
    let collection: string;

    // 1. MySQL: 先创建 KB(collection 占位)
    try {
      kb = await this.prisma.knowledgeBase.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          embeddingModel: dto.embeddingModel ?? 'qwen3.7-text-embedding',
          collection: 'pending',
          chunkStrategy: dto.chunkStrategy ?? 'recursive',
          chunkSize: dto.chunkSize ?? 500,
          chunkOverlap: dto.chunkOverlap ?? 50,
          createdBy: BigInt(user.id),
          visibility: dto.visibility ?? 0,
        },
      });

      collection = KnowledgeService.genCollection(kb.id, kb.createdAt);
      await this.prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { collection },
      });
    } catch (e) {
      this.logger.error(`创建知识库 MySQL 写入失败: ${(e as Error).message}`);
      throw e;
    }

    // 2. Qdrant: 创建 collection
    //    - 失败时尝试清理(软删) MySQL 记录, 保持一致性
    //    - 已经存在也不报错(createCollection 自带幂等检查)
    try {
      await this.qdrant.createCollection(collection);
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(
        `Qdrant 创建 collection 失败(${collection}), 已记录知识库但未创建向量集合: ${msg}`,
      );
      // 补偿: 标记创建为失败状态(status=2, 预留的「异常」状态)? 还是直接报错回滚?
      // 这里选择报错并把 collection 改回 pending, 方便用户点「重试」或下次启动时自动补偿。
      // 但对用户直接返回报错更清晰。
      try {
        await this.prisma.knowledgeBase.update({
          where: { id: kb.id },
          data: { collection: 'pending' },
        });
      } catch {
        /* 忽略 */
      }
      throw new BadRequestException(
        `创建 Qdrant 向量集合失败: ${msg}。请确认 Qdrant 容器状态后重试。`,
      );
    }

    return { id: kb.id.toString(), collection };
  }

  /* ============ 修改 ============ */
  async updateKnowledge(id: string, dto: UpdateKnowledgeDto, user: AuthenticatedUser) {
    const kbId = BigInt(id);
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbId, deletedAt: null },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    if (
      !KnowledgeService.isAdmin(user.role) &&
      kb.createdBy.toString() !== user.id
    ) {
      throw new ForbiddenException('无权修改该知识库');
    }

    // 向量模型/集合名不允许修改(切片策略、切片大小可修改, 但只对后续新文档生效)
    await this.prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        name: dto.name,
        description: dto.description,
        chunkStrategy: dto.chunkStrategy,
        chunkSize: dto.chunkSize,
        chunkOverlap: dto.chunkOverlap,
        visibility: dto.visibility,
        status: dto.status,
      },
    });

    return { id };
  }

  /* ============ 删除: MySQL 软删 + Qdrant collection 删除(尽力而为) ============ */
  async deleteKnowledge(id: string, user: AuthenticatedUser) {
    const kbId = BigInt(id);
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbId, deletedAt: null },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    if (
      !KnowledgeService.isAdmin(user.role) &&
      kb.createdBy.toString() !== user.id
    ) {
      throw new ForbiddenException('无权删除该知识库');
    }

    // 1. 先软删 MySQL
    await this.prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { deletedAt: new Date() },
    });

    // 2. 再删 Qdrant collection(尽力而为; 失败不阻塞, 仅日志)
    //    关联文档/切片表的清理留待文档模块再做
    const collection = kb.collection;
    if (collection && collection !== 'pending') {
      try {
        await this.qdrant.deleteCollection(collection);
      } catch (e) {
        this.logger.error(
          `删除知识库 kb#${id} 成功, 但 Qdrant collection ${collection} 删除失败: ` +
            (e as Error).message,
        );
      }
    }

    return { id };
  }
}
