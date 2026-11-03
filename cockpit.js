/* Draws the pilot's-seat view of the Cessna 172: windshield, panel, controls, checklist.
   Everything is drawn in code on a canvas, in a "virtual" 1600 x 900 space that is scaled to fit any screen.
   Look and feel taken from a real light-plane cockpit photo: black panel, white-on-black gauges,
   gold window posts, tan door, brown carpet, laminated checklist with a red header. */
(() => {
'use strict';
const G = window.G = window.G || {};
const VW = 1600, VH = 900, WIN = 430;   // WIN = bottom of the windshield
G.VW = VW; G.VH = VH;
G.CAMERA = { x: 30, y: 150, w: 1540, h: 750 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// Where each control sits on screen (virtual units). Tapping inside the box works that control.
G.SPOTS = {
  clear:    { x: 10,   y: 236, w: 112, h: 110 },
  master:   { x: 102,  y: 512, w: 100, h: 104 },
  key:      { x: 92,   y: 630, w: 116, h: 128 },
  oil:      { x: 636,  y: 464, w: 132, h: 126 },
  beacon:   { x: 812,  y: 636, w: 56,  h: 84 },
  prime:    { x: 704,  y: 728, w: 70,  h: 96 },
  throttle: { x: 880,  y: 722, w: 80,  h: 104 },
  mixture:  { x: 970,  y: 722, w: 80,  h: 104 },
  fuel:     { x: 826,  y: 824, w: 108, h: 76 },
  flaps:    { x: 1398, y: 466, w: 164, h: 318 },
  yoke:     { x: 262,  y: 766, w: 376, h: 134 },
};
G.hitSpot = (x, y) => {
  for (const [id, s] of Object.entries(G.SPOTS)) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return id;
  }
  return null;
};

// ---------- small drawing helpers ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function txt(ctx, s, x, y, size, color, align = 'center', weight = 600, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, sans-serif'}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function circle(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function needle(ctx, x, y, len, a, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * len * 0.15, y - Math.sin(a) * len * 0.15);
  ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  circle(ctx, x, y, w * 1.3, '#333');
}
function screw(ctx, x, y) { circle(ctx, x, y, 4, '#55585e'); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke(); }
function dialBase(ctx, x, y, r) {
  circle(ctx, x, y, r + 7, '#151517');
  circle(ctx, x, y, r + 3, '#2a2b2f');
  circle(ctx, x, y, r, '#0c0c0e');
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(ctx, x + dx * (r + 6) * 0.86, y + dy * (r + 6) * 0.86);
}
function ticks(ctx, x, y, r, angOf, from, to, step, len, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  for (let v = from; v <= to + 1e-6; v += step) {
    const a = angOf(v);
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * (r - len), y + Math.sin(a) * (r - len)); ctx.stroke();
  }
}
function arcBand(ctx, x, y, r, a0, a1, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke(); }

