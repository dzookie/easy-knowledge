import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * UserService — 用户业务逻辑
 *
 * 职责:
 *  - listUsers(): 查询全部用户(含角色信息)
 *  - createUser(): 新增用户(密码 bcrypt 加密)
 *  - updateUser(): 修改用户(不含密码)
 *  - deleteUser(): 删除用户(软删除, 不可删除自己)
 *  - resetPassword(): 重置密码
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** 查询全部用户 */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ id: 'asc' }],
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        phone: true,
        avatar: true,
        roleId: true,
        status: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        role: { select: { code: true, name: true } },
      },
    });

    return users.map((u) => ({
      id: u.id.toString(),
      username: u.username,
      nickname: u.nickname,
      email: u.email,
      phone: u.phone,
      avatar: u.avatar,
      roleId: u.roleId.toString(),
      roleName: u.role.name,
      roleCode: u.role.code,
      status: u.status,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      lastLoginIp: u.lastLoginIp,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /** 新增用户 */
  async createUser(dto: CreateUserDto) {
    // 校验角色是否存在
    const role = await this.prisma.role.findFirst({
      where: { id: BigInt(dto.roleId), deletedAt: null },
    });
    if (!role) {
      throw new BadRequestException('角色不存在');
    }

    // 校验用户名唯一
    const existUsername = await this.prisma.user.findFirst({
      where: { username: dto.username, deletedAt: null },
    });
    if (existUsername) {
      throw new ConflictException('用户名已存在');
    }

    // 校验邮箱唯一(若填写)
    if (dto.email) {
      const existEmail = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (existEmail) {
        throw new ConflictException('邮箱已被使用');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        nickname: dto.nickname || null,
        email: dto.email || null,
        phone: dto.phone || null,
        roleId: BigInt(dto.roleId),
        status: dto.status ?? 1,
      },
    });

    return { id: user.id.toString() };
  }

  /** 修改用户(不含密码) */
  async updateUser(id: string, dto: UpdateUserDto) {
    const userId = BigInt(id);
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    // 校验角色(若修改了角色)
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: BigInt(dto.roleId), deletedAt: null },
      });
      if (!role) {
        throw new BadRequestException('角色不存在');
      }
    }

    // 校验用户名唯一(若修改了用户名)
    if (dto.username && dto.username !== existing.username) {
      const dup = await this.prisma.user.findFirst({
        where: { username: dto.username, deletedAt: null, NOT: { id: userId } },
      });
      if (dup) {
        throw new ConflictException('用户名已存在');
      }
    }

    // 校验邮箱唯一(若修改了邮箱)
    if (dto.email && dto.email !== existing.email) {
      const dup = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null, NOT: { id: userId } },
      });
      if (dup) {
        throw new ConflictException('邮箱已被使用');
      }
    }

    // dto 可能有 password 字段(继承自 CreateUserDto), 这里忽略
    const { password, roleId, ...rest } = dto;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        roleId: roleId ? BigInt(roleId) : undefined,
      },
    });

    return { id };
  }

  /** 删除用户(软删除, 不可删除自己) */
  async deleteUser(id: string, currentUserId: string) {
    const userId = BigInt(id);
    if (userId === BigInt(currentUserId)) {
      throw new BadRequestException('不能删除当前登录用户');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    return { id };
  }

  /** 重置密码 */
  async resetPassword(id: string, newPassword: string) {
    const userId = BigInt(id);
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { id };
  }
}
