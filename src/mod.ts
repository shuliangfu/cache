/**
 * @module @dreamer/cache
 *
 * 缓存库，提供统一的缓存接口，支持多种缓存后端。
 *
 * 功能特性：
 * - 内存缓存：基于 Map 的内存缓存，支持 LRU、FIFO、LFU 策略
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

/**
 * 缓存项
 */
interface CacheItem<T = unknown> {
  /** 缓存值 */
  value: T;
  /** 过期时间（时间戳，毫秒） */
  expiresAt?: number;
  /** 访问时间（用于 LRU） */
  accessedAt: number;
  /** 访问次数（用于 LFU） */
  accessCount: number;
}

/**
 * 缓存策略类型
 */
export type CacheStrategy = "lru" | "fifo" | "lfu";

/**
 * 缓存适配器接口
 */
export interface CacheAdapter {
  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值，如果不存在或已过期返回 undefined
   */
  get(key: string): Promise<unknown> | unknown;

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），可选
   */
  set(key: string, value: unknown, ttl?: number): Promise<void> | void;

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): Promise<void> | void;

  /**
   * 检查键是否存在
   * @param key 缓存键
   * @returns 是否存在
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * 获取所有键
   * @returns 所有缓存键
   */
  keys(): Promise<string[]> | string[];

  /**
   * 清空所有缓存
   */
  clear(): Promise<void> | void;

  /**
   * 批量获取
   * @param keys 缓存键数组
   * @returns 键值对对象
   */
  getMany(keys: string[]): Promise<Record<string, unknown>>;

  /**
   * 批量设置
   * @param data 键值对对象
   * @param ttl 过期时间（秒），可选
   */
  setMany(data: Record<string, unknown>, ttl?: number): Promise<void>;
}

/**
 * 内存缓存适配器配置选项
 */
export interface MemoryAdapterOptions {
  /** 默认过期时间（秒） */
  ttl?: number;
  /** 最大缓存项数量 */
  maxSize?: number;
  /** 缓存策略（默认：lru） */
  strategy?: CacheStrategy;
}

/**
 * 内存缓存适配器
 * 基于 Map 实现的内存缓存，支持 LRU、FIFO、LFU 策略和 TTL
 */
export class MemoryAdapter implements CacheAdapter {
  private cache: Map<string, CacheItem> = new Map();
  private options: Required<MemoryAdapterOptions>;
  private accessOrder: string[] = []; // 用于 FIFO/LRU
  private cleanupTimer?: number;

  constructor(options: MemoryAdapterOptions = {}) {
    this.options = {
      ttl: options.ttl || 0,
      maxSize: options.maxSize || Infinity,
      strategy: options.strategy || "lru",
    };

    // 如果设置了 TTL，启动定期清理
    if (this.options.ttl > 0) {
      this.startCleanup();
    }
  }

  /**
   * 获取缓存
   */
  get(key: string): unknown {
    const item = this.cache.get(key);

    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return undefined;
    }

    // 更新访问信息
    item.accessedAt = Date.now();
    item.accessCount++;

    // 更新访问顺序（LRU）
    if (this.options.strategy === "lru") {
      this.updateAccessOrder(key);
    }

    return item.value;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: unknown, ttl?: number): void {
    const now = Date.now();
    const expiresAt = ttl
      ? now + ttl * 1000
      : this.options.ttl > 0
      ? now + this.options.ttl * 1000
      : undefined;

    const item: CacheItem = {
      value,
      expiresAt,
      accessedAt: now,
      accessCount: 0,
    };

    // 如果已存在，更新
    if (this.cache.has(key)) {
      this.cache.set(key, item);
      if (this.options.strategy === "lru") {
        this.updateAccessOrder(key);
      }
      return;
    }

    // 检查是否需要淘汰
    if (this.cache.size >= this.options.maxSize) {
      this.evict();
    }

    // 添加新项
    this.cache.set(key, item);
    if (this.options.strategy === "fifo" || this.options.strategy === "lru") {
      this.accessOrder.push(key);
    }
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // 检查是否过期
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (!item.expiresAt || now <= item.expiresAt) {
        validKeys.push(key);
      } else {
        // 清理过期项
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
      }
    }

    return validKeys;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * 批量获取
   */
  getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return Promise.resolve(result);
  }

  /**
   * 批量设置
   */
  setMany(data: Record<string, unknown>, ttl?: number): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value, ttl);
    }
    return Promise.resolve();
  }

  /**
   * 淘汰缓存项
   */
  private evict(): void {
    if (this.cache.size === 0) {
      return;
    }

    let keyToRemove: string | undefined;

    switch (this.options.strategy) {
      case "fifo": {
        // 先进先出：移除最早添加的
        keyToRemove = this.accessOrder.shift();
        break;
      }

      case "lru": {
        // 最近最少使用：移除最久未访问的
        keyToRemove = this.accessOrder.shift();
        break;
      }

      case "lfu": {
        // 最少使用：移除访问次数最少的
        let minCount = Infinity;
        for (const [key, item] of this.cache.entries()) {
          if (item.accessCount < minCount) {
            minCount = item.accessCount;
            keyToRemove = key;
          }
        }
        break;
      }
    }

    if (keyToRemove) {
      this.cache.delete(keyToRemove);
      this.removeFromAccessOrder(keyToRemove);
    }
  }

  /**
   * 更新访问顺序（LRU）
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * 从访问顺序中移除
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * 启动定期清理过期项
   */
  private startCleanup(): void {
    // 每分钟清理一次
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, item] of this.cache.entries()) {
        if (item.expiresAt && now > item.expiresAt) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
      }
    }, 60000) as unknown as number;
  }

  /**
   * 停止清理定时器
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

/**
 * 缓存管理器
 * 提供统一的缓存操作接口，支持适配器切换
 */
export class CacheManager {
  private adapter: CacheAdapter;

  constructor(adapter: CacheAdapter) {
    this.adapter = adapter;
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
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const result = this.adapter.set(key, value, ttl);
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
}

/**
 * 多级缓存
 * 支持多个缓存适配器的级联查找
 */
export class MultiLevelCache implements CacheAdapter {
  private adapters: CacheAdapter[];

  constructor(...adapters: CacheAdapter[]) {
    if (adapters.length === 0) {
      throw new Error("至少需要一个缓存适配器");
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
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const promises = this.adapters.map((adapter) => {
      const result = adapter.set(key, value, ttl);
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
}
