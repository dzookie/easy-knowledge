/**
 * 变量解析器 — 处理 {{nodeId.varName}} 和 {{nodeId.path.to.field}} 模板语法
 *
 * 使用正则匹配 + JSON Path 路径解析. 不引入完整 Mustache 引擎,
 * 保持依赖最小化.
 */
import { Injectable } from '@nestjs/common';

// 匹配 {{nodeId.path}} 模板, 不允许换行, 支持点路径
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_.\[\]]+))?\s*\}\}/g;

@Injectable()
export class VariableResolver {
  /**
   * 解析字符串中的所有 {{nodeId.path}} 变量并替换
   *
   * @param template 模板字符串
   * @param nodeOutputs 已执行节点的输出: { [nodeId]: { [varName]: any } }
   * @returns 替换后的字符串. 未匹配的变量替换为空字符串.
   */
  resolve(template: string, nodeOutputs: Record<string, Record<string, any>>): string {
    if (!template) return '';
    return template.replace(VARIABLE_PATTERN, (match, nodeId: string, path: string | undefined) => {
      const nodeOut = nodeOutputs[nodeId];
      if (!nodeOut) return '';
      const value = path ? this.getPath(nodeOut, path) : nodeOut;
      return this.valueToString(value);
    });
  }

  /**
   * 解析模板并返回对象 (用于结构化输出)
   * 如果模板包含变量引用, 会先解析再 JSON.parse
   */
  resolveObject<T = any>(
    template: string,
    nodeOutputs: Record<string, Record<string, any>>,
  ): T | null {
    const resolved = this.resolve(template, nodeOutputs).trim();
    if (!resolved) return null;
    try {
      return JSON.parse(resolved) as T;
    } catch {
      return resolved as unknown as T;
    }
  }

  /**
   * 取变量的原始值 (不转字符串), 用于 if_else 条件比较
   */
  resolveValue(
    ref: string,
    nodeOutputs: Record<string, Record<string, any>>,
  ): any {
    if (!ref) return undefined;
    const m = ref.trim().match(/^\{\{\s*([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_.\[\]]+))?\s*\}\}$/);
    if (!m) {
      // 不是变量引用, 视为字面量字符串
      return ref;
    }
    const [, nodeId, path] = m;
    const nodeOut = nodeOutputs[nodeId];
    if (!nodeOut) return undefined;
    return path ? this.getPath(nodeOut, path) : nodeOut;
  }

  /** 按点路径取值 */
  private getPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => {
      if (acc == null) return undefined;
      // 支持 [index] 数组访问
      const arrayMatch = key.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
      if (arrayMatch) {
        return acc[arrayMatch[1]]?.[Number(arrayMatch[2])];
      }
      // 纯数字索引
      if (/^\d+$/.test(key) && Array.isArray(acc)) {
        return acc[Number(key)];
      }
      return acc[key];
    }, obj);
  }

  /** 将任意值转为字符串 */
  private valueToString(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
