/* Base camp: "pack your bag". Your character walks around a photoreal camp at dusk.
   Find your two items and pack them. Your rival packs in the same camp,
   so this doubles as the waiting room before the run to the airstrip.
   Keys: arrows or WASD to walk, Space or Enter to pack. Touch: tap where to walk, tap an item to fetch it.
   Positions are in panorama space (0..1 across and down); the ground runs from the back of camp (~0.64) to the front (~0.97). */
(() => {
'use strict';
const G = window.G = window.G || {};
const $ = s => document.querySelector(s);

// x, y: where the item sits (y is where it touches the ground or table); h: its height.
// gx, gy: the spot on the ground you stand on to reach it.
const ITEMS = {
  moonflower: { name: 'Moonflower sample', owner: 'ivy',   x: 0.122, y: 0.700, h: 0.070, gx: 0.150, gy: 0.775 },
  headset:    { name: 'Aviation headset',  owner: 'ivy',   x: 0.232, y: 0.632, h: 0.055, gx: 0.245, gy: 0.745 },
  map:        { name: 'Trail map',         owner: 'wren',  x: 0.648, y: 0.612, h: 0.040, gx: 0.640, gy: 0.765 },
  machete:    { name: 'Machete “Mildred”', owner: 'wren',  x: 0.692, y: 0.760, h: 0.070, gx: 0.705, gy: 0.800 },
  fern:       { name: 'Your favorite fern', owner: 'elias', x: 0.448, y: 0.712, h: 0.070, gx: 0.452, gy: 0.745 },
  journal:    { name: 'Seed journal',      owner: 'elias', x: 0.388, y: 0.812, h: 0.048, gx: 0.410, gy: 0.860 },
  frog:       { name: 'The frog',          owner: 'kip',   x: 0.858, y: 0.790, h: 0.060, gx: 0.845, gy: 0.825 },
  camera:     { name: 'Camera',            owner: 'kip',   x: 0.612, y: 0.826, h: 0.058, gx: 0.590, gy: 0.880 },
};
const GLOWS = [   // warm light sources that flicker: [x, y, radius, rgb]
  [0.505, 0.830, 0.16, '255,150,60'],   // campfire
  [0.158, 0.575, 0.07, '255,190,110'],  // tent lantern
  [0.385, 0.540, 0.09, '255,220,140'],  // greenhouse
];
const ASPECT = 6336 / 2688;   // panorama width / height, so distances across and down feel the same
const START = { x: 0.50, y: 0.93 }, TRAIL = { x: 0.545, y: 0.70 };

// Where you can walk: in front of the tent, greenhouse and crates, up the trail, onto the dock, around the fire.
function backEdge(x) {
  if (x < 0.30) return 0.735;   // the tent and its table
  if (x < 0.47) return 0.725;   // the greenhouse
  if (x < 0.585) return 0.655;  // the trail into the trees
  if (x < 0.78) return 0.755;   // crates and fuel drums
  return 0.77;                  // the dock
}
function walkable(x, y) {
  if (x < 0.03 || x > 0.97 || y > 0.975 || y < backEdge(x)) return false;
  const fx = (x - 0.505) * ASPECT / 0.13, fy = (y - 0.835) / 0.045;   // the campfire
  return fx * fx + fy * fy > 1;
}
// how tall a person is when standing at depth y (bigger toward the front)
const personH = y => 0.23 + (y - 0.74) * 0.7;

// Side-view walk frames (assets/characters/walk/<char>-0..2.png): right foot forward, passing, left foot forward.
// ax: where the body's centre sits across each frame, so frames line up on the torso instead of the swinging legs.
const WALK = {
  ivy: [0.483, 0.41, 0.435], wren: [0.475, 0.496, 0.528], elias: [0.581, 0.609, 0.549], kip: [0.433, 0.477, 0.439],
};
const FIG = { ivy: 436 / 576, wren: 447 / 576, elias: 502 / 576, kip: 472 / 576 };   // figure height in the standing picture
const CYCLE = [0, 1, 2, 1];   // the four beats of one full stride

const imgs = {};
const img = src => imgs[src] || (imgs[src] = Object.assign(new Image(), { src }));
let pano = null;

let el, canvas, ctx, W = 0, H = 0, dpr = 1, running = false, looping = false, last = 0, t = 0;
let o = null, me, keys = {}, got, mine, flies = [], msg = { text: '', until: 0 }, rival = null, bot = null, packedAll = false;
let lineTimer = 0, lastDt = 0, lastSend = 0, nextBeat = 0, pulse = 0, walkTo = null, hintAt = 0, camU = 0.5;

function build() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'camp'; el.className = 'hidden';
  el.innerHTML = `
    <canvas id="campCanvas"></canvas>
    <div class="campTop"><p class="role">Base camp</p><h2 id="campTitle"></h2><p id="campText"></p></div>
    <div class="campRival hidden" id="campRival"></div>
    <div class="campMsg" id="campMsg"></div>
    <div class="campPrompt hidden" id="campPrompt"></div>
    <div class="campBag"><img src="assets/camp/bag.png" alt=""><div><b>Your flight bag</b><div class="campSlots" id="campSlots"></div></div></div>
    <p class="campHelp" id="campHelp"><span class="k">← → ↑ ↓</span> walk <span class="k">Space</span> pack it <span class="tapOnly">Tap the ground to walk, tap an item to fetch it</span></p>
    <div class="campDone hidden" id="campDone"><p id="campDoneText">Bag packed.</p><button type="button" class="hero-btn" id="campRun">Run for the airstrip!</button></div>`;
  document.body.appendChild(el);
  canvas = $('#campCanvas'); ctx = canvas.getContext('2d');
  window.addEventListener('resize', size);
  canvas.addEventListener('pointerdown', tap);
  window.addEventListener('keydown', e => {
    if (!running) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { keys[e.code] = true; walkTo = null; e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (packedAll && !$('#campDone').classList.contains('hidden') && !$('#campRun').classList.contains('hidden')) $('#campRun').click();
      else tryPack();
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  $('#campRun').addEventListener('click', () => { if (o && o.onRun) { const f = o.onRun; o.onRun = null; f(); } });
}

function size() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => x * x * (3 - 2 * x);
// Warm firelight baked into a copy of each cutout once, so the tint never spills onto the scene behind it.
const tints = new Map();
function lit(im, color, alpha, mode = 'source-atop') {
  if (!im.complete || !im.naturalWidth) return null;
  const key = im.src + color + alpha;
  if (tints.has(key)) return tints.get(key);
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const x = cv.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = mode; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, cv.width, cv.height);
  if (mode === 'multiply') { x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(im, 0, 0); }   // keep the cutout's edges
  tints.set(key, cv);
  return cv;
}
const panoReady = () => pano && pano.complete && pano.naturalWidth > 0;

// ---------- camera: the whole height of the camp in view, following you left and right ----------
function cam() {
  const pw = pano.naturalWidth, ph = pano.naturalHeight;
  const k = Math.max(H / ph, W / pw);
  const halfW = W / 2 / (pw * k), halfH = H / 2 / (ph * k);
  return { k, pw, ph, u: clamp(camU, halfW, 1 - halfW), v: clamp(0.5, halfH, 1 - halfH), halfW };
}
const toScreen = (c, x, y) => [W / 2 + (x - c.u) * c.pw * c.k, H / 2 + (y - c.v) * c.ph * c.k];
const toPano = (c, sx, sy) => [c.u + (sx - W / 2) / (c.pw * c.k), c.v + (sy - H / 2) / (c.ph * c.k)];

const taken = id => got.has(id) || (bot && bot.got.has(id)) || (rival && !bot && (rival.got || []).includes(id));

// ---------- input ----------
function tap(e) {
  if (!running || !panoReady()) return;
  const r = canvas.getBoundingClientRect(), c = cam();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  // an item you tapped: walk over and pick it up
  let best = null, bd = 1e9;
  for (const [id, it] of Object.entries(ITEMS)) {
    if (taken(id)) continue;
    const [x, y] = toScreen(c, it.x, it.y), h = it.h * c.ph * c.k;
    const d = Math.hypot(sx - x, sy - (y - h / 2));
    if (d < Math.max(40, h * 0.9) && d < bd) { bd = d; best = id; }
  }
  if (best) { walkTo = { x: ITEMS[best].gx, y: ITEMS[best].gy, id: best }; return; }
  // the ground: walk there (or as close as you can get)
  let [px, py] = toPano(c, sx, sy);
  py = clamp(py, backEdge(px), 0.975); px = clamp(px, 0.03, 0.97);
  walkTo = { x: px, y: py };
}

// the item you're standing close enough to reach
function reachable() {
  let best = null, bd = 1e9;
  for (const [id, it] of Object.entries(ITEMS)) {
    if (taken(id)) continue;
    const d = Math.hypot((me.x - it.gx) * ASPECT, me.y - it.gy);
    if (d < 0.07 && d < bd) { bd = d; best = id; }
  }
  return best;
}
function tryPack(id) {
  id = id || reachable();
  if (!id) { say('Walk up to something to pick it up.'); return; }
  const it = ITEMS[id];
  if (it.owner !== o.char) {
    const who = G.CHARS[it.owner] ? G.CHARS[it.owner].short : 'someone';
    say(`That’s ${who}’s. Leave it.`); G.Sfx.dud(); return;
  }
  got.add(id); G.Sfx.pop();
  say(`Packed: ${it.name}`);
  renderSlots();
  if (mine.every(m => got.has(m))) { finish(); G.Sfx.playFile(`assets/voice/${o.char}-packed.mp3`); }
}
function finish() {
  packedAll = true;
  G.Sfx.win();
  $('#campPrompt').classList.add('hidden');
  const waiting = o.onPacked ? o.onPacked() : false;   // online: true when we wait here for the rival
  $('#campDone').classList.remove('hidden');
  $('#campRun').classList.toggle('hidden', !!waiting);
  if (!waiting) $('#campDoneText').textContent = 'Bag packed. Time to go.';
}
function say(text) { msg = { text, until: t + 2.2 }; $('#campMsg').textContent = text; $('#campMsg').classList.add('on'); }

function renderSlots() {
  $('#campSlots').innerHTML = mine.map(id => `<span class="${got.has(id) ? 'got' : ''}"><img src="assets/camp/${id}.png" alt="">${got.has(id) ? '✓ ' : ''}${ITEMS[id].name}</span>`).join('');
}

// ---------- walking: smooth, weighted movement for any person (you, the bot, or your friend) ----------
// Velocity eases toward where you want to go, so starts, stops and turns blend instead of snapping.
// The stride advances with distance covered (no sliding feet), and every footfall kicks up a little dust.
const STRIDE = 0.032;   // panorama height units per step, at the middle of camp
function walk(p, dx, dy, dt, pace = 1) {
  const len = Math.hypot(dx, dy), depth = personH(p.y) / 0.23;
  const max = 0.075 * depth * pace;
  const tx = len ? dx / len * max : 0, ty = len ? dy / len * max : 0;
  const ease = 1 - Math.exp(-dt * (len ? 7 : 9));   // speed up quickly, settle a touch faster
  p.vx = (p.vx || 0) + (tx - (p.vx || 0)) * ease;
  p.vy = (p.vy || 0) + (ty - (p.vy || 0)) * ease;
  const mx = p.vx * dt / ASPECT * 1.6, my = p.vy * dt;
  if (walkable(p.x + mx, p.y)) p.x += mx; else p.vx *= 0.3;
  if (walkable(p.x, p.y + my)) p.y += my; else p.vy *= 0.3;
  if (Math.abs(p.vx) > 0.004) p.face = p.vx > 0 ? 1 : -1;
  move(p, dt, Math.hypot(p.vx, p.vy), max || 0.075 * depth);
}
// the shared body motion: gait blend, turning, stride and footfalls, from a speed
function move(p, dt, speed, max) {
  const depth = personH(p.y) / 0.23;
  const g = Math.min(1, speed / (0.075 * depth));
  p.gait = (p.gait || 0) + (g - (p.gait || 0)) * (1 - Math.exp(-dt * 8));
  p.faceS = p.faceS === undefined ? (p.face || 1) : p.faceS + ((p.face || 1) - p.faceS) * (1 - Math.exp(-dt * 10));   // swing round, don't flip
  p.moving = p.gait > 0.12;
  const before = Math.floor(p.step || 0);
  p.step = (p.step || 0) + speed * dt / (STRIDE * depth);
  if (Math.floor(p.step) !== before && p.gait > 0.3) footfall(p, Math.floor(p.step) % 2 ? 1 : -1);   // a foot lands on each whole step
}
const dust = [];
function footfall(p, side) {
  const h = personH(p.y);
  dust.push({ x: p.x + side * h * 0.05 / ASPECT, y: p.y + 0.002, r: h * 0.05, life: 1, dir: -(p.faceS || 1) });
  if (p === me && G.Sfx.ctx) {   // your own steps: soft, alternating left and right, a little uneven like real feet
    const S = G.Sfx;
    S.burst(side * 0.25, S.t, 0.06 + Math.random() * 0.02, 220 + Math.random() * 80, 'lowpass', 0.18 + p.gait * 0.1);
    S.burst(side * 0.25, S.t + 0.02, 0.04, 900 + Math.random() * 300, 'bandpass', 0.05);
  }
}
function drawDust(c, dt) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life -= dt * 1.4; d.x += d.dir * dt * 0.004; d.y -= dt * 0.006;
    if (d.life <= 0) { dust.splice(i, 1); continue; }
    const [sx, sy] = toScreen(c, d.x, d.y), r = d.r * c.ph * c.k * (1.4 - d.life * 0.6);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(150,110,80,${0.28 * d.life})`); g.addColorStop(1, 'rgba(150,110,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- the rival: a bot walking the camp, or your friend's live position ----------
function botStep(dt) {
  const b = bot;
  if (t < b.waitUntil) { walk(b, 0, 0, dt); return; }
  const target = b.done ? TRAIL : b.list[0] ? { x: ITEMS[b.list[0]].gx, y: ITEMS[b.list[0]].gy } : TRAIL;
  const dx = (target.x - b.x) * ASPECT, dy = target.y - b.y;
  if (Math.hypot(dx, dy) < 0.02) {
    walk(b, 0, 0, dt);
    if (!b.done && b.list[0]) {
      b.got.add(b.list.shift()); b.waitUntil = t + 2.5 + Math.random() * 3;   // rummaging
      if (!b.list.length) b.done = true;
    }
    return;
  }
  walk(b, dx, dy, dt, Math.min(0.75, Math.hypot(dx, dy) * 12));   // eases in as it arrives
}
function rivalLook() {
  if (bot) return bot;
  if (rival && performance.now() - rival.at < 4000) return rival;
  return null;
}
function updateRivalChip(r) {
  const chip = $('#campRival');
  if (!r || !r.char || !G.CHARS[r.char]) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  const n = bot ? bot.got.size : (r.got || []).length;
  chip.innerHTML = `<img src="assets/characters/${r.char}.png" alt=""> Rival: <b>${G.CHARS[r.char].short}</b> · ${r.done ? 'bag packed ✓' : `packing ${n} / 2`}`;
}

// ---------- drawing ----------
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = cam();
  const [x0, y0] = toScreen(c, 0, 0);
  ctx.drawImage(pano, x0, y0, c.pw * c.k, c.ph * c.k);

  // flickering firelight and lantern glow
  ctx.globalCompositeOperation = 'lighter';
  GLOWS.forEach(([gx, gy, gr, rgb], i) => {
    const [sx, sy] = toScreen(c, gx, gy), r = gr * c.ph * c.k;
    const f = 0.10 + 0.06 * Math.sin(t * (7 + i * 3)) + 0.04 * Math.sin(t * 13.7 + i);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(${rgb},${f + 0.08})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  });
  for (const f of flies) {
    const [sx, sy] = toScreen(c, f.x + Math.sin(t * f.s + f.p) * 0.01, f.y + Math.cos(t * f.s * 0.8 + f.p) * 0.012);
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * f.b + f.p));
    const r = f.r * c.k * 2700 / c.ph;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(230,255,120,${0.9 * a})`); g.addColorStop(0.3, `rgba(190,255,90,${0.35 * a})`); g.addColorStop(1, 'rgba(160,255,80,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // everyone and everything standing on the ground, back to front
  const r = rivalLook();
  updateRivalChip(r);
  const reach = packedAll ? null : reachable();
  const sprites = [];
  for (const [id, it] of Object.entries(ITEMS)) if (!taken(id)) sprites.push({ y: it.y, draw: () => drawItem(c, id, it, id === reach) });
  if (r && r.char) sprites.push({ y: r.y, draw: () => drawPerson(c, r, G.CHARS[r.char].short + (r.done ? ' ✓' : ''), '#5ec8e5') });
  sprites.push({ y: me.y, draw: () => drawPerson(c, me, 'You', '#ffd970') });
  drawDust(c, lastDt);
  sprites.sort((a, b) => a.y - b.y).forEach(s => s.draw());

  // where you're walking to
  if (walkTo) {
    const [sx, sy] = toScreen(c, walkTo.x, walkTo.y), rr = 10 + Math.sin(t * 8) * 2;
    ctx.strokeStyle = 'rgba(255,217,112,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, rr * 1.6, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // vignette: dusk through your own eyes
  const v = ctx.createRadialGradient(W / 2, H * 0.6, Math.min(W, H) * 0.4, W / 2, H * 0.6, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,4,14,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

  const p = $('#campPrompt');
  if (reach) {
    const mineItem = ITEMS[reach].owner === o.char;
    p.textContent = mineItem ? `Space or tap: pack the ${ITEMS[reach].name}` : `${ITEMS[reach].name}: that’s ${G.CHARS[ITEMS[reach].owner].short}’s`;
    p.classList.toggle('mine', mineItem);
    p.classList.remove('hidden');
  } else p.classList.add('hidden');
}
function drawItem(c, id, it, inReach) {
  const im = img(`assets/camp/${id}.png`);
  if (!im.complete || !im.naturalWidth) return;
  const [sx, sy] = toScreen(c, it.x, it.y);
  const h = it.h * c.ph * c.k, w = h * im.naturalWidth / im.naturalHeight;
  if (sx + w < 0 || sx - w > W) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(sx, sy - h * 0.02, w * 0.5, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // your own items catch the light; after a while they shimmer as a hint
  const isMine = it.owner === o.char;
  if (isMine && (inReach || t > hintAt)) {
    const glow = inReach ? 0.55 : 0.18 + 0.18 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(sx, sy - h / 2, 0, sx, sy - h / 2, h);
    g.addColorStop(0, `rgba(255,220,140,${glow})`); g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sx - h, sy - h * 1.5, h * 2, h * 2); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 0.95;
  ctx.drawImage(lit(im, '#c87a50', 0.16, 'multiply') || im, sx - w / 2, sy - h, w, h);   // warm firelight so cutouts sit in the scene
  ctx.globalAlpha = 1;
  if (inReach) {
    ctx.strokeStyle = isMine ? 'rgba(255,217,112,0.9)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(sx, sy - h * 0.02, w * 0.62, h * 0.14, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
}
// a person on the ground. Everything is driven by gait (0 standing, 1 full walk), so idle, walking and turning blend.
function drawPerson(c, p, label, color) {
  const im = img(`assets/characters/${p.char}.png`);
  if (!im.complete || !im.naturalWidth) return;
  const [sx, sy] = toScreen(c, p.x, p.y);
  const h = personH(p.y) * c.ph * c.k, w = h * im.naturalWidth / im.naturalHeight;
  const g = p.gait || 0, ph = (p.step || 0) * Math.PI, fs = p.faceS === undefined ? (p.face || 1) : p.faceS;
  const contact = Math.abs(Math.cos(ph));                  // 1 when a foot lands, 0 mid-stride
  const bob = g * (1 - contact) * h * 0.028;               // the body rises over each passing step
  const squash = 1 - g * contact * 0.025;                  // and settles a touch as weight lands
  const breathe = (1 - g) * Math.sin(t * 2.1 + p.x * 9) * 0.006;   // standing still, you breathe
  const lean = g * Math.sign(fs) * 0.045 + g * Math.sin(ph) * 0.018;   // lean into the walk, sway with each step
  const sway = g * Math.sin(ph) * w * 0.015;
  const turn = Math.sign(fs || 1) * Math.max(0.18, Math.abs(fs));   // narrows through a turn instead of flipping
  // contact shadow: tighter and darker under a planted foot, softer when the body lifts
  ctx.fillStyle = `rgba(0,0,0,${0.42 + contact * g * 0.1})`;
  ctx.beginPath(); ctx.ellipse(sx + sway * 0.5, sy, w * (0.2 + g * 0.03) - bob * 0.4, h * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  // how much of the side-view walk to show: walking sideways at speed is all walk, standing or heading
  // toward or away from the camera is the front view, with a crossfade between so nothing pops
  const vx = Math.abs(p.vx || 0), vy = Math.abs(p.vy || 0);
  const side = vx + vy > 1e-4 ? vx / (vx + vy * 0.8) : (p.sideW || 0);
  const target = smooth(clamp((g - 0.15) / 0.35, 0, 1)) * smooth(clamp((side - 0.3) / 0.4, 0, 1));
  p.walkW = (p.walkW || 0) + (target - (p.walkW || 0)) * Math.min(1, lastDt * 10);
  const wW = WALK[p.char] ? p.walkW : 0;
  ctx.save();
  ctx.translate(sx + sway, sy - bob);
  ctx.rotate(lean);
  ctx.scale(turn * (1 + (1 - squash) * 0.6), squash + breathe);
  if (wW < 0.999) {
    ctx.globalAlpha = Math.min(1, (1 - wW) * 2);   // both views stay solid through the crossfade, so the figure never goes see-through
    ctx.drawImage(lit(im, '#a0603c', 0.2) || im, -w / 2, -h * (561 / 576), w, h);   // the figure art has a little space under the feet
  }
  if (wW > 0.001) {
    // the walk cycle, four beats per stride, each beat dissolving into the next for a smooth gait
    const beat = (p.step || 0) * 2, i = Math.floor(beat), f = beat - i;
    const fh = h * FIG[p.char];
    const frame = k => { const n = CYCLE[((k % 4) + 4) % 4]; return { im: img(`assets/characters/walk/${p.char}-${n}.png`), ax: WALK[p.char][n] }; };
    const drawFrame = (fr, a) => {
      if (!fr.im.complete || !fr.im.naturalWidth || a <= 0) return;
      const fw = fh * fr.im.naturalWidth / fr.im.naturalHeight;
      ctx.globalAlpha = a; ctx.drawImage(lit(fr.im, '#a0603c', 0.2) || fr.im, -fw * fr.ax, -fh, fw, fh);
    };
    const mix = smooth(clamp((f - 0.6) / 0.4, 0, 1));   // hold each pose, then dissolve into the next
    const ww = Math.min(1, wW * 2);
    drawFrame(frame(i), ww);
    drawFrame(frame(i + 1), ww * mix);
  }
  ctx.restore();
  ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width + 14, ty = sy - h * 0.8 - bob;
  ctx.fillStyle = 'rgba(10,8,18,0.72)'; ctx.fillRect(sx - tw / 2, ty - 17, tw, 20);
  ctx.fillStyle = color; ctx.fillText(label, sx, ty - 2);
}

// ---------- your pounding heart: faster and louder while you move, faster still once your rival is packed ----------
function heartbeat(moving) {
  const S = G.Sfx;
  if (!S.ctx || S.muted) return;
  const r = rivalLook(), rushed = r && r.done && !packedAll;
  pulse += ((moving ? 1 : 0) - pulse) * 0.02;
  const bpm = (packedAll ? 92 : 112) + pulse * 34 + (rushed ? 18 : 0);
  if (t < nextBeat) return;
  nextBeat = t + 60 / bpm;
  const vol = 0.45 + pulse * 0.4, at = S.t;
  S.tone(0, at, 0.11, 70, 'sine', vol, 38);              // lub
  S.tone(0, at + 0.16, 0.09, 58, 'sine', vol * 0.7, 34);  // dub
  S.burst(0, at, 0.05, 140, 'lowpass', vol * 0.35);
}

// ---------- loop ----------
function frame(now) {
  if (!running) { looping = false; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; lastDt = dt;
  let dx = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
  let dy = ((keys.ArrowDown || keys.KeyS) ? 1 : 0) - ((keys.ArrowUp || keys.KeyW) ? 1 : 0);
  if (walkTo && !dx && !dy) {
    dx = (walkTo.x - me.x) * ASPECT; dy = walkTo.y - me.y;
    if (Math.hypot(dx, dy) < 0.012) {
      const id = walkTo.id; walkTo = null; dx = dy = 0;
      if (id && !packedAll) tryPack(id);
    }
  }
  const bx = me.x, by = me.y;
  // walking to a tapped spot slows down gently as you arrive
  walk(me, dx, dy, dt, walkTo ? Math.min(1, 0.35 + Math.hypot(dx, dy) * 10) : 1);
  if (walkTo && Math.hypot(dx, dy) > 0.03 && me.x === bx && me.y === by) walkTo = null;   // blocked: stop rather than walk on the spot
  heartbeat(me.gait > 0.3);
  if (bot) botStep(dt);
  else if (rival) {   // glide between network updates
    const k = Math.min(1, dt * 6), ox = rival.x, oy = rival.y;
    rival.x += (rival.tx - rival.x) * k; rival.y += (rival.ty - rival.y) * k;
    if (Math.abs(rival.x - ox) > 1e-5) rival.face = rival.x > ox ? 1 : -1;
    if (dt) { rival.vx = (rival.x - ox) * ASPECT / 1.6 / dt; rival.vy = (rival.y - oy) / dt; }
    move(rival, dt, Math.hypot(rival.vx || 0, rival.vy || 0));
  }
  if (o.onPos && now - lastSend > 150) { lastSend = now; o.onPos({ x: me.x, y: me.y, face: me.face, moving: me.moving, got: [...got], done: packedAll }); }
  if (t > msg.until) $('#campMsg').classList.remove('on');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!panoReady()) { ctx.fillStyle = '#120c18'; ctx.fillRect(0, 0, W, H); return; }
  camU += (me.x - camU) * Math.min(1, dt * 3);   // the camera follows you
  draw();
}

G.Camp = {
  // o: { char, items: [id, id], title, text, rival: { char, bot }?, onPos(pos)?, onPacked()? -> true to wait here, onRun() }
  start(opts) {
    build();
    o = opts;
    pano = img(window.innerWidth * (window.devicePixelRatio || 1) > 1600 ? 'assets/camp/camp.jpg' : 'assets/camp/camp-sm.jpg');
    Object.keys(ITEMS).forEach(id => img(`assets/camp/${id}.png`));
    const preload = c => { img(`assets/characters/${c}.png`); [0, 1, 2].forEach(n => img(`assets/characters/walk/${c}-${n}.png`)); };
    preload(opts.char);
    if (opts.rival && opts.rival.char) preload(opts.rival.char);
    mine = opts.items; got = new Set(); packedAll = false; t = 0; hintAt = 14; walkTo = null; keys = {}; nextBeat = 0.5; pulse = 0;
    me = { char: opts.char, x: START.x - 0.07, y: START.y, face: 1, moving: false, step: 0, vx: 0, vy: 0, gait: 0 };
    dust.length = 0;
    camU = me.x;
    flies = Array.from({ length: 46 }, () => ({ x: Math.random(), y: 0.3 + Math.random() * 0.55, r: 0.6 + Math.random() * 1.2, s: 0.3 + Math.random() * 0.6, b: 1 + Math.random() * 2.5, p: Math.random() * 7 }));
    rival = null; bot = null;
    if (opts.rival && opts.rival.bot && opts.rival.char) {
      const list = Object.keys(ITEMS).filter(id => ITEMS[id].owner === opts.rival.char);
      bot = { char: opts.rival.char, x: START.x + 0.07, y: START.y - 0.01, face: -1, moving: false, step: 0, got: new Set(), list, waitUntil: 3 + Math.random() * 3, done: false };
    }
    $('#campTitle').textContent = opts.title || 'Pack your bag';
    $('#campText').textContent = opts.text || '';
    $('#campDone').classList.add('hidden'); $('#campRun').classList.remove('hidden');
    $('#campPrompt').classList.add('hidden');
    renderSlots();
    el.classList.remove('hidden');
    size();
    say(`Find your ${mine.map(id => ITEMS[id].name.replace(/^(Your|The) /, '').replace(/^./, ch => ch.toLowerCase())).join(' and your ')}.`);
    msg.until = 5;
    G.Sfx.ambience(true);
    clearTimeout(lineTimer); lineTimer = setTimeout(() => { if (running) G.Sfx.playFile(`assets/voice/${opts.char}-camp.mp3`); }, 900);   // a hushed line as you arrive
    running = true; last = performance.now();
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  },
  // online: where your friend is in camp
  rivalPos(m) {
    if (typeof m.y !== 'number') return;
    const was = rival && rival.char === m.char ? rival : { x: m.x, y: m.y, step: 0 };
    rival = { char: m.char, x: was.x, y: was.y, tx: m.x, ty: m.y, step: was.step, gait: was.gait, faceS: was.faceS, face: was.face || m.face || 1, got: m.got || [], done: !!m.done, at: performance.now() };
  },
  // online: waiting for the rival after you've packed
  wait(text) { if (el && running) { $('#campDoneText').textContent = text; $('#campRun').classList.add('hidden'); } },
  stop() { running = false; keys = {}; clearTimeout(lineTimer); if (el) el.classList.add('hidden'); },
  get running() { return running; },
  items: ITEMS,
  // for testing: pack both items at once
  debugPackAll() { mine.forEach(id => { if (!got.has(id)) tryPack(id); }); },
  debug() { return { me, bot, walkTo }; },
};
})();
