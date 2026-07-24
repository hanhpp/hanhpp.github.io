---
title: "How I Started Learning Reverse Engineering (and What I Wish I Knew First)"
date: 2026-07-24T11:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf"]
summary: "I spent my first month with Ghidra staring at assembly I didn't understand, convinced I was too stupid for this. Here's the honest version of how I got from 'what is a register' to solving CTF reversing challenges — and the mistakes that cost me weeks."
---

The first reverse engineering challenge I ever opened was a simple crackme —
a tiny binary that prints "enter the password" and checks your input. The
writeup said it was beginner-friendly. I couldn't even find where the
password check was. I stared at Ghidra's decompiler output for two hours,
saw something like `iVar1 = strcmp(local_18, "s3cr3t")` and didn't know
what `strcmp` was, what `local_18` was, or why the decompiler showed
variable names that looked like a robot named them. I closed the laptop and
didn't come back for a week.

This is the post I wish someone had written for me. Not a roadmap with 47
resources and a 12-month timeline — just an honest account of what the
learning actually looks like, what wastes time, and what actually moves you
forward.

## The beginning is worse than you think

Everyone told me to "just start doing CTFs." So I opened picoCTF, picked a
reversing challenge, and immediately hit a wall. I didn't know how to read
assembly. I didn't know what a stack frame was. I didn't know the
difference between static and dynamic analysis. I knew how to write Go and
Python. That was it.

The problem isn't that reverse engineering is impossibly hard. The problem
is that there's a prerequisite layer that nobody tells you about — the
"how does a computer actually work" layer — and if you skip it, every
tutorial feels like it's assuming knowledge you don't have.

Here's the prerequisite layer I didn't know I needed:

- **What a binary actually is.** Not "a compiled program" — literally
  what's in the file. ELF headers, sections, the difference between `.text`
  and `.data` and `.rodata`. You don't need to memorize the ELF spec, but
  you need to know that `readelf -h` tells you the entry point and
  `strings` gives you the readable text.

- **What assembly looks like and what it means.** Not "write assembly" —
  just read it. `mov rdi, rax` means "copy the value in rax into rdi."
  `call` means "jump to this function." `cmp` + `jne` means "if these
  aren't equal, jump somewhere." That's 80% of what you need to start.

- **How function calls work.** Arguments go in registers (rdi, rsi, rdx,
  rcx, r8, r9 on x86-64 Linux). The return value lands in rax. The stack
  stores local variables and return addresses. If you know this, you can
  read most Ghidra decompiler output.

## What actually helped (and what didn't)

### Things that helped

**Compile your own C code and look at the assembly.** This was the single
biggest breakthrough. Write a ten-line C function — something with an if
statement, a loop, a function call — compile it with `gcc -O0 -S` and read
the assembly. Then compile with `-O2` and see how it changes. Compiler
Explorer (godbolt.org) makes this instant. After doing this fifty times,
assembly stops being random characters and starts being readable.

**Do crackmes, not CTFs.** CTF reversing challenges are often designed to
be tricky — custom VMs, obfuscation, multi-stage protections. Crackmes on
crackmes.one are simpler: "find the password." That's exactly what you
want when you're starting. The goal isn't to be challenged — it's to
build pattern recognition. Do thirty easy ones before you touch a CTF.

**Use Ghidra's decompiler, not just the disassembly.** Ghidra's decompiler
turns assembly into something that looks like C. It's not perfect, but it
gives you function names (sometimes), variable types (sometimes), and a
readable control flow. Start with the decompiler view. When it's
confusing, switch to the disassembly to see what's really happening.

**Read other people's writeups after you solve (or give up on) a
challenge.** Every writeup teaches you a technique you didn't think of.
After reading fifty writeups, you start recognizing patterns: "oh, this is
a XOR loop," "this is checking a hash," "this is a custom Base64
encoding." Pattern recognition is 80% of reverse engineering.

### Things that didn't help

