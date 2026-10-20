---
title: "Flare-On 13 Part 1: Polyglots, Hidden Streams, and In-Memory Traps"
date: 2026-10-25T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "mach-o", "deep-dive"]
summary: "The first three Flare-On 13 challenges keep the flag in the container rather than the code: a right-click timer over an alternating XOR stream, an NTFS alternate data stream behind a seven-day uptime gate, and a 12 MB polyglot whose five layers only come apart once you strip the CD sector geometry."
math: true
---

Challenge 03 was a 12 MB file called `flareon13.doc`, which is not a Word document, executes as five different formats depending on where you start reading, and answered my first script with two of the six passwords it wanted. That script hashed every printable ASCII run in the file. It was the wrong instrument, and the reason it was wrong is the reason all three challenges in this part are interesting: the secret was stored in the shape of the file, not in the code.

This is the technical half of my Flare-On 13 run, the one where I cleared all nine stages instead of the three I managed last year, and the challenge archives stay on the contest site once scoring closes [1]. If you want the scoreboard and the victory screen first, they are in [the milestone post]({{< ref "finishing-flare-on-13" >}}). Everything below is the disassembly, the crypto, and the mistakes.

> **The Core Takeaway:** in all three of these challenges the load-bearing decision is what the file *is*, not what the code does. A container can be a COM stub, a PDF, an optical disc image, a ZIP and a universal Mach-O at the same time, and the flag falls out once you read each layer's geometry: 2352-byte sectors, a named NTFS data stream, and a 19-byte string patched into the preamble of `strlen`.

## Challenge 01: a right-click timer over an alternating XOR stream

The whole challenge is one HTML file, `flarecaptcha.html`, which draws a mock reCAPTCHA checkbox. No network, no build step, no browser required once you notice the flag is already sitting in the page as an encrypted byte array wrapped in a JavaScript `Proxy`. The proxy exists to make you read the decode path instead of printing the array.

Reading that path gives three facts. The click handler validates `event.button`, the hold timer is two seconds, and the key is derived at verification time:

```javascript
const targetButton = Math.pow(5, 0) + Math.pow(1, 1); // 1 + 1 = 2 (right click)
let secs = Math.round(elapsed / 1000);                // must be 2
let key = (secs * (resetWidget.toString().length + 1115)) & 0xFFFF;
```

So a left click (`button === 0`) fails instantly, and only a two-second right-click (`button === 2`) reaches the callback. The cipher behind the proxy is an alternating two-byte XOR stream:

$$c_i = p_i \oplus \mathrm{len}(\texttt{document.characterSet}) \oplus K_{i \bmod 2}$$

On any UTF-8 page `document.characterSet` is the five-character string `UTF-8`, so the constant is 5, and the 16-bit key splits into a high and a low byte.

### The trap: 65,536 iterations that find the flag and miss the point

My first move was the obvious one. A 16-bit key means 65,536 candidates, which is under a tenth of a second in Python, and the flag format gives you a free oracle: keep the key whose plaintext ends in `@flare-on.com`. It prints the right answer.

It also walks straight past the only designed detail in the challenge. `resetWidget.toString().length` is exactly 222 characters, so the key arithmetic is:

$$222 + 1115 = 1337, \qquad \mathrm{key} = 2 \times 1337 = 2674 = \texttt{0x0A72}$$

The author left a 1337 pun in a 16-bit key and the brute force never sees it. Worse, the tooling habit is sticky: a keyspace that small teaches you that guessing beats reading, and the next challenge in the set has a keyspace you cannot enumerate.

### The crib that solves it in one step

Flare-On flags are email addresses ending in `@flare-on.com`, and the organizers publish official solutions only after scoring closes, so the format is public knowledge by the time a write-up like this one exists [2]. In this ciphertext that suffix happens to align exactly against the two congruence classes. With a 31-byte ciphertext, the suffix occupies indices 18 through 30, so the first two suffix characters give both key bytes outright:

| Suffix byte | Index | Parity | Plaintext | Solves for |
| :--- | :--- | :--- | :--- | :--- |
| `@` | 18 | even | `0x40` | high byte, \(K_{hi} = c_{18} \oplus 5 \oplus \texttt{0x40}\) |
| `f` | 19 | odd | `0x66` | low byte, \(K_{lo} = c_{19} \oplus 5 \oplus \texttt{0x66}\) |

Two XORs, no loop, and the recovered key is `0x0A72`, which matches the arithmetic above. The rest of the plaintext is one comprehension:

