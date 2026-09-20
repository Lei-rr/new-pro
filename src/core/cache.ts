interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CacheStats {
  hits: number
  misses: number
  staleHits: number
  size: number
  maxSize: number
}

/**
 * 进程内 TTL + LRU 缓存。
 * - 命中未过期数据：零分配直接返回
 * - 过期数据在被淘汰前可作为兜底（见 getStale）
 * - 内置命中率统计，供 /metrics 暴露
 */
export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private hits = 0
  private misses = 0
  private staleHits = 0

  constructor(private readonly maxSize = 2000) {}

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.misses += 1
      return null
    }
    this.hits += 1
    this.touch(key, entry)
    return entry.value as T
  }

  /** 过期但仍在 LRU 内的旧值，用于上游抖动时的降级输出 */
  getStale<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    this.staleHits += 1
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    } else if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      size: this.store.size,
      maxSize: this.maxSize,
    }
  }

  private touch(key: string, entry: CacheEntry<unknown>): void {
    this.store.delete(key)
    this.store.set(key, entry)
  }
}

/**
 * 并发合并（single-flight）+ 过期兜底。
 * - 同一 key 的并发请求只触发一次上游查询
 * - 上游查询失败时，若存在过期旧值则降级返回旧值，避免大屏整屏报错
 */
const inflight = new Map<string, Promise<unknown>>()
const registry = new Map<string, MemoryCache>()

export function inflightCount(): number {
  return inflight.size
}

/** 按名称注册缓存实例，便于统一暴露命中率指标；返回实例以支持链式声明 */
export function registerCache<T extends MemoryCache>(name: string, cache: T): T {
  registry.set(name, cache)
  return cache
}

export function listCaches(): Array<{ name: string; stats: CacheStats }> {
  return Array.from(registry, ([name, cache]) => ({ name, stats: cache.stats() }))
}

export async function cached<T>(
  cache: MemoryCache,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  if (ttlMs > 0) {
    const hit = cache.get<T>(key)
    if (hit !== null) return hit
  }

  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running

  const task = loader()
    .then((value) => {
      if (ttlMs > 0) cache.set(key, value, ttlMs)
      return value
    })
    .catch((err) => {
      const stale = cache.getStale<T>(key)
      if (stale !== null) return stale
      throw err
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, task)
  return task
}
