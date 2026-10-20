---
title: "Flare-On 13 Part 5: A Wasm Pratt Certificate and a Monkey-Patched V8"
date: 2026-10-29T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "deep-dive", "math", "go"]
math: true
summary: "Two runtimes I did not control: a garble-obfuscated Go WebAssembly module gated by a canonical Pratt primality certificate that has to be rebuilt byte for byte, and a Tauri 2.0 binary that ships its own V8 and replaces Array.sort, Math.min and String.replaceAll with native hooks."
---

`globalThis.check` came back `false`, and none of the five and a half megabytes of WebAssembly behind it had a name left to read.

That is the shape of `crux`, the eighth challenge of this year's Flare-On. A browser extension exposes one function on the global object and hides everything else behind `garble`, which rewrites a Go program's abstract syntax tree before the compiler sees it: string literals get encrypted, runtime type reflection gets stripped, and every symbol name is replaced by a hash [2]. Loading the module produces a wall of anonymous functions that still do arithmetic in a recognisable way.

Only one of them decided anything, and it was not the cipher. The nine-challenge run these two stages close is in [the milestone post]({{< ref "finishing-flare-on-13" >}}), and the ASN.1 labyrinth that came immediately before them is in [the previous part]({{< ref "flare-on-13-part-4-asn1-labyrinth" >}}).

> **The Core Takeaway:** the block cipher in `crux` is a decoy whose key is sitting in the data segment, so the real gate is the verifier's insistence on a *canonical* Pratt certificate: sorted child primes, the least primitive root as witness, and one accepted serialization whose SHA-256 is the flag key. Get the mathematics right and the ordering wrong and the flag stays out of reach. `NeonOutRun` repeats the lesson one layer up: the JavaScript is packed, but nothing it says decides the flag, because the Rust backend replaced three of V8's own builtins before compiling it.

## One base64 argument in, one boolean out

Triage gives a linear path from the argument to the return value. Five stages do real work, and only the last four are hard:

| Stage | What runs | What it consumes | What it decides |
| :--- | :--- | :--- | :--- |
| Input decoding | Base64 decode into 16-byte blocks | The string passed to `check` | Nothing yet |
| Outer cipher | Modified AES-256-CBC, with a byte permutation in place of `ShiftRows` and a rewritten key schedule | The decoded blocks | Nothing the solver can see: key and IV are constants in the module |
| Deserializer | A recursive Go routine keyed on a one-byte tag | The plaintext | Which nodes are leaves and which are composite |
| Pratt verifier | The constraints below, then one comparison | The decoded tree | Whether it is a canonical certificate for the root integer, and whether that integer is the 256-bit target loaded from rodata |
| Key derivation | SHA-256 over the canonical re-serialization of the accepted tree | The certificate | The AES key for the embedded flag payload |

## A cipher worth skipping

The encryption functions, `LdUZ4Cb` and `f3184`, keep the AES S-box and an inverse column mix, then throw away the part that makes AES AES: `ShiftRows` is replaced by a fixed byte permutation, and the round key schedule is rewritten. The differences are few enough to read off a decompiler in an afternoon:

| Component | Standard AES-256 | The module's cipher |
| :--- | :--- | :--- |
| Substitution | AES S-box | The same AES S-box |
| Row diffusion | `ShiftRows` rotation per row | A fixed byte permutation applied per column |
| Column mixing | `MixColumns` on the way in, `InvMixColumns` on the way out | `InvMixColumns` only |
| Round keys | Expanded from the key schedule | A rewritten schedule, fed from rodata constants |

The trap is here. Once the diffusion layer stops being a rotation, SMT models of the round function lose the structure a solver would otherwise exploit, and you are left asking for a 256-bit key out of a system with no small algebraic shortcut. That is a night of solver time for nothing, because the key and IV never were secret:

```text
Key = cabeba7ad156801d1c82381c7cb8a3c406ae2c3cd168a96cd8373684cdbf8723
IV  = 5ff26040c4c20b9f2ffdefa7ecf65d91
```

Thirty-two bytes of key and sixteen of IV, padded into the data segment where the S-box also lives. Decrypting the input is then the easy part of the challenge, and it buys you nothing on its own.

## Recovering the target instead of the plaintext

Function `f3270` assembles the real target by reading two rodata offsets and permuting bytes against initialised words. Reimplement the permutation in a scripting language, or let an emulator run it and read the result out:

$$N = 95681613235744740119807961018865688051340183696570761153419351987106658443873$$

```text
0xd389dfbb379a02ccda7a4ab0b327e8e3655a3c96447c1b5578bee179c930e261
```

