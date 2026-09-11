import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import compress from '@fastify/compress'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { loadConfig } from './config.js'
import { initDb } from './db.js'
import { registerApiRoutes } from './routes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config = loadConfig()

// 初始化数据库连接池
initDb(config.pgDsn)

const server = Fastify({
  logger: {
    level: config.logLevel,
  },
})

// 注册 WebSocket 支持
await server.register(fastifyWebsocket)

// 注册基础插件
await server.register(cors, {
  origin: true,
  credentials: true,
})

await server.register(cookie)

await server.register(helmet, {
  contentSecurityPolicy: false, // 允许 SPA 内部内联资源和 SVG
  crossOriginOpenerPolicy: false, // 允许 HTTP IP 环境下跨源上下文平稳工作
  crossOriginResourcePolicy: false,
  originAgentCluster: false,
})

await server.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
})

await server.register(compress)

// 注册 API 路由
await server.register(registerApiRoutes, { prefix: '/api' })

// 静态资源托管（打包后 web 产物）
const webDistPath = path.resolve(process.cwd(), 'web/dist')
if (fs.existsSync(webDistPath)) {
  await server.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
  })

  // SPA fallback
  server.setNotFoundHandler(async (req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api')) {
      reply.status(404).send({ success: false, error: 'API not found' })
      return
    }
    return reply.sendFile('index.html')
  })
}

// 优雅关闭
const closeSignals = ['SIGINT', 'SIGTERM'] as const
for (const signal of closeSignals) {
  process.on(signal, async () => {
    server.log.info(`Received ${signal}, closing server gracefully...`)
    await server.close()
    process.exit(0)
  })
}

try {
  await server.listen({ host: config.host, port: config.port })
  console.log(`\n🚀 new-pro 分析服务已启动: http://${config.host}:${config.port}`)
  console.log(`📊 数据库连接目标: ${config.pgDsn.replace(/:[^:@]+@/, ':****@')}\n`)
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