```python
enc = bytes([
    0x79, 0x00, 0x74, 0x01, 0x76, 0x19, 0x74, 0x1b, 0x79, 0x16,
    0x78, 0x1b, 0x7d, 0x02, 0x77, 0x1a, 0x75, 0x19, 0x4f, 0x14,
    0x73, 0x13, 0x6f, 0x17, 0x32, 0x1d, 0x73, 0x5d, 0x70, 0x0d, 0x72
])

k_hi = enc[18] ^ 5 ^ ord('@')
k_lo = enc[19] ^ 5 ^ ord('f')
flag = bytes(b ^ 5 ^ (k_hi if i % 2 == 0 else k_lo) for i, b in enumerate(enc))
print(flag.decode('ascii'))
```

```text
[+] Recovered key: 0x0A72 (k_hi=0x0A, k_lo=0x72)
[+] Flag: triskaidekaphobia@flare-on.com
```

The flag is the joke. `triskaidekaphobia` is the fear of thirteen, and the key that decodes it is 1337 doubled. A solver that never de-anonymised those constants still prints the string, and still misses everything the challenge was saying.

## Challenge 02: a WIM, a named stream, and a seven-day uptime gate

`GhostStream.7z` unpacks to `GhostStream.wim`, an uncompressed Windows Imaging Format archive holding two files: `GhostStream.exe`, a 64-bit console binary, and `PolyjuicePotion.txt`, a 316-byte Harry Potter passage. The text file is the interesting one, and not because of the text.

### The flag material is in the stream, not the file

`wimlib-imagex dir GhostStream.wim --detailed` prints file metadata that includes an NTFS alternate data stream attached to the text file, named `LordVoldemort`. Named data streams are the NTFS metadata that makes a file a container of files [4], and they survive into a WIM, which is why a Unix extraction of the archive gives you `PolyjuicePotion.txt` and nothing else. Extracting the stream's raw bytes by offset does, and those bytes are:

```text
AlbusDumbledore\r\n
```

Ten characters of setup. Everything after this is a pipeline that turns those ten characters into the RC4 key that decrypts the flag.

### Trap 1: the network listener that does nothing

`GhostStream.exe` spawns a thread that binds `127.0.0.1:31337` and parses packets with an `OVERRIDE:` prefix. It looks like the intended path, it has a hand-written parser, and it is a red herring: nothing you send to that socket reaches the flag derivation. I spent a while inside its parsing loop before accepting that the loop's output was never read.

### Trap 2: an age gate derived from the executable's own name

`FUN_140001860` refuses to open the alternate data stream unless a global is `1`, and in normal execution that global is `0`. Then `FUN_140001680` reads process uptime with `GetProcessTimes`, and the window procedure compares it against a threshold built from the executable's own filename:

$$\mathrm{uptime_{minutes}} > \mathrm{len}(\mathrm{exe\_name}) \times \texttt{0x29f} + \texttt{0xf}$$

For the 15-character string `GhostStream.exe` that is \(15 \times 671 + 15 = 10{,}080\) minutes, or exactly seven days. Run it in a fresh VM without patching time or attaching a debugger and the program is not broken; it quietly serves decoy tokens into `SESSION_TOKEN_CACHE`. The threshold moves if you rename the binary, which is a nice touch: the gate is measured in filename bytes rather than in days.

> **The gotcha:** this is a sandbox stall, not a protection. Your instinct is to fake the clock or hook `GetProcessTimes`. The cheaper move is to stop running it, because the whole pipeline is a data flow you can read statically: read the stream, apply the transform, follow the key into the pipe.

### Trap 3: `strlen` patched in memory

The parent drops `%TEMP%\Partner_CTF.exe` out of resource `BIN/101` and opens the named pipe `\\.\pipe\FlareChallenge`. The child patches itself at runtime: it writes a 0x17-byte trampoline over the preamble of `ucrtbase!strlen`, so that every later call runs this instead of the real function.

```c
s[k] = (s[k] + k + 1) ^ 0x13;
return 0x13;
```

On the `.data` buffer sitting at `Bxs]bv\`^u)TpcnolVjN`, that call decodes the bytes in place into `Piertotum Locomotor` and returns 19. A patched `strlen` is a nasty thing to meet in a debugger: the function returns a constant, the string it reports on is not the string you typed, and both facts are only visible if you disassemble the function's first bytes instead of trusting the symbol name.

