---
title: "Custom VMs in CTF: When the Binary Speaks Its Own Language"
date: 2026-07-24T10:45:00+07:00
draft: false
tags: ["reverse-engineering", "ctf"]
summary: "Some CTF reversing challenges hide the flag behind a custom virtual machine — a program that interprets its own bytecode. This post shows you how to spot them, reverse the instruction set, and write a solver."
---

Some CTF reversing challenges don't check a password. Instead, they load
your input into a custom virtual machine and run bytecode. The bytecode is
designed to be hard to follow — obfuscated instruction sets, indirect jumps,
data manipulation that makes no sense until you understand the VM's design.
But once you reverse the instruction set, you can write a solver that runs
backwards or brute-forces the flag.

This post covers how to spot a custom VM, how to reverse its instruction
set, and how to write a solver.

## What is a custom VM?

A virtual machine in this context is a program that:

1. Reads bytecode (an array of bytes) from somewhere — the binary itself,
   a file, or hardcoded in the data section.
2. Interprets each byte as an instruction using a switch/case or jump
   table.
3. Executes the instruction using registers, a stack, or memory that
   only the VM knows about.

It's the same idea as Python or Java's VM, but the instruction set is
invented for this one challenge. The flag is usually encoded by the VM
executing a specific program — your input must make the VM reach a "success"
state.

## How to spot a VM

When you open a binary in Ghidra and see this pattern, it's probably a VM:

**A big switch statement in main (or a called function):**

```c
while (pc < code_length) {
    switch (bytecode[pc]) {
        case 0x01: /* instruction 1 */ break;
        case 0x02: /* instruction 2 */ break;
        case 0x03: /* instruction 3 */ break;
        // ... 20-50 cases
    }
    pc++;
}
```

The `pc` is a program counter — an index into the bytecode array. The
switch dispatches on the opcode (first byte of each instruction). The
number of cases tells you how many instructions the VM has.

**Other telltale signs:**

- A `while` or `for` loop that indexes into a byte array and dispatches
  on the value.
- Registers that aren't CPU registers — global variables used as VM state
  (`vm_reg[0]`, `vm_stack`, `vm_pc`).
- A function that looks like it has no purpose other than "run this
  program."

## Reversing the instruction set

Once you've found the VM loop, the job is to figure out what each opcode
does. Work through the switch cases one at a time.

### Start with the obvious ones

Some opcodes are easy to identify:

**Stack push:**
```c
case 0x10:
    vm_stack[vm_sp] = vm_reg[arg];
    vm_sp++;
    break;
```
This pushes a register value onto the stack. You can tell from the
`vm_sp++` (stack pointer increment) and the write to the stack array.

**Stack pop:**
```c
case 0x11:
    vm_sp--;
    vm_reg[arg] = vm_stack[vm_sp];
    break;
```
The reverse — decrement the stack pointer, read into a register.

**Input:**
```c
case 0x20:
    vm_reg[0] = user_input[input_index];
    input_index++;
    break;
```
Reads a byte from user input into a register. This is how your input gets
into the VM.

**Compare and jump:**
```c
case 0x30:
    if (vm_reg[arg1] != vm_reg[arg2]) {
        vm_pc = jump_target;
    }
    break;
```
Conditional jump — if two registers don't match, jump to a different
offset. This is the "check" opcode.

**Print success:**
```c
case 0xFF:
    puts("Correct!");
    break;
```
The exit opcode.

### Map the full instruction set

Create a table — even just a text file — mapping each opcode to what it
does:

```
0x00 = nop
0x01 = push reg
0x02 = pop reg
0x03 = mov reg, imm
0x04 = add reg, reg
0x05 = sub reg, reg
0x06 = xor reg, reg
0x10 = read_input reg
0x20 = cmp reg, reg
0x21 = je offset
0x22 = jne offset
0xFF = halt
```

The exact opcodes depend on the challenge. But the categories are
consistent: data movement, arithmetic, logic, control flow, I/O. Every
VM implements some subset of these.

