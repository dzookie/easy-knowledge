import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { EmbeddingService } from '@/common/embedding/embedding.service';
import { LlmService } from '@/common/llm/llm.service';
import { AuthenticatedUser } from '@/common/types';
import { CreateApiKeyDto } from './dto/service.dto';

/**
 * ServiceService — 对外服务调用
 *
 * 1. API Key 的 CRUD 管理 (JWT 鉴权)
 * 2. 对外问答接口 (API Key 鉴权) — RAG 检索 → LLM 同步生成
 */
@Injectable()
export class ServiceService {
  private readonly logger = new Logger(ServiceService.name);

  /** 默认系统提示词 (对外接口不允许自定义时使用) */
  private static readonly DEFAULT_SYSTEM_PROMPT = `你是一个专业的知识库问答助手。请根据以下参考资料回答用户的问题。

要求：
1. 回答必须基于参考资料，不要编造信息
2. 如果参考资料不足以回答问题，请坦诚说明
3. 回答要清晰、准确、有条理
4. 在回答中引用相关资料时，使用 [1] [2] 等标注`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly llm: LlmService,
  ) {}

  /* ============ API Key 管理 ============ */

  /** 生成随机 API Key (sk- + 32位hex) */
  private generateKey(): string {
    return 'sk-' + randomBytes(16).toString('hex');
  }

  /** 列出当前用户的 API Key (可选按 kbId 过滤) */
  async listApiKeys(user: AuthenticatedUser, kbId?: string) {
    const list = await this.prisma.apiKey.findMany({
      where: {
        userId: BigInt(user.id),
        ...(kbId ? { kbId: BigInt(kbId) } : {}),
      },
      include: {
        kb: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((item) => ({
      id: item.id.toString(),
      key: item.key,
      name: item.name,
      kbId: item.kbId.toString(),
      kbName: item.kb?.name || '',
      status: item.status,
      callCount: item.callCount,
      tokenCount: item.tokenCount,
      dailyLimit: item.dailyLimit,
      expiresAt: item.expiresAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  /** 创建 API Key */
  async createApiKey(user: AuthenticatedUser, dto: CreateApiKeyDto) {
    // 校验知识库存在且用户有权访问
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: BigInt(dto.kbId), deletedAt: null },
      select: { id: true, name: true, createdBy: true },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    if (user.role !== 'admin' && kb.createdBy.toString() !== user.id) {
      throw new ForbiddenException('无权操作该知识库');
    }

    const key = this.generateKey();
    const record = await this.prisma.apiKey.create({
      data: {
        key,
        name: dto.name,
        kbId: BigInt(dto.kbId),
        userId: BigInt(user.id),
        dailyLimit: dto.dailyLimit ?? 100,
      },
    });

    this.logger.log(`API Key 创建成功: name="${dto.name}", kbId=${dto.kbId}, userId=${user.id}`);

    return {
      id: record.id.toString(),
      key: record.key,
      name: record.name,
      kbId: record.kbId.toString(),
      dailyLimit: record.dailyLimit,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** 删除 API Key */
  async deleteApiKey(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.apiKey.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record) throw new NotFoundException('API Key 不存在');

    if (user.role !== 'admin' && record.userId.toString() !== user.id) {
      throw new ForbiddenException('无权删除他人的 API Key');
    }

    await this.prisma.apiKey.delete({ where: { id: BigInt(id) } });
    this.logger.log(`API Key 删除: id=${id}`);
  }

  /** 切换启用/禁用 */
  async toggleApiKey(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.apiKey.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record) throw new NotFoundException('API Key 不存在');

    if (user.role !== 'admin' && record.userId.toString() !== user.id) {
      throw new ForbiddenException('无权操作他人的 API Key');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: BigInt(id) },
      data: { status: record.status === 1 ? 0 : 1 },
    });

    return { id: updated.id.toString(), status: updated.status };
  }

  /* ============ 对外问答 ============ */

  /**
   * 对外问答 — 同步返回完整结果 (非流式)
   *
   * @param apiKeyRecord 从 ApiKeyGuard 挂载到 req.apiKey 的记录
   * @param query 用户问题
   * @param topK 检索数量
   * @param scoreThreshold 相似度阈值
   * @param systemPrompt 自定义提示词
   */
  async chat(
    apiKeyRecord: any,
    query: string,
    topK = 5,
    scoreThreshold = 0,
    systemPrompt?: string,
  ) {
    const kb = apiKeyRecord.kb;
    if (!kb?.collection || kb.collection === 'pending') {
      throw new BadRequestException('知识库向量集合尚未初始化');
    }

    // 1. 检查 Qdrant 集合
    const exists = await this.qdrant.collectionExists(kb.collection);
    if (!exists) {
      throw new BadRequestException('知识库向量集合不存在, 可能尚未上传文档');
    }

    // 2. 向量化 query
    const vectors = await this.embedding.embed([query]);
    if (!vectors[0] || vectors[0].length === 0) {
      throw new BadRequestException('查询向量化失败');
    }

    // 3. Qdrant 检索
    const client = this.qdrant.getClient();
    const searchResult = await client.query(kb.collection, {
      query: vectors[0],
      limit: topK,
      with_payload: true,
      with_vector: false,
      ...(scoreThreshold > 0 ? { score_threshold: scoreThreshold } : {}),
    });

    const points = (searchResult as any)?.points ?? [];
    const sources = points.map((point: any) => ({
      vectorId: String(point.id),
      score: Math.round((point.score ?? 0) * 1000) / 1000,
      content: point.payload?.content ?? '',
      chunkIndex: point.payload?.chunkIndex ?? 0,
      fileName: point.payload?.fileName ?? '',
    }));

    // 4. 构建系统提示词
    const basePrompt = systemPrompt?.trim() || ServiceService.DEFAULT_SYSTEM_PROMPT;
    const context = sources.length > 0
      ? sources.map((s: any, i: number) => `[${i + 1}] 来源: ${s.fileName}\n内容: ${s.content}`).join('\n\n')
      : '注意：未检索到相关参考资料。';
    const fullPrompt = `${basePrompt}\n\n参考资料:\n\n${context}`;

    // 5. 调用 LLM 同步生成
    const answer = await this.llm.chat(fullPrompt, [{ role: 'user', content: query }]);

    // 6. 更新调用统计
    await this.prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: {
        callCount: { increment: 1 },
        tokenCount: { increment: answer.length },
      },
    });

    this.logger.log(`对外问答完成: keyId=${apiKeyRecord.id}, query="${query.slice(0, 50)}...", 命中 ${sources.length} 条切片`);

    return {
      answer,
      sources: sources.map((s: any) => ({
        fileName: s.fileName,
        score: s.score,
        content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
      })),
    };
  }
}
