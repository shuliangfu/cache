/**
 * @fileoverview Cache 测试
 */

import { afterAll, describe, expect, it } from "@dreamer/test";
import {
  CacheManager,
  FileAdapter,
  MemoryAdapter,
  MultiLevelCache,
  RedisAdapter,
} from "../src/mod.ts";
import type { RedisClient } from "../src/adapters/redis.ts";

describe("Cache", () => {
  describe("MemoryAdapter", () => {
    // 用于清理所有适配器的定时器
    const adapters: MemoryAdapter[] = [];

    afterAll(() => {
      for (const adapter of adapters) {
        adapter.stopCleanup();
      }
      adapters.length = 0;
    });

    it("应该创建内存适配器", () => {
      const adapter = new MemoryAdapter();
      adapters.push(adapter);
      expect(adapter).toBeTruthy();
    });

    it("应该使用默认配置创建适配器", () => {
      const adapter = new MemoryAdapter();
      adapters.push(adapter);
      adapter.set("key", "value");
      expect(adapter.get("key")).toBe("value");
    });

    it("应该使用自定义配置创建适配器", () => {
      const adapter = new MemoryAdapter({
        ttl: 60,
        maxSize: 100,
        strategy: "lru",
      });
      adapter.set("key", "value");
      expect(adapter.get("key")).toBe("value");
      // 清理定时器以避免资源泄漏
      adapter.stopCleanup();
    }, {
      sanitizeOps: false, // 定时器操作
    });

    it("应该设置和获取缓存", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key", "value");
      const value = adapter.get("key");
      expect(value).toBe("value");
    });

    it("应该支持各种数据类型", () => {
      const adapter = new MemoryAdapter();
      adapter.set("string", "value");
      adapter.set("number", 123);
      adapter.set("boolean", true);
      adapter.set("null", null);
      adapter.set("object", { key: "value" });
      adapter.set("array", [1, 2, 3]);

      expect(adapter.get("string")).toBe("value");
      expect(adapter.get("number")).toBe(123);
      expect(adapter.get("boolean")).toBe(true);
      expect(adapter.get("null")).toBe(null);
      expect(adapter.get("object")).toEqual({ key: "value" });
      expect(adapter.get("array")).toEqual([1, 2, 3]);
    });

    it("应该检查键是否存在", () => {
      const adapter = new MemoryAdapter();
      expect(adapter.has("key")).toBeFalsy();

      adapter.set("key", "value");
      expect(adapter.has("key")).toBeTruthy();
    });

    it("应该删除缓存", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key", "value");
      expect(adapter.has("key")).toBeTruthy();

      adapter.delete("key");
      expect(adapter.has("key")).toBeFalsy();
    });

    it("应该清空所有缓存", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1");
      adapter.set("key2", "value2");

      adapter.clear();
      expect(adapter.has("key1")).toBeFalsy();
      expect(adapter.has("key2")).toBeFalsy();
    });

    it("应该获取所有键", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1");
      adapter.set("key2", "value2");
      adapter.set("key3", "value3");

      const keys = adapter.keys();
      expect(keys.length).toBe(3);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
    });

    it("应该支持 TTL 过期", async () => {
      const adapter = new MemoryAdapter({ ttl: 1 });
      adapter.set("key", "value", 0.1); // 100ms 过期

      expect(adapter.get("key")).toBe("value");
      expect(adapter.has("key")).toBeTruthy();

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(adapter.get("key")).toBeUndefined();
      expect(adapter.has("key")).toBeFalsy();

      // 清理定时器以避免资源泄漏
      adapter.stopCleanup();
    }, {
      sanitizeOps: false, // 定时器操作
    });

    it("应该支持自定义 TTL", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", 1);
      adapter.set("key2", "value2", 2);

      expect(adapter.get("key1")).toBe("value1");
      expect(adapter.get("key2")).toBe("value2");
    });

    it("应该支持 LRU 策略", () => {
      const adapter = new MemoryAdapter({
        maxSize: 3,
        strategy: "lru",
      });

      adapter.set("key1", "value1");
      adapter.set("key2", "value2");
      adapter.set("key3", "value3");

      // 访问 key1，使其成为最近使用的
      adapter.get("key1");

      // 添加新项，应该淘汰 key2（最久未使用）
      adapter.set("key4", "value4");

      expect(adapter.has("key1")).toBeTruthy();
      expect(adapter.has("key2")).toBeFalsy(); // 被淘汰
      expect(adapter.has("key3")).toBeTruthy();
      expect(adapter.has("key4")).toBeTruthy();
    });

    it("应该支持 FIFO 策略", () => {
      const adapter = new MemoryAdapter({
        maxSize: 3,
        strategy: "fifo",
      });

      adapter.set("key1", "value1");
      adapter.set("key2", "value2");
      adapter.set("key3", "value3");

      // 添加新项，应该淘汰 key1（最早添加的）
      adapter.set("key4", "value4");

      expect(adapter.has("key1")).toBeFalsy(); // 被淘汰
      expect(adapter.has("key2")).toBeTruthy();
      expect(adapter.has("key3")).toBeTruthy();
      expect(adapter.has("key4")).toBeTruthy();
    });

    it("应该支持 LFU 策略", () => {
      const adapter = new MemoryAdapter({
        maxSize: 3,
        strategy: "lfu",
      });

      adapter.set("key1", "value1");
      adapter.set("key2", "value2");
      adapter.set("key3", "value3");

      // 访问 key1 和 key2 多次
      adapter.get("key1");
      adapter.get("key1");
      adapter.get("key2");
      adapter.get("key2");
      // key3 只访问一次

      // 添加新项，应该淘汰 key3（访问次数最少）
      adapter.set("key4", "value4");

      expect(adapter.has("key1")).toBeTruthy();
      expect(adapter.has("key2")).toBeTruthy();
      expect(adapter.has("key3")).toBeFalsy(); // 被淘汰
      expect(adapter.has("key4")).toBeTruthy();
    });

    it("应该支持批量获取", async () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1");
      adapter.set("key2", "value2");
      adapter.set("key3", "value3");

      const result = await adapter.getMany(["key1", "key2", "key4"]);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
      expect(result.key4).toBeUndefined();
    });

    it("应该支持批量设置", async () => {
      const adapter = new MemoryAdapter();
      await adapter.setMany({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      expect(adapter.get("key1")).toBe("value1");
      expect(adapter.get("key2")).toBe("value2");
      expect(adapter.get("key3")).toBe("value3");
    });

    it("应该支持批量设置带 TTL", async () => {
      const adapter = new MemoryAdapter();
      await adapter.setMany(
        {
          key1: "value1",
          key2: "value2",
        },
        1,
      );

      expect(adapter.get("key1")).toBe("value1");
      expect(adapter.get("key2")).toBe("value2");
    });

    it("应该支持设置缓存时添加标签", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
      adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
      adapter.set("key3", "value3", undefined, ["tag3"]);

      expect(adapter.get("key1")).toBe("value1");
      expect(adapter.get("key2")).toBe("value2");
      expect(adapter.get("key3")).toBe("value3");
    });

    it("应该根据标签删除缓存", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
      adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
      adapter.set("key3", "value3", undefined, ["tag3"]);
      adapter.set("key4", "value4"); // 没有标签

      // 删除 tag1，应该只删除 key1
      const deleted1 = adapter.deleteByTags(["tag1"]);
      expect(deleted1).toBe(1);
      expect(adapter.has("key1")).toBeFalsy();
      expect(adapter.has("key2")).toBeTruthy();
      expect(adapter.has("key3")).toBeTruthy();
      expect(adapter.has("key4")).toBeTruthy();
    });

    it("应该根据多个标签删除缓存（任一标签匹配即删除）", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
      adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
      adapter.set("key3", "value3", undefined, ["tag3"]);
      adapter.set("key4", "value4", undefined, ["tag4"]);

      // 删除 tag2 或 tag3，应该删除 key1, key2, key3
      const deleted = adapter.deleteByTags(["tag2", "tag3"]);
      expect(deleted).toBe(3);
      expect(adapter.has("key1")).toBeFalsy();
      expect(adapter.has("key2")).toBeFalsy();
      expect(adapter.has("key3")).toBeFalsy();
      expect(adapter.has("key4")).toBeTruthy();
    });

    it("应该处理空标签数组", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", undefined, ["tag1"]);

      const deleted = adapter.deleteByTags([]);
      expect(deleted).toBe(0);
      expect(adapter.has("key1")).toBeTruthy();
    });

    it("应该处理不存在的标签", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key1", "value1", undefined, ["tag1"]);

      const deleted = adapter.deleteByTags(["tag2"]);
      expect(deleted).toBe(0);
      expect(adapter.has("key1")).toBeTruthy();
    });

    it("应该更新已存在的键", () => {
      const adapter = new MemoryAdapter();
      adapter.set("key", "value1");
      expect(adapter.get("key")).toBe("value1");

      adapter.set("key", "value2");
      expect(adapter.get("key")).toBe("value2");
    });

    it("应该在过期后自动清理", async () => {
      const adapter = new MemoryAdapter({ ttl: 0.1 }); // 100ms 过期
      adapter.set("key1", "value1");
      adapter.set("key2", "value2");

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      // keys() 应该自动清理过期项
      const keys = adapter.keys();
      expect(keys.length).toBe(0);

      // 清理定时器以避免资源泄漏
      adapter.stopCleanup();
    }, {
      sanitizeOps: false, // 定时器操作
    });

    it("应该停止清理定时器", () => {
      const adapter = new MemoryAdapter({ ttl: 60 });
      adapter.stopCleanup();
      // 如果停止清理后没有错误，说明成功
      expect(adapter).toBeTruthy();
    });
  });

  describe("CacheManager", () => {
    it("应该创建缓存管理器", () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);
      expect(manager).toBeTruthy();
    });

    it("应该设置和获取缓存", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key", "value");
      const value = await manager.get("key");

      expect(value).toBe("value");
    });

    it("应该删除缓存", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key", "value");
      expect(await manager.has("key")).toBeTruthy();

      await manager.delete("key");
      expect(await manager.has("key")).toBeFalsy();
    });

    it("应该检查键是否存在", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      expect(await manager.has("key")).toBeFalsy();

      await manager.set("key", "value");
      expect(await manager.has("key")).toBeTruthy();
    });

    it("应该获取所有键", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1");
      await manager.set("key2", "value2");
      await manager.set("key3", "value3");

      const keys = await manager.keys();
      expect(keys.length).toBe(3);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
    });

    it("应该清空所有缓存", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1");
      await manager.set("key2", "value2");

      await manager.clear();
      expect(await manager.has("key1")).toBeFalsy();
      expect(await manager.has("key2")).toBeFalsy();
    });

    it("应该支持批量获取", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1");
      await manager.set("key2", "value2");
      await manager.set("key3", "value3");

      const result = await manager.getMany(["key1", "key2", "key4"]);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
      expect(result.key4).toBeUndefined();
    });

    it("应该支持批量设置", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.setMany({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      expect(await manager.get("key1")).toBe("value1");
      expect(await manager.get("key2")).toBe("value2");
      expect(await manager.get("key3")).toBe("value3");
    });

    it("应该支持批量设置带 TTL", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.setMany(
        {
          key1: "value1",
          key2: "value2",
        },
        1,
      );

      expect(await manager.get("key1")).toBe("value1");
      expect(await manager.get("key2")).toBe("value2");
    });

    it("应该支持设置缓存时添加标签", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await manager.set("key2", "value2", undefined, ["tag2", "tag3"]);

      expect(await manager.get("key1")).toBe("value1");
      expect(await manager.get("key2")).toBe("value2");
    });

    it("应该根据标签删除缓存", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await manager.set("key2", "value2", undefined, ["tag2", "tag3"]);
      await manager.set("key3", "value3", undefined, ["tag3"]);

      // 删除 tag1，应该只删除 key1
      const deleted1 = await manager.deleteByTags(["tag1"]);
      expect(deleted1).toBe(1);
      expect(await manager.has("key1")).toBeFalsy();
      expect(await manager.has("key2")).toBeTruthy();
      expect(await manager.has("key3")).toBeTruthy();
    });

    it("应该根据多个标签删除缓存", async () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      await manager.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await manager.set("key2", "value2", undefined, ["tag2", "tag3"]);
      await manager.set("key3", "value3", undefined, ["tag3"]);

      // 删除 tag2 或 tag3，应该删除 key1, key2, key3
      const deleted = await manager.deleteByTags(["tag2", "tag3"]);
      expect(deleted).toBe(3);
      expect(await manager.has("key1")).toBeFalsy();
      expect(await manager.has("key2")).toBeFalsy();
      expect(await manager.has("key3")).toBeFalsy();
    });

    it("应该支持切换适配器", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const manager = new CacheManager(adapter1);

      await manager.set("key", "value1");
      expect(await manager.get("key")).toBe("value1");

      manager.setAdapter(adapter2);
      expect(await manager.get("key")).toBeUndefined();

      await manager.set("key", "value2");
      expect(await manager.get("key")).toBe("value2");
    });

    it("应该获取当前适配器", () => {
      const adapter = new MemoryAdapter();
      const manager = new CacheManager(adapter);

      expect(manager.getAdapter()).toBe(adapter);
    });

    it("应该使用 FileAdapter", async () => {
      const { makeTempDir, remove } = await import(
        "@dreamer/runtime-adapter"
      );
      const testDir = await makeTempDir({ prefix: "cache-test-" });
      const adapter = new FileAdapter({ cacheDir: testDir });
      const manager = new CacheManager(adapter);

      try {
        await manager.set("key", "value");
        const value = await manager.get("key");
        expect(value).toBe("value");
      } finally {
        adapter.stopCleanup();
        await remove(testDir, { recursive: true });
      }
    });

    it("应该使用 RedisAdapter（mock）", async () => {
      // 创建 mock Redis 客户端
      const storage = new Map<string, string>();
      const mockClient: RedisClient = {
        async set(key: string, value: string) {
          storage.set(key, value);
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
          return storage.has(key) ? 1 : 0;
        },
      };

      const adapter = new RedisAdapter({ client: mockClient });
      const manager = new CacheManager(adapter);

      await manager.set("key", "value");
      const value = await manager.get("key");
      expect(value).toBe("value");

      await adapter.disconnect();
    });
  });

  describe("MultiLevelCache", () => {
    it("应该创建多级缓存", () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      expect(cache).toBeTruthy();
    });

    it("应该至少需要一个适配器", () => {
      expect(() => {
        new MultiLevelCache();
      }).toThrow("至少需要一个缓存适配器");
    });

    it("应该从第一层查找缓存", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter1.set("key", "value1");

      const value = await cache.get("key");
      expect(value).toBe("value1");
    });

    it("应该从第二层查找缓存（如果第一层没有）", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter2.set("key", "value2");

      const value = await cache.get("key");
      expect(value).toBe("value2");
    });

    it("应该回填到上层缓存", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter2.set("key", "value2");

      // 从第二层获取，应该回填到第一层
      await cache.get("key");

      // 现在第一层也应该有
      expect(adapter1.get("key")).toBe("value2");
    });

    it("应该写入所有层级", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.set("key", "value");

      expect(adapter1.get("key")).toBe("value");
      expect(adapter2.get("key")).toBe("value");
    });

    it("应该从所有层级删除", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter1.set("key", "value1");
      adapter2.set("key", "value2");

      await cache.delete("key");

      expect(adapter1.has("key")).toBeFalsy();
      expect(adapter2.has("key")).toBeFalsy();
    });

    it("应该检查所有层级是否存在", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      expect(await cache.has("key")).toBeFalsy();

      adapter2.set("key", "value");
      expect(await cache.has("key")).toBeTruthy();
    });

    it("应该合并所有层级的键", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter1.set("key1", "value1");
      adapter2.set("key2", "value2");

      const keys = await cache.keys();
      expect(keys.length).toBe(2);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
    });

    it("应该清空所有层级", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter1.set("key1", "value1");
      adapter2.set("key2", "value2");

      await cache.clear();

      expect(adapter1.keys().length).toBe(0);
      expect(adapter2.keys().length).toBe(0);
    });

    it("应该支持批量获取", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter1.set("key1", "value1");
      adapter2.set("key2", "value2");

      const result = await cache.getMany(["key1", "key2", "key3"]);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
      expect(result.key3).toBeUndefined();
    });

    it("应该批量获取时回填到上层", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      adapter2.set("key", "value2");

      await cache.getMany(["key"]);

      // 应该回填到第一层
      expect(adapter1.get("key")).toBe("value2");
    });

    it("应该支持批量设置", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.setMany({
        key1: "value1",
        key2: "value2",
      });

      expect(adapter1.get("key1")).toBe("value1");
      expect(adapter1.get("key2")).toBe("value2");
      expect(adapter2.get("key1")).toBe("value1");
      expect(adapter2.get("key2")).toBe("value2");
    });

    it("应该支持批量设置带 TTL", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.setMany(
        {
          key1: "value1",
          key2: "value2",
        },
        1,
      );

      expect(adapter1.get("key1")).toBe("value1");
      expect(adapter2.get("key2")).toBe("value2");
    });

    it("应该支持设置缓存时添加标签", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);

      expect(await cache.get("key1")).toBe("value1");
      expect(await cache.get("key2")).toBe("value2");
    });

    it("应该根据标签删除所有层级的缓存", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.set("key1", "value1", undefined, ["tag1", "tag2"]);
      await cache.set("key2", "value2", undefined, ["tag2", "tag3"]);
      await cache.set("key3", "value3", undefined, ["tag3"]);

      // 删除 tag2，应该删除 key1 和 key2（所有层级）
      const deleted = await cache.deleteByTags(["tag2"]);
      expect(deleted).toBe(4); // 每个适配器删除 2 个，共 4 个

      expect(adapter1.has("key1")).toBeFalsy();
      expect(adapter1.has("key2")).toBeFalsy();
      expect(adapter1.has("key3")).toBeTruthy();
      expect(adapter2.has("key1")).toBeFalsy();
      expect(adapter2.has("key2")).toBeFalsy();
      expect(adapter2.has("key3")).toBeTruthy();
    });

    it("应该根据多个标签删除所有层级的缓存", async () => {
      const adapter1 = new MemoryAdapter();
      const adapter2 = new MemoryAdapter();
      const cache = new MultiLevelCache(adapter1, adapter2);

      await cache.set("key1", "value1", undefined, ["tag1"]);
      await cache.set("key2", "value2", undefined, ["tag2"]);
      await cache.set("key3", "value3", undefined, ["tag3"]);

      // 删除 tag1 或 tag2，应该删除 key1 和 key2（所有层级）
      const deleted = await cache.deleteByTags(["tag1", "tag2"]);
      expect(deleted).toBe(4); // 每个适配器删除 2 个，共 4 个

      expect(adapter1.has("key1")).toBeFalsy();
      expect(adapter1.has("key2")).toBeFalsy();
      expect(adapter1.has("key3")).toBeTruthy();
      expect(adapter2.has("key1")).toBeFalsy();
      expect(adapter2.has("key2")).toBeFalsy();
      expect(adapter2.has("key3")).toBeTruthy();
    });

    it("应该支持混合适配器（Memory + File）", async () => {
      const { makeTempDir, remove } = await import(
        "@dreamer/runtime-adapter"
      );
      const testDir = await makeTempDir({ prefix: "cache-test-" });
      const memoryAdapter = new MemoryAdapter();
      const fileAdapter = new FileAdapter({ cacheDir: testDir });
      const cache = new MultiLevelCache(memoryAdapter, fileAdapter);

      try {
        await cache.set("key", "value");

        expect(memoryAdapter.get("key")).toBe("value");
        expect(await fileAdapter.get("key")).toBe("value");

        // 从第一层删除
        memoryAdapter.delete("key");

        // 应该能从第二层获取
        const value = await cache.get("key");
        expect(value).toBe("value");

        // 应该回填到第一层
        expect(memoryAdapter.get("key")).toBe("value");
      } finally {
        fileAdapter.stopCleanup();
        await remove(testDir, { recursive: true });
      }
    });

    it("应该支持混合适配器（Memory + Redis）", async () => {
      // 创建 mock Redis 客户端
      const storage = new Map<string, string>();
      const mockClient: RedisClient = {
        async set(key: string, value: string) {
          storage.set(key, value);
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
          return storage.has(key) ? 1 : 0;
        },
      };

      const memoryAdapter = new MemoryAdapter();
      const redisAdapter = new RedisAdapter({ client: mockClient });
      const cache = new MultiLevelCache(memoryAdapter, redisAdapter);

      await cache.set("key", "value");

      expect(memoryAdapter.get("key")).toBe("value");
      expect(await redisAdapter.get("key")).toBe("value");

      // 从第一层删除
      memoryAdapter.delete("key");

      // 应该能从第二层获取
      const value = await cache.get("key");
      expect(value).toBe("value");

      // 应该回填到第一层
      expect(memoryAdapter.get("key")).toBe("value");

      await redisAdapter.disconnect();
    });
  });
});
