import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
 * 新增知识库 DTO
 */
export class CreateKnowledgeDto {
  @ApiProperty({ example: '产品文档知识库', description: '知识库名称' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '存放公司产品相关文档', description: '描述(选填)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'bge-m3',
    description: '向量模型, 默认 bge-m3',
    default: 'bge-m3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  embeddingModel?: string;

  @ApiPropertyOptional({
    example: 'recursive',
    description: '切片策略: recursive / semantic / fixed, 默认 recursive',
    default: 'recursive',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  chunkStrategy?: string;

  @ApiPropertyOptional({ example: 500, description: '切片大小, 默认 500', default: 500 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(10000)
  chunkSize?: number;

  @ApiPropertyOptional({ example: 50, description: '切片重叠, 默认 50', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  chunkOverlap?: number;

  @ApiPropertyOptional({
    example: 0,
    description: '可见性: 0 私有 / 1 团队(预留) / 2 公开(预留), 默认 0',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  visibility?: number;
}
