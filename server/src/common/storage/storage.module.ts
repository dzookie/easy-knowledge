import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StorageService } from './storage.service';

/**
 * 全局文件存储模块
 * v1 仅实现本地文件系统: server/<UPLOAD_DIR>/documents/<kbId>/...
 * v2 预留: 替换 StorageService 实现即可接入 MinIO / OSS
 */
@Global()
@Module({
  providers: [StorageService, { provide: 'STORAGE_INIT', useExisting: StorageModule }],
  exports: [StorageService],
})
export class StorageModule implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    const uploadDir = (this.config.get<string>('UPLOAD_DIR') || 'uploads').trim();
    const abs = path.isAbsolute(uploadDir) ? uploadDir : path.resolve(process.cwd(), uploadDir);
    const docsDir = path.join(abs, 'documents');
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    // 让 service 记住这个根路径
    (this.storage as any).rootAbs = abs;
  }
}
