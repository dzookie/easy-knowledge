import { PartialType } from '@nestjs/swagger';
import { CreateMenuDto } from './create-menu.dto';

/**
 * 修改菜单 DTO(所有字段可选)
 */
export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