// ---------- zombies ----------
// A zombie walking toward you. `haze` (0..1) fades distant ones into the dusk air.
const COATS = { lab: ['#c9c4b4', '#8f8a7c'], khaki: ['#7a6a46', '#4f4430'], rags: ['#4d4340', '#2e2827'] };
function shade(hex, k, haze) {
  const n = parseInt(hex.slice(1), 16), fog = [92, 70, 88];
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v, i) => Math.round((v * k) * (1 - haze) + fog[i] * haze));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function drawZombie(ctx, x, y, h, z, t, armsUp, haze = 0) {
  const cyc = t * 2.4 + z.ph;
  const limp = z.limp ? Math.max(0, Math.sin(cyc)) * h * 0.035 : 0;
  const bob = Math.abs(Math.sin(cyc)) * h * 0.02 + limp;
  const stride = Math.sin(cyc) * h * 0.07;
  const [coatLit, coatDark] = COATS[z.coat || 'rags'];
  const skin = shade('#8a957a', 0.75, haze), skinDark = shade('#5d6652', 0.75, haze);
  const pants = shade('#3a3532', 0.8, haze);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((z.hunch || 0) * 0.25 + Math.sin(cyc * 0.5) * 0.04);
  ctx.translate(0, -bob);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // shadow on the ground
  ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - haze)})`;
  ctx.beginPath(); ctx.ellipse(0, bob, h * 0.16, h * 0.025, 0, 0, TAU); ctx.fill();
  // legs with knees, one dragging
  ctx.strokeStyle = pants; ctx.lineWidth = h * 0.075;
  for (const sd of [-1, 1]) {
    const st = sd * stride * (z.limp && sd > 0 ? 0.4 : 1);
    ctx.beginPath();
    ctx.moveTo(sd * h * 0.05, -h * 0.46);
    ctx.lineTo(sd * h * 0.065 + st * 0.5, -h * 0.24);
    ctx.lineTo(sd * h * 0.07 + st, -h * 0.01);
    ctx.stroke();
  }
  // torso: coat with a torn, ragged hem, lit from the sunset on the right
  const g = ctx.createLinearGradient(-h * 0.15, 0, h * 0.15, 0);
  g.addColorStop(0, shade(coatDark, 0.7, haze)); g.addColorStop(1, shade(coatLit, 0.8, haze));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-h * 0.14, -h * 0.79);
  ctx.quadraticCurveTo(0, -h * 0.84, h * 0.14, -h * 0.79);
  ctx.lineTo(h * 0.12, -h * 0.4);
  for (let i = 0; i <= 6; i++) ctx.lineTo(h * (0.12 - i * 0.04), -h * (i % 2 ? 0.36 : 0.41));
  ctx.closePath(); ctx.fill();
  // dark stains
  ctx.fillStyle = shade('#3b1d1a', 0.9, haze);
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(h * 0.04, -h * 0.62, h * 0.035, h * 0.06, 0.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // arms reaching out toward you, hands with splayed fingers
  const reachY = armsUp ? -h * 1.02 : -h * 0.66;
  for (const sd of [-1, 1]) {
    const sw = Math.sin(cyc + sd) * h * 0.02;
    const ex = sd * h * 0.2, ey = -h * 0.66 + sw;
    const hx = sd * (armsUp ? h * 0.24 : h * 0.17), hy = reachY + sw * 2;
    ctx.strokeStyle = shade(coatDark, 0.8, haze); ctx.lineWidth = h * 0.055;
    ctx.beginPath(); ctx.moveTo(sd * h * 0.12, -h * 0.76); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = skinDark; ctx.lineWidth = h * 0.04;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(hx, hy, h * 0.03, 0, TAU); ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = h * 0.012;
    for (let f = -2; f <= 2; f++) {
      const a = -Math.PI / 2 + f * 0.32 + sd * 0.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * h * 0.06, hy + Math.sin(a) * h * 0.06); ctx.stroke();
    }
  }
  // head: tilted, sunken eyes, slack jaw, matted hair
  ctx.save();
  ctx.translate(h * 0.01, -h * 0.89);
  ctx.rotate(0.25 * Math.sin(z.ph * 3) + Math.sin(cyc * 0.7) * 0.06);
  ctx.fillStyle = skinDark; ctx.fillRect(-h * 0.025, h * 0.04, h * 0.05, h * 0.06);
  const hg = ctx.createRadialGradient(h * 0.02, -h * 0.02, h * 0.01, 0, 0, h * 0.085);
  hg.addColorStop(0, skin); hg.addColorStop(1, skinDark);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(0, 0, h * 0.062, h * 0.08, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = shade('#1c1714', 1, haze);
  ctx.beginPath(); ctx.ellipse(0, -h * 0.055, h * 0.066, h * 0.035, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = shade('#120c0c', 1, haze);
  ctx.beginPath(); ctx.ellipse(-h * 0.024, -h * 0.005, h * 0.017, h * 0.013, 0, 0, TAU); ctx.ellipse(h * 0.024, -h * 0.005, h * 0.017, h * 0.013, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, h * 0.045, h * 0.02, h * 0.025 + Math.abs(Math.sin(cyc)) * h * 0.008, 0, 0, TAU); ctx.fill();
  if (h > 34) {
    const er = Math.max(1, h * 0.007);
    ctx.fillStyle = `rgba(214,240,170,${1 - haze})`;
    ctx.beginPath(); ctx.arc(-h * 0.024, -h * 0.004, er, 0, TAU); ctx.arc(h * 0.024, -h * 0.004, er, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// A palm tree: curved trunk and drooping fronds. Darker and hazier with distance.
function palm(ctx, x, y, h, lean, seed, haze) {
  const tx = x + lean * h * 0.35, ty = y - h;
  ctx.strokeStyle = shade('#3b2f22', 0.8, haze); ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * h * 0.05, y - h * 0.6, tx, ty); ctx.stroke();
  ctx.strokeStyle = shade(seed % 2 ? '#1d3a1f' : '#244521', 0.85, haze);
  ctx.lineWidth = Math.max(1, h * 0.022);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + seed;
    const len = h * (0.32 + 0.08 * Math.sin(seed * 3 + i));
    const ex = tx + Math.cos(a) * len, ey = ty + Math.abs(Math.sin(a)) * len * 0.25 + len * 0.35;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty - len * 0.25, ex, ey); ctx.stroke();
  }
}

function zombieDepth(z, p, t, T) {
  const appearT = z.appear * T;
  if (t < appearT) return -1;
  const k = clamp((t - appearT) / (T - appearT), 0, 1);
  return z.z0 + (z.zEnd - z.z0) * Math.pow(k, 0.7) - p.dist;
}

// ---------- the view out the windshield ----------
function world(ctx, p, t, L, R) {
  const W = VW, winH = WIN, cx = 800;
  const pitch = p.airborne ? Math.min(1, (t - p.finishT) * 0.8) * 0.22
    : p.rotT * 0.1 + (p.stall ? Math.abs(Math.sin(t * 14)) * 0.04 : 0);
  const hy = winH * (0.42 + pitch);
  const camH = winH * 0.2 * (1 + p.alt * 3);
  const proj = z => hy + camH / z;
  const sx = (x, z) => cx + x * W * 0.22 / z;

  let g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#2a1d3d'); g.addColorStop(0.55, '#8a4553'); g.addColorStop(1, '#f39a52');
  ctx.fillStyle = g; ctx.fillRect(L, -400, R - L, hy + 401);
  circle(ctx, cx + 360, hy - 28, 26, 'rgba(255,210,140,0.95)');
  // volcano on the island
  ctx.fillStyle = '#41293f';
  ctx.beginPath(); ctx.moveTo(140, hy); ctx.lineTo(420, hy - 80); ctx.lineTo(490, hy - 76); ctx.lineTo(760, hy); ctx.fill();
  ctx.fillStyle = '#1f3a22'; ctx.fillRect(L, hy, R - L, 900);
  ctx.fillStyle = '#16341f';
  for (let x = L; x <= R; x += 34) {
    const r = 9 + 6 * (Math.sin(x * 0.05) + 1);
    ctx.beginPath(); ctx.arc(x, hy, r, Math.PI, 0); ctx.fill();
  }
  // the dirt strip
  const zN = 0.3, zF = 80;
  ctx.fillStyle = '#8b6a45';
  ctx.beginPath();
  ctx.moveTo(sx(-1, zF), proj(zF)); ctx.lineTo(sx(1, zF), proj(zF));
  ctx.lineTo(sx(1, zN), proj(zN)); ctx.lineTo(sx(-1, zN), proj(zN)); ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,25,0.6)'; ctx.lineWidth = 6;
  ctx.beginPath();
  for (const x of [-0.4, 0.4]) { ctx.moveTo(sx(x, zF), proj(zF)); ctx.lineTo(sx(x, zN), proj(zN)); }
  ctx.stroke();
  const off = p.dist % 2;
  ctx.fillStyle = '#e8e2d0';
  for (let k = 0; k < 30; k++) {
    const z = k * 2 + 1 - off;
    if (z < zN + 0.05) continue;
    const y = proj(z), s = W * 0.012 / z;
    ctx.fillRect(sx(-1.08, z) - s, y - s * 0.5, s * 2, s);
    ctx.fillRect(sx(1.08, z) - s, y - s * 0.5, s * 2, s);
  }
  // jungle walls on both sides of the strip
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? '#0f2617' : '#112a19';
    ctx.beginPath();
    ctx.moveTo(sx(2.6 * side, zF), proj(zF));
    let lastZ = zF;
    for (let z = zF; z > 0.35; z *= 0.88) {
      ctx.lineTo(sx(2.6 * side, z), hy + (camH - winH * (0.5 + 0.14 * Math.sin(z * 5.3 + side))) / z);
      lastZ = z;
    }
    ctx.lineTo(sx(2.6 * side, lastZ), proj(lastZ));
    ctx.closePath(); ctx.fill();
  }
  // palm trees standing out of the jungle walls, and dusk mist over the strip
  for (const side of [-1, 1]) {
    for (let k = 0; k < 16; k++) {
      const z = 26 * Math.pow(0.8, k) + 0.6, haze = clamp(z / 30, 0, 0.8);
      const xw = side * (2.5 + ((k * 37) % 7) / 10);
      if (sx(xw, z) < L - 200 || sx(xw, z) > R + 200) continue;
      palm(ctx, sx(xw, z), proj(z) - winH * 0.25 / z, winH * (0.55 + ((k * 13) % 5) / 12) / z, -side * 0.4, k + side, haze);
    }
  }
  const mist = ctx.createLinearGradient(0, hy - 30, 0, hy + 60);
  mist.addColorStop(0, 'rgba(255,170,140,0)'); mist.addColorStop(0.5, 'rgba(240,160,140,0.22)'); mist.addColorStop(1, 'rgba(240,160,140,0)');
  ctx.fillStyle = mist; ctx.fillRect(L, hy - 30, R - L, 90);
  // the horde, walking in from the trees
  const list = p.zombies.map(z => ({ z, d: zombieDepth(z, p, t, G.RACE_TIME) }))
    .filter(o => o.d > 0.4 && o.d < 40).sort((a, b) => b.d - a.d);
  for (const o of list) drawZombie(ctx, sx(o.z.x * (o.d < 3 ? 0.9 : 1), o.d), proj(o.d), winH * 0.5 / o.d, o.z, t * o.z.walk, false, clamp((o.d - 2) / 22, 0, 0.75));
}

function windshield(ctx, p, t, L, R, T, opt) {
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, R - L, WIN - T + 40); ctx.clip();
  world(ctx, p, t, L, R);

  // propeller: blades when slow, a blur disc once the engine runs
  const cx = 800, pcy = WIN * 0.9, pr = 250;
  ctx.save(); ctx.translate(cx, pcy);
  if (p.rpm > 450) {
    const a = Math.min(0.35, p.rpm / 6000);
    ctx.fillStyle = `rgba(210,210,210,${a * 0.5})`;
    ctx.beginPath(); ctx.ellipse(0, 0, pr, pr * 0.92, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(30,30,30,${a})`; ctx.lineWidth = 12;
    for (let i = 0; i < 2; i++) { const ang = p.propAngle * 0.03 + i * Math.PI; ctx.beginPath(); ctx.arc(0, 0, pr * 0.75, ang, ang + 0.5); ctx.stroke(); }
  } else {
    ctx.rotate(p.propAngle);
    ctx.fillStyle = '#18191b';
    for (let i = 0; i < 2; i++) { ctx.rotate(Math.PI); ctx.beginPath(); ctx.ellipse(0, -pr * 0.5, 17, pr * 0.5, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  // white cowling with a stripe in the player's colour
  const g = ctx.createLinearGradient(0, WIN * 0.78, 0, WIN);
  g.addColorStop(0, '#f1ede4'); g.addColorStop(1, '#b8b2a5');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, WIN * 1.1, 640, WIN * 0.25, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = p.color; ctx.fillRect(cx - 640, WIN * 0.985, 1280, 6);

  // zombies at the windows near the end
  const rem = G.RACE_TIME - t;
  let n = p.overrun ? 7 : (!p.airborne && opt.racing && rem < 28 ? Math.ceil((28 - rem) / 4) : 0);
  n = Math.min(n, 7);
  const spots = [[60, 1], [1540, 1.05], [330, 0.85], [1240, 0.9], [-40, 1.15], [1640, 1.12], [800, 1.2]];
  for (let i = 0; i < n; i++) {
    const [fx, sc] = spots[i];
    const rise = p.overrun ? 1 : clamp(t - (G.RACE_TIME - 28 + i * 4), 0, 1);
    const h = WIN * 1.05 * sc;
    const y = WIN * (1.22 + (1 - rise) * 0.7) + Math.sin(t * 3 + i * 2) * 8;
    drawZombie(ctx, fx, y, h, { ph: i * 1.3, limp: i % 2, hunch: (i % 3 - 1) * 0.3, coat: ['lab', 'rags', 'khaki'][i % 3] }, t, true, 0);
  }
  // hand prints on the glass
  for (const pr2 of p.prints) {
    const x = pr2.x * VW, y = pr2.y * WIN, s = 30 * pr2.s;
    ctx.save(); ctx.translate(x, y);
    // greasy smear dragged down the glass
    const sm = ctx.createLinearGradient(0, 0, 0, s * 3.2);
    sm.addColorStop(0, 'rgba(120,120,95,0.28)'); sm.addColorStop(1, 'rgba(120,120,95,0)');
    ctx.fillStyle = sm;
    for (let f = -1.5; f <= 1.5; f++) ctx.fillRect(f * s * 0.3 - s * 0.08, -s * 0.2, s * 0.16, s * 3.2);
    ctx.rotate(pr2.r * 0.15);
    ctx.fillStyle = 'rgba(70,80,55,0.42)';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.6, s * 0.75, 0, 0, TAU); ctx.fill();
    for (let f = -1.5; f <= 1.5; f++) { ctx.beginPath(); ctx.ellipse(f * s * 0.32, -s * 1.15, s * 0.12, s * 0.42, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (p.beacon && (t * 1.2) % 1 < 0.12) { ctx.fillStyle = 'rgba(255,40,40,0.13)'; ctx.fillRect(L, T, R - L, WIN - T); }
  if (p.overrun) { ctx.fillStyle = 'rgba(110,0,0,0.4)'; ctx.fillRect(L, T, R - L, WIN - T); }
  ctx.restore();

  // cabin frame: headliner, gold window posts, side windows
  ctx.fillStyle = '#d9d2c2'; ctx.fillRect(L, T, R - L, 24 - T);
  ctx.fillStyle = '#b7a46a';
  ctx.fillRect(L, 18, R - L, 10);
  const post = (x0, x1, x2, x3) => {
    const pg = ctx.createLinearGradient(x0, 0, x1, 0);
    pg.addColorStop(0, '#8e7c45'); pg.addColorStop(0.5, '#d5c385'); pg.addColorStop(1, '#8e7c45');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.lineTo(x2, WIN + 30); ctx.lineTo(x3, WIN + 30); ctx.fill();
  };
  post(150, 196, 168, 110);
  post(1404, 1450, 1490, 1432);
  // door frames at the far sides
  ctx.fillStyle = '#9c8a52';
  ctx.fillRect(L, 0, Math.max(0, -L) + 8, WIN + 30);
  ctx.fillRect(VW - 8, 0, R - VW + 8, WIN + 30);
  // magnetic compass hanging from the top of the windshield
  ctx.fillStyle = '#1a1a1c'; ctx.fillRect(792, 20, 16, 132);
  rr(ctx, 760, 146, 80, 62, 10); ctx.fill();
  circle(ctx, 800, 177, 25, '#f2f2ee');
  ctx.save(); ctx.beginPath(); ctx.arc(800, 177, 25, 0, TAU); ctx.clip();
  txt(ctx, '6', 784, 177, 15, '#111', 'center', 800); txt(ctx, 'E', 800, 177, 18, '#111', 'center', 800); txt(ctx, '12', 818, 177, 13, '#111', 'center', 800);
  ctx.restore();
  ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(800, 152); ctx.lineTo(800, 202); ctx.stroke();

  // the little pilot-side window you shout "CLEAR!" out of
  const c = G.SPOTS.clear;
  ctx.fillStyle = p.cleared ? 'rgba(46,204,113,0.35)' : 'rgba(255,255,255,0.16)';
  rr(ctx, c.x + 4, c.y + 6, c.w - 8, c.h - 12, 12); ctx.fill();
  ctx.strokeStyle = '#d5c385'; ctx.lineWidth = 4; ctx.stroke();
  txt(ctx, 'SHOUT', c.x + c.w / 2, c.y + 38, 22, '#fff', 'center', 800);
  txt(ctx, '“CLEAR!”', c.x + c.w / 2, c.y + 70, 22, '#fff', 'center', 800);
}

// ---------- instrument panel ----------
function asi(ctx, x, y, r, kt) {
  dialBase(ctx, x, y, r);
  const A = v => -Math.PI / 2 + clamp(v, 0, 200) / 200 * TAU * 0.92;
  arcBand(ctx, x, y, r * 0.72, A(33), A(85), 6, '#f2f2f2');
  arcBand(ctx, x, y, r * 0.84, A(41), A(129), 7, '#2ecc71');
  arcBand(ctx, x, y, r * 0.84, A(129), A(163), 7, '#f1c40f');
  ticks(ctx, x, y, r * 0.95, A, 20, 200, 10, 7, 2, '#ddd');
  ticks(ctx, x, y, r * 0.95, A, 163, 163, 1, 14, 4, '#e74c3c');
  for (let v = 40; v <= 160; v += 20) { const a = A(v); txt(ctx, String(v), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, 12, '#eee', 'center', 700); }
  txt(ctx, 'AIRSPEED', x, y - r * 0.26, 9, '#bbb'); txt(ctx, 'KNOTS', x, y + r * 0.3, 9, '#bbb');
  needle(ctx, x, y, r * 0.82, A(kt), 4, '#fff');
}
function attitude(ctx, x, y, r, pitch) {
  dialBase(ctx, x, y, r);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.clip();
  const off = pitch * r * 2.4;
  ctx.fillStyle = '#3d8fd6'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x - r, y + off, 2 * r, 2 * r);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - r, y + off); ctx.lineTo(x + r, y + off); ctx.stroke();
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x - r * 0.25, y + off + d * r * 0.3); ctx.lineTo(x + r * 0.25, y + off + d * r * 0.3); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#ff9f1a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x - r * 0.2, y); ctx.lineTo(x - r * 0.1, y + 8);
  ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 0.2, y); ctx.lineTo(x + r * 0.1, y + 8); ctx.stroke();
  circle(ctx, x, y, 3, '#ff9f1a');
}
function altimeter(ctx, x, y, r, ft) {
  dialBase(ctx, x, y, r);
  const A = v => -Math.PI / 2 + v / 10 * TAU;
  ticks(ctx, x, y, r * 0.95, A, 0, 9.8, 0.2, 5, 1.5, '#ccc');
  for (let v = 0; v < 10; v++) { const a = A(v); txt(ctx, String(v), x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 14, '#eee', 'center', 700); }
  txt(ctx, 'ALT', x, y + r * 0.32, 9, '#bbb');
  needle(ctx, x, y, r * 0.5, A(ft / 1000 % 10), 5, '#fff');
  needle(ctx, x, y, r * 0.82, A(ft / 100 % 10), 3, '#fff');
}
function turnCoord(ctx, x, y, r) {
  dialBase(ctx, x, y, r);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x + r * 0.6, y); ctx.moveTo(x, y - r * 0.18); ctx.lineTo(x, y + r * 0.1); ctx.stroke();
  circle(ctx, x, y, 6, '#fff');
  rr(ctx, x - r * 0.4, y + r * 0.42, r * 0.8, 14, 7); ctx.fillStyle = '#e8e2c8'; ctx.fill();
  circle(ctx, x, y + r * 0.42 + 7, 6, '#111');
  txt(ctx, 'L', x - r * 0.72, y + r * 0.12, 11, '#eee'); txt(ctx, 'R', x + r * 0.72, y + r * 0.12, 11, '#eee');
}
function heading(ctx, x, y, r, hdg) {
  dialBase(ctx, x, y, r);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-hdg * Math.PI / 180);
  const labels = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
  for (let i = 0; i < 36; i++) {
    const a = i * TAU / 36 - Math.PI / 2;
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); ctx.lineTo(Math.cos(a) * r * (i % 3 ? 0.88 : 0.8), Math.sin(a) * r * (i % 3 ? 0.88 : 0.8)); ctx.stroke();
    if (i % 3 === 0) {
      ctx.save(); ctx.rotate(i * TAU / 36); txt(ctx, labels[i / 3], 0, -r * 0.62, 12, '#eee', 'center', 700); ctx.restore();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#ff9f1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y - r * 0.78); ctx.stroke();
  ctx.fillStyle = '#ff9f1a';
  ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 5, y + 10); ctx.lineTo(x - 5, y + 10); ctx.fill();
  ctx.fillRect(x - 16, y - 2, 32, 4);
}
function vsi(ctx, x, y, r, fpm) {
  dialBase(ctx, x, y, r);
  const A = v => Math.PI + clamp(v, -2000, 2000) / 2000 * Math.PI * 0.9;
  ticks(ctx, x, y, r * 0.95, A, -2000, 2000, 500, 8, 2, '#ddd');
  for (const v of [5, 10, 15]) { for (const sgn of [-1, 1]) { const a = A(sgn * v * 100); txt(ctx, String(v), x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68, 11, '#eee', 'center', 700); } }
  txt(ctx, 'UP', x - r * 0.3, y - r * 0.32, 9, '#bbb'); txt(ctx, 'DN', x - r * 0.3, y + r * 0.32, 9, '#bbb');
  txt(ctx, 'VERT SPEED', x + r * 0.15, y + r * 0.02, 8, '#bbb');
  needle(ctx, x, y, r * 0.8, A(fpm), 4, '#fff');
}
function tach(ctx, x, y, r, rpm) {
  dialBase(ctx, x, y, r);
  const A = v => Math.PI * 0.75 + clamp(v, 0, 3500) / 3500 * Math.PI * 1.5;
  arcBand(ctx, x, y, r * 0.84, A(2100), A(2700), 7, '#2ecc71');
  ticks(ctx, x, y, r * 0.95, A, 0, 3500, 100, 5, 1.5, '#ccc');
  ticks(ctx, x, y, r * 0.95, A, 2700, 2700, 1, 14, 4, '#e74c3c');
  for (let v = 0; v <= 35; v += 5) { const a = A(v * 100); txt(ctx, String(v), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, 12, '#eee', 'center', 700); }
  txt(ctx, 'RPM', x, y - r * 0.28, 10, '#bbb'); txt(ctx, 'x100', x, y + r * 0.28, 8, '#bbb');
  needle(ctx, x, y, r * 0.82, A(rpm), 4, '#fff');
}
function miniGauge(ctx, x, y, label, v, green, red) {
  const r = 22;
  const A = u => Math.PI + clamp(u, 0, 1) * Math.PI;
  circle(ctx, x, y, r + 4, '#0c0c0e');
  if (green) arcBand(ctx, x, y, r - 3, A(green[0]), A(green[1]), 5, '#2ecc71');
  if (red) arcBand(ctx, x, y, r - 3, A(red[0]), A(red[1]), 5, '#e74c3c');
  needle(ctx, x, y, r - 2, A(v), 2.5, '#fff');
  txt(ctx, label, x, y + 16, 10, '#ddd', 'center', 700);
}

