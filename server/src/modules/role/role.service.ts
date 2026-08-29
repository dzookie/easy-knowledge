import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignMenusDto } from './dto/assign-menus.dto';

/**
 * RoleService — 角色业务逻辑
 *
 * 职责:
 *  - listRoles(): 查询全部角色
 *  - createRole(): 新增角色
 *  - updateRole(): 修改角色
 *  - deleteRole(): 删除角色(软删除)
 *  - getRoleMenus(): 查询角色已分配的菜单 ID 列表
 *  - assignMenus(): 给角色分配菜单(全量覆盖)
 */
@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  /** 查询全部角色 */
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { users: true, menus: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      name: r.name,
      description: r.description,
      sort: r.sort,
      status: r.status,
      userCount: r._count.users,
      menuCount: r._count.menus,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** 新增角色 */
  async createRole(dto: CreateRoleDto) {
    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description || null,
        sort: dto.sort ?? 0,
        status: dto.status ?? 1,
      },
    });
    return { id: role.id.toString() };
  }

  /** 修改角色 */
  async updateRole(id: string, dto: UpdateRoleDto) {
    const roleId = BigInt(id);
    const existing = await this.prisma.role.findFirst({
      where: { id: roleId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('角色不存在');
    }
    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        sort: dto.sort,
        status: dto.status,
      },
    });
    return { id };
  }

  /** 删除角色(软删除) */
  async deleteRole(id: string) {
    const roleId = BigInt(id);
    const existing = await this.prisma.role.findFirst({
      where: { id: roleId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('角色不存在');
    }
    // 内置角色不允许删除
    if (['admin', 'user'].includes(existing.code)) {
      throw new NotFoundException('内置角色不允许删除');
    }
    await this.prisma.role.update({
      where: { id: roleId },
      data: { deletedAt: new Date() },
    });
    // 清理 role_menu 关联
    await this.prisma.roleMenu.deleteMany({
      where: { roleId },
    });
    return { id };
  }

  /** 查询角色已分配的菜单 ID 列表 */
  async getRoleMenus(id: string): Promise<{ menuIds: string[] }> {
    const roleId = BigInt(id);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, deletedAt: null },
    });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    const roleMenus = await this.prisma.roleMenu.findMany({
      where: { roleId },
      select: { menuId: true },
    });
    return { menuIds: roleMenus.map((rm) => rm.menuId.toString()) };
  }

  /** 给角色分配菜单(全量覆盖) */
  async assignMenus(id: string, dto: AssignMenusDto) {
    const roleId = BigInt(id);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, deletedAt: null },
    });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    // 事务: 先删旧关联, 再插新关联
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId } }),
      this.prisma.roleMenu.createMany({
        data: dto.menuIds.map((mid) => ({
          roleId,
          menuId: BigInt(mid),
        })),
        skipDuplicates: true,
      }),
    ]);

    return { roleId: id, menuCount: dto.menuIds.length };
  }
}
