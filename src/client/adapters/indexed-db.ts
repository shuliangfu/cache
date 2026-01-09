/**
 * @module @dreamer/cache/client/adapters/indexed-db
 *
 * @fileoverview IndexedDB 缓存适配器
 */


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
      const request = indexedDB.open(this.options.dbName, this.options.version);

      request.onerror = () => {
        reject(new Error(`打开 IndexedDB 失败: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
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
    mode: IDBTransactionMode = "readonly",
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
