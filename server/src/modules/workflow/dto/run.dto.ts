/**
 * 工作流运行 DTO
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsBoolean } from 'class-validator';

/** 运行工作流 (同步或流式) */
export class RunWorkflowDto {
  @ApiProperty({
    description: '工作流入参 (start 节点声明的变量)',
    example: { query: '如何重置密码?' },
  })
  @IsObject()
  inputs!: Record<string, any>;

  @ApiPropertyOptional({ description: '是否流式返回 (SSE)', default: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
