import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types';
import { MenuItemDto } from './dto/menu-item.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

/**
 * MenuService — 菜单业务逻辑
 *
 * 职责:
 *  - getCurrentUserMenus(): 查询当前登录用户的菜单(树形, 前端侧栏用)
 *  - listAllMenus(): 查询全部菜单(树形, 菜单管理页用, 含按钮权限点 type=3)
 *  - createMenu(): 新增菜单
 *  - updateMenu(): 修改菜单
 *  - deleteMenu(): 删除菜单(级联删除子菜单)
 */
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询当前登录用户的菜单树(侧栏用, 过滤按钮权限点)
   */
  async getCurrentUserMenus(user: AuthenticatedUser): Promise<MenuItemDto[]> {
    const roleId = BigInt(user.roleId);

    // 1. 查 role_menu 关联, 拿到该角色可访问的 menu_id
    const roleMenus = await this.prisma.roleMenu.findMany({
      where: { roleId },
      select: { menuId: true },
    });
    const menuIds = roleMenus.map((rm) => rm.menuId);

    if (menuIds.length === 0) {
      return [];
    }

    // 2. 查 menu 表, 只取可见 + 启用 + 非按钮(type 1,2)
    const menus = await this.prisma.menu.findMany({
      where: {
        id: { in: menuIds },
        visible: 1,
        status: 1,
        type: { in: [1, 2] },
        deletedAt: null,
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });

    return this.buildTree(menus);
  }

  /**
   * 查询全部菜单树(菜单管理页用, 不过滤可见/按钮, 只过滤软删除)
   */
  async listAllMenus(): Promise<MenuItemDto[]> {
    const menus = await this.prisma.menu.findMany({
      where: { deletedAt: null },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return this.buildTree(menus);
  }

  /**
   * 新增菜单
   * 不自动分配权限, 需在「角色权限」页为角色分配
   */
  async createMenu(dto: CreateMenuDto) {
    // 根菜单(parentId=0)只能是目录(type=1)
    if (dto.parentId === '0' && dto.type !== 1) {
      throw new BadRequestException('根菜单只能为目录类型');
    }

    // 校验父菜单是否存在(parentId=0 为根, 跳过)
    if (dto.parentId !== '0') {
      const parent = await this.prisma.menu.findFirst({
        where: { id: BigInt(dto.parentId), deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('父菜单不存在');
      }
    }

    const menu = await this.prisma.menu.create({
      data: {
        parentId: BigInt(dto.parentId),
        name: dto.name,
        type: dto.type,
        path: dto.path || null,
        component: dto.component || null,
        icon: dto.icon || null,
        permission: dto.permission || null,
        sort: dto.sort ?? 0,
        visible: dto.visible ?? 1,
        status: dto.status ?? 1,
      },
    });

    return { id: menu.id.toString() };
  }

  /**
   * 修改菜单
   */
  async updateMenu(id: string, dto: UpdateMenuDto) {
    const menuId = BigInt(id);
    const existing = await this.prisma.menu.findFirst({
      where: { id: menuId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('菜单不存在');
    }

    // 防止把自己设为自己的父菜单
    if (dto.parentId && dto.parentId !== '0' && BigInt(dto.parentId) === menuId) {
      throw new BadRequestException('不能将自己设为父菜单');
    }

    // 根菜单(parentId=0)只能是目录(type=1)
    if (dto.parentId === '0' && dto.type !== undefined && dto.type !== 1) {
      throw new BadRequestException('根菜单只能为目录类型');
    }

    await this.prisma.menu.update({
      where: { id: menuId },
      data: {
        parentId: dto.parentId !== undefined ? BigInt(dto.parentId) : undefined,
        name: dto.name,
        type: dto.type,
        path: dto.path,
        component: dto.component,
        icon: dto.icon,
        permission: dto.permission,
        sort: dto.sort,
        visible: dto.visible,
        status: dto.status,
      },
    });

    return { id };
  }

  /**
   * 删除菜单(软删除, 级联软删除所有子菜单, 清理 role_menu 关联)
   */
  async deleteMenu(id: string) {
    const menuId = BigInt(id);
    const existing = await this.prisma.menu.findFirst({
      where: { id: menuId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('菜单不存在');
    }

    const now = new Date();

    // 收集所有后代 ID(含自身), 批量操作避免 N+1
    const allIds = await this.collectDescendantIds(menuId);
    allIds.push(menuId);

    await this.prisma.$transaction([
      // 批量软删除菜单(自身 + 所有后代)
      this.prisma.menu.updateMany({
        where: { id: { in: allIds } },
        data: { deletedAt: now },
      }),
      // 批量清理 role_menu 关联
      this.prisma.roleMenu.deleteMany({
        where: { menuId: { in: allIds } },
      }),
    ]);

    return { id };
  }

  /**
   * 递归收集所有后代菜单 ID(BFS, 避免深递归栈溢出)
   */
  private async collectDescendantIds(rootId: bigint): Promise<bigint[]> {
    const result: bigint[] = [];
    const queue: bigint[] = [rootId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.prisma.menu.findMany({
        where: { parentId, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }

    return result;
  }

  /**
   * 把扁平菜单列表组装成树形
   */
  private buildTree(
    menus: Array<{
      id: bigint;
      parentId: bigint;
      name: string;
      type: number;
      path: string | null;
      component: string | null;
      icon: string | null;
      permission: string | null;
      sort: number;
      visible: number;
      status: number;
    }>,
  ): MenuItemDto[] {
    const nodeMap = new Map<string, MenuItemDto>();
    const roots: MenuItemDto[] = [];

    for (const m of menus) {
      const node: MenuItemDto = {
        id: m.id.toString(),
        parentId: m.parentId.toString(),
        name: m.name,
        type: m.type,
        path: m.path,
        component: m.component,
        icon: m.icon,
        permission: m.permission,
        sort: m.sort,
        visible: m.visible === 1,
        status: m.status,
        children: [],
      };
      nodeMap.set(node.id, node);
    }

    for (const m of menus) {
      const node = nodeMap.get(m.id.toString())!;
      if (m.parentId === 0n) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(m.parentId.toString());
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    return roots;
  }
}