function rockerToggle(ctx, x, y, label, on) {
  // small bat-handle toggle switch, like the rows in the photo
  circle(ctx, x, y, 11, '#9a9ca2');
  circle(ctx, x, y, 7, '#2a2b2f');
  ctx.strokeStyle = '#d8dade'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (on ? -22 : 22)); ctx.stroke();
  circle(ctx, x, y + (on ? -22 : 22), 5, '#f2f3f5');
  txt(ctx, label, x, y + 38, 11, '#e9e6df', 'center', 700);
}

function masterSwitch(ctx, x, y, on) {
  txt(ctx, 'MASTER', x + 50, y + 10, 14, '#fff', 'center', 800);
  for (const [i, lab] of [[0, 'ALT'], [1, 'BAT']]) {
    const bx = x + 10 + i * 42, by = y + 24;
    ctx.fillStyle = '#111'; rr(ctx, bx - 3, by - 3, 42, 82, 6); ctx.fill();
    const top = on ? '#ff5a4f' : '#8e1c16', bot = on ? '#8e1c16' : '#d7392f';
    ctx.fillStyle = top; rr(ctx, bx, by, 36, 38, 5); ctx.fill();
    ctx.fillStyle = bot; rr(ctx, bx, by + 38, 36, 38, 5); ctx.fill();
    txt(ctx, lab, bx + 18, by + (on ? 19 : 57), 12, '#fff', 'center', 800);
  }
}

