import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { PipelineService } from './pipeline.service';
import { DocumentListQueryDto } from './dto/document-list.dto';
import { createParserByExt, allExtensions } from './parsers';
import { normalizeFilename } from '@/common/utils/encoding';
import * as path from 'node:path';

/**
 * DocumentService
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pipeline: PipelineService,
  ) {}

  /** 上传一个文档 */
  async uploadDocument(
    user: AuthenticatedUser,
    kbId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('未接收到文件 (file field=file).');
    if (!kbId) throw new BadRequestException('缺少参数 kbId');

    const kbIdB = BigInt(kbId);

    // 1. 知识库鉴权
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbIdB, deletedAt: null },
      select: { id: true, createdBy: true, status: true, visibility: true, collection: true },
    });
    if (!kb) throw new NotFoundException('知识库不存在');
    if (kb.status !== 1) throw new BadRequestException('知识库已禁用,不能上传文档');
    const canUpload = user.role === 'admin' || kb.createdBy === BigInt(user.id);
    if (!canUpload) {
      throw new ForbiddenException('无权限上传文档到该知识库');
    }

    // 2. 扩展名 + 文件大小后端兜底校验
    const rawName = file.originalname || '';
    const originalName = normalizeFilename(rawName);
    const ext = path.extname(originalName).replace(/^\./, '').toLowerCase();
    if (!ext) throw new BadRequestException('文件缺少扩展名');
    try {
      createParserByExt(ext);
    } catch (e: any) {
      throw new BadRequestException(`暂不支持的文件类型: .${ext}. 支持: ${allExtensions().join(', ')}`);
    }
    const maxBytes = Number(process.env.UPLOAD_MAX_FILE_BYTES || 157286400);
    if (file.size > maxBytes) {
      throw new BadRequestException(`文件过大 (>${Math.round(maxBytes / 1024 / 1024)}MB).`);
    }
    if (file.size <= 0) throw new BadRequestException('空文件');

    // 3. 保存到本地 (存储层用时间戳随机串做文件名, 不依赖 display name)
    const storageKey = await this.storage.saveDocument(kbIdB.toString(), file);

    // 4. 写 document (status=0 待处理)
    const doc = await this.prisma.document.create({
      data: {
        kbId: kbIdB,
        fileName: originalName,
        fileType: ext,
        sizeBytes: BigInt(file.size),
        storageKey,
        uploadedBy: BigInt(user.id),
        status: 0,
        errorMsg: null,
      },
      select: { id: true, fileName: true },
    });

    // 5. 异步触发 pipeline
    Promise.resolve()
      .then(() => this.pipeline.processDocument(doc.id))
      .catch((e) => {
        this.logger.error(`[DocumentService] pipeline 调度异常: ${e?.message || e}`);
      });

    return {
      documentId: doc.id.toString(),
      fileName: doc.fileName,
      status: 'queued',
      hint: '处理中,可稍后刷新列表查看进度',
    };
  }

  /** 列表分页 */
  async listDocuments(user: AuthenticatedUser, query: DocumentListQueryDto) {
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    // 前端可能在路由 params 初始化期间发起一次空 kbId 请求, 这里直接返回空列表避免 400 日志
    if (!query.kbId) {
      return { items: [], total: 0, page, pageSize };
    }
    const kbIdB = BigInt(query.kbId);

    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbIdB, deletedAt: null },
      select: { createdBy: true, visibility: true },
    });
    if (!kb) throw new NotFoundException('知识库不存在');
    const canView =
      user.role === 'admin' ||
      kb.createdBy === BigInt(user.id) ||
      kb.visibility !== 0;
    if (!canView) throw new ForbiddenException('无权限访问该知识库文档列表');

    const where: any = {
      kbId: kbIdB,
      deletedAt: null,
    };
    if (query.keyword && query.keyword.trim()) {
      where.fileName = { contains: query.keyword.trim() };
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((d: any) => this.serialize(d)),
    };
  }

  /** 软删 + 异步清理 */
  async deleteDocument(user: AuthenticatedUser, docId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: BigInt(docId), deletedAt: null },
      include: {
        knowledgeBase: { select: { id: true, createdBy: true, collection: true, chunkCount: true } },
      },
    });
    if (!doc) throw new NotFoundException('文档不存在');
    const canDelete =
      user.role === 'admin' ||
      doc.uploadedBy === BigInt(user.id) ||
      doc.knowledgeBase.createdBy === BigInt(user.id);
    if (!canDelete) throw new ForbiddenException('无权限删除该文档');

    const now = new Date();
    await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        deletedAt: now,
        deletedBy: BigInt(user.id),
      },
    });

    // chunks 软删
    await this.prisma.documentChunk.updateMany({
      where: { documentId: doc.id, deletedAt: null },
      data: { deletedAt: now },
    });

    const chunkCount = doc.chunkCount ?? 0;
    Promise.resolve()
      .then(() =>
        this.pipeline.cleanupAfterDelete({
          documentId: doc.id,
          kbId: doc.knowledgeBase.id,
          collection: doc.knowledgeBase.collection,
          storageKey: doc.storageKey,
          chunkCount,
        }),
      )
      .catch((e) => {
        this.logger.warn(`[DocumentService] 清理文档残留异常 docId=${docId}: ${e?.message || e}`);
      });

    return { success: true, documentId: doc.id.toString() };
  }

  /* ========== helpers ========== */

  private serialize(d: any) {
    return {
      id: d.id.toString(),
      kbId: d.kbId.toString(),
      fileName: d.fileName,
      fileType: d.fileType,
      sizeBytes: Number(d.sizeBytes || 0),
      chunkCount: Number(d.chunkCount || 0),
      totalChars: Number(d.totalChars || 0),
      pageCount: d.pageCount ?? null,
      status: d.status,
      errorMsg: d.errorMsg,
      processMs: d.processMs,
      startedAt: d.startedAt ? new Date(d.startedAt).toISOString() : null,
      uploadedBy: d.uploader ? d.uploader.id.toString() : null,
      uploader: d.uploader
        ? {
            id: d.uploader.id.toString(),
            username: d.uploader.username,
            nickname: d.uploader.nickname,
            avatar: d.uploader.avatar,
          }
        : null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      finishedAt: d.finishedAt ? new Date(d.finishedAt).toISOString() : null,
    };
  }
}
