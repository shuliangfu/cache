/**
 * @module @dreamer/cache/i18n
 *
 * Cache 包 i18n：适配器错误信息等文案的国际化。不挂全局，各模块通过 import $tr 使用。
 * 未传 lang 时从环境变量（LANGUAGE/LC_ALL/LANG）自动检测语言。
 */

import {
  createI18n,
  type I18n,
  type TranslationData,
  type TranslationParams,
} from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";
import enUS from "./locales/en-US.json" with { type: "json" };
import zhCN from "./locales/zh-CN.json" with { type: "json" };

/** 支持的 locale */
export type Locale = "en-US" | "zh-CN";

/** 检测失败时使用的默认 locale */
export const DEFAULT_LOCALE: Locale = "en-US";

const CACHE_LOCALES: Locale[] = ["en-US", "zh-CN"];

const LOCALE_DATA: Record<string, TranslationData> = {
  "en-US": enUS as TranslationData,
  "zh-CN": zhCN as TranslationData,
};

/** init 时创建的实例，不挂全局 */
let cacheI18n: I18n | null = null;

/**
 * 检测当前语言：LANGUAGE > LC_ALL > LANG。
 */
export function detectLocale(): Locale {
  const langEnv = getEnv("LANGUAGE") || getEnv("LC_ALL") || getEnv("LANG");
  if (!langEnv) return DEFAULT_LOCALE;
  const first = langEnv.split(/[:\s]/)[0]?.trim();
  if (!first) return DEFAULT_LOCALE;
  const match = first.match(/^([a-z]{2})[-_]([A-Z]{2})/i);
  if (match) {
    const normalized = `${match[1].toLowerCase()}-${
      match[2].toUpperCase()
    }` as Locale;
    if (CACHE_LOCALES.includes(normalized)) return normalized;
  }
  const primary = first.substring(0, 2).toLowerCase();
  if (primary === "zh") return "zh-CN";
  if (primary === "en") return "en-US";
  return DEFAULT_LOCALE;
}

/** 内部初始化，导入 i18n 时自动执行，不导出 */
function initCacheI18n(): void {
  if (cacheI18n) return;
  const i18n = createI18n({
    defaultLocale: DEFAULT_LOCALE,
    fallbackBehavior: "default",
    locales: [...CACHE_LOCALES],
    translations: LOCALE_DATA as Record<string, TranslationData>,
  });
  i18n.setLocale(detectLocale());
  cacheI18n = i18n;
}

initCacheI18n();

/**
 * 设置当前语言（供配置 options.lang 使用）。
 */
export function setCacheLocale(lang: Locale): void {
  initCacheI18n();
  if (cacheI18n) cacheI18n.setLocale(lang);
}

/**
 * 框架专用翻译。未传 lang 时使用当前 locale。
 * 首次调用时若未初始化则自动调用 initCacheI18n()，避免测试或未显式初始化时直接输出 key。
 */
export function $tr(
  key: string,
  params?: TranslationParams,
  lang?: Locale,
): string {
  if (!cacheI18n) initCacheI18n();
  if (!cacheI18n) return key;
  if (lang !== undefined) {
    const prev = cacheI18n.getLocale();
    cacheI18n.setLocale(lang);
    try {
      return cacheI18n.t(key, params);
    } finally {
      cacheI18n.setLocale(prev);
    }
  }
  return cacheI18n.t(key, params);
}
