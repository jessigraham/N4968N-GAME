/* The cockpit's flight and engine instruments, drawn to look like real round gauges.
   The parts that never change (bezel, face, tick marks, numbers, colored arcs) are drawn once into a cache
   and reused every frame; only the needles, gyros and glass glare are drawn live.
   Needles are damped like real ones: the tach jumps on start, oil pressure comes up after a few seconds,
   the vacuum gyros spin up (the attitude indicator wobbles, shows an OFF flag until it has suction). */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);

// ---------- cache of static faces, per gauge and per on-screen size ----------
const cache = new Map();
function cached(ctx, key, x, y, r, paint) {
  const m = ctx.getTransform(), s = Math.hypot(m.a, m.b) || 1, pad = 14, size = Math.ceil((r + pad) * 2 * s);
  const k = key + '@' + size;
  let c = cache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, size / 2, size / 2);
    paint(g, r);
    cache.set(k, c);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
  }
  ctx.drawImage(c, x - r - pad, y - r - pad, (r + pad) * 2, (r + pad) * 2);
}

// ---------- drawing helpers (in a context centered on the gauge) ----------
function txt(g, s, x, y, size, color, weight = 700, font = 'Arial, Helvetica, sans-serif') {
  g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
function bezel(g, r) {
  const ring = g.createLinearGradient(-r, -r, r, r);
  ring.addColorStop(0, '#3a3c41'); ring.addColorStop(0.5, '#141518'); ring.addColorStop(1, '#2a2c30');
  g.fillStyle = '#0b0b0c'; g.beginPath(); g.arc(0, 0, r + 10, 0, TAU); g.fill();
  g.fillStyle = ring; g.beginPath(); g.arc(0, 0, r + 6, 0, TAU); g.fill();
  g.fillStyle = '#070708'; g.beginPath(); g.arc(0, 0, r + 1, 0, TAU); g.fill();
  const face = g.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  face.addColorStop(0, '#16171a'); face.addColorStop(1, '#060607');
  g.fillStyle = face; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  for (const a of [0.25, 0.75, 1.25, 1.75]) {   // mounting screws in the panel
    const sx = Math.cos(a * Math.PI) * (r + 9) * 1.03, sy = Math.sin(a * Math.PI) * (r + 9) * 1.03;
    g.fillStyle = '#5c5f65'; g.beginPath(); g.arc(sx, sy, 3.4, 0, TAU); g.fill();
    g.strokeStyle = '#1a1a1c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(sx - 2.4, sy - 1); g.lineTo(sx + 2.4, sy + 1); g.stroke();
  }
}
function ticks(g, r, from, to, step, angOf, len, w, color = '#f2f2f2') {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt';
  for (let v = from; v <= to + 1e-6; v += step) {
    const a = angOf(v);
    g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a) * (r - len), Math.sin(a) * (r - len)); g.stroke();
  }
}
function arc(g, r, a0, a1, w, color) { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke(); }
function needle(ctx, x, y, len, a, w, tail = 0.18, color = '#f4f4f4') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';   // a soft shadow under the needle
  ctx.beginPath(); ctx.moveTo(-len * tail + 1.5, -w + 1.5); ctx.lineTo(len + 1.5, 1.5); ctx.lineTo(-len * tail + 1.5, w + 1.5); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-len * tail, -w); ctx.lineTo(len * 0.85, -w * 0.45); ctx.lineTo(len, 0); ctx.lineTo(len * 0.85, w * 0.45); ctx.lineTo(-len * tail, w); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2a2a2d'; ctx.beginPath(); ctx.arc(x, y, w * 1.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a6c70'; ctx.beginPath(); ctx.arc(x - w * 0.3, y - w * 0.3, w * 0.5, 0, TAU); ctx.fill();
}
function glass(ctx, x, y, r) {
  cached(ctx, 'glass', x, y, r, (g, rr) => {
    const gl = g.createLinearGradient(-rr, -rr, rr * 0.2, rr * 0.2);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, rr, Math.PI * 0.85, Math.PI * 1.9); g.quadraticCurveTo(0, -rr * 0.2, -rr * 0.95, rr * 0.3); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-rr * 0.45, -rr * 0.6, rr * 0.16, rr * 0.06, -0.6, 0, TAU); g.fill();
  });
}

