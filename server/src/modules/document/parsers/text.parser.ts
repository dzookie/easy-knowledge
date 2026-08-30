import * as fs from 'node:fs';
import { Parser, ParsedResult } from './types';

/**
 * 纯文本解析器 (.md / .txt 通用)
 * 分段: 按两个换行以上切成 paragraph, 方便切片器按段落切
 */
export class TextParser implements Parser {
  readonly extensions: string[] = ['md', 'txt'];

  async parse(absPath: string): Promise<ParsedResult> {
    const raw = await fs.promises.readFile(absPath, 'utf-8');
    const text = raw.replace(/\r\n/g, '\n').replace(/\u0000/g, '');

    // 按 \n\n 分段
    const paragraphs = text
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let lineCursor = 0;
    const segments = paragraphs.map((p) => {
      const lineCount = p.split('\n').length;
      const seg = {
        text: p,
        position: { startLine: lineCursor + 1, endLine: lineCursor + lineCount },
      };
      lineCursor += lineCount + 2; // +2 表示段落之间的两个换行
      return seg;
    });

    return {
      text: paragraphs.join('\n\n'),
      totalChars: text.length,
      segments,
      meta: { type: 'text' },
    };
  }
}
