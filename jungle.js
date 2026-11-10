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
const SPEED = 230, SPRINT = 1.65, BRUSH_SLOW = 0.72, PLAYER_R = 12;
const T = { BRUSH: 0, TRAIL: 1, WATER: 2, BRIDGE: 3, CLEAR: 4, STRIP: 5 };

function rng(seed) {   // small seeded random generator (mulberry32)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Making the island ----------
// Every game is a new jungle: the camp, the airstrip (where it is and which way it points), the river and its
// bridges, the trail network with its branches, loops and dead ends, and where the clues and dangers are all come
// from the seed. Online, the host sends the seed so both players get the same island.
const STRIP_W = 1500, STRIP_H = 210;
function generate(seed, cfg = { swarms: 9, zombies: 11, signs: true, jungleClock: 210, startAwake: 0.6, routeRange: [2800, 5400] }) {
  // try seeds until the island is fair: reachable, and a route that's neither trivial nor endless
  for (let attempt = 0; attempt < 60; attempt++) {
    const w = tryIsland((seed + attempt * 7919) >>> 0, cfg);
    if (w) { w.seed = seed; w.attempts = attempt + 1; return w; }
  }
  return tryIsland(seed, { ...cfg, routeRange: [0, 1e9] }, true);
}

function tryIsland(seed, cfg, lenient) {
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
  const inMap = (p, m = 260) => ({ x: clamp(p.x, m, MW - m), y: clamp(p.y, m, MH - m) });
  const cxm = MW / 2, cym = MH / 2;

  // the camp and the airstrip, on opposite sides of the island
  const th = R() * TAU;
  const ring = (a, k) => inMap({ x: cxm + Math.cos(a) * MW * 0.4 * k, y: cym + Math.sin(a) * MH * 0.38 * k }, 300);
  const start = ring(th, 0.9 + R() * 0.15);
  const ang = (R() - 0.5) * 0.9;                       // which way the strip points
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  // keep the whole strip clearing (with room to park) on the island
  const hx = Math.abs(ux) * 850 + Math.abs(vx) * 480, hy = Math.abs(uy) * 850 + Math.abs(vy) * 480;
  const sr = ring(th + Math.PI + (R() - 0.5) * 0.9, 0.8 + R() * 0.2);
  const sc = { x: clamp(sr.x, hx + 40, MW - hx - 40), y: clamp(sr.y, hy + 40, MH - hy - 40) };
  if (!lenient && dist(start, sc) < 0.45 * Math.hypot(MW, MH)) return null;
  const toWorld = (lx, ly) => ({ x: sc.x + ux * lx + vx * ly, y: sc.y + uy * lx + vy * ly });
  const toLocal = (x, y) => ({ lx: (x - sc.x) * ux + (y - sc.y) * uy, ly: (x - sc.x) * vx + (y - sc.y) * vy });

  // the river, winding across the middle one way or the other
  // it runs between the camp and the strip, so the way there crosses it
  const vertical = Math.abs(sc.x - start.x) > Math.abs(sc.y - start.y), ph = R() * TAU;
  const off = (vertical ? (start.x + sc.x) / 2 - cxm : (start.y + sc.y) / 2 - cym) + (R() - 0.5) * 240;
  const riverAt = s => vertical ? cxm + off + 220 * Math.sin(s / 520 + ph) + 70 * Math.sin(s / 170 + ph * 2)
    : cym + off + 210 * Math.sin(s / 520 + ph) + 70 * Math.sin(s / 170 + ph * 2);
  const riverOff = (x, y) => vertical ? x - riverAt(y) : y - riverAt(x);   // signed distance-ish from the river
  if (!lenient && Math.abs(riverOff(start.x, start.y)) < 320) return null;
  if (!lenient) for (let lx = -800; lx <= 800; lx += 200) for (const ly of [-460, 0, 460]) {
    const c = toWorld(lx, ly); if (Math.abs(riverOff(c.x, c.y)) < 110) return null;
  }
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (Math.abs(riverOff(cx * CELL + CELL / 2, cy * CELL + CELL / 2)) < 72) grid[cy * GW + cx] = T.WATER;
  }
  const riverPts = [];
  for (let s = 0; s <= (vertical ? MH : MW); s += 100) riverPts.push(vertical ? { x: riverAt(s), y: s } : { x: s, y: riverAt(s) });

  // the main trail: from camp through a few winding waypoints to the near end of the strip
  const endA = toWorld(-(STRIP_W / 2 + 140), 0), endB = toWorld(STRIP_W / 2 + 140, 0);
  const end = dist(endA, start) < dist(endB, start) ? endA : endB;
  const n = 3 + Math.floor(R() * 2), main = [start];
  const dx = end.x - start.x, dy = end.y - start.y, len = Math.hypot(dx, dy), px = -dy / len, py = dx / len;
  for (let k = 1; k <= n; k++) {
    const q = k / (n + 1), side = (R() - 0.5) * 1300;
    main.push(inMap({ x: start.x + dx * q + px * side, y: start.y + dy * q + py * side }));
  }
  main.push(end);
  // branches: dead ends to empty clearings, and loops back onto the main trail
  const edges = [], decoys = [];
  for (let k = 0; k < main.length - 1; k++) edges.push({ a: main[k], b: main[k + 1], main: true, id: 'm' + k });
  const nb = 3 + Math.floor(R() * 3);
  for (let k = 0; k < nb; k++) {
    const from = main[1 + Math.floor(R() * (main.length - 2))];
    const a = R() * TAU, r = 650 + R() * 700;
    const to = inMap({ x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r }, 320);
    if (dist(to, sc) < 900) continue;   // branches never sneak up on the strip
    edges.push({ a: from, b: to, main: false, id: 'b' + k });
    if (R() < 0.35) { const back = main[1 + Math.floor(R() * (main.length - 2))]; if (back !== from) edges.push({ a: to, b: back, main: false, id: 'l' + k }); }
    else decoys.push(to);
  }
  // carve the trails, wobbling through the trees; the main trail in order is the real route
  const trailPts = [], routePts = [], edgePts = [];
  for (const e of edges) {
    const L = dist(e.a, e.b), m = Math.max(2, Math.round(L / 110)), nx = -(e.b.y - e.a.y) / L, ny = (e.b.x - e.a.x) / L;
    const pts = [];
    let prev = e.a;
    for (let k = 1; k <= m; k++) {
      const q = k / m, wob = k === m ? 0 : (R() - 0.5) * 120 * Math.sin(q * Math.PI);
      const p = { x: e.a.x + (e.b.x - e.a.x) * q + nx * wob, y: e.a.y + (e.b.y - e.a.y) * q + ny * wob };
      const d = dist(prev, p);
      for (let s2 = 0; s2 <= d; s2 += 16) pts.push({ x: prev.x + (p.x - prev.x) * s2 / d, y: prev.y + (p.y - prev.y) * s2 / d, edge: e.id });
      prev = p;
    }
    edgePts.push([e, pts]);
  }
  // bridges exactly where a trail crosses the river, laid along the trail: always on the main trail
  // (1 or 2 crossings), sometimes on a branch (otherwise that branch just ends at the water)
  const bridges = [];
  let mainCross = 0;
  for (const [e, pts] of edgePts) {
    for (let i = 1; i < pts.length; i++) {
      const a = Math.sign(riverOff(pts[i - 1].x, pts[i - 1].y)), b = Math.sign(riverOff(pts[i].x, pts[i].y));
      if (a === b || !a || !b) continue;
      if (e.main) mainCross++;
      if (!e.main && !(bridges.length < 3 && R() < 0.5)) continue;
      const p0 = pts[Math.max(0, i - 3)], p1 = pts[Math.min(pts.length - 1, i + 3)], L = dist(p0, p1) || 1;
      const ex = (p1.x - p0.x) / L, ey = (p1.y - p0.y) / L;
      for (let s2 = -170; s2 <= 170; s2 += 16) paint(pts[i].x + ex * s2, pts[i].y + ey * s2, 46, T.BRIDGE);
      bridges.push({ x: pts[i].x, y: pts[i].y });
    }
  }
  if (!lenient && mainCross > 2) return null;
  // wherever the main trail still touches water, lay boardwalk planks so the real route is never cut off
  for (const [e, pts] of edgePts) if (e.main) for (const pt of pts) {
    if (at(Math.floor(pt.x / CELL), Math.floor(pt.y / CELL)) === T.WATER) paint(pt.x, pt.y, 46, T.BRIDGE);
  }
  for (const [e, pts] of edgePts) for (const pt of pts) { paint(pt.x, pt.y, 44, T.TRAIL, true); trailPts.push(pt); if (e.main) routePts.push(pt); }

  // the route must stay a fair length for the mode
  let routeLen = 0;
  for (let i = 1; i < routePts.length; i++) routeLen += dist(routePts[i - 1], routePts[i]);
  const [lo, hi] = cfg.routeRange || [0, 1e9];
  if (routeLen < lo || routeLen > hi) return null;

  // clearings: the camp, the dead ends, and the airstrip with its parking area
  paint(start.x, start.y, 150, T.CLEAR);
  for (const d of decoys) paint(d.x, d.y, 220, T.CLEAR);
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const { lx, ly } = toLocal(cx * CELL + CELL / 2, cy * CELL + CELL / 2);
    if (Math.abs(lx) > STRIP_W / 2 + 70 || Math.abs(ly) > STRIP_H / 2 + 450) continue;
    const i = cy * GW + cx;
    if (grid[i] === T.WATER) continue;
    grid[i] = Math.abs(lx) < STRIP_W / 2 && Math.abs(ly) < STRIP_H / 2 ? T.STRIP : T.CLEAR;
  }
  const strip = {
    cx: sc.x, cy: sc.y, ang, w: STRIP_W, h: STRIP_H, toWorld, toLocal,
    contains(x, y, mx = 0, my = 0) { const l = toLocal(x, y); return Math.abs(l.lx) < STRIP_W / 2 + mx && Math.abs(l.ly) < STRIP_H / 2 + my; },
  };

  // trees and bushes in the undergrowth, kept a cell back from trails and clearings
  const trees = [], bushes = [], buckets = new Map();
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (grid[cy * GW + cx] !== T.BRUSH) continue;
    const x = cx * CELL + CELL / 2 + (R() - 0.5) * 20, y = cy * CELL + CELL / 2 + (R() - 0.5) * 20;
    let open = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nn = at(cx + i, cy + j); if (nn !== T.BRUSH && nn !== -1) open = true; }
    if (!open && R() < 0.55) {
      const tr = { x, y, r: 14 + R() * 12, crown: 30 + R() * 26, hue: R(), palm: R() < 0.25 };
      trees.push(tr); buckets.set(cx + ',' + cy, tr);
    } else if (R() < 0.6) bushes.push({ x, y, r: 12 + R() * 14, hue: R() });
  }

  // checkpoint lanterns along the real route, and trail signs where the trail splits
  const along = q => routePts[Math.min(routePts.length - 1, Math.floor(routePts.length * q))];
  const checkpoints = [{ ...start, lit: true, camp: true }, ...[0.3, 0.55, 0.8].map(q => { const p = along(q); return { x: p.x + 50, y: p.y - 50, lit: false }; })];
  const signs = [];
  if (cfg.signs) {
    const forks = main.slice(1, -1).filter(m => edges.some(e => !e.main && (e.a === m || e.b === m)));
    const broken = Math.floor(R() * Math.max(1, forks.length));
    forks.forEach((m, i) => {
      const nxt = main[main.indexOf(m) + 1], a = Math.atan2(nxt.y - m.y, nxt.x - m.x);
      signs.push({ x: m.x + Math.cos(a + 0.9) * 60, y: m.y + Math.sin(a + 0.9) * 60, angle: a, broken: i === broken && forks.length > 1 });
    });
  }

  // clues and supplies on the trails
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const items = [];
  const mp = along(0.35 + R() * 0.2);
  items.push({ kind: 'map', x: mp.x, y: mp.y });
  for (let i = 0; i < 4; i++) { const p = pick(trailPts); items.push({ kind: 'spray', x: p.x, y: p.y }); }
  for (let i = 0; i < 3; i++) { const p = pick(trailPts); items.push({ kind: 'med', x: p.x, y: p.y }); }

  // mosquitoes along the river, zombies out on the trails
  const swarms = [];
  for (let i = 0; i < cfg.swarms; i++) {
    const rp = pick(riverPts);
    swarms.push({ x: rp.x + (R() - 0.5) * 420, y: rp.y + (R() - 0.5) * 420, ph: R() * TAU, r: 85 + R() * 30 });
  }
  const zombies = [];
  const far = trailPts.filter(p => dist(p, start) > 800);
  for (let i = 0; i < cfg.zombies; i++) {
    const p = pick(far.length ? far : trailPts);
    const wake = i < cfg.zombies * cfg.startAwake ? 0 : R() * cfg.jungleClock * 0.5;
    zombies.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, tx: p.x, ty: p.y, ph: R() * TAU, limp: R() < 0.5, hunch: (R() - 0.5) * 0.4,
      coat: ['lab', 'khaki', 'rags'][Math.floor(R() * 3)], cool: 0, wake, hp: (cfg.zombieHP || 3) + (R() < (cfg.toughChance || 0) ? 1 : 0) });
  }

  // parked planes on both sides of the strip: two that fly, three that never will
  const planes = [
    { id: 'c172', kind: 'c172', reg: 'N4968N', type: 'Cessna 172', flyable: true, stripe: '#a8322b' },
    { id: 'piper', kind: 'cherokee', reg: 'N5512P', type: 'Piper Cherokee', flyable: true, stripe: '#1f5f9e' },
    { id: 'w1', kind: 'c150', reg: 'N9031T', type: 'Cessna 150', flyable: false, why: 'Covered up, and somebody took the propeller. Keep looking!', stripe: '#5f6b3a', paint: '#ddd8c9', cover: true, noProp: true, oil: true },
    { id: 'w2', kind: 'cub', reg: 'N2207K', type: 'Piper Cub', flyable: false, why: 'Flat tire and a cracked wing. Not this one!', stripe: '#1a1a1a', paint: '#e2bd3c', flatTire: true },
    { id: 'w3', kind: 'baron', reg: 'N7766B', type: 'Beechcraft Baron', flyable: false, why: 'The fuel tanks are full of bullet holes.', stripe: '#2e7d4f', paint: '#e3e0d6', bulletHoles: true, oil: true },
  ];
  const below = Math.atan2(-vy, -vx), above = Math.atan2(vy, vx);   // noses point at the strip
  const slots = [[-490, STRIP_H / 2 + 200, below], [0, STRIP_H / 2 + 200, below], [490, STRIP_H / 2 + 200, below],
    [-245, -(STRIP_H / 2 + 200), above], [245, -(STRIP_H / 2 + 200), above]];
  const order = planes.map((p, i) => i).sort(() => R() - 0.5);
  planes.forEach((p, i) => { const [lx, ly, r] = slots[order[i]]; const w = toWorld(lx, ly); p.x = w.x; p.y = w.y; p.rot = r + (R() - 0.5) * 0.25; });

  return { checkpoints, grid, at, riverPts, bridges, N: { S: start }, strip, stripKey: Math.round(sc.x) + ',' + Math.round(sc.y),
    decoys, trees, buckets, bushes, signs, items, swarms, zombies, planes, routePts, routeLen, start: { ...start } };
}