function ignition(ctx, x, y, p) {
  txt(ctx, 'IGNITION', x, y - 54, 12, '#fff', 'center', 800);
  circle(ctx, x, y, 42, '#8d8f94');
  circle(ctx, x, y, 34, '#2b2c30');
  const pos = { OFF: -150, R: -112, L: -78, BOTH: -42, START: 0 };
  for (const [k, deg] of Object.entries(pos)) {
    const a = deg * Math.PI / 180;
    txt(ctx, k, x + Math.cos(a) * 58 + (k === 'START' ? 10 : 0), y + Math.sin(a) * 58, 11, k === 'START' ? '#ffb020' : '#e9e6df', 'center', 800);
  }
  const setting = p.cranking ? 'START' : p.running || p.warm ? 'BOTH' : 'OFF';
  ctx.save(); ctx.translate(x, y); ctx.rotate((pos[setting] + 90) * Math.PI / 180);
  ctx.fillStyle = '#c9ccd2'; rr(ctx, -6, -30, 12, 60, 4); ctx.fill();
  ctx.fillStyle = '#1b1b1d'; rr(ctx, -16, -48, 32, 26, 8); ctx.fill();
  ctx.restore();
  circle(ctx, x, y, 6, '#666');
}

function pushPull(ctx, x, holeY, outAmount, kind, label) {
  txt(ctx, label, x, holeY - 22, 12, '#fff', 'center', 800);
  circle(ctx, x, holeY, 12, '#0a0a0b');
  const ky = holeY + 14 + outAmount * 44;
  ctx.strokeStyle = '#b9bcc2'; ctx.lineWidth = 9; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x, holeY); ctx.lineTo(x, ky); ctx.stroke();
  if (kind === 'throttle') {
    circle(ctx, x, ky, 25, '#101012');
    ctx.strokeStyle = '#3a3b40'; ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 16, ky + Math.sin(a) * 16); ctx.lineTo(x + Math.cos(a) * 24, ky + Math.sin(a) * 24); ctx.stroke(); }
    circle(ctx, x - 6, ky - 7, 5, 'rgba(255,255,255,0.15)');
  } else if (kind === 'mixture') {
    ctx.fillStyle = '#d7261e';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, rr2 = i % 2 ? 19 : 24; ctx.lineTo(x + Math.cos(a) * rr2, ky + Math.sin(a) * rr2); }
    ctx.fill();
    circle(ctx, x - 6, ky - 7, 5, 'rgba(255,255,255,0.25)');
  } else {
    circle(ctx, x, ky, 16, kind === 'primer' ? '#cfd1d6' : '#8d8f94');
    circle(ctx, x - 4, ky - 5, 4, 'rgba(255,255,255,0.35)');
  }
}

