/**
 * @module @dreamer/cache/adapters/memcached
 *
 * @fileoverview Memcached 缓存适配器
 *
 * 使用 Memcached 作为缓存后端，支持 TTL 和标签。
 * Memcached 是内存缓存系统，性能高，适合单机或小规模分布式场景。
 */

import { $tr } from "../i18n.ts";
import type { CacheAdapter, CacheItem } from "./types.ts";

/**
 * Memcached 连接配置
 */
export interface MemcachedConnectionConfig {
  /** Memcached 服务器地址（默认：127.0.0.1） */
  host?: string;
  /** Memcached 端口（默认：11211） */
  port?: number;
  /** 连接超时时间（毫秒，默认：5000） */
  timeout?: number;
  /** 是否启用压缩（默认：false） */
  compress?: boolean;
  /** 最大连接数（默认：10） */
  maxConnections?: number;
}

/**
 * Memcached 客户端接口
 */
export interface MemcachedClient {
  /** 设置键值 */
  set(
    key: string,
    value: string,
    options?: { expires?: number },
  ): Promise<boolean>;
  /** 获取值 */
  get(key: string): Promise<string | null>;
  /** 删除键 */
  delete(key: string): Promise<boolean>;
  /** 批量获取值 */
  getMulti?(keys: string[]): Promise<Record<string, string | null>>;
  /** 关闭连接 */
  close?: () => Promise<void> | void;
  /** 退出连接 */
  quit?: () => Promise<void> | void;
}

/**
 * Memcached 缓存适配器配置选项
 */
export interface MemcachedAdapterOptions {
  /** Memcached 连接配置（如果提供，适配器会内部创建连接） */
  connection?: MemcachedConnectionConfig;
  /** Memcached 客户端实例（如果提供 connection，则不需要提供 client） */
  client?: MemcachedClient;
  /** 键前缀（可选，默认：cache） */
  keyPrefix?: string;
}

/**
 * Memcached 缓存适配器
 * 基于 Memcached 的内存缓存，支持 TTL 和标签
 *
 * ⚠️ 注意：Memcached 是内存缓存系统，数据存储在内存中。
 * 只要 Memcached 服务不重启，数据不会丢失。但服务重启后数据会丢失。
 * 如果需要真正的持久化（服务重启后数据不丢失），请使用 RedisAdapter 或 FileAdapter。
 */
export class MemcachedAdapter implements CacheAdapter {
  private client: MemcachedClient | null = null;
  private keyPrefix: string;
  private internalClient: any = null; // 内部创建的客户端
  private connectionConfig?: MemcachedConnectionConfig;

  constructor(options: MemcachedAdapterOptions = {}) {
    if (options.connection) {
      // 如果提供了连接配置，保存配置，稍后创建连接
      this.connectionConfig = options.connection;
      this.keyPrefix = options.keyPrefix || "cache";
    } else if (options.client) {
      // 如果提供了客户端，直接使用
      this.client = options.client;
      this.keyPrefix = options.keyPrefix || "cache";
    } else {
      throw new Error($tr("cache.memcached.needConfig"));
    }
  }

