import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '@/common/dto/api-response.dto';
import { ResponseCode } from '@/common/enums/response-code.enum';

/**
 * 全局异常过滤器
 * 把所有异常统一转换成 ApiResponse 格式
 *
 * 处理的异常类型:
 * - HttpException(NestJS 抛出的,含 ValidationPipe/UnauthorizedException 等)
 * - 其他未知异常(自动转 500)
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 计算 code 和 message
    let status: number;
    let code: ResponseCode;
    let message: string;
    let detail: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        // class-validator 校验失败时 message 是数组
        if (Array.isArray(r.message)) {
          message = (r.message as string[]).join('; ');
          detail = r.message;
        } else {
          message = (r.message as string) || exception.message;
        }
      } else {
        message = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '服务器内部错误';
      // 非生产环境透传真实错误
      if (process.env.NODE_ENV !== 'production') {
        message = exception instanceof Error ? exception.message : String(exception);
      }
    }

    // HTTP 状态码映射到 ResponseCode 枚举
    code = this.toResponseCode(status);

    // 记录日志(5xx 记 error,4xx 记 warn)
    const log = `${request.method} ${request.url} ${status} ${message}`;
    if (status >= 500) {
      this.logger.error(log, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(log);
    }

    const body = ApiResponse.error(code, message, detail);

    response.status(status).json(body);
  }

  /**
   * HTTP 状态码 → ResponseCode
   * 已定义的用对应枚举,未定义的回退到 500
   */
  private toResponseCode(status: number): ResponseCode {
    const map: Record<number, ResponseCode> = {
      400: ResponseCode.BAD_REQUEST,
      401: ResponseCode.UNAUTHORIZED,
      403: ResponseCode.FORBIDDEN,
      404: ResponseCode.NOT_FOUND,
      409: ResponseCode.CONFLICT,
      422: ResponseCode.UNPROCESSABLE,
      429: ResponseCode.TOO_MANY,
      500: ResponseCode.INTERNAL_ERROR,
      502: ResponseCode.BAD_GATEWAY,
      503: ResponseCode.SERVICE_UNAVAILABLE,
    };
    return map[status] ?? ResponseCode.INTERNAL_ERROR;
  }
}
