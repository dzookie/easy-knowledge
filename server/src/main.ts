import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

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
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ===== 全局 ValidationPipe =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥离 DTO 未声明的属性
      transform: true, // 自动类型转换(如 string -> number)
      forbidNonWhitelisted: false, // 不抛错, 仅剥离
    }),
  );

  // ===== Swagger 文档 =====
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Easy-Knowledge API')
    .setDescription('类火山方舟知识库系统 - 后端接口文档')
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
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 服务已启动: http://localhost:${port}`);
  logger.log(`📖 API 文档: http://localhost:${port}/docs`);
  logger.log(`🌐 CORS 允许来源: ${clientOrigin}`);
}
bootstrap();
