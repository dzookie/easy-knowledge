import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LlmService } from '@/common/llm/llm.service';
import { RagService } from '@/common/rag/rag.service';
import { AuthenticatedUser } from '@/common/types';
import { CreateApiKeyDto } from './dto/service.dto';

/**
 * ServiceService — 对外服务调用
 *
 * 1. API Key 的 CRUD 管理 (JWT 鉴权)
 * 2. 对外问答接口 (API Key 鉴权) — 委托 RagService 检索 + 组装 prompt，
 *    同步调用 LLM 生成回答，并更新 API Key 调用统计
 */
@Injectable()
export class ServiceService {
  private readonly logger = new Logger(ServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
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
   * RAG 检索与 Prompt 组装逻辑已委托 RagService，与后台 ChatService
   * 共享同一份实现；本方法只负责同步调用 LLM 与更新 API Key 调用统计。
   *
   * @param apiKeyRecord 从 ApiKeyGuard 挂载到 req.apiKey 的记录(含 kb 关联)
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

    // 1. RAG 检索（委托 RagService，内部已校验集合存在性）
    const sources = await this.rag.retrieve(kb.collection, query, topK, scoreThreshold);

    // 2. 组装系统提示词
    const fullPrompt = this.rag.buildSystemPrompt(systemPrompt, sources);

    // 3. 调用 LLM 同步生成
    const answer = await this.llm.chat(fullPrompt, [{ role: 'user', content: query }]);

    // 4. 更新调用统计
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
      sources: sources.map((s) => ({
        fileName: s.fileName,
        score: s.score,
        content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
      })),
    };
  }

  /**
   * 对外问答 — 流式返回 (SSE)
   *
   * yield 顺序与后台 ChatService.chat 对齐:
   *   sources → prompt → thinking(可选) → content → done
   *
   * 检索 + Prompt 组装 + 流式生成核心流程已委托 RagService.ragChat(),
   * 与后台 ChatService 共享同一份实现；本方法只额外负责:
   *   - 集合初始化校验
   *   - 流结束后更新 API Key 调用统计 (按 content 字符数累计 token)
   */
  async *chatStream(
    apiKeyRecord: any,
    query: string,
    topK = 5,
    scoreThreshold = 0,
    systemPrompt?: string,
  ): AsyncGenerator<{ event: 'sources' | 'prompt' | 'thinking' | 'content'; data: string }, void, unknown> {
    const kb = apiKeyRecord.kb;
    if (!kb?.collection || kb.collection === 'pending') {
      throw new BadRequestException('知识库向量集合尚未初始化');
    }

    // 委托 RagService 完成检索 + 组装 + 流式生成, 同时累计 content 字符数
    let answerLength = 0;
    for await (const chunk of this.rag.ragChat({
      collection: kb.collection,
      query,
      topK,
      scoreThreshold,
      systemPrompt,
    })) {
      if (chunk.event === 'content') answerLength += chunk.data.length;
      yield chunk;
    }

    // 更新调用统计 (流结束后统一更新)
    await this.prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: {
        callCount: { increment: 1 },
        tokenCount: { increment: answerLength },
      },
    });

    this.logger.log(`对外问答(流式)完成: keyId=${apiKeyRecord.id}, query="${query.slice(0, 50)}..."`);
  }
}
