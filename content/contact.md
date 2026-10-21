---
title: "Contact"
date: 2026-07-24T00:00:00+07:00
draft: false
description: "Get in touch."
---

<div class="universe-wrap" aria-hidden="true">
  <canvas id="universe-canvas" class="universe-canvas"></canvas>
</div>

Let's talk.

<div class="contact-form-wrap">
  <h3>Send a message</h3>
  <p>Open for contract, consulting, and engineering work. Drop a note below or reach out directly at <a href="mailto:hanhphamit@gmail.com">hanhphamit@gmail.com</a>. Submitting opens a pre-addressed email draft in your local mail client: zero server endpoints, zero trackers.</p>
  <form class="contact-form" id="contact-form">
    <div class="contact-field">
      <label for="contact-name">Your Name</label>
      <input type="text" id="contact-name" name="name" placeholder="Optional" maxlength="80" autocomplete="name">
    </div>
    <div class="contact-field">
      <label for="contact-subject">Subject</label>
      <input type="text" id="contact-subject" name="subject" placeholder="What is this about?" required maxlength="120">
    </div>
    <div class="contact-field">
      <label for="contact-message">Message</label>
      <textarea id="contact-message" name="message" placeholder="Write your message..." required maxlength="2500"></textarea>
    </div>
    <button type="submit" class="contact-submit-btn">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      Compose Email
    </button>
    <div class="contact-status info" id="contact-status">
      Draft prepared. If your email application did not open automatically, <a id="contact-fallback-link" href="#">click here to send directly</a>.
    </div>
  </form>
</div>

<script> <!-- security-lint:allow raw-html -->
function handleContactSubmit(e) {
    e.preventDefault();
    var name = document.getElementById("contact-name").value.trim();
    var subject = document.getElementById("contact-subject").value.trim();
    var message = document.getElementById("contact-message").value.trim();

    if (!subject || !message) return false;

    var body = message;
    if (name) {
        body = "From: " + name + "\n\n" + message;
    }

    var mailto = "mailto:hanhphamit@gmail.com"
        + "?subject=" + encodeURIComponent(subject)
        + "&body=" + encodeURIComponent(body);

    var statusBox = document.getElementById("contact-status");
    var fallbackLink = document.getElementById("contact-fallback-link");
    if (statusBox && fallbackLink) {
        fallbackLink.href = mailto;
        statusBox.classList.add("is-visible");
    }

    window.location.href = mailto;
    return false;
}

// Wired here rather than inline on the form: an onsubmit attribute is a handler the browser has to
// evaluate, which a content security policy blocks, and it is the pattern the lint refuses.
document.getElementById("contact-form").addEventListener("submit", handleContactSubmit);
</script>

### Or connect directly:
<ul class="contact-links">
  <li>
    <span class="label">linkedin</span>
    <a href="https://www.linkedin.com/in/hanhphamphuoc/" target="_blank" rel="noopener">hanhphamphuoc</a>
  </li>
  <li>
    <span class="label">email</span>
    <a href="mailto:hanhphamit@gmail.com">hanhphamit@gmail.com</a>
  </li>
  <li>
    <span class="label">github</span>
    <a href="https://github.com/hanhpp" target="_blank" rel="noopener">hanhpp</a>
  </li>
</ul>

<script> <!-- security-lint:allow raw-html -->
/* A sky for the whole viewport rather than a box in the page.
 *
 * Three depth layers of stars drift through a slowly turning field, a tilted dense band carries the
 * eye, and four soft clouds of gas sit behind them. Star colours and the gas are derived from the
 * site's own --accent, so the sky cannot drift away from the palette the rest of the page uses.
 *
 * The field is a square of side hypot(width, height) centred on the viewport, which is the smallest
 * square that still covers every rotation about that centre. Stars are therefore seeded once and the
 * sky can turn forever without a corner going empty.
 */
