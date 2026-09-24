import * as fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { Parser, ParsedResult, TextSegment } from './types';

/**
 * PDF 解析器 (pdf-parse v2 类式 API)
 * getText() 返回 { text: 全文档拼接文本, pages: [{ num, text }], total }
 */
export class PdfParser implements Parser {
  readonly extensions: string[] = ['pdf'];

  async parse(absPath: string): Promise<ParsedResult> {
    const buf = await fs.promises.readFile(absPath);

    // v2 会把 TypedArray 转移给 worker 线程, 这里传副本避免影响原 buffer
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();

      // 按页收集 segments, 携带 page 元信息供后续切片定位
      const segments: TextSegment[] = [];
      for (const page of result.pages || []) {
        const cleaned = (page.text || '').replace(/\u0000/g, '').trim();
        if (cleaned.length > 0) {
          segments.push({ text: cleaned, position: { page: page.num } });
        }
      }

      const fullText = (result.text || '').replace(/\u0000/g, '').trim();
      const totalChars = fullText.length;

      if (totalChars < 10 && segments.length === 0) {
        return {
          text: '',
          totalChars: 0,
          segments: [],
          meta: { pages: result.total || 0, scannedLike: true, type: 'pdf' },
        };
      }

      return {
        text: fullText,
        totalChars,
        segments,
        meta: { pages: result.total || 0, type: 'pdf' },
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
