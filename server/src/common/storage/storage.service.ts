import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeFilename } from '@/common/utils/encoding';

/**
 * 本地存储服务
 *
 * 职责:
 *  - saveDocument(kbId, file): 把 Multer 上传的文件保存到 <UPLOAD_DIR>/documents/<kbId>/<uuid>_<timestamp>.<ext>
 *  - read(path): 读文件 Buffer
 *  - remove(path): 删除文件
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** 由 StorageModule.onModuleInit 注入绝对路径 */
  rootAbs!: string;

  /**
   * 保存上传的文档
   * @returns 相对路径 (相对于 server/) 形如 uploads/documents/1/xxx.pdf
   */
  async saveDocument(kbId: string, file: Express.Multer.File): Promise<string> {
    const kbDir = path.join(this.rootAbs, 'documents', kbId);
    if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });

    // 原文件扩展: 先用 normalizeFilename 修复中文乱码再取 ext, 保证乱码时即便扩展名跟在中文后面
    // 也能被正确截取 (一般扩展都是 ASCII 所以不受影响, 这里加上更稳)
    const displayName = normalizeFilename(file.originalname || '');
    const ext = path.extname(displayName).toLowerCase().replace(/^\./, '') || 'bin';
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `${ts}_${rand}.${ext}`;
    const absPath = path.join(kbDir, filename);

    // file.buffer 方式(multer memoryStorage):
    if (file.buffer) {
      await fs.promises.writeFile(absPath, file.buffer);
    } else if (file.path) {
      // diskStorage: 移动过来
      await fs.promises.rename(file.path, absPath);
    } else {
      throw new Error('[Storage] Multer 文件无 buffer 也无 path, 请检查上传配置.');
    }
    const rel = path.relative(process.cwd(), absPath).split(path.sep).join('/');
    this.logger.debug(
      `保存文档 kb=${kbId}, 原文件=${displayName}, 大小=${file.size} → ${rel}`,
    );
    return rel;
  }

  /** 读取文件 Buffer */
  async read(relOrAbs: string): Promise<Buffer> {
    const abs = this.resolve(relOrAbs);
    return fs.promises.readFile(abs);
  }

  /** 删除文件, 文件不存在静默 */
  async remove(relOrAbs: string): Promise<void> {
    const abs = this.resolve(relOrAbs);
    try {
      if (fs.existsSync(abs)) {
        await fs.promises.unlink(abs);
      }
    } catch (e: any) {
      this.logger.warn(`删除文件失败 ${abs}: ${e?.message || e}`);
    }
  }

  exists(relOrAbs: string): boolean {
    return fs.existsSync(this.resolve(relOrAbs));
  }

  /** 转绝对路径 */
  private resolve(relOrAbs: string): string {
    if (path.isAbsolute(relOrAbs)) return relOrAbs;
    return path.resolve(process.cwd(), relOrAbs);
  }
}
