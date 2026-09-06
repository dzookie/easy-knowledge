import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';
import { DashboardService } from './dashboard.service';

@ApiTags('主控台')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: '总览统计' })
  async getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOverview(user);
  }

  @Get('kb-distribution')
  @ApiOperation({ summary: '知识库文档分布 TOP N' })
  async getKbDistribution(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getKbDistribution(user, limit ? Number(limit) : 5);
  }

  @Get('recent-documents')
  @ApiOperation({ summary: '最近处理的文档' })
  async getRecentDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getRecentDocuments(user, limit ? Number(limit) : 10);
  }

  @Get('system-status')
  @ApiOperation({ summary: '系统健康状态' })
  async getSystemStatus() {
    return this.dashboardService.getSystemStatus();
  }
}
