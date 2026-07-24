---
title: "Anti-Debugging Tricks: When the Binary Fights Back"
date: 2026-07-24T11:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf"]
summary: "Some binaries detect that you're debugging them and crash, change behavior, or hide the flag. This post covers the common anti-debugging techniques and how to bypass them."
---

You attach GDB to a binary. It immediately exits. Or it takes a different
path than it did without GDB. Or the flag disappears. The binary knows
you're debugging it — and it's fighting back.

Anti-debugging is a cat-and-mouse game. The binary checks for signs of a
debugger, and if it finds one, it takes a different code path — usually
one that fails. Your job is to make it think it's not being debugged, or
to patch out the checks entirely.

This post covers the most common techniques and how to get around them.

## ptrace: the classic

On Linux, a process can only be debugged by one other process at a time.
If the binary calls `ptrace(PTRACE_TRACEME)` on itself, it's asking to be
traced — but if it's already being traced (by GDB), the call fails. If
it's NOT being traced, the call succeeds. The binary can check the return
value:

```c
if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) {
    // debugger detected
    printf("No debugging allowed!\n");
    exit(1);
}
```

### Bypass

**Option 1:** Use GDB's `catch` command to intercept the `ptrace` call:

```
(gdb) catch syscall ptrace
(gdb) run
# when it hits the catch:
(gdb) set $rax = 0  # make ptrace return 0 (success)
(gdb) continue
```

**Option 2:** Patch the binary. Find the `ptrace` call in Ghidra, NOP it
out:

```
# in radare2:
r2 -w crackme
/ ptrace  # find the call
wa nop    # replace with nop
q
```

**Option 3:** Use `LD_PRELOAD` to override `ptrace`:

```c
// fake_ptrace.c
long ptrace(int request, int pid, void *addr, void *data) {
    return 0;  // always succeed
}
```

```bash
gcc -shared -o fake_ptrace.so fake_ptrace.c
LD_PRELOAD=./fake_ptrace.so ./crackme
```

## /proc/self/status

The binary reads `/proc/self/status` and checks the `TracerPid` line. If
a debugger is attached, `TracerPid` shows the debugger's PID. Otherwise
it's 0:

```c
FILE *f = fopen("/proc/self/status", "r");
char line[256];
while (fgets(line, sizeof(line), f)) {
    if (strncmp(line, "TracerPid:", 10) == 0) {
        int pid = atoi(line + 10);
        if (pid != 0) {
            // debugger detected
        }
    }
}
```

### Bypass

Use a modified kernel or a `LD_PRELOAD` that intercepts `fopen`/`fgets`
and returns fake `/proc/self/status` data where `TracerPid: 0`.

Or patch the binary to skip the check — find the comparison and NOP it.

## Timing checks

The binary takes a timestamp before and after a section of code. If the
difference is too large (because a debugger makes code run slower), it
knows it's being debugged:

```c
struct timeval start, end;
gettimeofday(&start, NULL);
// ... some computation ...
gettimeofday(&end, NULL);
long elapsed = (end.tv_sec - start.tv_sec) * 1000000
             + (end.tv_usec - start.tv_usec);
if (elapsed > 1000) {  // more than 1ms
    // debugger detected
}
```

### Bypass

Patch the comparison. Or use GDB to set a breakpoint AFTER the timing
check, so the timing code runs without interruption.

## /proc/self/maps

The binary reads `/proc/self/maps` to check which libraries are loaded.
If it sees GDB's libraries or pwndbg, it knows it's being debugged:

```c
FILE *f = fopen("/proc/self/maps", "r");
char line[256];
while (fgets(line, sizeof(line), f)) {
    if (strstr(line, "pwndbg") || strstr(line, "gdb")) {
        // debugger detected
    }
}
```

### Bypass

Patch the string comparison, or use a debugger that doesn't load obvious
shared libraries.

## int3 (software breakpoint detection)

GDB sets breakpoints by replacing a byte with `0xCC` (`int3`). The binary
can scan its own code for `0xCC` bytes:

```c
unsigned char *code = (unsigned char *)main;
for (int i = 0; i < 1000; i++) {
    if (code[i] == 0xCC) {
        // breakpoint detected
    }
}
```

### Bypass

Use hardware breakpoints instead of software breakpoints. In GDB:

```
(gdb) hbreak check_function  # hardware breakpoint
```

Hardware breakpoints use CPU debug registers, not code modification. The
binary can't detect them by scanning its own code.

Or use `int3` at a different location — set a breakpoint at the function
that checks for breakpoints (metaprogramming, but it works).

## How to find anti-debugging in a binary

When you suspect anti-debugging, look for these strings in the binary:

```bash
strings crackme | grep -i -E "(debug|ptrace|trace|break|dump|detect)"
```

Common function calls to look for in Ghidra:

- `ptrace` — the classic check
- `fopen` with `/proc/self/` paths — reading process info
- `gettimeofday` or `clock_gettime` — timing checks
- `IsDebuggerPresent` — Windows-specific (PE binaries)
- `CheckRemoteDebuggerPresent` — Windows

## The mindset

Anti-debugging isn't magic. It's just more code — code that checks
conditions and branches. Every check has a pattern:

1. **Detect** — the binary checks something (ptrace, timing, memory).
2. **Decide** — if the check fails, take the bad path.
3. **Act** — crash, exit, or return wrong answer.

Your job is to find the detect step and either make it succeed (fake the
environment) or remove it (patch the code). Every anti-debugging technique
is breakable because the binary runs on your machine and you control the
machine.

The only question is how much work it takes.

---

This wraps up the introductory RE series. You've learned to read binaries
with `strings` and Ghidra, solve crackmes, reverse custom VMs, and bypass
anti-debugging. The best way to get better is to practice — pick a CTF
challenge, set a timer for an hour, and work through it. When you get stuck,
look at other people's writeups to learn techniques you missed. The cycle
of try, get stuck, read a writeup, try again is how everyone learns this.
