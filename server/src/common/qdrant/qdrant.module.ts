import { Global, Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';

/**
 * QdrantModule — 全局 Qdrant 向量数据库模块
 * @Global 使 QdrantService 在所有业务模块中可直接注入, 无需 import。
 * 依赖 ConfigService(已 isGlobal), 可直接使用。
 */
@Global()
@Module({
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
