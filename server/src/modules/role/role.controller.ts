import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignMenusDto } from './dto/assign-menus.dto';

/**
 * RoleController — 角色与权限分配接口
 * 基路径: /api/role
 *
 * 职责:
 *  - 角色列表/新增/修改/删除
 *  - 查询角色已分配菜单 / 给角色分配菜单(全量覆盖)
 */
@ApiTags('角色')
@ApiBearerAuth('JWT-auth')
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 查询全部角色
   */
  @Get()
  @ApiOperation({ summary: '查询全部角色', description: '返回角色列表, 含关联用户数与菜单数' })
  async listRoles() {
    return this.roleService.listRoles();
  }

  /**
   * 新增角色
   */
  @Post()
  @ApiOperation({ summary: '新增角色' })
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.createRole(dto);
  }

  /**
   * 修改角色
   */
  @Put(':id')
  @ApiOperation({ summary: '修改角色' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.updateRole(id, dto);
  }

  /**
   * 删除角色(软删除, 内置角色不允许删除)
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除角色', description: '软删除, 内置角色(admin/user)不允许删除' })
  async remove(@Param('id') id: string) {
    return this.roleService.deleteRole(id);
  }

  /**
   * 查询角色已分配的菜单 ID 列表
   */
  @Get(':id/menus')
  @ApiOperation({ summary: '查询角色已分配的菜单 ID 列表', description: '用于角色权限页回显已勾选菜单' })
  @SwaggerApiResponse({ status: 200, description: '菜单 ID 列表' })
  async getRoleMenus(@Param('id') id: string) {
    return this.roleService.getRoleMenus(id);
  }

  /**
   * 给角色分配菜单(全量覆盖)
   */
  @Put(':id/menus')
  @ApiOperation({ summary: '给角色分配菜单', description: '全量覆盖角色菜单权限, 传入需勾选的完整菜单 ID 列表' })
  async assignMenus(@Param('id') id: string, @Body() dto: AssignMenusDto) {
    return this.roleService.assignMenus(id, dto);
  }
}
