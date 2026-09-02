import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * LLM 公共服务 — 基于 LangChain.js + DeepSeek
 *
 * 当前模型: deepseek-v4-flash
 * 通过 OpenAI 兼容接口调用 DeepSeek API.
 * 提供同步 chat() 和流式 chatStream() 两种调用方式.
 */
@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private chatModel: ChatOpenAI;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.apiKey = (this.config.get<string>('DEEPSEEK_API_KEY') || '').trim();
    this.baseUrl = (this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com').trim().replace(/\/$/, '');
    this.model = (this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash').trim();
    this.temperature = Number(this.config.get<number>('DEEPSEEK_TEMPERATURE') ?? 0.3);
    this.maxTokens = Number(this.config.get<number>('DEEPSEEK_MAX_TOKENS') ?? 4096);

    if (!this.apiKey) {
      this.logger.warn('⚠️  DEEPSEEK_API_KEY 未配置, LLM 调用会失败.');
    }

    this.chatModel = new ChatOpenAI({
      apiKey: this.apiKey,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      streaming: true,
      configuration: { baseURL: `${this.baseUrl}/v1` },
    });

    this.logger.log(
      `LLM 已配置: model=${this.model}, temperature=${this.temperature}, maxTokens=${this.maxTokens}, endpoint=${this.baseUrl}`,
    );
  }

  /**
   * 同步对话 — 等待完整结果返回
   */
  async chat(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const langchainMessages: BaseMessage[] = [new SystemMessage(systemPrompt)];
    for (const msg of messages) {
      if (msg.role === 'user') {
        langchainMessages.push(new HumanMessage(msg.content));
      } else {
        langchainMessages.push(new AIMessage(msg.content));
      }
    }

    const parser = new StringOutputParser();
    const chain = this.chatModel.pipe(parser);
    return await chain.invoke(langchainMessages);
  }

  /**
   * 流式对话 — 返回 AsyncGenerator, 区分 reasoning(思考) 和 content(回答)
   *
   * DeepSeek API 在流式输出时, 每个 chunk 可能包含:
   *  - additional_kwargs.reasoning_content: 思考过程文本
   *  - content: 正式回答文本
   *
   * yield 格式: { type: 'reasoning' | 'content', text: string }
   */
  async *chatStream(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<{ type: 'reasoning' | 'content'; text: string }, void, unknown> {
    const langchainMessages: BaseMessage[] = [new SystemMessage(systemPrompt)];
    for (const msg of messages) {
      if (msg.role === 'user') {
        langchainMessages.push(new HumanMessage(msg.content));
      } else {
        langchainMessages.push(new AIMessage(msg.content));
      }
    }

    const stream = await this.chatModel.stream(langchainMessages);

    for await (const chunk of stream) {
      // reasoning_content (思考过程)
      const reasoning = (chunk as any)?.additional_kwargs?.reasoning_content;
      if (reasoning) {
        yield { type: 'reasoning', text: reasoning };
      }
      // content (正式回答)
      const content = chunk?.content;
      if (content) {
        const text = typeof content === 'string' ? content : '';
        if (text) yield { type: 'content', text };
      }
    }
  }
}
