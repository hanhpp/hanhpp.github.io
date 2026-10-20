---
title: "Flare-On 13 Part 2: A Patched SHA-256d, a Vanity Volume Serial, and a Hand-Rolled Huffman Decoder"
date: 2026-10-26T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "cryptography", "deep-dive"]
summary: "A 32-round SHA-256 whose Ch and Maj functions were rewritten, keyed off a 32-bit volume serial that spells ICE COLD in leetspeak, and a 264-byte RC4 keystream reused as a two-time pad before five JPEGs come back out of a custom canonical Huffman bitstream."
---

The serial that unlocks the fourth Flare-On 13 challenge is 32 bits wide, so I wrote the brute-forcer. Eight threads, AVX, the patched hash core inlined at the round level, and a counter running from zero to 4,294,967,296.

It finished. The serial was `0x01CEC01D`, and `0x01CEC01D` reads as `1CE C0LD` once you let `1` stand for `I` and `0` for `O`. A challenge built around a CPU miner that melts cores, and the author named the volume serial ICE COLD.

The same answer was sitting in a wordlist. Roughly 8,500 seven- and eight-nibble candidates that spell something in leetspeak, tested in one Python process in milliseconds, against 4.29 billion hashes written by hand in C.

This is part two of the write-ups I promised in [the 9-for-9 post]({{< ref "finishing-flare-on-13" >}}), covering challenges 04 and 05 of Flare-On 13 [8]. Part 1 went through [the polyglots and the traps]({{< ref "flare-on-13-part-1-polyglots-and-traps" >}}). These two are the instalment where the cryptography stops being packaging and becomes the puzzle.

> **The Core Takeaway:** both challenges hide the key behind machinery that looks cryptographic and is not. A 32-round SHA-256 with a rewritten `Ch` and `Maj` defeats every off-the-shelf hash cracker, but the input it hashes is a 32-bit value the author chose by hand. An RC4 keystream that restarts on every request leaks its own prefix, and that prefix is still 264 bytes against a multi-megabyte JPEG. Find where the custom code ends, and the key is usually sitting on the other side of that line.

## One miner, one hash, one input

`ToxicMiner.exe` is a 64-bit Windows console binary, and its symbols say it is a custom build of cpuminer-multi [1]: the scan loop decompiles to a function named `scanhash_sha256d`, and the string table still carries libcurl, OpenSSL and jansson. Three things were changed.

The stratum pool connection points at loopback, so the binary never talks to a real pool. The default RPC password is stored as base64, `bTFuM195MHVyXzB3bl9idXMxbjNzcw==`, which decodes to `m1n3_y0ur_0wn_bus1n3ss`. Nobody reads a password they already hold, and that string exists to waste the first ten minutes of anyone running `strings` before a disassembler. And whichever algorithm the flags request, the selector is overwritten with a hardcoded index before the loop starts.

Four stages matter, and only one of them holds a secret:

| Stage | Symbol | What it produces |
| :--- | :--- | :--- |
| Host fingerprint | `GetVolumeInformationA` [2] | the volume's 32-bit serial number, the only real secret in the challenge |
| Mining loop | `scanhash_sha256d` | `SHA256d'(serial + nonce)`, compared against the stratum username |
| Key derivation | `FUN_140134ca0` | `SHA256d'(serial + 0x0B501E7E)[0:16]`, a 16-byte RC4 key |
| Decryption | `FUN_140134d70` | RC4 over the 0x33-byte blob at `0x1401bd3b0`, which is the flag |

That second row is the trap I fell into first. The mining loop compares its hash against the stratum RPC username and stops when the two match, which reads like a target you are meant to mine toward. It is not a target: the comparison decides when the loop ends and nothing else. Key derivation reads the serial and only the serial, so mining a valid block would have produced no flag at all.

The message the key derivation hashes is eight bytes, which is why the block in the decompilation looks like `[serial, 0x0B501E7E, 0x80000000, ...]`. Two 32-bit words, then a single `0x80` padding byte, zeros, and a 64-bit big-endian bit length of 64 [3]. The standard SHA-256 padding for an 8-byte input, applied to a non-standard compression function.

## Four edits inside the compression function

The compression function at `FUN_140135240` keeps the standard 8-word initial state from `FIPS 180-4` and then stops behaving:

