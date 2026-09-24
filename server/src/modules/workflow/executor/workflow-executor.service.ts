/**
 * 工作流执行器 — 核心服务
 *
 * 职责:
 *   1. 拓扑遍历 DAG
 *   2. 对每个节点调用对应的 NodeHandler
 *   3. 处理 if_else 条件分支 (内部计算, 不走 handler)
 *   4. 流式转发节点事件 (sources/prompt/thinking/content 等)
 *   5. 记录节点执行轨迹 (nodeTrace)
 *
 * 本期 MVP 采用手写遍历而非 LangGraph, 保持流式输出的可控性.
 */
import { Injectable, Logger } from '@nestjs/common';
import { NodeHandlerRegistry } from './node-handler.interface';
import { GraphValidator } from './graph-validator';
import { VariableResolver } from './variable-resolver';
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowStreamEvent,
  IfElseNodeConfig,
} from '../types/workflow.types';
import { WorkflowRunStatus } from '../types/workflow.types';

/** 节点执行轨迹条目 */
export interface NodeTraceEntry {
  nodeId: string;
  type: string;
  title: string;
  status: number; // 0=待执行 1=运行中 2=成功 3=失败
  durationMs: number;
  /** 节点实际消费的输入 */
  inputs?: Record<string, any>;
  outputs: Record<string, any>;
  errorMsg?: string;
}

/** 执行结果 */
export interface WorkflowExecutionResult {
  outputs: Record<string, any>;
  durationMs: number;
  status: WorkflowRunStatus;
  errorMsg?: string;
  nodeTrace: NodeTraceEntry[];
}

