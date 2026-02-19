/**
 * @module @dreamer/cache/adapters/redis
 *
 * @fileoverview Redis 缓存适配器
 */

import { $tr } from "../i18n.ts";
import type { CacheAdapter, CacheItem } from "./types.ts";

/**
 * Redis 连接配置
 */
export interface RedisConnectionConfig {
  /** Redis 连接 URL（例如：redis://127.0.0.1:6379） */
  url?: string;
  /** Redis 主机地址（默认：127.0.0.1） */
  host?: string;
  /** Redis 端口（默认：6379） */
  port?: number;
  /** Redis 密码（可选） */
  password?: string;
  /** Redis 数据库编号（默认：0） */
  db?: number;
  /** Socket 选项 */
  socket?: {
    /** 是否启用 keepAlive（默认：false，减少内部定时器） */
    keepAlive?: boolean;
    /** 连接超时时间（毫秒，默认：5000） */
    connectTimeout?: number;
  };
}

/**
 * Redis 客户端接口
 */
export interface RedisClient {
  /** 设置键值 */
  set(
    key: string,
    value: string,
    options?: { EX?: number },
  ): Promise<void> | void;
  /** 获取值 */
  get(key: string): Promise<string | null> | string | null;
  /** 删除键 */
  del(key: string): Promise<number> | number;
  /** 检查键是否存在 */
  exists(key: string): Promise<number> | number;
  /** 获取所有匹配的键 */
  keys(pattern: string): Promise<string[]> | string[];
  /** 设置过期时间 */
  expire(key: string, seconds: number): Promise<number> | number;
  /** 断开连接 */
  disconnect?: () => Promise<void> | void;
  /** 退出连接 */
  quit?: () => Promise<void> | void;
}

/**
 * Redis 缓存适配器配置选项
 */
export interface RedisAdapterOptions {
  /** Redis 连接配置（如果提供，适配器会内部创建连接） */
  connection?: RedisConnectionConfig;
  /** Redis 客户端实例（如果提供 connection，则不需要提供 client） */
  client?: RedisClient;
  /** 键前缀（可选，默认：cache） */
  keyPrefix?: string;
}

/**
 * Redis 缓存适配器
 * 基于 Redis 的分布式缓存，支持 TTL 和标签
 */
export class RedisAdapter implements CacheAdapter {
  private client: RedisClient | null = null;
  private keyPrefix: string;
  private internalClient: any = null; // 内部创建的客户端
  private connectionConfig?: RedisConnectionConfig;

  constructor(options: RedisAdapterOptions = {}) {
    if (options.connection) {
      // 如果提供了连接配置，保存配置，稍后创建连接
      this.connectionConfig = options.connection;
      this.keyPrefix = options.keyPrefix || "cache";
    } else if (options.client) {
      // 如果提供了客户端，直接使用
      this.client = options.client;
      this.keyPrefix = options.keyPrefix || "cache";
    } else {
      throw new Error($tr("cache.redis.needConfig"));
    }
  }

