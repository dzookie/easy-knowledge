import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { AuthenticatedUser } from '@/common/types';
import { ServiceService } from './service.service';
import { CreateApiKeyDto, ServiceChatDto } from './dto/service.dto';

/**
 * ServiceController — 服务调用
 *
 * 两类接口:
 *   1. /api/service-key/* — API Key 管理 (JWT 鉴权)
 *   2. /api/service/chat  — 对外问答 (API Key 鉴权)
 */
@ApiTags('服务调用')
@Controller()
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  /* ============ API Key 管理 (JWT 鉴权) ============ */

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('service-key')
  @ApiOperation({ summary: '获取当前用户的 API Key 列表' })
  async listApiKeys(
    @CurrentUser() user: AuthenticatedUser,
    @Query('kbId') kbId?: string,
  ) {
    return this.serviceService.listApiKeys(user, kbId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('service-key')
  @ApiOperation({ summary: '创建 API Key' })
  async createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.serviceService.createApiKey(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('service-key/:id')
  @ApiOperation({ summary: '删除 API Key' })
  async deleteApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.serviceService.deleteApiKey(user, id);
    return { message: '删除成功' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('service-key/:id/toggle')
  @ApiOperation({ summary: '切换 API Key 启用/禁用' })
  async toggleApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.serviceService.toggleApiKey(user, id);
  }

  /* ============ 对外问答 (API Key 鉴权) ============ */

  @Public()
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'X-API-Key', description: 'API Key' })
  @Post('service/chat')
  @ApiOperation({ summary: '对外知识问答 (API Key 鉴权)' })
  async chat(
    @Req() req: any,
    @Body() dto: ServiceChatDto,
  ) {
    return this.serviceService.chat(
      req.apiKey,
      dto.query,
      dto.topK,
      dto.scoreThreshold,
      dto.systemPrompt,
    );
  }
}
