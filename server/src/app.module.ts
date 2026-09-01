import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { QdrantModule } from './common/qdrant/qdrant.module';
import { EmbeddingModule } from './common/embedding/embedding.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { RoleModule } from './modules/role/role.module';
import { UserModule } from './modules/user/user.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DocumentModule } from './modules/document/document.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';

@Module({
  imports: [
    // 全局环境变量(.env)
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局基础设施
    PrismaModule,
    QdrantModule,
    EmbeddingModule,
    StorageModule,
    // 业务模块
    AuthModule,
    MenuModule,
    RoleModule,
    UserModule,
    KnowledgeModule,
    DocumentModule,
    RetrievalModule,
  ],
})
export class AppModule {}
