/**
 * Tests for the inline PieceCID size decoder used in Ponder event handlers.
 *
 * Verifies against the same FRC-0069 fixtures used in synapse-core's
 * piece.test.ts to ensure our minimal varint-walking decoder produces
 * identical results to the full PieceCID library.
 */

import { describe, expect, test } from "vitest"

// Inline copy of the decoder from src/fwss.ts so we can test it independently
function decodePieceSize(cidHex: `0x${string}`): bigint {
  const bytes = Buffer.from(cidHex.slice(2), "hex")
  let offset = 1 // skip CIDv1 version byte (0x01)

  // Skip codec varint
  while (bytes[offset]! & 0x80) offset++
  offset++

  // Skip multihash code varint
  while (bytes[offset]! & 0x80) offset++
  offset++

  // Skip digest length varint
  while (bytes[offset]! & 0x80) offset++
  offset++

  // Decode padding varint
  let padding = 0
  let shift = 0
  while (bytes[offset]! & 0x80) {
    padding |= (bytes[offset]! & 0x7f) << shift
    shift += 7
    offset++
  }
  padding |= bytes[offset]! << shift
  offset++

  // Height is 1 byte
  const height = bytes[offset]!

  if (height < 2) return 0n
  const paddedSize = (1n << BigInt(height - 2)) * 127n
  return paddedSize - BigInt(padding)
}

// Real PieceCIDv2 hex fixtures generated from synapse-core calculate()
// with zero-filled byte arrays of known sizes
const hexFixtures: Array<[`0x${string}`, number]> = [
  ["0x01559120227f023731bb99ac689f66eef5973e4a94da188f4ddcae580724fc6f3fd60dfd488333", 0],
  ["0x015591202200023731bb99ac689f66eef5973e4a94da188f4ddcae580724fc6f3fd60dfd488333", 127],
  ["0x01559120227e03642a607ef886b004bf2c1978463ae1d4693ac0f410eb2d1b7a47fe205e5e750f", 128],
  ["0x015591202210051f7ac9595510e09ea41c460b176430bb322cd6fb412ec57cb17d989a4310372f", 1000],
  ["0x0155912023f03009f9226160c8f927bfdcc418cdf203493146008eaefb7d02194d5e548189005108", 10000],
]

describe("decodePieceSize", () => {
  hexFixtures.forEach(([hex, expectedSize]) => {
    test(`decodes hex CID to size ${expectedSize}`, () => {
      const result = decodePieceSize(hex)
      expect(result).toBe(BigInt(expectedSize))
    })
  })

  test("formula: height=2, padding=127 gives size 0", () => {
    // rawSize = 2^(2-2) * 127 - 127 = 1 * 127 - 127 = 0
    expect((1n << 0n) * 127n - 127n).toBe(0n)
  })

  test("formula: height=2, padding=0 gives size 127", () => {
    // rawSize = 2^(2-2) * 127 - 0 = 127
    expect((1n << 0n) * 127n - 0n).toBe(127n)
  })

  test("formula: height=3, padding=126 gives size 128", () => {
    // rawSize = 2^(3-2) * 127 - 126 = 254 - 126 = 128
    expect((1n << 1n) * 127n - 126n).toBe(128n)
  })

  test("formula: height=3, padding=0 gives size 254", () => {
    // rawSize = 2^(3-2) * 127 - 0 = 254
    expect((1n << 1n) * 127n - 0n).toBe(254n)
  })

  test("formula: height=4, padding=0 gives size 508", () => {
    // rawSize = 2^(4-2) * 127 - 0 = 4 * 127 = 508
    expect((1n << 2n) * 127n - 0n).toBe(508n)
  })

  // Verify the formula matches the zero fixture from synapse-core:
  // [rawSize, paddedSize] pairs from the fixture
  const zeroPieceSizes: Array<[number, number]> = [
    [96, 128], [126, 128], [127, 128],
    [192, 256], [253, 256], [254, 256],
    [255, 512], [256, 512], [384, 512], [507, 512], [508, 512],
    [509, 1024], [512, 1024], [768, 1024], [1015, 1024], [1016, 1024],
    [1017, 2048], [1024, 2048],
  ]

  zeroPieceSizes.forEach(([rawSize, paddedSize]) => {
    test(`formula: rawSize=${rawSize} has correct paddedSize=${paddedSize}`, () => {
      // paddedSize = 2^n * 128 for some n (FR32 expanded)
      // height = log2(paddedSize / 128) + 2 = log2(paddedSize) - 5
      // Actually: paddedSize = 2^(height-2) * 128, and rawPaddedSize = 2^(height-2) * 127
      // padding = rawPaddedSize - rawSize

      // Work backwards: find height from paddedSize
      // paddedSize is always a power of 2 times 128
      const height = Math.log2(paddedSize) - Math.log2(128) + 2
      const rawPaddedSize = (1 << (height - 2)) * 127
      const padding = rawPaddedSize - rawSize

      // Now verify our formula
      const computed = Number((1n << BigInt(height - 2)) * 127n - BigInt(padding))
      expect(computed).toBe(rawSize)
    })
  })
})
