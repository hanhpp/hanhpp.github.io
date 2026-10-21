---
title: "The room"
date: 2026-10-21T08:00:00+07:00
draft: false
description: "A night desk as a real-time 3D scene: a window with rain over a city, a lamp that actually lights the wood, and a CRT whose screen is a canvas texture that boots. Click the screen."
---

The reference site draws its room as a Three.js scene with photographic textures. This is the same
technique with textures generated in code: real geometry, a real light, and a monitor whose screen is a
canvas redrawn every frame. Click the monitor to change the line.

<div class="room-lab">
  <canvas id="room-gl" role="img"
          aria-label="A 3D night desk: rain on a window over a city, a lamp lighting the wood, a stack of cassettes and a CRT that boots."></canvas>
  <p class="room-hint">click the screen &middot; move the pointer to look &middot; motion respects your reduced-motion setting</p>
</div>

<style>
.room-lab { width: min(1180px, 94vw); margin: 1.6em 0 0;
  position: relative; left: 50%; transform: translateX(-50%); }
.room-lab canvas { display: block; width: 100%; height: auto; border-radius: 6px;
  background: #0a0908; box-shadow: 0 18px 40px rgba(0,0,0,.35); cursor: pointer; }
.room-hint { font-family: var(--font-display, sans-serif); font-size: 11px; letter-spacing: .07em;
  text-transform: uppercase; color: var(--secondary, #6a675c); margin-top: 10px; text-align: right; }
</style>

<script type="module">
import * as THREE from "/js/three.module.min.js";

const canvas = document.getElementById("room-gl");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const LINES = [
  "ALWAYS A MORE BEAUTIFUL ANSWER",
  "ALWAYS A MORE OBVIOUS ONE",
  "WE SIMPLY HAD THE WRONG PERSPECTIVE",
];

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0908);
scene.fog = new THREE.Fog(0x0a0908, 6, 14);

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 60);

// ------------------------------------------------------------- the window
// A canvas texture: sky, skyline, rain. Redrawn each frame so the rain moves.
const cityCanvas = document.createElement("canvas");
cityCanvas.width = 640; cityCanvas.height = 400;
const cityCtx = cityCanvas.getContext("2d");
const cityTex = new THREE.CanvasTexture(cityCanvas);
cityTex.colorSpace = THREE.SRGBColorSpace;

const drops = Array.from({ length: 120 }, () => ({
  x: Math.random(), y: Math.random(), len: 0.02 + Math.random() * 0.05, sp: 0.3 + Math.random() * 0.6,
}));
const towers = Array.from({ length: 26 }, (_, i) => ({
  x: i / 26, w: 0.02 + Math.random() * 0.02, h: 0.1 + Math.random() * 0.3, lit: 0.2 + Math.random() * 0.8,
}));

function drawCity(t) {
  const w = cityCanvas.width, h = cityCanvas.height, g = cityCtx;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0b1526"); sky.addColorStop(0.6, "#16233a"); sky.addColorStop(1, "#2a3644");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);

  const baseY = h * 0.86;
  for (const b of towers) {
    const bx = b.x * w, bw = b.w * w, bh = b.h * h;
    g.fillStyle = "#080c12"; g.fillRect(bx, baseY - bh, bw, bh);
    g.fillStyle = `rgba(255,214,150,${0.08 + b.lit * 0.3})`;
    for (let y = baseY - bh + 6; y < baseY - 4; y += 10)
      for (let x = bx + 3; x < bx + bw - 4; x += 8)
        if ((x + y) % 7 < 3) g.fillRect(x, y, 2, 3);
  }
  g.fillStyle = "rgba(255,236,190,.85)";
  g.font = "700 22px ui-monospace, monospace";
  g.fillText("METRO", w * 0.63, baseY - h * 0.13);
  g.fillStyle = "rgba(255,236,190,.08)";
  g.fillRect(w * 0.61, baseY - h * 0.10, w * 0.18, h * 0.10);

  g.strokeStyle = "rgba(190,215,255,.30)"; g.lineWidth = 1;
  for (const d of drops) {
    const y = (d.y + t * d.sp) % 1;
    const x = d.x * w;
    g.beginPath(); g.moveTo(x, y * h); g.lineTo(x + 1.5, (y + d.len) * h); g.stroke();
  }
  cityTex.needsUpdate = true;
}

// ------------------------------------------------------------------ screen
// The monitor's screen is its own canvas, uploaded as a texture each frame.
const screenCanvas = document.createElement("canvas");
screenCanvas.width = 512; screenCanvas.height = 384;
const sx = screenCanvas.getContext("2d");
const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;

let pct = 0, phase = "load", line = 0;

function drawScreen() {
  const w = screenCanvas.width, h = screenCanvas.height, g = sx;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1d2f7a"); bg.addColorStop(1, "#0f1a45");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);

  g.fillStyle = "rgba(222,232,255,.95)";
  g.font = "600 22px ui-monospace, monospace";
  g.fillText(phase === "load" ? "LOADING" : "READY", 24, 44);
  g.fillText("CH 00", w - 96, 44);

  const cells = 26, cw = (w - 48) / cells;
  for (let c = 0; c < cells; c++) {
    const on = phase === "ready" || c / cells < pct / 100;
    g.fillStyle = on ? "rgba(150,175,255,.92)" : "rgba(150,175,255,.16)";
    g.fillRect(24 + c * cw, h * 0.58, cw - 3, 12);
  }
  g.fillStyle = "rgba(200,215,255,.9)";
  g.font = "600 16px ui-monospace, monospace";
  g.fillText(phase === "ready" ? "100%" : Math.round(pct) + "%", w - 86, h * 0.58 + 12);

  if (phase === "ready") {
    const words = LINES[line].split(" ");
    const rows = []; let buf = "";
    g.font = "700 20px ui-monospace, monospace";
    for (const word of words) {
      const test = buf ? buf + " " + word : word;
      if (g.measureText(test).width > w - 52) { rows.push(buf); buf = word; } else buf = test;
    }
    if (buf) rows.push(buf);
    g.fillStyle = "rgba(232,240,255,.96)";
    rows.forEach((r, i) => g.fillText(r, 24, 130 + i * 26));
  }

  g.fillStyle = "rgba(0,0,0,.18)";
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);

  screenTex.needsUpdate = true;
}

