/**
 * @module @dreamer/cache/client/adapters/indexed-db
 *
 * @fileoverview IndexedDB 缓存适配器
 */

/**
 * IndexedDB 相关类型定义（浏览器 API，在 Deno 服务端不可用）
 */
interface IDBDatabase {
  name: string;
  version: number;
  objectStoreNames: DOMStringList;
  close(): void;
  transaction(
    storeNames: string | string[],
    mode?: "readonly" | "readwrite" | "versionchange",
  ): IDBTransaction;
  createObjectStore(
    name: string,
    options?: IDBObjectStoreParameters,
  ): IDBObjectStore;
  deleteObjectStore(name: string): void;
}

interface IDBOpenDBRequest extends IDBRequest {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
  onblocked: ((event: Event) => void) | null;
}

interface IDBRequest {
  result: any;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface IDBTransaction {
  objectStore(name: string): IDBObjectStore;
  mode: "readonly" | "readwrite" | "versionchange";
  abort(): void;
  commit(): void;
  oncomplete: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onabort: ((event: Event) => void) | null;
}

interface IDBObjectStore {
  add(value: any, key?: IDBValidKey): IDBRequest;
  put(value: any, key?: IDBValidKey): IDBRequest;
  get(key: IDBValidKey): IDBRequest;
  delete(key: IDBValidKey): IDBRequest;
  clear(): IDBRequest;
  count(query?: IDBValidKey | IDBKeyRange): IDBRequest;
  getAllKeys(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number,
  ): IDBRequest;
  openCursor(
    query?: IDBValidKey | IDBKeyRange | null,
    direction?: "next" | "prev" | "nextunique" | "prevunique",
  ): IDBRequest;
}

interface IDBKeyRange {
  lower: any;
  upper: any;
  lowerOpen: boolean;
  upperOpen: boolean;
}

interface IDBKeyRangeConstructor {
  bound(
    lower: any,
    upper: any,
    lowerOpen?: boolean,
    upperOpen?: boolean,
  ): IDBKeyRange;
  lowerBound(lower: any, open?: boolean): IDBKeyRange;
  upperBound(upper: any, open?: boolean): IDBKeyRange;
  only(value: any): IDBKeyRange;
}

interface IDBVersionChangeEvent extends Event {
  oldVersion: number;
  newVersion: number | null;
}

interface IDBObjectStoreParameters {
  keyPath?: string | string[] | null;
  autoIncrement?: boolean;
}

interface DOMStringList {
  readonly length: number;
  contains(string: string): boolean;
  item(index: number): string | null;
}

type IDBValidKey =
  | string
  | number
  | Date
  | ArrayBufferView
  | ArrayBuffer
  | IDBArrayKey;

interface IDBArrayKey extends Array<IDBValidKey> {}

/**
 * IndexedDB 全局对象类型
 */
interface IndexedDB {
  open(name: string, version?: number): IDBOpenDBRequest;
  deleteDatabase(name: string): IDBRequest;
}

import type { CacheAdapter, CacheItem } from "./base.ts";

/**
 * IndexedDB 缓存适配器配置选项
 */
export interface IndexedDBAdapterOptions {
  /** 数据库名称 */
  dbName: string;
  /** 存储名称 */
  storeName?: string;
  /** 数据库版本 */
  version?: number;
  /** 默认过期时间（秒） */
  ttl?: number;
  /** 最大大小（字节） */
  maxSize?: number;
}

/**
 * IndexedDB 缓存适配器
 */
export class IndexedDBAdapter implements CacheAdapter {
  private options: Required<Omit<IndexedDBAdapterOptions, "maxSize">> & {
    maxSize?: number;
  };
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: IndexedDBAdapterOptions) {
    // 使用类型断言，因为 Deno 的类型定义可能不包含 indexedDB
    const indexedDB = (globalThis as any).indexedDB as IndexedDB | undefined;
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB 不可用，请在浏览器环境中使用");
    }

    this.options = {
      dbName: options.dbName,
      storeName: options.storeName || "cache",
      version: options.version || 1,
      ttl: options.ttl || 0,
      maxSize: options.maxSize,
    };
  }

  /**
   * 初始化数据库
   */
  private init(): Promise<void> {
    if (this.db) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const indexedDB = (globalThis as any).indexedDB as IndexedDB;
      const request = indexedDB.open(this.options.dbName, this.options.version);

      request.onerror = () => {
        reject(new Error(`打开 IndexedDB 失败: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as unknown as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.options.storeName)) {
          db.createObjectStore(this.options.storeName);
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 获取对象存储
   */
  private async getStore(
    mode: "readonly" | "readwrite" | "versionchange" = "readonly",
  ): Promise<IDBObjectStore> {
    await this.init();
    if (!this.db) {
      throw new Error("IndexedDB 未初始化");
    }

    const transaction = this.db.transaction([this.options.storeName], mode);
    return transaction.objectStore(this.options.storeName);
  }

  async get(key: string): Promise<unknown> {
    try {
      const store = await this.getStore();
      const request = store.get(key);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const itemStr = request.result;
          if (!itemStr) {
            resolve(undefined);
            return;
          }

          try {
            const item: CacheItem = JSON.parse(itemStr);

            // 检查是否过期
            if (item.expiresAt && Date.now() > item.expiresAt) {
              this.delete(key);
              resolve(undefined);
              return;
            }

            resolve(item.value);
          } catch {
            resolve(undefined);
          }
        };

        request.onerror = () => {
          resolve(undefined);
        };
      });
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const store = await this.getStore("readwrite");
      const now = Date.now();
      const expiresAt = ttl
        ? now + ttl * 1000
        : this.options.ttl > 0
        ? now + this.options.ttl * 1000
        : undefined;

      const item: CacheItem = {
        value,
        expiresAt,
      };

      const itemStr = JSON.stringify(item);
      const request = store.put(itemStr, key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`设置缓存失败: ${request.error?.message}`));
        };
      });
    } catch (error) {
      throw new Error(
        `设置缓存失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const store = await this.getStore("readwrite");
      const request = store.delete(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`删除缓存失败: ${request.error?.message}`));
        };
      });
    } catch (error) {
      throw new Error(
        `删除缓存失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  async keys(): Promise<string[]> {
    try {
      const store = await this.getStore();
      const request = store.getAllKeys();

      return new Promise((resolve) => {
        const keys: string[] = [];

        request.onsuccess = async () => {
          const allKeys = request.result as string[];
          for (const key of allKeys) {
            if (await this.has(key)) {
              keys.push(key);
            }
          }
          resolve(keys);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      const store = await this.getStore("readwrite");
      const request = store.clear();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error(`清空缓存失败: ${request.error?.message}`));
        };
      });
    } catch (error) {
      throw new Error(
        `清空缓存失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  async setMany(
    data: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      await this.set(key, value, ttl);
    }
  }
}