// ---------- the gauges ----------
const ASI = {   // airspeed arcs in knots: white flap range, green normal, yellow caution, red line
  c172: { white: [40, 85], green: [48, 129], yellow: [129, 163], red: 163 },
  cherokee: { white: [50, 115], green: [55, 140], yellow: [140, 171], red: 171 },
};
const asiA = v => -Math.PI / 2 + clamp(v, 0, 200) / 200 * TAU * 0.92;
function airspeed(ctx, x, y, r, kt, type) {
  const m = ASI[type] || ASI.c172;
  cached(ctx, 'asi-' + type, x, y, r, (g, rr) => {
    bezel(g, rr);
    arc(g, rr * 0.7, asiA(m.white[0]), asiA(m.white[1]), rr * 0.07, '#f2f2f2');
    arc(g, rr * 0.84, asiA(m.green[0]), asiA(m.green[1]), rr * 0.1, '#2fbf5a');
    arc(g, rr * 0.84, asiA(m.yellow[0]), asiA(m.yellow[1]), rr * 0.1, '#f2c32b');
    ticks(g, rr * 0.95, 20, 200, 5, asiA, rr * 0.07, 1);
    ticks(g, rr * 0.95, 20, 200, 10, asiA, rr * 0.13, 1.8);
    ticks(g, rr * 0.95, m.red, m.red, 1, asiA, rr * 0.22, 3.4, '#e23b2e');
    for (let v = 40; v <= 200; v += 20) { const a = asiA(v); txt(g, String(v), Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6, rr * 0.19, '#f2f2f2'); }
    txt(g, 'AIRSPEED', 0, -rr * 0.24, rr * 0.13, '#cfcfcf'); txt(g, 'KNOTS', 0, rr * 0.3, rr * 0.13, '#cfcfcf');
  });
  needle(ctx, x, y, r * 0.86, asiA(kt), r * 0.06);
  glass(ctx, x, y, r);
}

function attitude(ctx, x, y, r, pitch, roll, gyro) {
  cached(ctx, 'ai-bezel', x, y, r, (g, rr) => bezel(g, rr));
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.clip();
  ctx.translate(x, y); ctx.rotate(roll);
  const off = pitch * r * 2.4;
  const sky = ctx.createLinearGradient(0, -r, 0, off); sky.addColorStop(0, '#1d5f9e'); sky.addColorStop(1, '#5fa4dd');
  ctx.fillStyle = sky; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 1.5 + off);
  const gnd = ctx.createLinearGradient(0, off, 0, r); gnd.addColorStop(0, '#8a5a2b'); gnd.addColorStop(1, '#4e3216');
  ctx.fillStyle = gnd; ctx.fillRect(-r * 1.5, off, r * 3, r * 1.5);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r * 1.4, off); ctx.lineTo(r * 1.4, off); ctx.stroke();
  ctx.lineWidth = 1.4;
  for (const [d, w] of [[-0.3, 0.3], [-0.15, 0.18], [0.15, 0.18], [0.3, 0.3]]) { ctx.beginPath(); ctx.moveTo(-r * w, off + d * r); ctx.lineTo(r * w, off + d * r); ctx.stroke(); }
  // bank scale on the gyro's outer ring
  for (const deg of [-60, -30, -20, -10, 10, 20, 30, 60]) {
    const a = -Math.PI / 2 + deg * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); ctx.lineTo(Math.cos(a) * r * (Math.abs(deg) % 30 ? 0.84 : 0.78), Math.sin(a) * r * (Math.abs(deg) % 30 ? 0.84 : 0.78)); ctx.stroke();
  }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -r * 0.92); ctx.lineTo(-5, -r * 0.8); ctx.lineTo(5, -r * 0.8); ctx.fill();
  ctx.restore();
  // the fixed little airplane, and the OFF flag when the gyro has no suction
  ctx.strokeStyle = '#ff9f1a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x - r * 0.22, y); ctx.lineTo(x - r * 0.1, y + 8);
  ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 0.22, y); ctx.lineTo(x + r * 0.1, y + 8); ctx.stroke();
  ctx.fillStyle = '#ff9f1a'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
  if (gyro < 0.6) {
    ctx.save(); ctx.translate(x + r * 0.45, y - r * 0.45); ctx.rotate(0.6);
    ctx.fillStyle = '#ff7a1a'; ctx.fillRect(-14, -7, 28, 14);
    txt(ctx, 'OFF', 0, 0.5, 10, '#1a1a1a', 800);
    ctx.restore();
  }
  glass(ctx, x, y, r);
}

