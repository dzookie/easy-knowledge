import { Global, Module } from '@nestjs/common';
import { RagService } from './rag.service';

/**
 * 全局 RAG 模块
 *
 * 提供检索(RAG retrieve)与 Prompt 组装能力，供后台流式问答
 * (ChatService) 与对外同步问答(ServiceService)共享复用。
 *
 * 依赖的 QdrantService / EmbeddingService 已分别由 QdrantModule /
 * EmbeddingModule 通过 @Global() 暴露，此处无需重复 import。
 */
@Global()
@Module({
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
