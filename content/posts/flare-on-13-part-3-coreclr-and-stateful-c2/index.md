---
title: "ThreatInvaders: A Patched CoreCLR JIT and a C2 Stream That Never Re-keys"
date: 2026-10-27T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "compilers", "deep-dive"]
math: true
summary: "The implant in Flare-On 13's sixth challenge is not in the C# at all: it is a patched ICorJitCompiler::compileMethod that hooks five methods by 64-bit polynomial hash, driving a 64-bit LCG stream whose state never resets between HTTP requests."
---

The managed assembly was clean, and that was the trap.

ThreatInvaders arrives as two files: a 116 MB Windows executable and a 404 KB packet capture of a single HTTP/1.1 conversation between a client workstation and a server that identifies itself as `MockHighscore/1.0 Python/3.12.3`. Open the managed DLL from the executable in ILSpy and you get idiomatic C#. A space-invaders loop, sprite rendering, wave progression, a highscores path, and a telemetry reporter that serialises player statistics to `/telemetry`.

No cryptography. No packing. No reflection stubs. Nothing that fails a grep.

I spent an evening in that C# before accepting what the decompiler was telling me: the managed layer is not where the implant is.

> **The 30-Second Diagnosis:** a self-contained .NET 10 publish puts a native host in front of the managed code, and this challenge patches that host instead of the C#. The patched `ICorJitCompiler::compileMethod` [2] compares a 64-bit polynomial hash of the fully-qualified method name against five constants, hooks the matches, and hands all five the same 64-bit LCG stream. That stream is never re-keyed, so each request's keystream depends on the exact byte count of every request before it. The byte counts are the cipher.

## What the 116 MB is actually made of

A self-contained single-file publish does not stop being .NET when it becomes one file. The managed DLLs are embedded in the bundle and loaded from it, and the native pieces of the runtime live alongside the executable and are loaded by it [1]. That is why the challenge binary can be 116 MB and still have a perfectly readable, dishonest managed layer.

The layering is what makes the trick work:

| Layer | What it looks like | What it does here |
| :--- | :--- | :--- |
| Managed IL | A complete, benign arcade game plus telemetry | Supplies five innocent method names for the implant to hijack |
| Metadata | Ordinary method and type tables | Gives the hook its dispatch key: the name |
| Native host | The app host that starts the runtime | Holds the patched JIT, which is where the implant actually lives |

Anything that reads the IL honestly reports the game, because the game is real. The implant reuses the game's own methods rather than adding new ones, and that is the whole design: a hooked method that still does its advertised job is far harder to notice than a method that does not.

## Two dead ends worth writing down

| Trap | What I did | Why it failed |
| :--- | :--- | :--- |
| The managed decompiler illusion | Extracted the bundle with `ilspycmd` and `monodis`, then audited `ScoreManager`, `TelemetryReporter` and `GameManager` for hidden math or reflection | The C# is genuinely just a game. `monodis` also silently dropped method bodies carrying non-standard attributes, so the tool was quieter than the binary |
| The key-guessing rabbit hole | Wrote a brute forcer covering AES-128, AES-256, ChaCha20, Salsa20 and RC4, with keys derived from MD5 and SHA-256 of the captured GUIDs, the API keys, the score struct, the wave count and timestamps | Over 110 permutation models, zero hits. Not because the search was small, but because the premise was wrong |

The second trap is the instructive one. In the capture, the highscore responses carry player names such as `BANANA` and `BENIGN` with comment fields full of ciphertext, and the telemetry beacons carry API keys and 128-bit GUIDs. That pattern looks like standard malware with a keyed blob on the wire. It is not block crypto, and the key is not a value you can lift out of any single packet.

> A single packet here is not a ciphertext. It is the Nth slice of one continuous stream, and its position depends on every byte the process has encrypted or decrypted since it started.

## The hook is one virtual call

The JIT compiles a managed method the first time it runs. The runtime asks for that compiled code through `ICorJitCompiler::compileMethod`, which is the routine that takes a method and returns native code for it [2]. One function, every method, before any of them execute.

