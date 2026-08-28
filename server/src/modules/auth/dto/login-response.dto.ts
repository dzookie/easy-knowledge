import { ApiProperty } from '@nestjs/swagger';

/**
 * 登录成功响应
 */
export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'JWT token' })
  token!: string;

  @ApiProperty({ description: '用户信息' })
  user!: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
    role: string;
  };
}
