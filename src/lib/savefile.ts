import speciesIds from '../data/species-ids.json'
import { dex } from './game'
import type { Slug } from './types'

const SPECIES: Record<string, Slug> = speciesIds as Record<string, Slug>

/*
 * Reading a Radical Red save.
 *
 * Radical Red is a Fire Red hack on the Complete Fire Red Upgrade engine,
 * which keeps Generation III's save layout: 128 KB holding two 14-sector
 * slots, each sector 4 KB with a footer carrying its id, a checksum and a
 * counter. The newer slot wins. Party Pokémon live in save block 1, boxed
 * ones in the storage block that spans sectors 5 to 13.
 *
 * Each Pokémon's interesting half is 48 bytes encrypted against its own
 * personality value and trainer id, split into four 12-byte substructures
 * whose order is a permutation chosen by that same personality value.
 *
 * Species numbering is the engine's own, not the national dex, so it is
 * resolved through a table generated from the engine's header at build time.
 */

const SECTOR_SIZE = 0x1000
const SECTOR_DATA = 0xff0
const FOOTER_ID = 0xff4
const FOOTER_SIGNATURE = 0xff8
const FOOTER_COUNTER = 0xffc
const SIGNATURE = 0x08012025
const SECTORS_PER_SLOT = 14

/** Sector ids that make up each block, in the order they concatenate. */
const SAVE_BLOCK_1 = [1, 2, 3, 4]
const STORAGE = [5, 6, 7, 8, 9, 10, 11, 12, 13]

/** Fire Red keeps the party count and the party itself here in save block 1. */
const PARTY_COUNT = 0x0034
const PARTY = 0x0038
const PARTY_MON_SIZE = 100
const BOX_MON_SIZE = 80

/** Storage: a u32 of "current box", then the boxes themselves. */
const BOX_START = 4
const BOX_COUNT = 25
const PER_BOX = 30

/** Which substructure sits in which slot, indexed by personality % 24. */
const ORDERS = [
  'GAEM', 'GAME', 'GEAM', 'GEMA', 'GMAE', 'GMEA',
  'AGEM', 'AGME', 'AEGM', 'AEMG', 'AMGE', 'AMEG',
  'EGAM', 'EGMA', 'EAGM', 'EAMG', 'EMGA', 'EMAG',
  'MGAE', 'MGEA', 'MAGE', 'MAEG', 'MEGA', 'MEAG'
]

/**
 * Generation III's text encoding. Only the characters a nickname can hold are
 * mapped; anything else becomes empty so a stray byte cannot inject junk.
 */
const CHARS: Record<number, string> = { 0x00: ' ', 0xae: '-', 0xba: '.', 0xb8: ',' }
for (let i = 0; i < 10; i++) CHARS[0xa1 + i] = String(i)
for (let i = 0; i < 26; i++) CHARS[0xbb + i] = String.fromCharCode(65 + i)
for (let i = 0; i < 26; i++) CHARS[0xd5 + i] = String.fromCharCode(97 + i)

const TERMINATOR = 0xff

function readText(view: DataView, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    const byte = view.getUint8(offset + i)
    if (byte === TERMINATOR) break
    out += CHARS[byte] ?? ''
  }
  return out.trim()
}

/** Experience needed for a level, by PokeAPI growth-rate id. */
function expForLevel(growth: number, level: number): number {
  const n = level
  switch (growth) {
    case 1: // slow
      return Math.floor((5 * n ** 3) / 4)
    case 3: // fast
      return Math.floor((4 * n ** 3) / 5)
    case 4: // medium-slow
      return Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140)
    case 5: // erratic
      if (n <= 50) return Math.floor((n ** 3 * (100 - n)) / 50)
      if (n <= 68) return Math.floor((n ** 3 * (150 - n)) / 100)
      if (n <= 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500)
      return Math.floor((n ** 3 * (160 - n)) / 100)
    case 6: // fluctuating
      if (n <= 15) return Math.floor((n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50)
      if (n <= 36) return Math.floor((n ** 3 * (n + 14)) / 50)
      return Math.floor((n ** 3 * (Math.floor(n / 2) + 32)) / 50)
    default: // medium-fast
      return n ** 3
  }
}

function levelFromExp(slug: Slug, exp: number): number {
  const growth = dex(slug).growth ?? 2
  let level = 1
  while (level < 100 && expForLevel(growth, level + 1) <= exp) level++
  return level
}

export interface SaveMon {
  slug: Slug
  nickname: string
  level: number
  /** Where it was: the party, or a box number. */
  from: 'party' | number
}

export interface SaveRead {
  trainer: string
  party: SaveMon[]
  boxed: SaveMon[]
  /** Species ids the file held that could not be resolved. */
  unresolved: number[]
}

export type SaveResult = { ok: true; save: SaveRead } | { ok: false; error: string }

