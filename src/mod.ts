/**
 * @module @dreamer/cache
 *
 * 缓存库，提供统一的缓存接口，支持多种缓存后端。
 *
 * 功能特性：
 * - 内存缓存：基于 Map 的内存缓存，支持 LRU、FIFO、LFU 策略
 * - 文件缓存：基于文件系统的持久化缓存
 * - Redis 缓存：基于 Redis 的分布式缓存
 * - Memcached 缓存：基于 Memcached 的内存缓存（高性能）
 * - TTL 支持：自动过期时间管理
 * - 批量操作：支持批量读写
 * - 适配器模式：统一的缓存接口，易于扩展
 * - 多级缓存：支持多级缓存策略
 *
 * @example
 * ```typescript
 * import { MemoryAdapter, CacheManager } from "jsr:@dreamer/cache";
 *
 * const memoryCache = new MemoryAdapter({
 *   ttl: 3600,
 *   maxSize: 1000,
 *   strategy: "lru"
 * });
 *
 * const cache = new CacheManager(memoryCache);
 * await cache.set("key", "value");
 * const value = await cache.get("key");
 * ```
 */

// 导出适配器类型和接口
export type {
  CacheAdapter,
  CacheItem,
  CacheStrategy,
} from "./adapters/types.ts";
import type {
  MemcachedConnectionConfig,
  RedisConnectionConfig,
} from "./adapters/mod.ts";
import type { CacheAdapter } from "./adapters/types.ts";

// 导出所有适配器
export {
  FileAdapter,
  MemcachedAdapter,
  MemoryAdapter,
  RedisAdapter,
} from "./adapters/mod.ts";
export type {
  FileAdapterOptions,
  MemcachedAdapterOptions,
  MemcachedClient,
  MemcachedConnectionConfig,
  MemoryAdapterOptions,
  RedisAdapterOptions,
  RedisClient,
  RedisConnectionConfig,
} from "./adapters/mod.ts";
import { $tr } from "./i18n.ts";

// 导入服务容器类型（可选依赖）
import type { ServiceContainer } from "@dreamer/service";

export type Adapter = "memory" | "file" | "redis" | "memcached";

/**
 * 缓存配置选项
 * 统一的配置接口，支持所有适配器类型
 */
export interface CacheConfig {
  /** 适配器类型（memory、file、redis、memcached） */
  adapter?: Adapter;
  /** 默认过期时间（秒） */
  ttl?: number;
  /** 最大缓存项数量（仅 memory 和 file 适配器） */
  maxSize?: number;
  /** 缓存策略（仅 memory 适配器，默认：lru） */
  strategy?: "lru" | "fifo" | "lfu";
  /** 缓存目录（仅 file 适配器，默认：./cache） */
  cacheDir?: string;
  /** 自动清理（仅 file 适配器） */
  autoCleanup?: boolean;
  /** 清理间隔（仅 file 适配器，毫秒） */
  cleanupInterval?: number;
  /** Redis 连接配置（仅 redis 适配器） */
  connection?: RedisConnectionConfig;
  /** Redis 连接池配置（仅 redis 适配器） */
  pool?: {
    /** 最小连接数 */
    min?: number;
    /** 最大连接数 */
    max?: number;
  };
  /** Memcached 连接配置（仅 memcached 适配器） */
  memcachedConnection?: MemcachedConnectionConfig;
}

/**
 * 缓存管理器配置选项
 */
export interface CacheManagerOptions {
  /** 管理器名称（用于服务容器注册） */
  name?: string;
  /** 缓存适配器 */
  adapter: CacheAdapter;
}

/**
 * 缓存管理器
 * 提供统一的缓存操作接口，支持适配器切换和服务容器集成
 */
export class CacheManager {
  /** 缓存适配器 */
  private adapter: CacheAdapter;
  /** 服务容器引用 */
  private container?: ServiceContainer;
  /** 管理器名称 */
  private readonly managerName: string;

  /**
   * 创建缓存管理器
   * @param adapter 缓存适配器
   * @param name 管理器名称（默认：default）
   */
  constructor(adapter: CacheAdapter, name?: string);
  /**
   * 创建缓存管理器
   * @param options 配置选项
   */
  constructor(options: CacheManagerOptions);
  constructor(
    adapterOrOptions: CacheAdapter | CacheManagerOptions,
    name?: string,
  ) {
    if ("adapter" in adapterOrOptions) {
      // 使用配置对象
      this.adapter = adapterOrOptions.adapter;
      this.managerName = adapterOrOptions.name || "default";
    } else {
      // 使用适配器直接传入（向后兼容）
      this.adapter = adapterOrOptions;
      this.managerName = name || "default";
    }
  }

  /**
   * 获取管理器名称
   * @returns 管理器名称
   */
  getName(): string {
    return this.managerName;
  }

  /**
   * 设置服务容器
   * 将管理器注册到服务容器中
   * @param container 服务容器实例
   * @returns 当前管理器实例（链式调用）
   */
  setContainer(container: ServiceContainer): this {
    this.container = container;
    // 注册自身到容器
    const serviceName = this.managerName === "default"
      ? "cacheManager"
      : `cacheManager:${this.managerName}`;
    container.registerSingleton(serviceName, () => this);
    return this;
  }

