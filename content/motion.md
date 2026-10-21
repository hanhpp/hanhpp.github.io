---
title: "Motion lab"
date: 2026-10-21T09:50:00+07:00
draft: false
description: "The CRT animation set from felixrieseberg.com, ported to this site as a trial: a boot sequence, a lightbox sweep, a tracking wobble, a miss flicker and a reel."
---

This page is a trial. It reproduces the mechanics of the animation layer at
[felixrieseberg.com](https://felixrieseberg.com/) without any of its artwork: the same `steps()` timing, the
same short durations, the same reduced-motion fallbacks. Everything is scoped under `.motion-lab`, so it cannot
leak into the rest of the site. If it earns its place, the parts worth keeping move into the theme; if not,
delete this file and the branch goes with it.

<div class="motion-lab">

<div class="ml-bar">
  <span class="ml-label">Motion</span>
  <button type="button" class="ml-toggle" id="ml-toggle" aria-pressed="true">on</button>
  <span class="ml-note">Nothing here runs on page load except the boot sequence below.</span>
</div>

<h2>1. Boot sequence</h2>

<p class="ml-lede">A power-on that ends in a stable line: the percentage climbs in discrete steps, the bar
fills in segments, and the whole panel settles instead of fading.</p>

<div class="ml-boot" id="ml-boot">
  <div class="ml-screen">
    <div class="ml-bootline"><span class="ml-prompt">&#9654;</span> LOADING <span class="ml-pct" id="ml-pct">00%</span></div>
    <div class="ml-bar-track"><div class="ml-bar-fill" id="ml-fill"></div></div>
    <div class="ml-bootmeta"><span>CH 00</span><span class="ml-cursor"></span></div>
  </div>
  <button type="button" class="ml-again" id="ml-again">run it again</button>
</div>

<h2>2. Lightbox sweep and tracking wobble</h2>

<p class="ml-lede">Two effects on the same 450 ms: a bright band translates down the frame, and the image
jitters sideways with a saturation spike on the first frames. Both use <code>steps(9)</code>, so they read as
a television losing sync rather than a smooth fade.</p>

<div class="ml-shot" id="ml-shot">
  <span class="ml-shot-hint">click to open</span>
</div>

<h2>3. Miss flicker</h2>

<p class="ml-lede">A 404 state that flickers three times over 900 ms, and becomes a line-through when the
visitor asks for reduced motion.</p>

<p><a href="#" class="ml-miss" id="ml-miss">/posts/this-page-does-not-exist/</a>
<button type="button" class="ml-again" id="ml-hit">trigger miss</button></p>

<h2>4. Reel and caret</h2>

<p class="ml-lede">The two continuous ones: a reel that spins while audio plays, and a caret that blinks on a
half-second.</p>

<div class="ml-row">
  <div class="ml-reel" aria-hidden="true"><span></span><span></span></div>
  <div class="ml-typing"><span class="ml-caret"></span> ready</div>
</div>

</div>

<style>
.motion-lab { --ml-ink: var(--primary, #17160f); --ml-paper: var(--theme, #f0efe9);
  --ml-rule: var(--border, rgba(23,22,15,.13)); --ml-accent: var(--accent, #b32b19);
  font-size: 17px; line-height: 1.65; }
.motion-lab h2 { font-family: var(--font-read, serif); margin-top: 2.2em; }
.motion-lab .ml-lede { color: var(--secondary, #6a675c); max-width: 62ch; }
.motion-lab code { font-size: .85em; }

.ml-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  border: 1px solid var(--ml-rule); border-radius: 3px; padding: 8px 12px; margin: 1.4em 0 2em; }
.ml-label, .ml-note { font-family: var(--font-display, sans-serif); text-transform: uppercase;
  letter-spacing: .07em; font-size: 11px; color: var(--secondary, #6a675c); }
.ml-note { margin-left: auto; letter-spacing: 0; text-transform: none; font-size: 12px; }
.ml-toggle { font: inherit; font-size: 12px; padding: 2px 10px; border: 1px solid var(--ml-rule);
  border-radius: 3px; background: none; color: var(--ml-accent); cursor: pointer; }
.ml-toggle[aria-pressed="false"] { color: var(--secondary, #6a675c); }

.ml-again { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--ml-rule);
  border-radius: 3px; background: none; color: var(--secondary, #6a675c); cursor: pointer; margin-left: 12px; }

/* 1. boot */
.ml-boot { max-width: 520px; }
.ml-screen { background: #10131c; border-radius: 5px; padding: 18px 18px 12px; color: #d7d2c4;
  font-family: var(--font-mono, monospace); box-shadow: inset 0 0 60px rgba(90,140,255,.10); }
.ml-bootline { font-size: 13px; letter-spacing: .12em; display: flex; align-items: center; gap: 8px; }
.ml-prompt { color: #8aa4ff; }
.ml-pct { margin-left: auto; color: #8aa4ff; }
.ml-bar-track { height: 10px; margin: 14px 0 10px; background:
  repeating-linear-gradient(90deg, rgba(215,210,196,.14) 0 8px, transparent 8px 10px); }
.ml-bar-fill { height: 100%; width: 0;
  background: repeating-linear-gradient(90deg, #8aa4ff 0 8px, transparent 8px 10px); transition: width .08s steps(2); }
.ml-bootmeta { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: .16em;
  color: rgba(215,210,196,.55); }
.ml-cursor { width: .5em; height: .9em; background: #d7d2c4; animation: ml-blink 1.06s steps(1) infinite; }

/* 2. lightbox */
.ml-shot { position: relative; max-width: 520px; height: 300px; border-radius: 4px; overflow: hidden;
  cursor: pointer; background:
    radial-gradient(120% 90% at 30% 20%, #2b2f3a 0%, #161821 55%, #0d0f15 100%);
  border: 1px solid var(--ml-rule); }
.ml-shot::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 2px, transparent 2px 4px); }
.ml-shot-hint { position: absolute; inset: auto 0 12px 0; text-align: center; font-size: 12px;
  font-family: var(--font-display, sans-serif); letter-spacing: .08em; text-transform: uppercase;
  color: rgba(235,231,220,.6); }
.ml-shot .ml-fig { position: absolute; inset: 18% 12%; border-radius: 2px;
  background: linear-gradient(135deg, #b32b19, #ff7a5c 45%, #f0efe9); opacity: 0; }
.ml-shot.on .ml-fig { opacity: 1; animation: ml-track .45s steps(9, end); }
.ml-shot .ml-band { position: absolute; left: 0; right: 0; height: 14%; top: 0; opacity: 0;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.5), transparent); }
.ml-shot.on .ml-band { animation: ml-band .45s steps(9, end); }

/* 3. miss */
.ml-miss { color: var(--ml-accent); text-decoration: underline; text-underline-offset: 3px; }
.ml-miss.miss { animation: ml-miss .9s steps(1, end); text-decoration: line-through !important; }

/* 4. reel and caret */
.ml-row { display: flex; align-items: center; gap: 28px; }
.ml-reel { position: relative; width: 54px; height: 54px; border: 1px solid var(--ml-rule); border-radius: 50%;
  display: grid; place-items: center; }
.ml-reel span { position: absolute; width: 14px; height: 14px; border: 2px solid var(--ml-ink);
  border-radius: 50%; animation: ml-reel 1.6s linear infinite; }
.ml-reel span:first-child { transform: translateX(-13px); }
.ml-reel span:last-child { transform: translateX(13px); }
.ml-typing { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace);
  font-size: 13px; letter-spacing: .1em; }
.ml-caret { width: .55em; height: 1.05em; background: var(--ml-accent); animation: ml-blink 1.06s steps(1) infinite; }

@keyframes ml-blink { 50% { opacity: 0 } }
@keyframes ml-track {
  0% { transform: translateX(-12px); filter: saturate(1.7) brightness(1.2) }
  25% { transform: translateX(8px) }
  50% { transform: translateX(-3px); filter: none }
  75% { transform: translateX(1px) }
  100% { transform: none }
}
@keyframes ml-band {
  0% { opacity: 1; transform: translateY(-100%) }
  95% { opacity: .9; transform: translateY(560%) }
  100% { opacity: 0; transform: translateY(600%) }
}
@keyframes ml-miss { 0%,33%,67% { opacity: 1 } 17%,50%,83% { opacity: .12 } }
@keyframes ml-reel { to { rotate: 360deg } }

.ml-off *, .ml-off *::before, .ml-off *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .motion-lab *, .motion-lab *::before, .motion-lab *::after { animation: none !important; transition: none !important; }
  .ml-miss.miss { text-decoration: line-through !important; }
  .ml-caret, .ml-cursor { background: var(--ml-accent); }
}
</style>

<script>
(function () {
  var lab = document.querySelector(".motion-lab");
  if (!lab) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pct = document.getElementById("ml-pct");
  var fill = document.getElementById("ml-fill");
  var boot = document.getElementById("ml-boot");
  var shot = document.getElementById("ml-shot");
  var miss = document.getElementById("ml-miss");

  // The demo image is drawn in markup so no asset is needed.
  shot.insertAdjacentHTML("beforeend", '<div class="ml-fig"></div><div class="ml-band"></div>');

  function runBoot() {
    if (reduce.matches || lab.classList.contains("ml-off")) { pct.textContent = "100%"; fill.style.width = "100%"; return; }
    var n = 0;
    pct.textContent = "00%"; fill.style.width = "0%";
    var t = setInterval(function () {
      n += 3 + Math.floor(Math.random() * 9);
      if (n >= 100) { n = 100; clearInterval(t); }
      pct.textContent = (n < 10 ? "0" : "") + n + "%";
      fill.style.width = n + "%";
    }, 90);
  }

  document.getElementById("ml-again").addEventListener("click", runBoot);
  shot.addEventListener("click", function () {
    shot.classList.remove("on");
    void shot.offsetWidth;
    shot.classList.add("on");
  });
  document.getElementById("ml-hit").addEventListener("click", function () {
    miss.classList.remove("miss");
    void miss.offsetWidth;
    miss.classList.add("miss");
  });
  document.getElementById("ml-toggle").addEventListener("click", function (e) {
    var off = lab.classList.toggle("ml-off");
    e.currentTarget.setAttribute("aria-pressed", off ? "false" : "true");
    e.currentTarget.textContent = off ? "off" : "on";
  });
  reduce.addEventListener && reduce.addEventListener("change", runBoot);
  runBoot();
})();
</script>