That integer is 256 bits and prime. The root check compares the certified value against it, so the only way to make the extension answer `true` is to prove primality for exactly this number, using exactly the shape of proof the Go code accepts.

## The certificate is the verifier's, not yours

Pratt's 1975 result is that every prime has a succinct certificate, checkable in polynomial time with \(O(\log^2 A)\) modular multiplications per node [3]. The certificate for \(A\) is three things:

- a factorization \(A - 1 = q_1 q_2 \cdots q_k\) into primes,
- a witness \(B\) with \(B^{A-1} \equiv 1 \pmod A\) and \(B^{(A-1)/q_i} \not\equiv 1 \pmod A\) for every prime \(q_i\) [3],
- a certificate for each \(q_i > 2\), recursively, bottoming out at \(2\).

That is the Lucas primality test restated as a data structure. Verification is cheap because nobody searches at verification time: you walk the tree and raise bases to exponents. Searching is what the *author* made expensive, and that is the asymmetry the challenge is built on.

The Go verifier is stricter than the mathematics:

| Constraint | Condition | If you get it wrong |
| :--- | :--- | :--- |
| Factorization completeness | \(A - 1 = \prod q_i\) exactly | Rejected |
| Child ordering | \(q_1 \le q_2 \le \dots \le q_k\) | Rejected |
| Lucas witness | \(B^{A-1} \equiv 1 \pmod A\) and \(B^{(A-1)/q_i} \not\equiv 1 \pmod A\) for all \(i\) | Rejected |
| Minimal witness | \(B\) is the least primitive root modulo \(A\): the code loops \(k \in [2, B-1]\) and asserts no smaller value satisfies the witness condition | Rejected |
| Root identity | The root node's \(A\) equals the 256-bit target | Rejected |

> **The gotcha that costs the flag:** there is exactly one accepted serialization. The ordering rule removes permutations of the same multiset, and the least-primitive-root rule removes the other valid witnesses, so the byte string whose SHA-256 becomes the flag key is unique. Two correct certificates for the same prime do not exist here, and "the math checks out" is therefore not the acceptance condition.

## Pollard rho, and why a smooth N - 1 is a gift

With the target known, the problem is factorizing \(N - 1\), and Pollard's rho is the right tool for small factors: expected cost \(O(p^{1/2})\) in the smallest prime divisor \(p\), with cycle detection and no meaningful memory overhead [4]. A Pratt gate wants \(N - 1\) to be a product of large primes; here it collapses almost immediately:

| Factor | Size | Subtree it drags in |
| :--- | :--- | :--- |
| \(2\) | 2 bits, five occurrences | 1 node each, and it recurs at every level |
| \(1777\) | 11 bits | 14 nodes |
| \(117013415621\) | 37 bits | 52 nodes |
| \(14379885447462257985539844615548173977763374139182362877999463\) | 204 bits | 285 nodes |

Recursion over \(q_i - 1\) for each of those, counting every occurrence of a repeated prime as its own node, which is what the serializer does with the five \(2\)s, gives 357 prime nodes. They are not 357 distinct primes: only 49 distinct primes appear in the whole recursion, and the bulk of the tree hangs off the 204-bit factor. What recurs at every node is the least-primitive-root search, and every predecessor factorization has to be complete, because an incomplete one is rejected outright rather than repaired.

## Putting 357 nodes back on the wire

The serializer is compact and unforgiving: one byte of tag per node, `0x00` for the leaf \(2\) and `0x01` for a composite node, 4-byte lengths, and big integers in little-endian byte order. Children appear in the non-decreasing order the verifier asserts, which means the wire format itself encodes the ordering constraint; you cannot serialize first and sort afterwards.

Feed the accepted serialization to SHA-256 [5], use the digest as the AES key, and the embedded payload opens:

```text
Pr4tt_Pr1M4lItY_C3rt5_4nd_Wa4aA4aAA4aAA4a4a5M@flare-on.com
```

The extension answers `true`, which is the only feedback you ever get from it.

## NeonOutRun: a racing game that ships its own JavaScript engine

The ninth challenge is a 21.2 MB Linux x86_64 ELF. It is a Tauri 2.0 application, which means a Rust backend plus a web frontend, with the frontend calling into Rust over Tauri's IPC command bridge [8]. Here the frontend is a Canvas 2D racing game, the commands are prefixed `plugin:neon`, and the native side is more interesting than the game:

