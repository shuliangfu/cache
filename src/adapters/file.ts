/**
 * @module @dreamer/cache/adapters/file
 *
 * @fileoverview 文件缓存适配器
 */

import {
  join,
  mkdir,
  readTextFile,
  remove,
  stat,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import type { CacheAdapter, CacheItem } from "./types.ts";

/**
 * 文件缓存适配器配置选项
 */
export interface FileAdapterOptions {
  /** 缓存目录路径（默认：./cache） */
  cacheDir?: string;
  /** 默认过期时间（秒） */
  ttl?: number;
  /** 键前缀（可选） */
  prefix?: string;
}

/**
 * 文件缓存适配器
 * 基于文件系统的持久化缓存，支持 TTL 和标签
 */
export class FileAdapter implements CacheAdapter {
  private cacheDir: string;
  private options: Required<Omit<FileAdapterOptions, "prefix">> & {
    prefix?: string;
  };
  private cleanupTimer?: number;

  constructor(options: FileAdapterOptions = {}) {
    this.cacheDir = options.cacheDir || "./cache";
    this.options = {
      cacheDir: this.cacheDir,
      ttl: options.ttl || 0,
      prefix: options.prefix,
    };

    // 确保缓存目录存在
    this.initCacheDir();

    // 如果设置了 TTL，启动定期清理
    if (this.options.ttl > 0) {
      this.startCleanup();
    }
  }

  /**
   * 初始化缓存目录
   */
  private async initCacheDir(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // 忽略已存在的目录错误
      if (
        !(error instanceof Error && error.message.includes("already exists"))
      ) {
        throw error;
      }
    }
  }

  /**
   * 获取文件路径
   */
  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefixedKey = this.options.prefix
      ? `${this.options.prefix}_${safeKey}`
      : safeKey;
    return join(this.cacheDir, `${prefixedKey}.json`);
  }

  /**
   * 获取缓存
   */
  async get(key: string): Promise<unknown> {
    try {
      const filePath = this.getFilePath(key);
      const content = await readTextFile(filePath);
      const item: CacheItem = JSON.parse(content);

      // 检查是否过期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        await this.delete(key);
        return undefined;
      }

      // 更新访问信息
      item.accessedAt = Date.now();
      item.accessCount++;
      await writeTextFile(filePath, JSON.stringify(item));

      return item.value;
    } catch {
      // 文件不存在或其他错误，返回 undefined
      return undefined;
    }
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），可选
   * @param tags 标签数组，可选，用于批量删除
   */
  async set(
    key: string,
    value: unknown,
    ttl?: number,
    tags?: string[],
  ): Promise<void> {
    await this.initCacheDir();

    const now = Date.now();
    const expiresAt = ttl
      ? now + ttl * 1000
      : this.options.ttl > 0
      ? now + this.options.ttl * 1000
      : undefined;

    const item: CacheItem = {
      value,
      expiresAt,
      accessedAt: now,
      accessCount: 0,
      tags: tags || undefined,
    };

    const filePath = this.getFilePath(key);
    await writeTextFile(filePath, JSON.stringify(item));
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await remove(filePath);
    } catch {
      // 文件不存在，忽略错误
    }
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile) {
        return false;
      }

      // 检查是否过期
      const content = await readTextFile(filePath);
      const item: CacheItem = JSON.parse(content);
      if (item.expiresAt && Date.now() > item.expiresAt) {
        await this.delete(key);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    try {
      const { readdir } = await import("@dreamer/runtime-adapter");
      const entries = await readdir(this.cacheDir);
      const keys: string[] = [];
      const prefix = this.options.prefix ? `${this.options.prefix}_` : "";

      for (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const key = entry.name
            .replace(/\.json$/, "")
            .replace(
              new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
              "",
            );
          if (await this.has(key)) {
            keys.push(key);
          }
        }
      }

      return keys;
    } catch {
      return [];
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.delete(key);
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 批量获取
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 批量设置
   */
  async setMany(data: Record<string, unknown>, ttl?: number): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      await this.set(key, value, ttl);
    }
  }

  /**
   * 根据标签删除缓存
   * @param tags 标签数组
   * @returns 删除的缓存键数量
   */
  async deleteByTags(tags: string[]): Promise<number> {
    if (!tags || tags.length === 0) {
      return 0;
    }

    const tagSet = new Set(tags);
    const keys = await this.keys();
    const keysToDelete: string[] = [];

    for (const key of keys) {
      try {
        const filePath = this.getFilePath(key);
        const content = await readTextFile(filePath);
        const item: CacheItem = JSON.parse(content);

        // 检查是否匹配标签
        if (item.tags && item.tags.some((tag) => tagSet.has(tag))) {
          keysToDelete.push(key);
        }
      } catch {
        // 忽略读取错误
      }
    }

    // 删除匹配的缓存项
    for (const key of keysToDelete) {
      await this.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * 启动定期清理过期项
   */
  private startCleanup(): void {
    // 每分钟清理一次
    this.cleanupTimer = setInterval(async () => {
      try {
        const keys = await this.keys();
        for (const key of keys) {
          // has 方法会自动清理过期项
          await this.has(key);
        }
      } catch {
        // 忽略清理错误
      }
    }, 60000) as unknown as number;
  }

  /**
   * 停止清理定时器
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}