The argument the runtime passes to that call is a `MethodDesc`, the runtime's own representation of a managed method: a unique handle for a module, metadata token and instantiation triplet, and the owner of the method's entry point [3]. A normal non-generic `MethodDesc` is 8 bytes.

That is the entire opportunity. Patching the JIT means the implant sees every method the process is about to run, with its name, and gets to decide what happens next. Nothing in the IL changes, so nothing in the decompiler output changes: the hook is native code inserted between two runtime components, and the managed assembly has no idea it exists.

## Five method names, five 64-bit hashes

The dispatcher hashes the fully-qualified class and method name with a 64-bit rolling polynomial and compares the result against a small table. Five names match:

| Managed method | 64-bit hash | Native hook | What the implant uses it for |
| :--- | :--- | :--- | :--- |
| `ReplaceHighscores` | string match on the name | `0xc66f0` | Decrypts the C2 command carried in a highscore comment |
| `LaunchUpdate` | `0x6f8ff9636eae6c5a` | `0xc6a70` | Runs the decrypted command, captures stdout, encrypts the result |
| `HasFeedback` | `0x5f6e18db1be45dc7` | `0xc6b70` | Tells the telemetry path that exfiltration data is queued |
| `EncodeFeedbackBuffer` | `0x6397c52d5293345e` | `0xc6ba0` | Performs the key exchange against the client's session id |
| `GetSessionID` | `0xa3a845aec791499a` | `0xc6df0` | Captures the client's 16-byte .NET `Guid` |

Two design notes are visible in that table. First, the hook sites are not crypto functions. They are the game's own score, update, feedback and telemetry paths, which is why both the IL and the strings look benign. Second, the exfiltration rides the telemetry channel the game already uses, and the commands ride the highscore channel the server already answers. The implant added no new network behaviour, only new content inside messages the application was already sending.

{{< figure src="jit-hook-dispatch.svg" alt="A native app host calling into a patched CoreCLR JIT, a dispatcher hashing managed method names, five hooked methods, and one shared 64-bit LCG state" caption="Five entry points, one stream state. The dispatcher is a hash table; the trap is that everything below it shares a single mutable cipher state." >}}

## The key exchange is one XOR

In the initial beacon, `EncodeFeedbackBuffer` intercepts the telemetry packet and the client hands over a session GUID it generated itself. The exact 16 bytes on the wire matter, because .NET does not write a `Guid` to a byte array in the order you read it as a string. The first four-byte group and the next two two-byte groups are written in reversed order relative to the string form, while the last two-byte group and the closing six bytes are not [4].

The implant reverses the GUID's 16 bytes and XORs them against a fixed seed in `.data`. Nothing is negotiated, nothing is derived: the client is made to carry a copy of the key material inside a value it thinks is an identifier.

Worked through with the capture's request 98 values:

```text
client Guid      478b635d-c335-4c12-b1de-16e0565be335
wire bytes       54ae032ea875b0f8cc578a511fe71631
XOR (recovered)  614d587848636e4980454964586c756c
seed word 1      0x496e634878584d61
seed word 2      0x6c756c5864494580
```

The feed that carries it announces itself twice. Its length field is not a length: the far end sends `0x2000 | 16`, and later `0x4000 | 530` and `0x4000 | 46`, so the high bits are a message class and the low bits are the payload size. A 16-byte payload in a channel that otherwise moves kilobytes is worth staring at, and it is the one field in the whole conversation that is exactly one GUID.

## Two words become a stream state

The two 64-bit words are folded into a single 64-bit state with a Boost-style hash combine, then run through SplitMix64. Both halves of that sentence are ordinary, well documented constructions, which is what makes them recognisable in a decompiler window. The combine is the `hash_combine` pattern from Boost.ContainerHash: the incoming word, the golden-ratio constant, and a shifted and an unshifted copy of the seed, folded into one value [5]. SplitMix64 is the mixing function from Steele, Lea and Flood's splittable generator work, with the same three constants the reference implementation carries: `0x9E3779B97F4A7C15`, `0xBF58476D1CE4E5B9` and `0x94D049BB133111EB` [6].

