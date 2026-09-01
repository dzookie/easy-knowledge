import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class RetrieveDto {
  @ApiProperty({ description: '知识库 ID' })
  @IsString()
  @IsNotEmpty({ message: 'kbId 不能为空' })
  kbId!: string;

  @ApiProperty({ description: '检索问题/关键词' })
  @IsString()
  @IsNotEmpty({ message: 'query 不能为空' })
  query!: string;

  @ApiPropertyOptional({ description: '返回结果数 (top-K)', default: 5, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  topK?: number = 5;

  @ApiPropertyOptional({ description: '相似度阈值 (0~1, 低于此分数不返回)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  scoreThreshold?: number = 0;
}
