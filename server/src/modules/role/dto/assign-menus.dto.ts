import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * 分配菜单 DTO — 传入角色要拥有的菜单 ID 列表(全量覆盖)
 */
export class AssignMenusDto {
  @ApiProperty({ example: ['1', '2', '3'], description: '菜单 ID 列表(全量, 覆盖原有)' })
  @IsString({ each: true })
  menuIds!: string[];
}