// ------------------------------------------------------------------- room
const matWall = new THREE.MeshStandardMaterial({ color: 0x4a3529, roughness: 0.95 });
const matWood = new THREE.MeshStandardMaterial({ color: 0x6b472e, roughness: 0.55, metalness: 0.05 });

const room = new THREE.Group();
scene.add(room);

// walls and floor
const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), matWall);
back.position.set(0, 1.7, -3.2); room.add(back);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = 0; room.add(floor);

// desk
const desk = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.1, 1.9), matWood);
desk.position.set(0, 0.74, 0.1); room.add(desk);

// window: a lit plane behind a frame
const windowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), new THREE.MeshBasicMaterial({ map: cityTex }));
windowPlane.position.set(-0.9, 1.75, -3.15); room.add(windowPlane);

const frameMat = new THREE.MeshStandardMaterial({ color: 0x120e0b, roughness: 0.8 });
for (const [w, h, x, y] of [[3.7, 0.09, -0.9, 2.83], [3.7, 0.09, -0.9, 0.67], [0.09, 2.2, -2.66, 1.75], [0.09, 2.2, 0.86, 1.75]]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
  bar.position.set(x, y, -3.12); room.add(bar);
}
const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.1), frameMat);
mullion.position.set(-0.9, 1.75, -3.12); room.add(mullion);

// monitor, standing on the VCR
const monitor = new THREE.Group();
monitor.position.set(0.1, 1.12, -0.35);
room.add(monitor);
const shell = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.82, 0.62),
  new THREE.MeshStandardMaterial({ color: 0x121110, roughness: 0.55 }));
monitor.add(shell);
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.64),
  new THREE.MeshBasicMaterial({ map: screenTex }));
screenMesh.position.set(0, 0.02, 0.315);
monitor.add(screenMesh);
// the screen's own spill light
const screenLight = new THREE.PointLight(0x7d97ff, 3.2, 5, 2);
screenLight.position.set(0.1, 1.2, 0.25);
room.add(screenLight);

// VCR
const vcr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.17, 0.46),
  new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 0.7 }));
vcr.position.set(0.1, 0.88, -0.2); room.add(vcr);
const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01),
  new THREE.MeshBasicMaterial({ color: 0x4ce08a }));
led.position.set(0.55, 0.90, 0.03); room.add(led);

// lamp, with the light it actually casts
const lamp = new THREE.Group();
lamp.position.set(-2.05, 0.79, 0.30);
room.add(lamp);
lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x1b1512 })));
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12), new THREE.MeshStandardMaterial({ color: 0x2a211b, metalness: 0.4, roughness: 0.5 }));
pole.position.y = 0.31; lamp.add(pole);
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 24, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xc4703f, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x3a1608, emissiveIntensity: 0.25 }));
shade.position.y = 0.68; shade.rotation.x = Math.PI; lamp.add(shade);
const bulb = new THREE.PointLight(0xffbe7d, 26, 9, 2);
bulb.position.set(0, 0.62, 0); lamp.add(bulb);

