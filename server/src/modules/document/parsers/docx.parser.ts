import * as fs from 'node:fs';
import mammoth from 'mammoth';
import { Parser, ParsedResult, TextSegment } from './types';

/**
 * Docx 解析器 (mammoth)
 *   - 转换为纯文本 (HTML → 去标签)
 *   - 按段落分段 (p 标签之间 = \n\n)
 *   - 图片/表格 v1 不识别: mammoth.extractRawText 会把表格拆成换行分隔的行
 */
export class DocxParser implements Parser {
  readonly extensions: string[] = ['docx'];

  async parse(absPath: string): Promise<ParsedResult> {
    const buf = await fs.promises.readFile(absPath);
    // 选 extractRawText 更适合后续做纯文本切片
    const { value: text } = await mammoth.extractRawText({ buffer: buf });
    const cleaned = (text || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();

    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const segments: TextSegment[] = paragraphs.map((p, i) => ({
      text: p,
      position: { paragraph: i + 1 },
    }));

    return {
      text: paragraphs.join('\n\n'),
      totalChars: cleaned.length,
      segments,
      meta: { type: 'docx' },
    };
  }
}