// ---------- The run ----------
const canvas = document.getElementById('jungleCanvas');
const ctx = canvas.getContext('2d');
let dpr = G.Quality.dpr();
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
  for (const p of world.planes) { if (Math.hypot(p.x - x, p.y - y) > 420) continue; for (const c of (p.solid || (p.solid = G.Planes.solid(p)))) if (Math.hypot(c.x - x, c.y - y) < c.r + r) return true; }
  return false;
}

// Walk a short distance, sliding along whatever's in the way instead of stopping dead against it.
function walk(dx, dy) {
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) return;
  const n = Math.ceil(dist / 5), sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) if (!stepAround(sx, sy)) break;
}
function stepAround(sx, sy) {
  const go = (x, y) => { if (blocked(me.x + x, me.y + y, PLAYER_R)) return false; me.x += x; me.y += y; return true; };
  if (go(sx, sy)) return true;
  // curve around it, trying the side that worked last so you glide along a riverbank instead of jittering
  const side = me.slideSide || 1;
  for (const a of [0.5, 0.9, 1.3, Math.PI / 2]) for (const s of [side, -side]) {
    const c = Math.cos(a * s), n = Math.sin(a * s), k = Math.max(0.4, c);
    if (go((sx * c - sy * n) * k, (sx * n + sy * c) * k)) { me.slideSide = s; return true; }
  }
  return false;
}
// The safety net: if you're wedged somewhere and pushing without getting anywhere, you scramble out to open ground.
function clearLine(ax, ay, bx, by) {   // no river between two points
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 15);
  for (let i = 1; i <= n; i++) if (world.at(Math.floor((ax + (bx - ax) * i / n) / CELL), Math.floor((ay + (by - ay) * i / n) / CELL)) === T.WATER) return false;
  return true;
}
function scramble() {
  const open = [T.TRAIL, T.CLEAR, T.BRIDGE, T.STRIP];
  for (const trailOnly of [true, false]) for (let r = 20; r <= 500; r += 20) for (let k = 0; k < 24; k++) {
    const x = me.x + Math.cos(k / 24 * TAU) * r, y = me.y + Math.sin(k / 24 * TAU) * r;
    if (blocked(x, y, PLAYER_R + 3) || (trailOnly && !open.includes(world.at(Math.floor(x / CELL), Math.floor(y / CELL))))) continue;
    if (!clearLine(me.x, me.y, x, y)) continue;
    me.x = x; me.y = y; me.svx = me.svy = me.kx = me.ky = 0;
    say('You scramble free.', '#ffd970', 1.4);
    return true;
  }
  return false;
}
function unstick(pushing, dt) {
  if (!pushing || Math.hypot(me.x - (me.anchorX ?? me.x), me.y - (me.anchorY ?? me.y)) > 30) { me.anchorX = me.x; me.anchorY = me.y; me.stuckT = 0; }
  else me.stuckT = (me.stuckT || 0) + dt;
  if (blocked(me.x, me.y, PLAYER_R) || me.stuckT > 1.1) { me.stuckT = 0; me.anchorX = me.x; me.anchorY = me.y; if (blocked(me.x, me.y, PLAYER_R) || pushing) scramble(); }
}

