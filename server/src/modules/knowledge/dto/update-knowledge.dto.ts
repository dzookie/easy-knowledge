import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

/**
 * 修改知识库 DTO
 * 可修改字段: name / description / chunk* / visibility / status
 */
export class UpdateKnowledgeDto {
  @ApiPropertyOptional({ example: '产品文档知识库', description: '知识库名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '存放公司产品相关文档', description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'recursive', description: '切片策略' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  chunkStrategy?: string;

  @ApiPropertyOptional({ example: 500, description: '切片大小' })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(10000)
  chunkSize?: number;

  @ApiPropertyOptional({ example: 50, description: '切片重叠' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  chunkOverlap?: number;

  @ApiPropertyOptional({ example: 0, description: '可见性: 0 私有 / 1 团队(预留) / 2 公开(预留)' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  visibility?: number;

  @ApiPropertyOptional({ example: 1, description: '状态: 1 启用 / 0 禁用' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
