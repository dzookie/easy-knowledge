import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsInt, IsOptional, Min, Max, MaxLength, IsBoolean } from 'class-validator';

/** 创建 API Key */
export class CreateApiKeyDto {
  @ApiProperty({ description: '用途描述', example: '客服系统接入' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '绑定的知识库 ID' })
  @IsString()
  @IsNotEmpty()
  kbId!: string;

  @ApiPropertyOptional({ description: '每日调用上限', default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyLimit?: number;
}

/** 对外问答接口 */
export class ServiceChatDto {
  @ApiProperty({ description: '用户问题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query!: string;

  @ApiPropertyOptional({ description: '返回切片数', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  topK?: number;

  @ApiPropertyOptional({ description: '相似度阈值 (0-1)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  scoreThreshold?: number;

  @ApiPropertyOptional({ description: '自定义系统提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  systemPrompt?: string;

  @ApiPropertyOptional({ description: '是否流式返回 (SSE)', default: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