It also broke my emulator. I emulated the child under Unicorn and let the hook stay installed, so the second call, on the 18-byte `Wingardium Leviosa`, returned 19 as well. That skewed the PRGA step count and produced corrupted characters in a way that looked like a wrong key rather than a wrong step size. On a live Windows host the child restores the original preamble before that second call, and the cipher behaves.

### The pipeline, in one table

The parent's window procedure does the state transformation under `WM_CREATE`, using the previous message it saw (`WM_NCCALCSIZE`, `0x83`) to build the mask: \(1 \oplus \texttt{0x83} = \texttt{0x82}\). The full flow is short enough to lay out as stages.

| # | Stage | Input | Operation | Output |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Stream read | `PolyjuicePotion.txt:LordVoldemort` | Read the named data stream after the age gate | `AlbusDumbledore` |
| 2 | Parent transform | `AlbusDumbledore` | XOR `0x82`, then XOR a 15-byte static key | `HarryPotter` |
| 3 | Named pipe | `\\.\pipe\FlareChallenge` | Parent writes the decoded key for the child | Child's RC4 key material |
| 4 | Import patch | Child's `.data` buffer | Patched `strlen` rewrites and returns a constant | `Piertotum Locomotor`, step size 19 |
| 5 | Modified RC4 | 38-byte ciphertext | PRGA with `i += 18`, plus a static XOR pad and a per-byte add | Flag |

The child's PRGA is RC4 with the index increment replaced and one extra term in the output. With \(n = 18\), the step size it took from `Wingardium Leviosa`, and \(\mathrm{key}_2\) the patched string:

$$i \leftarrow (i + n) \bmod 256, \qquad p_k = c_k \oplus K \oplus \mathrm{key}_2[k \bmod 19] \oplus ((n + c_k) \bmod 256)$$

```python
def rc4_ksa(key: bytes):
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    return S

key1, key2, n = b"HarryPotter", b"Piertotum Locomotor", 18
S, i, j = rc4_ksa(key1), 0, 0
plaintext = bytearray()
for k, ct in enumerate(ciphertext):
    i = (i + n) & 0xFF
    j = (j + S[i]) & 0xFF
    S[i], S[j] = S[j], S[i]
    K = S[(S[i] + S[j]) & 0xFF]
    plaintext.append(K ^ key2[k % len(key2)] ^ ((n + ct) & 0xFF) ^ ct)
```

```text
[+] Flag: y0u_kn0w_n07h1n6_j0n_5n0w@flare-on.com
```

Seven days of uptime gate, a listening socket, a hijacked CRT import, and the answer is that a ten-byte string in an NTFS stream is XORed twice and fed to a broken RC4. Static tracing beats every environment check in the file.

## Challenge 03: five formats stacked in one 12 MB file

`flareon13.doc` is the largest of the three and the one that punishes triage habits. `file` sees garbage, `strings` sees a lot of nothing useful, and the header at offset `0x0000` is executable 16-bit x86 with no `MZ` stub in front of it.

What is actually in the file:

| Layer | Format | Where it lives | The trick | Piece recovered |
| :--- | :--- | :--- | :--- | :--- |
| 0 | DOS COM | Offset `0x0000` | Self-modifying stub that rewrites `EICAR` into `FLARE` | `FLARE-STANDARD-ANTIVIRUS-TEST-FILE!` |
| 1a | PDF text | PDF body, invisible text operator | EBCDIC (cp037) bytes behind `3 Tr` [7] | `mainframe_ebcdic_ghost` |
| 1b | PDF image | Off-page JBIG2 XObject, 808 by 48 | Bi-level fax-coded bitmap | `jbig2_fax_geometry` |
| 2 | Raw CD Mode 1 | 2352-byte sectors | Strip the 16-byte header and 288-byte EDC/ECC [5] | `udf_tagged_descriptor` |
| 3 | ZIP | Appended after the disc image | ZipCrypto under password `infected`, method 2 (Reduce) [6] | `reduce_not_deflate` |
| 4 | Mach-O arm64 | `click_me` slice 0 inside the disc | Unrolled hash under an ASCII fire animation, `ptrace` deny | `Ød1n_373rn4l_fl4r3` |

There are decoys for anyone grepping instead of parsing. The binary carries a Microsoft VHD footer with the `conectix` identifier `FLAREONPOLYGLOT!`, and strings named `totally_fake_flag` and `true_honest_flag`. Neither is a flag and neither is meant to be. The real validator is `click_me` slice 1, a universal Mach-O slice built from Crystal, which checks all six pieces by digest and only then derives the key.

