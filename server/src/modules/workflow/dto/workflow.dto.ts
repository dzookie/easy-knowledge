/**
 * 工作流 CRUD DTO
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

/** 创建工作流 */
export class CreateWorkflowDto {
  @ApiProperty({ description: '工作流名称', example: '客服问答工作流' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: '工作流图 DSL (含 nodes / edges / version)',
    example: { version: '1.0', nodes: [], edges: [] },
  })
  @IsObject()
  graph!: any;
}

/** 更新工作流 */
export class UpdateWorkflowDto {
  @ApiPropertyOptional({ description: '工作流名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: '工作流图 DSL' })
  @IsOptional()
  @IsObject()
  graph?: any;
}

/** 校验工作流图 DSL (无需保存) */
export class ValidateWorkflowDto {
  @ApiProperty({ description: '工作流图 DSL' })
  @IsObject()
  graph!: any;
}