| Element | FIPS 180-4 [3] | This binary |
| :--- | :--- | :--- |
| Rounds | 64 | 32 |
| Round constants | `K[0]` through `K[63]` in order | `K[0]` and `K[1]` swapped |
| `Ch(e, f, g)` | `(e & f) ^ (~e & g)` | `((f + g) & e) ^ g` |
| `Maj(a, b, c)` | `(a & b) ^ (a & c) ^ (b & c)` | `((a & c) + (b & c)) ^ (a & b)` |
| Post-feedforward | state plus working variables, done | one more XOR over a lookup table and a state byte |

```python
# The two rewritten round functions, as modelled from FUN_140135240
def ch(e, f, g):
    return ((f + g) & e) ^ g                   # stock SHA-256: (e & f) ^ (~e & g)

def maj(a, b, c):
    return ((a & c) + (b & c)) ^ (a & b)       # stock SHA-256: majority of three bits

# ... 32 rounds instead of 64, with K[0] and K[1] swapped in the schedule ...

# Applied to word 0 after st += [a..h]:
st[0] ^= TBL[st[0] & 0xFF] ^ dword(st_bytes[st[1] % 28])
```

`Ch` and `Maj` are where a SHA-256 round puts its bitwise logic, and both were replaced with different arithmetic. That is the edit that costs you the most, because it means no published implementation of the round applies here: test vectors are meaningless, the SHA extension in the CPU cannot be used, and every piece of cracking software on the shelf is out. You reimplement the round from the decompilation, and then you pay for the search at the speed of your own loop.

The round count is the least interesting change. Thirty-two rounds halve the work per candidate, but they hand you no shortcut: you still evaluate a whole compression function for every serial you try, so the search stays linear in the size of the space. The round count matters because it is what makes the patch obvious in a decompiler, not because it opens a door.

## 4.29 billion hashes for an answer a wordlist already had

Recognising that the serial is the whole input, we wrote the obvious thing. Eight threads, AVX where it helped, the 32-round double hash and the RC4 step inlined, one loop over every 32-bit value, and a check for `@flare-on.com`, the suffix Flare-On flags carry [7], in the decrypted output.

It ran to completion. The matching serial was `0x01CEC01D`.

So the brute force worked, which is exactly the problem with it. The search space is 32 bits wide, and the author filled it with a word:

| Search space | Candidates | What it costs |
| :--- | :--- | :--- |
| Every 32-bit serial | 4,294,967,296 | the 8-thread AVX brute-forcer, plus the wall clock to go with it |
| Hex readings that spell a phrase | about 8,500 | one Python process, under 15 ms |

A hand-picked 32-bit constant in a CTF is almost never random. It is `0xDEADBEEF`, or `0xC001CAFE`, or `0xBAADC0DE`, or the author's own in-joke. Build the candidate set by taking a wordlist and mapping letters to the digits that look like them, then test each reading in the closed form:

```python
# Letters to the hex digits that stand in for them when you squint
MASK = {"O": "0", "I": "1", "L": "1", "E": "3", "A": "4", "S": "5",
        "T": "7", "B": "8", "G": "6", "Z": "2"}

def readings(word):
    """Every hex spelling of one word: COLD -> C0LD, COL1, C0L1, ..."""
    out = [""]
    for ch in word:
        subs = [ch] + ([MASK[ch]] if ch in MASK else [])
        out = [p + s for p in out for s in subs]
    return [c for c in out if len(c) in (7, 8)]   # the leading nibble of a dword is often dropped

for cand in candidates:
    serial = int(cand, 16)
    key = derive_key(serial)                      # SHA256d'(serial + 0x0B501E7E)[:16]
    if b"@flare-on.com" in rc4(key, BLOB):
        print(f"{hex(serial)}  {cand}")
```

The seven-or-eight filter is the one that matters. A 32-bit serial is eight hex digits, but a leading zero nibble disappears the moment someone writes the value down by hand, which is how `0x01CEC01D` became `1CEC01D` and then `ICE COLD`.

The same habit shows up in the constant the key derivation mixes in. `0x0B501E7E` reads as `OBSOLETE` if you let `0` stand for `O`, `5` for `S` and `1` for `L`. Vanity constants are cheaper to remember than random ones, and that is the whole weakness of this challenge.

The recorded run, with the 16-byte key the derivation produced for that serial:

```text
[+] Serial: 0x01CEC01D (1CE C0LD)
[+] Key:    e145da812b1897c6d48fe33b306b3aa7
[+] Flag:   cpu_m3lt3d_4nd_all_i_g0t_w4s_th1s_fl4g@flare-on.com
```

## catthief: the same key, six times

