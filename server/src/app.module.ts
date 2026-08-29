import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { RoleModule } from './modules/role/role.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    // 全局环境变量(.env)
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局 Prisma
    PrismaModule,
    // 业务模块
    AuthModule,
    MenuModule,
    RoleModule,
    UserModule,
  ],
})
export class AppModule {}
