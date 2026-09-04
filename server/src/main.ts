import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ===== 全局路由前缀 =====
  app.setGlobalPrefix('api');

  // ===== CORS =====
  const clientOrigin = configService.get<string>('CLIENT_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // ===== 全局 ValidationPipe =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥离 DTO 未声明的属性
      transform: true, // 自动类型转换(如 string -> number)
      forbidNonWhitelisted: false, // 不抛错, 仅剥离
    }),
  );

  // ===== 全局响应拦截器(自动包装 { code, message, data }) =====
  app.useGlobalInterceptors(new TransformInterceptor());

  // ===== 全局异常过滤器(统一错误响应格式) =====
  app.useGlobalFilters(new HttpExceptionFilter());

  // ===== 全局 JWT 鉴权守卫(默认所有接口需登录, @Public() 跳过) =====
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // ===== Swagger 文档 =====
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Easy-Knowledge API')
    .setDescription('EK知识库系统 - 后端接口文档')
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ===== 启动 =====
  const port = configService.get<number>('PORT', 3000);
  // 显式监听 0.0.0.0: 同时接受 IPv4 127.0.0.1 和 IPv6 ::1
  // (Windows 下 localhost 常被解析成 IPv6 ::1, 若只绑 127.0.0.1 会 Vite 代理 ECONNREFUSED)
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 服务已启动: http://127.0.0.1:${port}  (双栈 0.0.0.0)`);
  logger.log(`📖 API 文档: http://127.0.0.1:${port}/docs`);
  logger.log(`🌐 CORS 允许来源: ${clientOrigin}`);
}
bootstrap();
