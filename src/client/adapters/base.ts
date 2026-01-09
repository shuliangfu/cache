/**
 * @module @dreamer/cache/client/adapters/base
 *
 * @fileoverview 客户端缓存适配器基础接口和类型定义
 */


/**
 * 缓存项（带过期时间）
 */
export interface CacheItem<T = unknown> {
  /** 缓存值 */
  value: T;
  /** 过期时间（时间戳，毫秒） */
  expiresAt?: number;
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
   * 获取缓存值
   */
  get(key: string): unknown | Promise<unknown>;

  /**
   * 设置缓存值
   */
  set(key: string, value: unknown, ttl?: number): void | Promise<void>;

  /**
   * 删除缓存值
   */
  delete(key: string): void | Promise<void>;

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean | Promise<boolean>;

  /**
   * 获取所有键
   */
  keys(): string[] | Promise<string[]>;

  /**
   * 清空所有缓存
   */
  clear(): void | Promise<void>;

  /**
   * 批量获取
   */
  getMany(keys: string[]): Promise<Record<string, unknown>>;

  /**
   * 批量设置
   */
  setMany(data: Record<string, unknown>, ttl?: number): Promise<void>;
}
