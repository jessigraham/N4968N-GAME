/* The island at dusk, drawn in code, shared by the whole game (G.Scene):
   the title screen and story use the full scene; the cockpit windshield uses it as its backdrop.
   Parallax hills and palms, rolling fog, fireflies, a distant plane on the strip, lightning, vignette and film grain. */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const canvas = document.getElementById('introBg');
const introCtx = canvas.getContext('2d');
const dpr = Math.min(1.5, window.devicePixelRatio || 1);
// the painter draws into whatever context and size it's given (title canvas or cockpit windshield)
let ctx = introCtx, px = dpr;
let scene = 'jungle';
let running = false, t0 = performance.now(), last = 0, W = 0, H = 0, flash = 0, nextFlash = 6, CW = 0, CH = 0;

// film grain: one small noise tile, shifted every frame
const grain = document.createElement('canvas');
grain.width = grain.height = 160;
{
  const g = grain.getContext('2d'), d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
}
const flies = Array.from({ length: 46 }, () => ({ x: Math.random(), y: 0.45 + Math.random() * 0.5, ph: Math.random() * TAU, sp: 0.2 + Math.random() * 0.6, r: 0.6 + Math.random() * 1.6 }));
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.35, ph: Math.random() * TAU, r: Math.random() * 1.2 + 0.3 }));
const fogs = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: 0.58 + Math.random() * 0.22, w: 0.35 + Math.random() * 0.4, sp: 0.004 + Math.random() * 0.008, a: 0.05 + Math.random() * 0.06, i }));

function fit() {
  const r = canvas.getBoundingClientRect();
  CW = Math.max(1, Math.round(r.width * dpr)); CH = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== CW || canvas.height !== CH) { canvas.width = CW; canvas.height = CH; }
}

// a ridge line that scrolls forever: height as a sum of slow waves
function ridge(y0, amp, freq, off, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 6 * px) {
    const u = x / W * freq + off;
    ctx.lineTo(x, y0 - amp * (0.55 * Math.sin(u) + 0.3 * Math.sin(u * 2.3 + 1.7) + 0.15 * Math.sin(u * 5.1 + 0.4)));
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function palm(x, y, h, lean, sway, color) {
  const tx = x + lean * h * 0.3 + sway * h * 0.04, ty = y - h;
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineCap = 'round';
  // trunk, thicker at the base
  ctx.beginPath();
  ctx.moveTo(x - h * 0.03, y); ctx.quadraticCurveTo(x + lean * h * 0.05 - h * 0.012, y - h * 0.6, tx - h * 0.012, ty);
  ctx.lineTo(tx + h * 0.012, ty); ctx.quadraticCurveTo(x + lean * h * 0.05 + h * 0.012, y - h * 0.6, x + h * 0.03, y);
  ctx.fill();
  // fronds: arching midribs with feathery leaflets
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + sway * 0.12 + 0.2;
    const len = h * (0.42 + 0.08 * Math.sin(i * 2.1));
    const dirx = Math.cos(a), up = -Math.abs(Math.sin(a)) * 0.35 - 0.1;
    const cx = tx + dirx * len * 0.55, cy = ty + up * len;
    const ex = tx + dirx * len, ey = ty + len * (0.45 + 0.15 * Math.sin(i));
    ctx.lineWidth = Math.max(1, h * 0.012);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    ctx.lineWidth = Math.max(1, h * 0.007);
    ctx.beginPath();
    for (let k = 1; k < 14; k++) {
      const q = k / 14, iq = 1 - q;
      const px = iq * iq * tx + 2 * iq * q * cx + q * q * ex, py = iq * iq * ty + 2 * iq * q * cy + q * q * ey;
      const leaf = h * 0.1 * Math.sin(q * Math.PI) + h * 0.02;
      for (const sd of [-1, 1]) { ctx.moveTo(px, py); ctx.lineTo(px + sd * leaf * 0.35 + dirx * leaf * 0.5, py + leaf * 0.9); }
    }
    ctx.stroke();
  }
}

