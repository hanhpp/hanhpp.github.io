---
title: "Inside FlareCalc: 1,035 Encrypted ASN.1 Entries and a 32-Step Labyrinth"
date: 2026-10-28T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "deep-dive"]
summary: "Challenge 07 of Flare-On 13 keeps 1,035 encrypted ASN.1 entries in the PE overlay: seven layers of decoys, an x86 stall loop whose million iterations cancel algebraically, and a 32-step walk over 700 near-identical stubs that ends in an XTEA decryption."
math: true
---

The overlay of `FlareCalc.exe` holds 1,035 ASN.1 entries, and we spent five passes deciding that roughly 700 of them were compiler filler. The cluster looked generated: 128 to 188 bytes each, 95.6% of the table sharing one register-level template, no strings, nothing that left the stub. Filler.

It was the graph.

> **The Core Takeaway:** the 1,034 decryptable entries are nodes of a deterministic finite automaton, not fragments with individual purposes. Every node mutates three bytes of one shared 32-byte state buffer, stalls inside an arithmetic loop whose result is subtracted away one instruction later, then returns a 16-bit node id. For printable input exactly one byte per node lands on an id that exists in the table, so the cluster we filed as filler is a 32-step path to a 32-byte key and a flag.

Flare-On is the FLARE team's annual single-player reversing contest, run over a set of native and managed binaries with a flag in each [7]. The thirteenth edition opened on 25 September 2026 [8], and challenge 07 is FlareCalc, the densest decoy field I have worked through: seven layers of traps across 23 analysis passes, all of them dismantled below.

## The overlay is a table, not a runtime engine

`FlareCalc.exe` is a 64-bit Win32 calculator. Past the end of the last section, at file offset `0xEF471`, it carries a table whose shape is straight out of the ASN.1 encoding rules [1]: one outer constructed type, 1,035 repetitions of a two-field record inside it.

| Bytes | Type octet | Field | Count |
| :--- | :--- | :--- | :--- |
| Outer container | `0x30` | SEQUENCE, constructed | 1 |
| Per entry | `0x30` | SEQUENCE | 1,035 |
| Entry id | `0x02` | INTEGER | 1,035 |
| Payload | `0x04` | OCTET STRING | 1,035 |

```text
SEQUENCE (0x30), length
  SEQUENCE (0x30), length        entry 0
    INTEGER      (0x02) entry_id
    OCTET STRING (0x04) ciphertext
  SEQUENCE (0x30), length        entry 1
    ...
```

The three type octets are the BER universal tags for SEQUENCE, INTEGER and OCTET STRING [1], and the region they sit in is the one the PE format reserves for the attribute certificate table, the blob Authenticode signatures are stored in [2]. That placement is the first decoy substrate: a table that looks like signature material is a table nobody reads closely.

The second substrate is that the table is never executed by the calculator. We audited every file and memory API in the binary: no `ReadFile`, no `MapViewOfFile`, no `CreateFileMappingW`, no `VirtualAlloc`. The `LoadLibraryExW` call sites are MSVC delay-load thunks routed through `__delayLoadHelper2`, and the `CreateFileW` calls open `CONOUT$`. Nothing maps the overlay, nothing jumps into it. A thousand compiled stubs that no code path can reach is a static puzzle wearing a JIT engine's clothes.

### One entry, two linear congruential generators and a skip schedule

Decrypting an entry needs the stored id, the ciphertext and a master password, which is the three-field string `8675309-88224646-31428571`. The key schedule is a DJB-style rolling hash seeded at 9271 over the password bytes, then an MD5 digest [3] of the password concatenated with the little-endian entry id seeds a 32-bit LCG. A second LCG, seeded from the rolling hash, decides how many junk bytes to skip between real ones:

