import type { FastifyInstance } from 'fastify'
import { getConfig } from '../../config.js'
import { getDbPoolStats } from '../../core/db.js'
import { inflightCount, listCaches } from '../../core/cache.js'
import { renderMetrics, registerGaugeSource, setGauge } from '../../core/metrics.js'
import { safeCompare } from '../../core/auth.js'
import { isPrivateIp } from '../../shared/ip.js'
import { realtimeBroadcaster } from '../../services/broadcaster.js'
import { getGeoStats } from '../../services/geoip.js'

function registerProcessCollectors(): void {
  registerGaugeSource('newpro_process_uptime_seconds', 'Process uptime in seconds', () => {
    setGauge('newpro_process_uptime_seconds', process.uptime())
  })
  registerGaugeSource('newpro_process_memory_rss_bytes', 'Resident memory size in bytes', () => {
    setGauge('newpro_process_memory_rss_bytes', process.memoryUsage().rss)
  })
  registerGaugeSource('newpro_process_heap_used_bytes', 'V8 heap used bytes', () => {
    setGauge('newpro_process_heap_used_bytes', process.memoryUsage().heapUsed)
  })
  registerGaugeSource('newpro_ws_subscribers', 'Active WebSocket subscribers', () => {
    setGauge('newpro_ws_subscribers', realtimeBroadcaster.subscriberCount)
  })
  registerGaugeSource('newpro_db_pool_connections', 'Database pool connections by state', () => {
    const stats = getDbPoolStats()
    setGauge('newpro_db_pool_connections', stats.total, { state: 'total' })
    setGauge('newpro_db_pool_connections', stats.idle, { state: 'idle' })
    setGauge('newpro_db_pool_connections', stats.waiting, { state: 'waiting' })
  })
  registerGaugeSource('newpro_cache_inflight', 'In-flight single-flight loads', () => {
    setGauge('newpro_cache_inflight', inflightCount())
  })
  registerGaugeSource('newpro_geo_cache_entries', 'GeoIP cache entries', () => {
    setGauge('newpro_geo_cache_entries', getGeoStats().cacheSize)
  })
  registerGaugeSource('newpro_geo_online_quota_used', 'GeoIP online lookups used today', () => {
    setGauge('newpro_geo_online_quota_used', getGeoStats().onlineUsedToday)
  })
  registerGaugeSource('newpro_geo_online_quota_limit', 'GeoIP online daily quota', () => {
    setGauge('newpro_geo_online_quota_limit', getGeoStats().onlineDailyQuota)
  })
  registerGaugeSource('newpro_cache_entries', 'Cache entries by name', () => {
    for (const { name, stats } of listCaches()) {
      setGauge('newpro_cache_entries', stats.size, { cache: name })
    }
  })
  registerGaugeSource('newpro_cache_hits_total', 'Cache hits by name', () => {
    for (const { name, stats } of listCaches()) {
      setGauge('newpro_cache_hits_total', stats.hits, { cache: name })
    }
  })
  registerGaugeSource('newpro_cache_misses_total', 'Cache misses by name', () => {
    for (const { name, stats } of listCaches()) {
      setGauge('newpro_cache_misses_total', stats.misses, { cache: name })
    }
  })
  registerGaugeSource('newpro_cache_stale_hits_total', 'Cache stale fallbacks by name', () => {
    for (const { name, stats } of listCaches()) {
      setGauge('newpro_cache_stale_hits_total', stats.staleHits, { cache: name })
    }
  })
}

export async function registerMetricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/system/metrics', async (req, reply) => {
    const token = getConfig().metricsToken

    // 未配置令牌时仅允许内网抓取；配置后支持 Bearer 或内网直连
    const header = req.headers.authorization
    const bearer = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : ''
    const authorized = token
      ? safeCompare(bearer, token)
      : isPrivateIp(req.ip ?? '')
    if (!authorized) {
      return reply.status(403).send({ success: false, error: '未授权访问指标端点' })
    }

    registerProcessCollectors()
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics())
  })
}
