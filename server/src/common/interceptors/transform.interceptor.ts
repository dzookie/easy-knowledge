import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '@/common/dto/api-response.dto';

/**
 * 全局响应转换拦截器
 * 把 Controller 返回的裸数据自动包装成 { code, message, data }
 *
 * 跳过包装的情况:
 * - 返回值已经是 ApiResponse 实例
 * - 返回值是 Stream/Buffer(SSE / 文件下载)
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // 已经是统一响应结构,直接放行
        if (data instanceof ApiResponse) {
          return data;
        }

        // SSE / 流式响应 / Buffer 不包装
        if (
          data instanceof Buffer ||
          (typeof data === 'object' &&
            data !== null &&
            'pipe' in data &&
            typeof (data as { pipe: unknown }).pipe === 'function')
        ) {
          return data;
        }

        return ApiResponse.success(data);
      }),
    );
  }
}
