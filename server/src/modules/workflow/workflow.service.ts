/**
 * WorkflowService — 工作流 CRUD + 执行 + 历史
 *
 * 权限: 管理员可见全部, 普通用户仅可见自己创建的工作流.
 */
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '@/common/prisma/prisma.service'
import { AuthenticatedUser } from '@/common/types'
import { WorkflowExecutorService } from './executor/workflow-executor.service'
import { GraphValidator } from './executor/graph-validator'
import { NodeHandlerRegistry } from './executor/node-handler.interface'
import { StartNodeHandler, EndNodeHandler, TemplateNodeHandler } from './executor/handlers/simple-handlers'
import { LlmNodeHandler } from './executor/handlers/llm-handler'
import { KnowledgeRetrievalNodeHandler } from './executor/handlers/knowledge-handler'
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto'
import type { WorkflowGraph, WorkflowStreamEvent, EndNodeConfig } from './types/workflow.types'
import { WorkflowRunStatus } from './types/workflow.types'

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: WorkflowExecutorService,
    private readonly validator: GraphValidator,
    registry: NodeHandlerRegistry,
    startHandler: StartNodeHandler,
    endHandler: EndNodeHandler,
    templateHandler: TemplateNodeHandler,
    llmHandler: LlmNodeHandler,
    knowledgeHandler: KnowledgeRetrievalNodeHandler
  ) {
    // 注册所有节点处理器
    registry.register(startHandler)
    registry.register(endHandler)
    registry.register(templateHandler)
    registry.register(llmHandler)
    registry.register(knowledgeHandler)
    // if_else 不需要 handler, 由 executor 内部处理
  }

  /* ============ CRUD ============ */

  /** 生成业务编码 (8 字节 hex) */
  private generateCode(): string {
    return randomBytes(4).toString('hex')
  }

  /** 列出工作流 (admin 全部, 普通用户仅自己创建的) */
  async list(user: AuthenticatedUser) {
    const where = user.role === 'admin' ? {} : { createdBy: BigInt(user.id) }
    const list = await this.prisma.workflow.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { id: true, username: true, nickname: true, avatar: true } }
      }
    })
    return list.map(w => ({
      id: w.id.toString(),
      code: w.code,
      name: w.name,
      description: w.description,
      version: w.version,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      creator: w.creator
        ? {
            id: w.creator.id.toString(),
            username: w.creator.username,
            nickname: w.creator.nickname,
            avatar: w.creator.avatar
          }
        : null
    }))
  }

  /** 获取工作流详情 (含 graph) */
  async getById(user: AuthenticatedUser, id: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      include: {
        creator: { select: { id: true, username: true, nickname: true, avatar: true } }
      }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    let graph: WorkflowGraph
    try {
      graph = JSON.parse(wf.graph)
    } catch {
      throw new BadRequestException('工作流图解析失败')
    }

    return {
      id: wf.id.toString(),
      code: wf.code,
      name: wf.name,
      description: wf.description,
      version: wf.version,
      status: wf.status,
      graph,
      createdAt: wf.createdAt.toISOString(),
      updatedAt: wf.updatedAt.toISOString(),
      creator: wf.creator
        ? {
            id: wf.creator.id.toString(),
            username: wf.creator.username,
            nickname: wf.creator.nickname,
            avatar: wf.creator.avatar
          }
        : null
    }
  }

  /** 创建工作流 */
  async create(user: AuthenticatedUser, dto: CreateWorkflowDto) {
    // 生成唯一 code
    let code = this.generateCode()
    while (await this.prisma.workflow.findUnique({ where: { code } })) {
      code = this.generateCode()
    }

    const wf = await this.prisma.workflow.create({
      data: {
        code,
        name: dto.name,
        description: dto.description,
        graph: JSON.stringify(dto.graph),
        version: 1,
        status: 0,
        createdBy: BigInt(user.id)
      }
    })
    return { id: wf.id.toString(), code: wf.code }
  }

  /** 更新工作流 */
  async update(user: AuthenticatedUser, id: string, dto: UpdateWorkflowDto) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      select: { id: true, createdBy: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.description !== undefined) data.description = dto.description
    if (dto.graph !== undefined) data.graph = JSON.stringify(dto.graph)

    await this.prisma.workflow.update({
      where: { id: wf.id },
      data
    })
    return { id: wf.id.toString() }
  }

  /** 删除工作流 (软删) */
  async remove(user: AuthenticatedUser, id: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      select: { id: true, createdBy: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    await this.prisma.workflow.update({
      where: { id: wf.id },
      data: { deletedAt: new Date() }
    })
    return { id: wf.id.toString() }
  }

  /* ============ 校验 / 发布 ============ */

  /** 校验工作流图 DSL (不保存) */
  validateGraph(graph: any): { valid: boolean; message: string } {
    try {
      this.validator.validate(graph as WorkflowGraph)
      return { valid: true, message: '校验通过' }
    } catch (err: any) {
      return { valid: false, message: err.message }
    }
  }

  /** 发布工作流 (草稿 → 已发布, version +1) */
  async publish(user: AuthenticatedUser, id: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      select: { id: true, createdBy: true, graph: true, version: true, status: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    // 发布前再校验一次: 图结构 + 输出契约
    try {
      const graph = JSON.parse(wf.graph)
      this.validator.validate(graph)
      this.assertOutputContract(graph)
    } catch (err: any) {
      throw new BadRequestException(`发布失败: ${err.message}`)
    }

    await this.prisma.workflow.update({
      where: { id: wf.id },
      data: { status: 1, version: wf.version + 1 }
    })
    return { id: wf.id.toString(), version: wf.version + 1 }
  }

  /** 输出字段名规范: 字母/数字/下划线, 首字符不能是数字 */
  private static readonly OUTPUT_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

  /**
   * 校验输出契约: 每个 end 节点都必须显式配置输出字段
   *
   * 发布后的工作流要供外部调用, 返回字段名必须稳定可控;
   * 不允许依赖运行时兜底生成的 `nodeId.varName` 这类内部字段名.
   */
  private assertOutputContract(graph: WorkflowGraph) {
    const endNodes = (graph?.nodes || []).filter(n => n.type === 'end')
    if (endNodes.length === 0) return

    for (const node of endNodes) {
      const label = node?.data?.title || node.id
      const outputs = (node?.data?.config as EndNodeConfig | undefined)?.outputs
      if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error(`结束节点「${label}」未配置输出字段; 对外调用需要显式声明返回字段名`)
      }
      for (const out of outputs) {
        const name = String(out?.name || '').trim()
        if (!name) {
          throw new Error(`结束节点「${label}」存在未命名的输出字段`)
        }
        if (!WorkflowService.OUTPUT_NAME_PATTERN.test(name)) {
          throw new Error(`结束节点「${label}」的输出字段名「${name}」不合法; 只能包含字母/数字/下划线, 且首字符不能是数字`)
        }
      }
    }
  }

  /* ============ 运行 ============ */

  /** 同步执行工作流 */
  async run(user: AuthenticatedUser, id: string, inputs: Record<string, any>) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      select: { id: true, createdBy: true, graph: true, name: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    let graph: WorkflowGraph
    try {
      graph = JSON.parse(wf.graph)
    } catch {
      throw new BadRequestException('工作流图解析失败')
    }

    // 创建运行记录
    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        graphSnapshot: wf.graph,
        inputs: JSON.stringify(inputs),
        status: WorkflowRunStatus.RUNNING,
        trigger: 'manual',
        executedBy: BigInt(user.id),
        startedAt: new Date()
      }
    })

    const startedAt = Date.now()
    let result
    try {
      // 同步消费所有事件, 取最终结果
      const gen = this.executor.execute(graph, inputs)
      let final: any
      while (true) {
        const { value, done } = await gen.next()
        if (done) {
          final = value
          break
        }
      }
      result = final
    } catch (err: any) {
      result = {
        outputs: {},
        durationMs: Date.now() - startedAt,
        status: WorkflowRunStatus.FAILED,
        errorMsg: err.message,
        nodeTrace: []
      }
    }

    // 更新运行记录
    await this.prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        outputs: JSON.stringify(result.outputs),
        status: result.status,
        errorMsg: result.errorMsg,
        nodeTrace: JSON.stringify(result.nodeTrace),
        durationMs: result.durationMs,
        finishedAt: new Date()
      }
    })

    return {
      runId: run.id.toString(),
      outputs: result.outputs,
      status: result.status,
      errorMsg: result.errorMsg,
      durationMs: result.durationMs,
      nodeTrace: result.nodeTrace
    }
  }

  /** 流式执行工作流, 返回 AsyncGenerator<WorkflowStreamEvent> */
  async *runStream(user: AuthenticatedUser, id: string, inputs: Record<string, any>): AsyncGenerator<WorkflowStreamEvent, void, unknown> {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      select: { id: true, createdBy: true, graph: true, name: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    let graph: WorkflowGraph
    try {
      graph = JSON.parse(wf.graph)
    } catch {
      throw new BadRequestException('工作流图解析失败')
    }

    // 创建运行记录
    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        graphSnapshot: wf.graph,
        inputs: JSON.stringify(inputs),
        status: WorkflowRunStatus.RUNNING,
        trigger: 'manual',
        executedBy: BigInt(user.id),
        startedAt: new Date()
      }
    })

    yield {
      event: 'workflow_start',
      data: { runId: run.id.toString(), graph }
    }

    const startedAt = Date.now()
    let finalResult: any = {
      outputs: {},
      durationMs: 0,
      status: WorkflowRunStatus.FAILED,
      errorMsg: '未知错误',
      nodeTrace: []
    }

    try {
      // 委托执行器 generator, 所有事件透传给上层 SSE
      const gen = this.executor.execute(graph, inputs)
      while (true) {
        const { value, done } = await gen.next()
        if (done) {
          finalResult = value
          break
        }
        yield value as WorkflowStreamEvent
      }
    } catch (err: any) {
      finalResult.errorMsg = err.message
      yield { event: 'error', data: { message: err.message } }
    }

    // 推送 workflow_finish
    yield {
      event: 'workflow_finish',
      data: {
        outputs: finalResult.outputs,
        durationMs: Date.now() - startedAt
      }
    }

    // 更新运行记录
    await this.prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        outputs: JSON.stringify(finalResult.outputs),
        status: finalResult.status,
        errorMsg: finalResult.errorMsg,
        nodeTrace: JSON.stringify(finalResult.nodeTrace),
        durationMs: Date.now() - startedAt,
        finishedAt: new Date()
      }
    })
  }

  /* ============ 运行历史 ============ */

  /** 列出工作流的运行历史 */
  async listRuns(user: AuthenticatedUser, workflowId: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: BigInt(workflowId), deletedAt: null },
      select: { id: true, createdBy: true }
    })
    if (!wf) throw new NotFoundException('工作流不存在')
    this.checkAccess(user, wf.createdBy)

    const runs = await this.prisma.workflowRun.findMany({
      where: { workflowId: wf.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        durationMs: true,
        totalTokens: true,
        trigger: true,
        errorMsg: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        executor: { select: { id: true, username: true, nickname: true } }
      }
    })
    return runs.map(r => ({
      id: r.id.toString(),
      status: r.status,
      durationMs: r.durationMs,
      totalTokens: r.totalTokens,
      trigger: r.trigger,
      errorMsg: r.errorMsg,
      startedAt: r.startedAt?.toISOString() || null,
      finishedAt: r.finishedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      executor: r.executor
        ? {
            id: r.executor.id.toString(),
            username: r.executor.username,
            nickname: r.executor.nickname
          }
        : null
    }))
  }

  /** 获取运行详情 (含 nodeTrace) */
  async getRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: BigInt(runId) },
      include: {
        workflow: { select: { id: true, name: true, createdBy: true } },
        executor: { select: { id: true, username: true, nickname: true } }
      }
    })
    if (!run) throw new NotFoundException('运行记录不存在')
    this.checkAccess(user, run.workflow.createdBy)

    let nodeTrace: any[] = []
    let outputs: any = {}
    let inputs: any = {}
    try {
      nodeTrace = run.nodeTrace ? JSON.parse(run.nodeTrace) : []
    } catch {
      // ignore parse error
    }
    try {
      outputs = run.outputs ? JSON.parse(run.outputs) : {}
    } catch {
      // ignore
    }
    try {
      inputs = run.inputs ? JSON.parse(run.inputs) : {}
    } catch {
      // ignore
    }

    return {
      id: run.id.toString(),
      workflowId: run.workflowId.toString(),
      workflowName: run.workflow.name,
      status: run.status,
      errorMsg: run.errorMsg,
      inputs,
      outputs,
      nodeTrace,
      durationMs: run.durationMs,
      totalTokens: run.totalTokens,
      trigger: run.trigger,
      startedAt: run.startedAt?.toISOString() || null,
      finishedAt: run.finishedAt?.toISOString() || null,
      createdAt: run.createdAt.toISOString(),
      executor: run.executor
        ? {
            id: run.executor.id.toString(),
            username: run.executor.username,
            nickname: run.executor.nickname
          }
        : null
    }
  }

  /* ============ 权限 ============ */

  private checkAccess(user: AuthenticatedUser, createdBy: bigint) {
    if (user.role !== 'admin' && createdBy.toString() !== user.id) {
      throw new ForbiddenException('无权访问该工作流')
    }
  }
}
