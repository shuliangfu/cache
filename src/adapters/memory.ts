/**
 * @module @dreamer/cache/adapters/memory
 *
 * @fileoverview 内存缓存适配器
 */

import type { CacheAdapter, CacheItem, CacheStrategy } from "./types.ts";

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
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），可选
   * @param tags 标签数组，可选，用于批量删除
   */
  set(key: string, value: unknown, ttl?: number, tags?: string[]): void {
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
      tags: tags || undefined,
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
   * 根据标签删除缓存
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  deleteByTags(tags: string[]): number {
    if (!tags || tags.length === 0) {
      return 0;
    }

    const tagSet = new Set(tags);
    const keysToDelete: string[] = [];

    // 遍历所有缓存项，查找匹配的标签
    for (const [key, item] of this.cache.entries()) {
      if (item.tags && item.tags.some((tag) => tagSet.has(tag))) {
        keysToDelete.push(key);
      }
    }

    // 删除匹配的缓存项
    for (const key of keysToDelete) {
      this.delete(key);
    }

    return keysToDelete.length;
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
