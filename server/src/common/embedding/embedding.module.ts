import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

/**
 * 全局 Embedding 模块
 * 当前实现: 调阿里云 DashScope(千问) 兼容 OpenAI embeddings 接口
 * 预留: 未来可通过配置切换成本地 bge-m3 微服务
 */
@Global()
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