const altA = v => -Math.PI / 2 + v / 10 * TAU;
function altimeter(ctx, x, y, r, ft) {
  cached(ctx, 'alt', x, y, r, (g, rr) => {
    bezel(g, rr);
    ticks(g, rr * 0.95, 0, 9.8, 0.2, altA, rr * 0.07, 1);
    ticks(g, rr * 0.95, 0, 9, 1, altA, rr * 0.15, 2);
    for (let v = 0; v < 10; v++) { const a = altA(v); txt(g, String(v), Math.cos(a) * rr * 0.68, Math.sin(a) * rr * 0.68, rr * 0.22, '#f2f2f2'); }
    txt(g, 'ALT', 0, -rr * 0.3, rr * 0.13, '#cfcfcf'); txt(g, '100 FEET', 0, rr * 0.26, rr * 0.1, '#cfcfcf');
    g.fillStyle = '#000'; g.fillRect(rr * 0.18, -rr * 0.08, rr * 0.42, rr * 0.18); txt(g, '29.92', rr * 0.39, 0.5, rr * 0.11, '#e8e8e8');
  });
  needle(ctx, x, y, r * 0.52, altA(ft / 1000 % 10), r * 0.075, 0.2);
  needle(ctx, x, y, r * 0.86, altA(ft / 100 % 10), r * 0.045, 0.2);
  glass(ctx, x, y, r);
}

function turnCoordinator(ctx, x, y, r, bank, ball) {
  cached(ctx, 'tc', x, y, r, (g, rr) => {
    bezel(g, rr);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2.5;
    for (const a of [0, Math.PI]) { g.beginPath(); g.moveTo(Math.cos(a) * rr * 0.95, 0); g.lineTo(Math.cos(a) * rr * 0.78, 0); g.stroke(); }
    for (const a of [0.35, Math.PI - 0.35]) { g.beginPath(); g.moveTo(Math.cos(a) * rr * 0.95, Math.sin(a) * rr * 0.95); g.lineTo(Math.cos(a) * rr * 0.78, Math.sin(a) * rr * 0.78); g.stroke(); }
    txt(g, 'L', -rr * 0.78, rr * 0.25, rr * 0.16, '#f2f2f2'); txt(g, 'R', rr * 0.78, rr * 0.25, rr * 0.16, '#f2f2f2');
    txt(g, 'TURN COORDINATOR', 0, -rr * 0.55, rr * 0.09, '#cfcfcf'); txt(g, '2 MIN', 0, rr * 0.72, rr * 0.11, '#cfcfcf');
    g.fillStyle = '#e8e2c8'; g.beginPath(); g.ellipse(0, rr * 0.45, rr * 0.42, rr * 0.11, 0, 0, TAU); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.2; for (const dx of [-0.11, 0.11]) { g.beginPath(); g.moveTo(dx * rr, rr * 0.35); g.lineTo(dx * rr, rr * 0.56); g.stroke(); }
  });
  ctx.save(); ctx.translate(x, y); ctx.rotate(bank);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.62, 0); ctx.lineTo(r * 0.62, 0); ctx.moveTo(0, -r * 0.16); ctx.lineTo(0, r * 0.06); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0c0c0c'; ctx.beginPath(); ctx.arc(x + ball * r * 0.32, y + r * 0.45, r * 0.085, 0, TAU); ctx.fill();
  glass(ctx, x, y, r);
}

function headingIndicator(ctx, x, y, r, hdg) {
  cached(ctx, 'hi-bezel', x, y, r, (g, rr) => bezel(g, rr));
  ctx.save(); ctx.translate(x, y); ctx.rotate(-hdg * Math.PI / 180);
  cached(ctx, 'hi-card', 0, 0, r, (g, rr) => {   // the compass card, drawn once and spun
    const labels = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
    for (let i = 0; i < 72; i++) {
      const a = i * TAU / 72 - Math.PI / 2, long = i % 2 === 0;
      g.strokeStyle = '#eee'; g.lineWidth = long ? 1.6 : 1;
      g.beginPath(); g.moveTo(Math.cos(a) * rr * 0.95, Math.sin(a) * rr * 0.95); g.lineTo(Math.cos(a) * rr * (long ? 0.83 : 0.88), Math.sin(a) * rr * (long ? 0.83 : 0.88)); g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate(i * TAU / 12);
      txt(g, labels[i], 0, -rr * 0.68, rr * (i % 3 === 0 ? 0.2 : 0.16), i % 3 === 0 ? '#fff' : '#ddd');
      g.restore();
    }
  });
  ctx.restore();
  ctx.fillStyle = '#ff9f1a';   // lubber line and the little airplane
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.97); ctx.lineTo(x - 5, y - r * 0.8); ctx.lineTo(x + 5, y - r * 0.8); ctx.fill();
  ctx.strokeStyle = '#ff9f1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.32); ctx.lineTo(x, y + r * 0.3); ctx.moveTo(x - r * 0.28, y - r * 0.02); ctx.lineTo(x + r * 0.28, y - r * 0.02); ctx.moveTo(x - r * 0.12, y + r * 0.26); ctx.lineTo(x + r * 0.12, y + r * 0.26); ctx.stroke();
  glass(ctx, x, y, r);
}

