---
title: "Page Bundles, Images, and Shortcodes"
date: 2026-07-14T11:00:00+07:00
draft: false
tags: ["hugo", "demo"]
summary: "Keeping a post and its images together with Hugo page bundles, plus the built-in figure shortcode."
---

This post lives in its own folder — `content/posts/using-images-and-shortcodes/index.md` —
alongside an image file. That folder is a Hugo **page bundle**: any asset
placed next to `index.md` can be referenced with a relative path, and it gets
copied to the right place automatically when the site builds.

## The `figure` shortcode

```markdown
{{</* figure src="cover.svg" alt="Demo cover image" caption="A generated SVG, bundled with this post" */>}}
```

renders as:

{{< figure src="cover.svg" alt="Demo cover image" caption="A generated SVG, bundled with this post" >}}

## Why bundles are handy

- Move the folder, and the post keeps its images — no broken links.
- No separate `static/images/...` path to keep in sync with the post.
- Works for any file type: PDFs, diagrams, downloadable code samples.

## Linking to other posts

Shortcodes like `{{</* ref */>}}` resolve internal links by filename instead
of a hardcoded URL, so renaming a post's slug doesn't quietly break links
from other pages — see [the welcome post]({{< ref "welcome-to-my-blog" >}})
for an example.