function fuelSelector(ctx, x, y, setting) {
  ctx.fillStyle = '#2a2420'; rr(ctx, x - 62, y - 40, 124, 90, 10); ctx.fill();
  circle(ctx, x, y, 28, '#e9e6df');
  circle(ctx, x, y, 24, '#2c2d31');
  const ang = { LEFT: Math.PI, BOTH: -Math.PI / 2, RIGHT: 0, OFF: Math.PI / 2 }[setting];
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#d7261e';
  ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(-14, -9); ctx.lineTo(-18, 0); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
  ctx.restore();
  txt(ctx, 'LEFT', x - 46, y + 2, 10, '#fff', 'center', 800);
  txt(ctx, 'RIGHT', x + 47, y + 2, 10, '#fff', 'center', 800);
  txt(ctx, 'BOTH', x, y - 33, 10, '#fff', 'center', 800);
  txt(ctx, 'OFF', x, y + 38, 10, '#ff8080', 'center', 800);
}

function flapLever(ctx, p) {
  const s = G.SPOTS.flaps, cx = s.x + 100;
  txt(ctx, 'WING FLAPS', s.x + s.w / 2, s.y + 22, 14, '#fff', 'center', 800);
  ctx.fillStyle = '#0a0a0b'; rr(ctx, cx - 9, s.y + 50, 18, 230, 9); ctx.fill();
  const notchY = f => s.y + 62 + f / 10 * 70;
  for (const f of [0, 10, 20, 30]) {
    txt(ctx, f === 0 ? 'UP 0°' : f === 30 ? 'FULL' : f + '°', s.x + 34, notchY(f), 14, '#e9e6df', 'center', 800);
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 20, notchY(f)); ctx.lineTo(cx - 12, notchY(f)); ctx.stroke();
  }
  const y = notchY(p.flaps);
  ctx.fillStyle = '#f1f1ee';
  ctx.beginPath(); ctx.moveTo(cx - 36, y - 12); ctx.lineTo(cx + 40, y - 6); ctx.lineTo(cx + 40, y + 8); ctx.lineTo(cx - 36, y + 14); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.stroke();
}

