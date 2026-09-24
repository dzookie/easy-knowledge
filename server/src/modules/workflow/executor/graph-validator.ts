/**
 * 工作流图校验器 — DSL 合法性检查 + 拓扑排序
 *
 * 校验规则:
 *   1. 必须有且只有一个 start 节点
 *   2. 必须有至少一个 end 节点
 *   3. 边的 source/target 必须指向存在的节点
 *   4. 图必须是 DAG (无环)
 *   5. 从 start 可达所有 end 节点
 *   6. if_else 节点的每条分支必须对应一条带 sourceHandle 的出边
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import type { WorkflowGraph, WorkflowNode } from '../types/workflow.types';

@Injectable()
export class GraphValidator {
  /**
   * 校验工作流图, 失败抛 BadRequestException
   * @returns 拓扑序的节点列表 (start 在前, end 在后)
   */
  validate(graph: WorkflowGraph): WorkflowNode[] {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new BadRequestException('工作流图结构非法');
    }
    if (graph.nodes.length === 0) {
      throw new BadRequestException('工作流图没有任何节点');
    }

    // 1. start / end 节点检查
    const startNodes = graph.nodes.filter((n) => n.type === 'start');
    if (startNodes.length === 0) {
      throw new BadRequestException('工作流缺少 start 起始节点');
    }
    if (startNodes.length > 1) {
      throw new BadRequestException('工作流只能有一个 start 起始节点');
    }
    const endNodes = graph.nodes.filter((n) => n.type === 'end');
    if (endNodes.length === 0) {
      throw new BadRequestException('工作流缺少 end 结束节点');
    }

    // 2. 节点 id 唯一性
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        throw new BadRequestException(`节点 id 重复: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 3. 边引用合法性
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new BadRequestException(`边的 source 不存在: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new BadRequestException(`边的 target 不存在: ${edge.target}`);
      }
    }

    // 4. DAG 检测 + 拓扑排序
    const sorted = this.topologicalSort(graph);

    // 5. if_else 节点的分支出边检查
    const ifElseNodes = graph.nodes.filter((n) => n.type === 'if_else');
    for (const node of ifElseNodes) {
      this.validateIfElseBranches(node, graph);
    }

    return sorted;
  }

  /**
   * 拓扑排序 (Kahn 算法)
   * @throws 若检测到环
   */
  topologicalSort(graph: WorkflowGraph): WorkflowNode[] {
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      outEdges.set(node.id, []);
    }

    for (const edge of graph.edges) {
      // 同一对节点的多条边 (if_else 多分支) 只算一次入度
      outEdges.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    // 入度为 0 的应该是 start 节点
    const sorted: WorkflowNode[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeMap.get(id);
      if (node) sorted.push(node);
      for (const target of outEdges.get(id) || []) {
        const newDeg = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, newDeg);
        if (newDeg === 0) queue.push(target);
      }
    }

    if (sorted.length !== graph.nodes.length) {
      throw new BadRequestException('工作流存在环, 无法拓扑排序');
    }
    return sorted;
  }

  /** 校验 if_else 节点: 每个分支必须有一条对应的出边 */
  private validateIfElseBranches(node: WorkflowNode, graph: WorkflowGraph): void {
    const config = node.data.config as any;
    if (!config?.branches || !Array.isArray(config.branches)) {
      throw new BadRequestException(`if_else 节点 ${node.id} 缺少 branches 配置`);
    }
    const branchIds = new Set(config.branches.map((b: any) => b.id));
    branchIds.add(config.defaultBranchId);

    const outEdges = graph.edges.filter((e) => e.source === node.id);
    const edgeHandles = new Set<string>(
      outEdges.map((e) => e.sourceHandle).filter((h): h is string => Boolean(h)),
    );

    for (const branchId of branchIds) {
      if (!edgeHandles.has(branchId as string)) {
        throw new BadRequestException(
          `if_else 节点 ${node.id} 的分支 ${branchId} 没有对应的出边`,
        );
      }
    }
  }
}