Challenge 05 ships two things: `catthief.exe`, a 64-bit Rust binary, and a packet capture. The capture holds one TCP conversation and six HTTP POSTs to the same path on a listener that is only reachable inside the lab network. The binary scans a hardcoded folder on the victim's desktop for JPEGs, then runs a small state machine against that listener: the first request is a `READY` beacon, every reply names the next file to steal, and each following request uploads one compressed and encrypted photo.

{{< figure src="catthief-protocol.svg" alt="Sequence diagram of six POST requests from catthief.exe to the C2 listener. Request 0 is a READY beacon with null padding, whose known plaintext leaks the first 264 bytes of keystream and decrypts the reply naming important.jpg; requests 1 through 5 upload important.jpg, anothercat.jpg, yetanothercat.jpg, catcatcat.jpg and myfavoritecat.jpg, and every message builds a fresh RC4 state from the same 25-byte key." caption="One TCP conversation, six POSTs, one RC4 key that is rebuilt from scratch for every message, and a request whose plaintext is already known" >}}

The key itself was not recovered from the traffic. It sits in `.rdata` as a 64-byte region that a single-byte `0x33` mask keeps out of `strings` output; XOR the mask back and the bytes spell `i11_b3_p1und3r1n_y3r_d474`, 25 characters, which is the author telling you what the implant does. Two minutes in a disassembler beats any amount of work on the ciphertext.

## 264 bytes of keystream, and a multi-megabyte shortfall

RC4's key schedule is deterministic: the same key produces the same keystream, byte for byte, from the first byte onward [6]. The implant throws its RC4 state away between messages and builds a fresh one from the same static key, in both directions. That single design choice is worth more than the rest of the challenge.

Request 0 is a beacon whose plaintext is guessable from the code: `READY` followed by null padding. Ciphertext XOR plaintext gives you the keystream, and because every other message re-keys from the same state, that keystream is also the first 264 bytes of the keystream protecting the C2's replies. The filenames the server sends back (`important.jpg` and the rest) decrypted without the key at all.

| Question | Does the keystream leak answer it? |
| :--- | :--- |
| Which cipher is in use | yes, and the first reply confirms it |
| The C2's short replies | yes, every filename in the conversation |
| The uploads themselves | no: the pad ends at byte 264 and the JPEGs do not |

This is a two-time pad, and a two-time pad only pays out while the messages are shorter than the leak. Here they are four orders of magnitude longer, so the temptation is to try to stretch 264 bytes across a photograph, which cannot work. The way through is to stop treating the ciphertext as the target and read the key out of the binary instead.

> A keystream leak is the best confirmation you can get and the worst key you can have. It proves which algorithm is running and it decrypts every short message in the conversation, and then it ends one byte to the right of the last byte you already knew.

## Behind the ciphertext, 43 bits of Huffman header

With the real key, the uploads decrypted to high-entropy bytes. No `FF D8 FF E0` anywhere, no JPEG structure to carve, and both `binwalk` and `foremost` reported nothing, which is the correct answer to the wrong question.

The plaintext was compressed before it was encrypted, and the compressor is a custom canonical Huffman coder. Bit order is MSB-first, and the whole frame is a table you can read in one sitting:

| Field | Bits | Value |
| :--- | :--- | :--- |
| `nsym` | 11 | 256, the alphabet size |
| `dlen` | 32 | byte length of the encoded bitstream that follows, big endian |
| Code lengths | 256 x 8 | one length per symbol, in symbol order; zero means the symbol never occurs |
| Payload | `dlen` x 8 | the encoded bits, packed with no alignment |

The header is 43 bits, so nothing here is byte-aligned and a hex dump will not show you the field boundaries. This is not DEFLATE on the wire: DEFLATE packs the same kind of table three bits at a time, with repeat codes carrying the extra bits [4], while this format spends a full byte per symbol. But the way a codebook is rebuilt from those lengths is the same canonical scheme, and that scheme is deterministic because a set of code lengths describes the code up to relabelling [5].

## Rebuilding a codebook from lengths alone

Canonical assignment needs nothing but the lengths. Sort symbols by length and then by symbol value, give the first code of each length the next free integer, and shift left every time the length grows:

```python
def canonical_codes(lengths):
    """(length, code) -> symbol, from code lengths alone. RFC 1951 section 3.2.2. [4]"""
    bl_count = {}
    for l in lengths:
        if l:
            bl_count[l] = bl_count.get(l, 0) + 1

    code = 0
    next_code = {}
    for l in range(1, max(lengths) + 1):
        code = (code + bl_count.get(l - 1, 0)) << 1
        next_code[l] = code

    table = {}
    for symbol, l in enumerate(lengths):
        if l:
            table[(l, next_code[l])] = symbol
            next_code[l] += 1
    return table
```