function update(dt) {
  t += dt;
  // input: arrows / WASD / joystick
  let ix = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  let iy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  if (joy.on) { ix = joy.x; iy = joy.y; }
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  const moving = mag > 0.15 && t >= me.stunUntil && t >= me.outUntil && t >= me.deadUntil;

  // sprinting uses stamina
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || sprintBtn) && moving;
  if (wantSprint && me.stamina > 0) me.stamina = Math.max(0, me.stamina - 32 * dt);
  else me.stamina = Math.min(100, me.stamina + 16 * dt);
  const sprinting = wantSprint && me.stamina > 0;

  const tile = world.at(Math.floor(me.x / CELL), Math.floor(me.y / CELL));
  let sp = SPEED * (sprinting ? SPRINT : 1) * (tile === T.BRUSH ? BRUSH_SLOW : 1) * (me.infection >= 60 ? 0.7 : 1);
  // ease toward the wanted speed (about a tenth of a second), so starts and stops have weight but stay responsive
  const ease = 1 - Math.exp(-dt * 14);
  me.svx = (me.svx || 0) + ((moving ? ix * sp : 0) - (me.svx || 0)) * ease;
  me.svy = (me.svy || 0) + ((moving ? iy * sp : 0) - (me.svy || 0)) * ease;
  let vx = me.svx, vy = me.svy;
  // knocked back by a zombie
  vx += me.kx; vy += me.ky; me.kx *= Math.pow(0.02, dt); me.ky *= Math.pow(0.02, dt);
  walk(vx * dt, vy * dt);
  unstick(moving, dt);
  if (Math.abs(ix) > 0.1 && moving) me.face = ix < 0 ? -1 : 1;
  if (moving) { me.dirx = ix; me.diry = iy; const m2 = Math.hypot(ix, iy) || 1; me.dirx /= m2; me.diry /= m2; }
  me.moving = moving; me.sprinting = sprinting;
  stride(meAnim, me.x, me.y, dt, (side, run) => {   // a foot lands: dust and a step you can hear
    dust.push({ x: me.x + side * 6 + (Math.random() - 0.5) * 6, y: me.y + 3, life: 0.6 + run * 0.2 });
    if (G.Sfx.ctx) G.Sfx.burst(side * 0.2, G.Sfx.t, 0.05 + run * 0.02, (tile === T.BRUSH ? 1200 : 420) * (0.9 + Math.random() * 0.2), 'lowpass', (tile === T.BRUSH ? 0.12 : 0.18) * (1 + run * 0.4));
  });
  dust = dust.filter(d => (d.life -= dt) > 0);

  // mosquitoes and the infection meter
  let buzz = 0;
  for (const s of world.swarms) {
    s.cx = s.x + Math.sin(t * 0.4 + s.ph) * 120; s.cy = s.y + Math.cos(t * 0.31 + s.ph) * 80;
    const d = Math.hypot(s.cx - me.x, s.cy - me.y);
    buzz = Math.max(buzz, clamp(1 - d / 500, 0, 1));
    if (d < s.r && t > me.sprayUntil) me.infection = Math.min(100, me.infection + opts.mode.swarmFever * dt);
  }
  if (me.infection >= 100 && t >= me.outUntil) {
    me.outUntil = t + 3; me.infection = 72;
    say('The fever hits. You black out…', '#ff6b6b', 3);
    G.Sfx.groan(0.15);
  }
  buzzSound(buzz * (t > me.sprayUntil ? 1 : 0.2));

  // zombies wander the trails, then shamble after you
  const cfg = opts.mode, clock = cfg.jungleClock;
  // waves at 50% and 80% of the jungle clock, then the horde pours out at zero
  for (const [k, n, text] of [[0.5, cfg.wave, 'Branches snap all around you. More of them are coming…'], [0.8, cfg.wave, 'A second wave! They’re closing in on the trails.'], [1, cfg.pour, 'THE HORDE IS IN THE JUNGLE. RUN FOR THE PLANES!']]) {
    if (t >= clock * k && !me['wave' + k]) { me['wave' + k] = true; spawnZombies(n, k === 1); say(text, '#ff6b6b', 3.5); G.Sfx.groan(0.3); }
  }
  world.zombies = world.zombies.filter(z => !z.dead || t - z.dead < 1.6);
  for (const z of world.zombies) {
    if (t < z.wake) continue;
    if (z.dead) { z.x += (z.kx || 0) * dt; z.y += (z.ky || 0) * dt; z.kx *= Math.pow(0.02, dt); z.ky *= Math.pow(0.02, dt); continue; }
    // knocked back or stunned zombies don't move under their own power
    z.x += (z.kx || 0) * dt; z.y += (z.ky || 0) * dt;
    z.kx = (z.kx || 0) * Math.pow(0.03, dt); z.ky = (z.ky || 0) * Math.pow(0.03, dt);
    if (t < (z.stunUntil || 0)) continue;
    const d = Math.hypot(z.x - me.x, z.y - me.y);
    const alive = t >= me.deadUntil && t >= me.outUntil;
    // the lunge: a red "!" and a crouch, then the bite unless you counter in time
    if (z.windup) {
      if (t >= z.windup) {
        z.windup = 0; z.cool = t + 2.2;
        if (d < 120 && alive && t >= me.stunUntil) bitten(z);
      }
      continue;
    }
    let tx = z.tx, ty = z.ty, spd = 38 * cfg.zombieSpeed;
    if ((d < 260 || (z.aggro && d < 1400)) && alive) { tx = me.x; ty = me.y; spd = (z.aggro ? 120 : 95) * cfg.zombieSpeed; }
    else if (Math.hypot(z.tx - z.x, z.ty - z.y) < 10) { z.tx = z.hx + (Math.random() - 0.5) * 300; z.ty = z.hy + (Math.random() - 0.5) * 300; }
    if (d < 85 && alive && t > (z.cool || 0)) {
      z.windup = t + cfg.counterWindow;
      // on Mayday they sometimes come at you two at a time
      if (Math.random() < cfg.pairLunge) {
        const buddy = world.zombies.find(o => o !== z && !o.dead && !o.windup && t >= o.wake && Math.hypot(o.x - me.x, o.y - me.y) < 320);
        if (buddy) { buddy.windup = t + cfg.counterWindow; buddy.x = me.x + (me.x - z.x) * 0.9; buddy.y = me.y + (me.y - z.y) * 0.9; }
      }
      continue;
    }
    const dd = Math.hypot(tx - z.x, ty - z.y) || 1;
    const nx = z.x + (tx - z.x) / dd * spd * dt, ny = z.y + (ty - z.y) / dd * spd * dt;
    const tl = world.at(Math.floor(nx / CELL), Math.floor(ny / CELL));
    if (tl !== T.WATER && !blocked(nx, ny, 10)) { z.x = nx; z.y = ny; } else { z.tx = z.hx; z.ty = z.hy; }
    z.face = tx < z.x ? -1 : 1;
  }

  // health: high fever slowly eats it; at zero you go down and wake up at the last checkpoint
  if (me.infection >= 80 && t >= me.deadUntil) hurt(cfg.feverDrain * dt, false);
  if (me.respawnAt && t >= me.respawnAt) respawn();
  // checkpoints: a lantern lights up as you pass
  for (const c of world.checkpoints) {
    if (!c.lit && Math.hypot(c.x - me.x, c.y - me.y) < 90) { c.lit = true; me.checkpoint = c; say('Checkpoint: the lantern is lit.', '#ffd970', 2); G.Sfx.click(); }
  }
  floats = floats.filter(f => (f.life -= dt) > 0);
  botUpdate(dt);

  // pick things up
  for (const it of world.items) {
    if (it.got || Math.hypot(it.x - me.x, it.y - me.y) > 30) continue;
    it.got = true; G.Sfx.click();
    if (it.kind === 'map') { me.hasMap = true; say('A torn piece of map! The airstrip is somewhere in the circle.', '#ffd970', 3.5); }
    if (it.kind === 'spray') { me.infection = Math.max(0, me.infection - 30); me.sprayUntil = t + 20; say('Bug spray: mosquitoes keep away for a while', '#7bed9f'); }
    if (it.kind === 'med') { me.infection = Math.max(0, me.infection - 50); me.health = Math.min(100, me.health + 50); say('Med kit: fever down, health up', '#7bed9f'); }
  }

  // clues: the radio at the strip gets louder as you get close; windsock and smoke above the trees
  const ds = Math.hypot(world.strip.cx - me.x, world.strip.cy - me.y);
  beaconSound(ds);
  if (!windShown && ds < 1300) { windShown = true; say('A windsock pokes above the trees…', '#ffd970', 3); }
  if (!smokeShown && t > opts.mode.smokeAfter) { smokeShown = true; say('Smoke above the canopy. Someone lit a fire by the planes!', '#ffd970', 3.5); }
  for (const s of world.signs) if (!s.seen && Math.hypot(s.x - me.x, s.y - me.y) < 120) { s.seen = true; say(s.broken ? 'A broken trail sign. Hard to read…' : 'A trail sign: STRIP →', '#ffd970', 2.2); }
  if (!me.foundStrip && world.strip.contains(me.x, me.y, 220, 460)) {
    me.foundStrip = true; say('THE AIRSTRIP! Find a plane that can fly.', '#7bed9f', 3);
  }
  // a decoy clearing at the end of a dead-end trail
  for (const d of world.decoys) {
    if (d.seen || Math.hypot(d.x - me.x, d.y - me.y) > 160) continue;
    d.seen = true; say('Just an empty clearing. Not the airstrip.', '#ff9f43', 2.4);
  }

  // planes: walk up to one and climb in
  prompt = null;
  for (const p of world.planes) {
    if (Math.hypot(p.x - me.x, p.y - me.y) > 175) continue;
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

// ---------- The bot rival (Race a bot) ----------
// It follows the trail toward the strip, sometimes wanders off the wrong way, fights zombies (and sometimes loses),
// gets slowed by mosquitoes, goes down and wakes at a checkpoint, then takes the first free plane.
let bot = null;
function botUpdate(dt) {
  const b = bot, cfg = opts.mode, route = world.routePts;
  if (!b || b.boarded) return;
  if (t < b.deadUntil) return;
  if (b.respawn) {
    b.respawn = false; b.health = 100;
    const c = b.cp || world.checkpoints[0];
    b.x = c.x; b.y = c.y;
    let best = 0, bd = Infinity; route.forEach((q, i) => { const d = Math.hypot(q.x - c.x, q.y - c.y); if (d < bd) { bd = d; best = i; } });
    b.i = best;
  }
  // where it's heading: a wrong turn, the next trail point, or a plane at the end
  let tx, ty;
  if (b.detour) { tx = b.detour.x; ty = b.detour.y; if (Math.hypot(tx - b.x, ty - b.y) < 25) b.detour = b.detour.back; }
  else if (b.i < route.length) { tx = route[b.i].x; ty = route[b.i].y; if (Math.hypot(tx - b.x, ty - b.y) < 24) b.i += 2; }
  else {
    const plane = world.planes.find(p => p.flyable && !taken[p.id]);
    if (!plane) return;
    tx = plane.x + 110; ty = plane.y;
    if (Math.hypot(tx - b.x, ty - b.y) < 30) {
      b.boarded = true; taken[plane.id] = true; ghost = null;
      say(`${G.CHARS[b.char].short} just climbed into ${plane.reg}!`, '#5ec8e5', 3);
      if (opts.onBotBoard) opts.onBotBoard(plane.id, { time: t, deaths: b.deaths });
      return;
    }
  }
  if (!b.detour && b.i < route.length && Math.random() < cfg.botDetour * 0.05 * dt) {
    // a wrong turn: wander off a few seconds into the trees, then come back
    const a = Math.random() * TAU, r = 260 + Math.random() * 200;
    b.detour = { x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, back: { x: b.x, y: b.y, back: null } };
  }
  let sp = SPEED * cfg.botSpeed;
  for (const s of world.swarms) if (s.cx !== undefined && Math.hypot(s.cx - b.x, s.cy - b.y) < s.r) sp *= 0.6;   // mosquitoes slow it
  const d = Math.hypot(tx - b.x, ty - b.y) || 1;
  b.x += (tx - b.x) / d * Math.min(d, sp * dt); b.y += (ty - b.y) / d * Math.min(d, sp * dt);
  b.face = tx < b.x ? -1 : 1;
  for (const c of world.checkpoints) if (Math.hypot(c.x - b.x, c.y - b.y) < 90) b.cp = c;
  // zombies in its way: it swings, and sometimes misses
  for (const z of world.zombies) {
    if (t < z.wake || z.dead || Math.hypot(z.x - b.x, z.y - b.y) > 80) continue;
    if (t >= (b.strikeReady || 0)) {   // it swings to the same rhythm you do, and sometimes misses
      b.strikeReady = t + cfg.strikeCooldown * 1.4;
      if (Math.random() < cfg.botFight) { strike(z, 1, b.x, b.y, 0.45, 230); if (!z.dead) pop(z.x, z.y - 80, 'HIT!', '#5ec8e5'); }
    }
    if (z.dead || t < (z.stunUntil || 0) || t < (z.botCool || 0)) continue;
    z.botCool = t + 2.5;
    if (Math.random() < cfg.botFight) { strike(z, 1, b.x, b.y, 1.0, 400); }
    else {
      b.health -= cfg.bite;
      if (b.health <= 0) {
        b.deaths++; b.deadUntil = t + 2.6; b.respawn = true;
        say(`${G.CHARS[b.char].short} was bitten! Back to a checkpoint.`, '#5ec8e5', 2.5);
      }
    }
  }
  ghost = { x: b.x, y: b.y, face: b.face, moving: true, char: b.char };
}
// roughly how many seconds until the bot climbs into a plane (used when you board first)
function botEta() {
  const b = bot; if (!b) return null;
  if (b.boarded) return 0;
  let dist = 0, px = b.x, py = b.y;
  for (let i = b.i; i < world.routePts.length; i += 4) { const q = world.routePts[i]; dist += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
  return dist / (SPEED * opts.mode.botSpeed) * (1.15 + Math.random() * 0.25) + 4 + Math.max(0, b.deadUntil - t);
}

// ---------- Fighting back ----------
const WEAPON = {
  ivy: { reach: 140, cone: 1.2, knock: 620, stun: 1.0 },
  wren: { reach: 105, cone: 1.5, knock: 520, stun: 1.2 },
  elias: { reach: 90, cone: 1.3, knock: 560, stun: 1.0 },
  kip: { reach: 230, cone: 0.8, knock: 0, stun: 2.0 },
  briar: { reach: 260, cone: 0.45, knock: 480, stun: 1.0 },
};
const SORRY = ['Sorry! So sorry!', 'Pardon me!', 'Nothing personal!', 'Oh dear, my apologies!', 'Terribly sorry!'];
let floats = [];
function pop(x, y, text, color) { floats.push({ x, y, text, color, life: 1.2 }); }

// one hit on a zombie: it staggers back with a flash; the last hit brings it down
function strike(z, dmg, fromX, fromY, stun, knock, byMe) {
  z.maxHp = z.maxHp ?? (z.hp ?? opts.mode.zombieHP);
  z.hp = (z.hp ?? opts.mode.zombieHP) - dmg;
  z.hitAt = t; z.windup = 0; z.cool = t + 1.2; z.stunUntil = Math.max(z.stunUntil || 0, t + stun);
  const a = Math.atan2(z.y - fromY, z.x - fromX);
  if (knock) { z.kx = Math.cos(a) * knock; z.ky = Math.sin(a) * knock; }
  if (z.hp <= 0) {
    z.dead = t; z.kx = Math.cos(a) * 160; z.ky = Math.sin(a) * 160;
    if (byMe) me.kills = (me.kills || 0) + 1;
    pop(z.x, z.y - 80, 'DOWN!', '#ffd970');
    G.Sfx.groan(0.12);
    if (Math.random() < opts.mode.dropChance) world.items.push({ kind: Math.random() < 0.5 ? 'spray' : 'med', x: z.x, y: z.y });
  }
}

function attack() {
  if (!running || t < me.attackReady || t < me.deadUntil || t < me.outUntil) return;
  const w = WEAPON[opts.char] || WEAPON.ivy, cfg = opts.mode;
  me.attackReady = t + cfg.strikeCooldown;
  me.attackAt = t;
  const dir = Math.atan2(me.diry, me.dirx);
  let hits = 0, counters = 0;
  for (const z of world.zombies) {
    if (t < z.wake || z.dead) continue;
    const d = Math.hypot(z.x - me.x, z.y - me.y);
    if (d > w.reach) continue;
    let da = Math.atan2(z.y - me.y, z.x - me.x) - dir;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > w.cone && d > 40) continue;
    hits++;
    const countered = !!z.windup;
    if (countered) counters++;
    // every strike lands a hit; catching a lunge is a perfect counter worth double and a longer stagger
    strike(z, countered ? 2 : 1, me.x, me.y, opts.char === 'kip' ? w.stun : countered ? w.stun : 0.45, countered ? w.knock : w.knock * 0.45, true);
    if (!z.dead) pop(z.x, z.y - 80, countered ? 'PERFECT COUNTER!' : opts.char === 'kip' ? 'STUNNED' : 'HIT!', countered ? '#7bed9f' : '#fff');
  }
  // sounds and character touches
  const S = G.Sfx;
  if (S.ctx) {
    if (opts.char === 'kip') { S.burst(0, S.t, 0.03, 4000, 'highpass', 0.5); S.burst(0, S.t + 0.07, 0.03, 3000, 'highpass', 0.4); S.tone(0, S.t, 0.5, 2400, 'sine', 0.05, 5200); }
    else if (opts.char === 'wren') { S.burst(0, S.t, 0.18, 3500, 'highpass', 0.4); S.tone(0, S.t + 0.05, 0.25, 2600, 'triangle', 0.08, 1800); }
    else if (opts.char === 'ivy') { S.burst(0, S.t, 0.12, 1500, 'bandpass', 0.3); S.burst(0, S.t + 0.12, 0.04, 5000, 'highpass', 0.7); }
    else { S.burst(0, S.t, 0.2, 900, 'bandpass', 0.3); if (hits) S.tone(0, S.t + 0.1, 0.15, 110, 'sine', 0.5, 70); }
    // the character's line ("Get back!", "Not today!", "Sorry, little guy!", "Say cheese!") on a good counter, not every swing
    if (counters && t - (me.lastAttackVoice ?? -99) > 10) { me.lastAttackVoice = t; S.playFile(`assets/voice/${opts.char}-attack.mp3`); }
  }
  if (opts.char === 'kip') me.flashAt = t;
  if (opts.char === 'elias' && hits) { pop(me.x, me.y - 110, '(fern ok)', '#9fd38a'); say(SORRY[Math.floor(Math.random() * SORRY.length)], '#9fd38a', 1.4); }
  if (opts.char === 'ivy' && Math.random() < 1 / 8) {
    me.kx = me.dirx * 760; me.ky = me.diry * 760;
    say('The vine grabs a tree and slingshots you forward!', '#9fd38a', 2);
  }
}

function bitten(z) {
  const a = Math.atan2(me.y - z.y, me.x - z.x);
  me.kx = Math.cos(a) * 520; me.ky = Math.sin(a) * 520; me.stunUntil = t + 0.7; me.hit = t;
  G.Sfx.bang(); G.Sfx.groan(0.2);
  hurt(opts.mode.bite, true);
  if (me.health > 0) say(`Bitten! −${opts.mode.bite} health. Press Space to fight back!`, '#ff6b6b', 1.8);
}

function hurt(amount, loud) {
  if (t < me.deadUntil) return;
  me.health = Math.max(0, me.health - amount);
  if (me.health > 0) return;
  // down: a short death beat, then wake at the last checkpoint. The clock keeps running.
  me.deadUntil = t + 2.6; me.respawnAt = t + 2.6; me.deaths = (me.deaths || 0) + 1;
  say('You were bitten…', '#ff6b6b', 2.6);
  const v = G.CHARS && G.CHARS[opts.char] ? G.CHARS[opts.char].voice : 'ivy';
  G.Sfx.voice(v, 'whoa');
  if (opts.onBitten) opts.onBitten();
  void loud;
}

function respawn() {
  me.respawnAt = 0;
  const c = me.checkpoint || world.checkpoints[0];
  me.x = c.x; me.y = c.y; me.kx = me.ky = 0;
  me.health = 100; me.infection = opts.mode.respawnFever; me.stunUntil = 0;
  // clear the zombies around the checkpoint so you don't wake up in a crowd
  world.zombies = world.zombies.filter(z => z.aggro ? Math.hypot(z.x - c.x, z.y - c.y) > 700 : true);
  for (const z of world.zombies) {
    if (Math.hypot(z.x - c.x, z.y - c.y) < 600) { const a = Math.random() * TAU; z.x = c.x + Math.cos(a) * 900; z.y = c.y + Math.sin(a) * 900; if (blocked(z.x, z.y, 10)) { z.x = z.hx; z.y = z.hy; } z.windup = 0; }
  }
  say('You wake up at the lantern. Keep going!', '#ffd970', 2.5);
}

// zombies coming out of the trees somewhere off-screen around you
function spawnZombies(n, aggro) {
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * TAU, r = 620 + Math.random() * 380;
      const x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r;
      if (blocked(x, y, 12)) continue;
      world.zombies.push({ x, y, hx: x, hy: y, tx: me.x, ty: me.y, ph: Math.random() * TAU, limp: Math.random() < 0.5,
        hunch: (Math.random() - 0.5) * 0.4, coat: ['lab', 'khaki', 'rags'][i % 3], cool: 0, wake: 0, aggro,
        hp: opts.mode.zombieHP + (Math.random() < opts.mode.toughChance ? 1 : 0) });
      break;
    }
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
  const v = Math.pow(clamp(1 - d / 2600, 0, 1), 2) * opts.mode.radio;
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

function drawPlane(p) { G.Planes.draw(ctx, p, t); }

// ---------- walking and running, shared with base camp ----------
// Each person has an animation state driven by how they actually move: gait (0 standing, 1 walking, more when
// sprinting), a stride that advances with distance (no sliding feet), and a facing that swings round in a turn.
// Sideways movement shows the side-view walk cycle; standing, or heading up or down the screen, shows the front view.
const STRIDE_W = 30;   // world units per step at a walk
const meAnim = {}, ghostAnim = {};
function stride(a, x, y, dt, onStep) {
  if (a.x === undefined || Math.hypot(x - a.x, y - a.y) > 200) { a.x = x; a.y = y; a.vx = a.vy = 0; a.step = 0; a.gait = 0; }
  if (!dt) return;
  const k = 1 - Math.exp(-dt * 12);
  a.vx += ((x - a.x) / dt - a.vx) * k; a.vy += ((y - a.y) / dt - a.vy) * k;
  const dist = Math.hypot(x - a.x, y - a.y); a.x = x; a.y = y;
  const speed = Math.hypot(a.vx, a.vy);
  a.run = clamp((speed / SPEED - 1.05) / 0.5, 0, 1);   // 0 walking, 1 flat-out sprint
  a.gait += (Math.min(1, speed / (SPEED * 0.6)) - a.gait) * (1 - Math.exp(-dt * 8));
  if (Math.abs(a.vx) > 25) a.face = a.vx > 0 ? 1 : -1;
  a.faceS = a.faceS === undefined ? (a.face || 1) : a.faceS + ((a.face || 1) - a.faceS) * (1 - Math.exp(-dt * 12));
  // how much side-view walk to show: walking sideways is all walk, standing or heading up or down is the front view
  const sm = v => v * v * (3 - 2 * v), vx = Math.abs(a.vx), vy = Math.abs(a.vy);
  const side = vx + vy > 5 ? vx / (vx + vy * 0.8) : 0;
  const want = sm(clamp((a.gait - 0.15) / 0.35, 0, 1)) * sm(clamp((side - 0.3) / 0.4, 0, 1));
  a.walkW = (a.walkW || 0) + (want - (a.walkW || 0)) * (1 - Math.exp(-dt * 10));
  const before = Math.floor(a.step);
  a.step += dist / (STRIDE_W * (1 + a.run * 0.4));   // longer strides when sprinting
  if (onStep && Math.floor(a.step) !== before && a.gait > 0.3) onStep(Math.floor(a.step) % 2 ? 1 : -1, a.run);
}
function drawWalker(a, char, x, y, alpha, hit) {
  const W8 = G.Walk, im = charImg(char);
  const h = 84, w = h * 512 / 576, g = a.gait || 0, run = a.run || 0;
  const ph = (a.step || 0) * Math.PI, contact = Math.abs(Math.cos(ph));
  const bob = g * (1 - contact) * (5 + run * 4), squash = 1 - g * contact * (0.03 + run * 0.03);
  const breathe = (1 - g) * Math.sin(t * 2.1 + x * 0.01) * 0.008;
  const fs = a.faceS === undefined ? 1 : a.faceS, turn = Math.sign(fs || 1) * Math.max(0.18, Math.abs(fs));
  const lean = Math.sign(fs || 1) * g * (0.05 + run * 0.09) + g * Math.sin(ph) * 0.02;
  const smooth = v => v * v * (3 - 2 * v);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 16 + g * 3 - bob * 0.6, 6, 0, 0, TAU); ctx.fill();
  ctx.translate(x, y - bob);
  ctx.rotate(lean);
  ctx.scale(turn * (1 + (1 - squash) * 0.6), squash + breathe);
  const tint = c => (hit && W8 ? W8.lit(c, '#ff2a2a', 0.45) : null) || c;
  const ww = W8 && W8.WALK[char] ? (a.walkW || 0) : 0;
  if (ww < 0.999 && im.complete && im.naturalWidth) { ctx.globalAlpha = alpha * Math.min(1, (1 - ww) * 2); ctx.drawImage(tint(im), -w / 2, -h * (561 / 576), w, h); }
  if (ww > 0.001) {
    // four beats per stride (right foot, passing, left foot, passing), each dissolving into the next
    const beat = (a.step || 0) * 2, i = Math.floor(beat), f = beat - i, fh = h * W8.FIG[char];
    const frame = k => { const n = W8.CYCLE[((k % 4) + 4) % 4]; return { im: charImg(`walk/${char}-${n}`), ax: W8.WALK[char][n] }; };
    const put = (fr, al) => { if (!fr.im.complete || !fr.im.naturalWidth || al <= 0) return; const fw = fh * fr.im.naturalWidth / fr.im.naturalHeight; ctx.globalAlpha = al; ctx.drawImage(tint(fr.im), -fw * fr.ax, -fh, fw, fh); };
    const solid = alpha * Math.min(1, ww * 2), mix = smooth(clamp((f - 0.6) / 0.4, 0, 1));
    put(frame(i), solid); put(frame(i + 1), solid * mix);
  }
  if (!im.complete || !im.naturalWidth) { ctx.fillStyle = '#ddd'; ctx.fillRect(-10, -50, 20, 50); }
  ctx.restore();
}

