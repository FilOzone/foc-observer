/**
 * CID decoding utilities for FOC contract event data.
 *
 * Contracts emit piece CIDs as raw bytes (struct Cids.Cid { bytes data }).
 * PieceCIDv2 (FRC-0069) encodes the merkle tree height and padding in the
 * multihash digest, from which the original data size can be recovered.
 */

import { CID } from "multiformats/cid"

export interface DecodedPiece {
  cid: string
  rawSize: bigint
}

/** Decode a contract CID struct to a CID string and raw piece size. */
export function decodePiece(cidData: { data: `0x${string}` }): DecodedPiece {
  const cid = CID.decode(Uint8Array.from(Buffer.from(cidData.data.slice(2), "hex")))
  return {
    cid: cid.toString(),
    rawSize: decodePieceSize(cid.multihash.digest),
  }
}

/** Reconstruct and decode a right-aligned packed CID emitted by PiecesAddedV2. */
export function decodePackedPiece(packed: {
  header: `0x${string}`
  root: `0x${string}`
}): DecodedPiece {
  const header = packed.header.slice(2)
  let offset = 0
  while (offset < header.length && header.slice(offset, offset + 2) === "00") offset += 2

  return decodePiece({ data: `0x${header.slice(offset)}${packed.root.slice(2)}` })
}

/** Decode a PiecesAddedV2 batch and derive its consecutive piece IDs. */
export function decodePackedPieces(
  firstPieceId: bigint,
  packedCids: ReadonlyArray<{ header: `0x${string}`; root: `0x${string}` }>,
) {
  return packedCids.map((packed, i) => {
    const decoded = decodePackedPiece(packed)
    return { id: Number(firstPieceId + BigInt(i)), cid: decoded.cid, size: decoded.rawSize.toString() }
  })
}

/** Decode just the CID string from contract bytes. */
export function decodeCidString(cidData: { data: `0x${string}` }): string {
  const bytes = Uint8Array.from(Buffer.from(cidData.data.slice(2), "hex"))
  return CID.decode(bytes).toString()
}

/**
 * Decode raw piece size from a PieceCIDv2 multihash digest, laid out as
 * uvarint padding | 1 byte height | 32 byte root.
 * rawSize = 2^(height-2) * 127 - padding
 */
function decodePieceSize(digest: Uint8Array): bigint {
  let padding = 0n
  let offset = 0
  let byte: number
  do {
    byte = digest[offset]!
    padding |= BigInt(byte & 0x7f) << BigInt(7 * offset)
    offset++
  } while (byte & 0x80)

  const height = digest[offset]!
  if (height < 2) return 0n
  return (127n << BigInt(height - 2)) - padding
}
