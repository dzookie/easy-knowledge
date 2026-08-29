import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * 修改用户 DTO
 * 继承自 CreateUserDto 但全部可选, 且排除 password(改密码走 reset-password 接口)
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}

/**
 * 重置密码 DTO
 */
export class ResetPasswordDto {
  @ApiProperty({ example: 'newpass123', description: '新密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
}
