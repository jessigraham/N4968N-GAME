/* The jungle run: find the hidden airstrip before the horde does.
   A top-down jungle map made from a seed (so both online players get the same one), drawn in code.
   Arrow keys / WASD to run, Shift to sprint, Space or Enter to climb into a plane. Phones get a thumb joystick. */
(() => {
'use strict';
const G = window.G;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Tuning ----------
const MW = 3600, MH = 2800, CELL = 40, GW = MW / CELL, GH = MH / CELL;
const SPEED = 230, SPRINT = 1.65, BRUSH_SLOW = 0.55;
const SMOKE_AFTER = 45;          // seconds before smoke above the trees gives the airstrip away
const T = { BRUSH: 0, TRAIL: 1, WATER: 2, BRIDGE: 3, CLEAR: 4, STRIP: 5 };

function rng(seed) {   // small seeded random generator (mulberry32)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Making the island ----------
function generate(seed) {
  const R = rng(seed);
  const grid = new Uint8Array(GW * GH);   // all dense undergrowth to start
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= GW || cy >= GH) ? -1 : grid[cy * GW + cx];
  const paint = (x, y, r, t, keepWater) => {
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
        if (Math.hypot(cx * CELL + CELL / 2 - x, cy * CELL + CELL / 2 - y) > r) continue;
        const i = cy * GW + cx;
        if (keepWater && (grid[i] === T.WATER || grid[i] === T.BRIDGE)) continue;
        if (grid[i] === T.STRIP && t !== T.STRIP) continue;
        grid[i] = t;
      }
    }
  };

  // the river winding across the middle of the island
  const ph = R() * TAU;
  const riverY = x => 1380 + 210 * Math.sin(x / 520 + ph) + 70 * Math.sin(x / 170 + ph * 2);
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
    if (Math.abs(y - riverY(x)) < 72) grid[cy * GW + cx] = T.WATER;
  }
  const bridges = [650 + R() * 450, 2350 + R() * 600].map(x => ({ x, y: riverY(x) }));
  for (const b of bridges) for (let y = b.y - 110; y <= b.y + 110; y += 20) paint(b.x, y, 44, T.BRIDGE);

  // where things are: the camp, junctions, and the four places the airstrip might be
  const N = {
    S: { x: 280, y: 2540 },
    B1s: { x: bridges[0].x, y: bridges[0].y + 130 }, B1n: { x: bridges[0].x, y: bridges[0].y - 130 },
    B2s: { x: bridges[1].x, y: bridges[1].y + 130 }, B2n: { x: bridges[1].x, y: bridges[1].y - 130 },
    J1: { x: 950 + R() * 150, y: 850 + R() * 120 }, J2: { x: 2600 + R() * 150, y: 880 + R() * 120 },
    J3: { x: 1750 + R() * 200, y: 2250 + R() * 120 },
    P0: { x: 2950, y: 420 }, P1: { x: 760, y: 380 }, P2: { x: 3020, y: 2120 }, P3: { x: 1820, y: 340 },
  };
  const EDGES = [['S', 'B1s'], ['B1s', 'B1n'], ['B1n', 'J1'], ['J1', 'P1'], ['J1', 'P3'], ['J1', 'J2'],
    ['S', 'J3'], ['J3', 'B2s'], ['B2s', 'B2n'], ['B2n', 'J2'], ['J2', 'P0'], ['J3', 'P2'], ['J2', 'P3']];
  const spots = ['P0', 'P1', 'P2', 'P3'];
  const stripKey = spots[Math.floor(R() * spots.length)];
  const strip = N[stripKey];

  // trails between them, wobbling through the trees
  const trailPts = [];
  for (const [a, b] of EDGES) {
    const A = N[a], B = N[b], len = dist(A, B), n = Math.max(2, Math.round(len / 110));
    const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
    let prev = A;
    for (let k = 1; k <= n; k++) {
      const q = k / n, wob = k === n ? 0 : (R() - 0.5) * 120 * Math.sin(q * Math.PI);
      const p = { x: A.x + (B.x - A.x) * q + nx * wob, y: A.y + (B.y - A.y) * q + ny * wob };
      const d = dist(prev, p);
      for (let s = 0; s <= d; s += 16) {
        const x = prev.x + (p.x - prev.x) * s / d, y = prev.y + (p.y - prev.y) * s / d;
        paint(x, y, 44, T.TRAIL, true);
        trailPts.push({ x, y, edge: a + '-' + b });
      }
      prev = p;
    }
  }
  paint(N.S.x, N.S.y, 150, T.CLEAR);
  for (const k of spots) if (k !== stripKey) paint(N[k].x, N[k].y, 230, T.CLEAR);
  // the airstrip itself: a long dirt clearing
  const SW = 1000, SH = 210;
  strip.w = SW; strip.h = SH;
  const sx0 = clamp(strip.x - SW / 2, 60, MW - SW - 60), sy0 = clamp(strip.y - SH / 2, 60, MH - SH - 160);
  strip.x0 = sx0; strip.y0 = sy0; strip.cx = sx0 + SW / 2; strip.cy = sy0 + SH / 2;
  for (let y = sy0 - 60; y <= sy0 + SH + 150; y += 20) for (let x = sx0 - 40; x <= sx0 + SW + 40; x += 20) paint(x, y, 22, T.CLEAR);
  for (let y = sy0; y <= sy0 + SH; y += 20) for (let x = sx0; x <= sx0 + SW; x += 20) paint(x, y, 16, T.STRIP);

  // trees and bushes in the undergrowth
  const trees = [], bushes = [], buckets = new Map();
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (grid[cy * GW + cx] !== T.BRUSH) { continue; }
    const x = cx * CELL + CELL / 2 + (R() - 0.5) * 20, y = cy * CELL + CELL / 2 + (R() - 0.5) * 20;
    // trees only where the undergrowth is all around, so trails and clearings stay open
    let open = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const n = at(cx + i, cy + j); if (n !== T.BRUSH && n !== -1) open = true; }
    if (!open && R() < 0.55) {
      const tr = { x, y, r: 14 + R() * 12, crown: 30 + R() * 26, hue: R(), palm: R() < 0.25 };
      trees.push(tr);
      const key = cx + ',' + cy; buckets.set(key, tr);
    } else if (R() < 0.6) bushes.push({ x, y, r: 12 + R() * 14, hue: R() });
  }

  // a sign at each junction pointing the right way to the strip
  const adj = {};
  for (const [a, b] of EDGES) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  const nextToward = (from, goal) => {
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === goal) break; for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
    let n = goal; while (prev[n] && prev[n] !== from) n = prev[n];
    return N[n];
  };
  const signs = ['J1', 'J2', 'J3'].map((k, i) => {
    const to = nextToward(k, stripKey), j = N[k];
    const a = Math.atan2(to.y - j.y, to.x - j.x);
    return { x: j.x + Math.cos(a + 0.9) * 60, y: j.y + Math.sin(a + 0.9) * 60, angle: a, broken: i === Math.floor(R() * 3) };
  });

  // pickups along the trails
  const trailOn = edge => trailPts.filter(p => p.edge === edge);
  const pathEdges = [];
  const routePts = [];   // the trail from camp to the strip, in order (used for testing)
  { let n = 'S'; let guard = 0; while (n !== stripKey && guard++ < 20) {
    const nx = Object.keys(N).find(k => N[k] === nextToward(n, stripKey)); pathEdges.push(n + '-' + nx, nx + '-' + n);
    const fwd = trailOn(n + '-' + nx), back = trailOn(nx + '-' + n).reverse();
    routePts.push(...(fwd.length ? fwd : back));
    n = nx;
  } }
  const onPath = trailPts.filter(p => pathEdges.includes(p.edge));
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const items = [];
  const mapAt = onPath.length ? onPath[Math.floor(onPath.length * (0.35 + R() * 0.2))] : pick(trailPts);
  items.push({ kind: 'map', x: mapAt.x, y: mapAt.y });
  for (let i = 0; i < 4; i++) { const p = pick(trailPts); items.push({ kind: 'spray', x: p.x, y: p.y }); }
  for (let i = 0; i < 3; i++) { const p = pick(trailPts); items.push({ kind: 'med', x: p.x, y: p.y }); }

  // mosquito swarms by the water, zombies on the trails
  const swarms = [];
  for (let i = 0; i < 9; i++) {
    const x = 200 + R() * (MW - 400);
    swarms.push({ x, y: riverY(x) + (R() - 0.5) * 420, ph: R() * TAU, r: 85 + R() * 30 });
  }
  const zombies = [];
  for (let i = 0; i < 11; i++) {
    let p; do { p = pick(trailPts); } while (dist(p, N.S) < 800);
    zombies.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, tx: p.x, ty: p.y, ph: R() * TAU, limp: R() < 0.5, hunch: (R() - 0.5) * 0.4,
      coat: ['lab', 'khaki', 'rags'][Math.floor(R() * 3)], cool: 0 });
  }

  // parked planes along the edge of the strip: two that fly, three that never will
  const planes = [
    { id: 'c172', reg: 'N4968N', type: 'Cessna 172', flyable: true, color: '#f4f1ea', stripe: '#c0392b', high: true },
    { id: 'piper', reg: 'N5512P', type: 'Piper Cherokee', flyable: true, color: '#e9e2cf', stripe: '#1f6fb2', high: false },
    { id: 'w1', reg: 'N9031T', type: 'Cessna 150', flyable: false, why: 'No propeller. Keep looking!', color: '#cfc9bb', stripe: '#555', high: true, wreck: true },
    { id: 'w2', reg: 'N2207K', type: 'Piper Cub', flyable: false, why: 'Flat tire and a cracked wing. Not this one!', color: '#e7c64a', stripe: '#222', high: true, wreck: true },
    { id: 'w3', reg: 'N7766B', type: 'Beechcraft', flyable: false, why: 'The fuel tank is full of bullet holes.', color: '#bfc6cc', stripe: '#7a2', high: false, wreck: true },
  ];
  const order = planes.map((p, i) => i).sort(() => R() - 0.5);
  planes.forEach((p, i) => {
    const slot = order[i];
    p.x = sx0 + 110 + slot * ((SW - 220) / 4);
    p.y = sy0 + SH + 70;
    p.rot = -Math.PI / 2 + (R() - 0.5) * 0.3;
  });

  return { seed, grid, at, riverY, bridges, N, strip, stripKey, trees, buckets, bushes, signs, items, swarms, zombies, planes, routePts, start: { ...N.S } };
}