Two details are easy to get wrong and both cost an hour if you do. The first code of length `l` is derived from the count of codes one bit shorter, not from the codes you have already emitted, and the shift happens before the count is added. Get either backwards and the table fills with codes that decode to plausible, wrong symbols.

Reading the bitstream needs the same discipline, since MSB-first with a byte-granular index is not what most languages give you:

```python
class BitReader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def bits(self, n):
        val = 0
        for _ in range(n):
            byte, bit = divmod(self.pos, 8)
            val = (val << 1) | ((self.data[byte] >> (7 - bit)) & 1)
            self.pos += 1
        return val

def unpack(body):
    r = BitReader(body)
    nsym = r.bits(11)
    dlen = r.bits(32)
    lengths = [r.bits(8) for _ in range(nsym)]
    table = canonical_codes(lengths)

    out = bytearray()
    start, code, length = r.pos, 0, 0
    while r.pos - start < dlen * 8:
        code = (code << 1) | r.bits(1)
        length += 1
        if (length, code) in table:
            out.append(table[(length, code)])
            code = length = 0
    return bytes(out)
```

Run that over the six POST bodies and five files fall out, each one a clean JPEG: `important.jpg`, `anothercat.jpg`, `yetanothercat.jpg`, `catcatcat.jpg`, and `myfavoritecat.jpg`. One RC4 pass with the recovered key, one canonical codebook, five files.

## The flag was painted, not written

Five JPEGs, and `strings catcatcat.jpg | grep -i flare` returns nothing. No EXIF comment, no trailing text, no appended archive. The flag is in the pixels: a pirate cat in front of a treasure chest, and a parchment scroll lettered with

```text
th3r3_b3_tr34sure_1n_th4t_pc4p@flare-on.com
```

Which is the part of this challenge that no amount of bit-level work would have found. Stripping an RC4 layer and hand-writing a canonical Huffman decoder gets you the file; opening the file gets you the flag.

Two challenges, one shape. Challenge 04 built a custom hash to protect a key it had already published in hex, and challenge 05 built a custom compressor to protect photos it then leaked through a 264-byte pad. The custom machinery is real, and the attacks are not against the machinery: they are against the 32 bits the author picked and the RC4 state the author reset. Next in the series, [challenge 06]({{< ref "flare-on-13-part-3-coreclr-and-stateful-c2" >}}) goes the other way, into a CoreCLR AppHost whose JIT hooks and 64-bit stream state survive across messages rather than restarting with them.

## References

[1] [cpuminer-multi](https://github.com/tpruvot/cpuminer-multi): the upstream CPU miner whose `scanhash_sha256d` loop and library dependencies the challenge binary is a custom build of, which is how the triage names what to look at.

[2] [GetVolumeInformationA function](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationa): the Win32 call that returns the volume serial number the challenge keys on, and the reason the whole input to the KDF is only 32 bits wide.

[3] [FIPS 180-4, Secure Hash Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf): the 64-round compression function, the standard `Ch` and `Maj`, and the 8-byte-message padding this binary keeps while replacing everything else.

[4] [RFC 1951, DEFLATE Compressed Data Format Specification](https://www.rfc-editor.org/rfc/rfc1951): section 3.2.2 is the canonical code assignment the decoder reimplements here, and the length-field packing this custom format departs from.

[5] [A Method for the Construction of Minimum-Redundancy Codes](https://doi.org/10.1109/JRPROC.1952.273898): Huffman's original paper, which is why a length per symbol describes a code up to relabelling and makes a deterministic assignment possible.

[6] [RFC 6229, Test Vectors for the Stream Cipher RC4](https://www.rfc-editor.org/rfc/rfc6229): the published vectors showing that the keystream is a pure function of the key, which is what turns a re-keyed RC4 state into a reusable pad.

[7] [FLARE-On 12 Challenge Solutions](https://security.googlecloudcommunity.com/community-blog-42/flare-on-12-challenge-solutions-6061): the official solution set published after the previous contest closed, with one document per challenge, and the source of the `@flare-on.com` flag suffix the brute-forcer used as its needle.

[8] [The Flare-On Challenge](https://flare-on.com/): the contest these challenges come from, which publishes every prior year's challenges and solutions after the scoreboard freezes.
