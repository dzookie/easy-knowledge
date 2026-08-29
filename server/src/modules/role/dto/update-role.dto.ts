import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

/**
 * 修改角色 DTO
 */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
