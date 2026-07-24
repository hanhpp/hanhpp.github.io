---
title: "Your First Crackme: A Walkthrough from strings to Flag"
date: 2026-07-24T10:30:00+07:00
draft: false
tags: ["reverse-engineering", "ctf"]
summary: "A crackme is a small binary that asks for a password and checks your input. This post walks through solving one — from downloading the binary to extracting the flag — with every tool click explained so you can follow along."
---

If you've never reversed a binary before, this post walks through the
entire process on a simple crackme: a small program that asks for a
password and tells you if you got it right. Every command, every tool, and
every decision is explained. By the end, you'll have a workflow you can
repeat on harder challenges.

This isn't a walkthrough of a specific real crackme — it's a composite of
the patterns you'll see in dozens of beginner challenges. The techniques
apply to any simple "find the password" binary.

## Step 0: download and run it

Download the binary from crackmes.one (or wherever your challenge comes
from). First thing: what is it?

```bash
file crackme
```

```
crackme: ELF 64-bit LSB executable, x86-64, version 1 (SYSV),
dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
BuildID[sha1]=..., for GNU/Linux 3.2.0, not stripped
```

It's a 64-bit Linux executable. "Not stripped" means function names are
still in the binary — that makes things easier. "Dynamically linked" means
it uses shared libraries (libc).

Run it with junk input:

```bash
./crackme
```

```
Enter the password: hello
Wrong password. Try again.
```

Simple. It asks for a password, you type something, it says wrong. Our job
is to find the right one.

## Step 1: strings — the 30-second check

Before opening any tool, run `strings`:

```bash
strings crackme | head -50
```

Look for anything interesting — flag formats (`flag{`, `CTF{`), readable
passwords, error messages, function names. In many beginner crackmes, the
password is literally sitting in the strings:

```bash
strings crackme | grep -i password
```

```
Enter the password:
Wrong password. Try again.
Congratulations! You got it right.
s3cr3t_p4ss
```

If you see a string that looks like a password (`s3cr3t_p4ss`), try it:

```
Enter the password: s3cr3t_p4ss
Congratulations! You got it right.
```

Done. Half the beginner crackmes on crackmes.one are solvable with
`strings`. Don't skip this step — it's embarrassing how often it works.

If `strings` doesn't give you the answer, keep reading.

## Step 2: Ghidra — find the check

Open the binary in Ghidra. Create a new project, import the binary, and
let it analyze (say yes to all the analysis options). The decompiler view
will open automatically.

### Finding the main function

Ghidra's symbol tree shows all function names. Look for `main` — that's
where the program starts. Double-click it and the decompiler shows
something like:

```c
undefined8 main(void) {
    char local_18 [24];
    puts("Enter the password:");
    fgets(local_18, 20, stdin);
    check_password(local_18);
    return 0;
}
```

The password goes into `local_18`, then `check_password` is called. That's
where the comparison happens.

### Following the check

Double-click `check_password` in the decompiler:

```c
void check_password(char *input) {
    int iVar1;
    iVar1 = strcmp(input, "d4nger_d4t4");
    if (iVar1 == 0) {
        puts("Congratulations! You got it right.");
    } else {
        puts("Wrong password. Try again.");
    }
}
```

There it is. `strcmp` compares your input against `"d4nger_d4t4"`. If
they're equal (`iVar1 == 0`), you win.

Try it:

```
Enter the password: d4nger_d4t4
Congratulations! You got it right.
```

### What if it's not a plain strcmp?

Beginner crackmes sometimes make it slightly harder — instead of comparing
against a string directly, they compare against an XOR-encoded version, or
build the string character by character. The pattern to look for in the
decompiler:

**XOR loop:** a function that XORs each byte of your input against a key
and compares the result. In the decompiler, it looks like a loop with
`^` (XOR):

```c
void check_password(char *input) {
    char expected[] = {0x1c, 0x0a, 0x12, 0x06, 0x3a, 0x00};
    for (int i = 0; i < 6; i++) {
        if ((input[i] ^ 0x42) != expected[i]) {
            puts("Wrong password.");
            return;
        }
    }
    puts("Correct!");
}
```

