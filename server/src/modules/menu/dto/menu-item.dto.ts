import { ApiProperty } from '@nestjs/swagger';

/**
 * 菜单项 DTO(树形结构, 用于前端动态渲染侧栏 / 菜单管理表格)
 */
export class MenuItemDto {
  @ApiProperty({ example: '1', description: '菜单 ID' })
  id!: string;

  @ApiProperty({ example: '0', description: '父菜单 ID, 0 为根' })
  parentId!: string;

  @ApiProperty({ example: '主控台', description: '菜单名称' })
  name!: string;

  @ApiProperty({ example: 2, description: '类型: 1目录 2菜单 3按钮' })
  type!: number;

  @ApiProperty({ example: '/admin/dashboard', description: '路由路径', nullable: true })
  path!: string | null;

  @ApiProperty({ example: 'admin/dashboard/index', description: '前端组件路径', nullable: true })
  component!: string | null;

  @ApiProperty({ example: 'Odometer', description: '图标名(Element Plus 图标组件名)', nullable: true })
  icon!: string | null;

  @ApiProperty({ example: 'menu:list', description: '权限标识(按钮类型用)', nullable: true })
  permission!: string | null;

  @ApiProperty({ example: 1, description: '排序' })
  sort!: number;

  @ApiProperty({ example: true, description: '是否显示' })
  visible!: boolean;

  @ApiProperty({ example: 1, description: '状态: 1启用 0禁用' })
  status!: number;

  @ApiProperty({ type: () => [MenuItemDto], description: '子菜单(仅目录有子项)' })
  children!: MenuItemDto[];
}
