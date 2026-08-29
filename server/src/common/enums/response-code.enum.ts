/**
 * 统一响应状态码枚举
 * 对齐 HTTP 状态码语义,所有接口共用
 */
export enum ResponseCode {
  OK = 200,                    // 成功
  BAD_REQUEST = 400,           // 参数错误 / 请求格式不对
  UNAUTHORIZED = 401,          // 未登录 / token 失效
  FORBIDDEN = 403,             // 已登录但无权限
  NOT_FOUND = 404,             // 资源不存在
  CONFLICT = 409,              // 资源冲突(如用户名重复)
  UNPROCESSABLE = 422,         // 语义错误(校验失败)
  TOO_MANY = 429,              // 限流
  INTERNAL_ERROR = 500,        // 服务器错误
  BAD_GATEWAY = 502,           // 上游服务错误(模型/向量库不可达)
  SERVICE_UNAVAILABLE = 503,   // 服务不可用
}