  /**
   * 获取服务容器
   * @returns 服务容器实例或 undefined
   */
  getContainer(): ServiceContainer | undefined {
    return this.container;
  }

  /**
   * 从服务容器获取缓存管理器
   * @param container 服务容器实例
   * @param name 管理器名称（默认：default）
   * @returns 缓存管理器实例
   */
  static fromContainer(
    container: ServiceContainer,
    name?: string,
  ): CacheManager {
    const serviceName = !name || name === "default"
      ? "cacheManager"
      : `cacheManager:${name}`;
    return container.get<CacheManager>(serviceName);
  }

  /**
   * 设置适配器
   * @param adapter 新的缓存适配器
   */
  setAdapter(adapter: CacheAdapter): void {
    this.adapter = adapter;
  }

  /**
   * 获取当前适配器
   * @returns 当前缓存适配器
   */
  getAdapter(): CacheAdapter {
    return this.adapter;
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = this.adapter.get(key);
    return value instanceof Promise ? await value : (value as T | undefined);
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
    const result = this.adapter.set(key, value, ttl, tags);
    if (result instanceof Promise) {
      await result;
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async delete(key: string): Promise<void> {
    const result = this.adapter.delete(key);
    if (result instanceof Promise) {
      await result;
    }
  }

  /**
   * 检查键是否存在
   * @param key 缓存键
   * @returns 是否存在
   */
  async has(key: string): Promise<boolean> {
    const result = this.adapter.has(key);
    return result instanceof Promise ? await result : result;
  }

  /**
   * 获取所有键
   * @returns 所有缓存键
   */
  async keys(): Promise<string[]> {
    const result = this.adapter.keys();
    return result instanceof Promise ? await result : result;
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    const result = this.adapter.clear();
    if (result instanceof Promise) {
      await result;
    }
  }

  /**
   * 批量获取
   * @param keys 缓存键数组
   * @returns 键值对对象
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    return await this.adapter.getMany(keys);
  }

  /**
   * 批量设置
   * @param data 键值对对象
   * @param ttl 过期时间（秒），可选
   */
  async setMany(
    data: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    await this.adapter.setMany(data, ttl);
  }

  /**
   * 根据标签删除缓存
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  async deleteByTags(tags: string[]): Promise<number> {
    const result = this.adapter.deleteByTags(tags);
    return result instanceof Promise ? await result : result;
  }
}

/**
 * 多级缓存
 * 支持多个缓存适配器的级联查找
 */
export class MultiLevelCache implements CacheAdapter {
  private adapters: CacheAdapter[];

  constructor(...adapters: CacheAdapter[]) {
    if (adapters.length === 0) {
      throw new Error($tr("cache.atLeastOneAdapter"));
    }
    this.adapters = adapters;
  }

  /**
   * 获取缓存（按层级查找）
   */
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

  /**
   * 设置缓存（写入所有层级）
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
    const promises = this.adapters.map((adapter) => {
      const result = adapter.set(key, value, ttl, tags);
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  /**
   * 删除缓存（从所有层级删除）
   */
  async delete(key: string): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.delete(key);
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  /**
   * 检查键是否存在（检查所有层级）
   */
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

  /**
   * 获取所有键（合并所有层级的键）
   */
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

  /**
   * 清空所有缓存（清空所有层级）
   */
  async clear(): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.clear();
      return result instanceof Promise ? result : Promise.resolve();
    });
    await Promise.all(promises);
  }

  /**
   * 批量获取
   */
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

  /**
   * 批量设置（写入所有层级）
   */
  async setMany(
    data: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      return adapter.setMany(data, ttl);
    });
    await Promise.all(promises);
  }

  /**
   * 根据标签删除缓存（删除所有层级）
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  async deleteByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;
    const promises = this.adapters.map(async (adapter) => {
      const result = adapter.deleteByTags(tags);
      const deleted = result instanceof Promise ? await result : result;
      totalDeleted += deleted;
    });
    await Promise.all(promises);
    return totalDeleted;
  }
}

/**
 * 创建缓存管理器的工厂函数
 * @param adapter 缓存适配器
 * @param container 服务容器实例（可选）
 * @param name 管理器名称（可选，默认：default）
 * @returns 缓存管理器实例
 *
 * @example
 * ```typescript
 * import { createCacheManager, MemoryAdapter } from "@dreamer/cache";
 * import { ServiceContainer } from "@dreamer/service";
 *
 * const container = new ServiceContainer();
 * const adapter = new MemoryAdapter({ ttl: 3600 });
 *
 * // 创建并注册到服务容器
 * const cache = createCacheManager(adapter, container);
 *
 * // 之后可以从容器获取
 * const cacheFromContainer = CacheManager.fromContainer(container);
 * ```
 */
export function createCacheManager(
  adapter: CacheAdapter,
  container?: ServiceContainer,
  name?: string,
): CacheManager {
  const manager = new CacheManager(adapter, name);
  if (container) {
    manager.setContainer(container);
  }
  return manager;
}

// i18n 仅包内使用，不对外导出；测试需 setLocale 时从 ./i18n.ts 导入