### Follow the data flow

Once you know the instructions, trace what happens to user input:

1. It enters via the `read_input` opcode.
2. It gets pushed onto the stack or moved into a register.
3. It gets transformed — XOR, ADD, SUB, lookup table, bit shifts.
4. The result is compared against something — the expected flag bytes.

The transformation chain is the "encryption" on the flag. If you can read
each step, you can reverse it.

## Writing a solver

Once you know the instruction set, you don't need to trace through the VM
manually. Write a solver.

### Approach 1: emulate the VM

Reimplement the VM in Python (or any language). Run the bytecode through
your emulator with candidate inputs:

```python
class VM:
    def __init__(self, bytecode):
        self.bytecode = bytecode
        self.pc = 0
        self.reg = [0] * 8
        self.stack = []
        self.input_idx = 0

    def run(self, user_input):
        self.user_input = user_input
        while self.pc < len(self.bytecode):
            op = self.bytecode[self.pc]
            self.pc += 1
            if op == 0x10:  # read_input
                arg = self.bytecode[self.pc]; self.pc += 1
                self.reg[arg] = self.user_input[self.input_idx]
                self.input_idx += 1
            elif op == 0x06:  # xor reg, reg
                a = self.bytecode[self.pc]; self.pc += 1
                b = self.bytecode[self.pc]; self.pc += 1
                self.reg[a] ^= self.reg[b]
            elif op == 0x20:  # cmp
                a = self.bytecode[self.pc]; self.pc += 1
                b = self.bytecode[self.pc]; self.pc += 1
                if self.reg[a] != self.reg[b]:
                    self.pc = self.bytecode[self.pc]
                else:
                    self.pc += 1
            elif op == 0xFF:
                return True
        return False
```

Then brute-force or constraint-solve the input.

### Approach 2: reverse the operations

If the VM does simple transformations, reverse them step by step:

```python
# VM does: input[i] ^ 0x42 + 3 == expected[i]
# Reverse: flag[i] = (expected[i] - 3) ^ 0x42
flag = bytes([(b - 3) ^ 0x42 for b in expected])
```

This only works when the transformations are simple and reversible. If the
VM does a hash or a complex loop, you need the emulator approach.

### Approach 3: use angr

[angr](https://angr.io/) is a binary analysis framework that can solve
constraining problems. If you can identify the VM's check function, angr
can find an input that makes it return "success":

```python
import angr

proj = angr.Project('./crackme', auto_load_libs=False)
state = proj.factory.entry_state()
simgr = proj.factory.simulation_manager(state)

# find the "correct" state, avoid the "wrong" state
simgr.explore(find=0x401234, avoid=0x401256)

if simgr.found:
    found = simgr.found[0]
    print(found.posix.dumps(0))  # stdin that reaches the find address
```

angr treats the binary as a set of constraints and uses a constraint solver
to find an input that reaches a specific address. It's slow but it works,
even on VMs you don't fully understand.

## Common VM patterns in CTF

**Stack-based VMs** look like Forth or JVM bytecode. Instructions push and
pop values, operations work on the top of the stack:

```
push 0x41
push 0x42
xor       // stack = [0x03]
```

**Register-based VMs** look like assembly. Instructions move data between
registers and perform operations:

```
mov r0, 0x41
mov r1, 0x42
xor r0, r1   // r0 = 0x03
```

**Obfuscated VMs** hide the instruction set. Instead of a clean switch,
they use computed jumps — `goto *(&jump_table + opcode * 8)` — so the
decompiler can't show you the switch directly. You need to follow the
jump table manually. In Ghidra, look for arrays of function pointers in
the data section.

**Multi-stage VMs** run one VM, then use its output as input to another
VM. You need to reverse both stages.

---

Custom VMs look intimidating but they follow patterns. Every VM has a
program counter, an instruction stream, and a dispatch mechanism. Find
those three things and you can reverse the instruction set. The next post
covers anti-debugging — techniques binaries use to detect that you're
debugging them, and how to get around it.
