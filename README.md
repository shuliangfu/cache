# @dreamer/cache

> 一个兼容 Deno 和 Bun 的缓存库，提供统一的缓存接口，支持服务端缓存（内存、文件、Redis）

[![JSR](https://jsr.io/badges/@dreamer/cache)](https://jsr.io/@dreamer/cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎯 功能

缓存库，提供统一的缓存抽象层，支持多种缓存后端，用于数据缓存、性能优化等场景。

---

## ✨ 特性

- **本地缓存**：
  - 内存缓存（Map 实现）
  - LRU 缓存（最近最少使用）
  - TTL 支持（过期时间）
  - 缓存策略（FIFO、LFU、LRU）
- **文件缓存**：
  - 基于文件系统的持久化缓存
  - JSON 序列化存储
  - 自动过期清理
  - 目录结构管理
  - 文件锁机制
- **Redis 缓存**：
  - Redis 客户端封装
  - 连接池管理
  - 自动重连
  - 集群支持
- **Memcached 缓存**：
  - Memcached 客户端封装
  - 高性能内存缓存
  - 批量获取优化
  - 适合单机或小规模分布式场景
- **适配器模式**：
  - 统一的缓存接口（CacheAdapter）
  - 本地缓存适配器（MemoryAdapter）
  - 文件缓存适配器（FileAdapter）
  - Redis 缓存适配器（RedisAdapter）
  - Memcached 缓存适配器（MemcachedAdapter）
  - 运行时切换缓存后端
  - 多级缓存支持

---

## 🎨 设计原则

**所有 @dreamer/* 库都遵循以下原则**：

- **主包（@dreamer/xxx）**：用于服务端（兼容 Deno 和 Bun 运行时）
- **客户端子包（@dreamer/xxx/client）**：用于客户端（浏览器环境）

这样可以：
- 明确区分服务端和客户端代码
- 避免在客户端代码中引入服务端依赖
- 提供更好的类型安全和代码提示
- 支持更好的 tree-shaking

---

## 🎯 使用场景

- **本地数据缓存**：单机应用，内存缓存
- **持久化缓存**：单机应用，文件缓存
- **分布式缓存**：多实例应用，Redis 缓存
- **高性能缓存**：单机或小规模分布式，Memcached 缓存
- **性能优化**：减少数据库查询、API 调用
- **会话存储**：用户会话数据缓存
- **临时数据存储**：临时计算结果缓存

---

## 📦 安装

### Deno

```bash
deno add jsr:@dreamer/cache
```

### Bun

```bash
bunx jsr add @dreamer/cache
```

---

## 🌍 环境兼容性

| 环境 | 版本要求 | 状态 |
|------|---------|------|
| **Deno** | 2.5+ | ✅ 完全支持 |
| **Bun** | 1.0+ | ✅ 完全支持 |
| **服务端** | - | ✅ 支持（兼容 Deno 和 Bun 运行时，支持内存缓存、文件缓存、Redis 缓存、Memcached 缓存） |
| **客户端** | - | ✅ 支持（浏览器环境，通过 `jsr:@dreamer/cache/client` 使用浏览器存储缓存） |
| **依赖** | - | 📦 Redis 缓存需要 Redis 客户端（可选，服务端）<br>📦 Memcached 缓存需要 Memcached 客户端（可选，服务端） |

---

## 🚀 快速开始

### 内存缓存

```typescript
import { MemoryAdapter, CacheManager } from "jsr:@dreamer/cache";

// 创建内存缓存适配器
const memoryCache = new MemoryAdapter({
  ttl: 3600, // 1小时过期
  maxSize: 1000, // 最大1000条
  strategy: "lru", // LRU 策略
});

// 创建缓存管理器
const cache = new CacheManager(memoryCache);

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
console.log(users); // { "user:123": { name: "Alice" }, "user:456": { name: "Bob" } }
```

### 文件缓存

```typescript
import { FileAdapter, CacheManager } from "jsr:@dreamer/cache";

// 创建文件缓存适配器
const fileCache = new FileAdapter({
  cacheDir: "./cache", // 缓存目录
  ttl: 3600, // 1小时过期
  maxSize: 100 * 1024 * 1024, // 最大100MB
  // 自动清理过期文件
  autoCleanup: true,
  cleanupInterval: 3600000, // 1小时清理一次
});

const cache = new CacheManager(fileCache);

// 使用方式与内存缓存相同
await cache.set("data:123", { value: "some data" });
const data = await cache.get("data:123");
```

### Redis 缓存

```typescript
import { RedisAdapter, CacheManager } from "jsr:@dreamer/cache";

// 创建 Redis 缓存适配器
const redisCache = new RedisAdapter({
  host: "localhost",
  port: 6379,
  password: "password",
  db: 0,
  // 连接池配置
  pool: {
    min: 2,
    max: 10,
  },
});

const cache = new CacheManager(redisCache);

// 使用方式与其他适配器相同
await cache.set("user:123", { name: "Alice" });
const user = await cache.get("user:123");
```

### Memcached 缓存

**方式1：使用连接配置（推荐）**

```typescript
import { MemcachedAdapter, CacheManager } from "jsr:@dreamer/cache";

// 创建 Memcached 缓存适配器
const memcachedCache = new MemcachedAdapter({
  connection: {
    host: "127.0.0.1",
    port: 11211,
    timeout: 5000,
    compress: false,
    maxConnections: 10,
  },
});

await memcachedCache.connect();

const cache = new CacheManager(memcachedCache);

// 使用方式与其他适配器相同
await cache.set("user:123", { name: "Alice" }, 3600); // 1小时过期
const user = await cache.get("user:123");
```

**方式2：使用已创建的客户端**

```typescript
import { MemcachedAdapter, CacheManager } from "jsr:@dreamer/cache";
import { MemcacheClient } from "npm:memcache-client";

// 创建 Memcached 客户端
const memcachedClient = new MemcacheClient({
  server: "127.0.0.1:11211",
});

// 创建 Memcached 缓存适配器
const memcachedCache = new MemcachedAdapter({ client: memcachedClient });

const cache = new CacheManager(memcachedCache);

// 使用方式与其他适配器相同
await cache.set("user:123", { name: "Alice" }, 3600);
const user = await cache.get("user:123");
```

> 📌 **注意**：
> - Memcached 是内存缓存系统，数据存储在内存中
> - 只要 Memcached 服务不重启，数据不会丢失
> - 但服务重启后数据会丢失，如果需要真正的持久化，请使用 Redis 或 File 适配器
> - Memcached 适配器性能高，适合单机或小规模分布式场景
> - 支持批量获取优化（getMulti），提高性能

### 多级缓存

```typescript
import {
  MemoryAdapter,
  FileAdapter,
  RedisAdapter,
  MemcachedAdapter,
  MultiLevelCache,
} from "jsr:@dreamer/cache";

// 创建多级缓存（内存 -> 文件 -> Redis/Memcached）
const memoryCache = new MemoryAdapter({ ttl: 300 }); // 5分钟
const fileCache = new FileAdapter({ cacheDir: "./cache", ttl: 3600 }); // 1小时
const redisCache = new RedisAdapter({ host: "localhost", port: 6379 }); // 永久
// 或使用 Memcached
// const memcachedCache = new MemcachedAdapter({ connection: { host: "localhost", port: 11211 } });
// await memcachedCache.connect();

// 多级缓存：先查内存，再查文件，最后查 Redis/Memcached
const cache = new MultiLevelCache(memoryCache, fileCache, redisCache);

// 设置缓存（会写入所有层级）
await cache.set("user:123", { name: "Alice" });

// 获取缓存（按层级查找）
const user = await cache.get("user:123");
// 1. 先查内存缓存
// 2. 如果未命中，查文件缓存
// 3. 如果仍未命中，查 Redis 缓存
// 4. 如果命中，会回填到上层缓存
```

### 运行时切换缓存后端

```typescript
import {
  MemoryAdapter,
  FileAdapter,
  CacheManager,
} from "jsr:@dreamer/cache";

const memoryCache = new MemoryAdapter({ ttl: 300 });
const fileCache = new FileAdapter({ cacheDir: "./cache", ttl: 3600 });

const cache = new CacheManager(memoryCache);

// 使用内存缓存
await cache.set("key1", "value1");

// 切换到文件缓存
cache.setAdapter(fileCache);

// 现在使用文件缓存
await cache.set("key2", "value2");
```

---

## 📚 API 文档

### 缓存适配器接口

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

### MemoryAdapter

内存缓存适配器，基于 Map 实现。

**选项**：
- `ttl?: number`: 默认过期时间（秒）
- `maxSize?: number`: 最大缓存项数量
- `strategy?: "lru" | "fifo" | "lfu"`: 缓存淘汰策略

### FileAdapter

文件缓存适配器，基于文件系统实现。

**选项**：
- `cacheDir: string`: 缓存目录
- `ttl?: number`: 默认过期时间（秒）
- `maxSize?: number`: 最大缓存大小（字节）
- `autoCleanup?: boolean`: 是否自动清理过期文件
- `cleanupInterval?: number`: 清理间隔（毫秒）

### RedisAdapter

Redis 缓存适配器，基于 Redis 客户端实现。

**选项**：
- `host: string`: Redis 主机
- `port: number`: Redis 端口
- `password?: string`: Redis 密码
- `db?: number`: Redis 数据库编号
- `pool?: { min: number; max: number }`: 连接池配置

### MemcachedAdapter

Memcached 缓存适配器，基于 Memcached 客户端实现。

**选项**：
- `connection?: MemcachedConnectionConfig`: Memcached 连接配置
  - `host?: string`: Memcached 服务器地址（默认：127.0.0.1）
  - `port?: number`: Memcached 端口（默认：11211）
  - `timeout?: number`: 连接超时时间（毫秒，默认：5000）
  - `compress?: boolean`: 是否启用压缩（默认：false）
  - `maxConnections?: number`: 最大连接数（默认：10）
- `client?: MemcachedClient`: Memcached 客户端实例（如果提供 connection，则不需要提供 client）
- `keyPrefix?: string`: 键前缀（可选，默认：cache）

**注意**：
- Memcached 是内存缓存系统，只要服务不重启数据不会丢失，但服务重启后数据会丢失
- 如果需要真正的持久化（服务重启后数据不丢失），请使用 RedisAdapter 或 FileAdapter
- Memcached 适配器性能高，适合单机或小规模分布式场景
- 支持批量获取优化（getMulti），提高性能

### CacheManager

缓存管理器，提供统一的缓存操作接口。

**方法**：
- `set(key: string, value: any, ttl?: number)`: 设置缓存
- `get(key: string)`: 获取缓存
- `delete(key: string)`: 删除缓存
- `has(key: string)`: 检查键是否存在
- `keys()`: 获取所有键
- `clear()`: 清空所有缓存
- `getMany(keys: string[])`: 批量获取
- `setMany(data: Record<string, any>, ttl?: number)`: 批量设置
- `setAdapter(adapter: CacheAdapter)`: 切换缓存适配器

### MultiLevelCache

多级缓存，支持多个缓存适配器的层级查找。

**构造函数**：
- `new MultiLevelCache(...adapters: CacheAdapter[])`: 创建多级缓存，适配器顺序决定查找优先级

---

## ⚡ 性能优化

- **批量操作**：支持批量读写，减少 I/O 操作
- **多级缓存**：内存 + 持久化存储，提高读取性能
- **LRU 策略**：自动淘汰最少使用的缓存项
- **TTL 管理**：自动清理过期缓存，避免内存泄漏
- **异步操作**：所有操作都是异步的，不阻塞主线程

---

## 🌐 客户端支持

客户端缓存支持请查看 [client/README.md](./src/client/README.md)。

---

## 📝 备注

- **服务端和客户端分离**：通过 `/client` 子路径明确区分服务端和客户端代码
- **统一接口**：服务端和客户端使用相同的 API 接口，降低学习成本
- **适配器模式**：支持多种缓存后端，易于扩展
- **多级缓存**：支持多级缓存策略，提高性能
- **类型安全**：完整的 TypeScript 类型支持
- **无外部依赖**：纯 TypeScript 实现（Redis 适配器需要 Redis 客户端，可选）

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License - 详见 [LICENSE.md](./LICENSE.md)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
