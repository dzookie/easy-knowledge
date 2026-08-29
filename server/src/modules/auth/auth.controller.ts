import { Controller, Post, Get, Body, Ip } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { CurrentUserDetailDto } from './dto/current-user-detail.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '@/common/decorators/current-user.decorator';

/**
 * AuthController — 认证接口
 * 基路径: /api/auth
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户登录
   * 仅返回 token, 用户信息走 /auth/current-user-detail
   */
  @Public()
  @Post('login')
  @ApiOperation({ summary: '用户登录', description: '通过用户名和密码登录, 仅返回 JWT token' })
  @SwaggerApiResponse({ status: 200, description: '登录成功', type: LoginResponseDto })
  @SwaggerApiResponse({ status: 401, description: '用户名或密码错误 / 账号被禁用' })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  /**
   * 获取当前登录用户详情
   * 前端在进入后台前调用, 用于刷新用户信息 + 权限判断
   */
  @Get('current-user-detail')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取当前登录用户详情', description: '根据 token 解析当前登录用户信息, 用于刷新前端缓存的用户状态' })
  @SwaggerApiResponse({ status: 200, description: '用户详情', type: CurrentUserDetailDto })
  @SwaggerApiResponse({ status: 401, description: 'token 无效或已过期' })
  async getCurrentUserDetail(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUserDetail({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
  }
}
