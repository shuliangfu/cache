/**
 * @fileoverview MemoryAdapter 测试
 */

import { afterAll, describe, expect, it } from "@dreamer/test";
import { MemoryAdapter } from "../src/mod.ts";

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

  it("应该处理特殊字符的键名", () => {
    const adapter = new MemoryAdapter();
    adapter.set("key:with:colons", "value1");
    adapter.set("key-with-dashes", "value2");
    adapter.set("key.with.dots", "value3");
    adapter.set("key_with_underscores", "value4");
    adapter.set("key with spaces", "value5");
    adapter.set("key/with/slashes", "value6");

    expect(adapter.get("key:with:colons")).toBe("value1");
    expect(adapter.get("key-with-dashes")).toBe("value2");
    expect(adapter.get("key.with.dots")).toBe("value3");
    expect(adapter.get("key_with_underscores")).toBe("value4");
    expect(adapter.get("key with spaces")).toBe("value5");
    expect(adapter.get("key/with/slashes")).toBe("value6");

    // 验证 has 方法也能正确处理
    expect(adapter.has("key:with:colons")).toBeTruthy();
    expect(adapter.has("key-with-dashes")).toBeTruthy();

    // 验证删除也能正确处理
    adapter.delete("key:with:colons");
    expect(adapter.has("key:with:colons")).toBeFalsy();
  });

  it("应该处理批量获取中的部分键不存在", async () => {
    const adapter = new MemoryAdapter();
    adapter.set("key1", "value1");
    // key2 不存在
    adapter.set("key3", "value3");
    // key4 不存在

    const result = await adapter.getMany(["key1", "key2", "key3", "key4"]);

    expect(result.key1).toBe("value1");
    expect(result.key2).toBeUndefined();
    expect(result.key3).toBe("value3");
    expect(result.key4).toBeUndefined();
  });
});