// ---------- The run ----------
const canvas = document.getElementById('jungleCanvas');
const ctx = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
let W = 0, H = 0, running = false, world = null, opts = null, last = 0, t = 0;
let me = null, ghost = null, keys = {}, joy = { x: 0, y: 0, on: false }, sprintBtn = false, msg = { text: '', until: 0, color: '#fff' };
let prompt = null, dust = [], taken = {}, deadline = null, smokeShown = false, windShown = false;

function say(text, color = '#fff', dur = 2.6) { msg = { text, until: t + dur, color }; }

function blocked(x, y, r) {
  if (x < r || y < r || x > MW - r || y > MH - r) return true;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  if (world.at(cx, cy) === T.WATER) return true;
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const tr = world.buckets.get(i + ',' + j);
    if (tr && Math.hypot(tr.x - x, tr.y - y) < tr.r * 0.7 + r) return true;
  }
  for (const p of world.planes) if (Math.hypot(p.x - x, p.y - y) < 36 + r) return true;
  return false;
}

function update(dt) {
  t += dt;
  // input: arrows / WASD / joystick
  let ix = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  let iy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  if (joy.on) { ix = joy.x; iy = joy.y; }
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  const moving = mag > 0.15 && t >= me.stunUntil && t >= me.outUntil;

  // sprinting uses stamina
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || sprintBtn) && moving;
  if (wantSprint && me.stamina > 0) me.stamina = Math.max(0, me.stamina - 32 * dt);
  else me.stamina = Math.min(100, me.stamina + 16 * dt);
  const sprinting = wantSprint && me.stamina > 0;

  const tile = world.at(Math.floor(me.x / CELL), Math.floor(me.y / CELL));
  let sp = SPEED * (sprinting ? SPRINT : 1) * (tile === T.BRUSH ? BRUSH_SLOW : 1) * (me.infection >= 60 ? 0.7 : 1);
  let vx = moving ? ix * sp : 0, vy = moving ? iy * sp : 0;
  // knocked back by a zombie
  vx += me.kx; vy += me.ky; me.kx *= Math.pow(0.02, dt); me.ky *= Math.pow(0.02, dt);
  if (!blocked(me.x + vx * dt, me.y, 14)) me.x += vx * dt;
  if (!blocked(me.x, me.y + vy * dt, 14)) me.y += vy * dt;
  if (Math.abs(ix) > 0.1 && moving) me.face = ix < 0 ? -1 : 1;
  me.moving = moving; me.sprinting = sprinting;
  if (moving) {
    const before = Math.floor(me.step);
    me.step += dt * (sprinting ? 3.4 : 2.4);
    if (Math.floor(me.step * 2) !== Math.floor((me.step - dt * (sprinting ? 3.4 : 2.4)) * 2)) {
      dust.push({ x: me.x + (Math.random() - 0.5) * 10, y: me.y + 4, life: 0.6 });
      if (G.Sfx.ctx) G.Sfx.burst(0, G.Sfx.t, 0.05, tile === T.BRUSH ? 1200 : 420, 'lowpass', tile === T.BRUSH ? 0.12 : 0.18);
    }
    void before;
  }
  dust = dust.filter(d => (d.life -= dt) > 0);

  // mosquitoes and the infection meter
  let buzz = 0;
  for (const s of world.swarms) {
    s.cx = s.x + Math.sin(t * 0.4 + s.ph) * 120; s.cy = s.y + Math.cos(t * 0.31 + s.ph) * 80;
    const d = Math.hypot(s.cx - me.x, s.cy - me.y);
    buzz = Math.max(buzz, clamp(1 - d / 500, 0, 1));
    if (d < s.r && t > me.sprayUntil) me.infection = Math.min(100, me.infection + 9 * dt);
  }
  if (me.infection >= 100 && t >= me.outUntil) {
    me.outUntil = t + 3; me.infection = 72;
    say('The fever hits. You black out…', '#ff6b6b', 3);
    G.Sfx.groan(0.15);
  }
  buzzSound(buzz * (t > me.sprayUntil ? 1 : 0.2));

  // zombies wander the trails, then shamble after you
  for (const z of world.zombies) {
    const d = Math.hypot(z.x - me.x, z.y - me.y);
    let tx = z.tx, ty = z.ty, spd = 38;
    if (d < 260 && t >= me.outUntil) { tx = me.x; ty = me.y; spd = 95; }
    else if (Math.hypot(z.tx - z.x, z.ty - z.y) < 10) { z.tx = z.hx + (Math.random() - 0.5) * 300; z.ty = z.hy + (Math.random() - 0.5) * 300; }
    const dd = Math.hypot(tx - z.x, ty - z.y) || 1;
    const nx = z.x + (tx - z.x) / dd * spd * dt, ny = z.y + (ty - z.y) / dd * spd * dt;
    const tl = world.at(Math.floor(nx / CELL), Math.floor(ny / CELL));
    if (tl !== T.WATER && !blocked(nx, ny, 10)) { z.x = nx; z.y = ny; } else { z.tx = z.hx; z.ty = z.hy; }
    z.face = tx < z.x ? -1 : 1;
    if (d < 34 && t > z.cool && t >= me.stunUntil) {
      z.cool = t + 2.5;
      const a = Math.atan2(me.y - z.y, me.x - z.x);
      me.kx = Math.cos(a) * 520; me.ky = Math.sin(a) * 520; me.stunUntil = t + 0.9; me.hit = t;
      say('A zombie lunged at you!', '#ff6b6b', 1.6);
      G.Sfx.bang(); G.Sfx.groan(0.2);
    }
  }

  // pick things up
  for (const it of world.items) {
    if (it.got || Math.hypot(it.x - me.x, it.y - me.y) > 30) continue;
    it.got = true; G.Sfx.click();
    if (it.kind === 'map') { me.hasMap = true; say('A torn piece of map! The airstrip is somewhere in the circle.', '#ffd970', 3.5); }
    if (it.kind === 'spray') { me.infection = Math.max(0, me.infection - 30); me.sprayUntil = t + 20; say('Bug spray: mosquitoes keep away for a while', '#7bed9f'); }
    if (it.kind === 'med') { me.infection = Math.max(0, me.infection - 50); say('Med kit: fever down', '#7bed9f'); }
  }

  // clues: the radio at the strip gets louder as you get close; windsock and smoke above the trees
  const ds = Math.hypot(world.strip.cx - me.x, world.strip.cy - me.y);
  beaconSound(ds);
  if (!windShown && ds < 1300) { windShown = true; say('A windsock pokes above the trees…', '#ffd970', 3); }
  if (!smokeShown && t > SMOKE_AFTER) { smokeShown = true; say('Smoke above the canopy. Someone lit a fire by the planes!', '#ffd970', 3.5); }
  for (const s of world.signs) if (!s.seen && Math.hypot(s.x - me.x, s.y - me.y) < 120) { s.seen = true; say(s.broken ? 'A broken trail sign. Hard to read…' : 'A trail sign: STRIP →', '#ffd970', 2.2); }
  if (!me.foundStrip && me.x > world.strip.x0 - 40 && me.x < world.strip.x0 + world.strip.w + 40 && me.y > world.strip.y0 - 60 && me.y < world.strip.y0 + world.strip.h + 160) {
    me.foundStrip = true; say('THE AIRSTRIP! Find a plane that can fly.', '#7bed9f', 3);
  }
  // a decoy clearing
  for (const k of ['P0', 'P1', 'P2', 'P3']) {
    if (k === world.stripKey || me['saw' + k]) continue;
    if (Math.hypot(world.N[k].x - me.x, world.N[k].y - me.y) < 160) { me['saw' + k] = true; say('Just an empty clearing. Not the airstrip.', '#ff9f43', 2.4); }
  }

  // planes: walk up to one and climb in
  prompt = null;
  for (const p of world.planes) {
    if (Math.hypot(p.x - me.x, p.y - me.y) > 125) continue;
    if (!p.flyable) prompt = { text: `${p.reg} (${p.type}): ${p.why}`, plane: null };
    else if (taken[p.id]) prompt = { text: `Your rival already took ${p.reg}! Find the other one.`, plane: null };
    else prompt = { text: `Climb into ${p.reg} (${p.type})`, plane: p };
  }
  const act = document.getElementById('jAct');
  act.classList.toggle('hidden', !(prompt && prompt.plane));

  // online: the horde is already at the airstrip if your rival made it first
  if (deadline !== null && t >= deadline && opts.onLate) { const f = opts.onLate; opts.onLate = null; f(); }

  if (opts.onPos && t - (me.lastSend || 0) > 0.1) {
    me.lastSend = t;
    opts.onPos({ x: Math.round(me.x), y: Math.round(me.y), face: me.face, moving: me.moving });
  }
}

