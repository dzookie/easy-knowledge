import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const asStringOrUndefined = (v: any): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s !== '' ? s : undefined;
};

export class DocumentListQueryDto {
  @ApiProperty({ description: '知识库 ID', example: '1' })
  @Transform(({ value }) => asStringOrUndefined(value))
  @IsString()
  @IsOptional()
  kbId?: string;

  @ApiProperty({ description: '页码, 从 1 开始', example: 1, required: false, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ description: '每页条数', example: 20, required: false, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  pageSize?: number = 20;

  @ApiProperty({ description: '文件名关键词 (模糊匹配)', required: false })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined))
  @IsString()
  @IsOptional()
  keyword?: string;
}
