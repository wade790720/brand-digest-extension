// content script 不能是 ES module，所以用 esbuild 打成 IIFE。
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
await Promise.all(
  ['main-world', 'bridge'].map((name) =>
    build({
      entryPoints: [path.join(root, 'src/content', `${name}.ts`)],
      outfile: path.join(root, 'dist', `${name}.js`),
      bundle: true,
      format: 'iife',
      target: 'chrome116',
      alias: { '@': path.join(root, 'src') },
      minify: true,
    }),
  ),
)
console.log('content scripts built')
