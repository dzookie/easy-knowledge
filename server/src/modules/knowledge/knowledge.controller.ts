import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

/**
 * KnowledgeController — 知识库管理接口
 * 基路径: /api/knowledge
 *
 * 权限:
 *  - admin: 可见/操作全部知识库
 *  - 普通用户: 仅可见/操作自己创建的
 */
@ApiTags('知识库')
@ApiBearerAuth('JWT-auth')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * 查询知识库列表
   */
  @Get()
  @ApiOperation({
    summary: '查询知识库列表',
    description: '管理员返回全部, 普通用户只返回自己创建的',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeService.listKnowledgeBases(user);
  }

  /**
   * 查询知识库详情
   */
  @Get(':id')
  @ApiOperation({ summary: '查询知识库详情' })
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeService.getKnowledgeDetail(id, user);
  }

  /**
   * 新增知识库
   */
  @Post()
  @ApiOperation({ summary: '新增知识库', description: '创建后自动生成 Qdrant collection 名' })
  async create(@Body() dto: CreateKnowledgeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeService.createKnowledge(dto, user);
  }

  /**
   * 修改知识库
   */
  @Put(':id')
  @ApiOperation({
    summary: '修改知识库',
    description: '可改名称/描述/切片策略/可见性/状态, 向量模型与 collection 不可变',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgeService.updateKnowledge(id, dto, user);
  }

  /**
   * 删除知识库(软删除)
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除知识库', description: '软删除, 关联文档/Qdrant 后续异步清理' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeService.deleteKnowledge(id, user);
  }
}
