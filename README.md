# @dreamer/cache

> A cache library compatible with Deno and Bun, providing a unified cache
> interface and server-side caching (memory, file, Redis).

[![JSR](https://jsr.io/badges/@dreamer/cache)](https://jsr.io/@dreamer/cache)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-208%20passed-brightgreen)](./docs/en-US/TEST_REPORT.md)

📖 **Docs**: [English](./docs/en-US/README.md) |
[中文 (Chinese)](./docs/zh-CN/README.md)

**Changelog**: [en-US](./docs/en-US/CHANGELOG.md) |
[zh-CN](./docs/zh-CN/CHANGELOG.md)

**Latest (v1.0.3)**: Dependencies updated; i18n auto-initializes,
`initCacheI18n` no longer exported. See [CHANGELOG](./docs/en-US/CHANGELOG.md).

---

## Features

- **Local cache**: Memory (Map), LRU, TTL, eviction (FIFO/LFU/LRU)
- **File cache**: Persistent, JSON, auto cleanup, file lock
- **Redis / Memcached**: Connection pool, batch ops
- **Adapter pattern**: CacheAdapter, multi-level cache, runtime switch
- **Service container**: createCacheManager, fromContainer

## Installation

```bash
deno add jsr:@dreamer/cache
# client
deno add jsr:@dreamer/cache/client
```

## Quick start

```typescript
import { CacheManager, MemoryAdapter } from "jsr:@dreamer/cache";

const cache = new CacheManager(new MemoryAdapter({ ttl: 300 }));
await cache.set("key", "value");
const value = await cache.get("key");
```

- **Client**: [en-US](./docs/en-US/client/README.md) ·
  [zh-CN](./docs/zh-CN/client/README.md)
- **Test report**: [en-US](./docs/en-US/TEST_REPORT.md) ·
  [zh-CN](./docs/zh-CN/TEST_REPORT.md)

See [docs/en-US/README.md](./docs/en-US/README.md) or
[docs/zh-CN/README.md](./docs/zh-CN/README.md) for full documentation.

---

## License

Apache-2.0 - see [LICENSE](./LICENSE)
