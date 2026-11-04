/* The storm flight: the last stage. After takeoff, fly the plane you took off in (Cessna or Cherokee) from Kanoa to
   the finish gate over Safe Harbor Field, around a rotating storm. Top-down, north-up camera that follows the plane.
   Arrow keys / A D W S (or the touch buttons): bank left and right, throttle up and down.
   The storm, the islands and the gate come from the game's seed, so online players (and the bot) fly the same storm.
   Ported from the standalone Storm Run prototype; it reuses planes.js (G.Planes) and the intro's island (G.Scene). */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const canvas = document.getElementById('flightCanvas'), ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const WORLD = { w: 12000, h: 9000 };
const PLANE_SCALE = 0.3;                  // planes.js draws 40 px per meter; this makes the 172 about 100 world px long
const SPEED = [130, 245];                 // px/s at the throttle's low and high ends
const TURN = 1.05;                        // rad/s at full bank
const PX_PER_MILE = 200;                  // for the distance readout
const INTRO = 3.8;                        // seconds of the side-view climb-out before the map

let W = 0, H = 0, dpr = 1;
let state = null, keys = {}, running = false, lastT = 0, opts = null, rival = null;

// ---------- the world, from the seed ----------
function blob(R, cx, cy, r, bumps, seed) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU;
    let k = 1;
    for (let j = 1; j <= bumps; j++) k += Math.sin(a * (j + 1) + seed * j * 1.7) * 0.11 / j;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.8]);
  }
  return pts;
}
function makeCell(R, x, y, r) {
  const cell = { x, y, R: r, spin: R() * TAU, drift: (R() - 0.5) * 28, puffs: [], glow: 0 };
  const n = Math.round(260 * (r / 2000));
  for (let i = 0; i < n; i++) {
    const rr = Math.pow(R(), 0.65) * r * 1.1;
    cell.puffs.push({ r: rr, a: R() * TAU, size: (170 + R() * 300) * (r / 2000) * (1 - rr / r * 0.35), shade: R() });
  }
  return cell;
}
function newWorld(M, seed) {
  const R = rng(seed ^ 0x5eed);
  const cy = WORLD.h / 2, flip = R() < 0.5 ? 1 : -1;
  const start = { x: 1000, y: cy + (R() - 0.5) * 600 };
  const finish = { x: 11000, y: cy + (R() - 0.5) * 1000 };
  const cells = [makeCell(R, 5600, cy + flip * (100 + R() * 280), M.storm[0] + R() * (M.storm[1] - M.storm[0]))];
  if (M.extraCell) cells.push(makeCell(R, 8700, cy - flip * (500 + R() * 400), 1000 + R() * 250));   // a second cell forces an S-turn
  const islands = [
    { pts: blob(R, start.x - 120, start.y + 40, 520, 4, 1.3), volcano: true, strip: { x: start.x - 60, y: start.y + 20, a: -0.1 } },
    { pts: blob(R, finish.x + 300, finish.y + 120, 600, 3, 4.1), field: { x: finish.x + 300, y: finish.y + 110, a: 0 } },
  ];
  for (let i = 0; i < 12; i++) {
    const x = 2000 + R() * 8000, y = 500 + R() * 8000;
    if (cells.some(c => Math.hypot(x - c.x, y - c.y) < c.R * 0.5)) continue;
    islands.push({ pts: blob(R, x, y, 70 + R() * 170, 3, R() * 9) });
  }
  const clouds = [];
  for (let i = 0; i < 60; i++) {
    const x = R() * WORLD.w, y = R() * WORLD.h;
    if (cells.some(c => Math.hypot(x - c.x, y - c.y) < c.R * 1.3)) continue;
    clouds.push({ x, y, s: 60 + R() * 120, n: 3 + Math.floor(R() * 4), seed: R() * 9 });
  }
  return { cells, start, finish, islands, clouds, bolts: [], flocks: [], feathers: [], streaks: [] };
}

// ---------- the bot's flight, planned around the storm with mode-scaled skill ----------
// Returns the path it flies, how long it takes, and whether it makes it (and where it fails if not).
function botPlan(seed, M, skill) {
  const w = newWorld(M, seed), pts = [{ x: w.start.x + 120, y: w.start.y }];
  const line = x => lerp(w.start.y, w.finish.y, (x - w.start.x) / (w.finish.x - w.start.x));
  let hull = 100, clipped = false;
  for (const c of [...w.cells].sort((a, b) => a.x - b.x)) {
    const side = c.y > line(c.x) ? -1 : 1;                      // go around the far side of the cell
    const clip = Math.random() < skill.mistake * 1.6;          // sometimes it cuts the edge too fine
    const k = clip ? 1.0 : 1.3 + Math.random() * 0.15;
    if (clip) { hull -= M.stormDamage * 9 + M.strikeDamage * (Math.random() < 0.5 ? 1 : 0); clipped = true; }
    pts.push({ x: c.x - c.R * 0.6, y: c.y + side * c.R * k * 0.8 }, { x: c.x + c.R * 0.6, y: c.y + side * c.R * k * 0.8 });
  }
  pts.push({ x: w.finish.x, y: w.finish.y });
  for (let i = 0; i < M.flocks; i++) if (Math.random() < skill.mistake * 0.35) hull -= M.birdDamage;
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const speed = lerp(SPEED[0], SPEED[1], 0.45 + skill.speed * 0.4);
  let time = len / speed * (1.05 + (1 - skill.speed) * 0.2);
  if (Math.random() < skill.mistake * 1.2) time += 8 + Math.random() * 8;     // missed the gate and came around again
  const fuelUse = time * (0.55 + 0.75 * (0.45 + skill.speed * 0.4));
  let win = true, failK = 1, reason = '';
  if (hull <= 0) { win = false; failK = 0.55; reason = 'The storm tore it apart.'; }
  else if (fuelUse > M.fuel) { win = false; failK = M.fuel / fuelUse; reason = 'It ran out of fuel short of Safe Harbor.'; }
  return { pts, len, time: win ? time : time * failK + 9, win, failK, reason, hull: Math.max(0, hull), fuel: Math.max(0, (M.fuel - fuelUse) / M.fuel * 100), clipped };
}
function along(pts, len, k) {
  let d = k * len;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l) return { x: lerp(a.x, b.x, d / l), y: lerp(a.y, b.y, d / l), h: Math.atan2(b.y - a.y, b.x - a.x) };
    d -= l;
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  return { x: b.x, y: b.y, h: Math.atan2(b.y - a.y, b.x - a.x) };
}

