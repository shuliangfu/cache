# 变更日志

本文档记录 @dreamer/cache 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.0.0] - 2026-02-07

### 新增

- **稳定版发布**：首枚稳定版本，API 稳定

- **缓存适配器**：
  - MemoryAdapter - 内存缓存（基于 Map，支持 LRU/FIFO/LFU 策略）
  - FileAdapter - 文件系统持久化缓存
  - RedisAdapter - Redis 缓存，支持连接池
  - MemcachedAdapter - Memcached 内存缓存

- **缓存特性**：
  - TTL 支持（过期时间）
  - 批量操作（getMany、setMany）
  - 多级缓存（MultiLevelCache）
  - 运行时切换适配器

- **服务容器集成**：
  - createCacheManager 工厂函数
  - CacheManager.fromContainer 静态方法
  - 命名管理器支持
  - @dreamer/service 依赖注入

- **客户端支持**：
  - 通过 `jsr:@dreamer/cache/client` 使用浏览器存储缓存

### 兼容性

- Deno 2.5+
- Bun 1.0+
- Redis（Redis 适配器）
- Memcached（Memcached 适配器）
