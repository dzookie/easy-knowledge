/**
 * 通用 API 响应类型
 */

/**
 * 分页查询结果
 *
 * 后端所有分页接口统一返回此结构:
 *   { items: T[], total: number, page: number, pageSize: number }
 */
export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
