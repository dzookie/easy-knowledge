import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';
import { RetrievalService } from './retrieval.service';
import { RetrieveDto } from './dto/retrieve.dto';

@ApiTags('知识检索')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('retrieval')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post('search')
  @ApiOperation({ summary: '语义检索: 向量化 query → Qdrant top-K 检索' })
  search(@CurrentUser() user: AuthenticatedUser, @Body() dto: RetrieveDto) {
    return this.retrievalService.search(user, dto);
  }
}