const imgs = {};
const charImg = c => { const src = G.art(`${c}.png`); return imgs[src] || (imgs[src] = Object.assign(new Image(), { src })); };
// Photoreal ground and canopy art (assets/jungle). Ground textures tile seamlessly; scale = world units per texture pixel.
const TEX = { floor: 0.7, trail: 0.42, water: 0.8, clear: 0.95, strip: 0.55, bridge: 0.22 };
const tex = n => imgs['t' + n] || (imgs['t' + n] = Object.assign(new Image(), { src: `assets/jungle/${n}.jpg` }));
const sprite = n => imgs['s' + n] || (imgs['s' + n] = Object.assign(new Image(), { src: `assets/jungle/${n}.png` }));
const ready = im => im.complete && im.naturalWidth > 0;
const patterns = new Map();
function pattern(n, c = ctx) {
  const key = n + (c === ctx ? '' : '*');
  if (patterns.has(key)) return patterns.get(key);
  const im = tex(n);
  if (!ready(im)) return null;
  const p = c.createPattern(im, 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix().scale(TEX[n]));
  patterns.set(key, p);
  return p;
}
// Feathered ground: for each island, a soft-edged mask of where each surface is (built once, at 1/5 scale).
// Each frame the texture is filled on a scratch canvas, cut to the mask, and laid on the jungle floor,
// so trails, clearings and the river fade into the undergrowth instead of ending in hard, lumpy edges.
const MS = 0.2;
let masks = null, maskWorld = null;
const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
function softMask(cells, rad, inner) {
  const m = document.createElement('canvas'); m.width = Math.ceil(MW * MS); m.height = Math.ceil(MH * MS);
  const c = m.getContext('2d'), r = rad * MS;
  for (const [cx, cy] of cells) {
    const x = (cx + 0.5) * CELL * MS, y = (cy + 0.5) * CELL * MS;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(inner, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return m;
}
function buildMasks() {
  const of = (...types) => { const out = []; for (let i = 0; i < world.grid.length; i++) if (types.includes(world.grid[i])) out.push([i % GW, Math.floor(i / GW)]); return out; };
  const trail = of(T.TRAIL);
  masks = {
    clear: softMask(of(T.CLEAR, T.STRIP), CELL * 1.05, 0.45),
    rim: softMask(trail, CELL * 1.25, 0.3),     // the damp, darker earth along the trail's edge
    trail: softMask(trail, CELL * 0.95, 0.5),
    water: softMask(of(T.WATER, T.BRIDGE), CELL * 0.9, 0.6),
  };
  maskWorld = world;
}
// The ground never changes during a run, so it's painted once into tiles as you come near them, and each frame just
// lays down the handful of tiles on screen. That's far less work than compositing the whole floor every frame.
const TILE = 400, TILE_PAD = 2, TILE_KEEP = 48;
let tiles = new Map(), tileWorld = null, tileScale = 1, tileClock = 0;
function groundReady() { return ['floor', 'clear', 'trail', 'water', 'strip', 'bridge'].every(n => pattern(n)) && ready(sprite('bush')); }
function bakeTile(tx, ty) {
  const size = TILE + TILE_PAD * 2, wx = tx * TILE - TILE_PAD, wy = ty * TILE - TILE_PAD, px = Math.ceil(size * tileScale);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const c = cv.getContext('2d'), toWorld = g => g.setTransform(tileScale, 0, 0, tileScale, -wx * tileScale, -wy * tileScale);
  toWorld(c); c.fillStyle = pattern('floor', bctx); c.fillRect(wx, wy, size, size);
  if (buf.width !== px || buf.height !== px) { buf.width = px; buf.height = px; }
  const lay = (name, mask) => {
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalCompositeOperation = 'source-over'; bctx.clearRect(0, 0, px, px);
    toWorld(bctx); bctx.fillStyle = pattern(name, bctx); bctx.fillRect(wx, wy, size, size);
    bctx.globalCompositeOperation = 'destination-in'; bctx.drawImage(mask, 0, 0, MW, MH);
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(buf, 0, 0); toWorld(c);
  };
  lay('clear', masks.clear);
  c.globalAlpha = 0.45; c.drawImage(masks.rim, 0, 0, MW, MH); c.globalAlpha = 1;
  lay('trail', masks.trail);
  lay('water', masks.water);
  const x0 = Math.max(0, Math.floor(wx / CELL)), y0 = Math.max(0, Math.floor(wy / CELL)), x1 = Math.min(GW - 1, Math.ceil((wx + size) / CELL)), y1 = Math.min(GH - 1, Math.ceil((wy + size) / CELL));
  c.fillStyle = pattern('bridge', bctx);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (world.grid[cy * GW + cx] === T.BRIDGE) c.fillRect(cx * CELL - 2, cy * CELL, CELL + 4, CELL);
  // the runway: a straight band of packed red dirt with a centre line of stones
  const st = world.strip;
  c.save(); c.translate(st.cx, st.cy); c.rotate(st.ang); c.fillStyle = pattern('strip', bctx); c.fillRect(-st.w / 2, -st.h / 2 + 20, st.w, st.h - 40);
  c.fillStyle = '#e8e2d0'; for (let x = -st.w / 2 + 30; x < st.w / 2 - 30; x += 60) c.fillRect(x, -3, 26, 6);
  c.restore();
  const bi = sprite('bush');
  for (const b of world.bushes) {
    if (b.x < wx - 40 || b.x > wx + size + 40 || b.y < wy - 40 || b.y > wy + size + 40) continue;
    c.save(); c.translate(b.x, b.y); c.rotate(b.hue * 6.28); c.drawImage(bi, -b.r * 1.25, -b.r * 1.25, b.r * 2.5, b.r * 2.5); c.restore();
  }
  return { cv, used: 0 };
}
function drawGround(zoom, camX, camY) {
  if (tileWorld !== world) { tiles = new Map(); tileWorld = world; tileScale = clamp(zoom, 0.75, 1.5); if (maskWorld !== world) buildMasks(); }
  tileClock++;
  const tx0 = Math.max(0, Math.floor(camX / TILE)), ty0 = Math.max(0, Math.floor(camY / TILE));
  const tx1 = Math.min(Math.floor((MW - 1) / TILE), Math.floor((camX + W / zoom) / TILE)), ty1 = Math.min(Math.floor((MH - 1) / TILE), Math.floor((camY + H / zoom) / TILE));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const key = tx + ',' + ty;
    let tile = tiles.get(key);
    if (!tile) { tile = bakeTile(tx, ty); tiles.set(key, tile); }
    tile.used = tileClock;
    ctx.drawImage(tile.cv, tx * TILE - TILE_PAD, ty * TILE - TILE_PAD, TILE + TILE_PAD * 2, TILE + TILE_PAD * 2);
  }
  if (tiles.size > TILE_KEEP) {   // forget the ones furthest behind you
    const old = [...tiles].sort((a, b) => a[1].used - b[1].used).slice(0, tiles.size - TILE_KEEP);
    old.forEach(([k]) => tiles.delete(k));
  }
}
Object.keys(TEX).forEach(tex); ['tree1', 'tree2', 'tree3', 'palm1', 'palm2', 'bush'].forEach(sprite);
function draw() {
  const r = canvas.getBoundingClientRect();
  dpr = G.Quality.dpr();
  W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const zoom = clamp(Math.min(r.width, r.height) / 620, 0.62, 1.25) * dpr;
  const camX = clamp(me.x - W / zoom / 2, 0, MW - W / zoom), camY = clamp(me.y - H / zoom / 2, 0, MH - H / zoom);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1a10'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  const x0 = Math.max(0, Math.floor(camX / CELL) - 1), y0 = Math.max(0, Math.floor(camY / CELL) - 1);
  const x1 = Math.min(GW - 1, Math.ceil((camX + W / zoom) / CELL) + 1), y1 = Math.min(GH - 1, Math.ceil((camY + H / zoom) / CELL) + 1);

  // ground: photoreal textures when they've loaded, flat colours until then
  const baked = groundReady();
  if (baked) {
    drawGround(zoom, camX, camY);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (world.grid[cy * GW + cx] === T.WATER) { ctx.fillStyle = `rgba(200,170,230,${0.05 + 0.05 * Math.sin(t * 2 + cx * 0.7 + cy)})`; ctx.fillRect(cx * CELL + 4, cy * CELL + 18, 22, 2); }
    }
  } else {
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const tile = world.grid[cy * GW + cx];
      ctx.fillStyle = GROUND[tile];
      ctx.fillRect(cx * CELL, cy * CELL, CELL + 1, CELL + 1);
    }
  }
  // the airstrip: dirt runway with a centre line of stones
  const s = world.strip;
  if (!baked) {
    ctx.save(); ctx.translate(s.cx, s.cy); ctx.rotate(s.ang); ctx.fillStyle = '#e8e2d0';
    for (let x = -s.w / 2 + 30; x < s.w / 2 - 30; x += 60) ctx.fillRect(x, -3, 26, 6);
    ctx.restore();
  }
  // a fire barrel by the planes (the smoke clue)
  const { x: fx, y: fy } = s.toWorld(s.w / 2 - 60, s.h / 2 + 40);
  ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(fx, fy, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,${140 + Math.random() * 60},40,0.9)`; ctx.beginPath(); ctx.arc(fx, fy, 7 + Math.random() * 3, 0, TAU); ctx.fill();

  // bushes, items, signs
  if (!baked) for (const b of world.bushes) {
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
  for (const p of world.planes) if (inView(p.x, p.y, 320)) stand.push({ y: p.y - 260, f: () => drawPlane(p) });
  for (const z of world.zombies) if (t >= z.wake && inView(z.x, z.y, 80)) stand.push({ y: z.y, f: () => {
    if (z.dead) {   // collapses and fades away
      const k = Math.min(1, (t - z.dead) / 0.5);
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (t - z.dead) / 1.6);
      ctx.translate(z.x, z.y); ctx.rotate((z.face || 1) * k * 1.45); ctx.scale(z.face || 1, 1);
      G.drawZombie(ctx, 0, 0, 64, z, z.dead, false, 0.2); ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(z.x, z.y); ctx.scale(z.face || 1, z.windup ? 0.86 : 1);
    if (t - (z.hitAt ?? -9) < 0.12) ctx.translate((Math.random() - 0.5) * 8, 0);   // stagger
    G.drawZombie(ctx, 0, 0, 64, z, t, !!z.windup, 0); ctx.restore();
    if (t - (z.hitAt ?? -9) < 0.12) {   // hit flash
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(z.x, z.y - 34, 18, 34, 0, 0, TAU); ctx.fill();
    }
    if (z.hitAt !== undefined) {   // health bar once it's been hit
      const w2 = 40, k = clamp(z.hp / z.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(z.x - w2 / 2 - 1, z.y - 94, w2 + 2, 7);
      ctx.fillStyle = k > 0.5 ? '#e0c050' : '#e05040'; ctx.fillRect(z.x - w2 / 2, z.y - 93, w2 * k, 5);
    }
    if (z.windup) {   // about to lunge: a red ring and a "!"
      ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(z.x, z.y, 26, 10, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ff3b3b'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', z.x, z.y - 74 + Math.sin(t * 30) * 2);
    } else if (t < (z.stunUntil || 0)) {   // dazed
      ctx.fillStyle = '#ffe066'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
      for (let k = 0; k < 3; k++) { const a = t * 5 + k * TAU / 3; ctx.fillText('✶', z.x + Math.cos(a) * 16, z.y - 70 + Math.sin(a) * 5); }
    }
  } });
  for (const c of world.checkpoints) if (inView(c.x, c.y, 80)) stand.push({ y: c.y, f: () => drawLantern(c) });
  if (ghost && inView(ghost.x, ghost.y, 80)) stand.push({ y: ghost.y, f: () => { drawWalker(ghostAnim, ghost.char, ghostAnim.x, ghostAnim.y, 0.8, false); ctx.fillStyle = '#5ec8e5'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(bot ? G.CHARS[ghost.char].short.toUpperCase() : 'RIVAL', ghostAnim.x, ghostAnim.y - 86); } });
  stand.push({ y: me.y, f: () => drawWalker(meAnim, opts.char, me.x, me.y, 1, t - me.hit < 0.3) });
  stand.sort((a, b) => a.y - b.y).forEach(o => o.f());
  // Clear Skies only: a soft arrow over the planes that can still fly
  if (opts.mode.planeHint && me.foundStrip) {
    for (const p of world.planes) {
      if (!p.flyable || taken[p.id] || !inView(p.x, p.y, 200)) continue;
      const bob = Math.sin(t * 3) * 8;
      ctx.fillStyle = 'rgba(123,237,159,0.55)';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 150 + bob); ctx.lineTo(p.x - 18, p.y - 180 + bob); ctx.lineTo(p.x + 18, p.y - 180 + bob); ctx.fill();
    }
  }
  drawAttack();
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life * 1.5); ctx.fillStyle = f.color; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - (1.2 - f.life) * 40); ctx.globalAlpha = 1;
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
  const { x: wx, y: wy } = s.toWorld(-s.w / 2 + 20, -s.h / 2 - 20);
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - 70); ctx.stroke();
  ctx.save(); ctx.translate(wx, wy - 66); ctx.rotate(0.3 + Math.sin(t * 2) * 0.15);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#fff' : '#ff7a1a'; ctx.fillRect(k * 12, -7 + k, 12, 14 - k * 2); }
  ctx.restore();
  // smoke from the fire barrel
  if (inView(fx, fy - 130, 320)) for (let k = 0; k < 14; k++) {
    const q = (t * 0.25 + k / 14) % 1;
    ctx.fillStyle = `rgba(190,190,200,${0.35 * (1 - q)})`;
    ctx.beginPath(); ctx.arc(fx + q * 120 + Math.sin(q * 6 + k) * 14, fy - q * 260, 10 + q * 40, 0, TAU); ctx.fill();
  }

  // dusk light, fever blur and edge clues (screen space)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.Quality.bare) { ctx.fillStyle = 'rgba(70,40,85,0.26)'; ctx.fillRect(0, 0, W, H); }   // a cheaper dusk for slow computers
  else { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#c4aec8'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }   // the same purple dusk as base camp
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  v.addColorStop(0, 'rgba(40,10,40,0.05)'); v.addColorStop(1, 'rgba(10,0,15,0.7)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (!G.Quality.lite) G.Scene.overlay(ctx, W, H, 0);   // the same film grain as the title and cockpit
  let look = me.infection >= 60 ? (G.Quality.lite ? 'saturate(0.7)' : `blur(${((me.infection - 60) / 40 * 2.2 + 0.6).toFixed(1)}px) saturate(0.7)`) : '';
  if (t < me.outUntil) { ctx.fillStyle = `rgba(0,0,0,${0.85})`; ctx.fillRect(0, 0, W, H); }
  if (t - me.flashAt < 0.35) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - (t - me.flashAt) / 0.35)})`; ctx.fillRect(0, 0, W, H); }
  if (t < me.deadUntil) {
    const k = 1 - (me.deadUntil - t) / 2.6;
    look = `grayscale(${Math.min(1, k * 2)})`;
    ctx.fillStyle = `rgba(120,0,0,${0.35 + k * 0.4})`; ctx.fillRect(0, 0, W, H);
  }
  if (look !== canvasLook) { canvasLook = look; canvas.style.filter = look; }
  edgeClue(camX, camY, zoom, s.cx, s.cy, smokeShown || me.hasMap, 'smoke');
  hud();
}

