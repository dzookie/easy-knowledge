import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { PipelineService } from './pipeline.service';

/**
 * 文档模块: 上传 → 解析 → 切片 → Embedding → Qdrant → MySQL
 * 依赖 Prisma/Storage/Embedding/Qdrant 全部是 Global 模块, 不用显式 import.
 */
@Module({
  controllers: [DocumentController],
  providers: [DocumentService, PipelineService],
  exports: [DocumentService],
})
export class DocumentModule {}
