import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Min, Max, IsIn } from 'class-validator';

/**
 * 新增菜单 DTO
 */
export class CreateMenuDto {
  @ApiProperty({ example: '0', description: '父菜单 ID, 0 为根' })
  @IsString()
  parentId!: string;

  @ApiProperty({ example: '新菜单', description: '菜单名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 2, description: '类型: 1目录 2菜单 3按钮' })
  @IsInt()
  @IsIn([1, 2, 3])
  type!: number;

  @ApiPropertyOptional({ example: '/admin/new', description: '路由路径(菜单必填, 目录/按钮可空)' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ example: 'admin/new/index', description: '前端组件路径' })
  @IsOptional()
  @IsString()
  component?: string;

  @ApiPropertyOptional({ example: 'Document', description: '图标名(Element Plus 图标组件名)' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: 'menu:list', description: '权限标识(按钮类型用)' })
  @IsOptional()
  @IsString()
  permission?: string;

  @ApiPropertyOptional({ example: 0, description: '排序, 越小越靠前' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sort?: number;

  @ApiPropertyOptional({ example: 1, description: '是否显示: 1显示 0隐藏' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  visible?: number;

  @ApiPropertyOptional({ example: 1, description: '状态: 1启用 0禁用' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
