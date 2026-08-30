import { Parser, ParsedResult } from './types';
import { TextParser } from './text.parser';
import { PdfParser } from './pdf.parser';
import { DocxParser } from './docx.parser';
import { SpreadsheetParser } from './spreadsheet.parser';

/**
 * 解析器工厂: 根据文件扩展名取对应 Parser
 * 未知扩展名抛出 NotFoundException(外部再转 BadRequest)
 */
const PARSERS: Parser[] = [
  new TextParser(),
  new PdfParser(),
  new DocxParser(),
  new SpreadsheetParser(),
];

export function createParserByExt(ext: string): Parser {
  const key = (ext || '').toLowerCase().replace(/^\./, '');
  const parser = PARSERS.find((p) => p.extensions.includes(key));
  if (!parser) {
    throw new Error(`暂不支持的文件类型: .${ext || '(未知)'}. 支持: ${allExtensions().join('/')}`);
  }
  return parser;
}

export function allExtensions(): string[] {
  const set = new Set<string>();
  PARSERS.forEach((p) => p.extensions.forEach((e) => set.add(e)));
  return Array.from(set);
}

export { Parser, ParsedResult };
