/**
 * @module @dreamer/cache/client/adapters
 *
 * @fileoverview 客户端缓存适配器模块
 *
 * 导出所有客户端缓存适配器实现
 */

// 导出基础类型和接口
export type {
  CacheAdapter,
  CacheItem,
  CacheStrategy,
} from "./base.ts";

// 导出 localStorage 适配器
export type { LocalStorageAdapterOptions } from "./local-storage.ts";
export { LocalStorageAdapter } from "./local-storage.ts";

// 导出 sessionStorage 适配器
export type { SessionStorageAdapterOptions } from "./session-storage.ts";
export { SessionStorageAdapter } from "./session-storage.ts";

// 导出 IndexedDB 适配器
export type { IndexedDBAdapterOptions } from "./indexed-db.ts";
export { IndexedDBAdapter } from "./indexed-db.ts";

// 导出内存适配器
export type { MemoryAdapterOptions } from "./memory.ts";
export { MemoryAdapter } from "./memory.ts";
