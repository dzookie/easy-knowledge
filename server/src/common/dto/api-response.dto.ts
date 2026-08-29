import { ApiProperty } from '@nestjs/swagger';
import { ResponseCode } from '@/common/enums/response-code.enum';

/**
 * 统一响应结构
 * 所有接口成功/失败均返回此结构
 */
export class ApiResponse<T = unknown> {
  @ApiProperty({ example: 200, description: '状态码, 200=成功' })
  code: ResponseCode;

  @ApiProperty({ example: 'ok', description: '提示信息' })
  message: string;

  @ApiProperty({ description: '业务数据, 失败时为 null' })
  data: T | null;

  static success<T>(data: T, message = 'ok'): ApiResponse<T> {
    const r = new ApiResponse<T>();
    r.code = ResponseCode.OK;
    r.message = message;
    r.data = data;
    return r;
  }

  static error(
    code: ResponseCode = ResponseCode.INTERNAL_ERROR,
    message = '服务异常',
    data: unknown = null,
  ): ApiResponse {
    const r = new ApiResponse();
    r.code = code;
    r.message = message;
    r.data = data;
    return r;
  }
}