// a small high-wing plane, side view, parked on the strip with a blinking beacon
function plane(x, y, s, t) {
  ctx.fillStyle = '#120e14';
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, y - 6 * s); ctx.lineTo(x + 22 * s, y - 8 * s); ctx.lineTo(x + 30 * s, y - 4 * s);
  ctx.lineTo(x + 28 * s, y); ctx.lineTo(x - 26 * s, y - 1 * s); ctx.closePath(); ctx.fill();
  ctx.fillRect(x - 10 * s, y - 14 * s, 26 * s, 3 * s);                      // high wing
  ctx.fillRect(x - 2 * s, y - 12 * s, 2 * s, 6 * s);                         // strut
  ctx.beginPath(); ctx.moveTo(x - 30 * s, y - 6 * s); ctx.lineTo(x - 34 * s, y - 17 * s); ctx.lineTo(x - 26 * s, y - 6 * s); ctx.fill(); // tail
  ctx.fillRect(x + 30 * s, y - 9 * s, 1.2 * s, 10 * s);                      // propeller
  for (const wx of [x - 4 * s, x + 18 * s]) { ctx.beginPath(); ctx.arc(wx, y + 1.5 * s, 2.2 * s, 0, TAU); ctx.fill(); }
  if ((t * 1.1) % 1 < 0.15) {
    const g = ctx.createRadialGradient(x - 33 * s, y - 17 * s, 0, x - 33 * s, y - 17 * s, 9 * s);
    g.addColorStop(0, 'rgba(255,60,50,0.9)'); g.addColorStop(1, 'rgba(255,60,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x - 33 * s, y - 17 * s, 9 * s, 0, TAU); ctx.fill();
  }
}

