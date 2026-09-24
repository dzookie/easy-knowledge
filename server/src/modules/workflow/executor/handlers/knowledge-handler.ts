/**
 * 知识检索节点处理器 — 复用 RagService.retrieve
 *
 * 输出变量:
 *   - sources: RagSource[] 完整切片
 *   - context: 拼接后的上下文文本 (供 LLM 节点直接引用)
 */
import { Injectable } from '@nestjs/common';
import { RagService, type RagSource } from '@/common/rag/rag.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NodeHandler } from '../node-handler.interface';
import { VariableResolver } from '../variable-resolver';
import type {
  WorkflowNodeType,
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowStreamEvent,
  KnowledgeRetrievalNodeConfig,
} from '../../types/workflow.types';

@Injectable()
export class KnowledgeRetrievalNodeHandler extends NodeHandler {
  readonly type: WorkflowNodeType = 'knowledge_retrieval';

  constructor(
    private readonly rag: RagService,
    private readonly prisma: PrismaService,
    private readonly resolver: VariableResolver,
  ) {
    super();
  }

  async *execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown> {
    const startedAt = Date.now();
    const config = ctx.graph.nodes.find((n) => n.id === ctx.currentNodeId)!.data.config as KnowledgeRetrievalNodeConfig;

    // 1. 校验知识库存在性 + 取 collection 名
    const kbId = BigInt(config.kbId);
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: kbId, deletedAt: null },
      select: { id: true, collection: true, name: true },
    });
    if (!kb) {
      throw new Error(`知识库不存在: ${config.kbId}`);
    }

    // 2. 解析 query 模板, 为空时自动兜底取上游节点输出
    let query = this.resolver.resolve(config.query || '', ctx.nodeOutputs);
    if (!query.trim()) {
      const parts: string[] = [];
      for (const [nodeId, outputs] of Object.entries(ctx.nodeOutputs)) {
        if (nodeId === ctx.currentNodeId) continue;
        for (const [key, val] of Object.entries(outputs)) {
          if (val == null || key.startsWith('_')) continue;
          const str = typeof val === 'string' ? val : JSON.stringify(val);
          if (str.trim()) parts.push(str);
        }
      }
      query = parts.join('\n');
    }
    if (!query.trim()) {
      throw new Error('知识检索节点的 query 为空, 且无上游节点输出可用');
    }

    // 3. 调用 RagService.retrieve
    const sources: RagSource[] = await this.rag.retrieve(
      kb.collection,
      query,
      config.topK ?? 5,
      config.scoreThreshold ?? 0,
    );

    // 4. 推送 sources 事件 (前端展示检索结果)
    yield {
      event: 'sources',
      data: sources.map((s) => ({
        fileName: s.fileName,
        chunkIndex: s.chunkIndex,
        score: s.score,
        content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
      })),
    };

    // 5. 拼接 context 文本
    const context = sources
      .map((s, i) => `[${i + 1}] 来源: ${s.fileName} (切片 ${s.chunkIndex})\n内容: ${s.content}`)
      .join('\n\n');

    return {
      inputs: {
        query,
        kbName: kb.name,
        topK: config.topK ?? 5,
        scoreThreshold: config.scoreThreshold ?? 0,
      },
      outputs: {
        sources,
        context,
        query,
      },
      durationMs: Date.now() - startedAt,
    };
  }
}
