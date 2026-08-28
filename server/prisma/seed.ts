/**
 * 种子脚本 — 创建默认管理员账号
 * 执行: npm run db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      nickname: '超级管理员',
      role: Role.ADMIN,
      status: 1,
    },
  });

  console.log('✅ 种子数据创建成功');
  console.log('----------------------------------------');
  console.log('管理员账号:');
  console.log(`  用户名: ${admin.username}`);
  console.log(`  密码:   admin123`);
  console.log(`  角色:   ${admin.role}`);
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
