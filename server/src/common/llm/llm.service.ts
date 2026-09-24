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
import type { RagSource } from '@/common/rag/rag.service';

/** RAG 评估结果: 判断是否需要再次检索 */
export interface EvaluateResult {
  need_retrieve: boolean;
  reason: string;
  rewritten_query?: string;
}

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
  // 流式模型实例 (供 chatStream 使用)
  private chatModel: ChatOpenAI;
  // 同步模型实例 (供 chat 使用, 不开启 streaming 避免 invoke 卡死)
  private chatModelSync: ChatOpenAI;

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

    const baseOpts = {
      apiKey: this.apiKey,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      configuration: { baseURL: `${this.baseUrl}/v1` },
    };

    // 流式实例: streaming: true, 供 chatStream() 使用
    this.chatModel = new ChatOpenAI({ ...baseOpts, streaming: true });

    // 同步实例: 不开启 streaming, 供 chat() 的 invoke 使用
    // (LangChain.js 在 streaming: true 时 invoke 会进入流式内部逻辑,
    //  某些版本下回调永不 resolve 导致同步调用卡死)
    this.chatModelSync = new ChatOpenAI(baseOpts);

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
    const chain = this.chatModelSync.pipe(parser);
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

  /**
   * evaluate: 判断 generate 节点的回答是否完整回答了用户问题
   *
   * 用于 RAG Agent ReAct 循环: generate 完成后, 调用本方法决定是否需要再检索一次.
   * 输出 JSON: { need_retrieve, reason, rewritten_query? }
   *
   * 使用非流式同步实例 (chatModelSync), 保证一次 invoke 拿到完整结果.
   * 若 LLM 不支持 response_format 或返回非法 JSON, fallback 到默认 { need_retrieve: false }.
   */
  async evaluateAnswer(
    query: string,
    sources: RagSource[],
    answer: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<EvaluateResult> {
    const sys = `你是一个 RAG 评估器。判断下面的回答是否完整回答了用户的问题。
- 如果回答完整且基于参考资料 → 输出 {"need_retrieve": false, "reason": "回答已完整"}
- 如果回答含糊 / 未基于资料 / 明确说"参考资料不足" / 没有正面回答 → 输出 {"need_retrieve": true, "reason": "...", "rewritten_query": "建议的新查询词"}

只输出 JSON, 不要任何其他文字或代码块包裹。`;

    const context = sources
      .map((s, i) => `[${i + 1}] ${s.content}`)
      .join('\n');

    const messages: BaseMessage[] = [
      new SystemMessage(sys),
      new HumanMessage(
        `用户问题: ${query}\n\n参考资料:\n${context || '(无)'}\n\n历史对话:\n${history.map((m) => `${m.role}: ${m.content}`).join('\n') || '(无)'}\n\n回答:\n${answer}`,
      ),
    ];

    try {
      const res = await this.chatModelSync.invoke(messages, {
        response_format: { type: 'json_object' },
      } as any);
      const text = (res as AIMessage).content as string;
      const parsed = JSON.parse(text);
      return {
        need_retrieve: Boolean(parsed.need_retrieve),
        reason: String(parsed.reason ?? ''),
        rewritten_query: parsed.rewritten_query ? String(parsed.rewritten_query) : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `evaluateAnswer 解析失败, 默认不重试: ${(err as Error).message}`,
      );
      return {
        need_retrieve: false,
        reason: 'evaluate 失败, 默认接受当前回答',
      };
    }
  }
}
