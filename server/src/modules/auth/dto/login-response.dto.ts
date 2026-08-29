import { ApiProperty } from '@nestjs/swagger';

/**
 * 登录成功响应(仅返回 token,用户信息走 /auth/current-user-detail)
 */
export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'JWT token' })
  token!: string;
}
