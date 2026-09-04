import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { EmbeddingService } from '@/common/embedding/embedding.service';
import { LlmService } from '@/common/llm/llm.service';

/**
 * RAG 检索结果切片
 */
export interface RagSource {
  vectorId: string;
  score: number;
  content: string;
  chunkIndex: number;
  chunkType: string;
  docId: string | null;
  fileName: string;
  fileType: string;
}

/**
 * RagService — RAG 检索与 Prompt 组装的公共逻辑
 *
 * 提取自 ChatService / ServiceService 的重复实现，供流式问答(后台)与
 * 同步问答(对外服务)复用。本服务只负责"检索 + 组装"，不涉及鉴权
 * 与响应格式，由调用方各自处理。
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  /** 默认系统提示词 */
  static readonly DEFAULT_SYSTEM_PROMPT = `你是一个专业的知识库问答助手。请根据以下参考资料回答用户的问题。

要求：
1. 回答必须基于参考资料，不要编造信息
2. 如果参考资料不足以回答问题，请坦诚说明
3. 回答要清晰、准确、有条理
4. 在回答中引用相关资料时，使用 [1] [2] 等标注`;

  constructor(
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly llm: LlmService,
  ) {}

  /**
   * 检索：校验集合 → 向量化 query → Qdrant 搜索 → 返回切片
   *
   * 调用方需自行校验知识库存在性与用户权限，并传入有效的 collection 名。
   *
   * @param collection Qdrant 集合名
   * @param query 用户问题
   * @param topK 检索数量，默认 5
   * @param scoreThreshold 相似度阈值，0 表示不限
   */
  async retrieve(
    collection: string,
    query: string,
    topK = 5,
    scoreThreshold = 0,
  ): Promise<RagSource[]> {
    // 1. 检查 Qdrant 集合
    const exists = await this.qdrant.collectionExists(collection);
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
    const searchResult = await client.query(collection, {
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
   *
   * @param userPrompt 用户自定义提示词，为空时使用默认提示词
   * @param sources 检索到的切片
   */
  buildSystemPrompt(
    userPrompt: string | undefined,
    sources: { content: string; fileName: string; chunkIndex: number }[],
  ): string {
    const basePrompt = userPrompt?.trim() || RagService.DEFAULT_SYSTEM_PROMPT;

    if (sources.length === 0) {
      return `${basePrompt}\n\n注意：未检索到相关参考资料，请基于你的知识谨慎回答，并告知用户未找到直接相关的知识库内容。`;
    }

    const context = sources
      .map((s, i) => `[${i + 1}] 来源: ${s.fileName} (切片 ${s.chunkIndex})\n内容: ${s.content}`)
      .join('\n\n');

    return `${basePrompt}\n\n参考资料:\n\n${context}`;
  }

  /**
   * RAG 流式问答 — 统一核心流程，供后台 ChatService 与对外 ServiceService 复用
   *
   * 流程: 检索 → 组装 prompt → yield sources → yield prompt → 流式生成 (thinking/content)
   *
   * 调用方各自负责:
   *   - 前置鉴权 (JWT / API Key) 与知识库权限校验
   *   - 后置统计更新 (如 API Key 调用次数 / token 累计)
   *
   * @returns AsyncGenerator, yield 顺序: sources → prompt → thinking(可选) → content
   */
  async *ragChat(opts: {
    collection: string;
    query: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    topK?: number;
    scoreThreshold?: number;
    systemPrompt?: string;
  }): AsyncGenerator<{ event: 'sources' | 'prompt' | 'thinking' | 'content'; data: string }, void, unknown> {
    const { collection, query } = opts;
    const topK = opts.topK ?? 5;
    const scoreThreshold = opts.scoreThreshold ?? 0;

    // 1. 检索
    const sources = await this.retrieve(collection, query, topK, scoreThreshold);
    this.logger.log(`RAG 检索完成: collection=${collection}, query="${query.slice(0, 50)}...", 命中 ${sources.length} 条切片`);

    // 2. 组装系统提示词
    const fullPrompt = this.buildSystemPrompt(opts.systemPrompt, sources);

    // 3. 发送检索结果
    const sourcesData = sources.map((s) => ({
      fileName: s.fileName,
      chunkIndex: s.chunkIndex,
      score: s.score,
      content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
    }));
    yield { event: 'sources', data: JSON.stringify(sourcesData) };

    // 4. 发送组装后的完整 Prompt
    yield { event: 'prompt', data: fullPrompt };

    // 5. 流式生成回答 (区分 reasoning 和 content)
    const messages = [...(opts.history || []), { role: 'user' as const, content: query }];
    const stream = this.llm.chatStream(fullPrompt, messages);
    for await (const chunk of stream) {
      yield { event: chunk.type === 'reasoning' ? 'thinking' : 'content', data: chunk.text };
    }
  }
}
