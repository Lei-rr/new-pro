interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * 内存 LRU 缓存器 (带 TTL 限制与容量上限淘汰)
 */
export class MemoryCache {
  private store: Map<string, CacheEntry<unknown>> = new Map()
  private readonly maxSize: number

  constructor(maxSize: number = 5000) {
    this.maxSize = maxSize
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    // LRU 访问热度更新
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.data as T
  }

  public set<T>(key: string, data: T, ttlMs: number): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    } else if (this.store.size >= this.maxSize) {
      // 淘汰最早访问项
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.store.delete(oldestKey)
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  public delete(key: string): boolean {
    return this.store.delete(key)
  }

  public clear(): void {
    this.store.clear()
  }

  public size(): number {
    return this.store.size
  }
}

export const memoryCache = new MemoryCache(5000)