(function () {
    var canvas = document.getElementById("universe-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var root = document.documentElement;

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

    var W = 0, H = 0, S = 0, DPR = 1;
    var stars = [], clouds = [], sprites = [], palette = null;
    var elapsed = 0, lastFrame = 0, rafId = null;
    var pointer = { tx: 0, ty: 0, x: 0, y: 0 };
    var streak = { wait: 4, t: 0, dur: 1, active: false, x0: 0, y0: 0, dx: 0, dy: 0 };

    /* A star's size, brightness and parallax depth are its layer's. Far stars are many, small and
     * faint; near ones are few, large and bright, and move most when the pointer moves. */
    var LAYERS = [
        { share: 0.52, rMin: 0.45, rMax: 0.9, aMin: 0.16, aMax: 0.42, depth: 0.30 },
        { share: 0.32, rMin: 0.75, rMax: 1.4, aMin: 0.30, aMax: 0.68, depth: 0.62 },
        { share: 0.16, rMin: 1.20, rMax: 2.2, aMin: 0.55, aMax: 1.00, depth: 1.00 }
    ];

    var SPRITE_SIZE = [24, 32, 64];
    var SPRITE_STOPS = [
        [[0, 0.90], [0.30, 0.42], [0.62, 0.12], [1, 0]],
        [[0, 1.00], [0.16, 0.66], [0.42, 0.18], [1, 0]],
        [[0, 1.00], [0.08, 0.90], [0.22, 0.30], [0.50, 0.07], [1, 0]]
    ];

    var BAND = -0.42;          /* tilt of the dense band, in radians */
    var TURN = 0.0042;         /* radians per second: one turn in about 25 minutes */

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

    function themeName() {
        var attr = root.getAttribute("data-theme");
        if (attr === "dark" || attr === "light") return attr;
        return darkQuery.matches ? "dark" : "light";
    }

    /* The accent the rest of the site already uses. */
    function accentRgb() {
        var probe = document.createElement("span");
        probe.style.cssText = "position:absolute;left:-9999px;color:var(--accent)";
        document.body.appendChild(probe);
        var value = getComputedStyle(probe).color;
        probe.remove();
        var parts = value.indexOf("rgb") === 0 ? value.match(/[\d.]+/g) : null;
        if (!parts || parts.length < 3) return [109, 40, 217];
        return [+parts[0], +parts[1], +parts[2]];
    }

    function toHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var l = (max + min) / 2, h = 0, s = 0;
        if (max !== min) {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return [h, s, l];
    }

    function fromHsl(h, s, l) {
        h = (((h % 360) + 360) % 360) / 360;
        function channel(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }
        if (s === 0) {
            var grey = Math.round(l * 255);
            return [grey, grey, grey];
        }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        return [
            Math.round(channel(p, q, h + 1 / 3) * 255),
            Math.round(channel(p, q, h) * 255),
            Math.round(channel(p, q, h - 1 / 3) * 255)
        ];
    }

    function buildPalette() {
        var dark = themeName() === "dark";
        var accent = accentRgb();
        var hsl = toHsl(accent[0], accent[1], accent[2]);
        var hue = hsl[0], sat = hsl[1];

        /* Stars carry a little colour temperature: the accent's hue, a colder neighbour and a warmer
         * one. On the light theme they are deep and dim, on the dark theme bright and pale. */
        var starColors = [hue, hue - 44, hue + 56].map(function (h) {
            return fromHsl(h, clamp(sat * (dark ? 0.55 : 0.85), 0.28, 0.9), dark ? 0.88 : 0.40);
        });

        /* Gas: the accent plus three neighbours, low in saturation so it reads as cloud. */
        var cloudColors = [hue, hue + 30, hue - 36, hue + 12].map(function (h, i) {
            return {
                rgb: fromHsl(h, dark ? clamp(sat * 0.9, 0.40, 0.78) : clamp(sat * 0.72, 0.30, 0.62), dark ? 0.40 : 0.66),
                alpha: (dark ? 0.30 : 0.09) * (i === 0 ? 1 : 0.78)
            };
        });

        return {
            dark: dark,
            starColors: starColors,
            starAlpha: dark ? 1 : 0.65,
            blend: dark ? "lighter" : "source-over",
            streak: fromHsl(hue, clamp(sat, 0.45, 0.9), dark ? 0.82 : 0.42),
            cloudColors: cloudColors
        };
    }

    function makeSprite(size, rgb, stops) {
        var sprite = document.createElement("canvas");
        sprite.width = sprite.height = size;
        var g = sprite.getContext("2d");
        var mid = size / 2;
        var grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
        for (var i = 0; i < stops.length; i++) {
            grad.addColorStop(stops[i][0], "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + stops[i][1] + ")");
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return sprite;
    }

    function buildSprites() {
        return LAYERS.map(function (layer, li) {
            return palette.starColors.map(function (rgb) {
                return makeSprite(SPRITE_SIZE[li], rgb, SPRITE_STOPS[li]);
            });
        });
    }

    function buildCloudSprite(rgb) {
        return makeSprite(256, rgb, [[0, 0.50], [0.45, 0.20], [1, 0]]);
    }

    function seedStars() {
        var count = clamp(Math.round(S * S / 6200), 240, 1100);
        var ca = Math.cos(BAND), sa = Math.sin(BAND);
        stars = [];
        for (var li = 0; li < LAYERS.length; li++) {
            var layer = LAYERS[li];
            var n = Math.round(count * layer.share);
            for (var i = 0; i < n; i++) {
                var x, y;
                if (Math.random() < 0.44) {
                    /* inside the band: spread along it, tight across it */
                    var u = rand(-0.48, 0.48) * S;
                    var v = (Math.random() + Math.random() + Math.random() - 1.5) * 0.06 * S;
                    x = W / 2 + u * ca - v * sa;
                    y = H / 2 + u * sa + v * ca;
                } else {
                    x = W / 2 + rand(-0.5, 0.5) * S;
                    y = H / 2 + rand(-0.5, 0.5) * S;
                }
                var roll = Math.random();
                stars.push({
                    x: x, y: y, layer: li, depth: layer.depth,
                    r: rand(layer.rMin, layer.rMax),
                    a: rand(layer.aMin, layer.aMax),
                    phase: rand(0, Math.PI * 2),
                    speed: rand(0.4, 1.9),
                    colour: roll < 0.62 ? 0 : (roll < 0.85 ? 1 : 2)
                });
            }
        }
    }

    function seedClouds() {
        clouds = [
            { fx: -0.22, fy: -0.16, size: 0.86, sx: 2.6, sy: 0.5, angle: BAND, k: 0, depth: 0.22, breath: 0.06 },
            { fx: 0.30, fy: 0.22, size: 0.62, sx: 1, sy: 1, angle: 0, k: 1, depth: 0.44, breath: 0.09 },
            { fx: -0.36, fy: 0.34, size: 0.50, sx: 1.2, sy: 0.9, angle: 0.6, k: 2, depth: 0.60, breath: 0.11 },
            { fx: 0.12, fy: -0.40, size: 0.44, sx: 1, sy: 1, angle: -0.3, k: 3, depth: 0.34, breath: 0.08 }
        ];
        for (var i = 0; i < clouds.length; i++) {
            clouds[i].sprite = buildCloudSprite(palette.cloudColors[clouds[i].k].rgb);
        }
    }

    function drawClouds(cx, cy, rot) {
        ctx.globalCompositeOperation = "source-over";
        for (var i = 0; i < clouds.length; i++) {
            var cloud = clouds[i];
            var breathe = 1 + cloud.breath * Math.sin(elapsed * 0.12 + i * 1.7);
            var size = cloud.size * S * breathe;
            ctx.save();
            ctx.translate(
                cx + cloud.fx * S + pointer.x * 6 * cloud.depth,
                cy + cloud.fy * S + pointer.y * 6 * cloud.depth
            );
            ctx.rotate(cloud.angle + rot);
            ctx.scale(cloud.sx, cloud.sy);
            ctx.globalAlpha = palette.cloudColors[cloud.k].alpha;
            ctx.drawImage(cloud.sprite, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawStars(cx, cy, ca, sa) {
        ctx.globalCompositeOperation = palette.blend;
        for (var i = 0; i < stars.length; i++) {
            var star = stars[i];
            var dx = star.x - cx, dy = star.y - cy;
            var x = cx + dx * ca - dy * sa + pointer.x * 9 * star.depth;
            var y = cy + dx * sa + dy * ca + pointer.y * 9 * star.depth;
            if (x < -12 || x > W + 12 || y < -12 || y > H + 12) continue;
            var twinkle = 0.62 + 0.38 * Math.sin(elapsed * star.speed + star.phase);
            ctx.globalAlpha = clamp(star.a * twinkle * palette.starAlpha, 0, 1);
            var size = star.r * 8;
            ctx.drawImage(sprites[star.layer][star.colour], x - size / 2, y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    function launchStreak() {
        var fromLeft = Math.random() < 0.5;
        streak.x0 = fromLeft ? rand(-0.1, 0.4) * W : rand(0.6, 1.1) * W;
        streak.y0 = rand(-0.05, 0.45) * H;
        streak.dx = (fromLeft ? 1 : -1) * rand(0.28, 0.45) * W;
        streak.dy = rand(0.16, 0.30) * H;
        streak.dur = rand(0.7, 1.25);
        streak.t = 0;
        streak.active = true;
    }

    function drawStreak(dt) {
        streak.t += dt;
        var p = streak.t / streak.dur;
        if (p >= 1) {
            streak.active = false;
            streak.wait = rand(7, 18);
            return;
        }
        var fade = Math.sin(Math.PI * p);
        var x = streak.x0 + streak.dx * p;
        var y = streak.y0 + streak.dy * p;
        var tailX = x - streak.dx * 0.14;
        var tailY = y - streak.dy * 0.14;
        var rgb = palette.streak;
        var grad = ctx.createLinearGradient(tailX, tailY, x, y);
        grad.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
        grad.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.85 * fade).toFixed(3) + ")");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    function render(dt) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, W, H);

        var rot = elapsed * TURN;
        var ca = Math.cos(rot), sa = Math.sin(rot);
        var cx = W / 2, cy = H / 2;

        drawClouds(cx, cy, rot);
        drawStars(cx, cy, ca, sa);

        if (streak.active && !motionQuery.matches) drawStreak(dt);
    }

    function frame(now) {
        rafId = null;
        var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016;
        lastFrame = now;
        elapsed += dt;

        pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.2);
        pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.2);

        if (!streak.active) {
            streak.wait -= dt;
            if (streak.wait <= 0) launchStreak();
        }

        render(dt);
        if (!motionQuery.matches) rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (rafId) return;
        lastFrame = 0;
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function resize() {
        var w = window.innerWidth, h = window.innerHeight;
        var reseed = !W || Math.abs(w - W) > 2 || Math.abs(h - H) > 140;
        W = w;
        H = h;
        S = Math.ceil(Math.sqrt(w * w + h * h));
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (reseed) seedStars();
    }

    function repaint() {
        palette = buildPalette();
        sprites = buildSprites();
        seedClouds();
        if (motionQuery.matches) render(0);
    }

    palette = buildPalette();
    sprites = buildSprites();
    resize();
    seedClouds();

    if (motionQuery.matches) render(0);
    else start();

    window.addEventListener("resize", resize);

    /* A theme toggle rewrites data-theme on the root, so the sky follows it. */
    new MutationObserver(repaint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    darkQuery.addEventListener("change", function () {
        if (root.getAttribute("data-theme") === "auto") repaint();
    });

    motionQuery.addEventListener("change", function () {
        if (motionQuery.matches) {
            stop();
            streak.active = false;
            render(0);
        } else {
            start();
        }
    });

    /* A hidden tab throttles animation frames, so the loop is stopped rather than left to stutter. */
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop();
        else if (!motionQuery.matches) start();
    });

    window.addEventListener("pointermove", function (e) {
        if (motionQuery.matches) return;
        pointer.tx = (e.clientX / W - 0.5) * 2;
        pointer.ty = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
})();
</script>