// plant
const plant = new THREE.Group();
plant.position.set(-2.65, 0.79, 0.10);
room.add(plant);
plant.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.26, 20),
  new THREE.MeshStandardMaterial({ color: 0x8d5a3c, roughness: 0.9 })));
for (let i = 0; i < 9; i++) {
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6),
    new THREE.MeshStandardMaterial({ color: 0x24402b, roughness: 0.85 }));
  const a = (i / 9) * Math.PI * 2;
  leaf.position.set(Math.cos(a) * 0.11, 0.28 + (i % 3) * 0.06, Math.sin(a) * 0.11);
  leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  plant.add(leaf);
}

// cassettes
const tapeCols = [0x243a52, 0x5a2a2a, 0x2b4436, 0x3a2f52, 0x4a3a20];
for (let i = 0; i < 9; i++) {
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.26),
    new THREE.MeshStandardMaterial({ color: tapeCols[i % tapeCols.length], roughness: 0.7 }));
  tape.position.set(1.62 + (i % 2) * 0.02, 0.81 + i * 0.046, 0.05);
  room.add(tape);
}

// mug
const mug = new THREE.Group();
mug.position.set(1.05, 0.79, 0.62);
room.add(mug);
const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.13, 20),
  new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.6 }));
cup.position.y = 0.065; mug.add(cup);
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20),
  new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.6 }));
handle.position.set(0.085, 0.065, 0); handle.rotation.y = Math.PI / 2; mug.add(handle);

// ---------------------------------------------------------------- lighting
scene.add(new THREE.HemisphereLight(0x4a5f85, 0x2a1c14, 1.1));
const fill = new THREE.PointLight(0xffd9b0, 5, 14, 2);
fill.position.set(1.2, 2.6, 3.4);
scene.add(fill);

const windowLight = new THREE.PointLight(0x9dbcff, 14, 12, 2);
windowLight.position.set(-0.9, 1.9, -2.6);
scene.add(windowLight);

// ------------------------------------------------------------------ camera
const START = { z: 6.0, fov: 52 }, END = { z: 4.75, fov: 48 };
camera.position.set(0, 1.36, START.z);
camera.lookAt(0, 1.12, -0.5);

// subtle pointer parallax
let px = 0, py = 0;
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  px = ((e.clientX - r.left) / r.width - 0.5) * 0.28;
  py = ((e.clientY - r.top) / r.height - 0.5) * 0.16;
});

// --------------------------------------------------------------- animation
const clock = new THREE.Clock();
let entry = 0;

function resize() {
  const w = canvas.clientWidth || 960;
  const h = Math.round(w * 9 / 16);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (phase === "load") {
    pct = Math.min(100, pct + dt * 30);
    if (pct >= 100) { phase = "ready"; }
    drawScreen();
  }
  drawCity(t);

  if (entry < 1) {
    entry = Math.min(1, entry + dt * 0.45);
    const e = 1 - Math.pow(1 - entry, 3);
    camera.position.z = START.z + (END.z - START.z) * e;
    camera.fov = START.fov + (END.fov - START.fov) * e;
    camera.updateProjectionMatrix();
  }
  camera.position.x += (px - camera.position.x) * 0.06;
  camera.position.y += (1.36 + py - camera.position.y) * 0.06;
  camera.lookAt(0, 1.12, -0.5);

  led.material.color.setHSL(0.38, 0.7, phase === "ready" ? 0.55 + 0.1 * Math.sin(t * 3) : 0.3);
  screenLight.intensity = phase === "ready" ? 3.2 : 3.2 * (0.7 + 0.3 * Math.sin(t * 12));

  renderer.render(scene, camera);
  if (!reduce.matches) requestAnimationFrame(tick);
}

canvas.addEventListener("click", () => {
  if (phase !== "ready") { phase = "ready"; pct = 100; }
  else line = (line + 1) % LINES.length;
  drawScreen();
  if (reduce.matches) renderer.render(scene, camera);
});

function start() {
  resize();
  if (reduce.matches) {
    phase = "ready"; pct = 100; entry = 1;
    camera.position.z = END.z; camera.fov = END.fov; camera.updateProjectionMatrix();
    drawScreen(); drawCity(0.4);
    renderer.render(scene, camera);
    return;
  }
  clock.start();
  requestAnimationFrame(tick);
}

start();
</script>
