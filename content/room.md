---
title: "The room"
date: 2026-10-21T08:00:00+07:00
draft: false
description: "A night desk drawn on a canvas: rain on the window, a city outside, and a CRT that boots with the site's own line. Click the screen."
---

The page you may have come from draws its room as a canvas illustration that boots. This is an original
vignette in that genre rather than a copy of its artwork: the composition, the colour and the boot sequence
are written here, the drawing is code, and there are no image assets.

Click the monitor to change the line on the screen.

<div class="room-lab">
  <canvas id="room-canvas" role="img"
          aria-label="A night desk: rain on a window over a city, a lamp, a plant, a stack of cassettes and a CRT that boots."></canvas>
  <p class="room-hint">click the screen &middot; motion respects your reduced-motion setting</p>
</div>

<style>
.room-lab { width: min(1180px, 94vw); margin: 1.6em 0 0;
  position: relative; left: 50%; transform: translateX(-50%); }
.room-lab canvas { display: block; width: 100%; height: auto; border-radius: 6px;
  background: #120f0d; box-shadow: 0 18px 40px rgba(0,0,0,.28); cursor: pointer; }
.room-hint { font-family: var(--font-display, sans-serif); font-size: 11px; letter-spacing: .07em;
  text-transform: uppercase; color: var(--secondary, #6a675c); margin-top: 10px; text-align: right; }
</style>

<script>
(function () {
  var cv = document.getElementById("room-canvas");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var W = 1280, H = 720;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.aspectRatio = W + " / " + H;
  ctx.scale(dpr, dpr);

  var LINES = [
    "ALWAYS A MORE BEAUTIFUL ANSWER",
    "ALWAYS A MORE OBVIOUS ONE",
    "WE SIMPLY HAD THE WRONG PERSPECTIVE"
  ];
  var line = 0, pct = 0, phase = "load", last = 0, raf = null;

  // Seeded so the rain and the city do not reshuffle on every reload.
  var seed = 20261021;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  var drops = [];
  for (var i = 0; i < 90; i++) {
    drops.push({ x: 0.08 + rnd() * 0.54, y: rnd(), len: 0.02 + rnd() * 0.05, sp: 0.25 + rnd() * 0.5 });
  }
  var city = [];
  for (var b = 0; b < 22; b++) {
    city.push({ x: 0.08 + b * 0.0245, w: 0.017 + rnd() * 0.012, h: 0.06 + rnd() * 0.14, lit: 0.3 + rnd() * 0.7 });
  }

  function wall() {
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.64);
    g.addColorStop(0, "#3a2a22"); g.addColorStop(1, "#241a15");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.64);
  }

  function windowView(t) {
    var x = W * 0.08, y = H * 0.07, w = W * 0.54, h = H * 0.5;
    var sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, "#0d1524"); sky.addColorStop(0.55, "#16233a"); sky.addColorStop(1, "#25313f");
    ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);

    // skyline
    var baseY = y + h * 0.82;
    for (var i = 0; i < city.length; i++) {
      var c = city[i];
      var bx = x + c.x * w, bw = c.w * w, bh = c.h * h;
      ctx.fillStyle = "#0b1018";
      ctx.fillRect(bx, baseY - bh, bw, bh);
      ctx.fillStyle = "rgba(255,214,150," + (0.10 + c.lit * 0.35) + ")";
      for (var wy = baseY - bh + 6; wy < baseY - 4; wy += 9) {
        for (var wx = bx + 3; wx < bx + bw - 3; wx += 7) {
          if ((wx + wy) % 5 < 2) ctx.fillRect(wx, wy, 2, 3);
        }
      }
    }

    // a sign, and its reflection band on the wet glass
    ctx.fillStyle = "rgba(255,236,190,.82)";
    ctx.font = "700 18px ui-monospace, monospace";
    ctx.fillText("METRO", x + w * 0.62, baseY - h * 0.12);
    ctx.fillStyle = "rgba(255,236,190,.10)";
    ctx.fillRect(x + w * 0.60, baseY - h * 0.10, w * 0.16, h * 0.10);

    // rain
    ctx.strokeStyle = "rgba(190,215,255,.28)"; ctx.lineWidth = 1;
    for (var d = 0; d < drops.length; d++) {
      var p = drops[d];
      var dy = (p.y + t * p.sp) % 1;
      var px = x + p.x * w + Math.sin((dy + d) * 6) * 2;
      ctx.beginPath();
      ctx.moveTo(px, y + dy * h);
      ctx.lineTo(px + 1.5, y + (dy + p.len) * h);
      ctx.stroke();
    }

    // frame and mullion
    ctx.strokeStyle = "#171310"; ctx.lineWidth = 10;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.5, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.36); ctx.lineTo(x + w, y + h * 0.36); ctx.stroke();
  }

  function desk() {
    var g = ctx.createLinearGradient(0, H * 0.64, 0, H);
    g.addColorStop(0, "#4a3425"); g.addColorStop(0.5, "#3b281b"); g.addColorStop(1, "#22160f");
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.64, W, H * 0.36);
    ctx.fillStyle = "rgba(255,220,170,.06)"; ctx.fillRect(0, H * 0.64, W, 3);
  }

  function lamp() {
    var bx = W * 0.16, by = H * 0.70;
    ctx.fillStyle = "#1d1713";
    ctx.beginPath(); ctx.ellipse(bx, by + 6, 44, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(bx - 3, by - 96, 6, 96);
    ctx.fillStyle = "#b8623f";
    ctx.beginPath();
    ctx.moveTo(bx - 46, by - 96); ctx.lineTo(bx + 46, by - 96);
    ctx.lineTo(bx + 28, by - 148); ctx.lineTo(bx - 28, by - 148); ctx.closePath(); ctx.fill();
    var glow = ctx.createRadialGradient(bx, by - 88, 6, bx, by - 88, 210);
    glow.addColorStop(0, "rgba(255,198,120,.30)"); glow.addColorStop(1, "rgba(255,198,120,0)");
    ctx.fillStyle = glow; ctx.fillRect(bx - 220, by - 300, 440, 340);
  }

  function plant() {
    var px = W * 0.045;
    ctx.fillStyle = "#8d5a3c";
    ctx.beginPath(); ctx.moveTo(px, H * 0.72); ctx.lineTo(px + 74, H * 0.72);
    ctx.lineTo(px + 62, H * 0.90); ctx.lineTo(px + 12, H * 0.90); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#24402b";
    for (var i = 0; i < 9; i++) {
      var a = -2.4 + i * 0.26, r = 60 + (i % 3) * 26;
      ctx.beginPath();
      ctx.ellipse(px + 37 + Math.cos(a) * 30, H * 0.70 + Math.sin(a) * r, 20, 9, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function cassettes() {
    var x = W * 0.79, y = H * 0.60;
    var cols = ["#243a52", "#5a2a2a", "#2b4436", "#3a2f52", "#4a3a20"];
    for (var i = 0; i < 9; i++) {
      ctx.fillStyle = cols[i % cols.length];
      var w = 120 - (i % 3) * 6;
      ctx.fillRect(x + (i % 2) * 4, y - i * 15, w, 13);
      ctx.fillStyle = "rgba(240,235,220,.25)";
      ctx.fillRect(x + 10 + (i % 2) * 4, y - i * 15 + 4, w * 0.5, 3);
    }
  }

  function vcrAndScreen(t) {
    // VCR body under the monitor
    ctx.fillStyle = "#171513";
    ctx.fillRect(W * 0.40, H * 0.60, W * 0.30, H * 0.10);
    ctx.fillStyle = "#0e0d0c";
    ctx.fillRect(W * 0.405, H * 0.605, W * 0.29, H * 0.02);
    ctx.fillStyle = "#4ce08a";
    ctx.fillRect(W * 0.66, H * 0.655, 26, 3);
    if (phase === "ready") { ctx.fillStyle = "rgba(76,224,138," + (0.5 + 0.5 * Math.sin(t * 2)) + ")"; }
    ctx.fillRect(W * 0.66, H * 0.655, 26, 3);

    // monitor
    var mx = W * 0.40, my = H * 0.20, mw = W * 0.30, mh = H * 0.40;
    ctx.fillStyle = "#0b0a09";
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 10); ctx.fill();
    ctx.fillStyle = "#161310";
    ctx.beginPath(); ctx.roundRect(mx + 8, my + 8, mw - 16, mh - 16, 6); ctx.fill();

    // screen
    var sx = mx + 22, sy = my + 26, sw = mw - 44, sh = mh - 62;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 4); ctx.clip();
    var sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, "#1b2a6b"); sg.addColorStop(1, "#101a44");
    ctx.fillStyle = sg; ctx.fillRect(sx, sy, sw, sh);

    ctx.fillStyle = "rgba(220,230,255,.92)";
    ctx.font = "600 17px ui-monospace, monospace";
    ctx.fillText(phase === "load" ? "LOADING" : "READY", sx + 14, sy + 30);
    ctx.fillStyle = "rgba(150,175,255,.85)";
    ctx.fillText("CH 00", sx + sw - 62, sy + 30);

    // segmented bar
    var cells = 26, cw = (sw - 28) / cells;
    for (var c = 0; c < cells; c++) {
      var on = phase === "ready" || c / cells < pct / 100;
      ctx.fillStyle = on ? "rgba(150,175,255,.9)" : "rgba(150,175,255,.15)";
      ctx.fillRect(sx + 14 + c * cw, sy + sh * 0.55, cw - 2, 9);
    }
    ctx.fillStyle = "rgba(190,210,255,.9)";
    ctx.font = "600 13px ui-monospace, monospace";
    ctx.fillText(phase === "ready" ? "100%" : Math.round(pct) + "%", sx + sw - 54, sy + sh * 0.55 + 9);

    if (phase === "ready") {
      ctx.fillStyle = "rgba(230,238,255,.95)";
      ctx.font = "700 15px ui-monospace, monospace";
      var words = LINES[line].split(" ");
      var rows = [], buf = "";
      for (var wI = 0; wI < words.length; wI++) {
        var test = buf ? buf + " " + words[wI] : words[wI];
        if (ctx.measureText(test).width > sw - 28) { rows.push(buf); buf = words[wI]; } else buf = test;
      }
      if (buf) rows.push(buf);
      rows.forEach(function (r, i) { ctx.fillText(r, sx + 14, sy + sh * 0.30 + i * 20); });
    }

    // scanlines and bloom
    ctx.fillStyle = "rgba(0,0,0,.16)";
    for (var y = sy; y < sy + sh; y += 3) ctx.fillRect(sx, y, sw, 1);
    var bloom = ctx.createRadialGradient(sx + sw / 2, sy + sh / 2, 10, sx + sw / 2, sy + sh / 2, sw * 0.9);
    bloom.addColorStop(0, "rgba(130,160,255,.12)"); bloom.addColorStop(1, "rgba(130,160,255,0)");
    ctx.fillStyle = bloom; ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();

    // power led
    ctx.fillStyle = phase === "ready" ? "#7ef0a8" : "#3f6f57";
    ctx.beginPath(); ctx.arc(mx + mw - 30, my + mh - 20, 4, 0, Math.PI * 2); ctx.fill();
  }

  function mug() {
    var mx = W * 0.545, my = H * 0.735, mw = 52, mh = 40;
    ctx.strokeStyle = "#dcd6c8"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(mx + mw - 4, my + mh / 2, 13, -1.1, 1.1); ctx.stroke();
    var g = ctx.createLinearGradient(mx, my, mx + mw, my);
    g.addColorStop(0, "#cfc8b8"); g.addColorStop(0.45, "#f0ebdf"); g.addColorStop(1, "#c4bcaa");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 6); ctx.fill();
    ctx.fillStyle = "rgba(92,58,38,.85)";
    ctx.beginPath(); ctx.ellipse(mx + mw / 2, my + 3, mw / 2 - 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,245,230,.10)";
    ctx.fillRect(mx + 6, my + 8, 6, mh - 14);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    wall();
    windowView(t);
    desk();
    lamp();
    plant();
    cassettes();
    vcrAndScreen(t);
    mug();
    var v = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.35, W * 0.5, H * 0.5, H * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function frame(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    if (phase === "load") {
      pct = Math.min(100, pct + dt * 26);
      if (pct >= 100) { phase = "ready"; pct = 100; }
    }
    draw(ts / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduce.matches) {
      phase = "ready"; pct = 100; draw(0.4);
      cv.classList.add("room-static");
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  cv.addEventListener("click", function () {
    if (phase !== "ready") { phase = "ready"; pct = 100; }
    else { line = (line + 1) % LINES.length; }
    draw(performance.now() / 1000);
  });

  reduce.addEventListener && reduce.addEventListener("change", function () {
    cancelAnimationFrame(raf); raf = null; last = 0;
    start();
  });

  start();
})();
</script>
