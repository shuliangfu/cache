/**
 * @module @dreamer/cache/adapters/types
 *
 * @fileoverview 缓存适配器类型定义
 */

/**
 * 缓存项
 */
export interface CacheItem<T = unknown> {
  /** 缓存值 */
  value: T;
  /** 过期时间（时间戳，毫秒） */
  expiresAt?: number;
  /** 访问时间（用于 LRU） */
  accessedAt: number;
  /** 访问次数（用于 LFU） */
  accessCount: number;
  /** 标签数组（用于批量删除） */
  tags?: string[];
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
   * @param tags 标签数组，可选，用于批量删除
   */
  set(
    key: string,
    value: unknown,
    ttl?: number,
    tags?: string[],
  ): Promise<void> | void;

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

  /**
   * 根据标签删除缓存
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  deleteByTags(tags: string[]): Promise<number> | number;
}
