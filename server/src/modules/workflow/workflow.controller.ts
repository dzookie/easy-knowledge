/**
 * WorkflowController — 工作流编排器 API
 *
 * 路由前缀: /api/workflow
 * 全部需要 JWT 鉴权
 *
 * 接口:
 *   GET    /api/workflow                 列表
 *   POST   /api/workflow                 创建
 *   POST   /api/workflow/validate        校验 DSL
 *   GET    /api/workflow/:id             详情
 *   PATCH  /api/workflow/:id             更新
 *   DELETE /api/workflow/:id             删除
 *   POST   /api/workflow/:id/publish     发布
 *   POST   /api/workflow/:id/run         同步运行
 *   POST   /api/workflow/:id/run/stream  流式运行 (SSE)
 *   GET    /api/workflow/:id/runs        运行历史
 *   GET    /api/workflow/run/:runId      运行详情
 */
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, UpdateWorkflowDto, ValidateWorkflowDto } from './dto/workflow.dto';
import { RunWorkflowDto } from './dto/run.dto';

@ApiTags('工作流')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: '工作流列表' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowService.list(user);
  }

  @Post()
  @ApiOperation({ summary: '创建工作流' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowService.create(user, dto);
  }

  @Post('validate')
  @ApiOperation({ summary: '校验工作流图 DSL' })
  async validate(@Body() dto: ValidateWorkflowDto) {
    return this.workflowService.validateGraph(dto.graph);
  }

  // 注意: 固定路径必须在 :id 之前定义, 否则会被 :id 匹配
  @Get('run/:runId')
  @ApiOperation({ summary: '运行详情' })
  async getRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    return this.workflowService.getRun(user, runId);
  }

  @Get(':id')
  @ApiOperation({ summary: '工作流详情' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflowService.getById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新工作流' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除工作流' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.workflowService.remove(user, id);
    return { message: '删除成功' };
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '发布工作流' })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflowService.publish(user, id);
  }

  @Post(':id/run')
  @ApiOperation({ summary: '同步运行工作流' })
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
  ) {
    return this.workflowService.run(user, id, dto.inputs);
  }

  @Post(':id/run/stream')
  @ApiOperation({ summary: '流式运行工作流 (SSE)' })
  async runStream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(HttpStatus.OK);

    try {
      const stream = this.workflowService.runStream(user, id, dto.inputs);
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ event: chunk.event, data: chunk.data })}\n\n`);
      }
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({ event: 'error', data: { message: err?.message || '运行失败' } })}\n\n`,
      );
    } finally {
      res.write(`data: ${JSON.stringify({ event: 'done', data: '' })}\n\n`);
      res.end();
    }
  }

  @Get(':id/runs')
  @ApiOperation({ summary: '工作流运行历史' })
  async listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflowService.listRuns(user, id);
  }
}
