/**
 * LLM 节点处理器 — 复用 LlmService.chatStream 流式调用大模型
 *
 * 输出变量:
 *   - text: 完整回答文本
 *   - thinking: 完整思考过程 (可选)
 */
import { Injectable } from '@nestjs/common';
import { LlmService } from '@/common/llm/llm.service';
import { NodeHandler } from '../node-handler.interface';
import { VariableResolver } from '../variable-resolver';
import type {
  WorkflowNodeType,
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowStreamEvent,
  LlmNodeConfig,
} from '../../types/workflow.types';

@Injectable()
export class LlmNodeHandler extends NodeHandler {
  readonly type: WorkflowNodeType = 'llm';

  constructor(
    private readonly llm: LlmService,
    private readonly resolver: VariableResolver,
  ) {
    super();
  }

  async *execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown> {
    const startedAt = Date.now();
    const config = ctx.graph.nodes.find((n) => n.id === ctx.currentNodeId)!.data.config as LlmNodeConfig;

    const systemPrompt = this.resolver.resolve(config.systemPrompt || '', ctx.nodeOutputs);
    let userPrompt = this.resolver.resolve(config.userPrompt || '', ctx.nodeOutputs);

    // 兜底: userPrompt 为空时, 自动拼接所有上游节点输出作为输入
    if (!userPrompt.trim()) {
      const parts: string[] = [];
      for (const [nodeId, outputs] of Object.entries(ctx.nodeOutputs)) {
        if (nodeId === ctx.currentNodeId) continue;
        for (const [key, val] of Object.entries(outputs)) {
          if (val == null || key.startsWith('_')) continue;
          const str = typeof val === 'string' ? val : JSON.stringify(val);
          if (str.trim()) parts.push(str);
        }
      }
      userPrompt = parts.join('\n') || '请回答用户的问题';
    }

    // 推送组装后的 prompt (供前端展示)
    yield {
      event: 'prompt',
      data: `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`,
    };

    let thinkingText = '';
    let contentText = '';

    // 流式调用 LLM, 转发 thinking / content 事件
    const stream = this.llm.chatStream(systemPrompt, [{ role: 'user', content: userPrompt }]);
    for await (const chunk of stream) {
      if (chunk.type === 'reasoning') {
        thinkingText += chunk.text;
        yield { event: 'thinking', data: chunk.text };
      } else {
        contentText += chunk.text;
        yield { event: 'content', data: chunk.text };
      }
    }

    return {
      inputs: {
        systemPrompt,
        userPrompt,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 2000,
      },
      outputs: {
        text: contentText,
        thinking: thinkingText,
      },
      durationMs: Date.now() - startedAt,
      // token 统计暂未实现, 预留
      tokenCount: 0,
    };
  }
}
