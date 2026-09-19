---
title: "Contact"
date: 2026-07-24T00:00:00+07:00
draft: false
description: "Get in touch."
---

<div class="quantum-canvas-wrap">
  <canvas id="quantum-canvas"></canvas>
</div>

Let's talk.

<div class="contact-form-wrap">
  <h3>Send a message</h3>
  <p>Drop a note below. Submitting opens a pre-addressed email draft in your local mail client: zero server endpoints, zero trackers.</p>
  <form class="contact-form" id="contact-form" onsubmit="return handleContactSubmit(event)">
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

<script>
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

<script>
(function () {
    var canvas = document.getElementById("quantum-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var wrap = canvas.parentElement;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = wrap.clientWidth * dpr;
        canvas.height = wrap.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = wrap.clientWidth + "px";
        canvas.style.height = wrap.clientHeight + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    var W = function () { return wrap.clientWidth; };
    var H = function () { return wrap.clientHeight; };

    var PARTICLE_COUNT = 18;
    var CONNECT_DIST = 160;
    var particles = [];

    function getAccent() {
        var s = getComputedStyle(document.documentElement);
        return s.getPropertyValue("--accent").trim() || "#6d28d9";
    }

    function hexToRgb(hex) {
        hex = hex.replace("#", "");
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    function Particle() {
        this.x = Math.random() * W();
        this.y = Math.random() * H();
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.r = 2 + Math.random() * 2;
        this.phase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.01 + Math.random() * 0.02;
    }

    Particle.prototype.update = function () {
        this.x += this.vx;
        this.y += this.vy;
        this.phase += this.pulseSpeed;
        if (this.x < 0) this.x = W();
        if (this.x > W()) this.x = 0;
        if (this.y < 0) this.y = H();
        if (this.y > H()) this.y = 0;
    };

    Particle.prototype.draw = function (accent) {
        var pulse = 0.5 + 0.5 * Math.sin(this.phase);
        var alpha = 0.4 + 0.4 * pulse;
        var radius = this.r * (0.8 + 0.4 * pulse);

        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + accent.r + "," + accent.g + "," + accent.b + "," + alpha + ")";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + accent.r + "," + accent.g + "," + accent.b + "," + (alpha * 0.3) + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    for (var i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
    }

    function drawConnections(accent) {
        for (var i = 0; i < particles.length; i++) {
            for (var j = i + 1; j < particles.length; j++) {
                var dx = particles[i].x - particles[j].x;
                var dy = particles[i].y - particles[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONNECT_DIST) {
                    var alpha = (1 - dist / CONNECT_DIST) * 0.25;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = "rgba(" + accent.r + "," + accent.g + "," + accent.b + "," + alpha + ")";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, W(), H());
        var accent = hexToRgb(getAccent());

        drawConnections(accent);

        for (var i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw(accent);
        }

        if (!reduceMotion) {
            requestAnimationFrame(animate);
        }
    }

    animate();
})();
</script>