function checklistCard(ctx, p, compact) {
  const x = 1108, y = 462, w = 276, h = 352;
  ctx.fillStyle = '#f7f5ef'; rr(ctx, x, y, w, h, 8); ctx.fill();
  ctx.fillStyle = '#d0322a'; rr(ctx, x, y, w, 40, 8); ctx.fill(); ctx.fillRect(x, y + 24, w, 16);
  const steps = G.STEPS, n = steps.length;
  txt(ctx, compact ? `CHECKLIST  ${Math.min(p.step + 1, n)}/${n}` : 'ENGINE START & TAKEOFF', x + w / 2, y + 21, compact ? 20 : 15, '#fff', 'center', 800);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; rr(ctx, x, y, w, h, 8); ctx.stroke();
  const first = compact ? clamp(p.step - 1, 0, n - 5) : 0, count = compact ? 5 : n;
  const lh = compact ? 60 : 25.5, fs = compact ? 24 : 17;
  for (let k = 0; k < count; k++) {
    const i = first + k; if (i >= n) break;
    const ly = y + 62 + k * lh + (compact ? 6 : 0);
    const skipped = p.skipped.includes(i), done = i < p.step, cur = i === p.step && !p.done;
    if (cur) { ctx.fillStyle = '#ffd970'; ctx.fillRect(x + 6, ly - lh / 2 + 1, w - 12, lh - 2); }
    const mark = skipped ? '!' : done ? '✓' : cur ? '▶' : String(i + 1);
    const col = skipped ? '#c0601a' : done ? '#7c8a72' : '#1d1d1d';
    txt(ctx, mark, x + 22, ly, fs, col, 'center', 800);
    const label = steps[i].label && (cur || done) ? steps[i].label(p) : steps[i].short;
    txt(ctx, label, x + 40, ly, fs, col, 'left', cur ? 800 : 600);
    if (done && !skipped) {
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 40, ly); ctx.lineTo(x + 40 + tw, ly); ctx.stroke();
    }
  }
}

