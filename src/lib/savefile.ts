import speciesIds from '../data/species-ids.json'
import { dex } from './game'
import type { Slug } from './types'

const SPECIES: Record<string, Slug> = speciesIds as Record<string, Slug>

/*
 * Reading a Radical Red save.
 *
 * Radical Red is a Fire Red hack on the Complete Fire Red Upgrade engine. It
 * keeps Generation III's outer shape — 128 KB holding two 14-sector slots,
 * each sector 4 KB with a footer carrying its id, a checksum and a counter,
 * the newer slot winning — but the Pokémon inside are not vanilla:
 *
 *   - They are stored in the clear. Vanilla encrypts each Pokémon's 48 data
 *     bytes against its personality value and shuffles four substructures into
 *     one of 24 orders; this engine does neither, and leaves the per-Pokémon
 *     checksum zeroed.
 *   - Party members keep the 100-byte record with the 32-byte header, so their
 *     species sits at 0x20 and their level is stored outright at 0x54.
 *   - Boxed Pokémon are compressed to 58 bytes with the checksum and padding
 *     dropped, moving species to 0x1C and experience to 0x20, and carry no
 *     level — it has to be worked back out of experience and growth rate.
 *
 * All of that was established by reading a real 4.1 save rather than assumed
 * from the vanilla format, which is why it disagrees with the documentation
 * for stock Fire Red.
 */

const SECTOR_SIZE = 0x1000
const SECTOR_DATA = 0xff0
const FOOTER_ID = 0xff4
const FOOTER_SIGNATURE = 0xff8
const FOOTER_COUNTER = 0xffc
const SIGNATURE = 0x08012025
const SECTORS_PER_SLOT = 14

const SAVE_BLOCK_1 = [1, 2, 3, 4]
const STORAGE = [5, 6, 7, 8, 9, 10, 11, 12, 13]

const PARTY_COUNT = 0x0034
const PARTY = 0x0038
const PARTY_MON_SIZE = 100
const PARTY_SPECIES = 0x20
const PARTY_EXP = 0x24
const PARTY_LEVEL = 0x54

/** Storage opens with a u32 "current box", then the compressed records. */
const BOX_START = 4
const BOX_MON_SIZE = 58
const BOX_SPECIES = 0x1c
const BOX_EXP = 0x20

const NICKNAME = 0x08
const NICKNAME_LENGTH = 10
const LANGUAGE = 0x12
/** Every real record carries this; stale bytes in an empty slot do not. */
const LANGUAGE_OK = 0x0202
/** The most experience any growth rate needs for level 100. */
const MAX_EXP = 1_640_000

const CHARS: Record<number, string> = { 0x00: ' ', 0xae: '-', 0xba: '.', 0xb8: ',' }
for (let i = 0; i < 10; i++) CHARS[0xa1 + i] = String(i)
for (let i = 0; i < 26; i++) CHARS[0xbb + i] = String.fromCharCode(65 + i)
for (let i = 0; i < 26; i++) CHARS[0xd5 + i] = String.fromCharCode(97 + i)

const TERMINATOR = 0xff

function readText(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + i]
    if (byte === TERMINATOR || byte === undefined) break
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
  /** The engine's own species number, kept so a wrong guess can be corrected. */
  speciesId: number
  slug: Slug
  nickname: string
  level: number
  from: 'party' | 'box'
}

export interface SaveRead {
  trainer: string
  party: SaveMon[]
  boxed: SaveMon[]
  /** Species numbers this build has no name for. */
  unresolved: number[]
}

export type SaveResult = { ok: true; save: SaveRead } | { ok: false; error: string }

function pickSlot(view: DataView): Map<number, number> | null {
  const slots: { counter: number; sectors: Map<number, number> }[] = []

  for (let slot = 0; slot < 2; slot++) {
    const sectors = new Map<number, number>()
    let counter = -1
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const base = (slot * SECTORS_PER_SLOT + i) * SECTOR_SIZE
      if (base + SECTOR_SIZE > view.byteLength) break
      if (view.getUint32(base + FOOTER_SIGNATURE, true) !== SIGNATURE) continue
      // Sectors rotate through the slot, so a sector's position is not its id.
      sectors.set(view.getUint16(base + FOOTER_ID, true), base)
      counter = Math.max(counter, view.getUint32(base + FOOTER_COUNTER, true))
    }
    if (sectors.size > 0) slots.push({ counter, sectors })
  }

  if (slots.length === 0) return null
  return slots.sort((a, b) => b.counter - a.counter)[0].sectors
}

function block(view: DataView, sectors: Map<number, number>, ids: number[]): Uint8Array | null {
  const bases = ids.map((id) => sectors.get(id))
  if (bases.some((base) => base === undefined)) return null
  const out = new Uint8Array(bases.length * SECTOR_DATA)
  bases.forEach((base, index) => {
    out.set(new Uint8Array(view.buffer, view.byteOffset + base!, SECTOR_DATA), index * SECTOR_DATA)
  })
  return out
}

/**
 * One record, or null when the slot holds no Pokémon. Three independent
 * checks keep the residue of deleted Pokémon out: a language field that is
 * always the same on real records, a species number this build knows, and an
 * experience value inside the range any growth rate can reach.
 */
function readMon(
  bytes: Uint8Array,
  offset: number,
  from: 'party' | 'box',
  unresolved: Set<number>
): SaveMon | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
  if (view.getUint32(0x00, true) === 0) return null
  if (view.getUint16(LANGUAGE, true) !== LANGUAGE_OK) return null

  const party = from === 'party'
  const speciesId = view.getUint16(party ? PARTY_SPECIES : BOX_SPECIES, true)
  if (speciesId === 0) return null

  const exp = view.getUint32(party ? PARTY_EXP : BOX_EXP, true)
  if (exp > MAX_EXP) return null

  const slug = SPECIES[String(speciesId)]
  if (!slug) {
    unresolved.add(speciesId)
    return null
  }

  const stored = party ? view.getUint8(PARTY_LEVEL) : 0
  const level = stored > 0 && stored <= 100 ? stored : levelFromExp(slug, exp)

  return {
    speciesId,
    slug,
    nickname: readText(bytes, offset + NICKNAME, NICKNAME_LENGTH),
    level,
    from
  }
}

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

  const trainerBase = sectors.get(0)
  const trainer =
    trainerBase === undefined
      ? ''
      : readText(new Uint8Array(buffer, trainerBase, SECTOR_DATA), 0, 7)

  const unresolved = new Set<number>()
  const party: SaveMon[] = []
  const count = Math.min(new DataView(saveBlock.buffer).getUint32(PARTY_COUNT, true), 6)
  for (let i = 0; i < count; i++) {
    const mon = readMon(saveBlock, PARTY + i * PARTY_MON_SIZE, 'party', unresolved)
    if (mon) party.push(mon)
  }

  const boxed: SaveMon[] = []
  const storage = block(view, sectors, STORAGE)
  if (storage) {
    for (let offset = BOX_START; offset + BOX_MON_SIZE <= storage.length; offset += BOX_MON_SIZE) {
      const mon = readMon(storage, offset, 'box', unresolved)
      if (mon) boxed.push(mon)
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
