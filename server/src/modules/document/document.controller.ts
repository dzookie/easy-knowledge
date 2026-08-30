import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
import { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { DocumentService } from './document.service';
import { DocumentListQueryDto } from './dto/document-list.dto';

@ApiTags('文档管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

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

  @Delete(':id')
  @ApiOperation({ summary: '删除文档(软删 + 异步清理Qdrant向量/本地文件/统计)' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentService.deleteDocument(user, id);
  }
}
