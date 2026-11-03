/* The title screen's living background: a dusk jungle island, drawn in code.
   Parallax hills and palms, rolling fog, fireflies, a distant plane on the strip, lightning, vignette and film grain. */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const canvas = document.getElementById('introBg');
const ctx = canvas.getContext('2d');
const dpr = Math.min(1.5, window.devicePixelRatio || 1);
let running = false, t0 = performance.now(), last = 0, W = 0, H = 0, flash = 0, nextFlash = 6;

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
  W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
}

// a ridge line that scrolls forever: height as a sum of slow waves
function ridge(y0, amp, freq, off, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 6 * dpr) {
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

function draw(now) {
  last = now;
  fit();
  const t = (now - t0) / 1000;
  const hy = H * 0.62, u = Math.min(W, H * 1.6) / 1000;   // horizon and a size unit

  // sky with a lightning flicker now and then
  if (t > nextFlash) { flash = 1; nextFlash = t + 9 + Math.random() * 12; if (G.Sfx) G.Sfx.thunder(); }
  flash = Math.max(0, flash - 0.03);
  const fl = flash > 0.6 || (flash > 0.3 && flash < 0.4) ? flash * 0.5 : 0;
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#0b0a18'); sky.addColorStop(0.45, '#2a1733'); sky.addColorStop(0.8, '#7b3846'); sky.addColorStop(1, '#e98b4e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 2);
  if (fl) { ctx.fillStyle = `rgba(200,190,255,${fl * 0.35})`; ctx.fillRect(0, 0, W, hy); }
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,240,220,${0.35 + 0.35 * Math.sin(t * 1.5 + s.ph)})`;
    ctx.fillRect(s.x * W, s.y * H, s.r * dpr, s.r * dpr);
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

  // the dirt strip and the plane waiting on it
  ctx.fillStyle = '#5b4434';
  ctx.beginPath(); ctx.moveTo(W * 0.3, hy + 40 * u); ctx.lineTo(W * 0.95, hy + 34 * u); ctx.lineTo(W * 1.05, hy + 52 * u); ctx.lineTo(W * 0.22, hy + 60 * u); ctx.fill();
  plane(W * 0.86, hy + 41 * u, 1.4 * u, t);

  // rolling fog banks
  for (const f of fogs) {
    const fx = ((f.x + t * f.sp) % 1.6 - 0.3) * W, fy = f.y * H, fw = f.w * W;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.5);
    g.addColorStop(0, `rgba(235,175,165,${f.a})`); g.addColorStop(1, 'rgba(235,175,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy, fw * 0.5, fw * 0.12, 0, 0, TAU); ctx.fill();
  }

  // mid jungle with palms drifting slowly
  ridge(hy + 70 * u, 40 * u, 6, 4 + t * 0.04, '#11201a');
  for (let i = 0; i < 9; i++) {
    const x = ((i / 9 + t * 0.004) % 1.1 - 0.05) * W;
    palm(x, hy + 80 * u, (85 + (i * 47) % 60) * u, i % 2 ? 0.3 : -0.35, Math.sin(t * 0.8 + i), '#0e1a14');
  }
  ridge(H * 0.9, 50 * u, 4, 1 + t * 0.07, '#08100c');

  // fireflies and mosquitoes catching the last light
  for (const f of flies) {
    const x = ((f.x + Math.sin(t * 0.1 * f.sp + f.ph) * 0.05 + t * 0.003 * f.sp) % 1) * W;
    const y = (f.y + Math.sin(t * f.sp + f.ph) * 0.02) * H;
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * f.sp + f.ph));
    const r = f.r * dpr * 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(230,255,150,${a})`); g.addColorStop(1, 'rgba(230,255,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  }

  // big fronds framing the corners
  for (const [x, y, h, lean, k] of [[-0.06, 1.06, 400, 0.8, 0], [1.06, 1.08, 430, -0.8, 2]]) {
    palm(x * W, y * H, h * u * (H > W ? 0.7 : 1), lean, Math.sin(t * 0.6 + k) * 0.8, '#040806');
  }

  // vignette and grain
  const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grain, 'repeat');
  ctx.translate(Math.random() * 160, Math.random() * 160);
  ctx.fillRect(-160, -160, W + 320, H + 320);
  ctx.restore();
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
};
// some browsers pause animation frames in hidden or embedded panes; nudge it along
setInterval(() => { if (running && performance.now() - last > 300) draw(performance.now()); }, 120);
})();
