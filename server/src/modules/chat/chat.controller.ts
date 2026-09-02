import {
  Body,
  Controller,
  Post,
  UseGuards,
  Sse,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('知识问答')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @ApiOperation({ summary: '知识问答 (SSE 流式): RAG 检索 → DeepSeek 流式生成' })
  async chatStream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(HttpStatus.OK);

    try {
      const stream = this.chatService.chat(user, dto);
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ event: chunk.event, data: chunk.data })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ event: 'done', data: '' })}\n\n`);
    } catch (err: any) {
      const msg = err?.message || '知识问答失败';
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    } finally {
      res.end();
    }
  }
}