  /**
   * 连接到 Redis（如果使用 connection 配置）
   */
  async connect(): Promise<void> {
    if (this.connectionConfig && !this.internalClient) {
      try {
        // 动态导入 Redis 客户端库
        // 在 Bun 中，直接使用包名；在 Deno 中，使用 npm: 前缀
        // 使用 runtime-adapter 来检测运行时环境，确保与 bun 兼容
        const redisModule = await import("redis");
        const { createClient } = redisModule;

        // 构建连接配置
        const clientOptions: any = {};
        if (this.connectionConfig.url) {
          clientOptions.url = this.connectionConfig.url;
          clientOptions.socket = {
            keepAlive: this.connectionConfig.socket?.keepAlive ?? false,
            connectTimeout: this.connectionConfig.socket?.connectTimeout ??
              5000,
            reconnectStrategy: false,
          };
        } else {
          clientOptions.socket = {
            host: this.connectionConfig.host || "127.0.0.1",
            port: this.connectionConfig.port || 6379,
            keepAlive: this.connectionConfig.socket?.keepAlive ?? false,
            connectTimeout: this.connectionConfig.socket?.connectTimeout ??
              5000,
            reconnectStrategy: false,
          };
          if (this.connectionConfig.password) {
            clientOptions.password = this.connectionConfig.password;
          }
          if (this.connectionConfig.db !== undefined) {
            clientOptions.database = this.connectionConfig.db;
          }
        }

        // 创建并连接客户端
        this.internalClient = createClient(clientOptions);
        await this.internalClient.connect();

        // 包装为适配器需要的接口
        this.client = {
          set: async (
            key: string,
            value: string,
            options?: { EX?: number },
          ) => {
            if (options?.EX) {
              await this.internalClient.setEx(key, options.EX, value);
            } else {
              await this.internalClient.set(key, value);
            }
          },
          get: (key: string) => this.internalClient.get(key),
          del: (key: string) => this.internalClient.del(key),
          exists: (key: string) => this.internalClient.exists(key),
          keys: (pattern: string) => this.internalClient.keys(pattern),
          expire: (key: string, seconds: number) =>
            this.internalClient.expire(key, seconds),
          disconnect: async () => {
            await this.internalClient.quit();
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error($tr("cache.redis.connectFailed", { message }));
      }
    }
  }

  /**
   * 断开 Redis 连接
   */
  async disconnect(): Promise<void> {
    if (this.internalClient) {
      try {
        if (this.internalClient.quit) {
          await this.internalClient.quit();
        }
      } catch {
        // 忽略关闭错误
      } finally {
        this.internalClient = null;
        this.client = null;
      }
    } else if (this.client?.disconnect) {
      const result = this.client.disconnect();
      if (result instanceof Promise) {
        await result;
      }
    }
  }

  /**
   * 获取完整的键名（带前缀）
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * 获取标签键名
   */
  private getTagKey(tag: string): string {
    return `${this.keyPrefix}:tag:${tag}`;
  }

  /**
   * 获取缓存
   */
  async get(key: string): Promise<unknown> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    try {
      const fullKey = this.getFullKey(key);
      const result = this.client.get(fullKey);
      const value = result instanceof Promise ? await result : result;

      if (!value) {
        return undefined;
      }

      const item: CacheItem = JSON.parse(value);

      // 检查是否过期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        await this.delete(key);
        return undefined;
      }

      // 更新访问信息
      item.accessedAt = Date.now();
      item.accessCount++;
      await this.set(key, item.value, undefined, item.tags);

      return item.value;
    } catch {
      return undefined;
    }
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），可选
   * @param tags 标签数组，可选，用于批量删除
   */
  async set(
    key: string,
    value: unknown,
    ttl?: number,
    tags?: string[],
  ): Promise<void> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    const now = Date.now();
    const expiresAt = ttl ? now + ttl * 1000 : undefined;

    const item: CacheItem = {
      value,
      expiresAt,
      accessedAt: now,
      accessCount: 0,
      tags: tags || undefined,
    };

    const fullKey = this.getFullKey(key);
    const itemStr = JSON.stringify(item);

    // 设置缓存值
    if (ttl) {
      const setResult = this.client.set(fullKey, itemStr, { EX: ttl });
      if (setResult instanceof Promise) {
        await setResult;
      }
    } else {
      const setResult = this.client.set(fullKey, itemStr);
      if (setResult instanceof Promise) {
        await setResult;
      }
    }

    // 如果设置了标签，将键添加到标签集合中
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        const tagKey = this.getTagKey(tag);
        // 使用 Redis SET 存储标签关联的键（简化实现，实际可以使用 SET 数据结构）
        const tagSetKey = `${tagKey}:keys`;
        const keysResult = this.client.get(tagSetKey);
        const existingKeys = keysResult instanceof Promise
          ? await keysResult
          : keysResult;
        const keys = existingKeys ? JSON.parse(existingKeys) : [];
        if (!keys.includes(fullKey)) {
          keys.push(fullKey);
          const setResult = this.client.set(tagSetKey, JSON.stringify(keys));
          if (setResult instanceof Promise) {
            await setResult;
          }
        }
      }
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    const fullKey = this.getFullKey(key);
    const delResult = this.client.del(fullKey);
    if (delResult instanceof Promise) {
      await delResult;
    }
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    try {
      const fullKey = this.getFullKey(key);
      const result = this.client.exists(fullKey);
      const exists = result instanceof Promise ? await result : result;
      return exists > 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    try {
      const pattern = `${this.keyPrefix}:*`;
      const result = this.client.keys(pattern);
      const allKeys = result instanceof Promise ? await result : result;

      // 过滤掉标签相关的键
      const keys: string[] = [];
      for (const fullKey of allKeys) {
        if (!fullKey.includes(":tag:")) {
          const key = fullKey.replace(`${this.keyPrefix}:`, "");
          if (await this.has(key)) {
            keys.push(key);
          }
        }
      }

      return keys;
    } catch {
      return [];
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.delete(key);
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 批量获取
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 批量设置
   */
  async setMany(data: Record<string, unknown>, ttl?: number): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      await this.set(key, value, ttl);
    }
  }

  /**
   * 根据标签删除缓存
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  async deleteByTags(tags: string[]): Promise<number> {
    if (!this.client) {
      throw new Error($tr("cache.redis.notConnected"));
    }

    if (!tags || tags.length === 0) {
      return 0;
    }

    const keysToDelete: Set<string> = new Set();

    // 从标签集合中获取所有关联的键
    for (const tag of tags) {
      const tagKey = this.getTagKey(tag);
      const tagSetKey = `${tagKey}:keys`;
      const keysResult = this.client.get(tagSetKey);
      const existingKeys = keysResult instanceof Promise
        ? await keysResult
        : keysResult;
      if (existingKeys) {
        const keys = JSON.parse(existingKeys);
        for (const fullKey of keys) {
          const key = fullKey.replace(`${this.keyPrefix}:`, "");
          keysToDelete.add(key);
        }
      }
    }

    // 删除所有匹配的键
    let deletedCount = 0;
    for (const key of keysToDelete) {
      try {
        await this.delete(key);
        deletedCount++;
      } catch {
        // 忽略删除错误
      }
    }

    return deletedCount;
  }
}
