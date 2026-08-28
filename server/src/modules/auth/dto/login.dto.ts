import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * 登录请求 DTO
 */
export class LoginDto {
  @ApiProperty({ example: 'admin', description: '用户名' })
  @IsString()
  @MinLength(3, { message: '用户名至少 3 个字符' })
  @MaxLength(32, { message: '用户名最多 32 个字符' })
  username!: string;

  @ApiProperty({ example: 'admin123', description: '密码' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 个字符' })
  @MaxLength(64, { message: '密码最多 64 个字符' })
  password!: string;
}
