/**
 * @fileoverview MultiLevelCache 测试（仅使用 MemoryAdapter）
 */

import { describe, expect, it } from "@dreamer/test";
import { MemoryAdapter, MultiLevelCache } from "../src/mod.ts";

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

  it("应该支持三级缓存", async () => {
    const adapter1 = new MemoryAdapter();
    const adapter2 = new MemoryAdapter();
    const adapter3 = new MemoryAdapter();
    const cache = new MultiLevelCache(adapter1, adapter2, adapter3);

    // 只在第三层设置
    adapter3.set("key", "value3");

    // 应该能从第三层获取
    const value = await cache.get("key");
    expect(value).toBe("value3");

    // 应该回填到第一层和第二层
    expect(adapter1.get("key")).toBe("value3");
    expect(adapter2.get("key")).toBe("value3");
  });

  it("应该支持三级缓存的批量操作", async () => {
    const adapter1 = new MemoryAdapter();
    const adapter2 = new MemoryAdapter();
    const adapter3 = new MemoryAdapter();
    const cache = new MultiLevelCache(adapter1, adapter2, adapter3);

    await cache.setMany({
      key1: "value1",
      key2: "value2",
    });

    // 所有层级都应该有
    expect(adapter1.get("key1")).toBe("value1");
    expect(adapter2.get("key1")).toBe("value1");
    expect(adapter3.get("key1")).toBe("value1");
    expect(adapter1.get("key2")).toBe("value2");
    expect(adapter2.get("key2")).toBe("value2");
    expect(adapter3.get("key2")).toBe("value2");
  });
});
