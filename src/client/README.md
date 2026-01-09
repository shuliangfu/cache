# @dreamer/cache/client

一个用于浏览器的缓存库，提供统一的缓存接口，支持 localStorage、sessionStorage、IndexedDB 和内存缓存。

## 服务端支持

服务端缓存支持请查看 [服务端文档](../../README.md)。

## 功能

客户端缓存库，提供统一的缓存抽象层，支持多种浏览器存储后端，用于数据缓存、性能优化等场景。

## 特性

- **浏览器存储缓存**：
  - localStorage 缓存适配器
  - sessionStorage 缓存适配器
  - IndexedDB 缓存适配器
  - 统一的缓存接口
- **内存缓存**：
  - 基于 Map 的内存缓存（客户端）
  - LRU 缓存策略
  - TTL 支持（过期时间）
- **适配器模式**：
  - 统一的缓存接口（CacheAdapter）
  - localStorage 适配器（LocalStorageAdapter）
  - sessionStorage 适配器（SessionStorageAdapter）
  - IndexedDB 适配器（IndexedDBAdapter）
  - 内存适配器（MemoryAdapter）
  - 运行时切换缓存后端
  - 多级缓存支持（内存 + localStorage）

## 安装

```bash
deno add jsr:@dreamer/cache/client
```

## 环境兼容性

- **Deno 版本**：要求 Deno 2.5 或更高版本
- **环境**：✅ 支持（浏览器环境）
- **依赖**：无外部依赖

## 使用示例

### localStorage 缓存

```typescript
import { LocalStorageAdapter, CacheManager } from "jsr:@dreamer/cache/client";

// 创建 localStorage 缓存适配器
const localStorageCache = new LocalStorageAdapter({
  prefix: "app:", // 键前缀
  ttl: 3600, // 1小时过期
  maxSize: 5 * 1024 * 1024, // 最大5MB（localStorage 限制）
});

const cache = new CacheManager(localStorageCache);

// 设置缓存
await cache.set("user:123", { name: "Alice", age: 30 }, 3600);

// 获取缓存
const user = await cache.get("user:123");
console.log(user); // { name: "Alice", age: 30 }

// 删除缓存
await cache.delete("user:123");

// 批量操作
await cache.setMany({
  "user:123": { name: "Alice" },
  "user:456": { name: "Bob" },
});

const users = await cache.getMany(["user:123", "user:456"]);
```

### sessionStorage 缓存

```typescript
import { SessionStorageAdapter, CacheManager } from "jsr:@dreamer/cache/client";

// 创建 sessionStorage 缓存适配器（临时缓存，关闭标签页后清除）
const sessionCache = new SessionStorageAdapter({
  prefix: "session:",
  ttl: 1800, // 30分钟过期
});

const cache = new CacheManager(sessionCache);

// 使用方式与 localStorage 相同
await cache.set("temp:data", { value: "temporary" });
const data = await cache.get("temp:data");
```

### IndexedDB 缓存（大容量）

```typescript
import { IndexedDBAdapter, CacheManager } from "jsr:@dreamer/cache/client";

// 创建 IndexedDB 缓存适配器（支持大容量存储）
const indexedDBCache = new IndexedDBAdapter({
  dbName: "app-cache",
  storeName: "cache",
  version: 1,
  ttl: 86400, // 24小时过期
  maxSize: 100 * 1024 * 1024, // 最大100MB
});

const cache = new CacheManager(indexedDBCache);

// 使用方式与其他适配器相同
await cache.set("large:data", largeDataObject);
const data = await cache.get("large:data");
```

### 内存缓存（客户端）

```typescript
import { MemoryAdapter, CacheManager } from "jsr:@dreamer/cache/client";

// 创建内存缓存适配器（客户端，页面刷新后清除）
const memoryCache = new MemoryAdapter({
  ttl: 300, // 5分钟过期
  maxSize: 1000, // 最大1000条
  strategy: "lru", // LRU 策略
});

const cache = new CacheManager(memoryCache);

// 使用方式与服务端相同
await cache.set("temp:data", { value: "temporary" });
const data = await cache.get("temp:data");
```

### 多级缓存（客户端）

```typescript
import {
  MemoryAdapter,
  LocalStorageAdapter,
  MultiLevelCache,
} from "jsr:@dreamer/cache/client";

// 创建多级缓存（内存 -> localStorage）
const memoryCache = new MemoryAdapter({ ttl: 300 }); // 5分钟
const localStorageCache = new LocalStorageAdapter({ ttl: 3600 }); // 1小时

// 多级缓存：先查内存，再查 localStorage
const cache = new MultiLevelCache(memoryCache, localStorageCache);

// 设置缓存（会写入所有层级）
await cache.set("user:123", { name: "Alice" });

// 获取缓存（按层级查找）
const user = await cache.get("user:123");
// 1. 先查内存缓存
// 2. 如果未命中，查 localStorage
// 3. 如果命中，会回填到内存缓存
```

### API 响应缓存示例

```typescript
import { LocalStorageAdapter, CacheManager } from "jsr:@dreamer/cache/client";

const cache = new CacheManager(
  new LocalStorageAdapter({ prefix: "api:", ttl: 300 })
);

// 封装 fetch，自动缓存响应
async function cachedFetch(url: string, options?: RequestInit) {
  const cacheKey = `response:${url}`;

  // 先查缓存
  const cached = await cache.get(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached.data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 如果未命中，发起请求
  const response = await fetch(url, options);
  const data = await response.json();

  // 缓存响应
  await cache.set(cacheKey, { data, timestamp: Date.now() });

  return response;
}

// 使用
const response = await cachedFetch("/api/users");
const users = await response.json();
```

## 缓存适配器接口

所有缓存适配器都实现统一的接口：

```typescript
interface CacheAdapter {
  // 获取缓存
  get(key: string): Promise<any> | any;

  // 设置缓存
  set(key: string, value: any, ttl?: number): Promise<void> | void;

  // 删除缓存
  delete(key: string): Promise<void> | void;

  // 检查键是否存在
  has(key: string): Promise<boolean> | boolean;

  // 获取所有键
  keys(): Promise<string[]> | string[];

  // 清空所有缓存
  clear(): Promise<void> | void;

  // 批量获取
  getMany(keys: string[]): Promise<Record<string, any>>;

  // 批量设置
  setMany(data: Record<string, any>, ttl?: number): Promise<void>;
}
```

## 使用场景

- **本地数据缓存**：减少网络请求，提升用户体验
- **离线数据缓存**：离线应用数据缓存
- **API 响应缓存**：缓存 API 响应，减少重复请求
- **临时数据存储**：表单数据、用户偏好
- **性能优化**：减少重复计算、提升页面加载速度

## 性能优化

- **批量操作**：支持批量读写，减少 I/O 操作
- **多级缓存**：内存 + 持久化存储，提高读取性能
- **LRU 策略**：自动淘汰最少使用的缓存项
- **TTL 管理**：自动清理过期缓存，避免内存泄漏
- **异步操作**：所有操作都是异步的，不阻塞主线程

## 备注

- **统一接口**：与服务端使用相同的 API 接口，降低学习成本
- **适配器模式**：支持多种缓存后端，易于扩展
- **多级缓存**：支持多级缓存策略，提高性能
- **类型安全**：完整的 TypeScript 类型支持
- **无外部依赖**：纯 TypeScript 实现
