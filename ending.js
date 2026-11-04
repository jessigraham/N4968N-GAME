/* The escape: after liftoff the view pulls back to the whole island at dusk, the plane climbs over the volcano,
   the zombies shrink on the strip below, then the winner card slides in. Drawn with the shared island scene. */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const canvas = document.getElementById('flyout');
const ctx = canvas.getContext('2d');
const dpr = Math.min(1.5, window.devicePixelRatio || 1);
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
let running = false, t0 = 0, last = 0, onDone = null, done = false, DUR = 4.5;
let fireworks = false, nextBurst = 0, sparks = [];
const horde = Array.from({ length: 16 }, (_, i) => ({ x: 0.3 + i * 0.037 + Math.random() * 0.02, ph: Math.random() * 6, limp: i % 2, hunch: (i % 3 - 1) * 0.3, coat: ['lab', 'khaki', 'rags'][i % 3] }));

// a small high-wing plane from the side, nose to the left, climbing
function plane(x, y, s, pitch, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(pitch); ctx.scale(-1, 1);
  ctx.fillStyle = '#120e14';
  ctx.beginPath(); ctx.moveTo(-30 * s, -6 * s); ctx.lineTo(22 * s, -8 * s); ctx.lineTo(30 * s, -4 * s); ctx.lineTo(28 * s, 0); ctx.lineTo(-26 * s, -1 * s); ctx.closePath(); ctx.fill();
  ctx.fillRect(-10 * s, -14 * s, 26 * s, 3 * s);
  ctx.fillRect(-2 * s, -12 * s, 2 * s, 6 * s);
  ctx.beginPath(); ctx.moveTo(-30 * s, -6 * s); ctx.lineTo(-34 * s, -17 * s); ctx.lineTo(-26 * s, -6 * s); ctx.fill();
  for (const wx of [-4 * s, 18 * s]) { ctx.beginPath(); ctx.arc(wx, 1.5 * s, 2.2 * s, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(200,200,200,0.35)'; ctx.beginPath(); ctx.ellipse(31 * s, -4 * s, 1.5 * s, 9 * s, 0, 0, TAU); ctx.fill();   // spinning prop
  const blink = (t * 1.1) % 1 < 0.15;
  for (const [lx, ly, c, on] of [[-33 * s, -17 * s, '255,60,50', blink], [4 * s, -13 * s, '60,255,120', true]]) {
    if (!on) continue;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 8 * s);
    g.addColorStop(0, `rgba(${c},0.95)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 8 * s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function draw(now) {
  last = now;
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const t = (now - t0) / 1000, k = Math.min(1, t / DUR), e = ease(k);
  const hy = H * 0.62, u = Math.min(W, H * 1.6) / 1000;
  // the camera starts close on the strip and pulls back to the whole island
  const zoom = 2.2 - 1.2 * e, fx = W * (0.78 - 0.28 * e), fy = hy + 40 * u * (1 - e);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
  G.Scene.paint(ctx, W, H, t, { parked: false, px: dpr });
  // the horde on the strip, too late
  for (const z of horde) G.drawZombie(ctx, z.x * W, hy + 50 * u, 24 * u, z, t, true, 0.3);
  // the plane climbing away over the volcano
  const px = W * (0.86 - 0.62 * Math.pow(k, 0.9)), py = hy + 41 * u - Math.pow(k, 1.3) * 330 * u;
  plane(px, py, (1.5 - 0.6 * k) * u, -0.18 - 0.1 * Math.sin(k * Math.PI), t);
  ctx.restore();
  // fireworks and flares bursting over the sunset
  if (fireworks && t > nextBurst) {
    nextBurst = t + 0.45 + Math.random() * 0.6;
    const bx = W * (0.15 + Math.random() * 0.7), by = H * (0.1 + Math.random() * 0.3), col = ['255,210,120', '255,140,160', '255,250,235', '140,230,255', '200,255,150'][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 70; i++) { const a = Math.random() * TAU, v = (80 + Math.random() * 160) * dpr; sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.3 + Math.random() * 0.6, col }); }
    if (G.Sfx && G.Sfx.ctx) G.Sfx.burst(Math.random() - 0.5, G.Sfx.t, 0.35, 900, 'lowpass', 0.25);
  }
  const fdt = Math.min(0.05, (now - (draw.prev || now)) / 1000); draw.prev = now;
  for (const sp of sparks) { sp.vy += 60 * dpr * fdt; sp.vx *= 0.985; sp.vy *= 0.985; sp.x += sp.vx * fdt; sp.y += sp.vy * fdt; sp.life -= fdt; }
  sparks = sparks.filter(sp => sp.life > 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const sp of sparks) { ctx.fillStyle = `rgba(${sp.col},${Math.min(1, sp.life)})`; ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.2 * dpr, 0, TAU); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  G.Scene.overlay(ctx, W, H, 0.7);
  if (!done && k >= 1) { done = true; if (onDone) onDone(); }
}

let looping = false;
function loop(now) { if (!running) { looping = false; return; } try { draw(now); } catch (err) { console.error(err); } requestAnimationFrame(loop); }
setInterval(() => { if (running && performance.now() - last > 200) draw(performance.now()); }, 100);

G.Ending = {
  // Play the fly-out, then call done(). The last frame keeps drifting behind the winner card.
  flyout(done2, seconds = 4.5) {
    DUR = seconds; onDone = done2; done = false; t0 = performance.now();
    canvas.classList.remove('hidden');
    running = true;
    if (!looping) { looping = true; requestAnimationFrame(loop); }
  },
  stop() { running = false; fireworks = false; sparks = []; canvas.classList.add('hidden'); },
  fireworks(on) { fireworks = on; nextBurst = 0; },
};
})();
