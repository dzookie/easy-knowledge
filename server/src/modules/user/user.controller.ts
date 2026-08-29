import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ResetPasswordDto } from './dto/update-user.dto';
import { CurrentUser, AuthenticatedUser } from '@/common/decorators/current-user.decorator';

/**
 * UserController — 用户管理接口
 * 基路径: /api/user
 *
 * 职责:
 *  - 用户列表/新增/修改/删除(软删除, 不可删除自己)
 *  - 重置密码
 */
@ApiTags('用户')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** 查询全部用户 */
  @Get()
  @ApiOperation({ summary: '查询全部用户', description: '返回用户列表, 含角色信息' })
  async listUsers() {
    return this.userService.listUsers();
  }

  /** 新增用户 */
  @Post()
  @ApiOperation({ summary: '新增用户' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  /** 修改用户(不含密码) */
  @Put(':id')
  @ApiOperation({ summary: '修改用户' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  /** 删除用户(软删除, 不可删除自己) */
  @Delete(':id')
  @ApiOperation({ summary: '删除用户', description: '软删除, 不可删除当前登录用户' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.userService.deleteUser(id, user.id);
  }

  /** 重置密码 */
  @Put(':id/reset-password')
  @ApiOperation({ summary: '重置密码' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto.newPassword);
  }
}
