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
function screw(ctx, x, y) { circle(ctx, x, y, 4, '#55585e'); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke(); }

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

function zombieDepth(z, p, t, T) {
  const appearT = z.appear * T;
  if (t < appearT) return -1;
  const k = clamp((t - appearT) / (T - appearT), 0, 1);
  return z.z0 + (z.zEnd - z.z0) * Math.pow(k, 0.7) - p.dist;
}

// ---------- photo art for the cockpit (assets/cockpit and the jungle's ground textures) ----------
const photos = {};
const photo = src => photos[src] || (photos[src] = Object.assign(new Image(), { src }));
const loaded = im => im.complete && im.naturalWidth > 0;
['assets/cockpit/sky.webp', 'assets/cockpit/treeline.webp', 'assets/cockpit/panel.jpg', 'assets/cockpit/glare.jpg', 'assets/jungle/strip.jpg', 'assets/jungle/clear.jpg'].forEach(photo);
const pats = new Map();
function photoPattern(ctx, src) {
  const key = src;
  if (pats.has(key)) return pats.get(key);
  const im = photo(src);
  if (!loaded(im)) return null;
  const pt = ctx.createPattern(im, 'repeat');
  pats.set(key, pt);
  return pt;
}

// The ground ahead in true perspective: each screen row is a slice of the dirt strip and the grass beside it,
// at the depth that row looks at. As the plane rolls, the texture slides toward you, so the runway really moves.
function photoGround(ctx, p, hy, camH, cx, W, L, R, bottom) {
  const strip = photoPattern(ctx, 'assets/jungle/strip.jpg'), grass = photoPattern(ctx, 'assets/jungle/clear.jpg');
  if (!strip || !grass || !strip.setTransform) return false;
  const TILE = 1.6;   // world units per texture tile
  for (let y = Math.ceil(hy + 1); y < bottom; y += 2) {
    const z = camH / (y - hy);
    if (z > 400) continue;
    const s = W * 0.22 / z * TILE / 512, v = (z + p.dist) * 512 / TILE;
    const m = new DOMMatrix().translate(cx, y).scale(s, s).translate(0, -v);
    grass.setTransform(m); ctx.fillStyle = grass; ctx.fillRect(L, y, R - L, 2);
    const half = W * 0.22 / z;   // the strip runs from x = -1 to x = 1
    strip.setTransform(m); ctx.fillStyle = strip; ctx.fillRect(cx - half, y, half * 2, 2);
  }
  // the far end fades into the dusk haze, and the ground darkens toward you away from the sunset
  const haze = ctx.createLinearGradient(0, hy, 0, hy + 70);
  haze.addColorStop(0, 'rgba(150,90,110,0.85)'); haze.addColorStop(1, 'rgba(150,90,110,0)');
  ctx.fillStyle = haze; ctx.fillRect(L, hy, R - L, 70);
  const dusk = ctx.createLinearGradient(0, hy, 0, bottom);
  dusk.addColorStop(0, 'rgba(40,20,50,0.15)'); dusk.addColorStop(1, 'rgba(20,10,25,0.45)');
  ctx.fillStyle = dusk; ctx.fillRect(L, hy, R - L, bottom - hy);
  return true;
}
// the jungle on both sides of the strip: one continuous photo treeline per side, receding in perspective.
// It is drawn as thin vertical slices from the far end toward you; each slice samples the photo at its true
// proportions, and the photo scrolls with the distance rolled, so the trees slide past as you speed up.
const hazed = [];
function hazeCopies(im) {
  if (hazed.length) return hazed;
  for (const a of [0, 0.25, 0.5, 0.7]) {   // dusk haze baked into copies, so it only tints the trees themselves
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    if (a) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(120,80,110,${a})`; g.fillRect(0, 0, c.width, c.height); }
    hazed.push(c);
  }
  return hazed;
}
function photoTrees(ctx, p, t, hy, camH, sx, proj, L, R) {
  const im = photo('assets/cockpit/treeline.webp');
  if (!loaded(im)) return false;
  const copies = hazeCopies(im), iw = im.naturalWidth, ih = im.naturalHeight;
  const W = VW, TREE_H = 1.5;            // trees a bit taller than the strip is wide
  const pxPerUnit = ih / TREE_H;         // photo pixels per world unit along the wall, keeping its proportions
  for (const side of [-1, 1]) {
    let prevX = null;
    for (let z = 70; z > 0.6; z *= 0.93) {
      const zn = z * 0.93;
      const xa = sx(side * 2.3, z), xb = sx(side * 2.3, zn);
      const w = Math.abs(xb - xa) + 1;
      const h = W * 0.22 * TREE_H / z, gy = proj(z) + 3;
      const left = Math.min(xa, xb);
      if (left > R + 20 || left + w < L - 20) continue;
      let u = ((z + p.dist) * pxPerUnit * (side < 0 ? 1 : 0.83) + (side < 0 ? 0 : iw * 0.5)) % iw;
      const du = Math.max(1, (z - zn) * pxPerUnit);
      if (u + du > iw) u = 0;
      const lvl = z > 30 ? 3 : z > 15 ? 2 : z > 6 ? 1 : 0;
      ctx.drawImage(copies[lvl], u, 0, du, ih, left, gy - h, w, h);
      prevX = xb;
    }
    void prevX;
  }
  return true;
}

// The ground and treeline are hundreds of thin slices, but they only change while the plane rolls. So they're painted
// once into a picture for each cockpit and reused until the plane moves, instead of being redrawn every frame.
const outsides = new WeakMap();
function photoOutside(ctx, p, t, hy, camH, cx, W, sx, proj, L, R) {
  const TOP = -300, BOTTOM = WIN + 60, vw = R - L, vh = BOTTOM - TOP;
  const scale = Math.min(1.25, Math.max(0.35, ctx.canvas.width / vw)) * (G.Quality.lite ? 0.8 : 1);
  let o = outsides.get(p);
  if (!o) { o = { cv: document.createElement('canvas'), key: '' }; outsides.set(p, o); }
  const key = [p.dist.toFixed(3), hy.toFixed(1), camH.toFixed(1), L, R, scale].join();
  if (o.key !== key) {
    const g = o.cv.getContext('2d'), pw = Math.ceil(vw * scale), ph = Math.ceil(vh * scale);
    if (o.cv.width !== pw || o.cv.height !== ph) { o.cv.width = pw; o.cv.height = ph; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
    g.setTransform(scale, 0, 0, scale, -L * scale, -TOP * scale);
    if (!photoGround(g, p, hy, camH, cx, W, L, R, BOTTOM) || !photoTrees(g, p, t, hy, camH, sx, proj, L, R)) return;
    o.key = key;
  }
  ctx.drawImage(o.cv, L, TOP, vw, vh);
}

// ---------- the view out the windshield ----------
function world(ctx, p, t, L, R) {
  const W = VW, winH = WIN, cx = 800;
  const sky = photo('assets/cockpit/sky.webp');
  const usePhoto = loaded(sky) && loaded(photo('assets/jungle/strip.jpg')) && loaded(photo('assets/jungle/clear.jpg')) && loaded(photo('assets/cockpit/treeline.webp'));
  const pitch = p.airborne ? Math.min(1, (t - p.finishT) * 0.8) * 0.22
    : p.rotT * 0.1 + (p.stall ? Math.abs(Math.sin(t * 14)) * 0.04 : 0);
  const hy = winH * ((usePhoto ? 0.68 : 0.6) + pitch);   // the photo view sits the horizon a little lower, for more sky
  const camH = winH * 0.2 * (1 + p.alt * 3);
  const proj = z => hy + camH / z;
  const sx = (x, z) => cx + x * W * 0.22 / z;

  // the same island as the title and story: dusk sky, volcano, far hills, distant palms, fog, fireflies
  // (wide enough that the volcano sits right at the end of the strip)
  if (usePhoto) {
    // the dusk sky across the whole windshield, then the same volcano you saw from base camp, at the end of the strip
    const grad = ctx.createLinearGradient(0, hy - 420, 0, hy + 10);
    grad.addColorStop(0, '#2a2048'); grad.addColorStop(0.55, '#4a2f5c'); grad.addColorStop(0.85, '#a8554a'); grad.addColorStop(1, '#3a2230');
    ctx.fillStyle = grad; ctx.fillRect(L, -900, R - L, hy + 910);
    const sw = 760, sh = sw * sky.naturalHeight / sky.naturalWidth;
    ctx.drawImage(sky, cx - sw / 2, hy + 14 - sh, sw, sh);
    photoOutside(ctx, p, t, hy, camH, cx, W, sx, proj, L, R);
  } else {
    const SH = 640, top = hy - 0.62 * SH;
    const SW = Math.max((cx - L) / 0.245, (R - cx) / 0.755) + 40, left = cx - 0.245 * SW;
    ctx.save(); ctx.translate(left, top);
    G.Scene.paint(ctx, SW, SH, t, { backdrop: true, px: 0.9 });
    ctx.restore();
    ctx.fillStyle = '#15231a'; ctx.fillRect(L, hy + 18, R - L, 900);
  }
  const zN = 0.3, zF = 80;
  if (!usePhoto) {
  // the dirt strip
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
    ctx.fillStyle = side < 0 ? '#0e1a14' : '#11201a';
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
      G.Scene.palm(ctx, sx(xw, z), proj(z) - winH * 0.15 / z, winH * (0.42 + ((k * 13) % 5) / 14) / z, -side * 0.4, Math.sin(t * 0.8 + k), shade('#0e1a14', 1, haze * 0.8));
    }
  }
  }
  // edge markers along the strip (both looks)
  if (usePhoto) {
    const off = p.dist % 2;
    for (let k = 0; k < 30; k++) {
      const z = k * 2 + 1 - off;
      if (z < zN + 0.05) continue;
      const y = proj(z), sz = W * 0.012 / z;
      ctx.fillStyle = `rgba(232,226,208,${clamp(1 - z / 50, 0.15, 0.9)})`;
      ctx.fillRect(sx(-1.08, z) - sz, y - sz * 0.5, sz * 2, sz); ctx.fillRect(sx(1.08, z) - sz, y - sz * 0.5, sz * 2, sz);
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
  // they reach the windows at half the cockpit clock and keep piling up
  const T0 = G.RACE_TIME * 0.5, step = G.RACE_TIME * 0.5 / 7;
  let n = p.overrun ? 7 : (!p.airborne && opt.racing && t > T0 ? Math.ceil((t - T0) / step) : 0);
  n = Math.min(n, 7);
  const spots = [[60, 1], [1540, 1.05], [330, 0.85], [1240, 0.9], [-40, 1.15], [1640, 1.12], [800, 1.2]];
  for (let i = 0; i < n; i++) {
    const [fx, sc] = spots[i];
    const rise = p.overrun ? 1 : clamp(t - (T0 + i * step), 0, 1);
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
  const hl = ctx.createLinearGradient(0, T, 0, 24);
  hl.addColorStop(0, '#5d574c'); hl.addColorStop(0.7, '#9b9382'); hl.addColorStop(1, '#bdb4a0');
  ctx.fillStyle = hl; ctx.fillRect(L, T, R - L, 24 - T);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
  for (let y = 10; y > T; y -= 46) { ctx.beginPath(); ctx.moveTo(L, y); ctx.quadraticCurveTo(800, y - 14, R, y); ctx.stroke(); }
  if (T < -40) { ctx.fillStyle = '#d8d2c4'; rr(ctx, 760, Math.max(T + 10, -70), 80, 26, 10); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke(); }
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

// ---------- instrument panel (the gauges themselves are in instruments.js) ----------
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

function checklistCard(ctx, p, compact, highlight) {
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
    if (cur && highlight) { ctx.fillStyle = '#ffd970'; ctx.fillRect(x + 6, ly - lh / 2 + 1, w - 12, lh - 2); }
    const mark = skipped ? '!' : done ? '✓' : cur && highlight ? '▶' : String(i + 1);
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

// ---------- the cabin below and beside the panel ----------
// trouser color by character, and bare knees for shorts
const PANTS = { ivy: ['#454c62', null], wren: ['#7c6b47', null], elias: ['#3d4352', null], kip: ['#8c7850', '#7a4e33'], briar: ['#7c7350', '#b58a63'] };
function interior(ctx, p, t, L, R, B, kneeboard) {
  const fy = 820;
  // kick panel under the dash, then the carpet
  let g = ctx.createLinearGradient(0, fy, 0, fy + 170);
  g.addColorStop(0, '#17161a'); g.addColorStop(1, '#2e241b');
  ctx.fillStyle = g; ctx.fillRect(L, fy, R - L, Math.max(0, B - fy));
  const cy = fy + 140;
  if (B > cy) {
    g = ctx.createLinearGradient(0, cy, 0, B);
    g.addColorStop(0, '#4a3523'); g.addColorStop(1, '#2a1c12');
    ctx.fillStyle = g; ctx.fillRect(L, cy, R - L, B - cy);
    for (let y = cy; y < B; y += 5) {          // carpet pile: light and dark flecks
      for (let x = Math.floor(L / 7) * 7 + ((y / 5) % 2) * 3; x < R; x += 7) {
        const n = ((x * 73856093) ^ (y * 19349663)) & 7;
        ctx.fillStyle = n < 3 ? 'rgba(0,0,0,0.2)' : n > 5 ? 'rgba(255,220,180,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(x, y, 3, 2);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(L, cy - 2, R - L, 5);          // where the kick panel meets the floor
    ctx.fillStyle = 'rgba(255,220,180,0.08)'; ctx.fillRect(L, cy + 3, R - L, 2);
    for (const px of [380, 520, 1080, 1220]) {     // pedal shadows on the carpet
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px - 12, cy + 18, 40, 12, 0, 0, TAU); ctx.fill();
    }
    for (const wx of [450, 1150]) {         // worn spots under the pedals
      const w = ctx.createRadialGradient(wx, cy + 40, 0, wx, cy + 40, 160);
      w.addColorStop(0, 'rgba(150,120,90,0.25)'); w.addColorStop(1, 'rgba(150,120,90,0)');
      ctx.fillStyle = w; ctx.fillRect(wx - 160, cy - 120, 320, 320);
    }
  }
  // rudder pedals with toe brakes, pilot and copilot pairs
  for (const px of [380, 520, 1080, 1220]) {
    ctx.fillStyle = '#0d0d0e'; ctx.fillRect(px - 6, fy, 12, 70);
    ctx.save(); ctx.translate(px, fy + 92);
    ctx.fillStyle = '#1d1d20'; rr(ctx, -32, -34, 64, 76, 10); ctx.fill();
    ctx.fillStyle = '#2b2b2f'; rr(ctx, -28, -46, 56, 20, 6); ctx.fill();        // toe brake
    ctx.strokeStyle = '#3c3c42'; ctx.lineWidth = 3;
    for (let k = -2; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-24, k * 10); ctx.lineTo(24, k * 10); ctx.stroke(); }
    ctx.restore();
  }
  // center console between the seats: the trim wheel beside the fuel selector
  g = ctx.createLinearGradient(780, 0, 980, 0);
  g.addColorStop(0, '#141416'); g.addColorStop(0.5, '#26262a'); g.addColorStop(1, '#141416');
  ctx.fillStyle = g;
  // a short pedestal that flares onto the floor (the 172 has no tall console)
  const pb = Math.min(B + 40, fy + 175);
  ctx.beginPath(); ctx.moveTo(826, fy); ctx.lineTo(934, fy); ctx.quadraticCurveTo(944, pb - 40, 980, pb); ctx.lineTo(780, pb); ctx.quadraticCurveTo(816, pb - 40, 826, fy); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(880, pb, 110, 14, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#060607'; rr(ctx, 798, fy + 18, 22, 70, 6); ctx.fill();
  ctx.fillStyle = '#2f3034'; ctx.beginPath(); ctx.ellipse(809, fy + 53 + Math.sin(t * 0.3) * 2, 9, 30, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a4c52'; ctx.lineWidth = 2;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(802, fy + 53 + k * 7); ctx.lineTo(816, fy + 53 + k * 7); ctx.stroke(); }
  txt(ctx, 'TRIM', 809, fy + 10, 10, '#cfcfcf', 'center', 800);
  // lower edge of the panel
  ctx.fillStyle = '#0a0a0b'; rr(ctx, 14, fy - 8, VW - 28, 18, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(30, fy - 7, VW - 60, 2);
  // the pilot's lap: knees just below the panel, thighs coming toward you, lit by the windshield
  if (B > fy + 120) {
    const [pant, skin] = PANTS[p.char] || PANTS.ivy;
    const ky = fy + 175, bottom = B + 40;
    ctx.fillStyle = '#5e4a2f';   // seat cushions either side of the lap
    rr(ctx, 120, ky + 120, 130, bottom - ky, 24); ctx.fill();
    rr(ctx, 650, ky + 120, 130, bottom - ky, 24); ctx.fill();
    // the lap between the thighs, in shadow
    const lap = ctx.createLinearGradient(0, ky + 150, 0, bottom);
    lap.addColorStop(0, shadeHex(pant, 0.45)); lap.addColorStop(1, shadeHex(pant, 0.3));
    ctx.fillStyle = lap; ctx.beginPath(); ctx.moveTo(400, ky + 150); ctx.lineTo(500, ky + 150); ctx.lineTo(560, bottom); ctx.lineTo(340, bottom); ctx.fill();
    for (const [kx, lean] of [[330, -1], [570, 1]]) {
      const nearX = kx - lean * 75;   // the thighs come toward you and meet at the lap
      const thigh = () => {
        ctx.beginPath(); ctx.moveTo(kx - 64, ky + 22);
        ctx.quadraticCurveTo(kx, ky - 36, kx + 64, ky + 22);
        ctx.lineTo(nearX + 175, bottom); ctx.lineTo(nearX - 175, bottom); ctx.closePath();
      };
      const lit = ctx.createLinearGradient(0, ky - 30, 0, bottom);
      lit.addColorStop(0, shadeHex(skin || pant, 1.45)); lit.addColorStop(0.35, shadeHex(skin || pant, 1.05)); lit.addColorStop(1, shadeHex(skin || pant, 0.45));
      ctx.fillStyle = lit; thigh(); ctx.fill();
      if (skin) {   // shorts: bare knee, then the khaki hem down the thigh
        ctx.save(); thigh(); ctx.clip();
        const sh = ctx.createLinearGradient(0, ky + 70, 0, bottom);
        sh.addColorStop(0, shadeHex(pant, 1.25)); sh.addColorStop(1, shadeHex(pant, 0.5));
        ctx.fillStyle = sh; ctx.fillRect(kx - 200, ky + 74, 400, bottom);
        ctx.fillStyle = shadeHex(pant, 0.7); ctx.fillRect(kx - 200, ky + 74, 400, 8);
        ctx.restore();
      }
      // roundness: darker along the outer edge, a soft highlight on the kneecap
      ctx.save(); thigh(); ctx.clip();
      const side = ctx.createLinearGradient(kx - 130, 0, kx + 130, 0);
      side.addColorStop(0, 'rgba(0,0,0,0.45)'); side.addColorStop(0.45, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = side; ctx.fillRect(kx - 200, ky - 40, 400, bottom);
      ctx.fillStyle = 'rgba(255,230,200,0.14)'; ctx.beginPath(); ctx.ellipse(kx, ky + 4, 40, 15, 0, 0, TAU); ctx.fill();
      // fabric folds from the knee
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const d of [-22, 14]) { ctx.beginPath(); ctx.moveTo(kx + d, ky + 34); ctx.quadraticCurveTo(kx + d * 1.6 - lean * 10, ky + 110, kx + d * 2.2 - lean * 24, ky + 190); ctx.stroke(); }
      ctx.restore();
    }
    if (kneeboard) {   // a clipboard strapped to the right thigh
      ctx.fillStyle = '#5a3b22'; rr(ctx, 452, fy + 190, 250, Math.min(330, B - fy - 170), 10); ctx.fill();
      ctx.fillStyle = '#b8bcc4'; rr(ctx, 540, fy + 180, 76, 26, 5); ctx.fill();
    }
  }
  // door panels and armrests on either side, when the screen is wide enough to show them
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? L : VW - 14, x1 = side < 0 ? 14 : R;
    if (x1 - x0 < 8) continue;
    g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(side < 0 ? 0 : 1, '#7f6d44'); g.addColorStop(side < 0 ? 1 : 0, '#b29c66');
    ctx.fillStyle = g; ctx.fillRect(x0, 430, x1 - x0, B - 430);
    const w = x1 - x0, cx = side < 0 ? x1 - w * 0.5 : x0 + w * 0.5;
    ctx.fillStyle = '#4b3a24'; rr(ctx, Math.min(x0, x1) + w * 0.12, 760, w * 0.76, 34, 10); ctx.fill();      // armrest
    ctx.fillStyle = '#3d301e'; rr(ctx, Math.min(x0, x1) + w * 0.15, 860, w * 0.7, 120, 8); ctx.fill();     // map pocket
    ctx.fillStyle = '#d9dce2'; rr(ctx, cx - 30, 690, 60, 12, 6); ctx.fill();                                // chrome handle
    circle(ctx, cx, 500, 18, '#1c1c1e'); circle(ctx, cx, 500, 10, '#3a3b40');                               // air vent
  }
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function panel(ctx, p, t, L, R, B, opt) {
  // the cabin, then the black panel
  const kneeboard = B > 1300 && !opt.mini;
  interior(ctx, p, t, L, R, B, kneeboard);
  ctx.fillStyle = '#141416'; rr(ctx, 14, 438, VW - 28, 386, 26); ctx.fill();
  // real crinkle-finish panel paint, lit warm from the windshield above and falling off toward your knees
  const metal = photoPattern(ctx, 'assets/cockpit/panel.jpg');
  if (metal) {
    ctx.save(); rr(ctx, 14, 438, VW - 28, 386, 26); ctx.clip();
    ctx.globalAlpha = 0.9; ctx.fillStyle = metal; ctx.fillRect(14, 438, VW - 28, 386); ctx.globalAlpha = 1;
    const lightG = ctx.createLinearGradient(0, 438, 0, 824);
    lightG.addColorStop(0, 'rgba(255,170,120,0.10)'); lightG.addColorStop(0.35, 'rgba(0,0,0,0)'); lightG.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lightG; ctx.fillRect(14, 438, VW - 28, 386);
    ctx.restore();
  }
  // scuffs and scratches on the old panel paint
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) { const x = 40 + (k * 211) % 1500, y = 450 + (k * 97) % 360; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + (k % 4) * 9, y + 4 - (k % 3) * 3); ctx.stroke(); }
  // glareshield
  const vinyl = photoPattern(ctx, 'assets/cockpit/glare.jpg');
  ctx.fillStyle = vinyl || '#0d0d0f';
  ctx.beginPath(); ctx.moveTo(L, 412); ctx.quadraticCurveTo(800, 384, R, 412); ctx.lineTo(R, 466); ctx.quadraticCurveTo(800, 446, L, 466); ctx.closePath(); ctx.fill();
  if (vinyl) {   // the sunset catching the top edge of the glareshield, and its shadow on the panel below
    const sheen = ctx.createLinearGradient(0, 390, 0, 466);
    sheen.addColorStop(0, 'rgba(255,160,120,0.18)'); sheen.addColorStop(0.3, 'rgba(0,0,0,0.25)'); sheen.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = sheen; ctx.fill();
    const under = ctx.createLinearGradient(0, 462, 0, 520);
    under.addColorStop(0, 'rgba(0,0,0,0.55)'); under.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = under; ctx.fillRect(14, 462, VW - 28, 58);
  }
  for (let x = 60; x < VW; x += 150) screw(ctx, x, 478);

  // placards like a real panel
  txt(ctx, p.reg, 112, 494, 16, '#f2f2f2', 'left', 800, true);
  circle(ctx, 252, 494, 11, p.stall ? '#ff2a2a' : '#5a1210');
  if (p.stall) circle(ctx, 252, 494, 18, 'rgba(255,40,40,0.35)');
  txt(ctx, 'STALL', 252, 470, 9, '#ddd', 'center', 800);

  // the six-pack, tachometer and engine gauges (instruments.js)
  G.Instruments.draw(ctx, p, t, p.planeType || 'c172');

  // radio stack, lit when the master is on
  ctx.fillStyle = '#0e0f11'; rr(ctx, 800, 468, 292, 158, 8); ctx.fill();
  const lit = p.master, dig = lit ? '#4dff7a' : '#173a20', red = lit ? '#ff5a3c' : '#3a1a14';
  ctx.fillStyle = '#1c1d21'; rr(ctx, 810, 476, 272, 30, 4); ctx.fill();
  for (let i = 0; i < 9; i++) circle(ctx, 828 + i * 30, 491, 7, lit && i === 2 ? '#7ad1ff' : '#3a3b40');
  // COM/NAV radio, then the transponder squawking 1200 with its reply light
  ctx.fillStyle = '#050505'; rr(ctx, 810, 512, 272, 40, 4); ctx.fill();
  txt(ctx, 'COM', 830, 524, 9, lit ? '#c9c9c9' : '#333', 'center', 700);
  txt(ctx, '122.800', 892, 535, 20, red, 'center', 700, true);
  txt(ctx, '121.500', 1030, 535, 20, red, 'center', 700, true);
  txt(ctx, 'STBY', 974, 524, 9, lit ? '#c9c9c9' : '#333', 'center', 700);
  ctx.fillStyle = '#050505'; rr(ctx, 810, 558, 272, 28, 4); ctx.fill();
  txt(ctx, 'NAV  110.50   113.90', 946, 572, 16, dig, 'center', 700, true);
  ctx.fillStyle = '#050505'; rr(ctx, 810, 592, 272, 28, 4); ctx.fill();
  txt(ctx, 'XPDR  1200   ALT', 930, 606, 16, dig, 'center', 700, true);
  circle(ctx, 1062, 606, 4, lit && (t * 1.3) % 1 < 0.15 ? '#ffd23a' : '#2a2412');

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
  if (kneeboard) {
    ctx.save(); ctx.translate(462, 1020); ctx.rotate(-0.03); ctx.scale(0.84, 0.84); ctx.translate(-1108, -462);
    checklistCard(ctx, p, false, opt.cardHighlight !== false);
    ctx.restore();
    // a clock and placards where the card used to be
    circle(ctx, 1200, 540, 44, '#0b0b0c'); circle(ctx, 1200, 540, 38, '#141517');
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; ctx.fillStyle = '#ddd'; ctx.fillRect(1200 + Math.cos(a) * 32 - 1.5, 540 + Math.sin(a) * 32 - 1.5, 3, 3); }
    const hh = (17 + t / 3600) % 12, mm = (52 + t / 60) % 60;
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1200, 540); ctx.lineTo(1200 + Math.cos(hh / 12 * TAU - Math.PI / 2) * 20, 540 + Math.sin(hh / 12 * TAU - Math.PI / 2) * 20); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1200, 540); ctx.lineTo(1200 + Math.cos(mm / 60 * TAU - Math.PI / 2) * 30, 540 + Math.sin(mm / 60 * TAU - Math.PI / 2) * 30); ctx.stroke();
    ctx.fillStyle = '#d8d1bd'; rr(ctx, 1120, 620, 240, 54, 4); ctx.fill();
    txt(ctx, 'THIS AIRPLANE MUST BE OPERATED', 1240, 638, 10, '#222', 'center', 800);
    txt(ctx, 'IN THE NORMAL CATEGORY', 1240, 656, 10, '#222', 'center', 800);
    ctx.fillStyle = '#111'; rr(ctx, 1290, 500, 60, 30, 4); ctx.fill(); txt(ctx, 'ELT', 1320, 515, 11, '#e8e8e8', 'center', 800);
  } else checklistCard(ctx, p, opt.compact, opt.cardHighlight !== false);
  yoke(ctx, p.pull);

  const glow = ctx.createRadialGradient(800, 400, 60, 800, 400, 900);
  glow.addColorStop(0, 'rgba(255,165,95,0.12)'); glow.addColorStop(1, 'rgba(255,165,95,0)');
  ctx.fillStyle = glow; ctx.fillRect(L, 430, R - L, B - 430);
  const vig = ctx.createLinearGradient(0, 760, 0, B);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig; ctx.fillRect(L, 760, R - L, B - 760);
  // sun visor folded up above the pilot
  ctx.fillStyle = '#c9c0ab'; ctx.beginPath(); ctx.moveTo(230, 150); ctx.lineTo(560, 150); ctx.lineTo(548, 178); ctx.lineTo(244, 182); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(250, 156, 290, 18); ctx.setLineDash([]);

  // hint: after a few seconds stuck, the control you need glows
  if (opt.own && !p.done && opt.racing && t - p.stepSince >= (opt.hintAfter ?? 5) && t >= p.lockUntil) {
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
G.drawZombie = drawZombie;

G.drawCockpit = (ctx, p, cw, ch, t, opt) => {
  // the "camera" crops off the sky and roof so the panel fills most of the screen
  const C = G.CAMERA, s = Math.min(cw / C.w, ch / C.h);
  const slack = ch - C.h * s;
  // on tall screens, give some of the extra height to a taller windshield and the rest to the cabin
  const ox = (cw - C.w * s) / 2 - C.x * s, oy = (slack > 0 ? slack * 0.4 : slack / 2) - C.y * s;
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
