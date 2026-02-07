# Changelog

All notable changes to @dreamer/cache are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-02-07

### Added

- **Stable release**: First stable version with stable API

- **Cache adapters**:
  - MemoryAdapter - In-memory cache (Map-based, LRU/FIFO/LFU strategies)
  - FileAdapter - File system persistent cache
  - RedisAdapter - Redis cache with connection pool
  - MemcachedAdapter - Memcached in-memory cache

- **Cache features**:
  - TTL support (expiration time)
  - Batch operations (getMany, setMany)
  - Multi-level cache (MultiLevelCache)
  - Runtime adapter switching

- **Service container integration**:
  - createCacheManager factory function
  - CacheManager.fromContainer static method
  - Named manager support
  - @dreamer/service dependency injection

- **Client support**:
  - Browser storage cache via `jsr:@dreamer/cache/client`

### Compatibility

- Deno 2.5+
- Bun 1.0+
- Redis (for Redis adapter)
- Memcached (for Memcached adapter)
