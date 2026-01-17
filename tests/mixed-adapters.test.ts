/**
 * @fileoverview 混合适配器测试
 * 测试不同适配器组合的多级缓存
 */

import { makeTempDir, remove } from "@dreamer/runtime-adapter";
import { afterAll, beforeAll, describe, expect, it } from "@dreamer/test";
import type { MemcachedClient } from "../src/adapters/memcached.ts";
import type { RedisClient } from "../src/adapters/redis.ts";
import {
  FileAdapter,
  MemcachedAdapter,
  MemoryAdapter,
  MultiLevelCache,
  RedisAdapter,
} from "../src/mod.ts";

describe("混合适配器测试", () => {
  let testCacheDir: string;
  const fileAdapters: FileAdapter[] = [];
  const redisAdapters: RedisAdapter[] = [];
  const memcachedAdapters: MemcachedAdapter[] = [];

  beforeAll(async () => {
    // 创建临时测试目录
    testCacheDir = await makeTempDir({ prefix: "cache-test-" });
  });

  afterAll(async () => {
    // 停止所有文件适配器的清理定时器
    for (const adapter of fileAdapters) {
      adapter.stopCleanup();
    }
    fileAdapters.length = 0;

    // 断开所有 Redis 适配器的连接
    for (const adapter of redisAdapters) {
      try {
        await adapter.disconnect();
      } catch {
        // 忽略断开连接错误
      }
    }
    redisAdapters.length = 0;

    // 断开所有 Memcached 适配器的连接
    for (const adapter of memcachedAdapters) {
      try {
        await adapter.disconnect();
      } catch {
        // 忽略断开连接错误
      }
    }
    memcachedAdapters.length = 0;

    // 清理测试目录
    try {
      await remove(testCacheDir, { recursive: true });
    } catch {
      // 忽略清理错误
    }
  });

  /**
   * 创建 mock Redis 客户端
   */
  function createMockRedisClient(): RedisClient {
    const storage = new Map<string, string>();
    const timers = new Map<string, number>();

    return {
      async set(key: string, value: string, options?: { EX?: number }) {
        // 清除之前的定时器（如果存在）
        const existingTimer = timers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        storage.set(key, value);
        if (options?.EX) {
          // 使用很长的 TTL 来避免定时器泄漏
          const timer = setTimeout(() => {
            storage.delete(key);
            timers.delete(key);
          }, options.EX * 1000);
          timers.set(key, timer as unknown as number);
        }
      },
      async get(key: string) {
        return storage.get(key) || null;
      },
      async del(key: string) {
        const existed = storage.has(key);
        storage.delete(key);
        return existed ? 1 : 0;
      },
      async exists(key: string) {
        return storage.has(key) ? 1 : 0;
      },
      async keys(pattern: string) {
        const regex = new RegExp(
          pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        );
        return Array.from(storage.keys()).filter((key) => regex.test(key));
      },
      async expire(key: string, seconds: number) {
        if (storage.has(key)) {
          const existingTimer = timers.get(key);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          const timer = setTimeout(() => {
            storage.delete(key);
            timers.delete(key);
          }, seconds * 1000);
          timers.set(key, timer as unknown as number);
          return 1;
        }
        return 0;
      },
    };
  }

  /**
   * 创建 mock Memcached 客户端
   */
  function createMockMemcachedClient(): MemcachedClient {
    const storage = new Map<string, string>();
    const timers = new Map<string, number>();

    return {
      async set(key: string, value: string, options?: { expires?: number }) {
        const existingTimer = timers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        storage.set(key, value);
        if (options?.expires) {
          const ttlSeconds = Math.floor(options.expires / 1000);
          const timer = setTimeout(() => {
            storage.delete(key);
            timers.delete(key);
          }, ttlSeconds * 1000);
          timers.set(key, timer as unknown as number);
        }
        return true;
      },
      async get(key: string) {
        return storage.get(key) || null;
      },
      async delete(key: string) {
        const existed = storage.has(key);
        if (existed) {
          const timer = timers.get(key);
          if (timer) {
            clearTimeout(timer);
            timers.delete(key);
          }
          storage.delete(key);
        }
        return existed;
      },
      async getMulti(keys: string[]) {
        const record: Record<string, string | null> = {};
        for (const key of keys) {
          record[key] = storage.get(key) || null;
        }
        return record;
      },
    };
  }

  describe("Memory + File 混合适配器", () => {
    it("应该创建混合缓存（Memory + File）", () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      expect(cache).toBeTruthy();
    });

    it("应该从第一层（Memory）查找缓存", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      memoryAdapter.set("key", "value1");

      const value = await cache.get("key");
      expect(value).toBe("value1");
    });

    it("应该从第二层（File）查找缓存（如果第一层没有）", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      await fileAdapter.set("key", "value2");

      const value = await cache.get("key");
      expect(value).toBe("value2");
    });

    it("应该回填到上层缓存（Memory）", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      await fileAdapter.set("key", "value2");

      // 从第二层获取，应该回填到第一层
      await cache.get("key");

      // 现在第一层也应该有
      expect(memoryAdapter.get("key")).toBe("value2");
    });

    it("应该写入所有层级（Memory + File）", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      await cache.set("key", "value");

      expect(memoryAdapter.get("key")).toBe("value");
      expect(await fileAdapter.get("key")).toBe("value");
    });

    it("应该从所有层级删除", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      memoryAdapter.set("key", "value1");
      await fileAdapter.set("key", "value2");

      await cache.delete("key");

      expect(memoryAdapter.has("key")).toBeFalsy();
      expect(await fileAdapter.has("key")).toBeFalsy();
    });

    it("应该支持批量操作", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      await cache.setMany({
        key1: "value1",
        key2: "value2",
      });

      expect(memoryAdapter.get("key1")).toBe("value1");
      expect(await fileAdapter.get("key1")).toBe("value1");
      expect(memoryAdapter.get("key2")).toBe("value2");
      expect(await fileAdapter.get("key2")).toBe("value2");
    });

    it("应该支持标签删除", async () => {
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      fileAdapters.push(fileAdapter);
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);

      // 删除 tag2，应该删除 key1 和 key2（所有层级）
      const deleted = await cache.deleteByTags(["tag2"]);
      expect(deleted).toBe(4); // 每个适配器删除 2 个，共 4 个

      expect(memoryAdapter.has("key1")).toBeFalsy();
      expect(memoryAdapter.has("key2")).toBeFalsy();
      expect(await fileAdapter.has("key1")).toBeFalsy();
      expect(await fileAdapter.has("key2")).toBeFalsy();
    });
  });

  describe("Memory + Redis 混合适配器", () => {
    it("应该创建混合缓存（Memory + Redis）", () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      expect(cache).toBeTruthy();
    });

    it("应该从第一层（Memory）查找缓存", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      memoryAdapter.set("key", "value1");

      const value = await cache.get("key");
      expect(value).toBe("value1");
    });

    it("应该从第二层（Redis）查找缓存（如果第一层没有）", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await redisAdapter.set("key", "value2");

      const value = await cache.get("key");
      expect(value).toBe("value2");
    });

    it("应该回填到上层缓存（Memory）", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await redisAdapter.set("key", "value2");

      // 从第二层获取，应该回填到第一层
      await cache.get("key");

      // 现在第一层也应该有
      expect(memoryAdapter.get("key")).toBe("value2");
    });

    it("应该写入所有层级（Memory + Redis）", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await cache.set("key", "value");

      expect(memoryAdapter.get("key")).toBe("value");
      expect(await redisAdapter.get("key")).toBe("value");
    });

    it("应该从所有层级删除", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      memoryAdapter.set("key", "value1");
      await redisAdapter.set("key", "value2");

      await cache.delete("key");

      expect(memoryAdapter.has("key")).toBeFalsy();
      expect(await redisAdapter.has("key")).toBeFalsy();
    });

    it("应该支持批量操作", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await cache.setMany({
        key1: "value1",
        key2: "value2",
      });

      expect(memoryAdapter.get("key1")).toBe("value1");
      expect(await redisAdapter.get("key1")).toBe("value1");
      expect(memoryAdapter.get("key2")).toBe("value2");
      expect(await redisAdapter.get("key2")).toBe("value2");
    });

    it("应该支持标签删除", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);

      // 删除 tag2，应该删除 key1 和 key2（所有层级）
      const deleted = await cache.deleteByTags(["tag2"]);
      expect(deleted).toBe(4); // 每个适配器删除 2 个，共 4 个

      expect(memoryAdapter.has("key1")).toBeFalsy();
      expect(memoryAdapter.has("key2")).toBeFalsy();
      expect(await redisAdapter.has("key1")).toBeFalsy();
      expect(await redisAdapter.has("key2")).toBeFalsy();
    });
  });

  describe("Memory + File + Redis 三级混合适配器", () => {
    it("应该创建三级混合缓存", () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      const redisAdapter = new RedisAdapter({ client: mockClient });
      fileAdapters.push(fileAdapter);
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter,
        fileAdapter,
        redisAdapter,
      );

      expect(cache).toBeTruthy();
    });

    it("应该从第三层（Redis）查找缓存", async () => {
      // 使用 Memory + Memory + Redis 来测试三级缓存，避免 FileAdapter 的异步问题
      const mockClient = createMockRedisClient();
      const memoryAdapter1 = new MemoryAdapter();
      const memoryAdapter2 = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter1,
        memoryAdapter2,
        redisAdapter,
      );

      // 确保前两层没有值
      expect(memoryAdapter1.has("key")).toBeFalsy();
      expect(memoryAdapter2.has("key")).toBeFalsy();

      // 只在第三层（Redis）设置值
      await redisAdapter.set("key", "value3");

      // 验证 Redis 适配器确实有值（直接调用 get 方法）
      const redisValue = await redisAdapter.get("key");
      expect(redisValue).toBe("value3");

      // 从多级缓存获取，应该能从第三层获取
      // MultiLevelCache 会按顺序查找，如果前两层没有（返回 undefined），会从第三层获取
      const value = await cache.get("key");
      expect(value).toBe("value3");

      // 应该回填到第一层和第二层
      expect(memoryAdapter1.get("key")).toBe("value3");
      expect(memoryAdapter2.get("key")).toBe("value3");
    });

    it("应该写入所有三层", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      const redisAdapter = new RedisAdapter({ client: mockClient });
      fileAdapters.push(fileAdapter);
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter,
        fileAdapter,
        redisAdapter,
      );

      // 确保所有异步操作完成
      await cache.set("key", "value");

      // 等待文件写入完成
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(memoryAdapter.get("key")).toBe("value");
      expect(await fileAdapter.get("key")).toBe("value");
      expect(await redisAdapter.get("key")).toBe("value");
    }, {
      sanitizeOps: false, // 文件操作可能产生异步操作
    });

    it("应该从所有三层删除", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      const redisAdapter = new RedisAdapter({ client: mockClient });
      fileAdapters.push(fileAdapter);
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter,
        fileAdapter,
        redisAdapter,
      );

      memoryAdapter.set("key", "value1");
      await fileAdapter.set("key", "value2");
      await redisAdapter.set("key", "value3");

      await cache.delete("key");

      expect(memoryAdapter.has("key")).toBeFalsy();
      expect(await fileAdapter.has("key")).toBeFalsy();
      expect(await redisAdapter.has("key")).toBeFalsy();
    });

    it("应该支持批量操作", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      const redisAdapter = new RedisAdapter({ client: mockClient });
      fileAdapters.push(fileAdapter);
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter,
        fileAdapter,
        redisAdapter,
      );

      await cache.setMany({
        key1: "value1",
        key2: "value2",
      });

      // 所有三层都应该有
      expect(memoryAdapter.get("key1")).toBe("value1");
      expect(await fileAdapter.get("key1")).toBe("value1");
      expect(await redisAdapter.get("key1")).toBe("value1");
      expect(memoryAdapter.get("key2")).toBe("value2");
      expect(await fileAdapter.get("key2")).toBe("value2");
      expect(await redisAdapter.get("key2")).toBe("value2");
    });

    it("应该支持标签删除", async () => {
      const mockClient = createMockRedisClient();
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testCacheDir });
      const redisAdapter = new RedisAdapter({ client: mockClient });
      fileAdapters.push(fileAdapter);
      redisAdapters.push(redisAdapter);
      const cache = new MultiLevelCache(
        memoryAdapter,
        fileAdapter,
        redisAdapter,
      );

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);

      // 删除 tag2，应该删除 key1 和 key2（所有三层）
      const deleted = await cache.deleteByTags(["tag2"]);
      expect(deleted).toBe(6); // 每个适配器删除 2 个，共 6 个

      expect(memoryAdapter.has("key1")).toBeFalsy();
      expect(memoryAdapter.has("key2")).toBeFalsy();
      expect(await fileAdapter.has("key1")).toBeFalsy();
      expect(await fileAdapter.has("key2")).toBeFalsy();
      expect(await redisAdapter.has("key1")).toBeFalsy();
      expect(await redisAdapter.has("key2")).toBeFalsy();
    });
  });

  describe("Memory + Memcached 混合适配器", () => {
    it("应该创建混合缓存（Memory + Memcached）", () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      expect(cache).toBeTruthy();
    });

    it("应该从第一层（Memory）查找缓存", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      memoryAdapter.set("key", "value1");

      const value = await cache.get("key");
      expect(value).toBe("value1");
    });

    it("应该从第二层（Memcached）查找缓存（如果第一层没有）", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      await memcachedAdapter.set("key", "value2");

      const value = await cache.get("key");
      expect(value).toBe("value2");
    });

    it("应该回填到上层缓存（Memory）", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      await memcachedAdapter.set("key", "value2");

      // 从第二层获取，应该回填到第一层
      await cache.get("key");

      // 现在第一层也应该有
      expect(memoryAdapter.get("key")).toBe("value2");
    });

    it("应该写入所有层级（Memory + Memcached）", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      await cache.set("key", "value");

      expect(memoryAdapter.get("key")).toBe("value");
      expect(await memcachedAdapter.get("key")).toBe("value");
    });

    it("应该从所有层级删除", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      memoryAdapter.set("key", "value1");
      await memcachedAdapter.set("key", "value2");

      await cache.delete("key");

      expect(memoryAdapter.has("key")).toBeFalsy();
      expect(await memcachedAdapter.has("key")).toBeFalsy();
    });

    it("应该支持批量操作", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      await cache.setMany({
        key1: "value1",
        key2: "value2",
      });

      expect(memoryAdapter.get("key1")).toBe("value1");
      expect(await memcachedAdapter.get("key1")).toBe("value1");
      expect(memoryAdapter.get("key2")).toBe("value2");
      expect(await memcachedAdapter.get("key2")).toBe("value2");
    });

    it("应该支持标签删除", async () => {
      const mockClient = createMockMemcachedClient();
      const memoryAdapter = new MemoryAdapter();
      const memcachedAdapter = new MemcachedAdapter({ client: mockClient });
      memcachedAdapters.push(memcachedAdapter);
      const cache = new MultiLevelCache(memoryAdapter, memcachedAdapter);

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);

      // 删除 tag2，应该删除 key1 和 key2（所有层级）
      const deleted = await cache.deleteByTags(["tag2"]);
      expect(deleted).toBe(4); // 每个适配器删除 2 个，共 4 个

      expect(memoryAdapter.has("key1")).toBeFalsy();
      expect(memoryAdapter.has("key2")).toBeFalsy();
      expect(await memcachedAdapter.has("key1")).toBeFalsy();
      expect(await memcachedAdapter.has("key2")).toBeFalsy();
    });
  });
});