```python
def decrypt_entry(entry_id, ct, pwd):
    roll = 9271
    for b in pwd:
        roll = (roll * 129 + b) & 0xffffffff        # djb2-style, *129 per byte
    lcg = 0
    for b in hashlib.md5(pwd + struct.pack("<I", entry_id)).digest():
        lcg = (lcg * 31 + b) & 0xffffffff           # 16-byte digest folded to one word

    out, i = bytearray(), 0
    while i < len(ct):
        lcg = (lcg * 1103515245 + 12345) & 0xffffffff
        out.append(ct[i] ^ ((lcg >> 16) & 0xff))    # keystream byte
        roll = (roll * 1103515245 + 12345) & 0xffffffff
        i += 1 + (roll % 3) + 1                     # then 1 to 3 junk bytes
    return bytes(out)
```

The multiplier and increment are the constants the C library `rand()` example has carried for decades [4], which is where the ciphertext density comes from: only one byte in two to four carries information. Decrypting all 1,035 entries yields 1,034 x86_64 code stubs and exactly one data entry, id 9990, 40 bytes of ciphertext.

## Seven decoys, and the one that was actually the lock

| # | Decoy | Why it cost time |
| :--- | :--- | :--- |
| 1 | The runtime JIT engine | A thousand compiled stubs implied a loader. There is no loader: no file or memory mapping imports at all, delay-load thunks for `LoadLibraryExW`, and `CONOUT$` for `CreateFileW`. The table is inert data. |
| 2 | Entry 3821, 15,439 bytes | Fifteen times the next-largest entry, 7.986 bits per byte, an invalid opcode at offset 5, and a length that is not a multiple of 8, so the 8-byte block cipher in entry 4485 cannot have produced it. Noise, and the size is what sells it. |
| 3 | Entries 3822 to 3829 | Eight stubs gating on `[rcx+0x219] == 0x202` and calling callback pointers. The last decodes a hand-rolled `printf` banner reporting hostname, username, OS and uptime. A complete, working fake beacon. |
| 4 | SMT against entry 4485 | A 32-round XTEA Feistel taking a 32-byte key and a 40-byte buffer. Z3 and Bitwuzla both ran with `@flare-on.com` plaintext constraints and both failed, because a keyed Feistel is not invertible without the key. |
| 5 | The `=` button, control `0xd6` | Three taunt branches (`FLAG{NICE_TRY}`, `ACCESS DENIED`, `KEY_EXPIRED`) plus a rickroll. A sweep of 7.3 million seven-character equations confirmed there is no fifth branch. |
| 6 | The `WM_COPYDATA` honeypot | `uMsg == 0x4A` with `dwData == 0xC3F12A8B` copies up to 120 bytes to `0x1400e8f30`, a buffer with exactly one cross reference in the binary: the `lea` that sets the pointer up. Nothing ever reads it. |
| 7 | The uniform stub cluster | 700 entries with one shape, deprioritised in pass 5 as generic code-generator output. They were the labyrinth. |

Traps 1 and 7 are the same mistake from two directions. Trap 1 assumes that a table of code exists to be run. Trap 7 assumes that a thousand stubs sharing a template cannot be worth reading individually. Both are reasonable priors about ordinary software, and both are wrong about a challenge whose author generates its structure mechanically.

Trap 4 is the useful failure, because it is the one that looks like the right answer. The plaintext is known to end in `@flare-on.com`, the key is 32 bytes, the cipher has 32 rounds: that is a constraint problem with a shape solvers accept. It is also 256 unknown bits, and a Feistel network built from modular addition and XOR diffuses those bits through every round. Z3 and Bitwuzla do not solve ciphers, they solve theories about them.

## The node template, and a stall that cancels itself

Every one of the 1,034 stubs follows the same calling convention, which is the tell that a generator emitted them:

1. `cl` carries the candidate input character.
2. `rdx` and `r8` point at a mutable 32-byte state buffer.
3. `eax` returns the next 16-bit node id.

Inside sits an anti-analysis delay loop, the kind of construct that is normally neutralised by waiting for it:

```asm
    mov  dword ptr [rsp + 0x10], 0
loop_start:
    add  dword ptr [rsp + 0x10], eax
    inc  eax
    cmp  eax, 0xF4240        ; 1,000,000, the counter's exclusive bound
    jb   loop_start
```

