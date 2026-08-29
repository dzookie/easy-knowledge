import { ApiProperty } from '@nestjs/swagger';

/**
 * 当前登录用户详情(从 GET /auth/current-user-detail 返回)
 * 包含渲染 Header 所需的全部信息 + 角色信息(用于权限判断)
 */
export class CurrentUserDetailDto {
  @ApiProperty({ example: '1', description: '用户 ID' })
  id!: string;

  @ApiProperty({ example: 'admin', description: '用户名' })
  username!: string;

  @ApiProperty({ example: '超级管理员', description: '昵称', nullable: true })
  nickname!: string | null;

  @ApiProperty({ description: '头像 URL', nullable: true })
  avatar!: string | null;

  @ApiProperty({ example: '1', description: '角色 ID(关联 role 表)' })
  roleId!: string;

  @ApiProperty({ example: 'admin', description: '角色编码: admin / user' })
  role!: string;

  @ApiProperty({ example: '管理员', description: '角色名称(展示用)' })
  roleName!: string;

  @ApiProperty({ example: 'admin@example.com', description: '邮箱', nullable: true })
  email!: string | null;

  @ApiProperty({ example: '13800000000', description: '手机号', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: '2026-08-29T12:00:00.000Z', description: '最后登录时间', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ example: '127.0.0.1', description: '最后登录 IP', nullable: true })
  lastLoginIp!: string | null;
}