// Paint the island into context c, size w x h, at time t.
// o.backdrop: sky, volcano, far hills, distant palms, fog and fireflies only (the cockpit adds its own ground).
// o.flash: lightning brightness. o.parked: the little plane on the strip. o.px: pixel size for fine details.
function paint(c, w, h, t, o = {}) {
  ctx = c; W = w; H = h; px = o.px || dpr;
  const fl = o.flash || 0;
  const hy = H * 0.62, u = Math.min(W, H * 1.6) / 1000;   // horizon and a size unit
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#0b0a18'); sky.addColorStop(0.45, '#2a1733'); sky.addColorStop(0.8, '#7b3846'); sky.addColorStop(1, '#e98b4e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 2);
  if (fl) { ctx.fillStyle = `rgba(200,190,255,${fl * 0.35})`; ctx.fillRect(0, 0, W, hy); }
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,240,220,${0.35 + 0.35 * Math.sin(t * 1.5 + s.ph)})`;
    ctx.fillRect(s.x * W, s.y * H, s.r * px, s.r * px);
  }
  // setting sun glow
  const sx = W * 0.68, sun = ctx.createRadialGradient(sx, hy, 0, sx, hy, H * 0.5);
  sun.addColorStop(0, 'rgba(255,190,110,0.85)'); sun.addColorStop(0.12, 'rgba(255,150,90,0.35)'); sun.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

  // far volcano and hills, then the jungle
  ctx.fillStyle = '#3a2338';
  ctx.beginPath(); ctx.moveTo(W * 0.05, hy); ctx.lineTo(W * 0.22, hy - 170 * u); ctx.lineTo(W * 0.27, hy - 164 * u); ctx.lineTo(W * 0.5, hy); ctx.fill();
  // a thin plume of smoke from the volcano
  for (let i = 0; i < 6; i++) {
    const k = ((t * 0.05 + i / 6) % 1), px = W * 0.245 + Math.sin(t * 0.3 + i) * 8 * u + k * 60 * u, py = hy - 170 * u - k * 150 * u, pr = (12 + k * 50) * u;
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, `rgba(150,120,140,${0.16 * (1 - k)})`); g.addColorStop(1, 'rgba(150,120,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
  }
  ridge(hy + 4 * u, 34 * u, 5, t * 0.012, '#2c1d2f');
  ridge(hy + 22 * u, 28 * u, 8, 2 + t * 0.025, '#1c1e22');

  if (o.backdrop) {
    // a line of distant palms along the far ridge, then fog and fireflies
    for (let i = 0; i < 14; i++) {
      const x = ((i / 14 + t * 0.002) % 1.05 - 0.02) * W;
      palm(x, hy + 14 * u, (38 + (i * 29) % 26) * u, i % 2 ? 0.3 : -0.3, Math.sin(t * 0.8 + i), '#1a1d1f');
    }
    fogAndFlies(t, 0.25);
    return;
  }

  // the dirt strip and the plane waiting on it
  ctx.fillStyle = '#5b4434';
  ctx.beginPath(); ctx.moveTo(W * 0.3, hy + 40 * u); ctx.lineTo(W * 0.95, hy + 34 * u); ctx.lineTo(W * 1.05, hy + 52 * u); ctx.lineTo(W * 0.22, hy + 60 * u); ctx.fill();
  if (o.parked !== false) plane(W * 0.86, hy + 41 * u, 1.4 * u, t);

  fogAndFlies(t, 0);

  // mid jungle with palms drifting slowly
  ridge(hy + 70 * u, 40 * u, 6, 4 + t * 0.04, '#11201a');
  for (let i = 0; i < 9; i++) {
    const x = ((i / 9 + t * 0.004) % 1.1 - 0.05) * W;
    palm(x, hy + 80 * u, (85 + (i * 47) % 60) * u, i % 2 ? 0.3 : -0.35, Math.sin(t * 0.8 + i), '#0e1a14');
  }
  ridge(H * 0.9, 50 * u, 4, 1 + t * 0.07, '#08100c');
  flyLayer(t, 0);

  // big fronds framing the corners
  for (const [x, y, h2, lean, k] of [[-0.06, 1.06, 400, 0.8, 0], [1.06, 1.08, 430, -0.8, 2]]) {
    palm(x * W, y * H, h2 * u * (H > W ? 0.7 : 1), lean, Math.sin(t * 0.6 + k) * 0.8, '#040806');
  }
}

// rolling fog banks (and, for the backdrop, the fireflies too). `lift` moves them up toward the horizon.
function fogAndFlies(t, lift) {
  for (const f of fogs) {
    const fx = ((f.x + t * f.sp) % 1.6 - 0.3) * W, fy = f.y * H, fw = f.w * W;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.5);
    g.addColorStop(0, `rgba(235,175,165,${f.a})`); g.addColorStop(1, 'rgba(235,175,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy - lift * (fy - H * 0.6), fw * 0.5, fw * 0.12, 0, 0, TAU); ctx.fill();
  }
  if (lift) flyLayer(t, lift);
}

// fireflies and mosquitoes catching the last light
function flyLayer(t, lift) {
  for (const f of flies) {
    const x = ((f.x + Math.sin(t * 0.1 * f.sp + f.ph) * 0.05 + t * 0.003 * f.sp) % 1) * W;
    const y = (f.y + Math.sin(t * f.sp + f.ph) * 0.02 - lift * 0.3) * H;
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * f.sp + f.ph));
    const r = f.r * px * 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(230,255,150,${a})`); g.addColorStop(1, 'rgba(230,255,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  }
}

