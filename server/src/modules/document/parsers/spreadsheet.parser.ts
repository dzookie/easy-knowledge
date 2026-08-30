import * as fs from 'node:fs';
import { Parser, ParsedResult, TextSegment } from './types';

// 条件 require: exceljs / csv-parse 都是可选的
let exceljs: any = null;
let csvParse: any = null;
try {
  exceljs = require('exceljs');
} catch {}
try {
  csvParse = require('csv-parse/sync');
} catch {}

/**
 * 电子表格解析器 (.xlsx / .xls / .csv)
 *
 * v1 简化 (不做行级 chunk):
 *   - 每个 sheet 转成带表头的纯文本段落:
 *     ### Sheet: 员工花名册 (102 行 x 6 列)
 *     | 姓名 | 年龄 | 入职日期 | 部门 |
 *     | ---- | --- | -------- | ---- |
 *     | 张三 | 28 | 2023-01-15 | 技术部 |
 *     ...
 *   - 每个 sheet 作为一个独立 segment, position.sheet=表名
 *   - 再由通用的 recursive chunker 切 (表格会被按字符切, 但每 chunk 依然保留 sheet 名)
 *
 * v2 再做行级 chunk + 重复表头 + payload 列值过滤检索
 */
export class SpreadsheetParser implements Parser {
  readonly extensions: string[] = ['xlsx', 'xls', 'csv'];

  async parse(absPath: string): Promise<ParsedResult> {
    const ext = absPath.split('.').pop()!.toLowerCase();
    if (ext === 'csv') return this.parseCsv(absPath);
    return this.parseExcel(absPath);
  }

  /* ===================== Excel (xlsx/xls) ===================== */
  private async parseExcel(absPath: string): Promise<ParsedResult> {
    if (!exceljs) {
      throw new Error('[Parser] exceljs 未安装, 无法解析 .xlsx/.xls');
    }
    const buf = await fs.promises.readFile(absPath);
    const wb = new exceljs.Workbook();
    // xlsx; xls 其实不被 exceljs 原生支持,如果报错就捕获给用户
    try {
      await wb.xlsx.load(buf);
    } catch (e: any) {
      // 尝试 CSV 兼容 (比如改扩展名的)
      throw new Error(`[Parser] Excel 解析失败: ${e?.message || e}. 仅支持 .xlsx; .xls 请另存为 .xlsx 后再上传.`);
    }

    const segments: TextSegment[] = [];
    let fullText = '';
    let totalChars = 0;

    wb.eachSheet((ws: any) => {
      const md = this.sheetToMarkdown(ws);
      if (!md.trim()) return;
      const segmentText = `### Sheet: ${ws.name} (${ws.rowCount} 行 × ${ws.columnCount} 列)\n\n${md}`;
      totalChars += segmentText.length;
      fullText += (fullText ? '\n\n' : '') + segmentText;
      segments.push({ text: segmentText, position: { sheet: ws.name } });
    });

    return {
      text: fullText,
      totalChars,
      segments,
      meta: { type: 'excel', sheets: wb.worksheets.map((s: any) => s.name) },
    };
  }

  private sheetToMarkdown(ws: any): string {
    const rows: string[][] = [];
    ws.eachRow((row: any, rowNumber: number) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell: any) => {
        const v = this.cellValue(cell);
        cells.push(v);
      });
      if (cells.some((c) => c !== '' && c !== undefined)) {
        rows.push(cells);
      }
    });
    if (rows.length === 0) return '';
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const normalized = rows.map((r) => {
      while (r.length < maxCols) r.push('');
      return r.map((cell) => this.escapeMd(String(cell ?? ''))).join(' | ');
    });
    const header = normalized[0];
    const sep = new Array(maxCols).fill('---').join(' | ');
    const body = normalized.slice(1).join('\n');
    return `| ${header} |\n| ${sep} |\n${body ? `| ${body.split('\n').join(' |\n| ')} |\n` : ''}`
      .replace(/\| \|/g, '|') // 清掉头尾多余的
      .replace(/^\| /mg, '')
      .replace(/ \|$/mg, '');
  }

  private cellValue(cell: any): string {
    // exceljs cell.value: 可能是 null / string / number / Date / 对象公式 / hyperlink
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if ((v as any).text) return String((v as any).text);           // hyperlink: { text, hyperlink:'' }
      if ((v as any).result !== undefined) return String((v as any).result); // formula cached
      if ((v as any).richText) {
        return ((v as any).richText as any[]).map((t) => t.text || '').join('');
      }
    }
    try {
      return String(v);
    } catch {
      return '';
    }
  }

  private escapeMd(s: string): string {
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  }

  /* ===================== CSV ===================== */
  private async parseCsv(absPath: string): Promise<ParsedResult> {
    if (!csvParse) {
      throw new Error('[Parser] csv-parse 未安装, 无法解析 .csv');
    }
    const raw = await fs.promises.readFile(absPath, 'utf-8').catch(async () => {
      // GBK fallback: 再试一次 gbk 解码
      const buf = await fs.promises.readFile(absPath);
      try {
        return require('node:buffer').Buffer.from(buf).toString('utf-8');
      } catch {
        return buf.toString('latin1');
      }
    });

    let rows: string[][];
    try {
      rows = csvParse.parse(raw, { skip_empty_lines: true }) as string[][];
    } catch (e: any) {
      throw new Error(`[Parser] CSV 解析失败: ${e?.message || e}`);
    }
    if (!rows.length) {
      return { text: '', totalChars: 0, segments: [], meta: { type: 'csv' } };
    }
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const lines = rows.map((r) => {
      while (r.length < maxCols) r.push('');
      return r.map((c) => this.escapeMd(c || '')).join(' | ');
    });
    const header = lines[0];
    const sep = new Array(maxCols).fill('---').join(' | ');
    const body = lines.slice(1).join('\n');
    const md = `| ${header} |\n| ${sep} |\n${body ? `| ${body.split('\n').join(' |\n| ')} |\n` : ''}`
      .replace(/\| \|/g, '|')
      .replace(/^\| /mg, '')
      .replace(/ \|$/mg, '');
    const segmentText = `### Sheet: sheet1 (${rows.length - 1} 行 × ${maxCols} 列)\n\n${md}`;
    return {
      text: segmentText,
      totalChars: segmentText.length,
      segments: [{ text: segmentText, position: { sheet: 'sheet1' } }],
      meta: { type: 'csv' },
    };
  }
}
