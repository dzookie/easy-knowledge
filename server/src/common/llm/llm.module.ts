import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * 全局 LLM 模块
 * 基于 LangChain.js + DeepSeek API
 * 提供同步 chat() 和流式 chatStream() 两种调用方式
 */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
