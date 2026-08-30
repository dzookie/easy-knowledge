import * as fs from 'node:fs';
import { Parser, ParsedResult, TextSegment } from './types';

// 条件 require
let pdf: any = null;
try {
  pdf = require('pdf-parse');
  // pdf-parse 可能是 default export: require('pdf-parse').default
  if (pdf && typeof pdf !== 'function' && typeof pdf.default === 'function') pdf = pdf.default;
} catch {}

/**
 * PDF 解析器
 * pdf-parse 默认返回合并后的 data.text + 可选每页的 pages(通过自建回调拿)
 */
export class PdfParser implements Parser {
  readonly extensions: string[] = ['pdf'];

  async parse(absPath: string): Promise<ParsedResult> {
    if (!pdf) throw new Error('[Parser] pdf-parse 未安装, 无法解析 .pdf');

    const buf = await fs.promises.readFile(absPath);

    // 用 pagerender 回调收集每页文本, 形成带 page 的 segments
    const segments: TextSegment[] = [];
    let pageIdx = 0;
    const options: any = {
      max: 0,
      pagerender: async function defaultRender(pageData: any): Promise<string> {
        const renderOptions = {
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        };
        try {
          const textContent = await pageData.getTextContent(renderOptions);
          let lastY: number | null = null;
          let text = '';
          for (const item of textContent.items) {
            const anyItem = item as any;
            if (lastY === anyItem.transform[5]) {
              text += ' ' + anyItem.str;
            } else {
              text += (text ? '\n' : '') + anyItem.str;
            }
            lastY = anyItem.transform[5];
          }
          const pageNo = ++pageIdx;
          const cleaned = (text || '').replace(/\u0000/g, '').trim();
          if (cleaned.length > 0) {
            segments.push({ text: cleaned, position: { page: pageNo } });
          }
          return text;
        } catch (e: any) {
          const pageNo = ++pageIdx;
          // pagerender 失败不能中断, 返回空串继续后续页面
          return '';
        }
      },
    };

    const data = await pdf(buf, options);
    const fullText = (String(data.text || '') || '').replace(/\u0000/g, '').trim();
    const totalChars = fullText.length;

    if (totalChars < 10 && segments.length === 0) {
      return {
        text: '',
        totalChars: 0,
        segments: [],
        meta: { pages: data.numpages || 0, scannedLike: true, type: 'pdf' },
      };
    }

    return {
      text: fullText,
      totalChars,
      segments,
      meta: { pages: data.numpages || 0, type: 'pdf' },
    };
  }
}