// vignette and film grain over a region
function overlay(c, w, h, strength = 0.78) {
  const v = c.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${strength})`);
  c.fillStyle = v; c.fillRect(0, 0, w, h);
  if (G.Quality && G.Quality.lite) return;   // film grain is the first thing to go on a slow computer
  c.save();
  c.globalAlpha = 0.07; c.globalCompositeOperation = 'overlay';
  c.fillStyle = c.createPattern(grain, 'repeat');
  c.translate(Math.random() * 160, Math.random() * 160);
  c.fillRect(-160, -160, w + 320, h + 320);
  c.restore();
}

// the title screen: the full scene, plus the story's places, lightning and thunder
function draw(now) {
  last = now;
  fit();
  const t = (now - t0) / 1000;
  if (t > nextFlash) { flash = 1; nextFlash = t + 9 + Math.random() * 12; if (G.Sfx) G.Sfx.thunder(); }
  flash = Math.max(0, flash - 0.03);
  const fl = flash > 0.6 || (flash > 0.3 && flash < 0.4) ? flash * 0.5 : 0;
  paint(introCtx, CW, CH, t, { flash: fl, px: dpr });
  ctx = introCtx; W = CW; H = CH; px = dpr;
  const hy = H * 0.62, u = Math.min(W, H * 1.6) / 1000;

  // scene dressing for the story: inside the lab tent, or at the river camp
  if (scene === 'river') {
    const ry = hy + 62 * u, rh = 46 * u;
    const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rg.addColorStop(0, '#d98a5a'); rg.addColorStop(0.5, '#6b3946'); rg.addColorStop(1, '#1d1622');
    ctx.fillStyle = rg; ctx.fillRect(0, ry, W, rh);
    ctx.strokeStyle = 'rgba(255,210,160,0.35)'; ctx.lineWidth = 1.5 * px;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 0.137 + t * 0.03 * (1 + (i % 3))) % 1.1 - 0.05) * W, y = ry + ((i * 7) % 10) / 10 * rh;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (20 + (i % 4) * 12) * u, y); ctx.stroke();
    }
    const fx = W * 0.16, fy = H * 0.9;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 260 * u);
    fg.addColorStop(0, `rgba(255,150,60,${0.45 + 0.1 * Math.sin(t * 13)})`); fg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const k = (t * 0.35 + i / 18) % 1;
      ctx.fillStyle = `rgba(255,${170 + i * 4},90,${1 - k})`;
      ctx.fillRect(fx + Math.sin(i * 3 + t * 2) * 30 * u * k, fy - k * 260 * u, 2.5 * px, 2.5 * px);
    }
  } else if (scene === 'lab') {
    // tent canvas walls with the flap open onto the jungle
    ctx.fillStyle = '#16110d';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(W * 0.5, H * 0.12); ctx.lineTo(W * 0.24, H * 0.98); ctx.lineTo(W * 0.76, H * 0.98); ctx.closePath();
    ctx.fill('evenodd');
    const lx = W * 0.2, ly = H * 0.28, flick = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5.3);
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 520 * u);
    lg.addColorStop(0, `rgba(255,190,110,${0.55 * flick})`); lg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly - 20 * u); ctx.stroke();
    ctx.fillStyle = `rgba(255,214,150,${flick})`; ctx.beginPath(); ctx.ellipse(lx, ly, 12 * u, 18 * u, 0, 0, TAU); ctx.fill();
    // lab bench with flasks and a potted plant
    ctx.fillStyle = '#0b0806'; ctx.fillRect(0, H * 0.8, W, H * 0.2);
    for (const [fx, fh] of [[0.08, 70], [0.12, 50], [0.86, 60], [0.9, 85]]) {
      ctx.beginPath(); ctx.moveTo(W * fx - 8 * u, H * 0.8); ctx.lineTo(W * fx - 26 * u, H * 0.8 - 8 * u); ctx.lineTo(W * fx - 8 * u, H * 0.8 - fh * u);
      ctx.lineTo(W * fx + 8 * u, H * 0.8 - fh * u); ctx.lineTo(W * fx + 26 * u, H * 0.8 - 8 * u); ctx.lineTo(W * fx + 8 * u, H * 0.8); ctx.fill();
    }
    ctx.fillStyle = 'rgba(140,230,170,0.25)';
    ctx.beginPath(); ctx.ellipse(W * 0.12, H * 0.8 - 20 * u, 16 * u, 12 * u, 0, 0, TAU); ctx.fill();
  }
  if (scene === 'story') { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, 0, W, H); }

  overlay(ctx, W, H);
}

let looping = false;
function loop(now) {
  if (!running) { looping = false; return; }
  draw(now);
  requestAnimationFrame(loop);
}

G.Intro = {
  start() { running = true; if (!looping) { looping = true; requestAnimationFrame(loop); } },
  stop() { running = false; },
  setScene(name) { scene = name; },
};
G.Scene = {
  paint,
  overlay,
  palm(c, x, y, h, lean, sway, color) { const keep = ctx; ctx = c; palm(x, y, h, lean, sway, color); ctx = keep; },
};
// some browsers pause animation frames in hidden or embedded panes; nudge it along
setInterval(() => { if (running && performance.now() - last > 300) draw(performance.now()); }, 120);
})();