| Layer | What lives there |
| :--- | :--- |
| Frontend | `index.html` and a Canvas 2D lap game. Rendering, input, and an IPC surface |
| IPC bridge | Tauri commands under `plugin:neon`, marshalled from JavaScript into the Rust handler [8] |
| Native backend | The command handler in the ELF, with `rusty_v8` 0.32.1 linked in and a worker thread holding an 8 MiB stack |
| Packed script | A 4,229-byte `backend.js` that does not exist until four decoding layers have run |
| Native hooks | Three V8 `FunctionCallback` replacements installed on the context before that script is compiled |
| Game logic | 28 laps of equations over 28 random split times. That is where the flag is |

That last row is why the frontend is a distraction. The Rust backend embeds a full V8 isolate pinned to one worker thread, compiles the recovered script into it, and replaces three of the engine's own builtins on the global object first. Inside `backend.js` those hooks are indistinguishable from the real ones, at the source level and at every layer of obfuscation you can undo inside the script.

## Four layers of packing in front of one JavaScript file

Getting to `backend.js` is a stack of decoders, and each one fails quietly in its own way:

| Layer | Encoding | Signal that the layer is right |
| :--- | :--- | :--- |
| 1 | XOR with the 2-byte key `d3 5a` | The first bytes are no longer a plausible container header |
| 2 | Custom LZSS with a sliding window | The bytes `28 b5 2f fd` appear |
| 3 | Zstandard frame, little-endian magic `0xFD2FB528` [7] | The output carries no zlib header, which makes it raw deflate and not a zlib stream [6] |
| 4 | Raw DEFLATE through `miniz_oxide` | 4,229 bytes that parse as JavaScript and end on a deflate end-of-block marker |

The distinction in row three is the one that costs time. RFC 1950's zlib wrapper would put a 2-byte header and a trailing Adler-32 around the compressed data, and their absence is exactly why the raw RFC 1951 path is the function to call [6]: no header to sniff, no checksum to validate, only a bit-level end-of-block. If your LZSS stage is off by one window offset you will not get an error anywhere. You will get a zstd decode failure three layers later, or worse, bytes that smell like JavaScript and are not.

## A decoy flag with one wrong character

The recovered script builds the victory string from a lookup table and a character code array, then normalises it:

```javascript
neon += messages[Math.floor((state.currentLap - 1) / 2)][map[state.currentLap - 1]];
neon += String.fromCharCode(64,102,49,97,114,101,45,111,110,46,99,111,109);
state.neon = neon.replaceAll(" ", "_");
```

Run that in Node and you get `decode_this_system_to_win_it@f1are-on.com`. The domain there is the contest's own, spelled with a `1` where the `l` belongs [1], so the string reads as an instruction rather than a flag: decode this system to win it. The system it points at is the layer the recovered JavaScript knows nothing about, and that one byte of the domain is exactly what the layer later repairs.

## Three builtins the backend replaced

The hooks are installed as native callbacks on the global context, which is why static work on `backend.js` produces a racing game and a decoy and nothing else:

| Hook | Address | Triggered by | Effect |
| :--- | :--- | :--- | :--- |
| `Array.prototype.sort` | `0x67deb2` | `splits.sort((a, b) => b - a)` during lap initialisation | Pushes the 28 split times through a 64-bit MMIX LCG, records their total as one accumulator, clears the lap vector and a second accumulator |
| `Math.min` | `0x67eb83` | `Math.min(state.bestLapSeconds, lapSecs)` at the end of each lap | Records the lap's integer time, derives an angle from two obfuscated 128-bit state machines, accumulates \(S_i \sin(\theta_i)\) into the second accumulator |
| `String.prototype.replaceAll` | `0x67e81e` | `neon.replaceAll(" ", "_")` on victory | Checks \(\lvert \text{acc}_1 - \text{acc}_2 \rvert < 10^{-6}\) and, if it holds, rewrites the flag |

The linear congruential generator inside the first hook is the standard MMIX pair, multiplier `0x5851f42d4c957f2d` and increment `0x14057b7ef767814f`. It never decides anything on its own. What it does is put the 28 random split times into the same accumulator that the second hook will subtract from, which is the whole trick: the split times cancel, and what is left is a constraint on the lap times you can actually choose.

## 28 sines collapse to 28 congruences

The `Math.min` hook converts each lap time into an angle and accumulates a Taylor series sine:

$$\theta_i = \frac{\pi}{180}\,(p_i + s_i \cdot b_i) \bmod 2\pi, \qquad \text{acc}_2 = \sum_{i=0}^{27} S_i \sin(\theta_i)$$

The `sort` hook stored \(\text{acc}_1 = \sum_i S_i\), so the victory check in the third hook is really

$$\left\lvert \sum_{i=0}^{27} S_i \left( \sin(\theta_i) - 1 \right) \right\rvert < 10^{-6}$$