const vsiA = v => Math.PI + clamp(v, -2000, 2000) / 2000 * Math.PI * 0.9;
function verticalSpeed(ctx, x, y, r, fpm) {
  cached(ctx, 'vsi', x, y, r, (g, rr) => {
    bezel(g, rr);
    ticks(g, rr * 0.95, -2000, 2000, 100, vsiA, rr * 0.07, 1);
    ticks(g, rr * 0.95, -2000, 2000, 500, vsiA, rr * 0.15, 2);
    for (const v of [5, 10, 15, 20]) for (const sg of [-1, 1]) {
      if (v === 20 && sg < 0) continue;
      const a = vsiA(sg * v * 100); txt(g, String(v), Math.cos(a) * rr * 0.66, Math.sin(a) * rr * 0.66, rr * 0.18, '#f2f2f2');
    }
    txt(g, '0', -rr * 0.66, 0, rr * 0.18, '#f2f2f2');
    txt(g, 'UP', -rr * 0.28, -rr * 0.36, rr * 0.11, '#cfcfcf'); txt(g, 'DOWN', -rr * 0.28, rr * 0.36, rr * 0.11, '#cfcfcf');
    txt(g, 'VERTICAL SPEED', rr * 0.12, -rr * 0.08, rr * 0.08, '#cfcfcf'); txt(g, '100 FT PER MIN', rr * 0.12, rr * 0.08, rr * 0.08, '#cfcfcf');
  });
  needle(ctx, x, y, r * 0.86, vsiA(fpm), r * 0.055);
  glass(ctx, x, y, r);
}

const tachA = v => Math.PI * 0.75 + clamp(v, 0, 3500) / 3500 * Math.PI * 1.5;
function tachometer(ctx, x, y, r, rpm, hours) {
  cached(ctx, 'tach', x, y, r, (g, rr) => {
    bezel(g, rr);
    arc(g, rr * 0.84, tachA(2100), tachA(2700), rr * 0.1, '#2fbf5a');
    ticks(g, rr * 0.95, 0, 3500, 100, tachA, rr * 0.07, 1);
    ticks(g, rr * 0.95, 0, 3500, 500, tachA, rr * 0.15, 2);
    ticks(g, rr * 0.95, 2700, 2700, 1, tachA, rr * 0.22, 3.4, '#e23b2e');
    for (let v = 0; v <= 35; v += 5) { const a = tachA(v * 100); txt(g, String(v), Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, rr * 0.18, '#f2f2f2'); }
    txt(g, 'RPM', 0, -rr * 0.3, rr * 0.13, '#cfcfcf'); txt(g, 'HUNDREDS', 0, -rr * 0.15, rr * 0.08, '#cfcfcf');
    g.fillStyle = '#000'; g.fillRect(-rr * 0.32, rr * 0.3, rr * 0.64, rr * 0.2);
    g.strokeStyle = '#444'; g.lineWidth = 1; g.strokeRect(-rr * 0.32, rr * 0.3, rr * 0.64, rr * 0.2);
    txt(g, 'HOURS', 0, rr * 0.62, rr * 0.08, '#cfcfcf');
  });
  txt(ctx, hours.toFixed(1).padStart(6, '0'), x, y + r * 0.405, r * 0.15, '#eaeaea', 700, 'ui-monospace, Menlo, monospace');
  needle(ctx, x, y, r * 0.86, tachA(rpm), r * 0.06);
  glass(ctx, x, y, r);
}

