import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Min, Max, IsIn } from 'class-validator';

/**
 * 新增角色 DTO
 */
export class CreateRoleDto {
  @ApiProperty({ example: 'editor', description: '角色编码' })
  @IsString()
  code!: string;

  @ApiProperty({ example: '编辑者', description: '角色名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '可编辑文档', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0, description: '排序' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sort?: number;

  @ApiPropertyOptional({ example: 1, description: '状态: 1启用 0禁用' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