function yoke(ctx, pulled) {
  const d = pulled ? 22 : 0, cx = 450;
  ctx.fillStyle = '#6b6e75'; ctx.fillRect(cx - 14, 740, 28, 80 + d);
  ctx.save();
  ctx.translate(cx, 846 + d); ctx.scale(pulled ? 1.07 : 1, pulled ? 1.07 : 1);
  ctx.strokeStyle = '#141416'; ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-160, -62); ctx.lineTo(-150, 18); ctx.lineTo(-40, 26); ctx.lineTo(40, 26); ctx.lineTo(150, 18); ctx.lineTo(160, -62);
  ctx.stroke();
  ctx.strokeStyle = '#3c3d42'; ctx.lineWidth = 4; ctx.stroke();
  circle(ctx, 0, 6, 34, '#1b1b1e');
  circle(ctx, 0, 6, 26, '#2a2b30');
  txt(ctx, 'CESSNA', 0, 6, 11, '#c9c9c9', 'center', 800);
  ctx.restore();
}

function panel(ctx, p, t, L, R, B, opt) {
  // black panel, gold door trim, brown carpet
  ctx.fillStyle = '#5a4128'; ctx.fillRect(L, 820, R - L, B - 820);
  ctx.fillStyle = '#4a351f'; for (let x = Math.floor(L / 12) * 12; x < R; x += 12) ctx.fillRect(x, 820, 2, B - 820);
  ctx.fillStyle = '#a89262'; ctx.fillRect(L, 440, Math.max(0, -L) + 20, 380); ctx.fillRect(VW - 20, 440, R - VW + 20, 380);
  ctx.fillStyle = '#141416'; rr(ctx, 14, 438, VW - 28, 386, 26); ctx.fill();
  // glareshield
  ctx.fillStyle = '#0d0d0f';
  ctx.beginPath(); ctx.moveTo(L, 412); ctx.quadraticCurveTo(800, 384, R, 412); ctx.lineTo(R, 466); ctx.quadraticCurveTo(800, 446, L, 466); ctx.closePath(); ctx.fill();
  for (let x = 60; x < VW; x += 150) screw(ctx, x, 478);

  // placards like a real panel
  txt(ctx, p.reg, 112, 494, 16, '#f2f2f2', 'left', 800, true);
  circle(ctx, 252, 494, 11, p.stall ? '#ff2a2a' : '#5a1210');
  if (p.stall) circle(ctx, 252, 494, 18, 'rgba(255,40,40,0.35)');
  txt(ctx, 'STALL', 252, 470, 9, '#ddd', 'center', 800);

  const pitch = p.airborne ? Math.min(1, (t - p.finishT) * 0.8) * 0.22 : p.rotT * 0.1;
  asi(ctx, 330, 530, 54, p.speed);
  attitude(ctx, 450, 530, 54, pitch);
  altimeter(ctx, 570, 530, 54, p.alt * 900);
  turnCoord(ctx, 330, 655, 54);
  heading(ctx, 450, 655, 54, 90);
  vsi(ctx, 570, 655, 54, p.airborne ? 700 : 0);
  tach(ctx, 702, 660, 50, p.rpm);

  // engine cluster: fuel L/R, oil temp, oil pressure (tap it to check oil)
  ctx.fillStyle = '#0b0b0c'; rr(ctx, 640, 468, 124, 118, 10); ctx.fill();
  miniGauge(ctx, 672, 502, 'FUEL L', 0.12, null, [0, 0.1]);
  miniGauge(ctx, 733, 502, 'FUEL R', 0.2, null, [0, 0.1]);
  miniGauge(ctx, 672, 560, 'OIL T', p.oilT, [0.4, 0.85], null);
  miniGauge(ctx, 733, 560, 'OIL P', p.oil, [0.6, 0.95], [0, 0.1]);

  // radio stack, lit when the master is on
  ctx.fillStyle = '#0e0f11'; rr(ctx, 800, 468, 292, 158, 8); ctx.fill();
  const lit = p.master, dig = lit ? '#4dff7a' : '#173a20', red = lit ? '#ff5a3c' : '#3a1a14';
  ctx.fillStyle = '#1c1d21'; rr(ctx, 810, 476, 272, 30, 4); ctx.fill();
  for (let i = 0; i < 9; i++) circle(ctx, 828 + i * 30, 491, 7, lit && i === 2 ? '#7ad1ff' : '#3a3b40');
  ctx.fillStyle = '#050505'; rr(ctx, 810, 512, 272, 40, 4); ctx.fill();
  txt(ctx, '122.80  121.50', 946, 533, 22, red, 'center', 700, true);
  ctx.fillStyle = '#050505'; rr(ctx, 810, 558, 272, 28, 4); ctx.fill();
  txt(ctx, 'NAV 110.50  113.90', 946, 572, 16, dig, 'center', 700, true);
  ctx.fillStyle = '#050505'; rr(ctx, 810, 592, 272, 28, 4); ctx.fill();
  txt(ctx, 'XPDR 7700  ALT', 946, 606, 16, dig, 'center', 700, true);

  // switch row (only the beacon matters for the checklist)
  const sw = [['BCN', 840, p.beacon], ['LAND', 892, false], ['TAXI', 944, false], ['NAV', 996, false], ['STROBE', 1048, false]];
  for (const [lab, x, on] of sw) rockerToggle(ctx, x, 664, lab, on);

  masterSwitch(ctx, 102, 506, p.master);
  ignition(ctx, 150, 702, p);
  pushPull(ctx, 740, 752, p.primeAnim || 0, 'primer', 'PRIMER');
  pushPull(ctx, 830, 752, 0.15, 'carb', 'CARB HT');
  pushPull(ctx, 920, 752, 1 - p.throttle, 'throttle', 'THROTTLE');
  pushPull(ctx, 1010, 752, p.mixture ? 0 : 1, 'mixture', 'MIXTURE');
  fuelSelector(ctx, 880, 862, p.fuel);
  flapLever(ctx, p);
  checklistCard(ctx, p, opt.compact);
  yoke(ctx, p.pull);

  // hint: after a few seconds stuck, the control you need glows
  if (opt.own && !p.done && opt.racing && t - p.stepSince > 5 && t >= p.lockUntil) {
    const s = G.SPOTS[G.STEPS[p.step].ctrls[0]];
    ctx.strokeStyle = `rgba(255,217,112,${0.45 + 0.4 * Math.sin(t * 6)})`; ctx.lineWidth = 6;
    rr(ctx, s.x - 4, s.y - 4, s.w + 8, s.h + 8, 14); ctx.stroke();
  }
  // keyboard letters for computer players
  if (opt.keys) {
    for (const [id, s] of Object.entries(G.SPOTS)) {
      const k = G.KEYLABEL[id]; if (!k) continue;
      ctx.font = '700 15px ui-monospace, Menlo, monospace';
      const w = ctx.measureText(k).width + 12;
      const kx = id === 'clear' ? s.x + 8 : s.x + s.w - w - 2, ky = s.y + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; rr(ctx, kx, ky, w, 22, 5); ctx.fill();
      txt(ctx, k, kx + w / 2, ky + 11.5, 15, '#111', 'center', 700, true);
    }
  }
}

