import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * DashScope 千问 Embedding 服务
 *
 * 通过阿里云 DashScope 兼容 OpenAI 的 /v1/embeddings 接口批量向量化.
 * 当前使用模型 qwen3.7-text-embedding, 输出维度由 EMBEDDING_DIMENSION 控制(默认 1024, 与 Qdrant 对齐).
 *
 * 免费额度: qwen3.7-text-embedding 100 万 token, 90 天内有效.
 * 文档: https://help.aliyun.com/zh/model-studio/developer-reference/text-embedding
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private dimension: number;
  /** 每批最多并发的 chunk 数 (DashScope 单次上限较大, 这里保守 20 条一批) */
  private batchSize: number;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.apiKey = (this.config.get<string>('DASHSCOPE_API_KEY') || '').trim();
    this.baseUrl = (this.config.get<string>('DASHSCOPE_BASE_URL') || '').trim().replace(/\/$/, '');
    this.model = (this.config.get<string>('EMBEDDING_MODEL') || 'qwen3.7-text-embedding').trim();
    this.dimension = Number(this.config.get<number>('EMBEDDING_DIMENSION') || 1024);
    this.batchSize = Number(this.config.get<number>('EMBEDDING_BATCH_SIZE') || 20);

    if (!this.apiKey) {
      this.logger.warn('⚠️  DASHSCOPE_API_KEY 未配置, 调用 embed() 会失败.');
    }
    if (!this.baseUrl) {
      this.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    }
    this.logger.log(
      `Embedding 已配置: model=${this.model}, dimension=${this.dimension}, batch=${this.batchSize}, endpoint=${this.baseUrl}`,
    );
  }

  get expectedDimension(): number {
    return this.dimension;
  }

  /**
   * 批量将文本转为向量
   *
   * @param texts 待向量化的文本列表
   * @returns 对应顺序的向量数组 number[][] (每个向量 1024 维)
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    if (!this.apiKey) {
      throw new Error('[Embedding] DASHSCOPE_API_KEY 未配置, 请在 server/.env 中填写.');
    }

    // 空字符串的 chunk 不请求 API, 直接填充零向量(避免报错)
    const jobs = texts.map((t, idx) => ({ idx, text: t || '' }));
    const nonEmpty = jobs.filter((j) => j.text.trim().length > 0);

    const vectors: number[][] = new Array(texts.length);

    // 1. 空文本填零向量
    for (const j of jobs) {
      if (j.text.trim().length === 0) {
        vectors[j.idx] = new Array(this.dimension).fill(0);
      }
    }

    // 2. 非空文本分批请求
    for (let i = 0; i < nonEmpty.length; i += this.batchSize) {
      const batch = nonEmpty.slice(i, i + this.batchSize);
      const batchTexts = batch.map((b) => b.text);
      const batchResult = await this.requestOnce(batchTexts);

      if (batchResult.length !== batch.length) {
        throw new Error(
          `[Embedding] 返回向量数 ${batchResult.length} ≠ 请求文本数 ${batch.length}, 请检查 API.`,
        );
      }
      for (let k = 0; k < batch.length; k++) {
        vectors[batch[k].idx] = batchResult[k];
      }
    }

    return vectors;
  }

  /** 单次调用 embeddings */
  private async requestOnce(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`;
    const body: Record<string, any> = {
      model: this.model,
      input: texts,
      encoding_format: 'float',
    };
    // qwen3.7/v4 支持 dimensions 参数, v2 不支持. 只有当配置的 dimension>0 时才加
    if (this.dimension > 0 && this.model !== 'text-embedding-v2') {
      body.dimensions = this.dimension;
    }

    const t0 = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`[Embedding] 响应非 JSON (HTTP ${resp.status}): ${text.slice(0, 400)}`);
    }

    if (!resp.ok) {
      const msg = data?.error?.message || data?.message || text.slice(0, 300);
      throw new Error(`[Embedding] HTTP ${resp.status}: ${msg}`);
    }

    if (!Array.isArray(data?.data)) {
      throw new Error(`[Embedding] 返回缺少 data 数组: ${JSON.stringify(data).slice(0, 300)}`);
    }

    // 按 index 排序 (API 不一定按顺序返回)
    const ordered = data.data.sort(
      (a: any, b: any) => Number(a.index ?? 0) - Number(b.index ?? 0),
    );
    const result = ordered.map((d: any) => {
      const vec = d.embedding as number[];
      if (!Array.isArray(vec)) {
        throw new Error('[Embedding] 返回 embedding 不是数组.');
      }
      // 维度校验: 不匹配但接近时不阻塞, 只 warn (避免 API 强制降维导致)
      if (vec.length !== this.dimension) {
        this.logger.warn(
          `向量维度不匹配: 期望 ${this.dimension}, 实际 ${vec.length}. 使用实际维度.`,
        );
      }
      return vec;
    });

    const usage = data?.usage?.total_tokens;
    this.logger.debug(
      `向量化 1 批: ${texts.length} 行, tokens=${usage ?? '-'}, 耗时=${Date.now() - t0}ms`,
    );
    return result;
  }
}
