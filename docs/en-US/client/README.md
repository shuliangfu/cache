# @dreamer/cache/client

> A cache library for the browser with a unified cache interface, supporting
> localStorage, sessionStorage, IndexedDB, and in-memory cache.

[![JSR](https://jsr.io/badges/@dreamer/cache/client)](https://jsr.io/@dreamer/cache/client)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../../LICENSE)

---

## Server support

For server-side cache support, see [server docs](../README.md).

## Features

Client-side cache library with a unified abstraction over multiple browser
storage backends for data caching, performance optimization, and more.

- **Browser storage cache**:
  - localStorage cache adapter
  - sessionStorage cache adapter
  - IndexedDB cache adapter
  - Unified cache interface
- **In-memory cache**:
  - Map-based in-memory cache (client)
  - LRU eviction strategy
  - TTL support (expiration)
- **Adapter pattern**:
  - Unified cache interface (CacheAdapter)
  - LocalStorageAdapter
  - SessionStorageAdapter
  - IndexedDBAdapter
  - MemoryAdapter
  - Runtime backend switching
  - Multi-level cache (memory + localStorage)

## Installation

```bash
deno add jsr:@dreamer/cache/client
```

## Environment compatibility

- **Deno**: 2.5 or higher
- **Environment**: ✅ Browser
- **Dependencies**: None (pure TypeScript)

## Quick start

### localStorage cache

```typescript
import { CacheManager, LocalStorageAdapter } from "jsr:@dreamer/cache/client";

const localStorageCache = new LocalStorageAdapter({
  prefix: "app:",
  ttl: 3600, // 1 hour
  maxSize: 5 * 1024 * 1024, // 5MB (localStorage limit)
});

const cache = new CacheManager(localStorageCache);

await cache.set("user:123", { name: "Alice", age: 30 }, 3600);
const user = await cache.get("user:123");
console.log(user); // { name: "Alice", age: 30 }

await cache.delete("user:123");

await cache.setMany({
  "user:123": { name: "Alice" },
  "user:456": { name: "Bob" },
});
const users = await cache.getMany(["user:123", "user:456"]);
```

### sessionStorage cache

```typescript
import { CacheManager, SessionStorageAdapter } from "jsr:@dreamer/cache/client";

const sessionCache = new SessionStorageAdapter({
  prefix: "session:",
  ttl: 1800, // 30 minutes (cleared when tab closes)
});

const cache = new CacheManager(sessionCache);

await cache.set("temp:data", { value: "temporary" });
const data = await cache.get("temp:data");
```

### IndexedDB cache (large capacity)

```typescript
import { CacheManager, IndexedDBAdapter } from "jsr:@dreamer/cache/client";

const indexedDBCache = new IndexedDBAdapter({
  dbName: "app-cache",
  storeName: "cache",
  version: 1,
  ttl: 86400, // 24 hours
  maxSize: 100 * 1024 * 1024, // 100MB
});

const cache = new CacheManager(indexedDBCache);

await cache.set("large:data", largeDataObject);
const data = await cache.get("large:data");
```

### In-memory cache (client)

```typescript
import { CacheManager, MemoryAdapter } from "jsr:@dreamer/cache/client";

const memoryCache = new MemoryAdapter({
  ttl: 300, // 5 minutes (cleared on page refresh)
  maxSize: 1000,
  strategy: "lru",
});

const cache = new CacheManager(memoryCache);

await cache.set("temp:data", { value: "temporary" });
const data = await cache.get("temp:data");
```

### Multi-level cache (client)

```typescript
import {
  LocalStorageAdapter,
  MemoryAdapter,
  MultiLevelCache,
} from "jsr:@dreamer/cache/client";

const memoryCache = new MemoryAdapter({ ttl: 300 });
const localStorageCache = new LocalStorageAdapter({ ttl: 3600 });

const cache = new MultiLevelCache(memoryCache, localStorageCache);

await cache.set("user:123", { name: "Alice" });
const user = await cache.get("user:123");
// 1. Check memory first
// 2. On miss, check localStorage
// 3. On hit, backfill to memory
```

---

## API

### Cache adapter interface

All adapters implement the same interface:

```typescript
interface CacheAdapter {
  get(key: string): Promise<any> | any;
  set(key: string, value: any, ttl?: number): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  has(key: string): Promise<boolean> | boolean;
  keys(): Promise<string[]> | string[];
  clear(): Promise<void> | void;
  getMany(keys: string[]): Promise<Record<string, any>>;
  setMany(data: Record<string, any>, ttl?: number): Promise<void>;
}
```

## Use cases

- **Local data cache**: Reduce network requests, improve UX
- **Offline cache**: Offline-first app data
- **API response cache**: Cache API responses, avoid duplicate requests
- **Temporary storage**: Form data, user preferences
- **Performance**: Avoid redundant computation, faster load

## Performance

- **Batch ops**: getMany/setMany to reduce I/O
- **Multi-level cache**: Memory + persistent storage for faster reads
- **LRU**: Evict least recently used entries
- **TTL**: Auto-cleanup expired entries, avoid leaks
- **Async**: All operations are async, non-blocking

---

## Notes

- **Unified API**: Same API as server-side cache, easy to learn
- **Adapter pattern**: Multiple backends, easy to extend
- **Multi-level cache**: Improves read performance
- **Type-safe**: Full TypeScript support
- **No deps**: Pure TypeScript

---

## Contributing

Issues and Pull Requests welcome!

---

## License

Apache License 2.0 - see [LICENSE](../../../LICENSE)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
