import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * 新增用户 DTO
 */
export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan', description: '用户名(登录名)' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

  @ApiProperty({ example: '123456', description: '密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  @ApiPropertyOptional({ example: '张三', description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @ApiPropertyOptional({ example: 'zhangsan@example.com', description: '邮箱(选填, 留空不校验)' })
  @IsOptional()
  @ValidateIf((o) => o.email !== undefined && o.email !== '')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '13800138000', description: '手机号' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: '1', description: '角色 ID' })
  @IsString()
  roleId!: string;

  @ApiPropertyOptional({ example: 1, description: '状态: 1启用 0禁用' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
