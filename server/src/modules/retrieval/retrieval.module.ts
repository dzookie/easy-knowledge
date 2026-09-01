import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { RetrievalController } from './retrieval.controller';

/**
 * 知识检索模块
 * 依赖 Prisma/Qdrant/Embedding 全局模块, 不用显式 import.
 */
@Module({
  controllers: [RetrievalController],
  providers: [RetrievalService],
})
export class RetrievalModule {}