function hud(ctx, p, t, opt) {
  const fs = opt.mini ? 54 : opt.compact ? 46 : 36;
  const locked = opt.racing && t < p.lockUntil;
  if (locked) { ctx.fillStyle = 'rgba(140,0,0,0.25)'; ctx.fillRect(-2000, -500, 5600, WIN + 500); }
  const banner = (lines, y, color, size) => {
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + size * 1.4, h = lines.length * size * 1.3 + size * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; rr(ctx, 800 - w / 2, y - h / 2, w, h, size * 0.4); ctx.fill();
    lines.forEach((l, i) => txt(ctx, l, 800, y - h / 2 + size * 0.95 + i * size * 1.3, size, color, 'center', 800));
  };
  if (p.msg && t - p.msgT < p.msgDur && !p.done) banner(p.msg.split('\n'), 250, p.msgColor, fs);
  if (!p.done && t < p.floodUntil) banner([`FLOODED · wait ${Math.ceil(p.floodUntil - t)}`], 330, '#ffb84d', fs);
  if (locked) banner([`SPUTTER… ${(p.lockUntil - t).toFixed(1)}s`], 385, '#ff6b6b', Math.round(fs * 1.2));
  if (p.airborne) {
    const w = G.winner && G.winner();
    banner([`${p.reg} is airborne!`, w === p ? (opt.solo ? `${G.fmt(G.RACE_TIME - p.finishT)} to spare` : 'FIRST OFF THE ISLAND') : 'Escaped second'], 270, '#7bed9f', Math.round(fs * 1.3));
  }
  if (p.overrun) banner(['OVERRUN', 'The horde reached the plane'], 280, '#ff6b6b', Math.round(fs * 1.4));
}

// Draw one complete cockpit into a canvas of size cw x ch (device pixels).
G.drawCockpit = (ctx, p, cw, ch, t, opt) => {
  // the "camera" crops off the sky and roof so the panel fills most of the screen
  const C = G.CAMERA, s = Math.min(cw / C.w, ch / C.h);
  const ox = (cw - C.w * s) / 2 - C.x * s, oy = (ch - C.h * s) / 2 - C.y * s;
  p.view = { s, ox, oy };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(0, 0, cw, ch);
  let jx = 0, jy = 0;
  if (p.shake > 0) { jx = (Math.random() - 0.5) * p.shake * 40; jy = (Math.random() - 0.5) * p.shake * 40; }
  ctx.setTransform(s, 0, 0, s, ox + jx * s, oy + jy * s);
  const L = -ox / s - 60, R = (cw - ox) / s + 60, T = -oy / s - 60, B = (ch - oy) / s + 60;
  windshield(ctx, p, t, L, R, T, opt);
  panel(ctx, p, t, L, R, B, opt);
  if (G.drawHands) G.drawHands(ctx, p, t, opt);
  hud(ctx, p, t, opt);
};
})();
