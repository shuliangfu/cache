/**
 * @module @dreamer/cache/client
 *
 * 客户端缓存工具库，提供浏览器存储的统一接口。
 *
 * 功能特性：
 * - localStorage 缓存适配器
 * - sessionStorage 缓存适配器
 * - IndexedDB 缓存适配器
 * - 内存缓存适配器
 * - TTL 支持：自动过期时间管理
 * - 批量操作：支持批量读写
 * - 多级缓存：支持多级缓存策略
 *
 * 环境兼容性：
 * - 服务端：❌ 不支持（Deno 运行时）
 * - 客户端：✅ 支持（浏览器环境）
 *
 * @example
 * ```typescript
 * import { LocalStorageAdapter, CacheManager } from "jsr:@dreamer/cache/client";
 *
 * const cache = new CacheManager(
 *   new LocalStorageAdapter({ prefix: "app:", ttl: 3600 })
 * );
 *
 * await cache.set("key", "value");
 * const value = await cache.get("key");
 * ```
 */

// 从适配器模块导入类型和接口
import type { CacheAdapter } from "./adapters/mod.ts";
export type { CacheAdapter, CacheItem, CacheStrategy } from "./adapters/mod.ts";

// 从适配器模块导入适配器
export type {
  IndexedDBAdapterOptions,
  LocalStorageAdapterOptions,
  MemoryAdapterOptions,
  SessionStorageAdapterOptions,
} from "./adapters/mod.ts";

export {
  IndexedDBAdapter,
  LocalStorageAdapter,
  MemoryAdapter,
  SessionStorageAdapter,
} from "./adapters/mod.ts";

/**
 * 缓存管理器（客户端）
 * 与服务端实现相同
 */
export class CacheManager {
  private adapter: CacheAdapter;

  constructor(adapter: CacheAdapter) {
    this.adapter = adapter;
  }

  setAdapter(adapter: CacheAdapter): void {
    this.adapter = adapter;
  }

  getAdapter(): CacheAdapter {
    return this.adapter;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = this.adapter.get(key);
    return value instanceof Promise ? await value : (value as T | undefined);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const result = this.adapter.set(key, value, ttl);
    if (result instanceof Promise) {
      await result;
    }
  }

  async delete(key: string): Promise<void> {
    const result = this.adapter.delete(key);
    if (result instanceof Promise) {
      await result;
    }
  }

  async has(key: string): Promise<boolean> {
    const result = this.adapter.has(key);
    return result instanceof Promise ? await result : result;
  }

  async keys(): Promise<string[]> {
    const result = this.adapter.keys();
    return result instanceof Promise ? await result : result;
  }

  async clear(): Promise<void> {
    const result = this.adapter.clear();
    if (result instanceof Promise) {
      await result;
    }
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    return await this.adapter.getMany(keys);
  }

  async setMany(
    data: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    await this.adapter.setMany(data, ttl);
  }
}

/**
 * 多级缓存（客户端）
 * 与服务端实现相同
 */
export class MultiLevelCache implements CacheAdapter {
  private adapters: CacheAdapter[];

  constructor(...adapters: CacheAdapter[]) {
    if (adapters.length === 0) {
      throw new Error("至少需要一个缓存适配器");
    }
    this.adapters = adapters;
  }

  async get(key: string): Promise<unknown> {
    // 从第一层开始查找
    for (let i = 0; i < this.adapters.length; i++) {
      const adapter = this.adapters[i];
      const value = adapter.get(key);
      const result = value instanceof Promise ? await value : value;

      if (result !== undefined) {
        // 如果找到，回填到上层缓存（除了当前层）
        for (let j = 0; j < i; j++) {
          const upperAdapter = this.adapters[j];
          upperAdapter.set(key, result);
        }
        return result;
      }
    }

    return undefined;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.set(key, value, ttl);
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  async delete(key: string): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.delete(key);
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  async has(key: string): Promise<boolean> {
    for (const adapter of this.adapters) {
      const result = adapter.has(key);
      const exists = result instanceof Promise ? await result : result;
      if (exists) {
        return true;
      }
    }
    return false;
  }

  async keys(): Promise<string[]> {
    const keySets = new Set<string>();

    for (const adapter of this.adapters) {
      const result = adapter.keys();
      const keys = result instanceof Promise ? await result : result;
      for (const key of keys) {
        keySets.add(key);
      }
    }

    return Array.from(keySets);
  }

  async clear(): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.clear();
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    // 从第一层开始查找
    for (let i = 0; i < this.adapters.length; i++) {
      const adapter = this.adapters[i];
      const adapterResult = await adapter.getMany(keys);

      // 合并结果
      for (const [key, value] of Object.entries(adapterResult)) {
        if (!(key in result)) {
          result[key] = value;

          // 回填到上层缓存
          for (let j = 0; j < i; j++) {
            const upperAdapter = this.adapters[j];
            upperAdapter.set(key, value);
          }
        }
      }

      // 如果所有键都已找到，提前返回
      if (Object.keys(result).length === keys.length) {
        break;
      }
    }

    return result;
  }

  async setMany(
    data: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      return adapter.setMany(data, ttl);
    });
    await Promise.all(promises);
  }
}
