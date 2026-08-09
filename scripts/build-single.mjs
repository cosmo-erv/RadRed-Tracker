#!/usr/bin/env node
/**
 * Folds the production build into one self-contained HTML file: CSS, JS and
 * every sprite (as data URIs) inlined, no network at runtime. Useful for
 * opening the tracker straight off a phone, a share sheet or a USB stick.
 *
 * Run `npm run build` first, then `npm run single`. Outputs:
 *   dist/single/radred-tracker.html  — complete document, open it anywhere
 *   dist/single/embed.html           — body-only fragment for embedding hosts
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const out = resolve(dist, 'single')

const html = await readFile(resolve(dist, 'index.html'), 'utf8')

/* Vite emits hashed asset names, so read them out of the built index.html in
   the order it references them — module order matters for the app chunk. */
const cssFiles = [...html.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1])
const jsFiles = [...html.matchAll(/src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const preloaded = [...html.matchAll(/href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const scripts = [...new Set([...preloaded, ...jsFiles])]

if (cssFiles.length === 0 || scripts.length === 0)
  throw new Error('No built assets found — run `npm run build` first.')

const css = (
  await Promise.all(cssFiles.map((file) => readFile(resolve(dist, file), 'utf8')))
).join('\n')

const js = (
  await Promise.all(scripts.map((file) => readFile(resolve(dist, file), 'utf8')))
).join('\n;\n')

const spriteDir = resolve(dist, 'sprites')
const sprites = {}
let spriteBytes = 0
for (const file of (await readdir(spriteDir)).filter((name) => name.endsWith('.png'))) {
  const buffer = await readFile(resolve(spriteDir, file))
  spriteBytes += buffer.length
  sprites[file.replace(/\.png$/, '')] = `data:image/png;base64,${buffer.toString('base64')}`
}

const icon = await readFile(resolve(dist, 'icons/icon-192.png'))

const body = `<div id="root"></div>
<script>window.__SPRITE_DATA__ = ${JSON.stringify(sprites)}</script>
<script type="module">${js}</script>`

// The bundle is an ES module and needs no import map; a plain document wrapper
// is enough for file:// and any static host.
const document = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#17100f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="RadRed">
<link rel="apple-touch-icon" href="data:image/png;base64,${icon.toString('base64')}">
<title>RadRed Nuzlocke</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`

await mkdir(out, { recursive: true })
await writeFile(resolve(out, 'radred-tracker.html'), document)
await writeFile(resolve(out, 'embed.html'), `<title>RadRed Nuzlocke</title>\n<style>${css}</style>\n${body}`)

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`
console.log(
  `single file: ${mb(document.length)} (js ${mb(js.length)}, css ${mb(css.length)}, ` +
    `${Object.keys(sprites).length} sprites ${mb(spriteBytes)} raw)`
)
