/**
 * @fileoverview CacheManager 测试
 */

import { describe, expect, it } from "@dreamer/test";
import { ServiceContainer } from "@dreamer/service";
import type { MemcachedClient } from "../src/adapters/memcached.ts";
import type { RedisClient } from "../src/adapters/redis.ts";
import {
  CacheManager,
  createCacheManager,
  FileAdapter,
  MemcachedAdapter,
  MemoryAdapter,
  RedisAdapter,
} from "../src/mod.ts";

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

  it("应该使用 MemcachedAdapter（mock）", async () => {
    // 创建 mock Memcached 客户端
    const storage = new Map<string, string>();
    const mockClient: MemcachedClient = {
      async set(key: string, value: string) {
        storage.set(key, value);
        return true;
      },
      async get(key: string) {
        return storage.get(key) || null;
      },
      async delete(key: string) {
        const existed = storage.has(key);
        storage.delete(key);
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

    const adapter = new MemcachedAdapter({ client: mockClient });
    const manager = new CacheManager(adapter);

    await manager.set("key", "value");
    const value = await manager.get("key");
    expect(value).toBe("value");

    await adapter.disconnect();
  });
});

// ============ ServiceContainer 集成测试 ============

describe("CacheManager ServiceContainer 集成", () => {
  it("应该支持设置服务容器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter);

    const result = manager.setContainer(container);

    expect(result).toBe(manager); // 链式调用
    expect(manager.getContainer()).toBe(container);
  });

  it("应该将默认管理器注册到服务容器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter);

    manager.setContainer(container);

    expect(container.has("cacheManager")).toBeTruthy();
    expect(container.get("cacheManager")).toBe(manager);
  });

  it("应该支持命名管理器注册到服务容器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter, "redis");

    manager.setContainer(container);

    expect(manager.getName()).toBe("redis");
    expect(container.has("cacheManager:redis")).toBeTruthy();
    expect(container.get("cacheManager:redis")).toBe(manager);
  });

  it("应该从服务容器获取默认管理器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter);
    manager.setContainer(container);

    const retrieved = CacheManager.fromContainer(container);

    expect(retrieved).toBe(manager);
  });

  it("应该从服务容器获取命名管理器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter, "memory");
    manager.setContainer(container);

    const retrieved = CacheManager.fromContainer(container, "memory");

    expect(retrieved).toBe(manager);
  });

  it("应该支持多个管理器注册到同一服务容器", () => {
    const container = new ServiceContainer();
    const memoryAdapter = new MemoryAdapter();
    const memoryManager = new CacheManager(memoryAdapter, "memory");
    memoryManager.setContainer(container);

    const redisStorage = new Map<string, string>();
    const mockRedisClient = {
      async set(key: string, value: string) {
        redisStorage.set(key, value);
      },
      async get(key: string) {
        return redisStorage.get(key) || null;
      },
      async del(key: string) {
        redisStorage.delete(key);
        return 1;
      },
      async exists(key: string) {
        return redisStorage.has(key) ? 1 : 0;
      },
      async keys(_pattern: string) {
        return Array.from(redisStorage.keys());
      },
      async expire(_key: string, _seconds: number) {
        return 1;
      },
    };
    const redisAdapter = new RedisAdapter({ client: mockRedisClient });
    const redisManager = new CacheManager(redisAdapter, "redis");
    redisManager.setContainer(container);

    expect(container.has("cacheManager:memory")).toBeTruthy();
    expect(container.has("cacheManager:redis")).toBeTruthy();
    expect(CacheManager.fromContainer(container, "memory")).toBe(memoryManager);
    expect(CacheManager.fromContainer(container, "redis")).toBe(redisManager);
  });

  it("应该支持使用配置对象创建管理器", () => {
    const adapter = new MemoryAdapter();
    const manager = new CacheManager({ adapter, name: "custom" });

    expect(manager.getName()).toBe("custom");
    expect(manager.getAdapter()).toBe(adapter);
  });

  it("应该支持默认管理器名称", () => {
    const adapter = new MemoryAdapter();
    const manager = new CacheManager(adapter);

    expect(manager.getName()).toBe("default");
  });
});

describe("createCacheManager 工厂函数", () => {
  it("应该创建缓存管理器", () => {
    const adapter = new MemoryAdapter();
    const manager = createCacheManager(adapter);

    expect(manager).toBeInstanceOf(CacheManager);
    expect(manager.getAdapter()).toBe(adapter);
  });

  it("应该创建并注册到服务容器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = createCacheManager(adapter, container);

    expect(manager.getContainer()).toBe(container);
    expect(container.has("cacheManager")).toBeTruthy();
    expect(container.get("cacheManager")).toBe(manager);
  });

  it("应该创建命名管理器并注册到服务容器", () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = createCacheManager(adapter, container, "session");

    expect(manager.getName()).toBe("session");
    expect(container.has("cacheManager:session")).toBeTruthy();
  });

  it("应该在没有容器时正常工作", () => {
    const adapter = new MemoryAdapter();
    const manager = createCacheManager(adapter);

    expect(manager.getContainer()).toBeUndefined();
  });

  it("应该能够正常使用缓存功能", async () => {
    const container = new ServiceContainer();
    const adapter = new MemoryAdapter();
    const manager = createCacheManager(adapter, container);

    await manager.set("key", "value");
    const value = await manager.get("key");

    expect(value).toBe("value");

    // 从容器获取后也能正常使用
    const retrieved = CacheManager.fromContainer(container);
    const value2 = await retrieved.get("key");
    expect(value2).toBe("value");
  });
});
