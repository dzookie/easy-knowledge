import { ChunkItem } from '../parsers/types';

/**
 * 递归字符切分器 (RecursiveCharacterTextSplitter 的简化版)
 *
 * 优先级: \n\n(段落) → \n(换行) → 。！？.!?(句末) → ，、,:;，逗号 → 空格 → 硬切
 * 每个 chunk 目标大小 ≈ chunkSize(按字符数), 相邻 chunk 重叠 overlap 字符.
 *
 * 如果传了 segments(带 position), 切出来的 chunk 会继承最贴近的 segment.position
 * 这样在 PDF 页段 / sheet 段场景, chunk 依然能记住来自 page=X 或 sheet=XXX.
 */
export function splitRecursive(
  fullText: string,
  segments?: { text: string; position?: Record<string, any> }[],
  options?: { chunkSize?: number; chunkOverlap?: number },
): ChunkItem[] {
  const chunkSize = Math.max(50, options?.chunkSize ?? 500);
  const chunkOverlap = Math.min(Math.max(0, options?.chunkOverlap ?? 50), Math.floor(chunkSize / 2));

  if (!fullText) return [];

  // 1. 如果有 segments, 先按 segments 每个独立切, 能更准地保留 position
  if (segments && segments.length > 0) {
    const out: ChunkItem[] = [];
    for (const seg of segments) {
      const sub = splitCharWithOverlap(seg.text || '', { chunkSize, chunkOverlap });
      for (const piece of sub) {
        out.push({
          index: out.length,
          content: piece,
          type: 'text',
          position: { ...(seg.position || {}) },
        });
      }
    }
    // 极端情况下 segments 之和拼起来远小于 fullText, 再兜底切一次整体
    if (out.length === 0) {
      return splitCharWithOverlap(fullText, { chunkSize, chunkOverlap }).map((c, i) => ({
        index: i,
        content: c,
        type: 'text',
      }));
    }
    return out;
  }

  // 2. 无 segments, 整体直接切
  return splitCharWithOverlap(fullText, { chunkSize, chunkOverlap }).map((c, i) => ({
    index: i,
    content: c,
    type: 'text',
  }));
}

/**
 * 简化的递归字符切分实现:
 *
 * 核心思想: 先按一个分隔符数组(从最粗到最细)依次试.
 * 如果按该分隔符能切出的小块长度 <= chunkSize, 就把它作为候选, 再贪心合并成接近 chunkSize 的大 chunk.
 * 如果某个分隔符切完发现块太大, 就用下一级分隔符再对其递归.
 *
 * 这里做了简化版 (LangChain JS 是真递归, 我们用 2 层就覆盖 99% 场景):
 *   - 按分隔符层次拿最优的一份 splits (即"最粗的那个使所有 piece<=chunkSize")
 *   - 贪心 piece 合并 → final chunks
 *   - final chunks 之间复制 overlap 个字的尾部/头部
 */
function splitCharWithOverlap(
  text: string,
  opts: { chunkSize: number; chunkOverlap: number },
): string[] {
  const { chunkSize, chunkOverlap } = opts;
  if (text.length <= chunkSize) return [text];

  // 分隔符顺序(从自然边界到硬切)
  const separators = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', '，', '、', ',', ':', ';', ' ', ''];

  // 找第一个能把 text 拆成所有 piece <= chunkSize 的分隔符
  let chosenSep = separators[separators.length - 1]; // 默认硬切
  for (const sep of separators) {
    if (sep === '') continue;
    const splits = splitPreserveSep(text, sep);
    if (splits.every((s) => s.length <= chunkSize)) {
      chosenSep = sep;
      break;
    }
  }

  // 用 chosenSep 切; 如果还超长(只有 sep='')就按字符硬切
  const rawPieces =
    chosenSep !== ''
      ? splitPreserveSep(text, chosenSep)
      : [...text].reduce<string[]>((acc, ch, idx) => {
          if (idx % chunkSize === 0) acc.push('');
          acc[acc.length - 1] += ch;
          return acc;
        }, []);

  // 贪心合并成目标大小附近的 chunk, 然后补 overlap
  const merged: string[] = [];
  let buf = '';
  for (const p of rawPieces) {
    if (!p) continue;
    if (p.length > chunkSize) {
      // 单个 piece 就超长 → 直接切成硬 chunk
      if (buf) {
        merged.push(buf);
        buf = '';
      }
      for (let i = 0; i < p.length; i += chunkSize - chunkOverlap) {
        merged.push(p.slice(i, i + chunkSize));
      }
      continue;
    }
    if ((buf + p).length <= chunkSize) {
      buf += p;
    } else {
      if (buf) merged.push(buf);
      buf = p;
    }
  }
  if (buf) merged.push(buf);

  // 加 overlap (相邻 chunk 共享尾部 overlap 个字符)
  if (chunkOverlap <= 0) return merged.filter((s) => s.trim().length > 0);
  const overlapped: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    let chunk = merged[i];
    // 拿上一个 chunk 的末尾 overlap 字拼过来
    if (i > 0) {
      const prev = merged[i - 1];
      const tail = prev.slice(-chunkOverlap);
      if (!chunk.startsWith(tail)) {
        chunk = tail + chunk;
        // 稍微拉回长度
        if (chunk.length > chunkSize + chunkOverlap) {
          chunk = chunk.slice(0, chunkSize + chunkOverlap);
        }
      }
    }
    overlapped.push(chunk);
  }
  return overlapped.filter((s) => s.trim().length > 0);
}

/**
 * 按 sep 切分, 但把 sep 保留在**前面的那个 piece**末尾, 这样句末标点不丢.
 *   "a\nb\nc", sep="\n" → ["a\n", "b\n", "c"]
 */
function splitPreserveSep(text: string, sep: string): string[] {
  if (!sep) return [text];
  const result: string[] = [];
  let start = 0;
  while (true) {
    const idx = text.indexOf(sep, start);
    if (idx === -1) {
      result.push(text.slice(start));
      break;
    }
    result.push(text.slice(start, idx + sep.length));
    start = idx + sep.length;
  }
  return result.filter((s) => s.length > 0);
}