Every term is non-positive, since \(\sin \theta \le 1\) and the split times are positive, and a sum of non-positive terms can only stay inside \(10^{-6}\) of zero if each term is zero to that tolerance. So the condition decouples into 28 independent statements, one per lap:

$$\sin(\theta_i) = 1 \implies \theta_i \equiv 90^\circ \pmod{360^\circ} \implies p_i + s_i \cdot b_i \equiv 90 \pmod{360}$$

That is a linear congruence in a single unknown, exactly the shape brute force is bad at and algebra is instant at. Solving for the lap byte:

$$b_i = \begin{cases} (90 - p_i) \bmod 360 & s_i = +1 \\ (p_i - 90) \bmod 360 & s_i = -1 \end{cases}$$

The offsets \(p_i\) and signs \(s_i\) come from two 128-bit state machines seeded by the lap index. Reimplementing those two by hand is transcription risk with no reward, so emulate the generator instead and let it hand you the 28 pairs:

```python
# Offsets and signs lifted from the emulated 128-bit generators, i = 0..27
lap_times = [
    82, 51, 95, 97, 103, 51, 110, 116, 95, 52, 98, 48, 117, 116,
    95, 116, 48, 95, 102, 51, 51, 108, 95, 100, 49, 122, 122, 121
]
flag_prefix = "".join(chr(b) for b in lap_times)
print(flag_prefix + "@flare-on.com")
```

```text
R3_ag3nt_4b0ut_t0_f33l_d1zzy@flare-on.com
```

Twenty-eight bytes, one per lap, and none of them arithmetic on the string the script would have built. The verification hook then overwrites the first 28 bytes of the victory string with those integers and adds `0x3b` to the byte at index 30, which turns the `'1'` of `@f1are-on.com` into an `'l'`. The decoy domain was never a red herring about the cryptography: it was the one byte the native hook had to fix, and the JavaScript had no way to fix it, because the `'1'` is a literal in the character code array and the lap times are what is actually being checked.

## What I am taking into the next contest

Both challenges are the same architectural bet made at different layers. `crux` hands you a cipher whose key you can read, then puts the real gate in a verifier that only accepts one serialization of a mathematical object. `NeonOutRun` hands you a web game and a flag string, then puts the real gate in three native callbacks installed underneath the engine that runs them. In both cases the interesting artifact is not the algorithm on the poster; it is the boundary where one runtime hands data to another, and the checks that live on that boundary.

So the question I want to ask first next time is not "what does this algorithm do" but "who replaced these functions, and what does the original caller think they still do". That question found both flags this year, and it is cheap to ask before the decompiler has opinions.

## References

[1] [The Flare-On Challenge](https://flare-on.com/): the contest home page and the domain NeonOutRun's decoy misspells by one character, which is what makes the decoy string readable as an instruction rather than a flag.

[2] [garble](https://github.com/burrowers/garble#mechanism): the AST-level obfuscator behind the WebAssembly module in `crux`. The mechanism and literal-obfuscation sections explain the asymmetry in play: the arithmetic survives the build, the symbol names do not.

[3] [Every Prime Has a Succinct Certificate](https://doi.org/10.1137/0204018): Pratt, SIAM Journal on Computing 4(3), 214-220, 1975. Defines the certificate the crux verifier implements, a factorization of \(A-1\), a primitive-root witness, and recursive certificates for the prime factors.

[4] [A Monte Carlo Method for Factorization](https://doi.org/10.1007/BF01933667): Pollard, BIT 15(3), 331-334, 1975. The rho algorithm and its \(O(p^{1/2})\) cost in the smallest prime factor, which is what makes a smooth \(N - 1\) cheap to factor.

[5] [FIPS 180-4, Secure Hash Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf): the SHA-256 definition used for the key derivation over the canonical certificate bytes.

[6] [RFC 1951, DEFLATE Compressed Data Format Specification](https://www.rfc-editor.org/rfc/rfc1951): the raw stream format the fourth unpacking layer produces, with no zlib header and no trailing Adler-32 wrapped around it.

[7] [RFC 8878, Zstandard Compression and the application/zstd Media Type](https://www.rfc-editor.org/rfc/rfc8878): the frame magic `0xFD2FB528`, stored little-endian, which is the `28 b5 2f fd` that identifies the third unpacking layer.

[8] [Tauri: Inter-Process Communication](https://v2.tauri.app/concept/inter-process-communication/): how Tauri 2.0 commands cross between the web frontend and the Rust backend, which is the boundary the `plugin:neon` handler sits on.