function board() {
  if (!prompt || !prompt.plane || !running) return;
  const p = prompt.plane;
  G.Sfx.click();
  running = false;
  stopSounds();
  showUI(false);
  opts.onBoard(p);
}

// ---------- Sounds of the run ----------
let snd = null;
function ensureSounds() {
  const S = G.Sfx; if (!S.ctx || snd) return;
  const c = S.ctx;
  // mosquito whine
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 620;
  const vib = c.createOscillator(); vib.frequency.value = 13; const va = c.createGain(); va.gain.value = 40; vib.connect(va); va.connect(o.frequency);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
  const g = c.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(S.out); o.start(); vib.start();
  // the strip's radio and an idling engine somewhere ahead
  const pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); pan.connect(S.out);
  const eng = c.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 52;
  const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 300;
  const eg = c.createGain(); eg.gain.value = 0;
  eng.connect(ef); ef.connect(eg); eg.connect(pan); eng.start();
  snd = { g, pan, eg, nextBeep: 0, nodes: [o, vib, eng] };
}
function buzzSound(v) { if (snd) snd.g.gain.setTargetAtTime(v * 0.05, G.Sfx.t, 0.1); }
function beaconSound(d) {
  if (!snd) return;
  const v = Math.pow(clamp(1 - d / 2600, 0, 1), 2);
  const a = Math.atan2(world.strip.cy - me.y, world.strip.cx - me.x);
  if (snd.pan.pan) snd.pan.pan.setTargetAtTime(clamp(Math.cos(a), -1, 1) * 0.8, G.Sfx.t, 0.2);
  snd.eg.gain.setTargetAtTime(v * 0.12, G.Sfx.t, 0.3);
  if (t > snd.nextBeep && v > 0.01) {   // radio static and a beep every couple of seconds
    snd.nextBeep = t + 2.2;
    G.Sfx.burst(Math.cos(a) * 0.8, G.Sfx.t, 0.25, 2500, 'bandpass', 0.05 + v * 0.25);
    G.Sfx.tone(Math.cos(a) * 0.8, G.Sfx.t + 0.3, 0.12, 1180, 'square', 0.02 + v * 0.1);
  }
}
function stopSounds() { if (snd) { snd.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); snd.g.disconnect(); snd.eg.disconnect(); snd = null; } }

