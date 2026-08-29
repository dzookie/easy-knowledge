/**
 * 种子脚本 — 创建默认角色 + 管理员账号
 * 执行: npm run db:seed
 *
 * 顺序: 先创建 role, 再创建 user(因为 user.role_id 外键关联 role.id)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. 创建角色(如果已存在则跳过)
  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: {},
    create: {
      code: 'admin',
      name: '管理员',
      description: '系统管理员,拥有全部权限',
      sort: 0,
      status: 1,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { code: 'user' },
    update: {},
    create: {
      code: 'user',
      name: '知识库用户',
      description: '可创建/管理自有知识库、上传文档、配置切片、调用问答 API',
      sort: 1,
      status: 1,
    },
  });

  console.log('✅ 角色创建成功:');
  console.log(`  - ${adminRole.code} (${adminRole.name})  id=${adminRole.id}`);
  console.log(`  - ${userRole.code} (${userRole.name})  id=${userRole.id}`);

  // 2. 创建管理员账号(关联 admin 角色)
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      nickname: '超级管理员',
      roleId: adminRole.id,
      status: 1,
    },
    include: { role: true },
  });

  console.log('✅ 管理员账号创建成功:');
  console.log('----------------------------------------');
  console.log(`  用户名:   ${admin.username}`);
  console.log(`  密码:     admin123`);
  console.log(`  角色:     ${admin.role.code} (${admin.role.name})`);
  console.log(`  role_id:  ${admin.roleId}`);
  console.log('----------------------------------------');
}

main()
  .catch((error) => {
    console.error('❌ 种子数据创建失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
