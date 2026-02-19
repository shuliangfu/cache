# @dreamer/cache

> A cache library compatible with Deno and Bun, providing a unified cache
> interface and server-side caching (memory, file, Redis)

> [English](./README.md) | [中文 (Chinese)](../zh-CN/README.md)

[![JSR](https://jsr.io/badges/@dreamer/cache)](https://jsr.io/@dreamer/cache)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-208%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 Features

A cache library providing a unified cache abstraction layer with multiple
backend support for data caching, performance optimization, and more.

---

## ✨ Characteristics

- **Local cache**:
  - In-memory cache (Map implementation)
  - LRU cache (Least Recently Used)
  - TTL support (expiration time)
  - Cache eviction strategies (FIFO, LFU, LRU)
- **File cache**:
  - File system-based persistent cache
  - JSON serialization storage
  - Automatic expiry cleanup
  - Directory structure management
  - File lock mechanism
- **Redis cache**:
  - Redis client wrapper
  - Connection pool management
  - Auto reconnection
  - Cluster support
- **Memcached cache**:
  - Memcached client wrapper
  - High-performance in-memory cache
  - Batch get optimization
  - Suitable for single-node or small-scale distributed scenarios
- **Adapter pattern**:
  - Unified cache interface (CacheAdapter)
  - Local cache adapter (MemoryAdapter)
  - File cache adapter (FileAdapter)
  - Redis cache adapter (RedisAdapter)
  - Memcached cache adapter (MemcachedAdapter)
  - Runtime backend switching
  - Multi-level cache support
- **Service container integration**:
  - Supports @dreamer/service service container
  - CacheManager can be registered to service container
  - Named manager support (multi-instance management)
  - Factory function createCacheManager

---

## 🎨 Design Principles

_All @dreamer/* libraries follow these principles_:

- **Main package (@dreamer/xxx)**: For server-side (compatible with Deno and Bun
  runtimes)
- **Client sub-package (@dreamer/xxx/client)**: For client-side (browser
  environment)

This provides:

- Clear separation between server and client code
- Avoid introducing server dependencies in client code
- Better type safety and code hints
- Better tree-shaking support

---

## 🎯 Use Cases

- **Local data cache**: Single-node apps, in-memory cache
- **Persistent cache**: Single-node apps, file cache
- **Distributed cache**: Multi-instance apps, Redis cache
- **High-performance cache**: Single-node or small-scale distributed, Memcached
  cache
- **Performance optimization**: Reduce database queries, API calls
- **Session storage**: User session data cache
- **Temporary data storage**: Cached temporary computation results

---

## 📦 Installation

### Deno

```bash
deno add jsr:@dreamer/cache
```

### Bun

```bash
bunx jsr add @dreamer/cache
```

---

## 🌍 Environment Compatibility

| Environment      | Version | Status                                                                                                                                                                                              |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deno**         | 2.5+    | ✅ Fully supported                                                                                                                                                                                  |
| **Bun**          | 1.0+    | ✅ Fully supported                                                                                                                                                                                  |
| **Server**       | -       | ✅ Supported (Deno and Bun runtimes, memory, file, Redis, Memcached cache)                                                                                                                          |
| **Client**       | -       | ✅ Supported (browser via `jsr:@dreamer/cache/client` using browser storage cache)                                                                                                                  |
| **Dependencies** | -       | 📦 Redis cache requires Redis client (optional, server)<br>📦 Memcached cache requires Memcached client (optional, server)<br>📦 Service container integration requires @dreamer/service (optional) |

---

## 🚀 Quick Start

### Memory Cache

```typescript
import { CacheManager, MemoryAdapter } from "jsr:@dreamer/cache";

// Create memory cache adapter
const memoryCache = new MemoryAdapter({
  ttl: 3600, // 1 hour expiry
  maxSize: 1000, // Max 1000 entries
  strategy: "lru", // LRU strategy
});

// Create cache manager
const cache = new CacheManager(memoryCache);

// Set cache
await cache.set("user:123", { name: "Alice", age: 30 }, 3600);

// Get cache
const user = await cache.get("user:123");
console.log(user); // { name: "Alice", age: 30 }

// Delete cache
await cache.delete("user:123");

// Batch operations
await cache.setMany({
  "user:123": { name: "Alice" },
  "user:456": { name: "Bob" },
});

const users = await cache.getMany(["user:123", "user:456"]);
console.log(users); // { "user:123": { name: "Alice" }, "user:456": { name: "Bob" } }
```

### File Cache

```typescript
import { CacheManager, FileAdapter } from "jsr:@dreamer/cache";

// Create file cache adapter
const fileCache = new FileAdapter({
  cacheDir: "./cache", // Cache directory
  ttl: 3600, // 1 hour expiry
  maxSize: 100 * 1024 * 1024, // Max 100MB
  // Auto cleanup expired files
  autoCleanup: true,
  cleanupInterval: 3600000, // Cleanup every 1 hour
});

const cache = new CacheManager(fileCache);

// Same usage as memory cache
await cache.set("data:123", { value: "some data" });
const data = await cache.get("data:123");
```

### Redis Cache

```typescript
import { CacheManager, RedisAdapter } from "jsr:@dreamer/cache";

// Create Redis cache adapter
const redisCache = new RedisAdapter({
  host: "localhost",
  port: 6379,
  password: "password",
  db: 0,
  // Connection pool config
  pool: {
    min: 2,
    max: 10,
  },
});

const cache = new CacheManager(redisCache);

// Same usage as other adapters
await cache.set("user:123", { name: "Alice" });
const user = await cache.get("user:123");
```

### Memcached Cache

**Method 1: Using connection config (recommended)**

```typescript
import { CacheManager, MemcachedAdapter } from "jsr:@dreamer/cache";

// Create Memcached cache adapter
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

// Same usage as other adapters
await cache.set("user:123", { name: "Alice" }, 3600); // 1 hour expiry
const user = await cache.get("user:123");
```

**Method 2: Using an existing client**

```typescript
import { CacheManager, MemcachedAdapter } from "jsr:@dreamer/cache";
import { MemcacheClient } from "npm:memcache-client";

// Create Memcached client
const memcachedClient = new MemcacheClient({
  server: "127.0.0.1:11211",
});

// Create Memcached cache adapter
const memcachedCache = new MemcachedAdapter({ client: memcachedClient });

const cache = new CacheManager(memcachedCache);

// Same usage as other adapters
await cache.set("user:123", { name: "Alice" }, 3600);
const user = await cache.get("user:123");
```

> 📌 **Note**:
>
> - Memcached is an in-memory cache system; data is stored in memory
> - Data persists as long as Memcached service does not restart
> - Data is lost after service restart; use Redis or File adapter for true
>   persistence
> - Memcached adapter is high-performance, suitable for single-node or
>   small-scale distributed scenarios
> - Supports batch get optimization (getMulti) for better performance

### Multi-Level Cache

```typescript
import {
  FileAdapter,
  MemcachedAdapter,
  MemoryAdapter,
  MultiLevelCache,
  RedisAdapter,
} from "jsr:@dreamer/cache";

// Create multi-level cache (memory -> file -> Redis/Memcached)
const memoryCache = new MemoryAdapter({ ttl: 300 }); // 5 minutes
const fileCache = new FileAdapter({ cacheDir: "./cache", ttl: 3600 }); // 1 hour
const redisCache = new RedisAdapter({ host: "localhost", port: 6379 }); // Persistent
// Or use Memcached
// const memcachedCache = new MemcachedAdapter({ connection: { host: "localhost", port: 11211 } });
// await memcachedCache.connect();

// Multi-level: check memory first, then file, then Redis/Memcached
const cache = new MultiLevelCache(memoryCache, fileCache, redisCache);

// Set cache (writes to all levels)
await cache.set("user:123", { name: "Alice" });

// Get cache (lookup by level)
const user = await cache.get("user:123");
// 1. Check memory cache first
// 2. If miss, check file cache
// 3. If still miss, check Redis cache
// 4. If hit, backfill to upper-level caches
```

### Runtime Cache Backend Switching

```typescript
import { CacheManager, FileAdapter, MemoryAdapter } from "jsr:@dreamer/cache";

const memoryCache = new MemoryAdapter({ ttl: 300 });
const fileCache = new FileAdapter({ cacheDir: "./cache", ttl: 3600 });

const cache = new CacheManager(memoryCache);

// Use memory cache
await cache.set("key1", "value1");

// Switch to file cache
cache.setAdapter(fileCache);

// Now using file cache
await cache.set("key2", "value2");
```

---

## 📚 API Documentation

### Cache Adapter Interface

All cache adapters implement a unified interface:

```typescript
interface CacheAdapter {
  // Get cache
  get(key: string): Promise<any> | any;

  // Set cache
  set(key: string, value: any, ttl?: number): Promise<void> | void;

  // Delete cache
  delete(key: string): Promise<void> | void;

  // Check if key exists
  has(key: string): Promise<boolean> | boolean;

  // Get all keys
  keys(): Promise<string[]> | string[];

  // Clear all cache
  clear(): Promise<void> | void;

  // Batch get
  getMany(keys: string[]): Promise<Record<string, any>>;

  // Batch set
  setMany(data: Record<string, any>, ttl?: number): Promise<void>;
}
```

### MemoryAdapter

In-memory cache adapter, Map-based implementation.

**Options**:

- `ttl?: number`: Default expiry time (seconds)
- `maxSize?: number`: Maximum cache entry count
- `strategy?: "lru" | "fifo" | "lfu"`: Cache eviction strategy

### FileAdapter

File cache adapter, file system-based implementation.

**Options**:

- `cacheDir: string`: Cache directory
- `ttl?: number`: Default expiry time (seconds)
- `maxSize?: number`: Maximum cache size (bytes)
- `autoCleanup?: boolean`: Whether to auto-cleanup expired files
- `cleanupInterval?: number`: Cleanup interval (milliseconds)

### RedisAdapter

Redis cache adapter, Redis client-based implementation.

**Options**:

- `host: string`: Redis host
- `port: number`: Redis port
- `password?: string`: Redis password
- `db?: number`: Redis database index
- `pool?: { min: number; max: number }`: Connection pool config

### MemcachedAdapter

Memcached cache adapter, Memcached client-based implementation.

**Options**:

- `connection?: MemcachedConnectionConfig`: Memcached connection config
  - `host?: string`: Memcached server address (default: 127.0.0.1)
  - `port?: number`: Memcached port (default: 11211)
  - `timeout?: number`: Connection timeout (ms, default: 5000)
  - `compress?: boolean`: Enable compression (default: false)
  - `maxConnections?: number`: Max connections (default: 10)
- `client?: MemcachedClient`: Memcached client instance (not needed if
  connection is provided)
- `keyPrefix?: string`: Key prefix (optional, default: cache)

**Note**:

- Memcached is an in-memory system; data persists until service restart, then is
  lost
- Use RedisAdapter or FileAdapter for true persistence (data survives service
  restart)
- Memcached adapter is high-performance, suitable for single-node or small-scale
  distributed scenarios
- Supports batch get optimization (getMulti) for better performance

### CacheManager

Cache manager providing unified cache operations, supports service container
integration.

**Constructor**:

- `new CacheManager(adapter: CacheAdapter, name?: string)`: Create with adapter
- `new CacheManager(options: CacheManagerOptions)`: Create with config object

**Methods**:

- `set(key: string, value: any, ttl?: number)`: Set cache
- `get(key: string)`: Get cache
- `delete(key: string)`: Delete cache
- `has(key: string)`: Check if key exists
- `keys()`: Get all keys
- `clear()`: Clear all cache
- `getMany(keys: string[])`: Batch get
- `setMany(data: Record<string, any>, ttl?: number)`: Batch set
- `setAdapter(adapter: CacheAdapter)`: Switch cache adapter
- `getAdapter()`: Get current adapter
- `getName()`: Get manager name
- `setContainer(container: ServiceContainer)`: Set service container
- `getContainer()`: Get service container
- `static fromContainer(container: ServiceContainer, name?: string)`: Get
  manager from service container

### createCacheManager Factory Function

Create cache manager and optionally register to service container.

```typescript
import { createCacheManager, MemoryAdapter } from "@dreamer/cache";
import { ServiceContainer } from "@dreamer/service";

const container = new ServiceContainer();
const adapter = new MemoryAdapter({ ttl: 3600 });

// Create and register to service container
const cache = createCacheManager(adapter, container);

// Can retrieve from container later
const cacheFromContainer = CacheManager.fromContainer(container);
```

### ServiceContainer Integration Example

```typescript
import { CacheManager, MemoryAdapter, RedisAdapter } from "@dreamer/cache";
import { ServiceContainer } from "@dreamer/service";

const container = new ServiceContainer();

// Register multiple cache managers
const memoryCache = new CacheManager(new MemoryAdapter(), "memory");
memoryCache.setContainer(container);

const redisCache = new CacheManager(
  new RedisAdapter({ host: "localhost" }),
  "redis",
);
redisCache.setContainer(container);

// Get from service container
const memory = CacheManager.fromContainer(container, "memory");
const redis = CacheManager.fromContainer(container, "redis");

// Use cache
await memory.set("key", "value");
await redis.set("key", "value");
```

### MultiLevelCache

Multi-level cache supporting layered lookup across multiple cache adapters.

**Constructor**:

- `new MultiLevelCache(...adapters: CacheAdapter[])`: Create multi-level cache;
  adapter order determines lookup priority

---

## 📋 Changelog

**v1.0.2** (2026-02-19) - Changed: i18n translation method renamed from `$t` to
`$tr`. Test report updated (208 tests).

See [CHANGELOG.md](./CHANGELOG.md) for full details.

---

## ⚡ Performance Optimization

- **Batch operations**: Batch read/write to reduce I/O
- **Multi-level cache**: Memory + persistent storage for better read performance
- **LRU strategy**: Auto-evict least recently used entries
- **TTL management**: Auto-cleanup expired cache to avoid memory leaks
- **Async operations**: All operations are async, non-blocking

---

## 🌐 Client Support

For client-side cache support, see [client/README.md](./client/README.md).

---

## 📝 Notes

- **Server/client separation**: `/client` subpath clearly separates server and
  client code
- **Unified interface**: Same API for server and client, lower learning cost
- **Adapter pattern**: Multiple cache backends, easy to extend
- **Multi-level cache**: Multi-level cache strategy for better performance
- **Type safety**: Full TypeScript type support
- **Minimal dependencies**: Pure TypeScript (Redis adapter requires Redis
  client, optional)

---

## 🤝 Contributing

Issues and Pull Requests welcome!

---

## 📄 License

Apache License 2.0 - see [LICENSE](../../LICENSE)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
