interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * 高性能内存轻量缓存器 (带 TTL 与自动惰性淘汰)
 */
class MemoryCache {
  private store: Map<string, CacheEntry<any>> = new Map()

  public get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  public set<T>(key: string, data: T, ttlMs: number) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  public clear() {
    this.store.clear()
  }
}

export const memoryCache = new MemoryCache()