function reset(o) {
  const M = o.cfg, world = newWorld(M, o.seed);
  state = {
    M, world, t: 0,
    plane: { kind: o.plane.kind, reg: o.plane.reg, x: world.start.x + 120, y: world.start.y, rot: -0.05, paint: o.plane.paint || '#efece3', stripe: o.plane.stripe || '#b23a2c', flyable: true, propAngle: 0, inFlight: true },
    heading: -0.05, bank: 0, thr: 0.75, speed: 190,
    hull: 100, fuel: M.fuel, fuelMax: M.fuel, shake: 0, flash: 0, rain: 0,
    msg: '', msgT: 0, done: false, gliding: 0, endT: 0, saidField: false,
    zone: 'clear', cam: { x: world.start.x + 380, y: world.start.y },
    intro: INTRO, lastWhoa: -99, lastPos: 0,
    gust: null, nextGust: rand(M.gust.every[0], M.gust.every[1]) * 0.6, nextFlock: 3,
  };
  const b = $('fBadge'); b.textContent = o.modeName; b.style.borderColor = o.modeColor; b.style.color = o.modeColor;
  $('fReg').textContent = o.plane.reg;
  $('fMsg').classList.remove('on');
}

// ---------- input ----------
const map = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyS: 'd' };
addEventListener('keydown', e => { if (running && map[e.code]) { keys[map[e.code]] = true; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
addEventListener('keyup', e => { if (map[e.code]) keys[map[e.code]] = false; }, true);
addEventListener('blur', () => { keys = {}; });
for (const [id, k] of [['fL', 'l'], ['fR', 'r'], ['fU', 'u'], ['fD', 'd']]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); keys[k] = true; try { b.setPointerCapture(e.pointerId); } catch (err) {} });
  for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
}

// ---------- sound (through the game's audio, so the mute button works) ----------
let audio = null;
function startAudio() {
  stopAudio();
  const S = G.Sfx; if (!S || !S.ctx) return;
  const A = S.ctx, master = A.createGain(); master.gain.value = 0.9; master.connect(S.out);
  const noise = () => { const s = A.createBufferSource(); s.buffer = S.noise; s.loop = true; return s; };
  const nodes = [];
  const loop = (type, freq, q) => {
    const s = noise(), f = A.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = A.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(master); s.start(); nodes.push(s); return { g, f };
  };
  const eng = A.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 70;
  const engF = A.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 380;
  const engG = A.createGain(); engG.gain.value = 0.12;
  eng.connect(engF).connect(engG).connect(master); eng.start(); nodes.push(eng);
  const wind = loop('bandpass', 600, 0.6), rain = loop('highpass', 2500), pour = loop('bandpass', 900, 0.4), bed = loop('lowpass', 70), howl = loop('bandpass', 420, 9);
  const comp = A.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 8; comp.knee.value = 6; comp.connect(master);
  audio = {
    A, master, nodes, eng, engG, wind, rain, pour, bed, howl,
    thunder(delay, power) {
      const t0 = A.currentTime + delay;
      if (delay < 0.5) {
        for (const [type, freq, len, amp] of [['highpass', 1800, 0.25, 1.8], ['bandpass', 500, 0.5, 1.4]]) {
          const c = noise(), cf = A.createBiquadFilter(); cf.type = type; cf.frequency.value = freq;
          const cg = A.createGain();
          cg.gain.setValueAtTime(0, t0); cg.gain.linearRampToValueAtTime(amp * power, t0 + 0.004); cg.gain.exponentialRampToValueAtTime(0.001, t0 + len);
          c.connect(cf).connect(cg).connect(comp); c.start(t0); c.stop(t0 + len + 0.05);
        }
      }
      const o = A.createOscillator(), og = A.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(58, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 2.2);
      og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(1.3 * power, t0 + 0.06); og.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);
      o.connect(og).connect(comp); o.start(t0); o.stop(t0 + 2.7);
      const rolls = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < rolls; i++) {
        const s = noise(), f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 60 + Math.random() * 90;
        const g = A.createGain(), t = t0 + 0.05 + i * rand(0.3, 0.8), peak = (2.2 - i * 0.25) * power, len = rand(2, 4.5);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(0.2, peak), t + rand(0.1, 0.35)); g.gain.exponentialRampToValueAtTime(0.001, t + len);
        s.connect(f).connect(g).connect(comp); s.start(t); s.stop(t + len + 0.1);
      }
    },
    thump() {
      const t0 = A.currentTime, s = noise(), f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const g = A.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      s.connect(f).connect(g).connect(comp); s.start(t0); s.stop(t0 + 0.35);
    },
  };
}
function stopAudio() {
  if (!audio) return;
  const a = audio; audio = null;
  a.master.gain.setTargetAtTime(0, a.A.currentTime, 0.3);
  setTimeout(() => { a.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { a.master.disconnect(); } catch (e) {} }, 1500);
}

// ---------- messages ----------
function say(text, secs) { state.msg = text; state.msgT = secs; const m = $('fMsg'); m.textContent = text; m.classList.add('on'); }
function whoa() {   // the character reacts to a lightning or bird strike
  if (state.t - state.lastWhoa < 6) return;
  state.lastWhoa = state.t;
  G.Sfx.voice(opts.voice, 'whoa');
}

function stormAt(x, y) {
  const best = { near: 0, inside: 0, core: 0, wx: 0, wy: 0 };
  for (const c of state.world.cells) {
    const dx = x - c.x, dy = y - c.y, r = Math.hypot(dx, dy) || 1;
    const near = 1 - smooth(c.R * 0.95, c.R * 1.65, r);
    const inside = 1 - smooth(c.R * 0.5, c.R * 1.0, r);
    const core = 1 - smooth(c.R * 0.28, c.R * 0.6, r);
    const w = state.M.wind * near * (0.4 + 0.6 * inside) * (c.R / 2000);
    best.wx += (dy / r) * w; best.wy += (-dx / r) * w;
    best.near = Math.max(best.near, near); best.inside = Math.max(best.inside, inside); best.core = Math.max(best.core, core);
  }
  return best;
}
function gateY(t) { const g = state.M.gate, f = state.world.finish; return f.y + (g.sway ? Math.sin(t * TAU / g.period) * g.sway : 0); }

