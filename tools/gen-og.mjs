#!/usr/bin/env node
// Generates Open Graph cards for published posts.
//
//   node tools/gen-og.mjs
//
// Output: assets/og/<slug>.png for every published post, plus assets/og/default.png.
//
// Safety: this repository is public, so a card is generated only for posts that
// are BOTH tracked by git AND marked draft:false. A draft card would publish an
// unpublished title. Re-run this when a draft is published or a title changes.
//
// Requirements: rsvg-convert. Poppins is vendored in tools/og/fonts and exposed
// to fontconfig through tools/og/fonts.conf, so no system font install is needed.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "assets", "og");
const FONTCONF = join(root, "tools", "og", "fonts.conf");

const W = 1200;
const H = 630;
const PAD = 80;
const ACCENT = "#6d28d9";
const ACCENT_TEXT = "#c4b5fd";
const MUTED = "#8b8b95";
const INK = "#ffffff";
const SANS = "Poppins";
const MONO = "Source Code Pro";

const xml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function trackedPosts() {
  const out = execFileSync("git", ["-C", root, "ls-files", "content/posts"], { encoding: "utf8" });
  return new Set(out.split("\n").filter(Boolean));
}

function parseFrontMatter(file) {
  const raw = readFileSync(file, "utf8");
  const parts = raw.split(/^---\s*$/m);
  const fm = parts.length > 1 ? parts[1] : "";
  const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  const tagsRaw = (fm.match(/^tags:\s*(.+)$/m) || [])[1] || "";
  const tags = [...tagsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const draft = /^draft:\s*true/m.test(fm);
  return { title, tags, draft };
}

// Greedy word wrap. Poppins SemiBold runs about 0.52em per character on average,
// which is close enough to keep lines inside the card without real text metrics.
function wrap(text, fontSize) {
  const maxWidth = W - PAD * 2;
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (candidate.length <= perLine) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Largest size that fits the title into at most three lines.
function fitTitle(title) {
  for (const size of [64, 58, 52, 46, 40, 36]) {
    const lines = wrap(title, size);
    if (lines.length <= 3) return { size, lines };
  }
  const size = 34;
  const lines = wrap(title, size).slice(0, 3);
  lines[2] = lines[2].replace(/\s+\S*$/, "") + " ...";
  return { size, lines };
}

function card({ title, tags, slug, breadcrumb }) {
  const { size, lines } = fitTitle(title);
  const lineHeight = Math.round(size * 1.24);
  const blockHeight = lines.length * lineHeight;
  const blockTop = Math.round(H / 2 - blockHeight / 2) - 10;

  const titleTspans = lines
    .map((line, i) => {
      const y = blockTop + i * lineHeight;
      return `<text x="${PAD}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="600" fill="${INK}">${xml(line)}</text>`;
    })
    .join("\n  ");

  const shown = tags.slice(0, 4);
  const tagText = shown.length ? shown.map((t) => `[ ${t} ]`).join("  ") : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d0b16"/>
      <stop offset="1" stop-color="#171025"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.1" cy="0.0" r="0.95">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${ACCENT}"/>
  <text x="${PAD}" y="118" font-family="${MONO}" font-size="24" fill="${ACCENT_TEXT}">${xml(breadcrumb)}</text>
  ${titleTspans}
  <line x1="${PAD}" y1="${H - 108}" x2="${W - PAD}" y2="${H - 108}" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>
  <text x="${PAD}" y="${H - 60}" font-family="${MONO}" font-size="22" fill="${ACCENT_TEXT}">${xml(tagText)}</text>
  <text x="${W - PAD}" y="${H - 60}" text-anchor="end" font-family="${SANS}" font-size="22" font-weight="500" fill="${MUTED}">hanhpham.vercel.app</text>
</svg>
`;
}

function rasterize(svg, dest) {
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", dest, "-"], {
    input: svg,
    env: { ...process.env, FONTCONFIG_FILE: FONTCONF },
  });
  // Smooth gradients leave the rasterizer emitting tens of thousands of unique
  // colors, which triples the file size for no visible gain. Quantize when
  // ImageMagick is available; otherwise keep the larger PNG.
  try {
    execFileSync("magick", [dest, "-colors", "256", "-strip", `png:${dest}`], { stdio: "ignore" });
  } catch {
    /* optional */
  }
}

mkdirSync(OUT, { recursive: true });

const tracked = trackedPosts();
const slugs = [];
let skipped = 0;

for (const rel of [...tracked].sort()) {
  // Two layouts exist in this repo: a page bundle (posts/<slug>/index.md) and a
  // standalone page (posts/<slug>.md). Both publish, so both need a card.
  const m = rel.match(/^content\/posts\/(?:([^/]+)\/index|([^/]+))\.md$/);
  if (!m) continue;
  const slug = m[1] || m[2];
  const file = join(root, rel);
  const { title, tags, draft } = parseFrontMatter(file);
  if (draft || !title) {
    skipped++;
    continue;
  }
  const svg = card({ title, tags, slug, breadcrumb: `hanh@blog:~/posts/${slug}` });
  rasterize(svg, join(OUT, `${slug}.png`));
  slugs.push(slug);
}

const site = "Hanh Pham's Blog";
const def = card({ title: site, tags: [], slug: "default", breadcrumb: "hanh@blog:~" });
rasterize(def, join(OUT, "default.png"));

console.log(`generated ${slugs.length} post cards + default.png`);
console.log(`skipped ${skipped} unpublished or untitled bundles`);
