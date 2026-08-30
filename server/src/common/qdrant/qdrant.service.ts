import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

/** 向量距离度量(Qdrant 支持的子集, 语义检索一般用 Cosine) */
export type VectorDistance = 'Cosine' | 'Euclid' | 'Dot';

/**
 * QdrantService — Qdrant 向量数据库封装
 *
 * 提供方法:
 *  - getClient():      直接拿到原生 client, 供后续 upsert/search 用
 *  - health():         连通性检查(Ping)
 *  - createCollection():  创建 collection(存在则跳过, 幂等)
 *  - deleteCollection():  删除 collection(不存在不报错)
 *  - collectionExists(): 判断集合是否存在
 *  - listCollections():  列出所有集合名
 *
 * 默认向量参数:
 *  - size:     读取 QDRANT_VECTOR_SIZE, 默认 1024(bge-m3)
 *  - distance: Cosine(余弦, 语义检索通用)
 *
 * 该 Service 为全局单例, 通过 @Global() QdrantModule 导出。
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client!: QdrantClient;
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly defaultVectorSize: number;
  private readonly defaultDistance: VectorDistance = 'Cosine';

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>('QDRANT_URL', 'http://127.0.0.1:6333');
    const key = this.configService.get<string>('QDRANT_API_KEY', '');
    this.apiKey = key && key.length > 0 ? key : undefined;
    this.defaultVectorSize = parseInt(
      this.configService.get<string>('QDRANT_VECTOR_SIZE', '1024'),
      10,
    ) || 1024;
  }

  async onModuleInit() {
    this.client = new QdrantClient({
      url: this.url,
      apiKey: this.apiKey,
      // 客户端版本 1.19 可能略高于你 docker 启动的 Qdrant(比如 1.16.x),
      // 核心 create/delete/upsert/search 等 API 都兼容, 这里关闭严格版本校验以避免告警
      checkCompatibility: false,
    });

    // 启动时做一次健康检查, 仅打印日志, 不阻塞启动(Qdrant 可能稍后启动)
    try {
      const info = await this.client.versionInfo();
      this.logger.log(
        `Qdrant 已连接: ${this.url}, 版本=${info.version ?? 'unknown'}, ` +
          `默认向量维度=${this.defaultVectorSize}, 距离=${this.defaultDistance}`,
      );
    } catch (e) {
      this.logger.warn(
        `Qdrant 暂时无法连通(${this.url}): ` +
          `${(e as Error).message}。创建知识库时会再尝试, 当前不阻塞后端启动。`,
      );
    }
  }

  /** 拿到原生 client(后续文档上传/search 用) */
  getClient(): QdrantClient {
    return this.client;
  }

  /** 连通性检查 */
  async health(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const info = await this.client.versionInfo();
      return { ok: true, version: info.version };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** 获取默认向量维度 */
  getDefaultVectorSize(): number {
    return this.defaultVectorSize;
  }

  /**
   * 创建集合(幂等 — 已存在则直接返回)
   *
   * @param collectionName 集合名
   * @param opts.vectorSize 向量维度, 默认读 QDRANT_VECTOR_SIZE
   * @param opts.distance   距离度量, 默认 Cosine
   * @returns 是否创建了新集合(true:新创建 false:已存在)
   */
  async createCollection(
    collectionName: string,
    opts?: {
      vectorSize?: number;
      distance?: VectorDistance;
    },
  ): Promise<{ created: boolean; existed: boolean }> {
    const size = opts?.vectorSize ?? this.defaultVectorSize;
    const distance = opts?.distance ?? this.defaultDistance;

    const exists = await this.collectionExists(collectionName);
    if (exists) {
      this.logger.debug(`Qdrant 集合「${collectionName}」已存在, 跳过创建`);
      return { created: false, existed: true };
    }

    this.logger.log(
      `正在创建 Qdrant 集合: ${collectionName} (vectorSize=${size}, distance=${distance})`,
    );

    const result = await this.client.createCollection(collectionName, {
      vectors: {
        size,
        distance,
      },
      // 可选: 开启 on_disk_payload(大规模场景省内存, 小数据集可关)
      // 这里用默认, 后续再根据场景调优
    });

    if (!result) {
      throw new Error(`Qdrant 创建集合返回失败: ${collectionName}`);
    }

    this.logger.log(`Qdrant 集合「${collectionName}」创建成功`);
    return { created: true, existed: false };
  }

  /**
   * 删除集合(不存在时静默成功)
   */
  async deleteCollection(collectionName: string): Promise<boolean> {
    const exists = await this.collectionExists(collectionName);
    if (!exists) {
      this.logger.debug(`Qdrant 集合「${collectionName}」不存在, 无需删除`);
      return true;
    }

    this.logger.log(`正在删除 Qdrant 集合: ${collectionName}`);
    const result = await this.client.deleteCollection(collectionName);
    if (!result) {
      throw new Error(`Qdrant 删除集合返回失败: ${collectionName}`);
    }
    this.logger.log(`Qdrant 集合「${collectionName}」已删除`);
    return true;
  }

  /**
   * 判断集合是否存在
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const res = await this.client.getCollection(collectionName);
      // v1.19: getCollection 直接返回 collection info 对象(无 .result 包裹)
      return !!res && !!res.config;
    } catch (_e) {
      // 404 / 连通失败都按「不存在」处理
      return false;
    }
  }

  /**
   * 列出所有集合名
   */
  async listCollections(): Promise<string[]> {
    try {
      const res = await this.client.getCollections();
      return (res.collections ?? []).map((c: any) => c.name as string);
    } catch (_e) {
      return [];
    }
  }
}