function drawLantern(c) {
  ctx.fillStyle = '#4b3520'; ctx.fillRect(c.x - 2, c.y - 44, 4, 46);
  ctx.fillRect(c.x - 2, c.y - 44, 14, 3);
  if (c.lit) {
    const g = ctx.createRadialGradient(c.x + 11, c.y - 34, 0, c.x + 11, c.y - 34, 70);
    g.addColorStop(0, `rgba(255,200,110,${0.45 + 0.08 * Math.sin(t * 12)})`); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x + 11, c.y - 34, 70, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = c.lit ? '#ffd27d' : '#555'; ctx.fillRect(c.x + 6, c.y - 40, 10, 13);
}

// the weapon in action for a moment after you attack
function drawAttack() {
  const k = (t - me.attackAt) / 0.3;
  if (k < 0 || k > 1) return;
  const dir = Math.atan2(me.diry, me.dirx), x = me.x, y = me.y - 34;
  ctx.save(); ctx.lineCap = 'round';
  if (opts.char === 'ivy') {          // vine whip: a green lash cracking out
    ctx.strokeStyle = `rgba(90,170,70,${1 - k})`; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, y);
    const L = 140 * Math.min(1, k * 2.5);
    ctx.quadraticCurveTo(x + Math.cos(dir + 0.8) * L * 0.6, y + Math.sin(dir + 0.8) * L * 0.6, x + Math.cos(dir) * L, y + Math.sin(dir) * L);
    ctx.stroke();
    ctx.fillStyle = '#7bc45a';
    for (let i = 1; i < 5; i++) { const q = i / 5; ctx.beginPath(); ctx.ellipse(x + Math.cos(dir + 0.3) * L * q, y + Math.sin(dir + 0.3) * L * q, 7, 3, dir + i, 0, TAU); ctx.fill(); }
  } else if (opts.char === 'wren') {  // machete: a wide silver arc with a glint
    ctx.strokeStyle = `rgba(230,240,255,${1 - k})`; ctx.lineWidth = 10 * (1 - k) + 2;
    ctx.beginPath(); ctx.arc(x, y, 80, dir - 1.4 + k * 1.2, dir + 0.2 + k * 1.2); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.font = '700 22px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('✦', x + Math.cos(dir) * 80, y + Math.sin(dir) * 80);
  } else if (opts.char === 'elias') { // the fern: a swing with leaves flying
    ctx.strokeStyle = `rgba(160,120,80,${1 - k})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, 60, dir - 1 + k * 2, dir - 0.6 + k * 2); ctx.stroke();
    ctx.fillStyle = `rgba(110,190,90,${1 - k})`;
    for (let i = 0; i < 8; i++) { const a = dir + (i - 4) * 0.3, r = 40 + k * 80 + i * 4; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, 6, 3, a + k * 6, 0, TAU); ctx.fill(); }
  } else if (opts.char === 'briar') { // slingshot: a stone streaking out
    const L = 260 * Math.min(1, k * 2);
    ctx.strokeStyle = `rgba(240,225,190,${0.7 * (1 - k)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(dir) * L * 0.6, y + Math.sin(dir) * L * 0.6); ctx.lineTo(x + Math.cos(dir) * L, y + Math.sin(dir) * L); ctx.stroke();
    ctx.fillStyle = `rgba(190,180,160,${1 - k})`; ctx.beginPath(); ctx.arc(x + Math.cos(dir) * L, y + Math.sin(dir) * L, 6, 0, TAU); ctx.fill();
  } else {                            // camera flash: a white cone
    const g = ctx.createRadialGradient(x, y, 0, x, y, 240);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 240, dir - 0.8, dir + 0.8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawTree(tr) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tr.x + 10, tr.y + 8, tr.crown, tr.crown * 0.55, 0, 0, TAU); ctx.fill();
  const im = sprite(tr.palm ? (tr.hue < 0.5 ? 'palm1' : 'palm2') : tr.hue < 0.33 ? 'tree1' : tr.hue < 0.66 ? 'tree2' : 'tree3');
  if (ready(im)) {
    const c = tr.crown * (tr.palm ? 2.5 : 2.3), sway = Math.sin(t * 0.8 + tr.x * 0.01) * 0.03;
    ctx.save(); ctx.translate(tr.x, tr.y - tr.crown * 0.5); ctx.rotate(((tr.x * 0.37 + tr.y * 0.11) % 6.28) + sway);
    ctx.drawImage(im, -c / 2, -c / 2, c, c); ctx.restore();
    return;
  }
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
  const u = dpr, pad = 14 * u, lx = pad + G.safe.left * u, touch = matchMedia('(pointer: coarse)').matches;
  bar(lx, pad, 180 * u, 16 * u, me.health, me.health <= 34 ? '#e74c3c' : '#2ecc71', `❤ Health ${Math.round(me.health)}%`);
  bar(lx, pad + 24 * u, 180 * u, 16 * u, me.infection, me.infection >= 60 ? '#e74c3c' : '#c39a2b', `Fever ${Math.round(me.infection)}%`);
  bar(lx, pad + 48 * u, 180 * u, 10 * u, me.stamina, '#5ec8e5', '');
  ctx.fillStyle = '#ddd'; ctx.font = `600 ${11 * u}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(touch ? 'Stamina' : 'Stamina (Shift to sprint)', lx + 186 * u, pad + 53 * u);
  if (t < me.sprayUntil) ctx.fillText(`Bug spray ${Math.ceil(me.sprayUntil - t)}s`, lx + 186 * u, pad + 32 * u);
  // the weapon and its cooldown ring (bottom right on a computer; phones have the attack button)
  const c = G.CHARS[opts.char], ready = clamp(1 - (me.attackReady - t) / opts.mode.strikeCooldown, 0, 1);
  const wx = W - 60 * u, wy = H - 60 * u, wr = 34 * u;
  if (!matchMedia('(pointer: coarse)').matches) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fill();
    ctx.strokeStyle = ready >= 1 ? '#7bed9f' : '#ffd970'; ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.arc(wx, wy, wr, -Math.PI / 2, -Math.PI / 2 + ready * TAU); ctx.stroke();
    ctx.font = `${26 * u}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(c.icon, wx, wy + 2 * u);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * u}px system-ui`; ctx.fillText(`${c.weapon} · Space`, wx - 20 * u, wy - wr - 10 * u);
  }
  const ab = document.getElementById('jAttack');
  ab.textContent = c.icon; ab.style.setProperty('--ready', ready);
  // the torn map: a little picture of the island with a circle where the strip is
  if (me.hasMap) {
    const mw = 150 * u, mh = mw * MH / MW, mx = W - mw - pad - G.safe.right * u, my = pad + 36 * u;
    ctx.fillStyle = 'rgba(233,220,176,0.92)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#2b6b8a'; ctx.lineWidth = 3 * u; ctx.beginPath();
    world.riverPts.forEach((q, i) => i ? ctx.lineTo(mx + q.x / MW * mw, my + q.y / MH * mh) : ctx.moveTo(mx + q.x / MW * mw, my + q.y / MH * mh));
    ctx.stroke();
    ctx.strokeStyle = '#b22'; ctx.lineWidth = 2 * u; ctx.beginPath();
    ctx.arc(mx + (world.strip.cx + 180) / MW * mw, my + (world.strip.cy - 120) / MH * mh, 34 * u, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(mx + me.x / MW * mw, my + me.y / MH * mh, 3.5 * u, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4528'; ctx.font = `700 ${10 * u}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('TORN MAP', mx + mw / 2, my + mh + 10 * u);
  }
  const m = opts.mode, left = Math.max(0, m.jungleClock - t);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = m.color; ctx.font = `400 ${20 * u}px 'Bebas Neue', Impact, sans-serif`;
  ctx.fillText(`${m.name.toUpperCase()}  ·  ${left > 0 ? 'ZOMBIES SWARM THE TRAILS IN ' + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') : 'THE HORDE IS LOOSE'}`, W / 2, pad + 30 * u);
  if (deadline !== null) {
    const left = Math.max(0, deadline - t);
    ctx.fillStyle = '#ff6b6b'; ctx.font = `800 ${15 * u}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`Your rival is at the airstrip! The horde arrives in ${Math.ceil(left)}s`, W / 2, pad + 56 * u);
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
let looping = false, canvasLook = '';
// the rival glides between position updates (online ones arrive about 10 times a second), then walks like you do
let ghostShow = null;
function animateGhost(dt) {
  if (!ghost) { ghostShow = null; return; }
  if (!ghostShow || ghostShow.char !== ghost.char || Math.hypot(ghost.x - ghostShow.x, ghost.y - ghostShow.y) > 300) ghostShow = { x: ghost.x, y: ghost.y, char: ghost.char };
  // an online rival is carried on along their last heading for a moment, so they keep moving between updates
  const ahead = bot ? 0 : Math.min(0.14, (performance.now() - (ghost.at || 0)) / 1000), k = 1 - Math.exp(-dt * (bot ? 30 : 11));
  ghostShow.x += (ghost.x + (ghost.vx || 0) * ahead - ghostShow.x) * k; ghostShow.y += (ghost.y + (ghost.vy || 0) * ahead - ghostShow.y) * k;
  stride(ghostAnim, ghostShow.x, ghostShow.y, dt);
}
// Always run on real time, in small steps: a slow computer draws fewer frames, but nobody moves slower because of it.
function advance(seconds) {
  let left = Math.min(0.5, seconds);
  while (left > 1e-4 && running) { const d = Math.min(1 / 30, left); update(d); if (running) animateGhost(d); left -= d; }
}
function frame(now) {
  if (!running) { looping = false; return; }
  const elapsed = (now - last) / 1000 || 0; last = now;
  advance(elapsed);
  if (running) draw();
  requestAnimationFrame(frame);
}
setInterval(() => {   // keep going if animation frames are paused (background tab)
  if (!running) return;
  const now = performance.now();
  if (now - last > 200) { const elapsed = (now - last) / 1000; last = now; advance(elapsed); if (running) draw(); }
}, 120);

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', e => {
  if (!running) return;
  if (MOVE_KEYS.has(e.code)) { keys[e.code] = true; e.preventDefault(); e.stopImmediatePropagation(); }
  if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); board(); }
  if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (prompt && prompt.plane) board(); else attack(); }
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
document.getElementById('jAttack').addEventListener('pointerdown', e => { e.preventDefault(); attack(); });

// A short field briefing when the run starts: how to move, fight and survive. It fades on its own.
let briefTimer = 0;
function briefing(show) {
  let el = document.getElementById('jBrief');
  if (!show) { if (el) el.classList.add('hidden'); clearTimeout(briefTimer); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'jBrief';
    document.getElementById('jungle').appendChild(el);
    el.addEventListener('click', () => briefing(false));
  }
  const c = G.CHARS[opts.char] || {}, touch = matchMedia('(pointer: coarse)').matches;
  el.innerHTML = `<p class="role">Field briefing</p><h3>Get to the airstrip alive</h3><ul>
    <li><b>Move</b> ${touch ? 'with the thumb stick' : 'with the arrow keys or WASD'}. <b>Sprint</b> with ${touch ? 'the Sprint button' : 'Shift'} while your stamina lasts.</li>
    <li><b>${c.icon || ''} ${c.weapon || 'Attack'}:</b> ${touch ? 'tap the round button' : 'press Space'}. ${c.weaponLine || ''} Zombies take a few hits.</li>
    <li>When a zombie flashes a red <b>!</b> it's about to bite. Strike right then for a <b>perfect counter</b>.</li>
    <li>Grab <b>bug spray</b> and <b>med kits</b> on the trail. Mosquito swarms raise your fever.</li>
    <li>Follow the trails and signs, watch for <b>smoke</b>, and ${touch ? 'tap Climb in' : 'press Space'} at a plane.</li>
  </ul><button type="button" class="hero-btn">Got it</button>`;
  el.classList.remove('hidden');
  clearTimeout(briefTimer); briefTimer = setTimeout(() => briefing(false), 12000);
}

function restore(r) {
  Object.assign(me, r.me); t = r.t; taken = r.taken || {};
  (r.lit || []).forEach((lit, i) => { if (world.checkpoints[i]) world.checkpoints[i].lit = lit; });
  me.checkpoint = world.checkpoints[r.cp] || null;
  if (r.items) world.items = r.items;
  if (r.zombies) world.zombies = r.zombies;
  deadline = r.deadlineLeft === null || r.deadlineLeft === undefined ? null : t + r.deadlineLeft;
  smokeShown = !!r.smokeShown; windShown = !!r.windShown;
  if (r.bot && bot) { Object.assign(bot, r.bot); bot.cp = world.checkpoints[r.bot.cp] || null; }
  me.svx = me.svy = me.kx = me.ky = 0;
  say('Back in the race.', '#7bed9f', 2.5);
}

function showUI(on) {
  document.getElementById('jungle').classList.toggle('hidden', !on);
  canvas.style.filter = ''; canvasLook = '';
}

G.Jungle = {
  // opts: { seed, char, onBoard(plane), onPos(pos)?, onLate()? }
  start(o) {
    opts = o;
    world = generate(o.seed, o.mode);
    me = { x: world.start.x, y: world.start.y, face: 1, dirx: 1, diry: 0, health: 100, attackReady: 0, attackAt: -9, flashAt: -9, deadUntil: 0, respawnAt: 0, checkpoint: null,
      step: 0, moving: false, stamina: 100, infection: 0, kx: 0, ky: 0,
      stunUntil: 0, outUntil: 0, sprayUntil: 0, hit: -9, hasMap: false, foundStrip: false };
    ghost = null; ghostShow = null; taken = {}; floats = [];
    [meAnim, ghostAnim].forEach(a => Object.keys(a).forEach(k => delete a[k]));
    bot = o.bot ? { char: o.bot, x: world.start.x + 30, y: world.start.y + 10, i: 0, health: 100, deaths: 0, deadUntil: 0, face: 1, cp: null, boarded: false } : null; deadline = null; smokeShown = false; windShown = false; dust = []; keys = {}; t = 0;
    showUI(true);
    ensureSounds();
    if (o.resume) restore(o.resume);
    else { say('Find the hidden airstrip. Follow the trails, watch for signs.', '#ffd970', 4); briefing(true); }
    running = true; last = performance.now();
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  },
  stop() { running = false; stopSounds(); showUI(false); briefing(false); },
  setGhost(g) {
    const now = performance.now();
    if (ghost && now - ghost.at < 1000) { const d = Math.max(0.05, (now - ghost.at) / 1000); g.vx = clamp((g.x - ghost.x) / d, -480, 480); g.vy = clamp((g.y - ghost.y) / d, -480, 480); }
    g.at = now; ghost = g;
  },
  // everything needed to pick the run back up after a page reload
  snapshot() {
    if (!running || !me) return null;
    const { checkpoint, ...m } = me;
    return { me: m, cp: world.checkpoints.indexOf(checkpoint), lit: world.checkpoints.map(c => !!c.lit), t, taken, items: world.items, zombies: world.zombies,
      deadlineLeft: deadline === null ? null : deadline - t, smokeShown, windShown, bot: bot ? { ...bot, cp: bot.cp ? world.checkpoints.indexOf(bot.cp) : -1 } : null };
  },
  markTaken(id) { taken[id] = true; },
  rivalArrived(secondsLeft) { deadline = t + secondsLeft; },
  notice(text, color) { if (running) say(text, color || '#5ec8e5', 2.5); },
  elapsed() { return t; },
  botEta,
  botStats() { return bot ? { time: t, deaths: bot.deaths } : null; },
  stats() { return { time: t, deaths: (me && me.deaths) || 0, kills: (me && me.kills) || 0 }; },
  get running() { return running; },
  // for testing: where things are
  debug() { return { blocked, scramble, anim: meAnim, ghostAnim, world, me, strip: world.strip, stripKey: world.stripKey, planes: world.planes, N: world.N, items: world.items, route: world.routePts, zombies: world.zombies }; },
  generate,
};
})();