/** Sector map for the newer of the two save slots. */
function pickSlot(view: DataView): Map<number, number> | null {
  const slots: { counter: number; sectors: Map<number, number> }[] = []

  for (let slot = 0; slot < 2; slot++) {
    const sectors = new Map<number, number>()
    let counter = -1
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const base = (slot * SECTORS_PER_SLOT + i) * SECTOR_SIZE
      if (base + SECTOR_SIZE > view.byteLength) break
      if (view.getUint32(base + FOOTER_SIGNATURE, true) !== SIGNATURE) continue
      sectors.set(view.getUint16(base + FOOTER_ID, true), base)
      counter = Math.max(counter, view.getUint32(base + FOOTER_COUNTER, true))
    }
    if (sectors.size > 0) slots.push({ counter, sectors })
  }

  if (slots.length === 0) return null
  return slots.sort((a, b) => b.counter - a.counter)[0].sectors
}

/** Concatenates the data halves of a block's sectors, in sector-id order. */
function block(view: DataView, sectors: Map<number, number>, ids: number[]): Uint8Array | null {
  const parts: Uint8Array[] = []
  for (const id of ids) {
    const base = sectors.get(id)
    if (base === undefined) return null
    parts.push(new Uint8Array(view.buffer, view.byteOffset + base, SECTOR_DATA))
  }
  const out = new Uint8Array(parts.length * SECTOR_DATA)
  parts.forEach((part, index) => out.set(part, index * SECTOR_DATA))
  return out
}

function readMon(bytes: Uint8Array, offset: number, size: number, from: SaveMon['from']) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, size)
  const personality = view.getUint32(0x00, true)
  const otId = view.getUint32(0x04, true)
  if (personality === 0 && otId === 0) return null

  // The 48 data bytes are XORed against the trainer id and personality.
  const key = (otId ^ personality) >>> 0
  const data = new DataView(new ArrayBuffer(48))
  for (let i = 0; i < 48; i += 4) {
    data.setUint32(i, (view.getUint32(0x20 + i, true) ^ key) >>> 0, true)
  }

  const order = ORDERS[personality % 24]
  const growth = order.indexOf('G') * 12

  const speciesId = data.getUint16(growth + 0, true)
  if (speciesId === 0) return null

  // Move ids are the engine's own numbering too, and no table for them is
  // reachable from this build, so movesets are left for you to fill in rather
  // than imported as whatever mainline move happens to share an index.
  const experience = data.getUint32(growth + 4, true)
  const slug = SPECIES[String(speciesId)]
  if (!slug) return { speciesId, mon: null as SaveMon | null }

  // Party members carry their level outright; boxed ones only experience.
  const level =
    from === 'party' && size >= PARTY_MON_SIZE
      ? view.getUint8(0x54) || levelFromExp(slug, experience)
      : levelFromExp(slug, experience)

  return {
    speciesId,
    mon: {
      slug,
      nickname: readText(view, 0x08, 10),
      level: Math.min(Math.max(level, 1), 100),
      from
    }
  }
}

/**
 * Reads a .sav into the party and boxes it holds. Anything that does not look
 * like a Generation III save is rejected by name rather than parsed into
 * nonsense.
 */
export function readSave(buffer: ArrayBuffer): SaveResult {
  if (buffer.byteLength < SECTORS_PER_SLOT * SECTOR_SIZE) {
    return { ok: false, error: 'That file is too small to be a save — expected at least 64 KB.' }
  }

  const view = new DataView(buffer)
  const sectors = pickSlot(view)
  if (!sectors) {
    return {
      ok: false,
      error: 'No Game Boy Advance save data in that file. Export the .sav from your emulator.'
    }
  }

  const saveBlock = block(view, sectors, SAVE_BLOCK_1)
  if (!saveBlock) return { ok: false, error: 'That save is missing sectors and cannot be read.' }

  // The trainer's name opens save block 2, which is sector 0 on its own.
  const trainerBase = sectors.get(0)
  const trainer =
    trainerBase === undefined ? '' : readText(new DataView(buffer, trainerBase, SECTOR_DATA), 0, 7)

  const unresolved = new Set<number>()
  const party: SaveMon[] = []
  const count = Math.min(new DataView(saveBlock.buffer).getUint32(PARTY_COUNT, true), 6)

  for (let i = 0; i < count; i++) {
    const read = readMon(saveBlock, PARTY + i * PARTY_MON_SIZE, PARTY_MON_SIZE, 'party')
    if (!read) continue
    if (read.mon) party.push(read.mon)
    else unresolved.add(read.speciesId)
  }

  const boxed: SaveMon[] = []
  const storage = block(view, sectors, STORAGE)
  if (storage) {
    for (let box = 0; box < BOX_COUNT; box++) {
      for (let slot = 0; slot < PER_BOX; slot++) {
        const offset = BOX_START + (box * PER_BOX + slot) * BOX_MON_SIZE
        if (offset + BOX_MON_SIZE > storage.length) break
        const read = readMon(storage, offset, BOX_MON_SIZE, box + 1)
        if (!read) continue
        if (read.mon) boxed.push(read.mon)
        else unresolved.add(read.speciesId)
      }
    }
  }

  if (party.length === 0 && boxed.length === 0) {
    return {
      ok: false,
      error: 'That save parsed, but held no Pokémon this app recognised. It may not be Radical Red.'
    }
  }

  return { ok: true, save: { trainer, party, boxed, unresolved: [...unresolved] } }
}
