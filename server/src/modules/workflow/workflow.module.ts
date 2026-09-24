/**
 * WorkflowModule — 工作流编排器模块
 *
 * 依赖全局模块: PrismaModule / RagModule / LlmModule (均已 @Global)
 * 本模块注册:
 *   - 基础设施: VariableResolver / GraphValidator / NodeHandlerRegistry
 *   - 节点处理器: StartNodeHandler / EndNodeHandler / TemplateNodeHandler /
 *                 LlmNodeHandler / KnowledgeRetrievalNodeHandler
 *   - 核心: WorkflowExecutorService
 *   - 业务: WorkflowService / WorkflowController
 */
import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { VariableResolver } from './executor/variable-resolver';
import { GraphValidator } from './executor/graph-validator';
import { NodeHandlerRegistry } from './executor/node-handler.interface';
import {
  StartNodeHandler,
  EndNodeHandler,
  TemplateNodeHandler,
} from './executor/handlers/simple-handlers';
import { LlmNodeHandler } from './executor/handlers/llm-handler';
import { KnowledgeRetrievalNodeHandler } from './executor/handlers/knowledge-handler';
import { WorkflowExecutorService } from './executor/workflow-executor.service';

@Module({
  controllers: [WorkflowController],
  providers: [
    // 基础设施
    VariableResolver,
    GraphValidator,
    NodeHandlerRegistry,
    // 节点处理器
    StartNodeHandler,
    EndNodeHandler,
    TemplateNodeHandler,
    LlmNodeHandler,
    KnowledgeRetrievalNodeHandler,
    // 核心 + 业务
    WorkflowExecutorService,
    WorkflowService,
  ],
})
export class WorkflowModule {}
