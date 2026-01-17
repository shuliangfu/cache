/**
 * @module @dreamer/cache/adapters
 *
 * @fileoverview 缓存适配器模块导出
 */

// 导出类型
export type { CacheAdapter, CacheItem, CacheStrategy } from "./types.ts";

// 导出内存适配器
export * from "./memory.ts";

// 导出文件适配器
export * from "./file.ts";

// 导出 Redis 适配器
export * from "./redis.ts";

// 导出 Memcached 适配器
export * from "./memcached.ts";