  /**
   * 连接到 Memcached（如果使用 connection 配置）
   */
  async connect(): Promise<void> {
    if (this.connectionConfig && !this.internalClient) {
      try {
        // 动态导入 memcache-client（npm 包）
        const { MemcacheClient } = await import("memcache-client");

        // 构建连接配置
        const host = this.connectionConfig.host || "127.0.0.1";
        const port = this.connectionConfig.port || 11211;
        const timeout = this.connectionConfig.timeout || 5000;
        const compress = this.connectionConfig.compress || false;
        const maxConnections = this.connectionConfig.maxConnections || 10;

        // 创建 Memcached 客户端
        const clientOptions: any = {
          server: `${host}:${port}`,
          connectTimeout: timeout,
          cmdTimeout: timeout, // 命令超时时间
          maxConnections,
        };

        // 如果启用压缩，添加 compressor 选项
        if (compress) {
          clientOptions.compressor = true;
        }

        this.internalClient = new MemcacheClient(clientOptions);

        // 包装为适配器需要的接口
        this.client = {
          set: async (
            key: string,
            value: string,
            options?: { expires?: number },
          ) => {
            // Memcached 的过期时间以秒为单位（lifetime 选项）
            // options.expires 以毫秒为单位，需要转换为秒
            const lifetime = options?.expires
              ? Math.floor(options.expires / 1000)
              : undefined;
            await this.internalClient.set(key, value, { lifetime });
            return true;
          },
          get: async (key: string) => {
            const result = await this.internalClient.get(key);
            // memcache-client 返回 { value: ... } 格式
            if (result && typeof result === "object" && "value" in result) {
              const value = result.value;
              // 如果 value 是 Uint8Array，转换为字符串
              if (value instanceof Uint8Array) {
                return new TextDecoder().decode(value);
              }
              // 如果是字符串，直接返回
              if (typeof value === "string") {
                return value;
              }
              // 其他类型转换为 JSON 字符串
              return JSON.stringify(value);
            }
            return null;
          },
          delete: async (key: string) => {
            await this.internalClient.delete(key);
            return true;
          },
          getMulti: async (keys: string[]) => {
            // memcache-client 支持传入数组到 get 方法
            const results = await this.internalClient.get(keys);
            const record: Record<string, string | null> = {};
            for (const key of keys) {
              const result = results[key];
              if (result && typeof result === "object" && "value" in result) {
                const value = result.value;
                // 如果 value 是 Uint8Array，转换为字符串
                if (value instanceof Uint8Array) {
                  record[key] = new TextDecoder().decode(value);
                } else if (typeof value === "string") {
                  record[key] = value;
                } else {
                  record[key] = JSON.stringify(value);
                }
              } else {
                record[key] = null;
              }
            }
            return record;
          },
          close: async () => {
            await this.internalClient.quit();
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error($tr("cache.memcached.connectFailed", { message }));
      }
    }
  }

  /**
   * 断开 Memcached 连接
   */
  async disconnect(): Promise<void> {
    if (this.internalClient) {
      try {
        if (this.internalClient.quit) {
          await this.internalClient.quit();
        } else if (this.internalClient.close) {
          await this.internalClient.close();
        }
      } catch {
        // 忽略断开错误
      } finally {
        this.internalClient = null;
        this.client = null;
      }
    } else if (this.client?.close) {
      const result = this.client.close();
      if (result instanceof Promise) {
        await result;
      }
    } else if (this.client?.quit) {
      const result = this.client.quit();
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
      throw new Error($tr("cache.memcached.notConnected"));
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
      throw new Error($tr("cache.memcached.notConnected"));
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

    // 设置缓存值（Memcached 的过期时间以秒为单位）
    // 注意：包装的 client.set 方法会将 expires（毫秒）转换为 lifetime（秒）
    const expires = ttl ? ttl * 1000 : undefined; // 转换为毫秒，client.set 会再转换为秒
    const setResult = this.client.set(fullKey, itemStr, {
      expires,
    });
    if (setResult instanceof Promise) {
      await setResult;
    }

    // 更新键列表（用于 keys() 方法）
    const keysListKey = `${this.keyPrefix}:keys:list`;
    try {
      const keysResult = this.client.get(keysListKey);
      const existingKeysStr = keysResult instanceof Promise
        ? await keysResult
        : keysResult;
      let existingKeys: string[] = [];
      if (existingKeysStr) {
        try {
          const parsed = JSON.parse(existingKeysStr);
          // 确保解析结果是数组
          if (Array.isArray(parsed)) {
            existingKeys = parsed;
          }
        } catch {
          // JSON 解析失败，使用空数组
          existingKeys = [];
        }
      }
      if (!existingKeys.includes(fullKey)) {
        existingKeys.push(fullKey);
        const setKeysResult = this.client.set(
          keysListKey,
          JSON.stringify(existingKeys),
        );
        if (setKeysResult instanceof Promise) {
          await setKeysResult;
        }
      }
    } catch {
      // 忽略键列表更新错误，不影响主功能
    }

    // 如果设置了标签，将键添加到标签集合中
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        const tagKey = this.getTagKey(tag);
        const tagSetKey = `${tagKey}:keys`;
        const keysResult = this.client.get(tagSetKey);
        const existingKeys = keysResult instanceof Promise
          ? await keysResult
          : keysResult;
        let keys: string[] = [];
        if (existingKeys) {
          try {
            const parsed = JSON.parse(existingKeys);
            // 确保解析结果是数组
            if (Array.isArray(parsed)) {
              keys = parsed;
            }
          } catch {
            // JSON 解析失败，使用空数组
            keys = [];
          }
        }
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
      throw new Error($tr("cache.memcached.notConnected"));
    }

    const fullKey = this.getFullKey(key);
    const delResult = this.client.delete(fullKey);
    if (delResult instanceof Promise) {
      await delResult;
    }

    // 从键列表中移除
    const keysListKey = `${this.keyPrefix}:keys:list`;
    try {
      const keysResult = this.client.get(keysListKey);
      const existingKeysStr = keysResult instanceof Promise
        ? await keysResult
        : keysResult;
      if (existingKeysStr) {
        try {
          const parsed = JSON.parse(existingKeysStr);
          // 确保解析结果是数组
          if (Array.isArray(parsed)) {
            const existingKeys: string[] = parsed;
            const updatedKeys = existingKeys.filter((k) => k !== fullKey);
            if (updatedKeys.length !== existingKeys.length) {
              const setKeysResult = this.client.set(
                keysListKey,
                JSON.stringify(updatedKeys),
              );
              if (setKeysResult instanceof Promise) {
                await setKeysResult;
              }
            }
          }
        } catch {
          // JSON 解析失败，忽略
        }
      }
    } catch {
      // 忽略键列表更新错误，不影响主功能
    }
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error($tr("cache.memcached.notConnected"));
    }

    try {
      const fullKey = this.getFullKey(key);
      const result = this.client.get(fullKey);
      const value = result instanceof Promise ? await result : result;
      if (!value) {
        return false;
      }

      const item: CacheItem = JSON.parse(value);
      // 检查是否过期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        await this.delete(key);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取所有键
   * ⚠️ 注意：Memcached 不支持 keys 命令，此方法通过维护一个键列表来实现
   * 由于 Memcached 的限制，此功能可能不完整
   * 建议：如果需要完整的 keys 功能，请使用 Redis 适配器
   */
  async keys(): Promise<string[]> {
    if (!this.client) {
      throw new Error($tr("cache.memcached.notConnected"));
    }

    try {
      // Memcached 不支持 keys 命令，我们需要维护一个键列表
      const keysListKey = `${this.keyPrefix}:keys:list`;
      const keysResult = this.client.get(keysListKey);
      const keysStr = keysResult instanceof Promise
        ? await keysResult
        : keysResult;

      if (!keysStr) {
        return [];
      }

      let fullKeys: string[] = [];
      try {
        const parsed = JSON.parse(keysStr);
        // 确保解析结果是数组
        if (Array.isArray(parsed)) {
          fullKeys = parsed;
        } else {
          // 如果不是数组，返回空数组
          return [];
        }
      } catch {
        // JSON 解析失败，返回空数组
        return [];
      }

      const keys: string[] = [];

      // 验证每个键是否仍然存在
      for (const fullKey of fullKeys) {
        if (
          fullKey.startsWith(`${this.keyPrefix}:`) &&
          !fullKey.includes(":tag:")
        ) {
          const key = fullKey.replace(`${this.keyPrefix}:`, "");
          if (await this.has(key)) {
            keys.push(key);
          }
        }
      }

      // 更新键列表
      if (keys.length !== fullKeys.length) {
        const updatedFullKeys = keys.map((k) => this.getFullKey(k));
        const setResult = this.client.set(
          keysListKey,
          JSON.stringify(updatedFullKeys),
        );
        if (setResult instanceof Promise) {
          await setResult;
        }
      }

      return keys;
    } catch {
      return [];
    }
  }

  /**
   * 清空所有缓存
   * ⚠️ 注意：Memcached 不支持 flush_all 命令（需要特殊配置），此方法通过删除所有已知键来实现
   */
  async clear(): Promise<void> {
    if (!this.client) {
      throw new Error($tr("cache.memcached.notConnected"));
    }

    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.delete(key);
      }

      // 清空键列表
      const keysListKey = `${this.keyPrefix}:keys:list`;
      const delKeysResult = this.client.delete(keysListKey);
      if (delKeysResult instanceof Promise) {
        await delKeysResult;
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 批量获取
   * 性能优化：使用 getMulti 批量获取（如果支持）
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new Error($tr("cache.memcached.notConnected"));
    }

    const result: Record<string, unknown> = {};

    // 性能优化：使用 getMulti 批量获取（如果支持）
    if (this.client.getMulti && keys.length > 1) {
      const fullKeys = keys.map((key) => this.getFullKey(key));
      const valuesRecord = await this.client.getMulti(fullKeys);

      for (const key of keys) {
        const fullKey = this.getFullKey(key);
        const value = valuesRecord[fullKey];
        if (value) {
          try {
            const item: CacheItem = JSON.parse(value);
            // 检查是否过期
            if (item.expiresAt && Date.now() > item.expiresAt) {
              await this.delete(key);
              continue;
            }
            result[key] = item.value;
          } catch {
            // 忽略解析错误
          }
        }
      }
    } else {
      // 回退到单个获取
      for (const key of keys) {
        const value = await this.get(key);
        if (value !== undefined) {
          result[key] = value;
        }
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
      throw new Error($tr("cache.memcached.notConnected"));
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
        try {
          const parsed = JSON.parse(existingKeys);
          // 确保解析结果是数组
          if (Array.isArray(parsed)) {
            const keys = parsed;
            for (const fullKey of keys) {
              const key = fullKey.replace(`${this.keyPrefix}:`, "");
              keysToDelete.add(key);
            }
          }
        } catch {
          // JSON 解析失败，跳过该标签
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
