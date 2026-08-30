import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { EmbeddingService } from '@/common/embedding/embedding.service';
import { QdrantService } from '@/common/qdrant/qdrant.service';
import { createParserByExt } from './parsers';
import { createChunks, ChunkStrategy } from './chunkers';
import type { ChunkItem, ParsedResult } from './parsers/types';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 文档处理流水线
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly embedding: EmbeddingService,
    private readonly qdrant: QdrantService,
  ) {}

  async processDocument(documentId: bigint): Promise<void> {
    const t0 = Date.now();
    try {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
        include: {
          knowledgeBase: {
            select: {
              id: true,
              collection: true,
              chunkStrategy: true,
              chunkSize: true,
              chunkOverlap: true,
              embeddingModel: true,
            },
          },
        },
      });
      if (!doc) {
        this.logger.warn(`[Pipeline] 文档不存在: ${documentId.toString()}`);
        return;
      }
      if (!doc.knowledgeBase) {
        throw new Error('所属知识库不存在');
      }
      const kbId = doc.knowledgeBase.id;

      // 处理中
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 1, startedAt: new Date(), errorMsg: null },
      });

      // 2. 解析
      const ext = path.extname(doc.fileName || '').replace(/^\./, '').toLowerCase() || doc.fileType;
      const parser = createParserByExt(ext);
      const absPath = doc.storageKey;
      const abs = path.isAbsolute(absPath) ? absPath : path.resolve(process.cwd(), absPath);
      const parsed: ParsedResult = await parser.parse(abs);
      if (parsed.totalChars < 10 && (!parsed.segments || parsed.segments.length === 0)) {
        throw new Error(
          parsed.meta && (parsed.meta as any).scannedLike
            ? 'PDF 像扫描件/图片版, 未提取到有效文本. 请转换为可复制文字的 PDF 后再上传.'
            : '提取到的文本为空, 可能是空文档或加密文档.',
        );
      }

      // 3. 切片
      const strategy = (doc.knowledgeBase.chunkStrategy as ChunkStrategy) || 'recursive';
      const chunks: ChunkItem[] = createChunks(parsed, {
        strategy,
        chunkSize: Number(doc.knowledgeBase.chunkSize) || 500,
        chunkOverlap: Number(doc.knowledgeBase.chunkOverlap) || 50,
      });
      if (chunks.length === 0) {
        throw new Error('切片结果为空 (0 个 chunk), 请尝试调整切片策略/大小.');
      }

      // 4. 向量化
      const vectors: number[][] = await this.embedding.embed(
        chunks.map((c) => c.content),
      );

      // 5. Qdrant upsert (批处理)
      const qdrantClient = this.qdrant.getClient();
      const collection = doc.knowledgeBase.collection;
      const qdrantBatchSize = 64;
      for (let i = 0; i < chunks.length; i += qdrantBatchSize) {
        const end = Math.min(i + qdrantBatchSize, chunks.length);
        const points: any[] = [];
        for (let j = i; j < end; j++) {
          const c = chunks[j];
          // Qdrant 仅支持 unsigned integer / UUID 两种 point ID, 不允许自定义字符串
          // 这里用 UUID v4; 删除向量时不依赖 ID 反查, 统一通过 payload.docId filter 删除 (已在 cleanupAfterDelete 实现)
          const vectorId = uuidv4();
          const rawVec = vectors[j] || [];
          const posStr = c.position
            ? JSON.stringify(c.position).slice(0, 490)
            : null;
          if (!Array.isArray(rawVec) || rawVec.length === 0) {
            throw new Error(
              `Chunk[${c.index}] 向量无效: 期望数组非空, 实际 type=${typeof rawVec} len=${Array.isArray(rawVec) ? rawVec.length : 'n/a'}`,
            );
          }
          // DashScope 偶尔会返回含 NaN/Infinity 的浮点(极个别场景), 这里统一清洗成 0, 避免 JSON.stringify -> null 导致 Qdrant 400
          const vec = rawVec.map((n) =>
            typeof n === 'number' && Number.isFinite(n) ? n : 0,
          );
          points.push({
            id: vectorId,
            vector: vec,
            payload: {
              kbId: kbId.toString(),
              docId: doc.id.toString(),
              chunkIndex: c.index,
              chunkType: c.type,
              content: c.content,
              position: posStr,
              fileName: doc.fileName,
              fileType: doc.fileType,
              uploadedBy: doc.uploadedBy.toString(),
              createdAt: Date.now(),
            },
          });
          // 回写到 chunkRows 用 (j 是 chunks 数组下标, 与后面 createMany 顺序一致)
          (chunks[j] as any)._vectorId = vectorId;
        }
        this.logger.debug(
          `[Pipeline] Qdrant upsert 批: collection=${collection}, count=${points.length}, vectorDim=${points[0].vector.length}`,
        );
        try {
          await qdrantClient.upsert(collection, { wait: true, points });
        } catch (qdrantErr: any) {
          // 把 Qdrant 原始响应体也解出来, 避免只打 "Bad Request"
          const raw = qdrantErr?.data
            ? typeof qdrantErr.data === 'object'
              ? JSON.stringify(qdrantErr.data).slice(0, 800)
              : String(qdrantErr.data).slice(0, 800)
            : qdrantErr?.message;
          throw new Error(
            `Qdrant upsert 失败: ${qdrantErr?.message || 'unknown'} | data=${raw}`,
          );
        }
      }

      // 6. 写 document_chunk (批量)
      const chunkRows: any[] = chunks.map((c) => {
        // Qdrant point ID 用的是 UUID v4 (见上面 upsert 部分), 从 chunks 上回写的临时字段取
        const vid = (c as any)._vectorId as string | undefined;
        if (!vid) {
          throw new Error(
            `Chunk index=${c.index} 未生成 vectorId(可能是 upsert 没执行到).`,
          );
        }
        return {
          documentId: doc.id,
          kbId,
          chunkIndex: c.index,
          content: c.content,
          chunkType: c.type,
          position: c.position ? JSON.stringify(c.position).slice(0, 490) : null,
          tokenCount: 0,
          charCount: c.content.length,
          vectorId: vid,
          indexed: 1,
        };
      });
      const chunkBatch = 500;
      for (let i = 0; i < chunkRows.length; i += chunkBatch) {
        await this.prisma.documentChunk.createMany({
          data: chunkRows.slice(i, i + chunkBatch),
          skipDuplicates: true,
        });
      }

      // 7. 更新状态 + 统计
      const processMs = Date.now() - t0;
      const pageCount = (parsed.meta && (parsed.meta as any).pages) ? Number((parsed.meta as any).pages) : null;
      await this.prisma.$transaction([
        this.prisma.document.update({
          where: { id: doc.id },
          data: {
            status: 2,
            errorMsg: null,
            chunkCount: chunkRows.length,
            totalChars: parsed.totalChars,
            finishedAt: new Date(),
            processMs,
            pageCount,
          },
        }),
        this.prisma.knowledgeBase.update({
          where: { id: kbId },
          data: {
            documentCount: { increment: 1 },
            chunkCount: { increment: chunkRows.length },
          },
        }),
      ]);

      this.logger.log(
        `[Pipeline] 文档处理完成 id=${doc.id} file=${doc.fileName} ` +
          `chars=${parsed.totalChars} chunks=${chunks.length} cost=${processMs}ms`,
      );
    } catch (e: any) {
      const msg = (e?.message || String(e)).slice(0, 500);
      this.logger.error(`[Pipeline] 文档 id=${documentId.toString()} 失败: ${msg}`, e?.stack || '');
      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: 3,
            errorMsg: msg,
            finishedAt: new Date(),
            processMs: Number(Date.now() - t0),
          },
        });
      } catch (_) {
        /* ignore */
      }
    }
  }

  /**
   * 删除文档对应 Qdrant 向量 + 本地文件 + 修正统计
   */
  async cleanupAfterDelete(params: {
    documentId: bigint;
    kbId: bigint;
    collection: string | null;
    storageKey: string | null;
    chunkCount: number;
  }): Promise<void> {
    const { documentId, kbId, collection, storageKey, chunkCount } = params;
    try {
      if (collection && chunkCount > 0) {
        const client = this.qdrant.getClient();
        await client
          .delete(collection, {
            filter: {
              must: [
                {
                  key: 'docId',
                  match: { value: documentId.toString() },
                },
              ],
            },
            wait: true,
          })
          .catch((err) => {
            this.logger.warn(
              `[Pipeline] Qdrant 删除向量失败 doc=${documentId}: ${err?.message || err}`,
            );
          });
      }
    } catch (e: any) {
      this.logger.warn(
        `[Pipeline] Qdrant 清理失败 docId=${documentId}: ${e?.message || e}`,
      );
    }
    if (storageKey) {
      await this.storage.remove(storageKey).catch(() => {});
    }
    try {
      await this.prisma.knowledgeBase.update({
        where: { id: kbId },
        data: {
          documentCount: { decrement: 1 },
          chunkCount: { decrement: Math.max(0, chunkCount) },
        },
      });
    } catch (e: any) {
      this.logger.warn(`[Pipeline] 知识库统计更新失败 kbId=${kbId}: ${e?.message || e}`);
    }
  }
}
