import assert from "node:assert/strict"
import { test } from "node:test"
import { CID } from "multiformats/cid"
import { decodePiece } from "../src/cid-utils.ts"

const rawSize = (cid: string) =>
  decodePiece({ data: `0x${Buffer.from(CID.parse(cid).bytes).toString("hex")}` }).rawSize

test("decodes raw size from FRC-0069 test vectors", () => {
  assert.equal(rawSize("bafkzcibcp4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy"), 0n)
  assert.equal(rawSize("bafkzcibcpyba3vw24qoc65kvaeuvst5witskqqwpv6zrniwvsmq6hch6qsq6yly"), 1n)
  assert.equal(rawSize("bafkzcibcaaces3nobte6ezpp4wqan2age2s5yxcatzotcvobhgcmv5wi2xh5mbi"), 508n)
  assert.equal(rawSize("bafkzcibd64bqlxticxolgseegik2stpfgkkuwyf6kufex3doorkvmzpjuxwe4dz4"), 513n)
  assert.equal(rawSize("bafkzcibcaapao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq"), 34091302912n)
})

test("decodes raw size when padding exceeds 32 bits", () => {
  // Mainnet data sets 1906 and 1907: 2,348,615,978 bytes of padding in a height 28 tree
  assert.equal(
    rawSize("bafkzcibgvkjpjxyidswp4mjjqfbajv65azyq4d5w7pnlupztbhirdlpgu2efhbmtrlwds"),
    6174209750n,
  )
})

test("decodes raw size when padding exceeds Number.MAX_SAFE_INTEGER", () => {
  // Height 50 with 2^53 + 1 bytes of padding
  assert.equal(
    rawSize("bafkzcibjqgaibaeaqcabamqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    26740122787512319n,
  )
})
