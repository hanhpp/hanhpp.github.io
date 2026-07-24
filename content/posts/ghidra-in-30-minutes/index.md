---
title: "Ghidra in 30 Minutes: Reading Assembly Without Hating It"
date: 2026-07-24T10:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf"]
summary: "Ghidra's decompiler turns machine code into something that looks like C. But the output is full of strange variable names, weird casts, and functions that look nothing like what you'd write. Here's how to read it anyway."
---

Ghidra is the free decompiler from the NSA. You open a binary, it shows you
C-like code. The problem: the code looks like it was written by someone who
hates you. Variables are named `iVar1` and `local_48`. Functions are named
`FUN_00401230`. There are casts everywhere. Nothing has a type. You know
it's showing you what the program does, but you can't read it.

This post teaches you to read Ghidra's output in 30 minutes. Not every
feature — just the 20% you'll use 80% of the time.

## Why Ghidra looks weird

Ghidra's decompiler doesn't have source code. It's reconstructing C from
machine code. Machine code doesn't have variable names, types, or
comments. So Ghidra makes up names based on what it can figure out:

- **`iVar1`** — an integer variable. The `i` prefix means integer, `v` is
  the variable, `1` is the number Ghidra assigned. It does this because it
  doesn't know what you named this variable.
- **`local_48`** — a variable on the stack at offset `0x48` from the stack
  pointer. It's a local variable, and Ghidra only knows its position, not
  its purpose.
- **`FUN_00401230`** — a function at address `0x00401230`. No symbol name
  available, so Ghidra uses the address.
- **`UNWARNING`** or **`WARNING`** — Ghidra found something suspicious in
  the decompilation. Usually a cast or a type mismatch.

None of these names are permanent. You rename them. That's the first thing
to learn.

## The five things to do immediately

### 1. Rename variables

Click a variable name in the decompiler view, press `L`, type a new name.
If you figure out that `local_48` is a buffer holding user input, rename
it `user_input`. If `iVar1` is the result of a `strcmp`, rename it
`strcmp_result`.

This is the single most important Ghidra skill. The decompiler output
becomes readable the moment you rename things. Do it constantly — every
time you understand what something is, name it.

### 2. Set types

Right-click a variable, choose "Retype Variable." If Ghidra thinks
`local_48` is `char[24]` but you know it's an `int`, change it. If a
function parameter is shown as `void *` but you know it's a `FILE *`,
fix it.

Correct types make the decompiler output dramatically more readable. When
Ghidra knows something is a `struct`, it shows field access as
`ptr->field_name` instead of `*(ptr + offset)`. That's a huge difference.

### 3. Use the string references

Press `Shift+F12` to open the strings window. Find an interesting string —
an error message, a format string, a URL. Double-click it. Press `Ctrl+X`
to see cross-references — every function that uses this string. This is the
fastest way to find the interesting parts of a binary.

Strings are your map. "Wrong password" leads to the check function.
"Flag:" leads to the flag output. "Usage: %s" leads to the argument
parser.

### 4. Use the function graph

Select a function, press `Space` to switch to the graph view. This shows
the control flow as a visual flowchart — diamonds for conditionals, boxes
for code blocks, arrows for jumps.

If the decompiler output is confusing, the graph view often makes the
structure clear. You can see the if/else branches, the loop boundaries,
and the success/failure paths as a picture instead of text.

### 5. Add comments

Select a line, press `/` to add a comment. When you figure out that a
section of code is "decoding the flag," comment it. When you realize a
function is "custom Base64 decoder," comment it. You will forget what you
learned if you don't write it down. Ghidra projects save your annotations.

## Reading decompiler output: patterns to recognize

### The strcmp pattern

```c
iVar1 = strcmp(input, "expected_password");
if (iVar1 != 0) {
    puts("Wrong password");
    // failure path
} else {
    puts("Correct!");
    // success path
}
```

This is the simplest check. Your input goes into the first argument, the
expected value is the second. If you see `strcmp`, you're done — the second
argument is the password.

