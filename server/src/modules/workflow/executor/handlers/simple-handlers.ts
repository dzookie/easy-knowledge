/**
 * 简单节点处理器: start / end / template
 */
import { Injectable } from '@nestjs/common';
import { NodeHandler } from '../node-handler.interface';
import { VariableResolver } from '../variable-resolver';
import type {
  WorkflowNodeType,
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowStreamEvent,
  StartNodeConfig,
  EndNodeConfig,
  TemplateNodeConfig,
} from '../../types/workflow.types';

/** start 节点: 暴露入参作为 outputs */
@Injectable()
export class StartNodeHandler extends NodeHandler {
  readonly type: WorkflowNodeType = 'start';

  async *execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown> {
    const config = ctx.graph.nodes.find((n) => n.id === ctx.currentNodeId)!.data.config as StartNodeConfig;
    const outputs: Record<string, any> = {};
    for (const v of config.variables || []) {
      let val = ctx.inputs[v.name];
      if (val === undefined) val = v.default;
      if (val === undefined && v.required) {
        throw new Error(`缺少必填入参: ${v.name}`);
      }
      outputs[v.name] = val;
    }
    return { inputs: outputs, outputs, durationMs: 0 };
  }
}

/** end 节点: 根据 outputs 配置做变量映射, 结果作为工作流最终输出 */
@Injectable()
export class EndNodeHandler extends NodeHandler {
  readonly type: WorkflowNodeType = 'end';

  constructor(private readonly resolver: VariableResolver) {
    super();
  }

  async *execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown> {
    const config = ctx.graph.nodes.find((n) => n.id === ctx.currentNodeId)!.data.config as EndNodeConfig;
    const outputs: Record<string, any> = {};
    for (const out of config.outputs || []) {
      outputs[out.name] = this.resolver.resolveValue(out.value, ctx.nodeOutputs);
    }
    // 调试兜底: 未配置输出字段时自动汇总上游输出, 便于快速查看全链路数据.
    // 注意: 这里生成的 key 形如 `nodeId.varName`, 属于内部字段名, 不适合作为对外契约;
    // 因此发布时会强制要求显式配置 outputs (见 WorkflowService.assertOutputContract).
    if (Object.keys(outputs).length === 0) {
      for (const [nodeId, nodeOut] of Object.entries(ctx.nodeOutputs)) {
        for (const [key, val] of Object.entries(nodeOut)) {
          if (key.startsWith('_')) continue;
          outputs[`${nodeId}.${key}`] = val;
        }
      }
    }
    return { inputs: outputs, outputs, durationMs: 0 };
  }
}

/** template 节点: 渲染 Mustache 模板, 输出 `result` 变量 */
@Injectable()
export class TemplateNodeHandler extends NodeHandler {
  readonly type: WorkflowNodeType = 'template';

  constructor(private readonly resolver: VariableResolver) {
    super();
  }

  async *execute(ctx: NodeExecutionContext): AsyncGenerator<WorkflowStreamEvent, NodeExecutionResult, unknown> {
    const config = ctx.graph.nodes.find((n) => n.id === ctx.currentNodeId)!.data.config as TemplateNodeConfig;
    const result = this.resolver.resolve(config.template || '', ctx.nodeOutputs);
    return {
      inputs: { template: result },
      outputs: { result },
      durationMs: 0,
    };
  }
}
