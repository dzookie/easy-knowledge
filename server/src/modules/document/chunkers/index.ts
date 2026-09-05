import { ChunkItem, ParsedResult } from '../parsers/types';
import { splitRecursive } from './recursive.chunker';
import { splitFixed } from './fixed.chunker';
import { splitSemantic } from './semantic.chunker';

export type ChunkStrategy = 'recursive' | 'fixed' | 'semantic';

export interface ChunkOptions {
  strategy: ChunkStrategy;
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * 切片器入口
 *
 * 三种策略:
 *  - recursive: 递归字符切分 (按 \n\n → \n → 句末标点 → 逗号 → 硬切)
 *  - semantic:  语义切分 (按 Markdown 标题边界 + 段落贪心合并 + 标题路径注入)
 *  - fixed:     固定长度切分 (按字符数硬切)
 */
export function createChunks(parsed: ParsedResult, opts: ChunkOptions): ChunkItem[] {
  const strategy: ChunkStrategy =
    opts.strategy === 'recursive' || opts.strategy === 'fixed' || opts.strategy === 'semantic'
      ? opts.strategy
      : 'recursive';

  const safeOpts = {
    chunkSize: Math.max(50, Number(opts.chunkSize) || 500),
    chunkOverlap: Math.max(0, Number(opts.chunkOverlap) || 0),
  };

  switch (strategy) {
    case 'fixed':
      return splitFixed(parsed.text, parsed.segments, safeOpts);
    case 'semantic':
      return splitSemantic(parsed.text, parsed.segments, safeOpts);
    case 'recursive':
    default:
      return splitRecursive(parsed.text, parsed.segments, safeOpts);
  }
}