### The XOR decode pattern

```c
void decode(char *buf, int len) {
    for (int i = 0; i < len; i++) {
        buf[i] = buf[i] ^ 0x37;
    }
}
```

A loop that XORs each byte. The `0x37` is the key. To decode: XOR each
byte of the encoded data against `0x37`. In Python:

```python
encoded = bytes([0x50, 0x54, 0x57, 0x56, 0x51])
key = 0x37
print(bytes([b ^ key for b in encoded]))  # b"hello"
```

### The character array pattern

```c
local_28[0] = 0x66;
local_28[1] = 0x6c;
local_28[2] = 0x61;
local_28[3] = 0x67;
local_28[4] = 0x7b;
```

The flag is being built one byte at a time. Read the hex values as ASCII:
`0x66` = `f`, `0x6c` = `l`, `0x61` = `a`, `0x67` = `g`, `0x7b` = `{`.

### The loop with a lookup table

```c
char table[] = "abcdefghijklmnopqrstuvwxyz";
for (int i = 0; i < len; i++) {
    result[i] = table[input[i] - 'a'];
}
```

This is a substitution cipher — each input character is mapped through a
table. If the table is the normal alphabet, it's doing nothing. If the
table is shuffled, it's a simple substitution.

### The hash-and-compare pattern

```c
uint32_t h = 0x811c9dc5;
for (int i = 0; i < len; i++) {
    h ^= input[i];
    h *= 0x01000193;
}
if (h == 0xdeadbeef) {
    puts("Correct!");
}
```

This is a hash function (FNV-1a in this case). The input is hashed, and the
hash is compared against a hardcoded value. You can't reverse a hash, but
you can use the decompiler to find the hash algorithm, then brute-force or
dictionary-attack it.

## The Ghidra workflow checklist

1. **Open the binary**, say yes to analysis. Let Ghidra do its thing.
2. **Look at the strings** (`Shift+F12`). Find the interesting ones.
3. **Follow cross-references** from strings to functions. This leads you to
   the important code.
4. **Rename the function** based on what it does (`check_flag`, `decode`,
   `print_flag`).
5. **Rename variables** inside the function. Every time you figure out what
   something is, name it.
6. **Set types** where Ghidra guessed wrong.
7. **Add comments** for things you'll forget.
8. **Read the decompiler output** with your renamed, typed, commented code.
   It's now readable.

Do this for ten functions and Ghidra goes from "confusing mess" to "actually
useful tool." The investment in renaming pays for itself immediately —
you'll never go back to reading unnamed `iVar1` variables.

## Common gotchas

**Ghidra's decompiler isn't always right.** It reconstructs types from
machine code, and sometimes it guesses wrong. If something looks weird — a
function taking 12 parameters, a nonsensical cast, a loop that doesn't make
sense — check the disassembly view. The decompiler is a convenience layer;
the disassembly is what the CPU actually sees.

**Optimized code looks different.** If the binary was compiled with `-O2` or
`-O3`, the compiler inlined functions, reordered instructions, and
eliminated "dead" code. The decompiler output is harder to read because the
compiler did things you wouldn't expect. Try `-O0` binaries first.

**C++ binaries are harder.** Name mangling (`_ZN3Foo3barEv`), vtables
(function pointers in structs), and template instantiation make C++ binaries
more complex. Ghidra can demangle names and identify vtables, but you need
to understand how C++ compiles to really read them.

**Stripped binaries have no names.** "Stripped" means the function names
were removed. Ghidra shows `FUN_00401230` instead of `main`. The code is
still there — you just have to figure out which function is which by
looking at what they do. Entry points (like `main`) are still findable
through the ELF header.

---

Ghidra is the tool that turns "I can't read assembly" into "I can read
this." The first time you rename a variable and the decompiler output
suddenly makes sense, you'll understand why people use it. The next post
covers a more advanced topic: the custom virtual machines that show up in
CTF reversing challenges, and how to reverse them.