**Trying to learn x86 assembly from a reference manual.** The Intel manual
is 5,000 pages. You don't need it. You need to know maybe 30 instructions
to start: `mov`, `push`, `pop`, `call`, `ret`, `cmp`, `je`, `jne`,
`jmp`, `xor`, `add`, `sub`, `lea`, `test`, `sete`, `setne`. Learn those
and you can read most functions.

**Spending a week setting up the "perfect" lab.** FLARE VM, Remnux,
Docker containers, custom GDB configs — I spent more time configuring
tools than using them. A working Ghidra install and GDB with pwndbg is
enough to start. Optimize your setup later.

**Trying to understand every instruction.** When you see a function with
200 instructions, you don't need to read all 200. Find the `strcmp` call.
Find the conditional jump after it. Find the "success" and "failure"
paths. Most of the function is boilerplate you can skip.

**Reading about RE without doing RE.** Blog posts, YouTube videos, and
courses are useful, but only after you've tried and failed at a challenge.
The failure creates the context that makes the learning stick. Read a
writeup *after* you've spent an hour staring at the binary, not before.

## The mental model that changed everything

The breakthrough for me was realizing that reverse engineering is
**debugging without source code.** When you debug your own code, you set
breakpoints, step through execution, watch variables, and form hypotheses
about what's wrong. Reverse engineering is the same process — you just
don't have variable names and the function names are stripped.

The workflow that works:

1. **Run the binary with junk input.** See what happens. What does it print?
   What files does it create? What network calls does it make? Use `strace`
   and `ltrace` to see syscalls and library calls.

2. **Look at strings.** `strings binary | grep -i flag` or
   `strings binary | grep -i password`. Half the time, the answer is right
   there. Don't skip the obvious.

3. **Find the check.** In the decompiler, search for `strcmp`, `memcmp`,
   `strncmp`, or a loop that compares bytes. That's where the validation
   happens. Follow the string references backwards from there.

4. **Set a breakpoint at the check.** In GDB, break at the comparison.
   Run the program with a test input. When the breakpoint hits, look at
   the registers — one register holds your input, the other holds the
   expected value. There's the password.

5. **Form a hypothesis, test it.** "I think this function checks the first
   character." Set a breakpoint, change the first character, see if the
   behavior changes. Scientific method, but for binaries.

## The timeline (honest version)

Here's roughly how long each stage took me, working a few hours a week:

- **Month 1:** Couldn't read assembly. Didn't know what Ghidra was doing.
  Solved zero challenges. Read a lot of confusing writeups.

- **Month 2:** Could read simple assembly. Could find `strcmp` in a
  decompiler. Solved my first three crackmes (all "find the string"
  challenges). Felt like I was making progress.

- **Month 3:** Could follow control flow. Understood stack frames. Started
  recognizing common patterns (XOR loops, Base64, simple hashes). Solved
  easy CTF reversing challenges.

- **Month 4-6:** Could tackle medium challenges. Started understanding
  anti-debugging tricks. Could read C++ binaries (vtables, name mangling).
  Could write Ghidra scripts to automate repetitive analysis.

- **Still working on:** Custom VMs, advanced obfuscation, kernel RE, firmware.

The gap between "I can't read assembly" and "I can solve easy challenges"
is smaller than it feels. The gap between "I can solve easy challenges"
and "I can tackle anything" is enormous and never fully closes. That's
what makes it fun.

## Resources that actually worked for me

- **crackmes.one** — the practice ground. Start at difficulty 1/6.
- **Nightmare** (guyinatuxedo.github.io) — a course built around CTF
  challenges, with detailed writeups for each.
- **Ghidra** — free, has a real decompiler, and the NSA released it so
  you know it's not going away.
- **pwndbg** — a GDB plugin that makes debugging less painful.
- **Compiler Explorer** (godbolt.org) — for the compile-and-compare
  technique that teaches you assembly.
- **CTFtime** (ctftime.org) — for finding CTFs to practice in. Filter by
  "reverse" tag.

---

This is the first post in a series about learning reverse engineering.
Next up: [your first crackme walkthrough]({{< ref "your-first-crackme-walkthrough" >}}) — from downloading the binary to extracting the flag, with every tool click explained.
