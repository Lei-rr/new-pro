import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

rmSync(path.join(root, 'dist'), { recursive: true, force: true })

await build({
  entryPoints: [path.join(root, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  outfile: path.join(root, 'dist/server.js'),
})