// ---------- Drawing ----------
const GROUND = ['#1c3521', '#6e5537', '#24485a', '#6b4b2b', '#3a5a2e', '#8b6a45'];
function shadeCell(cx, cy) { return ((cx * 73856093) ^ (cy * 19349663)) % 7 / 7; }

function drawPlane(p, s) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(8, 10, 70, 22, 0, 0, TAU); ctx.fill();
  if (!p.high) { ctx.fillStyle = p.color; ctx.fillRect(-8, -78, 30, 156); ctx.fillStyle = p.stripe; ctx.fillRect(-8, -78, 6, 156); }
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.ellipse(0, 0, 62, 14, 0, 0, TAU); ctx.fill();          // fuselage
  ctx.fillRect(-62, -26, 16, 52);                                               // tail
  ctx.fillStyle = p.stripe; ctx.fillRect(-50, -3, 100, 6);
  if (p.high) { ctx.fillStyle = p.color; ctx.fillRect(-6, -80, 30, 160); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(-6, -80, 30, 160); }
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(20, -8, 14, 16);                       // windshield
  ctx.fillStyle = '#222'; ctx.fillRect(60, -16, 4, 32);                         // propeller
  if (p.wreck) { ctx.fillStyle = 'rgba(40,30,20,0.45)'; ctx.beginPath(); ctx.ellipse(-10, 30, 26, 12, 0.4, 0, TAU); ctx.fill(); }
  ctx.restore();
  void s;
}