// ---------- update ----------
function update(dt) {
  const s = state, p = s.plane, w = s.world, M = s.M;
  s.t += dt;
  for (const c of w.cells) { c.spin += dt * 0.05; c.y += c.drift * dt; c.glow = Math.max(0, c.glow - dt * 4.5); }

  if (!s.done && s.fuel > 0) {
    if (keys.u) s.thr = clamp(s.thr + dt * 0.5, 0.4, 1);
    if (keys.d) s.thr = clamp(s.thr - dt * 0.5, 0.4, 1);
  }
  const want = (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
  s.bank = lerp(s.bank, s.done ? 0 : want, clamp(dt * 3.2, 0, 1));
  const targetSpeed = s.fuel > 0 ? lerp(SPEED[0], SPEED[1], (s.thr - 0.4) / 0.6) : SPEED[0] * 0.8;
  s.speed = lerp(s.speed, targetSpeed, clamp(dt * 0.8, 0, 1));
  s.heading += s.bank * TURN * dt;

  const st = stormAt(p.x, p.y);
  s.heading += (Math.random() - 0.5) * (M.turbulence * st.inside * 0.5 + 0.15 * st.near) * dt * 6;
  s.shake = Math.max(s.shake * 0.9, 11 * st.inside + 3 * st.near);
  s.rain = lerp(s.rain, st.inside, clamp(dt * 2, 0, 1));
  const zone = st.core > 0.5 ? 'core' : st.inside > 0.4 ? 'storm' : st.near > 0.3 ? 'edge' : 'clear';
  if (zone !== s.zone && !s.done) {
    if (zone === 'edge' && s.zone === 'clear') say('Turbulence ahead. The wind is pulling you in.', 2.5);
    if (zone === 'storm') say('You are in the storm! Bank out of it!', 2.5);
    if (zone === 'core') say('THE CORE. LIGHTNING EVERYWHERE!', 2);
    s.zone = zone;
  }
  if (!s.done) {
    s.hull -= (st.inside * M.stormDamage + st.core * M.stormDamage * 1.4) * dt;
    if (st.core > 0.3 && Math.random() < dt * M.lightning * st.core) strike(true);
  }
  if (Math.random() < dt * (0.6 + 1.6 * st.near)) strike(false);

  if (!s.done && (s.nextGust -= dt) <= 0) {
    const side = Math.random() < 0.5 ? 1 : -1, a = s.heading + side * (Math.PI / 2 + rand(-0.5, 0.5));
    s.gust = { a, t: 0, len: rand(1.8, 2.8), power: M.gust.power * rand(0.8, 1.2) };
    s.nextGust = rand(M.gust.every[0], M.gust.every[1]);
    const from = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'][Math.round(((a + Math.PI) % TAU + TAU) % TAU / (TAU / 8)) % 8];
    say(`GUST from the ${from}!`, 1.6);
    if (audio) { const now = audio.A.currentTime; audio.howl.g.gain.setTargetAtTime(0.35, now, 0.1); audio.howl.g.gain.setTargetAtTime(0.1, now + 1.5, 0.6); }
  }
  let gx = 0, gy = 0;
  if (s.gust) {
    const g = s.gust; g.t += dt;
    const k = Math.sin(clamp(g.t / g.len, 0, 1) * Math.PI);
    gx = Math.cos(g.a) * g.power * k; gy = Math.sin(g.a) * g.power * k;
    s.shake = Math.max(s.shake, 6 * k);
    if (Math.random() < dt * 60 * k) w.streaks.push({ x: p.x + rand(-700, 700) - Math.cos(g.a) * 500, y: p.y + rand(-500, 500) - Math.sin(g.a) * 500, a: g.a, life: 0.6 });
    if (g.t > g.len) s.gust = null;
  }
  if (M.gate.crosswind) { const dg = Math.hypot(p.x - w.finish.x, p.y - w.finish.y); gy += M.gate.crosswind * (1 - smooth(600, 1800, dg)); }

  if ((s.nextFlock -= dt) <= 0 && w.flocks.length < M.flocks && !s.done) {
    s.nextFlock = rand(2, 5);
    const ahead = rand(900, 1600), off = rand(-700, 700);
    const cx = p.x + Math.cos(s.heading) * ahead - Math.sin(s.heading) * off, cy = p.y + Math.sin(s.heading) * ahead + Math.cos(s.heading) * off;
    const dir = s.heading + (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 1.9), n = 5 + Math.floor(Math.random() * 6);
    const birds = [];
    for (let i = 0; i < n; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; birds.push({ bx: -row * 34, by: side * row * 30, ph: Math.random() * TAU }); }
    w.flocks.push({ x: cx - Math.cos(dir) * 600, y: cy - Math.sin(dir) * 600, dir, v: rand(70, 120), birds, life: 30 });
  }
  for (const f of w.flocks) {
    f.x += Math.cos(f.dir) * f.v * dt; f.y += Math.sin(f.dir) * f.v * dt; f.life -= dt;
    if (s.done || f.hit) continue;
    for (const b of f.birds) {
      const c = Math.cos(f.dir), sn = Math.sin(f.dir);
      const bx = f.x + c * b.bx - sn * b.by, by = f.y + sn * b.bx + c * b.by;
      if (Math.hypot(bx - p.x, by - p.y) < 46) {
        f.hit = true; s.hull -= M.birdDamage; s.shake = 18; say('BIRD STRIKE!', 1.6); whoa();
        if (audio) audio.thump();
        for (let i = 0; i < 18; i++) w.feathers.push({ x: bx, y: by, vx: rand(-120, 120), vy: rand(-120, 120), life: rand(0.8, 1.6), a: Math.random() * TAU });
        break;
      }
    }
  }
  w.flocks = w.flocks.filter(f => f.life > 0 && !(f.hit && (f.life = Math.min(f.life, 1.2)) < 0.05));
  for (const fe of w.feathers) { fe.x += fe.vx * dt; fe.y += fe.vy * dt; fe.vx *= 0.96; fe.vy *= 0.96; fe.a += dt * 4; fe.life -= dt; }
  w.feathers = w.feathers.filter(fe => fe.life > 0);
  for (const sk of w.streaks) sk.life -= dt;
  w.streaks = w.streaks.filter(sk => sk.life > 0);

  if (!s.done) s.fuel = Math.max(0, s.fuel - dt * (0.55 + 0.75 * s.thr));
  if (s.fuel <= 0 && !s.gliding && !s.done) { s.gliding = 0.001; say('Out of fuel. The engine is quiet. Glide!', 3); }
  if (s.gliding) { s.gliding += dt; if (s.gliding > 9 && !s.done) end(false, `Out of fuel. ${p.reg} glided down to the water short of Safe Harbor.`); }

  const vx = Math.cos(s.heading) * s.speed + st.wx + gx, vy = Math.sin(s.heading) * s.speed + st.wy + gy;
  const ox = p.x;
  p.x = clamp(p.x + vx * dt, 40, WORLD.w - 40); p.y = clamp(p.y + vy * dt, 40, WORLD.h - 40);
  p.rot = s.heading;
  p.propAngle = (p.propAngle || 0) + dt * (s.fuel > 0 ? 70 : 6);

  const f = w.finish, gyNow = gateY(s.t);
  if (!s.done && ox < f.x && p.x >= f.x) {
    if (Math.abs(p.y - gyNow) < M.gate.half) end(true);
    else say('Missed the gate! Turn around and line it up.', 2.2);
  }
  if (!s.done && s.hull <= 0) end(false, `The storm tore ${p.reg} apart.`);

  const lx = p.x + Math.cos(s.heading) * 380, ly = p.y + Math.sin(s.heading) * 380;
  s.cam.x = lerp(s.cam.x, lx, clamp(dt * 2.5, 0, 1)); s.cam.y = lerp(s.cam.y, ly, clamp(dt * 2.5, 0, 1));

  w.bolts = w.bolts.filter(b => (b.life -= dt) > 0);
  s.flash = Math.max(0, s.flash - dt * 2.5);
  if (s.msgT > 0 && (s.msgT -= dt) <= 0) $('fMsg').classList.remove('on');
  if (s.t > 4 && !s.saidField && Math.hypot(p.x - f.x, p.y - gyNow) < 1800) { s.saidField = true; say(M.gate.note, 3.5); }

  if (audio) {
    const now = audio.A.currentTime;
    audio.eng.frequency.setTargetAtTime(s.fuel > 0 ? 52 + 60 * s.thr : 20, now, 0.2);
    audio.engG.gain.setTargetAtTime(s.fuel > 0 ? 0.12 : 0.0, now, 0.4);
    audio.wind.g.gain.setTargetAtTime(0.04 + 0.22 * st.near, now, 0.3);
    audio.rain.g.gain.setTargetAtTime(0.4 * s.rain, now, 0.3);
    audio.pour.g.gain.setTargetAtTime(0.55 * s.rain, now, 0.4);
    audio.bed.g.gain.setTargetAtTime(0.35 * st.near + 0.6 * st.inside, now, 0.5);
    if (!s.gust) audio.howl.g.gain.setTargetAtTime(0.08 * st.near + 0.14 * st.inside, now, 0.4);
    audio.howl.f.frequency.setTargetAtTime(340 + 220 * Math.sin(s.t * 0.7) + 160 * Math.sin(s.t * 1.9), now, 0.3);
  }

  // share where you are with an online rival
  if (opts.onPos && s.t - s.lastPos > 0.1) { s.lastPos = s.t; opts.onPos({ x: Math.round(p.x), y: Math.round(p.y), h: +s.heading.toFixed(2) }); }

  $('fDist').textContent = Math.max(0, Math.hypot(f.x - p.x, gyNow - p.y) / PX_PER_MILE).toFixed(1);
  const secs = Math.floor(s.done ? s.endT : s.t); $('fTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  setBar('fHull', s.hull); setBar('fFuel', s.fuel / s.fuelMax * 100);
  const chip = $('fRival');
  chip.classList.toggle('hidden', !rival);
  if (rival) { const r = rivalPos(); chip.textContent = `${rival.label || 'Rival'}: ` + (r ? `${(Math.hypot(r.x - p.x, r.y - p.y) / PX_PER_MILE).toFixed(1)} mi away` : rival.status || 'not in the air yet'); }
  $('fThr').textContent = Math.round(s.thr * 100) + '%'; $('fKts').textContent = Math.round(s.speed * 0.55);
}

function setBar(id, v) {
  const el = $(id); el.style.width = clamp(v, 0, 100) + '%';
  el.style.background = v > 50 ? 'var(--fgreen)' : v > 25 ? 'var(--famber)' : 'var(--fred)';
}

function bolt(x0, y0, x1, y1, depth) {
  const pts = [[x0, y0]], n = 10;
  for (let i = 1; i <= n; i++) pts.push([lerp(x0, x1, i / n) + rand(-70, 70), lerp(y0, y1, i / n) + rand(-20, 20)]);
  const out = [pts];
  if (depth < 2) for (let k = 0; k < 2; k++) {
    const at = pts[2 + Math.floor(Math.random() * 6)];
    out.push(...bolt(at[0], at[1], at[0] + rand(-260, 260), at[1] + rand(120, 320), depth + 1).map(b => (b.branch = true, b)));
  }
  return out;
}

function strike(dangerous) {
  const s = state, cells = s.world.cells;
  let x, y, cell;
  if (dangerous) { x = s.plane.x + rand(-160, 160); y = s.plane.y + rand(-160, 160); cell = cells[0]; }
  else { cell = cells[Math.floor(Math.random() * cells.length)]; const a = Math.random() * TAU, rr = Math.random() * cell.R * 0.85; x = cell.x + Math.cos(a) * rr; y = cell.y + Math.sin(a) * rr; }
  cell.glow = 1;
  s.world.bolts.push({ paths: bolt(x + rand(-300, 300), y - 600, x, y, 0), life: 0.45, x, y });
  const d = Math.hypot(x - s.plane.x, y - s.plane.y);
  s.flash = Math.max(s.flash, dangerous ? 1 : clamp(1 - d / 2800, 0.15, 0.7));
  if (audio) audio.thunder(dangerous ? 0.01 : clamp(d / 1100, 0.05, 2.5), dangerous ? 1.4 : clamp(1.1 - d / 3500, 0.35, 1));
  if (dangerous && !s.done) { s.hull -= s.M.strikeDamage; s.shake = 26; say('LIGHTNING STRIKE! Get out of the core!', 1.6); whoa(); }
}

function end(win, why) {
  const s = state; s.done = true; s.endT = s.t; s.won = win;
  if (win) say('THROUGH THE GATE!', 2); else say(why, 3);
  const result = { win, time: s.t, hull: Math.max(0, Math.round(s.hull)), fuel: Math.round(s.fuel / s.fuelMax * 100), reason: why || '' };
  setTimeout(() => { if (opts && opts.onDone) opts.onDone(result); }, win ? 1100 : 2600);
}

// ---------- drawing ----------
let waves = null;
function wavePattern() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, l = 4 + Math.random() * 10;
    g.strokeStyle = `rgba(255,${200 + Math.random() * 40},${160 + Math.random() * 60},${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 1.5, x + l, y); g.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}
function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.closePath(); }

function drawIsland(is) {
  ctx.save();
  path(is.pts); ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(120,200,190,0.18)'; ctx.stroke();
  path(is.pts); ctx.fillStyle = '#7a5a46'; ctx.fill();
  const cx = is.pts.reduce((a, q) => a + q[0], 0) / is.pts.length, cy = is.pts.reduce((a, q) => a + q[1], 0) / is.pts.length;
  ctx.save();
  ctx.beginPath(); is.pts.forEach((q, i) => { const x = cx + (q[0] - cx) * 0.86, y = cy + (q[1] - cy) * 0.86; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
  ctx.fillStyle = '#11201a'; ctx.fill();
  ctx.clip();
  for (let i = 0; i < 70; i++) { const a = i * 2.39, rr = (i % 13) / 13; ctx.fillStyle = i % 3 ? 'rgba(8,16,12,0.55)' : 'rgba(44,29,47,0.45)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr * 600, cy + Math.sin(a) * rr * 480, 12 + (i % 5) * 6, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (is.volcano) {
    const g = ctx.createRadialGradient(cx - 160, cy - 120, 10, cx - 160, cy - 120, 170);
    g.addColorStop(0, '#2a1d17'); g.addColorStop(0.25, '#5b4636'); g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx - 160, cy - 120, 170, 0, TAU); ctx.fill();
  }
  if (!is.palms) { is.palms = []; for (let i = 0; i < is.pts.length; i += 3) { const q = is.pts[i], k = 0.72 + ((i * 37) % 18) / 100; is.palms.push([cx + (q[0] - cx) * k, cy + (q[1] - cy) * k, 16 + (i * 13) % 18, (i * 2.1) % TAU]); } }
  for (const [x, y, r, ph] of is.palms) {
    const sway = Math.sin(state.t * 0.9 + ph) * 0.12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ph + sway);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(-r * 0.5, r * 0.7, r * 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#0a140f'; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
      ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex * 0.6 - ey * 0.15, ey * 0.6 + ex * 0.15, ex, ey); ctx.stroke();
    }
    ctx.fillStyle = '#1c2a20'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const strip = is.strip || is.field;
  if (strip) {
    ctx.save(); ctx.translate(strip.x, strip.y); ctx.rotate(strip.a);
    ctx.fillStyle = is.field ? '#5d5d5d' : '#a68a5c'; ctx.fillRect(-170, -16, 340, 32);
    if (is.field) { ctx.fillStyle = '#e8e8e8'; for (let x = -150; x < 150; x += 30) ctx.fillRect(x, -1.5, 16, 3); }
    ctx.restore();
  }
  ctx.restore();
}
function drawCellShadow(c) {
  const g = ctx.createRadialGradient(c.x - 140, c.y + 180, c.R * 0.2, c.x - 140, c.y + 180, c.R * 1.4);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x - 140, c.y + 180, c.R * 1.4, 0, TAU); ctx.fill();
}
function drawCell(c) {
  ctx.save();
  const skirt = ctx.createRadialGradient(c.x, c.y, c.R * 0.7, c.x, c.y, c.R * 1.45);
  skirt.addColorStop(0, 'rgba(26,16,30,0.6)'); skirt.addColorStop(1, 'rgba(26,16,30,0)');
  ctx.fillStyle = skirt; ctx.beginPath(); ctx.arc(c.x, c.y, c.R * 1.45, 0, TAU); ctx.fill();
  const lit = c.glow;
  for (const pf of c.puffs) {
    const a = pf.a + c.spin * (1.6 - pf.r / c.R);
    const x = c.x + Math.cos(a) * pf.r, y = c.y + Math.sin(a) * pf.r * 0.92;
    const edge = pf.r / c.R;
    const base = 8 + pf.shade * 16 + edge * 26 + lit * 55 * (1 - edge * 0.7);
    const g = ctx.createRadialGradient(x - pf.size * 0.2, y - pf.size * 0.25, pf.size * 0.1, x, y, pf.size);
    g.addColorStop(0, `rgba(${base + 36},${base + 22},${base + 44 + lit * 40},0.72)`);
    g.addColorStop(0.6, `rgba(${base + 6},${base},${base + 14},0.6)`);
    g.addColorStop(1, `rgba(${base},${base + 4},${base + 18},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, pf.size, 0, TAU); ctx.fill();
  }
  const core = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.R * 0.55);
  core.addColorStop(0, `rgba(120,60,140,${0.22 + 0.25 * lit})`); core.addColorStop(1, 'rgba(120,60,140,0)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(c.x, c.y, c.R * 0.55, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(140,160,185,0.1)'; ctx.lineWidth = 80 * (c.R / 2000);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 44; i++) { const a = c.spin * 1.4 + k * 1.57 + i * 0.12, rr = c.R * (0.2 + i / 44 * 0.85); const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
function drawCloud(c, shadow) {
  ctx.save();
  for (let i = 0; i < c.n; i++) {
    const x = c.x + Math.cos(c.seed + i * 1.9) * c.s * 0.6 + (shadow ? -60 : 0), y = c.y + Math.sin(c.seed + i * 2.3) * c.s * 0.35 + (shadow ? 90 : 0), r = c.s * (0.55 + (i % 3) * 0.2);
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); continue; }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,214,190,0.8)'); g.addColorStop(0.7, 'rgba(235,175,165,0.5)'); g.addColorStop(1, 'rgba(160,110,130,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawGate(t) {
  const M = state.M, f = state.world.finish, half = M.gate.half, gy = gateY(t), pulse = 0.6 + 0.4 * Math.sin(t * 4);
  const col = M.gate.sway ? '255,110,90' : M.gate.crosswind ? '255,200,110' : '140,230,255';
  ctx.save();
  if (M.gate.sway) {
    ctx.strokeStyle = 'rgba(255,110,90,0.18)'; ctx.lineWidth = 4; ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.moveTo(f.x, f.y - M.gate.sway - half); ctx.lineTo(f.x, f.y + M.gate.sway + half); ctx.stroke(); ctx.setLineDash([]);
  }
  if (M.gate.crosswind) {
    ctx.fillStyle = 'rgba(255,200,110,0.55)';
    for (let i = 0; i < 6; i++) {
      const ax = f.x - 900 + i * 160, ay = f.y - 420 + ((t * 120 + i * 90) % 840);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-16, -14); ctx.lineTo(-8, 0); ctx.lineTo(-16, 14); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  ctx.strokeStyle = `rgba(${col},${0.4 + 0.4 * pulse})`; ctx.lineWidth = 12; ctx.setLineDash([26, 18]); ctx.lineDashOffset = -t * 60;
  ctx.beginPath(); ctx.moveTo(f.x, gy - half); ctx.lineTo(f.x, gy + half); ctx.stroke(); ctx.setLineDash([]);
  for (const sd of [-1, 1]) {
    const g = ctx.createRadialGradient(f.x, gy + sd * half, 2, f.x, gy + sd * half, 70);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.3, `rgba(${col},${0.75 * pulse})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, gy + sd * half, 70, 0, TAU); ctx.fill();
  }
  ctx.font = '400 60px "Bebas Neue", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${col},${0.65 + 0.35 * pulse})`;
  ctx.fillText(M.gate.label, f.x, gy - half - 60);
  ctx.restore();
}
function drawFlocks(t) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const f of state.world.flocks) {
    if (f.hit) continue;
    const c = Math.cos(f.dir), s = Math.sin(f.dir);
    for (const b of f.birds) {
      const x = f.x + c * b.bx - s * b.by, y = f.y + s * b.bx + c * b.by, flap = Math.sin(t * 9 + b.ph) * 7;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x - 50, y + 75, 20, 7, f.dir + Math.PI / 2, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.dir + Math.PI / 2); ctx.scale(2.2, 2.2);
      const wing = () => { ctx.beginPath(); ctx.moveTo(-16, flap); ctx.quadraticCurveTo(-7, -9, 0, 0); ctx.quadraticCurveTo(7, -9, 16, flap); ctx.stroke(); };
      ctx.strokeStyle = 'rgba(20,24,28,0.85)'; ctx.lineWidth = 5.5; wing();
      ctx.strokeStyle = 'rgba(240,238,232,0.95)'; ctx.lineWidth = 3; wing();
      ctx.fillStyle = '#f2f0ea'; ctx.beginPath(); ctx.ellipse(0, 1, 2.2, 4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = 'rgba(240,236,228,0.9)';
  for (const fe of state.world.feathers) { ctx.save(); ctx.translate(fe.x, fe.y); ctx.rotate(fe.a); ctx.globalAlpha = clamp(fe.life, 0, 1); ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.restore();
}
function drawArrow(cam, zoom) {
  const f = state.world.finish, gy = gateY(state.t);
  const sx = (f.x - cam.x) * zoom + W / 2, sy = (gy - cam.y) * zoom + H / 2, m = 46 * dpr;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const ex = clamp(W / 2 + Math.cos(a) * W, m, W - m), ey = clamp(H / 2 + Math.sin(a) * H, m, H - m);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
  ctx.fillStyle = '#f4b860'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(20 * dpr, 0); ctx.lineTo(-12 * dpr, -13 * dpr); ctx.lineTo(-5 * dpr, 0); ctx.lineTo(-12 * dpr, 13 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawRadar() {
  const s = state, w = s.world, size = Math.min(150, W / dpr * 0.28) * dpr, pad = 14 * dpr;
  const cx = W - pad - size / 2, cy = H - pad - size / 2 - (matchMedia('(pointer: coarse)').matches ? 80 * dpr : 0), k = size / 2 / 6000;
  ctx.save();
  ctx.fillStyle = 'rgba(6,14,12,0.78)'; ctx.strokeStyle = 'rgba(123,237,159,0.5)'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.clip();
  const P = (x, y) => [cx + (x - s.plane.x) * k, cy + (y - s.plane.y) * k];
  for (const c of w.cells) {
    const [sx, sy] = P(c.x, c.y);
    for (const [fr, col] of [[1.05, 'rgba(60,200,90,0.45)'], [0.78, 'rgba(240,210,60,0.6)'], [0.5, 'rgba(240,70,50,0.8)'], [0.25, 'rgba(200,60,200,0.85)']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, c.R * fr * k, 0, TAU); ctx.fill(); }
  }
  const [fx, fy] = P(w.finish.x, gateY(s.t)); ctx.fillStyle = '#f4b860'; ctx.fillRect(fx - 2 * dpr, fy - 7 * dpr, 4 * dpr, 14 * dpr);
  const r = rivalPos();   // your rival's blip
  if (r) { const [rx, ry] = P(r.x, r.y); ctx.fillStyle = '#5ec8e5'; ctx.beginPath(); ctx.arc(rx, ry, 4 * dpr, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(123,237,159,0.25)'; for (const rr of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, size / 2 * rr, 0, TAU); ctx.stroke(); }
  ctx.translate(cx, cy); ctx.rotate(s.heading); ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7 * dpr, 0); ctx.lineTo(-5 * dpr, -4 * dpr); ctx.lineTo(-5 * dpr, 4 * dpr); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.fillStyle = 'rgba(200,230,210,0.8)'; ctx.font = `${11 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('WEATHER RADAR', cx, cy - size / 2 - 5 * dpr); ctx.restore();
}

// where your rival is right now: an online player's last reported position, or along the bot's planned path
function rivalPos() {
  if (!rival) return null;
  if (rival.pos) return performance.now() - (rival.posAt || 0) < 3000 ? rival.pos : null;
  if (rival.plan && rival.startedAt) {
    const k = (performance.now() - rival.startedAt) / 1000 / rival.plan.time;
    if (k < 0) return null;
    const lim = rival.plan.win ? 1 : rival.plan.failK;
    if (k > lim + (rival.plan.win ? 0.02 : 0.3)) return null;
    return along(rival.plan.pts, rival.plan.len, Math.min(k * (rival.plan.win ? 1 : 1), lim));
  }
  return null;
}
function drawRival() {
  const r = rivalPos(); if (!r || !rival.plane) return;
  const pl = { ...rival.plane, x: 0, y: 0, rot: r.h || 0, flyable: true, inFlight: true, propAngle: performance.now() / 20 };
  ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(r.x, r.y); ctx.scale(PLANE_SCALE, PLANE_SCALE);
  G.Planes.draw(ctx, pl, state.t);
  ctx.restore();
  ctx.save(); ctx.fillStyle = '#5ec8e5'; ctx.font = '700 40px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(rival.label || 'RIVAL', r.x, r.y - 70); ctx.restore();
}

function drawRivalArrow(cam, zoom) {
  const r = rivalPos(); if (!r) return;
  const sx = (r.x - cam.x) * zoom + W / 2, sy = (r.y - cam.y) * zoom + H / 2, m = 52 * dpr;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return;   // on screen: you can see the plane itself
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const ex = clamp(W / 2 + Math.cos(a) * W, m, W - m), ey = clamp(H / 2 + Math.sin(a) * H, m, H - m);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
  ctx.fillStyle = '#5ec8e5'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(20 * dpr, 0); ctx.lineTo(-12 * dpr, -13 * dpr); ctx.lineTo(-5 * dpr, 0); ctx.lineTo(-12 * dpr, 13 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  const miles = (Math.hypot(r.x - state.plane.x, r.y - state.plane.y) / PX_PER_MILE).toFixed(1);
  ctx.save(); ctx.font = `700 ${12 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#5ec8e5';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * dpr;
  ctx.fillText(`${rival.label || 'RIVAL'} ${miles} mi`, clamp(ex - Math.cos(a) * 34 * dpr, 50 * dpr, W - 50 * dpr), clamp(ey - Math.sin(a) * 26 * dpr, 30 * dpr, H - 20 * dpr));
  ctx.restore();
}

function draw() {
  const s = state, w = s.world, p = s.plane;
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
  W = canvas.width; H = canvas.height;
  if (!W || !H) return;   // hidden behind a menu: nothing to draw
  const zoom = clamp(Math.min(r.width, r.height) / 1350, 0.38, 0.8) * dpr;
  if (s.intro > 0.7) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(drawSide(1 - (s.intro - 0.7) / (INTRO - 0.7), performance.now() / 1000), 0, 0); return; }
  const shx = (Math.random() - 0.5) * s.shake * dpr, shy = (Math.random() - 0.5) * s.shake * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#191527'); sea.addColorStop(0.5, '#2a2036'); sea.addColorStop(1, '#3a2536');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(zoom, 0, 0, zoom, W / 2 - s.cam.x * zoom + shx, H / 2 - s.cam.y * zoom + shy);
  if (!waves) waves = wavePattern();
  ctx.save(); ctx.fillStyle = waves; ctx.translate(Math.sin(s.t * 0.3) * 20, 0); ctx.fillRect(s.cam.x - W / zoom, s.cam.y - H / zoom, W / zoom * 2, H / zoom * 2); ctx.restore();
  const glint = ctx.createRadialGradient(s.cam.x - 900, s.cam.y - 300, 50, s.cam.x - 900, s.cam.y - 300, 1400);
  glint.addColorStop(0, 'rgba(233,139,78,0.32)'); glint.addColorStop(0.35, 'rgba(123,56,70,0.18)'); glint.addColorStop(1, 'rgba(123,56,70,0)');
  ctx.fillStyle = glint; ctx.fillRect(s.cam.x - W / zoom, s.cam.y - H / zoom, W / zoom * 2, H / zoom * 2);

  for (const is of w.islands) drawIsland(is);
  for (const c of w.cells) drawCellShadow(c);
  for (const c of w.clouds) drawCloud(c, true);
  drawGate(s.t);
  for (const c of w.cells) drawCell(c);
  drawFlocks(s.t);
  ctx.save(); ctx.strokeStyle = 'rgba(230,240,250,0.35)'; ctx.lineWidth = 3;
  for (const sk of w.streaks) { const l = 180, k = 1 - sk.life / 0.6; const x = sk.x + Math.cos(sk.a) * 900 * k, y = sk.y + Math.sin(sk.a) * 900 * k; ctx.globalAlpha = sk.life / 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(sk.a) * l, y - Math.sin(sk.a) * l); ctx.stroke(); }
  ctx.restore();
  drawRival();

  const drawn = { ...p, x: 0, y: 0 };
  const planeAt = (x, y, shadow) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(PLANE_SCALE, PLANE_SCALE);
    ctx.rotate(p.rot); ctx.scale(1, 1 - Math.abs(s.bank) * 0.22); ctx.rotate(-p.rot);   // wings foreshorten when banked
    // the shadow is a flat silhouette (canvas filters don't work in Safari, which drew it as a second plane)
    if (shadow) G.Planes.silhouette(ctx, drawn, 'rgba(0,0,0,0.28)');
    else G.Planes.draw(ctx, drawn, s.t);
    ctx.restore();
  };
  planeAt(p.x - 90, p.y + 140, true);
  planeAt(p.x, p.y, false);

  for (const c of w.clouds) drawCloud(c, false);
  for (const b of w.bolts) {
    const a = b.life / 0.45;
    ctx.save(); ctx.shadowColor = '#c8dcff'; ctx.shadowBlur = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of b.paths) {
      ctx.strokeStyle = `rgba(235,242,255,${a * (pts.branch ? 0.6 : 1)})`; ctx.lineWidth = pts.branch ? 3 : 7;
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
    }
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 260); g.addColorStop(0, `rgba(220,230,255,${0.5 * a})`); g.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 260, 0, TAU); ctx.fill();
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (s.rain > 0.02) {
    ctx.strokeStyle = `rgba(190,210,230,${0.4 * s.rain})`; ctx.lineWidth = 1.3 * dpr;
    ctx.beginPath();
    for (let i = 0; i < 220 * s.rain; i++) { const x = Math.random() * W, y = Math.random() * H; ctx.moveTo(x, y); ctx.lineTo(x - 7 * dpr, y + 26 * dpr); }
    ctx.stroke();
    ctx.fillStyle = `rgba(14,20,28,${0.42 * s.rain})`; ctx.fillRect(0, 0, W, H);
  }
  if (s.flash > 0) { ctx.fillStyle = `rgba(225,235,255,${0.65 * s.flash})`; ctx.fillRect(0, 0, W, H); }
  screenFog(s.t, zoom);
  G.Scene.overlay(ctx, W, H, 0.62);
  if (s.intro > 0) { ctx.globalAlpha = clamp(s.intro / 0.7, 0, 1); ctx.drawImage(drawSide(1, performance.now() / 1000), 0, 0); ctx.globalAlpha = 1; return; }
  drawArrow(s.cam, zoom);
  drawRivalArrow(s.cam, zoom);
  drawRadar();
}

const fogs = Array.from({ length: 6 }, () => ({ x: Math.random() * 2, y: Math.random(), w: 0.5 + Math.random() * 0.5, a: 0.05 + Math.random() * 0.05, sp: 0.6 + Math.random() }));
const flies = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU, sp: 0.3 + Math.random() * 0.6, r: 0.8 + Math.random() * 1.4 }));
function screenFog(t, zoom) {
  const cam = state.cam;
  for (const f of fogs) {
    const fx = (((f.x * W - cam.x * zoom * 0.35 * f.sp + t * 18 * dpr) % (W * 2)) + W * 2) % (W * 2) - W * 0.5;
    const fy = (((f.y * H - cam.y * zoom * 0.35 * f.sp) % H) + H) % H, fw = f.w * W;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.5);
    g.addColorStop(0, `rgba(235,175,165,${f.a})`); g.addColorStop(1, 'rgba(235,175,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy, fw * 0.5, fw * 0.16, 0, 0, TAU); ctx.fill();
  }
  for (const f of flies) {
    const x = (((f.x * W - cam.x * zoom * 1.2 + Math.sin(t * 0.3 * f.sp + f.ph) * 40 * dpr) % W) + W) % W;
    const y = (((f.y * H - cam.y * zoom * 1.2 + Math.cos(t * f.sp + f.ph) * 20 * dpr) % H) + H) % H;
    const a = 0.25 + 0.55 * Math.max(0, Math.sin(t * 2.2 * f.sp + f.ph)), r = f.r * dpr * 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(230,255,150,${a})`); g.addColorStop(1, 'rgba(230,255,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  }
}

// the intro's sunset, side view: the plane rolls down the strip and climbs away
const side = document.createElement('canvas'), sctx = side.getContext('2d');
function sidePlane(c, x, y, s, nose, t) {
  c.save(); c.translate(x, y); c.rotate(-nose); c.fillStyle = '#120e14';
  c.beginPath(); c.moveTo(-30 * s, -6 * s); c.lineTo(22 * s, -8 * s); c.lineTo(30 * s, -4 * s); c.lineTo(28 * s, 0); c.lineTo(-26 * s, -1 * s); c.closePath(); c.fill();
  if (opts.plane.kind === 'cherokee') c.fillRect(-10 * s, -1 * s, 26 * s, 3 * s);   // low wing
  else { c.fillRect(-10 * s, -14 * s, 26 * s, 3 * s); c.fillRect(-2 * s, -12 * s, 2 * s, 6 * s); }   // high wing and strut
  c.beginPath(); c.moveTo(-30 * s, -6 * s); c.lineTo(-34 * s, -17 * s); c.lineTo(-26 * s, -6 * s); c.fill();
  c.globalAlpha = 0.35; c.beginPath(); c.ellipse(31 * s, -4 * s, 1.2 * s, 9 * s, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  for (const wx of [-4 * s, 18 * s]) { c.beginPath(); c.arc(wx, 1.5 * s, 2.2 * s, 0, TAU); c.fill(); }
  if ((t * 1.1) % 1 < 0.15) {
    const g = c.createRadialGradient(-33 * s, -17 * s, 0, -33 * s, -17 * s, 10 * s);
    g.addColorStop(0, 'rgba(255,60,50,0.95)'); g.addColorStop(1, 'rgba(255,60,50,0)');
    c.fillStyle = g; c.beginPath(); c.arc(-33 * s, -17 * s, 10 * s, 0, TAU); c.fill();
  }
  c.restore();
}
function drawSide(k, t) {
  if (side.width !== W || side.height !== H) { side.width = W; side.height = H; }
  G.Scene.paint(sctx, W, H, t, { px: dpr, parked: false });
  const hy = H * 0.62, u = Math.min(W, H * 1.6) / 1000;
  const roll = clamp(k / 0.35, 0, 1), climb = clamp((k - 0.3) / 0.7, 0, 1);
  const x = W * 0.5 + roll * W * 0.2 + climb * W * 0.45, y = hy + 41 * u - Math.pow(climb, 1.3) * H * 0.55;
  sidePlane(sctx, x, y, (1.4 + climb * 2.2) * u, climb > 0 ? 0.06 + climb * 0.3 : 0, t);
  G.Scene.overlay(sctx, W, H);
  return side;
}

let looping = false;
function frame(t) {
  if (!running) { looping = false; return; }
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  try {
    if (state.intro > 0) { state.intro -= dt; if (state.intro <= 0) say('Climbing to 4,500 feet. Follow the gold arrow.', 3); }
    else update(dt);
    draw();
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
setInterval(() => {   // keep flying if animation frames pause (background tab)
  if (!running) return;
  const now = performance.now();
  if (now - lastT > 200) { let left = Math.min(1, (now - lastT) / 1000); lastT = now; while (left > 0) { const d = Math.min(0.05, left); if (state.intro > 0) state.intro -= d; else update(d); left -= d; } }
}, 120);

G.Flight = {
  // o: { seed, cfg, modeName, modeColor, plane:{kind,reg,stripe,paint}, voice, onDone(result), onPos? }
  start(o) {
    opts = o; rival = o.rival || null; keys = {};
    reset(o);
    $('flight').classList.remove('hidden');
    startAudio();
    running = true; lastT = performance.now();
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  },
  stop() { running = false; stopAudio(); $('flight').classList.add('hidden'); $('fMsg').classList.remove('on'); },
  setRival(r) { rival = r; },
  rivalPos(pos) { if (rival) { rival.pos = pos; rival.posAt = performance.now(); } },
  setRivalStatus(text) { if (rival) rival.status = text; },
  botPlan,
  get running() { return running; },
  debug() { return state; },
};
})();