The counter never reaches the literal. The compare runs after the increment, so the terms accumulated are 1 through 999,999, and the low 32 bits of that sum are a fixed constant:

$$
\sum_{i=1}^{999{,}999} i = \frac{999{,}999 \times 1{,}000{,}000}{2} = 499{,}999{,}500{,}000 \equiv \text{0x6A4AE6E0} \pmod{2^{32}}
$$

The instruction immediately after the loop is `sub eax, 0x6A4AE6E0`, or equivalently `add eax, 0x95B51920`. The stall is arithmetically a no-op: the loop body runs 999,999 times to produce a value the next instruction throws away.

That is the whole bypass, and it costs one multiplication to see. Patch the entry point of each node to skip the compare and the branch and preload `[rsp + 0x10]` with the accumulator value, and a node that would burn a million iterations runs in under 5 microseconds:

{{< figure src="node-template-cancelled-loop.svg" alt="Flow through one labyrinth node: read the candidate byte and the 32-byte state buffer, mutate three state offsets, run a stall loop whose accumulator ends at 0x6A4AE6E0, subtract the same constant so the stall cancels to zero, mix the state with the byte, and return the next node id" caption="One node's execution path. The boxed pair on the loop's right is the stall and the instruction that deletes it." >}}

## One edge out of 256

Node ids are 16-bit, so most outputs of a stub are not nodes. The validity test is the table itself: a transition counts only when the returned id is present among the entry ids in the overlay, which is how a million possible return values collapse into a graph.

Walking it with printable ASCII, the branching factor is exactly 1 at every step. The trace starts at node 52090:

| Step | From | Input byte | To |
| :--- | :--- | :--- | :--- |
| 1 | 52090 | `F` | 54272 |
| 2 | 54272 | `L` | 44269 |
| 3 | 44269 | `A` | 60903 |
| 4 | 60903 | `R` | 3394 |
| 5 | 3394 | `E` | 5295 |
| 6 | 5295 | `O` | 6140 |
| 7 | 6140 | `N` | 53282 |
| ... | ... | ... | ... |
| 32 | 34912 | `!` | 4485 |

Thirty-two steps spell `FLAREON_ASN1_Labyrinth_Key_2026!`, and the id reached on the last one is 4485: trap 4's cipher, which is not a trap at all. It is the lock.

The walk emulates one stub per candidate byte, in a loop that reads like a depth-first search with a branch factor of one:

```text
state = bytearray(32)
node  = 52090
repeat 32 times:
    for ch in printable:
        nxt, candidate_state = emulate_stub(node, ch, state)
        if nxt in entry_ids:      # the only real edge out of this node
            node, state = nxt, candidate_state
            break
```

Each node's mutation logic writes into the shared buffer along the way, so the buffer is not incidental state: it is the key material. After 32 transitions it holds 32 bytes, `670daa0ff05e7d85472eeb55a716a7b88d63019c27ee22ea447fd4fde87c013d`, which is exactly the key length and shape that entry 4485 expects.

## Target node 4485: a keyed Feistel with a 40-byte input

Entry 4485 is a 384-byte function implementing a modified 32-round XTEA Feistel [6] over a 40-byte buffer, keyed by the 32 bytes handed to it in `r8`. Entry 3833 is its encryptor sibling, which is the sort of detail that confirms the design is deliberate rather than a hash that happens to look like a cipher.

Once the key stops being an unknown, the right tool is an emulator rather than a solver. Unicorn gives you a mapped address space, register access and an instruction count, which is all a 384-byte leaf function needs [5]:

```python
mu = Uc(UC_ARCH_X86, UC_MODE_64)
mu.mem_map(0x100000, 0x800000)     # node code, one stub at a time
mu.mem_map(0x20000,  0x10000)      # 32-byte state buffer, 40-byte payload

# per node: write cl = byte, rdx = state buffer, run to the patched ret,
# read eax back and check it against the entry id set
key = bytes.fromhex("670daa0ff05e7d85472eeb55a716a7b88d63019c27ee22ea447fd4fde87c013d")
flag = emulate_entry(mu, entry_id=4485, key=key, data=entry_9990_ciphertext)
```