### Layer 0: the stub that edits itself

The COM entrypoint is dressed as the standard antivirus test file, the EICAR string [3]. It does not print that string. It rewrites its own memory buffer first, replacing `EICAR` with `FLARE`, then prints the result through the DOS string call at `int 21h`. The recovered piece is `FLARE-STANDARD-ANTIVIRUS-TEST-FILE!`, which is exactly the kind of string a scanner signature is written against. A static strings dump gives you the EICAR half; only the self-modification gives you the other.

### Layer 1: EBCDIC in invisible text, and a bitmap that is not text

The PDF body opens with an empty user password under the standard security handler's 40-bit RC4 [7]. Inside, two pieces hide in two different ways, and only one of them is text. The first sits behind rendering mode 3, which draws nothing, as raw EBCDIC bytes:

```python
bytes.fromhex("9481899586998194856dd582838489836d878896a2a3").decode("cp037")
# -> "mainframe_ebcdic_ghost"
```

The second is a JBIG2 image XObject placed off the visible page, 808 by 48 pixels. There is no string to extract. Decoding it with `jbig2dec` renders a bitmap that contains the piece `jbig2_fax_geometry`. That is the moment my regex sweep became useless, and the challenge starts to feel like a format survey rather than a reversing puzzle.

### Layer 2: the disc image is raw, not cooked

The optical layer is not a 2048-byte-sector ISO. It is a raw CD image in Mode 1, where each sector is 2352 bytes: 12 bytes of sync, a 4-byte header, 2048 bytes of user data, and 288 bytes of error detection and correction [5]. Nothing mounts it, because the filesystem's idea of a sector does not match the file's stride, and the fix is one function:

```python
def strip_raw_sectors(raw_data: bytes) -> bytes:
    cooked = bytearray()
    for offset in range(0, len(raw_data), 2352):
        sector = raw_data[offset:offset + 2352]
        if len(sector) == 2352:
            cooked.extend(sector[16:16 + 2048])
    return bytes(cooked)
```

After stripping, the UDF metadata parses normally and the tagged descriptor chain hands over `udf_tagged_descriptor`. The geometry was the whole obstacle.

### Layer 3: a 1980s compression method behind ZipCrypto

The trailing ZIP carries `flag.txt` under ZipCrypto with the password `infected`, which is the easy half. The compression method is not. It is method 2, Reduce, a legacy PKZIP algorithm that the APPNOTE still documents in its list of compression factors [6] and that essentially no modern extractor implements. Cracking the password gets you a file you still cannot read, and the piece is `reduce_not_deflate`: the name is the hint that the method matters as much as the password.

### Layer 4: the animation is the payload

`click_me` slice 0 is arm64 with `ptrace(PT_DENY_ATTACH)` set, so attaching a debugger kills it, and what it draws is an ASCII fire animation in the terminal. The animation is the point: under the render loop it computes an unrolled hash over an internal buffer and XORs the result with a static key, and the piece is generated rather than stored, as UTF-8: `Ød1n_373rn4l_fl4r3`, "Odin eternal flame" with digits swapped in.

This is the piece that makes the sweep hopeless for a second reason. There is no contiguous printable run to find, because the bytes never exist in the file in that order.

### Layer 5: six digests, one XOR fold, one RC4 decrypt

Slice 1 is the validator, and it is deliberately boring. Each piece is checked against a hardcoded MD5 digest, so the digests themselves are the progress meter: if you have the right string, the table confirms it.

| Index | Target MD5 | Recovered piece |
| :---: | :--- | :--- |
| 0 | `3fb0a9ea9bb0aa9dd9ec5a805bf777e4` | `FLARE-STANDARD-ANTIVIRUS-TEST-FILE!` |
| 1 | `7f759600d8f0f35fcb81f1816f1c7d24` | `mainframe_ebcdic_ghost` |
| 2 | `a906dd4d22da6f85d2ddda09f9298717` | `jbig2_fax_geometry` |
| 3 | `cf0cbd1b55755a81ff87f2be8fba8ebf` | `udf_tagged_descriptor` |
| 4 | `d400db493c31ebf21fa0b2a4adeae070` | `reduce_not_deflate` |
| 5 | `955d5bb6a8e8b28f73ddf3a46618778f` | `Ød1n_373rn4l_fl4r3` |

Once all six verify, the key is the XOR fold of their SHA-256 digests [8], 32 bytes wide:

