#!/usr/bin/env node
/**
 * Draws the app icons (home screen + manifest) with no image dependencies:
 * a poké ball on the app's dark background, written straight out as PNG.
 */
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')

const BG = [23, 16, 15]
const RED = [232, 69, 60]
const CREAM = [244, 236, 234]
const INK = [20, 16, 15]

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[i] = c
    }
  }
  let crc = -1
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixel) {
  // One filter byte (0 = none) per row, then RGB triples.
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Anti-aliased by supersampling each pixel 3×3. */
function ball(size) {
  const c = size / 2
  const outer = size * 0.36
  const band = size * 0.055
  const inner = size * 0.105
  const ring = size * 0.145

  const sample = (x, y) => {
    const dx = x - c
    const dy = y - c
    const dist = Math.hypot(dx, dy)
    if (dist > outer) return BG
    if (dist <= inner) return CREAM
    if (dist <= ring) return INK
    if (Math.abs(dy) <= band) return INK
    return dy < 0 ? RED : CREAM
  }

  return (x, y) => {
    let r = 0
    let g = 0
    let b = 0
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const [pr, pg, pb] = sample(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)
        r += pr
        g += pg
        b += pb
      }
    }
    return [Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)]
  }
}

await mkdir(outDir, { recursive: true })
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512]
]) {
  await writeFile(resolve(outDir, name), png(size, ball(size)))
  console.log('wrote', name, `${size}×${size}`)
}
