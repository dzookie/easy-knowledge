import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { EmbeddingService } from '@/common/embedding/embedding.service';
import { LlmService } from '@/common/llm/llm.service';
import { AuthenticatedUser } from '@/common/types';

/**
 * ChatService — 知识问答 RAG 服务
 *
 * 流程:
 *  1. 校验知识库 + 鉴权
 *  2. 向量化 query → Qdrant 检索 top-K 切片
 *  3. 构建 system prompt（用户自定义人设 + 参考资料）
 *  4. 调用 LlmService 流式生成回答
 *  5. 返回 SSE 流 + 末尾引用来源
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /** 默认系统提示词 */
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

  /**
   * RAG 检索: 向量化 → Qdrant 搜索 → 返回切片
   */
  private async retrieve(
    kbId: string,
    query: string,
    topK: number,
    scoreThreshold: number,
    user: AuthenticatedUser,
  ) {
    // 1. 查知识库
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

    // 2. 检查 Qdrant 集合
    const exists = await this.qdrant.collectionExists(kb.collection);
    if (!exists) {
      throw new BadRequestException('知识库向量集合不存在, 可能尚未上传文档');
    }

    // 3. 向量化 query
    const vectors = await this.embedding.embed([query]);
    if (!vectors[0] || vectors[0].length === 0) {
      throw new BadRequestException('查询向量化失败');
    }

    // 4. Qdrant 检索
    const client = this.qdrant.getClient();
    const searchResult = await client.query(kb.collection, {
      query: vectors[0],
      limit: topK,
      with_payload: true,
      with_vector: false,
      ...(scoreThreshold > 0 ? { score_threshold: scoreThreshold } : {}),
    });

    const points = (searchResult as any)?.points ?? [];
    return points.map((point: any) => ({
      vectorId: String(point.id),
      score: Math.round((point.score ?? 0) * 1000) / 1000,
      content: point.payload?.content ?? '',
      chunkIndex: point.payload?.chunkIndex ?? 0,
      chunkType: point.payload?.chunkType ?? 'text',
      docId: point.payload?.docId ?? null,
      fileName: point.payload?.fileName ?? '',
      fileType: point.payload?.fileType ?? '',
    }));
  }

  /**
   * 构建 RAG 系统提示词
   */
  private buildSystemPrompt(
    userPrompt: string | undefined,
    sources: { content: string; fileName: string; chunkIndex: number }[],
  ): string {
    const basePrompt = userPrompt?.trim() || ChatService.DEFAULT_SYSTEM_PROMPT;

    if (sources.length === 0) {
      return `${basePrompt}\n\n注意：未检索到相关参考资料，请基于你的知识谨慎回答，并告知用户未找到直接相关的知识库内容。`;
    }

    const context = sources
      .map((s, i) => `[${i + 1}] 来源: ${s.fileName} (切片 ${s.chunkIndex})\n内容: ${s.content}`)
      .join('\n\n');

    return `${basePrompt}\n\n参考资料:\n\n${context}`;
  }

  /**
   * 流式问答 — 返回 AsyncGenerator
   * yield 顺序: sources(检索结果) → reasoning(思考过程) → content(正式回答)
   * 每条 yield 格式: { event: 'sources' | 'thinking' | 'content', data: string }
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
    const topK = dto.topK ?? 5;
    const scoreThreshold = dto.topKScore ?? 0;

    // 1. RAG 检索
    const sources = await this.retrieve(kbId, query, topK, scoreThreshold, user);
    this.logger.log(`RAG 检索完成: kbId=${kbId}, query="${query.slice(0, 50)}...", 命中 ${sources.length} 条切片`);

    // 2. 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(dto.systemPrompt, sources);

    // 3. 组装消息历史 (历史 + 当前问题)
    const messages = [...(dto.history || []), { role: 'user' as const, content: query }];

    // 4. 先发送检索结果
    const sourcesData = sources.map((s) => ({
      fileName: s.fileName,
      chunkIndex: s.chunkIndex,
      score: s.score,
      content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
    }));
    yield { event: 'sources', data: JSON.stringify(sourcesData) };

    // 5. 发送组装后的完整 Prompt
    yield { event: 'prompt', data: systemPrompt };

    // 6. 流式生成回答 (区分 reasoning 和 content)
    const stream = this.llm.chatStream(systemPrompt, messages);
    for await (const chunk of stream) {
      yield { event: chunk.type === 'reasoning' ? 'thinking' : 'content', data: chunk.text };
    }
  }
}
