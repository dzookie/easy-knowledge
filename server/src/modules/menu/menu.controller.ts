import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { MenuItemDto } from './dto/menu-item.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types';

/**
 * MenuController — 菜单接口
 * 基路径: /api/menu
 */
@ApiTags('菜单')
@ApiBearerAuth('JWT-auth')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * 获取当前登录用户的菜单树(侧栏用)
   */
  @Get('current-user-menus')
  @ApiOperation({ summary: '获取当前登录用户的菜单树', description: '根据当前用户角色返回可见菜单(树形结构)' })
  @SwaggerApiResponse({ status: 200, description: '菜单树', type: () => [MenuItemDto] })
  async getCurrentUserMenus(@CurrentUser() user: AuthenticatedUser): Promise<MenuItemDto[]> {
    return this.menuService.getCurrentUserMenus(user);
  }

  /**
   * 获取全部菜单树(菜单管理页用, 含禁用/隐藏/按钮权限点)
   */
  @Get()
  @ApiOperation({ summary: '获取全部菜单树', description: '返回全部菜单(树形, 含按钮权限点, 菜单管理页用)' })
  @SwaggerApiResponse({ status: 200, description: '菜单树', type: () => [MenuItemDto] })
  async listAllMenus(): Promise<MenuItemDto[]> {
    return this.menuService.listAllMenus();
  }

  /**
   * 新增菜单
   */
  @Post()
  @ApiOperation({ summary: '新增菜单', description: '不自动分配权限, 需在角色权限页分配' })
  async create(@Body() dto: CreateMenuDto) {
    return this.menuService.createMenu(dto);
  }

  /**
   * 修改菜单
   */
  @Put(':id')
  @ApiOperation({ summary: '修改菜单' })
  async update(@Param('id') id: string, @Body() dto: UpdateMenuDto) {
    return this.menuService.updateMenu(id, dto);
  }

  /**
   * 删除菜单(级联删除子菜单)
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除菜单', description: '软删除, 级联删除所有子菜单, 清理 role_menu 关联' })
  async remove(@Param('id') id: string) {
    return this.menuService.deleteMenu(id);
  }
}