To solve: XOR each expected byte against `0x42`:

```python
expected = [0x1c, 0x0a, 0x12, 0x06, 0x3a, 0x00]
key = 0x42
password = "".join(chr(b ^ key) for b in expected)
print(password)  # "h3ll0"
```

**Character-by-character comparison:** the decompiler shows individual
comparisons for each character:

```c
if (input[0] != 'f') { puts("Wrong."); return; }
if (input[1] != 'l') { puts("Wrong."); return; }
if (input[2] != 'a') { puts("Wrong."); return; }
// ...
```

Just read the characters off: `flag{...}`.

## Step 3: GDB — see it happening

Ghidra tells you *what* the program does. GDB lets you watch it *do* it.
This is where reverse engineering becomes debugging without source code.

### Setup

Install pwndbg (a GDB plugin that makes GDB bearable):

```bash
pip install pwndbg
```

Run GDB with the binary:

```bash
gdb ./crackme
```

### Break at the check

If you found the check function name in Ghidra (like `check_password`),
break there:

```
(gdb) break check_password
```

If the function is stripped (no name), break at `strcmp` instead:

```
(gdb) break strcmp
```

### Run and inspect

```
(gdb) run
```

The program starts, asks for a password, you type `test`. When it hits the
breakpoint:

```
Breakpoint 1, check_password (input=0x7fffffffe040 "test\n")
```

`pwndbg` automatically shows you the registers and the arguments. `input`
points to your input string. One of the other registers or stack values
holds the expected password.

Look at the arguments to `strcmp`:

```
(gdb) x/s $rdi
0x7fffffffe040: "test\n"
(gdb) x/s $rsi
0x402000: "d4nger_d4t4"
```

`$rdi` is your input. `$rsi` is the expected value. There's the password
without even reading the decompiler.

### Patching (advanced)

If you want to see what happens on success without knowing the password,
you can patch the binary. In GDB:

```
(gdb) break check_password
(gdb) run
# when it hits the breakpoint:
(gdb) set $rdi = 0
(gdb) continue
```

This forces `strcmp` to return 0 (equal), so the program always takes the
success path. The binary on disk isn't changed — only the running
instance.

To actually patch the binary file, use a hex editor or `radare2`:

```bash
r2 -w crackme
# in radare2:
wa nop  # at the conditional jump after strcmp
q
```

## Step 4: the flag

In CTF challenges, the password often IS the flag, or the flag is printed
after you enter the correct password:

```
Enter the password: d4nger_d4t4
Congratulations! You got it right.
Flag: CTF{y0u_f0und_th3_p4ssw0rd}
```

Sometimes the flag is built dynamically — assembled from pieces stored
in different parts of the binary. In that case, you'll see the pieces in
Ghidra and reconstruct them:

```python
# from the decompiler:
flag = "CTF{" + chr(0x79) + chr(0x30) + chr(0x75) + "_f0und_th3_p4ssw0rd}"
print(flag)  # CTF{y0u_f0und_th3_p4ssw0rd}
```

## The checklist

Every time you open a new crackme, follow these steps in order:

1. **`file`** — what kind of binary is this?
2. **Run with junk input** — what does it do? What does it print?
3. **`strings`** — is the answer right there?
4. **Ghidra** — find the comparison. Is it `strcmp`? XOR loop? Hash check?
5. **GDB** — break at the comparison, inspect the registers, read the
   expected value.
6. **Solve** — extract the password, submit the flag.

If step 3 works, you're done in two minutes. If not, steps 4-5 will get
you there. Steps 1-2 are always worth doing first — they tell you what
you're dealing with.

---

This workflow works for every beginner crackme and most intermediate ones.
As challenges get harder, you'll add techniques — anti-debugging bypasses,
custom VM emulation, obfuscation — but the core process stays the same:
run it, find the check, read the comparison, extract the answer. The next
post covers Ghidra in depth — how to read its decompiler output confidently
and use it to understand binaries you've never seen before.
