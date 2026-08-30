import { ChunkItem } from '../parsers/types';

/**
 * 固定长度切片器 (v1 兼容选项, 一般不推荐)
 * 直接按字符数切片 + overlap
 *
 * 有 segments 时尽量合并后切, 保留最贴近的 position.
 */
export function splitFixed(
  fullText: string,
  segments?: { text: string; position?: Record<string, any> }[],
  options?: { chunkSize?: number; chunkOverlap?: number },
): ChunkItem[] {
  const chunkSize = Math.max(50, options?.chunkSize ?? 500);
  const chunkOverlap = Math.min(Math.max(0, options?.chunkOverlap ?? 50), Math.floor(chunkSize / 2));
  if (!fullText) return [];

  // 简化: 整体切, 然后为每个 chunk 映射 position
  const raw: string[] = [];
  const step = chunkSize - chunkOverlap;
  for (let i = 0; i < fullText.length; i += step) {
    raw.push(fullText.slice(i, i + chunkSize));
  }
  const trimmed = raw.filter((s) => s.trim().length > 0);

  // 如果有 segments: 为每个 chunk 起始位置定位是哪个 segment, 带它的 position
  if (segments && segments.length > 0) {
    let cursor = 0;
    const segPos = segments.map((seg) => {
      const start = fullText.indexOf(seg.text, cursor);
      const end = start >= 0 ? start + seg.text.length : cursor;
      if (start >= 0) cursor = end;
      return { start: start >= 0 ? start : -1, end, position: seg.position };
    });
    return trimmed.map((content, i) => {
      const absStart = i * step;
      const sp = segPos.find((p) => p.start >= 0 && absStart >= p.start && absStart < p.end);
      return {
        index: i,
        content,
        type: 'text',
        position: sp ? { ...sp.position } : undefined,
      };
    });
  }

  return trimmed.map((content, i) => ({
    index: i,
    content,
    type: 'text',
  }));
}