Emulating entry 4485 with the derived key against the 40 bytes from entry 9990 ends the challenge:

```text
[*] Executing 32-step labyrinth traversal with key: FLAREON_ASN1_Labyrinth_Key_2026!
  Step  1: 52090 --('F')--> 54272
  Step  2: 54272 --('L')--> 44269
  Step  3: 44269 --('A')--> 60903
  Step  4: 60903 --('R')-->  3394
  ...
  Step 32: 34912 --('!')-->  4485
[+] Reached Target Node 4485.
[+] Final Derived Key: 670daa0ff05e7d85472eeb55a716a7b88d63019c27ee22ea447fd4fde87c013d
[+] FLAG: t3mplat3s_asn_and_j1t_0h_my@flare-on.com
```

## What the bypass bought

Three things I am keeping from this one.

Generated code is a graph before it is filler. When a tool emits a thousand instances of one template, the template is a node type and the interesting object is the adjacency between nodes. Uniformity is the signal, not the noise. Counting distinct shapes in the table and finding one shape repeated 700 times was the answer, and we read it as a reason to look elsewhere.

Anti-analysis loops are algebra. A stall that spends a million iterations computing a constant and then subtracts the constant is a comment, not a defence. The counter's exclusive bound and the closed form of the accumulated sum give you the value in one line, and emulation gives you the node in microseconds. The patch is faster to reason about than to wait out, which is true of every delay loop I have met.

Branching factor decides the tool. SAT is the wrong instrument for 256 unknown key bits diffused through 32 Feistel rounds, and depth-first search is the wrong instrument for anything with a wide fan-out. Here the state machine has a fan-out of one, and the search finishes in less time than it takes to encode one round into a bit-vector formula. Measure the fan-out before choosing.

Next in the series: the WebAssembly and native V8 stage, where the difficulty moves from generated code to code a JIT wrote for itself. If you are following the run from the start, [part 3 covered the CoreCLR AppHost hooks in ThreatInvaders]({{< ref "flare-on-13-part-3-coreclr-and-stateful-c2" >}}), and the series index is the [post I wrote when the scoreboard froze]({{< ref "finishing-flare-on-13" >}}).

## References

[1] [ITU-T Recommendation X.690 (02/2021)](https://www.itu.int/rec/T-REC-X.690-202102-I/en): the ASN.1 encoding rules that define Basic, Canonical and Distinguished Encoding, and the universal tag numbers `0x30` SEQUENCE, `0x02` INTEGER and `0x04` OCTET STRING that give the overlay its shape.

[2] [Microsoft PE Format specification](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format): the data directory and the attribute certificate table, which is the region of the file the encrypted entry table sits in and the reason its offset is past the last section.

[3] [RFC 1321, The MD5 Message-Digest Algorithm](https://www.rfc-editor.org/rfc/rfc1321): the digest whose 16 bytes, taken over the password and the little-endian entry id, seed the keystream generator for every entry.

[4] [POSIX `rand()`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rand.html): the specification whose example generator defines the multiplier `1103515245` and increment `12345` reused by both entry-level LCGs, including the generator that schedules the junk bytes.

[5] [Unicorn Engine documentation](https://www.unicorn-engine.org/docs/tutorial.html): the CPU emulator API used to map a scratch address space and run one decrypted stub at a time under a patched delay branch.

[6] [TEA extensions (Wheeler and Needham, 1997)](https://www.cix.co.uk/~klockstone/xtea.pdf): the note that extends TEA into XTEA, which is the 32-round Feistel structure and key schedule that entry 4485 implements in its modified form.

[7] [The Flare-On Challenge](https://flare-on.com/): the official contest site, the source for the challenge set, its single-player reversing format and the binaries used in this post.

[8] [Announcing the 13th FLARE-On Challenge](https://security.googlecloudcommunity.com/community-blog-42/announcing-the-13th-flare-on-challenge-8279): the announcement that dates the edition: it opened on 25 September 2026 and was scheduled to run for four weeks from that day.
