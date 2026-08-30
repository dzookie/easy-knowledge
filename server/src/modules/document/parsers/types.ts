/**
 * 解析/切片 通用类型
 */
export interface ParsedResult {
  /** 纯文本 (全文档拼接) */
  text: string;
  /** 总字符数 */
  totalChars: number;
  /**
   * 分段元信息 (可选):
   *   - v1 解析器能拿到段落级元数据(例如 PDF 页码) 时填写
   *   - xlsx 可以按 sheet 分段
   * 用于 chunk 时携带 position.page / sheet / line
   */
  segments?: TextSegment[];
  /** 整体元信息 */
  meta?: Record<string, any>;
}

export interface TextSegment {
  text: string;
  position?: {
    page?: number;
    sheet?: string;
    startLine?: number;
    endLine?: number;
    [k: string]: any;
  };
}

export interface ChunkItem {
  /** 0 起序号 */
  index: number;
  /** 切出来的原文内容 */
  content: string;
  /** 该 chunk 在原文档中的位置 (如果有) */
  position?: Record<string, any>;
  /**
   * chunk 类型:
   *   - text: 普通正文
   *   - table_row: (v2) 表格行级
   *   - table_group: (v2) 表格多行分组
   */
  type: 'text' | 'table_row' | 'table_group';
}

export interface Parser {
  /** 支持的扩展名(小写, 不带点), 如 ['pdf'] */
  readonly extensions: string[];
  /**
   * 解析本地绝对路径下的文件 -> 纯文本 + 元信息
   */
  parse(absPath: string): Promise<ParsedResult>;
}