$$
h = w_1 \oplus \left(w_2 + 0x9E3779B97F4A7C15 + (w_1 \ll 6) + (w_1 \gg 2)\right)
$$

Read the two words in the wrong order, or as the wrong endianness, and the state is wrong from the very first byte, and every later byte inherits the error.

That single 64-bit value is the entire session. There is no second key, no per-request nonce, and no derivation on the server side.

## The stream: 64 bits, one byte at a time

The keystream is a linear congruential generator truncated to one byte per step:

$$
\text{state}_{n+1} = \left(\text{state}_n \times 0x5851F42D4C957F2D + 0x14057B7EF767814F\right) \bmod 2^{64}
$$

$$
k_n = \text{state}_{n+1} \gg 56
$$

Those two constants are not arbitrary, and that is a gift for anyone reversing this. `6364136223846793005` and `1442695040888963407`, which are their decimal forms, are the 64-bit multiplier and increment defined in the PCG reference implementation [7]. The generator here is a truncated LCG with the default constants of a well-known family, which means a reverser who recognises the pair does not have to derive the recurrence from scratch.

The tap takes the top byte of the new state, which is the byte worth taking: in an LCG the low bits repeat far sooner than the high ones, so the high byte carries the part of the output with the long period. A top-byte tap also means one LCG step per output byte, which is what makes the byte counts in the transcript add up the way they do.

> The state is created once and never reset. Every byte that any of the five hooks encrypts or decrypts advances it, so the key for request N is a function of the exact plaintext lengths of requests 0 through N-1. Skip a byte, or guess a length wrong, and the rest of the conversation is noise.

That property is what killed the brute-force approach in the first trap table. Not the cipher. The cipher is a two-constant LCG. The problem was that a packet on its own has no key, because the key lives in the transcript.

## The ledger is the cipher

Both commands arrive as `cmd:` strings, so the command channel is uncomplicated once you can decrypt it: a verb, a shell, and arguments.

| Step | Direction | What crosses | Bytes | State after |
| :--- | :--- | :--- | :--- | :--- |
| Request 98 | client to server | Session GUID, key exchange | 16 | unchanged by the stream |
| Response | server to client | `BANANA` comment, command 1 | 18 | 18 |
| Request 141 | client to server | `dir` output encrypted | 530 | 548 |
| Response | server to client | `BENIGN` comment, command 2 | 28 | 576 |
| Request 172 | client to server | `type flag.txt` output encrypted | 46 | 622 |

The two commands were:

```text
cmd:cmd.exe;/c dir
cmd:cmd.exe;/c type flag.txt
```

Which means the second exfiltration is the contents of `flag.txt`, 46 bytes, and the flag came back as:

```text
wh4t_4_l0ng_str4ng3_tr1p_1ts_b33n@flare-on.com
```

Eighteen plus 530 plus 28 is 576 bytes of prior state before that last buffer is touched. The flag is why the ledger has to be exact: it is not the first field of the final request, it is the last, and it sits behind every byte the two earlier stages moved. The `@flare-on.com` suffix is the contest's flag format [8].

## The replay, in the order the process ran it

The model is short enough to write out completely. Only the four buffers come from the capture; everything else is what the implant does.

