---
title: "Syntax Highlighting with Hugo"
date: 2026-07-14T10:00:00+07:00
draft: false
tags: ["hugo", "go", "demo"]
summary: "Hugo ships with built-in syntax highlighting via Chroma, no plugins required."
---

One thing I like about Hugo is that fenced code blocks get syntax highlighting
for free, powered by [Chroma](https://github.com/alecthomas/chroma). Here are
a few languages in action.

## Go

```go
package main

import "fmt"

func fib(n int) int {
	if n < 2 {
		return n
	}
	a, b := 0, 1
	for i := 2; i <= n; i++ {
		a, b = b, a+b
	}
	return b
}

func main() {
	fmt.Println(fib(10)) // 55
}
```

## Python

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
```

## Shell

```bash
# Build the site and start a local preview server
hugo server --buildDrafts --disableFastRender
```

## A quick table too

| Language | Paradigm       | First appeared |
|----------|----------------|----------------|
| Go       | Compiled       | 2009           |
| Python   | Interpreted    | 1991           |
| Bash     | Shell scripting| 1989           |

And inline code like `hugo new content posts/my-post.md` works anywhere in a
sentence.
