import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RagService } from '@/common/rag/rag.service';
import { AuthenticatedUser } from '@/common/types';

/**
 * ChatService — 知识问答 RAG 服务 (后台, JWT 鉴权)
 *
 * 职责仅限于:
 *  1. 校验知识库存在 + 用户权限 + 集合已初始化
 *  2. 委托 RagService.ragChat() 完成检索 + Prompt 组装 + 流式生成
 *
 * 检索 / 组装 / 流式生成的核心逻辑已下沉到 RagService.ragChat(),
 * 与对外 ServiceService 共享同一份实现，避免两边漂移。
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
  ) {}

  /**
   * 流式问答 — 返回 AsyncGenerator
   * yield 顺序: sources(检索结果) → prompt(组装后系统提示词) → thinking(思考过程) → content(正式回答)
   */
  async *chat(
    user: AuthenticatedUser,
    dto: {
      kbId: string;
      query: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      topK?: number;
      topKScore?: number;
      temperature?: number;
      systemPrompt?: string;
    },
  ): AsyncGenerator<{ event: 'sources' | 'prompt' | 'thinking' | 'content'; data: string }, void, unknown> {
    const { kbId, query } = dto;

    // 1. 校验知识库存在 + 用户权限 + 集合已初始化
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: BigInt(kbId), deletedAt: null },
      select: { id: true, name: true, collection: true, createdBy: true },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    if (user.role !== 'admin' && kb.createdBy.toString() !== user.id) {
      throw new ForbiddenException('无权访问该知识库');
    }

    if (!kb.collection || kb.collection === 'pending') {
      throw new BadRequestException('知识库向量集合尚未初始化');
    }

    // 2. 委托 RagService 完成检索 + 组装 + 流式生成
    yield* this.rag.ragChat({
      collection: kb.collection,
      query,
      history: dto.history,
      topK: dto.topK,
      scoreThreshold: dto.topKScore,
      systemPrompt: dto.systemPrompt,
    });
  }
}
