import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express/multer';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';
import { DocumentService } from './document.service';
import { DocumentListQueryDto } from './dto/document-list.dto';
import { ChunkListQueryDto } from './dto/chunk-list.dto';
import { StorageService } from '@/common/storage/storage.service';
import * as path from 'node:path';

@ApiTags('文档管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('document')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly storage: StorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_FILE_BYTES || 157286400),
        files: 1,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kbId'],
      properties: {
        file: { type: 'string', format: 'binary', description: '文档文件' },
        kbId: { type: 'string', description: '目标知识库 ID' },
      },
    },
  })
  @ApiOperation({ summary: '上传文档到知识库(异步处理,返回 queued)' })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body('kbId') kbId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentService.uploadDocument(user, kbId, file);
  }

  @Get()
  @ApiOperation({ summary: '分页查询某知识库的文档列表' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: DocumentListQueryDto) {
    return this.documentService.listDocuments(user, query);
  }

  @Get('chunks')
  @ApiOperation({ summary: '分页查询切片列表(按知识库, 可选按文档过滤)' })
  listChunks(@CurrentUser() user: AuthenticatedUser, @Query() query: ChunkListQueryDto) {
    return this.documentService.listChunks(user, query);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文档(软删 + 异步清理Qdrant向量/本地文件/统计)' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentService.deleteDocument(user, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: '下载文档原始文件' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const { storageKey, fileName, fileType } =
      await this.documentService.getDocumentForDownload(user, id);

    // Content-Type 映射
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      md: 'text/markdown; charset=utf-8',
      txt: 'text/plain; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
    };
    const mimeType = mimeMap[fileType] || 'application/octet-stream';

    // 文件名编码 (RFC 5987), 兼容中文
    // - filename="..." 只允许 ASCII, 非 ASCII 字符替换为下划线
    // - filename*=UTF-8''... 用 encodeURIComponent 传递原始 UTF-8 文件名
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
    const encodedName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    const contentDisposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`;

    const buffer = await this.storage.read(storageKey);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.end(buffer);
  }
}