function drawCharacter(img, x, y, face, moving, step, alpha, hit) {
  const h = 76, bob = moving ? Math.abs(Math.sin(step * Math.PI)) * 6 : 0;
  const sq = moving ? 1 - 0.06 * Math.abs(Math.sin(step * Math.PI)) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 16 - bob, 6, 0, 0, TAU); ctx.fill();
  ctx.translate(x, y - bob);
  ctx.rotate(moving ? face * 0.08 : 0);
  ctx.scale(face * (2 - sq), sq);
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -h / 2, -h, h, h);
  else { ctx.fillStyle = '#ddd'; ctx.fillRect(-10, -50, 20, 50); }
  if (hit) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,0,0,0.4)'; ctx.fillRect(-h / 2, -h, h, h); }
  ctx.restore();
}

const imgs = {};
const charImg = c => imgs[c] || (imgs[c] = Object.assign(new Image(), { src: `assets/characters/${c}.png` }));

function draw() {
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const zoom = clamp(Math.min(r.width, r.height) / 620, 0.62, 1.25) * dpr;
  const camX = clamp(me.x - W / zoom / 2, 0, MW - W / zoom), camY = clamp(me.y - H / zoom / 2, 0, MH - H / zoom);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1a10'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  const x0 = Math.max(0, Math.floor(camX / CELL) - 1), y0 = Math.max(0, Math.floor(camY / CELL) - 1);
  const x1 = Math.min(GW - 1, Math.ceil((camX + W / zoom) / CELL) + 1), y1 = Math.min(GH - 1, Math.ceil((camY + H / zoom) / CELL) + 1);

  // ground
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const tile = world.grid[cy * GW + cx], v = shadeCell(cx, cy);
    ctx.fillStyle = GROUND[tile];
    ctx.fillRect(cx * CELL, cy * CELL, CELL + 1, CELL + 1);
    if (tile === T.BRUSH) { ctx.fillStyle = `rgba(0,0,0,${v * 0.18})`; ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL); }
    else if (tile === T.TRAIL || tile === T.STRIP) { ctx.fillStyle = `rgba(255,230,190,${v * 0.06})`; ctx.fillRect(cx * CELL + 6, cy * CELL + 8, 10, 4); }
    else if (tile === T.WATER) { ctx.fillStyle = `rgba(190,230,255,${0.08 + 0.06 * Math.sin(t * 2 + cx * 0.7 + cy)})`; ctx.fillRect(cx * CELL + 4, cy * CELL + 18, 22, 2); }
    else if (tile === T.BRIDGE) { ctx.fillStyle = '#4e3620'; for (let k = 0; k < 4; k++) ctx.fillRect(cx * CELL, cy * CELL + k * 10, CELL, 2); }
  }
  // the airstrip: dirt runway with a centre line of stones
  const s = world.strip;
  ctx.fillStyle = '#e8e2d0';
  for (let x = s.x0 + 30; x < s.x0 + s.w - 30; x += 60) ctx.fillRect(x, s.cy - 3, 26, 6);
  // a fire barrel by the planes (the smoke clue)
  const fx = s.x0 + s.w - 60, fy = s.y0 + s.h + 40;
  ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(fx, fy, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,${140 + Math.random() * 60},40,0.9)`; ctx.beginPath(); ctx.arc(fx, fy, 7 + Math.random() * 3, 0, TAU); ctx.fill();

  // bushes, items, signs
  for (const b of world.bushes) {
    if (b.x < camX - 40 || b.x > camX + W / zoom + 40 || b.y < camY - 40 || b.y > camY + H / zoom + 40) continue;
    ctx.fillStyle = b.hue < 0.5 ? '#264a2a' : '#2d5530'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }
  for (const it of world.items) {
    if (it.got) continue;
    const pulse = 1 + 0.15 * Math.sin(t * 5);
    ctx.fillStyle = 'rgba(255,240,150,0.25)'; ctx.beginPath(); ctx.arc(it.x, it.y, 20 * pulse, 0, TAU); ctx.fill();
    if (it.kind === 'map') { ctx.fillStyle = '#e9dcb0'; ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(0.3); ctx.fillRect(-11, -8, 22, 16); ctx.strokeStyle = '#a33'; ctx.strokeRect(-6, -4, 8, 6); ctx.restore(); }
    if (it.kind === 'spray') { ctx.fillStyle = '#2f9e44'; ctx.fillRect(it.x - 5, it.y - 12, 10, 22); ctx.fillStyle = '#ddd'; ctx.fillRect(it.x - 3, it.y - 16, 6, 5); }
    if (it.kind === 'med') { ctx.fillStyle = '#f1f1f1'; ctx.fillRect(it.x - 11, it.y - 9, 22, 18); ctx.fillStyle = '#d33'; ctx.fillRect(it.x - 2, it.y - 6, 4, 12); ctx.fillRect(it.x - 6, it.y - 2, 12, 4); }
  }
  for (const sg of world.signs) {
    ctx.fillStyle = '#4b3520'; ctx.fillRect(sg.x - 2, sg.y - 6, 4, 26);
    ctx.save(); ctx.translate(sg.x, sg.y - 10); ctx.rotate(sg.broken ? sg.angle + 2.4 : sg.angle);
    ctx.fillStyle = '#8a6a3e'; ctx.beginPath(); ctx.moveTo(-24, -9); ctx.lineTo(16, -9); ctx.lineTo(28, 0); ctx.lineTo(16, 9); ctx.lineTo(-24, 9); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f2e6c8'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(sg.broken ? 'ST?IP' : 'STRIP', sg.x, sg.y - 24);
  }
  for (const d of dust) { ctx.fillStyle = `rgba(200,180,140,${d.life * 0.5})`; ctx.beginPath(); ctx.arc(d.x, d.y, 8 * (1 - d.life) + 3, 0, TAU); ctx.fill(); }

  // things that stand up, drawn back to front: trees, planes, zombies, players
  const stand = [];
  const inView = (x, y, m) => x > camX - m && x < camX + W / zoom + m && y > camY - m && y < camY + H / zoom + m;
  for (const tr of world.trees) if (inView(tr.x, tr.y, 80)) stand.push({ y: tr.y, f: () => drawTree(tr) });
  for (const p of world.planes) if (inView(p.x, p.y, 140)) stand.push({ y: p.y, f: () => drawPlane(p) });
  for (const z of world.zombies) if (inView(z.x, z.y, 80)) stand.push({ y: z.y, f: () => { ctx.save(); ctx.translate(z.x, z.y); ctx.scale(z.face || 1, 1); G.drawZombie(ctx, 0, 0, 64, z, t, false, 0); ctx.restore(); } });
  if (ghost && inView(ghost.x, ghost.y, 80)) stand.push({ y: ghost.y, f: () => { drawCharacter(charImg(ghost.char), ghost.x, ghost.y, ghost.face || 1, ghost.moving, t * 2.4, 0.55, false); ctx.fillStyle = '#5ec8e5'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('RIVAL', ghost.x, ghost.y - 86); } });
  stand.push({ y: me.y, f: () => drawCharacter(charImg(opts.char), me.x, me.y, me.face, me.moving, me.step, 1, t - me.hit < 0.3) });
  stand.sort((a, b) => a.y - b.y).forEach(o => o.f());
  // plane registrations on top, so trees never hide them
  ctx.font = '700 15px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
  for (const p of world.planes) {
    if (!inView(p.x, p.y, 140)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - 40, p.y - 112, 80, 20);
    ctx.fillStyle = p.flyable ? '#fff' : '#bbb'; ctx.fillText(p.reg, p.x, p.y - 97);
  }

  // mosquito swarms
  for (const sw of world.swarms) {
    if (!inView(sw.cx, sw.cy, 120)) continue;
    ctx.fillStyle = 'rgba(15,10,10,0.18)'; ctx.beginPath(); ctx.arc(sw.cx, sw.cy, sw.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(10,8,8,0.85)';
    for (let k = 0; k < 40; k++) {
      const a = k * 2.4 + t * (3 + k % 5), rr = (k * 37 % 100) / 100 * sw.r;
      ctx.fillRect(sw.cx + Math.cos(a) * rr, sw.cy + Math.sin(a * 1.3) * rr * 0.8, 2.2, 2.2);
    }
  }
  // the windsock, poking up above the canopy at the end of the strip
  const wx = s.x0 + 20, wy = s.y0 - 20;
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - 70); ctx.stroke();
  ctx.save(); ctx.translate(wx, wy - 66); ctx.rotate(0.3 + Math.sin(t * 2) * 0.15);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#fff' : '#ff7a1a'; ctx.fillRect(k * 12, -7 + k, 12, 14 - k * 2); }
  ctx.restore();
  // smoke from the fire barrel
  for (let k = 0; k < 14; k++) {
    const q = (t * 0.25 + k / 14) % 1;
    ctx.fillStyle = `rgba(190,190,200,${0.35 * (1 - q)})`;
    ctx.beginPath(); ctx.arc(fx + q * 120 + Math.sin(q * 6 + k) * 14, fy - q * 260, 10 + q * 40, 0, TAU); ctx.fill();
  }

  // dusk light, fever blur and edge clues (screen space)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  v.addColorStop(0, 'rgba(40,10,40,0.05)'); v.addColorStop(1, 'rgba(10,0,15,0.7)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  canvas.style.filter = me.infection >= 60 ? `blur(${((me.infection - 60) / 40 * 2.2 + 0.6).toFixed(1)}px) saturate(0.7)` : '';
  if (t < me.outUntil) { ctx.fillStyle = `rgba(0,0,0,${0.85})`; ctx.fillRect(0, 0, W, H); }
  edgeClue(camX, camY, zoom, s.cx, s.cy, smokeShown || me.hasMap, 'smoke');
  hud();
}

function drawTree(tr) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tr.x + 10, tr.y + 8, tr.crown, tr.crown * 0.55, 0, 0, TAU); ctx.fill();
  if (tr.palm) {
    ctx.strokeStyle = '#2f5a2c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + tr.hue * 3 + Math.sin(t + tr.x) * 0.05;
      ctx.beginPath(); ctx.moveTo(tr.x, tr.y - 20); ctx.quadraticCurveTo(tr.x + Math.cos(a) * tr.crown * 0.6, tr.y - 30 + Math.sin(a) * tr.crown * 0.4, tr.x + Math.cos(a) * tr.crown, tr.y - 14 + Math.sin(a) * tr.crown * 0.6); ctx.stroke();
    }
    ctx.fillStyle = '#5b4026'; ctx.beginPath(); ctx.arc(tr.x, tr.y - 20, 6, 0, TAU); ctx.fill();
    return;
  }
  const c = tr.crown, base = tr.hue < 0.33 ? [24, 58, 30] : tr.hue < 0.66 ? [30, 66, 34] : [20, 50, 34];
  const col = k => `rgb(${base[0] + k * 14},${base[1] + k * 18},${base[2] + k * 10})`;
  ctx.fillStyle = col(0); ctx.beginPath(); ctx.arc(tr.x, tr.y - c * 0.5, c, 0, TAU); ctx.fill();
  ctx.fillStyle = col(1); ctx.beginPath(); ctx.arc(tr.x - c * 0.25, tr.y - c * 0.75, c * 0.7, 0, TAU); ctx.fill();
  ctx.fillStyle = col(2); ctx.beginPath(); ctx.arc(tr.x - c * 0.35, tr.y - c * 0.95, c * 0.38, 0, TAU); ctx.fill();
}

// an arrow at the screen edge pointing to the smoke, once you've spotted it
function edgeClue(camX, camY, zoom, wx, wy, show) {
  if (!show) return;
  const sx = (wx - camX) * zoom, sy = (wy - camY) * zoom;
  if (sx > 0 && sx < W && sy > 0 && sy < H) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2), m = 40 * dpr;
  const ex = clamp(W / 2 + Math.cos(a) * W, m, W - m), ey = clamp(H / 2 + Math.sin(a) * H, m + 30 * dpr, H - m);
  ctx.save(); ctx.translate(ex, ey);
  ctx.fillStyle = 'rgba(200,200,210,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 18 * dpr, 0, TAU); ctx.fill();
  ctx.rotate(a); ctx.fillStyle = '#ffd970';
  ctx.beginPath(); ctx.moveTo(26 * dpr, 0); ctx.lineTo(12 * dpr, -8 * dpr); ctx.lineTo(12 * dpr, 8 * dpr); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('SMOKE', ex, ey + 4 * dpr);
}

function bar(x, y, w, h, v, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * v / 100, h);
  ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * dpr}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6 * dpr, y + h / 2 + 1);
}

function hud() {
  const u = dpr, pad = 14 * u;
  bar(pad, pad, 180 * u, 16 * u, me.infection, me.infection >= 60 ? '#e74c3c' : '#c39a2b', `Fever ${Math.round(me.infection)}%`);
  bar(pad, pad + 24 * u, 180 * u, 10 * u, me.stamina, '#5ec8e5', '');
  ctx.fillStyle = '#ddd'; ctx.font = `600 ${11 * u}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('Stamina (Shift to sprint)', pad + 186 * u, pad + 29 * u);
  if (t < me.sprayUntil) ctx.fillText(`Bug spray ${Math.ceil(me.sprayUntil - t)}s`, pad + 186 * u, pad + 8 * u);
  // the torn map: a little picture of the island with a circle where the strip is
  if (me.hasMap) {
    const mw = 150 * u, mh = mw * MH / MW, mx = W - mw - pad, my = pad + 36 * u;
    ctx.fillStyle = 'rgba(233,220,176,0.92)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#2b6b8a'; ctx.lineWidth = 3 * u; ctx.beginPath();
    for (let x = 0; x <= MW; x += 100) { const y = world.riverY(x); x === 0 ? ctx.moveTo(mx + x / MW * mw, my + y / MH * mh) : ctx.lineTo(mx + x / MW * mw, my + y / MH * mh); }
    ctx.stroke();
    ctx.strokeStyle = '#b22'; ctx.lineWidth = 2 * u; ctx.beginPath();
    ctx.arc(mx + (world.strip.cx + 180) / MW * mw, my + (world.strip.cy - 120) / MH * mh, 34 * u, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(mx + me.x / MW * mw, my + me.y / MH * mh, 3.5 * u, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4528'; ctx.font = `700 ${10 * u}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('TORN MAP', mx + mw / 2, my + mh + 10 * u);
  }
  if (deadline !== null) {
    const left = Math.max(0, deadline - t);
    ctx.fillStyle = '#ff6b6b'; ctx.font = `800 ${15 * u}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`Your rival is at the airstrip! The horde arrives in ${Math.ceil(left)}s`, W / 2, pad + 10 * u);
  }
  if (msg.text && t < msg.until) banner(msg.text, H * 0.2, msg.color);
  if (prompt) {
    const keyHint = matchMedia('(pointer: coarse)').matches ? '' : (prompt.plane ? '  [Space]' : '');
    banner(prompt.text + keyHint, H * 0.78, prompt.plane ? '#7bed9f' : '#ff9f43');
  }
}
function banner(text, y, color) {
  const fs = 16 * dpr;
  ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(W - 20, ctx.measureText(text).width + fs * 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(W / 2 - w / 2, y - fs, w, fs * 2);
  ctx.fillStyle = color; ctx.fillText(text, W / 2, y + 1, W - 40);
}

// ---------- Loop and input ----------
let looping = false;
function frame(now) {
  if (!running) { looping = false; return; }
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  update(dt); draw();
  requestAnimationFrame(frame);
}
setInterval(() => {   // keep going if animation frames are paused (background tab)
  if (!running) return;
  const now = performance.now();
  if (now - last > 200) { let left = Math.min(1, (now - last) / 1000); last = now; while (left > 0) { const d = Math.min(0.05, left); update(d); left -= d; } draw(); }
}, 120);

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', e => {
  if (!running) return;
  if (MOVE_KEYS.has(e.code)) { keys[e.code] = true; e.preventDefault(); e.stopImmediatePropagation(); }
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); board(); }
}, true);
window.addEventListener('keyup', e => { if (MOVE_KEYS.has(e.code)) keys[e.code] = false; }, true);
window.addEventListener('blur', () => { keys = {}; });

// thumb joystick for phones
const jz = document.getElementById('jJoy'), knob = document.getElementById('jKnob');
let joyId = null, joyC = null;
jz.addEventListener('pointerdown', e => {
  joyId = e.pointerId; jz.setPointerCapture(e.pointerId);
  const r = jz.getBoundingClientRect(); joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
  joyMove(e);
});
jz.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; joy = { x: 0, y: 0, on: false }; knob.style.transform = ''; };
jz.addEventListener('pointerup', joyEnd); jz.addEventListener('pointercancel', joyEnd);
function joyMove(e) {
  let dx = e.clientX - joyC.x, dy = e.clientY - joyC.y;
  const d = Math.hypot(dx, dy), m = joyC.R * 0.8;
  if (d > m) { dx *= m / d; dy *= m / d; }
  joy = { x: dx / m, y: dy / m, on: true };
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
const sb = document.getElementById('jSprint');
sb.addEventListener('pointerdown', e => { e.preventDefault(); sprintBtn = true; });
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => sb.addEventListener(n, () => { sprintBtn = false; }));
document.getElementById('jAct').addEventListener('click', board);

function showUI(on) {
  document.getElementById('jungle').classList.toggle('hidden', !on);
  canvas.style.filter = '';
}

G.Jungle = {
  // opts: { seed, char, onBoard(plane), onPos(pos)?, onLate()? }
  start(o) {
    opts = o;
    world = generate(o.seed);
    me = { x: world.start.x, y: world.start.y, face: 1, step: 0, moving: false, stamina: 100, infection: 0, kx: 0, ky: 0,
      stunUntil: 0, outUntil: 0, sprayUntil: 0, hit: -9, hasMap: false, foundStrip: false };
    ghost = null; taken = {}; deadline = null; smokeShown = false; windShown = false; dust = []; keys = {}; t = 0;
    showUI(true);
    ensureSounds();
    say('Find the hidden airstrip. Follow the trails, watch for signs.', '#ffd970', 4);
    running = true; last = performance.now();
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  },
  stop() { running = false; stopSounds(); showUI(false); },
  setGhost(g) { ghost = g; },
  markTaken(id) { taken[id] = true; },
  rivalArrived(secondsLeft) { deadline = t + secondsLeft; },
  elapsed() { return t; },
  get running() { return running; },
  // for testing: where things are
  debug() { return { me, strip: world.strip, stripKey: world.stripKey, planes: world.planes, N: world.N, items: world.items, route: world.routePts, zombies: world.zombies }; },
  generate,
};
})();