```python
MASK = 0xFFFFFFFFFFFFFFFF

class LcgStream:
    """Advance, then tap the top byte. One state, held for the whole process."""
    MUL = 0x5851F42D4C957F2D
    ADD = 0x14057B7EF767814F

    def __init__(self, state):
        self.state = state

    def next_byte(self):
        self.state = (self.state * self.MUL + self.ADD) & MASK
        return self.state >> 56

    def crypt(self, data):
        return bytes(b ^ self.next_byte() for b in data)

    def advance(self, n):
        for _ in range(n):
            self.next_byte()

def splitmix64(x):
    x = (x + 0x9E3779B97F4A7C15) & MASK
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & MASK
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & MASK
    return x ^ (x >> 31)

def key_state(w1, w2):
    h = w1 ^ (w2 + 0x9E3779B97F4A7C15 + ((w1 << 6) & MASK) + (w1 >> 2))
    return splitmix64(h & MASK)

stream = LcgStream(key_state(word1, word2))   # one state, for the whole process

guids = stream.crypt(key_exchange)      # 16 bytes: the session GUID
cmd_1 = stream.crypt(first_comment)     # 18 bytes: command 1
stream.advance(530)                     # the listing that left the host
cmd_2 = stream.crypt(second_comment)    # 28 bytes: command 2
flag = stream.crypt(flag_feedback)      # 46 bytes: the last request
```

The shape of that script is the actual lesson. There is no per-request entry point, because the implant has no per-request key. The two `advance` and `crypt` calls are not interchangeable: swapping them, or letting one buffer's length be off by a byte, changes every byte after it.

## What the JIT boundary teaches

Two things carry past this challenge.

The first is that decompilers report on the layer you asked about, and modern self-contained runtimes have more than one layer. A single-file .NET app, a bundled Go binary, an Electron bundle and a Flutter app all ship a native host that the language-level code does not describe. When the managed code is clean and the behaviour is not, the next place to look is the host that starts it, and the JIT is the highest-value function in that host, because it is the one place every method must pass through.

The second is that stateful ciphers make the transcript the key. A stream that never re-keys cannot be attacked packet by packet, and no amount of key guessing substitutes for replaying the conversation in order with the right byte counts. The ledger in this post is the cipher, and reconstructing it is the work.

Two earlier write-ups in this series set up the contrast: [the polyglot challenges]({{< ref "flare-on-13-part-1-polyglots-and-traps" >}}) were about files that lie about their own format, and [the cryptanalysis and compression part]({{< ref "flare-on-13-part-2-cryptanalysis-and-compression" >}}) was about recovering plaintext from structure alone. [The Flare-On 13 wrap-up]({{< ref "finishing-flare-on-13" >}}) has the run as a whole. This one is the case where the structure is fine and the code is fine, and the only thing wrong is which layer you are reading.

## References

[1] [Create a single file for application deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview): what a self-contained single-file publish actually contains, including that the managed DLLs are bundled while the native runtime binaries are loaded alongside the executable.

[2] [corjit.h: ICorJitCompiler::compileMethod](https://github.com/dotnet/runtime/blob/main/src/coreclr/inc/corjit.h): the runtime interface for asking the JIT for native code for a method, which is the call this challenge patches.

[3] [Method Descriptor (Book of the Runtime)](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/method-descriptor.md): the CoreCLR design document for `MethodDesc`, the 8-byte handle for a managed method that the compile call is handed.

[4] [Guid.ToByteArray Method](https://learn.microsoft.com/en-us/dotnet/api/system.guid.tobytearray): the documented byte order, where the first four-byte group and the next two two-byte groups are reversed relative to the GUID string.

[5] [Boost.ContainerHash: hash_combine](https://www.boost.org/doc/libs/release/libs/container_hash/doc/html/hash.html): the seed and value combine pattern, with the golden-ratio constant the key derivation reuses.

[6] [Fast splittable pseudorandom number generators](https://doi.org/10.1145/2660193.2660195): Steele, Lea and Flood, OOPSLA 2014, the source of the SplitMix64 mixing function and its constants.

[7] [pcg-c: pcg_variants.h](https://github.com/imneme/pcg-c/blob/master/include/pcg_variants.h): the PCG reference implementation, which defines the 64-bit multiplier `6364136223846793005` and increment `1442695040888963407` used by the implant's stream.

[8] [FLARE-On 12 Challenge Solutions](https://security.googlecloudcommunity.com/community-blog-42/flare-on-12-challenge-solutions-6061): the official solutions write-up for the previous instalment, and the source of the `@flare-on.com` flag format this challenge's flag follows.