@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly registry: NodeHandlerRegistry,
    private readonly validator: GraphValidator,
    private readonly resolver: VariableResolver,
  ) {}

  /**
   * 流式执行工作流
   *
   * @param graph 工作流图 DSL
   * @param inputs 起始节点入参
   * @returns AsyncGenerator, yield 工作流事件, 最后返回执行结果
   */
  async *execute(
    graph: WorkflowGraph,
    inputs: Record<string, any>,
  ): AsyncGenerator<WorkflowStreamEvent, WorkflowExecutionResult, unknown> {
    const startedAt = Date.now();
    const nodeTrace: NodeTraceEntry[] = [];
    const nodeOutputs: Record<string, Record<string, any>> = {};

    // 1. 校验 + 拓扑排序
    let sortedNodes: WorkflowNode[];
    try {
      sortedNodes = this.validator.validate(graph);
    } catch (err: any) {
      yield { event: 'error', data: { message: err.message } };
      return {
        outputs: {},
        durationMs: Date.now() - startedAt,
        status: WorkflowRunStatus.FAILED,
        errorMsg: err.message,
        nodeTrace,
      };
    }

    // 2. 构建邻接表 (sourceHandle 分支支持)
    const adjacency = new Map<string, WorkflowEdge[]>();
    for (const node of graph.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of graph.edges) {
      adjacency.get(edge.source)?.push(edge);
    }

    // 3. 按拓扑序执行, 用 reachable 集合跟踪可达节点 (支持并行分支)
    const startNode = sortedNodes.find((n) => n.type === 'start')!;
    const reachable = new Set<string>([startNode.id]);
    let lastError: string | undefined;

    for (const currentNode of sortedNodes) {
      if (!reachable.has(currentNode.id)) continue;
      const nodeId = currentNode.id;
      const nodeTitle = currentNode.data?.title || nodeId;

      // end 节点特殊处理: 计算 outputs
      if (currentNode.type === 'end') {
        const traceEntry: NodeTraceEntry = {
          nodeId,
          type: currentNode.type,
          title: nodeTitle,
          status: 1,
          durationMs: 0,
          outputs: {},
        };

        yield {
          event: 'node_start',
          data: { nodeId, nodeType: currentNode.type, title: nodeTitle },
        };

        try {
          const handler = this.registry.get('end');
          const ctx: NodeExecutionContext = {
            graph,
            inputs,
            nodeOutputs,
            currentNodeId: nodeId,
          };
          const result = yield* handler.execute(ctx);
          nodeOutputs[nodeId] = result.outputs;
          traceEntry.status = 2;
          traceEntry.durationMs = result.durationMs;
          traceEntry.inputs = result.inputs;
          traceEntry.outputs = result.outputs;
          nodeTrace.push(traceEntry);

          yield {
            event: 'node_finish',
            data: { nodeId, inputs: result.inputs, outputs: result.outputs, durationMs: result.durationMs },
          };
        } catch (err: any) {
          traceEntry.status = 3;
          traceEntry.errorMsg = err.message;
          nodeTrace.push(traceEntry);
          lastError = err.message;
          yield { event: 'node_error', data: { nodeId, message: err.message } };
          break;
        }
        // end 节点无后续
        continue;
      }

      // if_else 节点: 内部计算分支, 不走 handler
      if (currentNode.type === 'if_else') {
        const traceEntry: NodeTraceEntry = {
          nodeId,
          type: currentNode.type,
          title: nodeTitle,
          status: 1,
          durationMs: 0,
          outputs: {},
        };

        yield {
          event: 'node_start',
          data: { nodeId, nodeType: currentNode.type, title: nodeTitle },
        };

        try {
          const branchId = this.resolveIfElseBranch(currentNode, nodeOutputs);
          traceEntry.status = 2;
          traceEntry.inputs = this.buildIfElseInputs(currentNode, nodeOutputs);
          traceEntry.outputs = { _branchId: branchId };
          nodeTrace.push(traceEntry);

          yield {
            event: 'node_finish',
            data: { nodeId, inputs: traceEntry.inputs, outputs: traceEntry.outputs, durationMs: 0 },
          };

          // 只将命中分支的目标标记为可达
          const nextEdge = (adjacency.get(nodeId) || []).find((e) => e.sourceHandle === branchId);
          if (nextEdge) reachable.add(nextEdge.target);
          continue;
        } catch (err: any) {
          traceEntry.status = 3;
          traceEntry.errorMsg = err.message;
          nodeTrace.push(traceEntry);
          lastError = err.message;
          yield { event: 'node_error', data: { nodeId, message: err.message } };
          break;
        }
      }

      // 其他节点: 调用 handler (用 yield* 委托, 透传 sources/prompt/thinking/content)
      const traceEntry: NodeTraceEntry = {
        nodeId,
        type: currentNode.type,
        title: nodeTitle,
        status: 1,
        durationMs: 0,
        outputs: {},
      };

      yield {
        event: 'node_start',
        data: { nodeId, nodeType: currentNode.type, title: nodeTitle },
      };

      try {
        const handler = this.registry.get(currentNode.type);
        const ctx: NodeExecutionContext = {
          graph,
          inputs,
          nodeOutputs,
          currentNodeId: nodeId,
        };
        // 用 yield* 委托 handler 的 AsyncGenerator,
        // 让 handler 内部的 sources/prompt/thinking/content 直接透传到外层 SSE.
        // yield* 表达式的返回值就是被委托 generator 的 return 值.
        const result = yield* handler.execute(ctx);
        nodeOutputs[nodeId] = result.outputs;
        traceEntry.status = 2;
        traceEntry.durationMs = result.durationMs;
        traceEntry.inputs = this.sanitizeTraceOutputs(result.inputs || {});
        traceEntry.outputs = this.sanitizeTraceOutputs(result.outputs);
        nodeTrace.push(traceEntry);

        yield {
          event: 'node_finish',
          data: { nodeId, inputs: traceEntry.inputs, outputs: traceEntry.outputs, durationMs: result.durationMs },
        };
      } catch (err: any) {
        traceEntry.status = 3;
        traceEntry.errorMsg = err.message;
        nodeTrace.push(traceEntry);
        lastError = err.message;
        yield { event: 'node_error', data: { nodeId, message: err.message } };
        break;
      }

      // 将所有出边目标标记为可达 (支持并行分支)
      for (const edge of adjacency.get(nodeId) || []) {
        reachable.add(edge.target);
      }
    }

    // 4. 收集最终输出 (所有 end 节点的 outputs)
    const endNodes = graph.nodes.filter((n) => n.type === 'end');
    const finalOutputs: Record<string, any> = {};
    for (const endNode of endNodes) {
      const out = nodeOutputs[endNode.id];
      if (out) Object.assign(finalOutputs, out);
    }

    const status: WorkflowRunStatus = lastError ? WorkflowRunStatus.FAILED : WorkflowRunStatus.SUCCESS;

    return {
      outputs: finalOutputs,
      durationMs: Date.now() - startedAt,
      status,
      errorMsg: lastError,
      nodeTrace,
    };
  }

  /**
   * 构建 if_else 节点的输入快照 (各条件左右值解析结果 + 命中分支)
   */
  private buildIfElseInputs(
    node: WorkflowNode,
    nodeOutputs: Record<string, Record<string, any>>,
  ): Record<string, any> {
    const config = node.data.config as IfElseNodeConfig;
    const conditions: Record<string, any> = {};
    for (const branch of config.branches || []) {
      for (const cond of branch.conditions || []) {
        const left = this.resolver.resolveValue(cond.left, nodeOutputs);
        const right = this.resolver.resolveValue(cond.right, nodeOutputs);
        conditions[`${branch.id}.${cond.left} ${cond.operator} ${cond.right}`] =
          `${JSON.stringify(left)} ${cond.operator} ${JSON.stringify(right)}`;
      }
    }
    return conditions;
  }

  /**
   * 计算 if_else 节点的分支
   * @returns 命中的分支 id (或 defaultBranchId)
   */
  private resolveIfElseBranch(
    node: WorkflowNode,
    nodeOutputs: Record<string, Record<string, any>>,
  ): string {
    const config = node.data.config as IfElseNodeConfig;
    for (const branch of config.branches || []) {
      const allMatch = (branch.conditions || []).every((cond) => {
        const left = this.resolver.resolveValue(cond.left, nodeOutputs);
        const right = this.resolver.resolveValue(cond.right, nodeOutputs);
        return this.compare(left, cond.operator, right);
      });
      if (allMatch && (branch.conditions || []).length > 0) {
        return branch.id;
      }
    }
    return config.defaultBranchId;
  }

  /** 条件比较 */
  private compare(left: any, operator: string, right: any): boolean {
    try {
      switch (operator) {
        case '==': return String(left) === String(right);
        case '!=': return String(left) !== String(right);
        case '>': return Number(left) > Number(right);
        case '<': return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
        case 'contains': return String(left).includes(String(right));
        case 'not_contains': return !String(left).includes(String(right));
        case 'starts_with': return String(left).startsWith(String(right));
        case 'ends_with': return String(left).endsWith(String(right));
        default: return false;
      }
    } catch {
      return false;
    }
  }

  /** 清理 trace 中的 outputs (避免过大, 截断 sources 等) */
  private sanitizeTraceOutputs(outputs: Record<string, any>): Record<string, any> {
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(outputs)) {
      if (Array.isArray(value)) {
        safe[key] = `[Array: ${value.length} items]`;
      } else if (typeof value === 'string' && value.length > 500) {
        safe[key] = value.slice(0, 500) + '...';
      } else {
        safe[key] = value;
      }
    }
    return safe;
  }
}
