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
import { AuthenticatedUser } from '@/common/types';

/**
 * RetrievalService — 知识检索服务
 *
 * 流程:
 *  1. 校验知识库存在 + 用户有权访问
 *  2. 将 query 文本通过 EmbeddingService 向量化
 *  3. 用 Qdrant search 检索 top-K 最相似的 chunk
 *  4. 从 Qdrant payload 中提取 content/fileName 等信息返回
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
  ) {}

  async search(user: AuthenticatedUser, dto: {
    kbId: string;
    query: string;
    topK?: number;
    scoreThreshold?: number;
  }) {
    const { kbId, query } = dto;
    const topK = dto.topK ?? 5;
    const scoreThreshold = dto.scoreThreshold ?? 0;

    // 1. 查知识库, 拿 collection 名
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: BigInt(kbId), deletedAt: null },
      select: {
        id: true,
        name: true,
        collection: true,
        createdBy: true,
      },
    });
    if (!kb) throw new NotFoundException('知识库不存在');

    // 鉴权: 非管理员只能查自己的
    if (user.role !== 'admin' && kb.createdBy.toString() !== user.id) {
      throw new ForbiddenException('无权检索该知识库');
    }

    // collection 名无效
    if (!kb.collection || kb.collection === 'pending') {
      throw new BadRequestException('知识库向量集合尚未初始化, 无法检索');
    }

    // 2. 检查 Qdrant 中集合是否存在
    const exists = await this.qdrant.collectionExists(kb.collection);
    if (!exists) {
      throw new BadRequestException('知识库向量集合不存在, 可能尚未上传文档或 Qdrant 未就绪');
    }

    // 3. 向量化 query
    const vectors = await this.embedding.embed([query]);
    if (!vectors[0] || vectors[0].length === 0) {
      throw new BadRequestException('查询向量化失败, 请检查 Embedding 配置');
    }
    const queryVector = vectors[0];

    // 4. Qdrant 检索 (使用 query API, search 方法在新版 JS client 中已移除)
    const client = this.qdrant.getClient();
    const searchResult = await client.query(kb.collection, {
      query: queryVector,
      limit: topK,
      with_payload: true,
      with_vector: false,
      ...(scoreThreshold > 0 ? { score_threshold: scoreThreshold } : {}),
    });

    // 5. 组装返回 — query() 返回 { points: ScoredPoint[] }
    const points = (searchResult as any)?.points ?? [];
    const results = points.map((point: any) => ({
      vectorId: String(point.id),
      score: Math.round((point.score ?? 0) * 1000) / 1000, // 保留 3 位小数
      content: point.payload?.content ?? '',
      chunkIndex: point.payload?.chunkIndex ?? 0,
      chunkType: point.payload?.chunkType ?? 'text',
      position: point.payload?.position ?? null,
      docId: point.payload?.docId ?? null,
      fileName: point.payload?.fileName ?? '',
      fileType: point.payload?.fileType ?? '',
    }));

    return {
      query,
      kbId: kb.id.toString(),
      kbName: kb.name,
      total: results.length,
      results,
    };
  }
}
