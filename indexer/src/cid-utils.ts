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
  const bytes = Uint8Array.from(Buffer.from(cidData.data.slice(2), "hex"))
  return {
    cid: CID.decode(bytes).toString(),
    rawSize: decodePieceSize(bytes),
  }
}

/** Decode just the CID string from contract bytes. */
export function decodeCidString(cidData: { data: `0x${string}` }): string {
  const bytes = Uint8Array.from(Buffer.from(cidData.data.slice(2), "hex"))
  return CID.decode(bytes).toString()
}

/**
 * Decode raw piece size from PieceCIDv2 bytes.
 * rawSize = 2^(height-2) * 127 - padding
 */
function decodePieceSize(bytes: Uint8Array): bigint {
  let offset = 1 // skip CIDv1 version byte (0x01)

  // Skip codec varint (fil-commitment-unsealed = 0xf101)
  while (bytes[offset]! & 0x80) offset++
  offset++

  // Skip multihash code varint (sha2-256-trunc254-padded-binary-tree = 0x1011)
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
  return (1n << BigInt(height - 2)) * 127n - BigInt(padding)
}
