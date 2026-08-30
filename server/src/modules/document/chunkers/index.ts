import { ChunkItem, ParsedResult } from '../parsers/types';
import { splitRecursive } from './recursive.chunker';
import { splitFixed } from './fixed.chunker';

export type ChunkStrategy = 'recursive' | 'fixed' | 'semantic';

export interface ChunkOptions {
  strategy: ChunkStrategy;
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * 切片器入口
 *
 * semantic v1 fallback 成 recursive (前面方案里定好的)
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
      // v1 fallback: recursive
      return splitRecursive(parsed.text, parsed.segments, safeOpts);
    case 'recursive':
    default:
      return splitRecursive(parsed.text, parsed.segments, safeOpts);
  }
}
