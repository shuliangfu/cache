# Changelog

[English](./CHANGELOG.md) | [中文 (Chinese)](../zh-CN/CHANGELOG.md)

All notable changes to @dreamer/cache are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.3] - 2026-02-19

### Changed

- **Dependencies**: Bumped @dreamer/queue to ^1.0.1, @dreamer/service to ^1.0.2,
  @dreamer/test to ^1.0.11, @dreamer/runtime-adapter to ^1.0.15.
- **i18n**: `initCacheI18n` is no longer exported; i18n initializes
  automatically on module load. Remove any manual `initCacheI18n()` calls from
  application code. Use `setCacheLocale` when you need to set the locale (e.g.
  in tests).

---

## [1.0.2] - 2026-02-19

### Changed

- **i18n**: Renamed translation method from `$t` to `$tr` to avoid conflict with
  global `$t`. Update existing code to use `$tr` for package messages.

---

## [1.0.1] - 2026-02-18

### Added

- **i18n**: Server-side error messages use @dreamer/i18n with en-US and zh-CN
  locales. Exports `$t`, `initCacheI18n`, `setCacheLocale`, and `Locale` for
  RedisAdapter, MemcachedAdapter, and MultiLevelCache.

### Changed

- **Docs**: Restructured into `docs/en-US/` and `docs/zh-CN/` (README,
  CHANGELOG, TEST_REPORT, client README). Root README shortened with links to
  docs.
- **License**: Explicitly Apache-2.0 in `deno.json` and documentation.

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
