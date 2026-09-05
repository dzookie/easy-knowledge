import { ChunkItem } from '../parsers/types';

/**
 * 语义切分器 (Semantic Chunker)
 *
 * 核心思想: 按 Markdown 标题层级把文档切成"标题节", 节内按段落贪心合并,
 * 每个 chunk 前面注入所属标题路径作为上下文, 让向量检索能匹配到标题语义.
 *
 * 与递归切分的差异:
 *  - 递归: 只看字符长度, 可能跨标题/跨章节合并
 *  - 语义: 尊重标题边界, 同级标题下的段落不会混在一个 chunk
 *  - 语义: 每个 chunk 自带标题路径前缀, 检索更准
 *  - 语义: 不做跨段落 overlap (会破坏语义边界), 只有超长段落降级切分时才用 overlap
 *
 * 标题识别: Markdown 风格 ^#{1,6}\s+ 标题, 兼容无标题的纯文本(整篇当一个节)
 */
export function splitSemantic(
  fullText: string,
  segments?: { text: string; position?: Record<string, any> }[],
  options?: { chunkSize?: number; chunkOverlap?: number },
): ChunkItem[] {
  const chunkSize = Math.max(50, options?.chunkSize ?? 500);
  const chunkOverlap = Math.min(Math.max(0, options?.chunkOverlap ?? 50), Math.floor(chunkSize / 2));
  if (!fullText) return [];

  // 1. 解析文档为语义块 (每个块 = 一个段落 + 所属标题路径 + 行号)
  const blocks = parseToBlocks(fullText);
  if (blocks.length === 0) return [];

  // 2. 按标题路径分组, 贪心合并相邻同组的块到 chunkSize
  const chunks: { content: string; startLine: number; endLine: number }[] = [];
  let buf: { text: string; startLine: number; endLine: number; sectionKey: string }[] = [];
  let bufLen = 0;

  const flushBuf = () => {
    if (buf.length === 0) return;
    const sectionKey = buf[0].sectionKey;
    const headingPath = sectionKey ? sectionKey.split('\u0001') : [];
    const prefix = headingPath.length > 0 ? headingPath.join(' > ') + '\n\n' : '';
    const body = buf.map((b) => b.text).join('\n\n');
    chunks.push({
      content: prefix + body,
      startLine: buf[0].startLine,
      endLine: buf[buf.length - 1].endLine,
    });
    buf = [];
    bufLen = 0;
  };

  for (const block of blocks) {
    // sectionKey 变了 → 强制 flush (不跨同级标题)
    if (buf.length > 0 && buf[0].sectionKey !== block.sectionKey) {
      flushBuf();
    }

    // 单个块就超长 → 先 flush 当前 buf, 再对超长块降级切分
    if (block.text.length > chunkSize) {
      flushBuf();
      const subPieces = splitOverlongParagraph(block.text, { chunkSize, chunkOverlap });
      for (const piece of subPieces) {
        chunks.push({
          content: (block.sectionKey ? block.sectionKey.split('\u0001').join(' > ') + '\n\n' : '') + piece,
          startLine: block.startLine,
          endLine: block.endLine,
        });
      }
      continue;
    }

    // 贪心合并: 加入后超 chunkSize → 先 flush
    const addLen = block.text.length + (buf.length > 0 ? 2 : 0); // +2 for \n\n
    if (buf.length > 0 && bufLen + addLen > chunkSize) {
      flushBuf();
    }

    buf.push({
      text: block.text,
      startLine: block.startLine,
      endLine: block.endLine,
      sectionKey: block.sectionKey,
    });
    bufLen += addLen;
  }
  flushBuf();

  if (chunks.length === 0) return [];

  // 3. 映射 position (如果有 segments: 根据行号匹配 segment 的 position)
  return chunks.map((c, i) => ({
    index: i,
    content: c.content,
    type: 'text' as const,
    position: resolvePosition(c.startLine, segments),
  }));
}

/* ============ 内部类型与函数 ============ */