// small engine gauges: a half-dial with a needle (fuel, oil, amps, suction)
function mini(ctx, x, y, r, label, v, green, red, lo, hi) {
  const A = u => Math.PI + clamp(u, 0, 1) * Math.PI;
  cached(ctx, 'mini-' + label, x, y, r, (g, rr) => {
    g.fillStyle = '#050506'; g.beginPath(); g.arc(0, 0, rr + 3, 0, TAU); g.fill();
    g.strokeStyle = '#2e3034'; g.lineWidth = 2; g.stroke();
    if (green) arc(g, rr * 0.82, A(green[0]), A(green[1]), rr * 0.18, '#2fbf5a');
    if (red) arc(g, rr * 0.82, A(red[0]), A(red[1]), rr * 0.18, '#e23b2e');
    ticks(g, rr * 0.95, 0, 1, 0.25, A, rr * 0.22, 1.2);
    txt(g, lo, -rr * 0.7, rr * 0.18, rr * 0.28, '#ddd'); txt(g, hi, rr * 0.7, rr * 0.18, rr * 0.28, '#ddd');
    txt(g, label, 0, rr * 0.62, rr * 0.3, '#e8e8e8', 800);
  });
  needle(ctx, x, y, r * 0.86, A(v), r * 0.09, 0.15);
}

// ---------- the live state of the needles ----------
function update(p, now) {
  const I = p.inst || (p.inst = { asi: 0, vsi: 0, gyro: 0, suction: 0, amps: 0, ball: 0, hours: 1247.3 + Math.random() * 300, last: now });
  const dt = Math.min(0.1, (now - I.last) / 1000); I.last = now;
  I.asi = approach(I.asi, p.speed, 4, dt);
  I.vsi = approach(I.vsi, p.airborne ? 720 : 0, 1.5, dt);
  I.gyro = clamp(I.gyro + (p.running ? dt / 6 : -dt / 25), 0, 1);           // vacuum gyros spin up after the start
  I.suction = approach(I.suction, p.running ? clamp(3.2 + p.rpm / 2400 * 2, 0, 5.2) : 0, 2, dt);
  I.amps = approach(I.amps, p.cranking ? -45 : p.running ? (I.gyro < 0.9 ? 18 : 4) : p.master ? -4 : 0, 3, dt);
  I.ball = approach(I.ball, p.stall ? Math.sin(now / 160) * 0.8 : p.airborne ? Math.sin(now / 900) * 0.15 : 0, 3, dt);
  if (p.running) I.hours += dt / 3600;
  return I;
}

G.Instruments = {
  draw(ctx, p, t, type) {
    const I = update(p, performance.now());
    const pitch = p.airborne ? Math.min(1, (t - p.finishT) * 0.8) * 0.22 : p.rotT * 0.1;
    const wob = 1 - I.gyro;   // an unspun gyro tumbles and drifts
    const roll = Math.sin(t * 1.7) * 0.5 * wob + (p.stall ? Math.sin(t * 9) * 0.05 : 0);
    airspeed(ctx, 330, 530, 54, I.asi, type);
    attitude(ctx, 450, 530, 54, pitch + Math.sin(t * 1.1) * 0.08 * wob, roll, I.gyro);
    altimeter(ctx, 570, 530, 54, 120 + p.alt * 900);
    turnCoordinator(ctx, 330, 655, 54, p.airborne ? Math.sin(t * 0.6) * 0.05 : 0, I.ball);
    headingIndicator(ctx, 450, 655, 54, 90 + wob * 40 * Math.sin(t * 0.4));
    verticalSpeed(ctx, 570, 655, 54, I.vsi);
    tachometer(ctx, 702, 660, 50, p.rpm, I.hours);
    // engine cluster: fuel, oil, amps and suction (tap it to check the oil)
    ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(636, 466, 134, 124, 10) : ctx.rect(636, 466, 134, 124); ctx.fill();
    mini(ctx, 659, 498, 17, 'FUEL L', 0.12, null, [0, 0.08], 'E', 'F');
    mini(ctx, 703, 498, 17, 'FUEL R', 0.2, null, [0, 0.08], 'E', 'F');
    mini(ctx, 747, 498, 17, 'AMPS', 0.5 + I.amps / 120, null, null, '−', '+');
    mini(ctx, 659, 556, 17, 'OIL T', p.oilT, [0.4, 0.85], [0.92, 1], 'C', 'H');
    mini(ctx, 703, 556, 17, 'OIL P', p.oil * 0.9, [0.55, 0.9], [0, 0.1], '0', '115');
    mini(ctx, 747, 556, 17, 'SUCTION', I.suction / 7, [4.5 / 7, 5.5 / 7], null, '0', '7');
  },
};
})();
