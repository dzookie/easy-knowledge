/**
 * 节点处理器接口
 *
 * 每种节点类型实现此接口, 由 WorkflowExecutorService 在遍历 DAG 时调用.
 * 流式节点 (如 llm) 通过 yield 推送中间事件 (thinking/content/sources/prompt).
 */
import { Injectable } from '@nestjs/common';
import type { WorkflowNodeType, NodeExecutionContext, NodeExecutionResult, WorkflowStreamEvent } from '../types/workflow.types';

/** 节点处理器接口 */
export abstract class NodeHandler {
  /** 节点类型 */
  abstract readonly type: WorkflowNodeType;

  /**
   * 执行节点
   *
   * @param ctx 节点执行上下文
   * @returns AsyncGenerator, yield 中间事件 + 返回最终结果
   */
  abstract execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown>;
}

/** 节点处理器注册表 */
@Injectable()
export class NodeHandlerRegistry {
  private readonly handlers = new Map<WorkflowNodeType, NodeHandler>();

  register(handler: NodeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: WorkflowNodeType): NodeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`未注册的节点类型: ${type}`);
    }
    return handler;
  }

  has(type: WorkflowNodeType): boolean {
    return this.handlers.has(type);
  }
}
