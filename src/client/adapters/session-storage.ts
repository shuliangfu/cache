/**
 * @module @dreamer/cache/client/adapters/session-storage
 *
 * @fileoverview sessionStorage 缓存适配器
 */


import type { CacheAdapter, CacheItem } from "./base.ts";

/**
 * sessionStorage 缓存适配器配置选项
 */
export interface SessionStorageAdapterOptions {
  /** 键前缀（默认：空） */
  prefix?: string;
  /** 默认过期时间（秒） */
  ttl?: number;
  /** 最大大小（字节，默认：5MB） */
  maxSize?: number;
}

/**
 * sessionStorage 缓存适配器
 */
export class SessionStorageAdapter implements CacheAdapter {
  private options: Required<SessionStorageAdapterOptions>;
  private storage: Storage;

  constructor(options: SessionStorageAdapterOptions = {}) {
    if (typeof sessionStorage === "undefined") {
      throw new Error("sessionStorage 不可用，请在浏览器环境中使用");
    }

    this.storage = sessionStorage;
    this.options = {
      prefix: options.prefix || "",
      ttl: options.ttl || 0,
      maxSize: options.maxSize || 5 * 1024 * 1024, // 5MB
    };
  }

  private getKey(key: string): string {
    return this.options.prefix + key;
  }

  get(key: string): unknown {
    try {
      const storageKey = this.getKey(key);
      const itemStr = this.storage.getItem(storageKey);
      if (!itemStr) {
        return undefined;
      }

      const item: CacheItem = JSON.parse(itemStr);

      // 检查是否过期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.storage.removeItem(storageKey);
        return undefined;
      }

      return item.value;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown, ttl?: number, tags?: string[]): void {
    try {
      const storageKey = this.getKey(key);
      const now = Date.now();
      const expiresAt = ttl
        ? now + ttl * 1000
        : this.options.ttl > 0
        ? now + this.options.ttl * 1000
        : undefined;

      const item: CacheItem = {
        value,
        expiresAt,
        tags: tags || undefined,
      };

      const itemStr = JSON.stringify(item);
      const size = new Blob([itemStr]).size;

      // 检查大小限制
      if (size > this.options.maxSize) {
        throw new Error(
          `缓存项大小超过限制: ${size} > ${this.options.maxSize}`,
        );
      }

      this.storage.setItem(storageKey, itemStr);
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        throw new Error("sessionStorage 存储空间已满");
      }
      throw error;
    }
  }

  delete(key: string): void {
    const storageKey = this.getKey(key);
    this.storage.removeItem(storageKey);
  }

  has(key: string): boolean {
    const value = this.get(key);
    return value !== undefined;
  }

  keys(): string[] {
    const keys: string[] = [];
    const prefix = this.options.prefix;

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(prefix)) {
        const originalKey = key.substring(prefix.length);
        if (this.has(originalKey)) {
          keys.push(originalKey);
        }
      }
    }

    return keys;
  }

  clear(): void {
    const prefix = this.options.prefix;
    const keysToDelete: string[] = [];

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.storage.removeItem(key);
    }
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
    const prefix = this.options.prefix;

    // 遍历所有存储的键
    for (let i = 0; i < this.storage.length; i++) {
      const storageKey = this.storage.key(i);
      if (storageKey && storageKey.startsWith(prefix)) {
        try {
          const itemStr = this.storage.getItem(storageKey);
          if (itemStr) {
            const item: CacheItem = JSON.parse(itemStr);
            // 检查是否匹配标签
            if (item.tags && item.tags.some((tag) => tagSet.has(tag))) {
              const originalKey = storageKey.substring(prefix.length);
              keysToDelete.push(originalKey);
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    // 删除匹配的缓存项
    for (const key of keysToDelete) {
      this.delete(key);
    }

    return keysToDelete.length;
  }
}