$$\mathrm{Key} = \bigoplus_{i=0}^{5} \mathrm{SHA256}(\mathrm{piece}_i)$$

That key RC4-decrypts a 40-byte ciphertext at offset `0x100035ef0`:

```python
key = bytearray(32)
for p in pieces:
    h = hashlib.sha256(p).digest()
    for j in range(32):
        key[j] ^= h[j]

ct = bytes.fromhex(
    "3f3b9247ad23b0df38a2ea6f86641ab4462153eb90da5dfd978a3c8e411b40974fa2e1a90c5c4e97"
)
print(ARC4.new(bytes(key)).decrypt(ct).decode("ascii"))
```

```text
[+] Flag: Ju$7_4_l177l3_7r34$ur3_HUN7@flare-on.com
```

### The sweep, and what it actually cost me

Here is the audit of my first script, because the shape of the failure is the lesson. It scanned every printable ASCII substring from 3 to 80 characters long across the whole 12 MB file and hashed each one on the fly.

| Piece | Where it really was | Why the sweep missed it |
| :--- | :--- | :--- |
| 0 | COM stub, rewritten in memory | Found: the EICAR-form string is printable at rest |
| 1 | PDF body, EBCDIC | Found: the cp037 bytes happen to be printable ASCII range |
| 2 | Off-page JBIG2 stream | Pixels, not a string |
| 3 | Raw Mode 1 sector data | Printable bytes only exist after the sector framing is stripped |
| 4 | ZipCrypto-protected entry | Encrypted, and method 2 on top |
| 5 | Generated under the fire animation | Never present as a contiguous printable run |

Two hits out of six, from one script, with a plausible-looking reason for each miss that I did not notice until I had parsed the layers properly. A polyglot is a stack of encodings, and a single sweep assumes they are all the same encoding.

## What the three have in common

Each of these challenges hides the flag somewhere the extension, the symbol table, or the obvious command will not look. A `.html` file that is mostly a cipher. A `.wim` whose payload is a named stream. A `.doc` that is a CD image containing a Mach-O. In every case the winning move was structural: read the container's geometry, then read the code.

The traps rhyme too. A 16-bit keyspace invites brute force and hides the 1337 in the key formula. A seven-day uptime check and a debugger flag invite clock faking and hooking, when static tracing of the data flow needs neither. A patched `strlen` invites trusting the symbol name, and my emulator paid for that trust with a corrupted PRGA. The environment checks and the import patches are all attempts to make you run the thing instead of reading it.

Part 2 has the opposite flavour. Same challenges, same rule that the file's structure is the puzzle, but the encryption stops being XOR and single-byte constants and starts being state machines and hashes.

## References

[1] [The Flare-On Challenge](https://flare-on.com/): the official contest site, the 2026 edition's home, and the archive of prior-year challenges and their official solutions.

[2] [FLARE-On 12 Challenge Solutions](https://security.googlecloudcommunity.com/community-blog-42/flare-on-12-challenge-solutions-6061): the official solutions for the previous edition, published as PDFs attached to that page. They establish that the organizers release their answers only after the contest closes, and they print flags in the `@flare-on.com` form the ciphertext here aligns against.

[3] [EICAR Anti-Malware Testfile](https://www.eicar.org/download-anti-malware-testfile/): the standard harmless test string that Layer 0's COM stub mimics and then rewrites in memory.

[4] [wimlib-imagex(1)](https://wimlib.net/man1/wimlib-imagex.html): the manual for the tool used to read the WIM, including its `dir` subcommand and its handling of NTFS-specific metadata such as named data streams.

[5] [ECMA-130](https://ecma-international.org/publications-and-standards/standards/ecma-130/): the CD-ROM data interchange standard that defines the 2352-byte Mode 1 sector layout (12-byte sync, 4-byte header, 2048 user bytes, 288 EDC/ECC) the disc layer is built on.

[6] [PKWARE APPNOTE 6.3.9](https://pkware.cachefly.net/webdocs/APPNOTE/APPNOTE-6.3.9.TXT): the ZIP specification, which lists compression method 2 (Reduce) among the legacy algorithms and specifies traditional PKWARE encryption, the scheme ZipCrypto names.

[7] [PDF Reference, sixth edition (PDF 1.7)](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.7old.pdf): the specification for text rendering mode 3 (invisible) and for the standard security handler's 40-bit RC4, the two features the PDF layer hides behind.

[8] [FIPS 180-4, Secure Hash Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf): the definition of SHA-256, which fixes the 32-byte digest width the XOR-folded key relies on.
