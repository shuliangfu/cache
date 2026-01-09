/**
 * @module @dreamer/cache/client/adapters/memory
 *
 * @fileoverview 内存缓存适配器（客户端）
 */

import type { CacheAdapter, CacheItem, CacheStrategy } from "./base.ts";

/**
 * 内存缓存适配器配置选项（客户端）
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
 * 内存缓存适配器（客户端）
 * 与服务端实现相同，但用于浏览器环境
 */
export class MemoryAdapter implements CacheAdapter {
  private cache: Map<
    string,
    CacheItem & { accessedAt: number; accessCount: number }
  > = new Map();
  private options: Required<MemoryAdapterOptions>;
  private accessOrder: string[] = [];
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

  set(key: string, value: unknown, ttl?: number): void {
    const now = Date.now();
    const expiresAt = ttl
      ? now + ttl * 1000
      : this.options.ttl > 0
      ? now + this.options.ttl * 1000
      : undefined;

    const item = {
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

  delete(key: string): void {
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
  }

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

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

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
