import {$} from 'bun'
import path from 'node:path'

interface Versioned {
  version: string
}
const root = path.resolve(import.meta.dir, '..')
const dist = path.join(root, 'dist')
await $`rm -rf ${dist}`
const build = await Bun.build({
  entrypoints: [path.join(root, 'src', 'content.ts')],
  format: 'iife',
  minify: false,
  outdir: dist,
  sourcemap: 'none',
  target: 'browser',
})
if (!build.success) {
  throw new Error(build.logs.map(log => log.message).join('\n'))
}
const manifest = await Bun.file(path.join(root, 'extension', 'manifest.json')).json() as Versioned & Record<string, unknown>
const packageJson = await Bun.file(path.join(root, 'package.json')).json() as Versioned
manifest.version = packageJson.version
await Bun.write(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
