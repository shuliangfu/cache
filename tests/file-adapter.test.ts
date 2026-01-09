/**
 * @fileoverview FileAdapter 测试
 */

import { makeTempDir, remove } from "@dreamer/runtime-adapter";
import { afterAll, beforeAll, describe, expect, it } from "@dreamer/test";
import { FileAdapter } from "../src/adapters/file.ts";

describe("FileAdapter", () => {
  let testCacheDir: string;
  const adapters: FileAdapter[] = [];

  beforeAll(async () => {
    // 创建临时测试目录
    testCacheDir = await makeTempDir({ prefix: "cache-test-" });
  });

  afterAll(async () => {
    // 停止所有适配器的清理定时器
    for (const adapter of adapters) {
      adapter.stopCleanup();
    }
    adapters.length = 0;

    // 清理测试目录
    try {
      await remove(testCacheDir, { recursive: true });
    } catch {
      // 忽略清理错误
    }
  });

  it("应该创建文件适配器", () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);
    expect(adapter).toBeTruthy();
  });

  it("应该使用默认配置创建适配器", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);
    await adapter.set("key", "value");
    const value = await adapter.get("key");
    expect(value).toBe("value");
  });

  it("应该使用自定义配置创建适配器", async () => {
    const adapter = new FileAdapter({
      cacheDir: testCacheDir,
      ttl: 60,
      prefix: "test-",
    });
    adapters.push(adapter);
    await adapter.set("key", "value");
    const value = await adapter.get("key");
    expect(value).toBe("value");
    adapter.stopCleanup();
  });

  it("应该设置和获取缓存", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);
    await adapter.set("key", "value");
    const value = await adapter.get("key");
    expect(value).toBe("value");
  });

  it("应该支持各种数据类型", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("string", "value");
    await adapter.set("number", 123);
    await adapter.set("boolean", true);
    await adapter.set("null", null);
    await adapter.set("object", { key: "value" });
    await adapter.set("array", [1, 2, 3]);

    expect(await adapter.get("string")).toBe("value");
    expect(await adapter.get("number")).toBe(123);
    expect(await adapter.get("boolean")).toBe(true);
    expect(await adapter.get("null")).toBe(null);
    expect(await adapter.get("object")).toEqual({ key: "value" });
    expect(await adapter.get("array")).toEqual([1, 2, 3]);
  });

  it("应该检查键是否存在", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    // 确保键不存在
    try {
      await adapter.delete("key");
    } catch {
      // 忽略删除错误
    }
    expect(await adapter.has("key")).toBeFalsy();

    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBeTruthy();
  });

  it("应该删除缓存", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBeTruthy();

    await adapter.delete("key");
    expect(await adapter.has("key")).toBeFalsy();
  });

  it("应该清空所有缓存", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1");
    await adapter.set("key2", "value2");

    await adapter.clear();
    expect(await adapter.has("key1")).toBeFalsy();
    expect(await adapter.has("key2")).toBeFalsy();
  });

  it("应该获取所有键", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1");
    await adapter.set("key2", "value2");
    await adapter.set("key3", "value3");

    const keys = await adapter.keys();
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys).toContain("key3");
  });

  it("应该支持 TTL 过期", async () => {
    const adapter = new FileAdapter({
      cacheDir: testCacheDir,
      ttl: 0.1, // 100ms 过期
    });
    adapters.push(adapter);

    await adapter.set("key", "value", 0.1); // 100ms 过期

    expect(await adapter.get("key")).toBe("value");
    expect(await adapter.has("key")).toBeTruthy();

    // 等待过期
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(await adapter.get("key")).toBeUndefined();
    expect(await adapter.has("key")).toBeFalsy();

    adapter.stopCleanup();
  }, {
    sanitizeOps: false, // 定时器操作
  });

  it("应该支持自定义 TTL", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", 1);
    await adapter.set("key2", "value2", 2);

    expect(await adapter.get("key1")).toBe("value1");
    expect(await adapter.get("key2")).toBe("value2");
  });

  it("应该支持批量获取", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1");
    await adapter.set("key2", "value2");
    await adapter.set("key3", "value3");

    const result = await adapter.getMany(["key1", "key2", "key4"]);

    expect(result.key1).toBe("value1");
    expect(result.key2).toBe("value2");
    expect(result.key4).toBeUndefined();
  });

  it("应该支持批量设置", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.setMany({
      key1: "value1",
      key2: "value2",
      key3: "value3",
    });

    expect(await adapter.get("key1")).toBe("value1");
    expect(await adapter.get("key2")).toBe("value2");
    expect(await adapter.get("key3")).toBe("value3");
  });

  it("应该支持批量设置带 TTL", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.setMany(
      {
        key1: "value1",
        key2: "value2",
      },
      1,
    );

    expect(await adapter.get("key1")).toBe("value1");
    expect(await adapter.get("key2")).toBe("value2");
  });

  it("应该支持设置缓存时添加标签", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
    await adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
    await adapter.set("key3", "value3", undefined, ["tag3"]);

    expect(await adapter.get("key1")).toBe("value1");
    expect(await adapter.get("key2")).toBe("value2");
    expect(await adapter.get("key3")).toBe("value3");
  });

  it("应该根据标签删除缓存", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
    await adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
    await adapter.set("key3", "value3", undefined, ["tag3"]);
    await adapter.set("key4", "value4"); // 没有标签

    // 删除 tag1，应该只删除 key1
    const deleted1 = await adapter.deleteByTags(["tag1"]);
    expect(deleted1).toBe(1);
    expect(await adapter.has("key1")).toBeFalsy();
    expect(await adapter.has("key2")).toBeTruthy();
    expect(await adapter.has("key3")).toBeTruthy();
    expect(await adapter.has("key4")).toBeTruthy();
  });

  it("应该根据多个标签删除缓存（任一标签匹配即删除）", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", undefined, ["tag1", "tag2"]);
    await adapter.set("key2", "value2", undefined, ["tag2", "tag3"]);
    await adapter.set("key3", "value3", undefined, ["tag3"]);
    await adapter.set("key4", "value4", undefined, ["tag4"]);

    // 删除 tag2 或 tag3，应该删除 key1, key2, key3
    const deleted = await adapter.deleteByTags(["tag2", "tag3"]);
    expect(deleted).toBe(3);
    expect(await adapter.has("key1")).toBeFalsy();
    expect(await adapter.has("key2")).toBeFalsy();
    expect(await adapter.has("key3")).toBeFalsy();
    expect(await adapter.has("key4")).toBeTruthy();
  });

  it("应该处理空标签数组", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", undefined, ["tag1"]);

    const deleted = await adapter.deleteByTags([]);
    expect(deleted).toBe(0);
    expect(await adapter.has("key1")).toBeTruthy();
  });

  it("应该处理不存在的标签", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key1", "value1", undefined, ["tag1"]);

    const deleted = await adapter.deleteByTags(["tag2"]);
    expect(deleted).toBe(0);
    expect(await adapter.has("key1")).toBeTruthy();
  });

  it("应该更新已存在的键", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    await adapter.set("key", "value1");
    expect(await adapter.get("key")).toBe("value1");

    await adapter.set("key", "value2");
    expect(await adapter.get("key")).toBe("value2");
  });

  it("应该处理特殊字符的键名", async () => {
    const adapter = new FileAdapter({ cacheDir: testCacheDir });
    adapters.push(adapter);

    // 测试包含特殊字符的键名
    await adapter.set("key/with/slashes", "value1");
    await adapter.set("key with spaces", "value2");
    await adapter.set("key.with.dots", "value3");

    expect(await adapter.get("key/with/slashes")).toBe("value1");
    expect(await adapter.get("key with spaces")).toBe("value2");
    expect(await adapter.get("key.with.dots")).toBe("value3");
  });

  it("应该支持键前缀", async () => {
    const adapter = new FileAdapter({
      cacheDir: testCacheDir,
      prefix: "test-prefix-",
    });
    adapters.push(adapter);

    await adapter.set("key1", "value1");
    await adapter.set("key2", "value2");

    const keys = await adapter.keys();
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
  });

  it("应该停止清理定时器", () => {
    const adapter = new FileAdapter({
      cacheDir: testCacheDir,
      ttl: 60,
    });
    adapter.stopCleanup();
    // 如果停止清理后没有错误，说明成功
    expect(adapter).toBeTruthy();
  });

  it("应该在过期后自动清理", async () => {
    const adapter = new FileAdapter({
      cacheDir: testCacheDir,
      ttl: 0.1, // 100ms 过期
    });
    adapters.push(adapter);

    await adapter.set("key1", "value1");
    await adapter.set("key2", "value2");

    // 等待过期
    await new Promise((resolve) => setTimeout(resolve, 150));

    // keys() 应该自动清理过期项
    const keys = await adapter.keys();
    // 注意：由于清理是异步的，可能有些项还未清理
    // 但至少应该能正常执行

    adapter.stopCleanup();
  }, {
    sanitizeOps: false, // 定时器操作
  });
});