interface SemanticBlock {
  /** 段落正文 (不含标题行) */
  text: string;
  /**
   * 标题路径的序列化 key, 用 \u0001 分隔各级标题文本.
   * 相同 sectionKey 的块可合并, 不同 sectionKey 强制分开 (不跨同级标题).
   * 空字符串表示无标题的文档头部内容.
   */
  sectionKey: string;
  /** 段落起始行 (1-based) */
  startLine: number;
  /** 段落结束行 (1-based) */
  endLine: number;
}

/**
 * 把纯文本解析为语义块.
 *
 * 识别 Markdown 标题 ^#{1,6}\s+, 维护标题栈:
 *   - 遇到 # 标题 → 弹出栈中 level >= 当前的, 压入新标题
 *   - 标题行本身不进入块文本, 但影响后续块的 sectionKey
 *   - 空行作为段落边界
 */
function parseToBlocks(fullText: string): SemanticBlock[] {
  const lines = fullText.split('\n');
  const headingStack: { level: number; text: string }[] = [];
  const blocks: SemanticBlock[] = [];
  let paraLines: string[] = [];
  let paraStart = 0;

  const flushPara = (endLine: number) => {
    if (paraLines.length === 0) return;
    const text = paraLines.join('\n').trim();
    if (text.length > 0) {
      blocks.push({
        text,
        sectionKey: headingStack.map((h) => h.text).join('\u0001'),
        startLine: paraStart,
        endLine,
      });
    }
    paraLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);

    if (headingMatch) {
      flushPara(i);
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      paraStart = i + 2;
      continue;
    }

    if (line.trim() === '') {
      flushPara(i);
      paraStart = i + 2;
      continue;
    }

    if (paraLines.length === 0) paraStart = i + 1;
    paraLines.push(line);
  }
  flushPara(lines.length);

  return blocks;
}

/**
 * 超长段落降级切分: 按句末标点 → 逗号 → 硬切 的优先级
 * (递归切分的简化版, 专门用于单个超长段落)
 */
function splitOverlongParagraph(
  text: string,
  opts: { chunkSize: number; chunkOverlap: number },
): string[] {
  const { chunkSize, chunkOverlap } = opts;
  if (text.length <= chunkSize) return [text];

  const separators = ['。', '！', '？', '.', '!', '?', '；', ';', '，', '、', ',', ' ', ''];

  // 找第一个能把 text 拆成所有 piece <= chunkSize 的分隔符
  let chosenSep = '';
  for (const sep of separators) {
    if (!sep) break;
    const pieces = splitPreserveSep(text, sep);
    if (pieces.every((p) => p.length <= chunkSize)) {
      chosenSep = sep;
      break;
    }
  }

  const rawPieces = chosenSep ? splitPreserveSep(text, chosenSep) : hardSplit(text, chunkSize);

  // 贪心合并
  const merged: string[] = [];
  let buf = '';
  for (const p of rawPieces) {
    if (!p) continue;
    if ((buf + p).length <= chunkSize) {
      buf += p;
    } else {
      if (buf) merged.push(buf);
      buf = p;
    }
  }
  if (buf) merged.push(buf);

  return merged.filter((s) => s.trim().length > 0);
}

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

function hardSplit(text: string, size: number): string[] {
  const chars = [...text];
  const result: string[] = [];
  for (let i = 0; i < chars.length; i += size) {
    result.push(chars.slice(i, i + size).join(''));
  }
  return result;
}

/**
 * 根据行号匹配 segment 的 position (用于继承 PDF page / sheet 等元信息)
 */
function resolvePosition(
  startLine: number,
  segments?: { text: string; position?: Record<string, any> }[],
): Record<string, any> | undefined {
  if (!segments || segments.length === 0) return undefined;

  let cursor = 0;
  for (const seg of segments) {
    const segLineCount = (seg.text || '').split('\n').length;
    const segStart = cursor + 1;
    const segEnd = cursor + segLineCount;
    if (startLine >= segStart && startLine <= segEnd) {
      return { ...(seg.position || {}) };
    }
    cursor = segEnd + 2; // +2 for \n\n between segments
  }
  return undefined;
}
