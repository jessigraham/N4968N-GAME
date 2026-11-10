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
const LANE = { c172: -70, cherokee: 70 };   // both planes leave Kanoa side by side: each type climbs out on its own side
const RIVAL = '#5ec8e5';                  // your rival's color: their name tag, radar plane, outline and edge arrow
const AI_V = [150, 230], AI_LIM = [130, 250];   // the bot's cruise range in flight, and what it can do to keep its schedule

let W = 0, H = 0, dpr = 1;
let state = null, keys = {}, running = false, lastT = 0, opts = null, rival = null;
let ai = null, live = null, pausedMs = 0, flashLog = [], lastThunder = -9, hud = { howto: null, hint: null };
let seenHowto = false; try { seenHowto = localStorage.getItem('n4968n-flight-howto') === '1'; } catch (e) {}

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
  const cell = { x, y, y0: y, R: r, spin: R() * TAU, drift: (R() - 0.5) * 28, puffs: [], glow: 0, glows: [] };
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
    plane: { kind: o.plane.kind, reg: o.plane.reg, x: world.start.x + 120, y: world.start.y + (LANE[o.plane.kind] || 0), rot: -0.05, paint: o.plane.paint || '#efece3', stripe: o.plane.stripe || '#b23a2c', flyable: true, propAngle: 0, inFlight: true },
    heading: -0.05, bank: 0, thr: 0.75, speed: 190,
    hull: 100, fuel: M.fuel, fuelMax: M.fuel, shake: 0, flash: 0, rain: 0,
    msg: '', msgT: 0, done: false, gliding: 0, endT: 0, saidField: false,
    zone: 'clear', cam: { x: world.start.x + 380, y: world.start.y },
    intro: INTRO, lastWhoa: -99, lastPos: 0,
    gust: null, nextGust: rand(M.gust.every[0], M.gust.every[1]) * 0.6, nextFlock: 3,
  };
  ai = null; live = null; pausedMs = 0; flashLog = []; lastThunder = -9;
  const b = $('fBadge'); b.textContent = o.modeName; b.style.borderColor = o.modeColor; b.style.color = o.modeColor;
  $('fReg').textContent = o.plane.reg;
  $('fMsg').classList.remove('on');
}

function restore(r) {
  const s = state;
  Object.assign(s.plane, { x: r.x, y: r.y, rot: r.rot });
  Object.assign(s, { heading: r.heading, bank: r.bank, thr: r.thr, speed: r.speed, hull: r.hull, fuel: r.fuel, t: r.t, cam: r.cam, intro: Math.min(r.intro, 0) });
}

// ---------- input ----------
const map = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyS: 'd' };
addEventListener('keydown', e => {
  if (running && state && state.howto && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) { e.preventDefault(); e.stopImmediatePropagation(); closeHowto(); return; }
  if (running && map[e.code]) { keys[map[e.code]] = true; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
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
  for (const c of w.cells) { c.spin += dt * 0.05; c.y += c.drift * dt; c.glow = Math.max(0, c.glow - dt * 4.5); c.glows = c.glows.filter(g => (g.life -= dt) > 0); }

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
  edgeLightning(dt);

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

  if ((s.nextFlock -= dt) <= 0 && w.flocks.length < M.flocks && !s.done) { s.nextFlock = rand(2, 5); w.flocks.push(newFlock(p, s.heading)); }
  for (const f of w.flocks) {
    f.x += Math.cos(f.dir) * f.v * dt; f.y += Math.sin(f.dir) * f.v * dt; f.life -= dt;
    const fr = f.kind === 'frigate';
    for (const b of f.birds) {   // each bird flaps in bursts and glides in between, on its own rhythm
      if ((b.next -= dt) <= 0) { b.glide = !b.glide; b.next = b.glide ? rand(1.4, 3.5) * (fr ? 1.6 : 1) : rand(0.7, 1.8) * (fr ? 0.7 : 1); }
      b.amp = lerp(b.amp, b.glide ? 0 : 1, clamp(dt * 3, 0, 1));
      b.ph += dt * (fr ? 6.5 : 9.5) * b.rate * (0.35 + 0.65 * b.amp);
    }
    if (s.done || f.hit) continue;
    for (const b of f.birds) {
      const [bx, by] = birdAt(f, b, s.t);
      if (Math.hypot(bx - p.x, by - p.y) < 46) {
        f.hit = true; s.hull -= M.birdDamage; s.shake = 18; say('BIRD STRIKE!', 1.6); whoa();
        if (audio) audio.thump();
        for (let i = 0; i < 18; i++) w.feathers.push({ x: bx, y: by, vx: rand(-120, 120), vy: rand(-120, 120), life: rand(0.8, 1.6), a: Math.random() * TAU, dark: fr && i % 3 !== 0 });
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

  w.bolts = w.bolts.filter(b => (b.age += dt) < b.life);
  s.flash = Math.max(0, s.flash - dt * 5);   // flashes are brief
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
  if (rival) {
    const r = rivalNow(), name = rival.label || 'Rival';
    chip.style.borderColor = RIVAL; chip.style.color = RIVAL;
    if (r && r.kind === 'air') {
      const ahead = Math.hypot(f.x - r.x, gyNow - r.y) < Math.hypot(f.x - p.x, gyNow - p.y);
      chip.textContent = `${name}: ${(Math.hypot(r.x - p.x, r.y - p.y) / PX_PER_MILE).toFixed(1)} mi ${ahead ? 'ahead' : 'behind'}`;
    } else chip.textContent = `${name}: ` + (r && r.kind === 'down' ? 'going down' : r && r.kind === 'through' ? 'through the gate!' : r && r.kind === 'ground' ? 'on the ground' : rival.status || 'not in the air yet');
  }
  $('fThr').textContent = Math.round(s.thr * 100) + '%'; $('fKts').textContent = Math.round(s.speed * 0.55);
}

function setBar(id, v) {
  const el = $(id); el.style.width = clamp(v, 0, 100) + '%';
  el.style.background = v > 50 ? 'var(--fgreen)' : v > 25 ? 'var(--famber)' : 'var(--fred)';
}

// ---------- lightning ----------
// a jagged channel by midpoint displacement, with forks that split off and taper
function jag(x0, y0, x1, y1, rough) {
  let pts = [[x0, y0], [x1, y1]];
  for (let it = 0; it < 5; it++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, off = (Math.random() * 2 - 1) * l * rough;
      next.push([(a[0] + b[0]) / 2 - dy / l * off, (a[1] + b[1]) / 2 + dx / l * off], b);
    }
    pts = next;
  }
  return pts;
}
function makeBolt(x0, y0, x1, y1, w, depth, k) {
  const pts = jag(x0, y0, x1, y1, 0.22), out = [{ pts, w, k }];
  if (depth < 2) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = 1 + Math.floor(Math.random() * (depth ? 2 : 3));
    for (let i = 0; i < n; i++) {
      const at = 4 + Math.floor(Math.random() * (pts.length - 10)), q = pts[at], nx = pts[at + 1];
      const a = Math.atan2(nx[1] - q[1], nx[0] - q[0]) + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9), L = len * rand(0.22, 0.48);
      out.push(...makeBolt(q[0], q[1], q[0] + Math.cos(a) * L, q[1] + Math.sin(a) * L, w * 0.55, depth + 1, k * 0.65));
    }
  }
  return out;
}
function addBolt(x0, y0, x1, y1, w, gx, gy, glow) {
  if (state.world.bolts.length >= 9) state.world.bolts.shift();   // keeps the cost bounded on phones
  state.world.bolts.push({ paths: makeBolt(x0, y0, x1, y1, w, 0, 1), age: 0, life: rand(0.38, 0.55), gx, gy, glow });
}
// full-screen flashes are rationed: at most 3 in any second, a third of a second apart, and brief
function flashReq(v) {
  const s = state, now = s.t;
  flashLog = flashLog.filter(t => now - t < 1);
  if (flashLog.length >= 3 || (flashLog.length && now - flashLog[flashLog.length - 1] < 0.34)) return false;
  flashLog.push(now); s.flash = Math.max(s.flash, v);
  return true;
}
function thunderAt(d, force) {
  if (!audio || (!force && state.t - lastThunder < 0.7)) return;
  lastThunder = state.t;
  audio.thunder(clamp(d / 1100, 0.02, 2.5), clamp(1.15 - d / 3500, 0.3, 1.1));
}

function strike(dangerous) {
  const s = state, cells = s.world.cells;
  let x, y, cell;
  if (dangerous) { x = s.plane.x + rand(-160, 160); y = s.plane.y + rand(-160, 160); cell = cells[0]; }
  else { cell = cells[Math.floor(Math.random() * cells.length)]; const a = Math.random() * TAU, rr = Math.random() * cell.R * 0.85; x = cell.x + Math.cos(a) * rr; y = cell.y + Math.sin(a) * rr; }
  cell.glow = 1;
  addBolt(x + rand(-300, 300), y - 600, x, y, dangerous ? 6 : 5, x, y, 320);
  const d = Math.hypot(x - s.plane.x, y - s.plane.y);
  flashReq(dangerous ? 1 : clamp(1 - d / 2800, 0.1, 0.5));
  if (dangerous) { if (audio) audio.thunder(0.01, 1.4); } else thunderAt(d, false);
  if (dangerous && !s.done) { s.hull -= s.M.strikeDamage; s.shake = 26; say('LIGHTNING STRIKE! Get out of the core!', 1.6); whoa(); }
}

// the storm's outer wall: bolts crawl along the edge and leap out into clear air, and the cloud tops pulse with light.
// Biased toward the side you can see, and busier the closer you fly.
function edgeLightning(dt) {
  const s = state, p = s.plane, M = s.M;
  for (const c of s.world.cells) {
    const d = Math.hypot(p.x - c.x, p.y - c.y), near = 1 - smooth(c.R * 0.9, c.R * 3.2, d);
    if (near <= 0.01) continue;
    const rate = (1.3 + 4 * M.lightning) * near * clamp(c.R / 2000, 0.6, 1.3), toP = Math.atan2(p.y - c.y, p.x - c.x);
    if (Math.random() < dt * rate) edgeBolt(c, toP + rand(-1.15, 1.15));
    if (c.glows.length < 6 && Math.random() < dt * rate * 1.3) {   // a pulse inside the cloud wall with no visible bolt
      const a = toP + rand(-1.4, 1.4), r = c.R * rand(0.55, 1.0);
      c.glows.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, r: rand(300, 620), life: 0.45, max: rand(0.35, 0.75) });
    }
  }
}
function edgeBolt(c, a) {
  const s = state, p = s.plane;
  let x0, y0, x1, y1;
  if (Math.random() < 0.45) {   // a crawler along the boundary
    const r = c.R * rand(0.9, 1.08), half = rand(0.12, 0.3);
    x0 = c.x + Math.cos(a - half) * r; y0 = c.y + Math.sin(a - half) * r;
    x1 = c.x + Math.cos(a + half) * r * rand(0.95, 1.1); y1 = c.y + Math.sin(a + half) * r * rand(0.95, 1.1);
  } else {                        // a bolt reaching out of the wall into the clear air
    const aa = a + rand(-0.25, 0.25), r0 = c.R * rand(0.82, 0.96), r1 = c.R * rand(1.2, 1.6);
    x0 = c.x + Math.cos(a) * r0; y0 = c.y + Math.sin(a) * r0; x1 = c.x + Math.cos(aa) * r1; y1 = c.y + Math.sin(aa) * r1;
  }
  addBolt(x0, y0, x1, y1, 4.5, x0, y0, 460);
  if (c.glows.length < 8) c.glows.push({ x: x0, y: y0, r: rand(450, 750), life: 0.5, max: 0.9 });
  c.glow = Math.max(c.glow, 0.5);
  const d = Math.hypot((x0 + x1) / 2 - p.x, (y0 + y1) / 2 - p.y);
  if (d < 3600) flashReq(clamp(0.5 - d / 5000, 0.1, 0.4));
  thunderAt(d, false);
}
const boltAlpha = b => b.age < 0.05 ? 1 : b.age < 0.09 ? 0.3 : b.age < 0.15 ? 0.95 : Math.max(0, 1 - (b.age - 0.15) / (b.life - 0.15)) * 0.85;   // strike, flicker, restrike, fade

// ---------- seabirds: brown boobies in loose Vs, frigatebirds soaring in loose groups ----------
function newFlock(p, heading) {
  const ahead = rand(900, 1600), off = rand(-700, 700);
  const cx = p.x + Math.cos(heading) * ahead - Math.sin(heading) * off, cy = p.y + Math.sin(heading) * ahead + Math.cos(heading) * off;
  const dir = heading + (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 1.9), frigate = Math.random() < 0.45;
  const n = frigate ? 3 + Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 6), vee = Math.random() < (frigate ? 0.3 : 0.75);
  const birds = [];
  for (let i = 0; i < n; i++) {
    let bx, by;
    if (vee) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; bx = -row * rand(30, 44) + rand(-6, 6); by = side * row * rand(24, 38); }
    else { const a = Math.random() * TAU, r = i ? 30 + Math.sqrt(Math.random()) * 110 : 0; bx = Math.cos(a) * r; by = Math.sin(a) * r; }
    const glide = Math.random() < (frigate ? 0.7 : 0.35);
    birds.push({ bx, by, ph: Math.random() * TAU, size: rand(0.85, 1.2), alt: Math.random(), glide, amp: glide ? 0 : 1, next: rand(0.3, 2.5), rate: rand(0.85, 1.15), wob: Math.random() * TAU });
  }
  return { x: cx - Math.cos(dir) * 600, y: cy - Math.sin(dir) * 600, dir, v: frigate ? rand(60, 95) : rand(85, 125), birds, life: 30, kind: frigate ? 'frigate' : 'booby' };
}
function birdAt(f, b, t) {   // formations are loose: every bird drifts a little in its slot
  const c = Math.cos(f.dir), s = Math.sin(f.dir);
  const ox = b.bx + Math.sin(t * 0.6 + b.wob) * 7, oy = b.by + Math.cos(t * 0.45 + b.wob * 1.3) * 9;
  return [f.x + c * ox - s * oy, f.y + s * ox + c * oy];
}

// ---------- your rival in the air ----------
// Online: their reported position, smoothed between the 10-a-second updates.
// Bot: game.js hands over a flight plan (route around the storm, how long it takes, whether it makes it). Here a small
// AI flies that plan like a plane, with banked turns around the live storm, and paces itself to stay near you when it
// can, while still reaching the gate (or going down) when the plan says, so the result card matches what you saw.
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
function schedT() { return rival && rival.startedAt ? (performance.now() - pausedMs - rival.startedAt) / 1000 : -1; }
function planEnd(P) { return P.win ? P.time : Math.max(2, P.time - 9); }
function aiRoute(P) {
  const cells = [...state.world.cells].sort((a, b) => a.x - b.x), out = [], last = P.pts.length - 1;
  for (let i = 1; i < last; i++) { const c = cells[Math.floor((i - 1) / 2)]; out.push({ x: P.pts[i].x, y: P.pts[i].y + (c ? c.y - c.y0 : 0) }); }
  if (P.win) out.push({ x: P.pts[last].x, y: gateY(state.t) });
  else { const e = along(P.pts, P.len, P.failK); while (out.length && out[out.length - 1].x > e.x) out.pop(); out.push({ x: e.x, y: e.y }); }
  return out;
}
function routeLeft(route, i, x, y) {
  let d = Math.hypot(route[i].x - x, route[i].y - y);
  for (let k = i + 1; k < route.length; k++) d += Math.hypot(route[k].x - route[k - 1].x, route[k].y - route[k - 1].y);
  return d;
}
function spawnAI(P, tNow, tEnd) {
  const st = state.world.start;
  const mine = LANE[opts.plane.kind] || 0, lane = rival.plane && LANE[rival.plane.kind] !== undefined && LANE[rival.plane.kind] !== mine ? LANE[rival.plane.kind] : mine + 150;
  const a = { plan: P, x: st.x + 60, y: st.y + lane, h: -0.05, bank: 0, v: 185, wp: 0, age: 0, down: 0, through: 0, orbit: 0, smoke: [] };
  if (tNow > 1.5) {   // it took off a while before you: put it where its plan has it by now
    const q = along(P.pts, P.len, clamp(tNow / tEnd, 0, 0.97) * (P.win ? 1 : P.failK));
    a.x = q.x; a.y = q.y; a.h = q.h; a.age = 2;
  }
  const route = aiRoute(P);
  while (a.wp < route.length - 1 && route[a.wp].x < a.x + 60) a.wp++;
  return a;
}
function aiUpdate(dt) {
  if (!rival || !rival.plan || !rival.startedAt) return;
  const P = rival.plan;
  if (ai && ai.plan !== P) ai = null;
  const tNow = schedT(), tEnd = planEnd(P);
  if (tNow < 0) return;
  if (!ai) ai = spawnAI(P, tNow, tEnd);
  const a = ai; a.age += dt;
  for (const sm of a.smoke) { sm.life -= dt; sm.r += dt * 26; }
  a.smoke = a.smoke.filter(sm => sm.life > 0);
  if (a.down || a.through) {
    if (a.down) { a.down += dt; a.h += dt * 0.9; a.v = lerp(a.v, 95, clamp(dt, 0, 1)); if (Math.random() < dt * 14) a.smoke.push({ x: a.x, y: a.y, r: 12, life: 1.6 }); }
    else { a.through += dt; a.h += wrapA(0 - a.h) * clamp(dt, 0, 1); }
    a.bank = lerp(a.bank, a.down ? 0.8 : 0, clamp(dt * 2, 0, 1));
    a.x += Math.cos(a.h) * a.v * dt; a.y += Math.sin(a.h) * a.v * dt;
    return;
  }
  const route = aiRoute(P);
  while (a.wp < route.length - 1 && (route[a.wp].x < a.x + 40 || Math.hypot(route[a.wp].x - a.x, route[a.wp].y - a.y) < 180)) a.wp++;
  const tg = route[a.wp], tau = tEnd - tNow, D = routeLeft(route, a.wp, a.x, a.y), lastWp = a.wp === route.length - 1;
  if (P.win && lastWp && a.x >= tg.x && tau < 3) { a.through = 0.001; return; }
  if (!P.win && tau <= 0) {
    a.down = 0.001;
    if (/storm/i.test(P.reason || '')) { addBolt(a.x + rand(-200, 200), a.y - 500, a.x, a.y, 5, a.x, a.y, 300); thunderAt(Math.hypot(a.x - state.plane.x, a.y - state.plane.y), true); }
    return;
  }
  // pace: stay close to you when the schedule allows it, never so far off it that the plan's finish becomes impossible
  const p = state.plane, gap = a.x - p.x;
  let want = tau < 4 ? D / Math.max(tau, 0.3) : (!state.done && Math.abs(gap) < 3500 ? state.speed - clamp(gap, -1200, 1200) * 0.1 : D / tau);
  let v = clamp(want, AI_V[0], AI_V[1]);
  if (tau >= 4) {
    const tp = tau - dt, lo = (D - AI_V[1] * tp) / dt, hi = (D - AI_V[0] * tp) / dt;
    if (v < lo) v = Math.min(lo, AI_LIM[1]);
    if (v > hi) v = Math.max(hi, AI_LIM[0]);
  } else v = clamp(want, 90, 320);
  // ahead of schedule with nowhere to burn the time: hold in a wide circle, like coming around for another go
  if (!a.orbit && tau > 4 && D < AI_V[0] * tau - 250) {
    const c = state.world.cells[0];
    a.orbit = a.y < c.y ? -1 : 1;
  } else if (a.orbit && D >= AI_V[0] * tau - 60) a.orbit = 0;
  const desired = Math.atan2(tg.y - a.y, tg.x - a.x);
  const bankWant = a.orbit ? a.orbit * 0.75 : clamp(wrapA(desired - a.h) * 2.2, -1, 1);
  a.bank = lerp(a.bank, bankWant, clamp(dt * 3, 0, 1));
  a.h += a.bank * TURN * dt + Math.sin(a.age * 1.7) * 0.04 * dt;
  a.v = lerp(a.v, v, clamp(dt * 2, 0, 1));
  a.x = clamp(a.x + Math.cos(a.h) * a.v * dt, 40, WORLD.w - 40); a.y = clamp(a.y + Math.sin(a.h) * a.v * dt, 40, WORLD.h - 40);
}
function liveUpdate(dt) {
  if (!live || !rival || !rival.pos) return;
  const age = Math.min(0.6, (performance.now() - rival.posAt) / 1000);
  const tx = rival.pos.x + live.vx * age, ty = rival.pos.y + live.vy * age, k = clamp(dt * 8, 0, 1);
  live.x = lerp(live.x, tx, k); live.y = lerp(live.y, ty, k);
  const oh = live.h; live.h += wrapA((rival.pos.h || 0) - live.h) * k;
  live.bank = lerp(live.bank, clamp(wrapA(live.h - oh) / Math.max(dt, 0.001) / TURN, -1, 1), clamp(dt * 4, 0, 1));
}
function rivalTick(dt) { liveUpdate(dt); aiUpdate(dt); }

// where your rival is right now, and what they're doing: 'air', 'down', 'through' (the gate), or 'ground' (still on the strip)
function rivalNow() {
  if (!rival || !state) return null;
  if (rival.pos && live && performance.now() - rival.posAt < 3000) return { x: live.x, y: live.y, h: live.h, bank: live.bank, kind: 'air', alpha: 1 };
  if (ai) {
    const fade = ai.down ? 1 - smooth(2.5, 4.5, ai.down) : ai.through ? 1 - smooth(4, 6, ai.through) : 1;
    if (fade <= 0.02) return null;
    return { x: ai.x, y: ai.y, h: ai.h, bank: ai.bank, kind: ai.down ? 'down' : ai.through ? 'through' : 'air', alpha: fade * clamp(ai.age / 0.6, 0, 1), sink: ai.down ? clamp(ai.down / 4, 0, 1) : 0 };
  }
  if (rival.everPos) return null;
  const st = (rival.status || '').toLowerCase();
  if (/jungle|left the race|gate|storm/.test(st)) return null;
  const sp = state.world.islands[0].strip;
  return { x: sp.x + 40, y: sp.y, h: sp.a, bank: 0, kind: 'ground', alpha: 1 };
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

// ---------- photographic textures (assets/flight): dusk ocean, jungle canopy, storm cloud tops, cumulus and seabirds ----------
// Everything falls back to the drawn versions until (or unless) the images load.
const IMG = {};
for (const n of ['ocean.jpg', 'canopy.jpg', 'storm.jpg', 'clouds.png', 'frigate.png', 'booby.png']) { const im = new Image(); im.src = 'assets/flight/' + n; IMG[n.split('.')[0]] = im; }
const ready = im => !!(im && im.complete && im.naturalWidth > 0);
const pats = {};
function pat(name) { if (!pats[name] && ready(IMG[name])) pats[name] = ctx.createPattern(IMG[name], 'repeat'); return pats[name]; }
// a flat one-color copy of a sprite (shadows, rims), made once
const tints = {};
function tinted(name, color) {
  const key = name + color;
  if (!tints[key]) {
    const im = IMG[name], c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tints[key] = c;
  }
  return tints[key];
}
// a storm cell's cloud deck: the cloud-top photo cut into a disk with a ragged soft edge and a darker eye, made once per cell
function cellSprite(c) {
  const S = 1024, Rs = S / 2 / 1.18, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = rng(Math.round(c.x * 7 + c.R));
  g.save(); g.scale(0.62, 0.62); g.fillStyle = g.createPattern(IMG.storm, 'repeat'); g.fillRect(0, 0, S / 0.62, S / 0.62); g.restore();
  const m = document.createElement('canvas'); m.width = m.height = S; const mg = m.getContext('2d');
  const blobAt = (x, y, r, a) => { const gr = mg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = gr; mg.beginPath(); mg.arc(x, y, r, 0, TAU); mg.fill(); };
  blobAt(S / 2, S / 2, Rs * 1.02, 1);
  for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + R() * 0.2, rr = Rs * (0.8 + R() * 0.12); blobAt(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, Rs * (0.14 + R() * 0.12), 1); }
  g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const eye = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, Rs * 0.62);
  eye.addColorStop(0, 'rgba(14,6,22,0.55)'); eye.addColorStop(1, 'rgba(14,6,22,0)');
  g.fillStyle = eye; g.fillRect(0, 0, S, S);
  return cv;
}
const OCEAN_TILE = 1500;   // world px per ocean tile
function drawOcean(s, zoom) {
  const p = pat('ocean'); if (!p) return false;
  const k = OCEAN_TILE / 1024, dx = s.t * 5, dy = s.t * 2.5;
  ctx.save(); ctx.scale(k, k); ctx.translate(dx, dy); ctx.fillStyle = p;
  ctx.fillRect((s.cam.x - W / zoom) / k - dx, (s.cam.y - H / zoom) / k - dy, W / zoom * 2 / k, H / zoom * 2 / k);
  ctx.restore();
  return true;
}

function drawIsland(is) {
  ctx.save();
  path(is.pts); ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(120,200,190,0.18)'; ctx.stroke();
  path(is.pts); ctx.fillStyle = '#6b5040'; ctx.fill();
  const cx = is.pts.reduce((a, q) => a + q[0], 0) / is.pts.length, cy = is.pts.reduce((a, q) => a + q[1], 0) / is.pts.length;
  ctx.save();
  ctx.beginPath(); is.pts.forEach((q, i) => { const x = cx + (q[0] - cx) * 0.86, y = cy + (q[1] - cy) * 0.86; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
  const canopy = pat('canopy');
  if (canopy) {   // the jungle canopy photo, with the sunset dimming toward the shore
    ctx.clip(); const k = 0.55, b = 900;
    ctx.save(); ctx.scale(k, k); ctx.fillStyle = canopy; ctx.fillRect((cx - b) / k, (cy - b) / k, 2 * b / k, 2 * b / k); ctx.restore();
    const sh = ctx.createRadialGradient(cx, cy, 60, cx, cy, 700); sh.addColorStop(0, 'rgba(10,8,16,0)'); sh.addColorStop(1, 'rgba(10,8,16,0.55)');
    ctx.fillStyle = sh; ctx.fillRect(cx - b, cy - b, 2 * b, 2 * b);
  } else { ctx.fillStyle = '#11201a'; ctx.fill(); ctx.clip(); }
  if (!canopy) for (let i = 0; i < 70; i++) { const a = i * 2.39, rr = (i % 13) / 13; ctx.fillStyle = i % 3 ? 'rgba(8,16,12,0.55)' : 'rgba(44,29,47,0.45)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr * 600, cy + Math.sin(a) * rr * 480, 12 + (i % 5) * 6, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (is.volcano) {
    const g = ctx.createRadialGradient(cx - 160, cy - 120, 10, cx - 160, cy - 120, 170);
    g.addColorStop(0, '#2a1d17'); g.addColorStop(0.25, '#5b4636'); g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx - 160, cy - 120, 170, 0, TAU); ctx.fill();
  }
  if (!is.palms) { is.palms = []; for (let i = 0; i < is.pts.length; i += 3) { const q = is.pts[i], k = 0.72 + ((i * 37) % 18) / 100; is.palms.push([cx + (q[0] - cx) * k, cy + (q[1] - cy) * k, 16 + (i * 13) % 18, (i * 2.1) % TAU]); } }
  if (!canopy) for (const [x, y, r, ph] of is.palms) {
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
  if (!c.sprite && ready(IMG.storm)) c.sprite = cellSprite(c);
  if (c.sprite) {   // the cloud deck photo, turning slowly, with a faster inner band
    const D = c.R * 2 * 1.18;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.spin * 0.6); ctx.drawImage(c.sprite, -D / 2, -D / 2, D, D); ctx.restore();
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-c.spin * 1.1 + 1.7); ctx.globalAlpha = 0.6; ctx.drawImage(c.sprite, -D * 0.3, -D * 0.3, D * 0.6, D * 0.6); ctx.restore();
    // the edge of the storm wall, lit by the sunset, so the boundary stays easy to read over the photo
    const rim = ctx.createRadialGradient(c.x, c.y, c.R * 0.9, c.x, c.y, c.R * 1.1);
    rim.addColorStop(0, 'rgba(255,160,130,0)'); rim.addColorStop(0.5, 'rgba(255,165,135,0.2)'); rim.addColorStop(1, 'rgba(255,160,130,0)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(c.x, c.y, c.R * 1.1, 0, TAU); ctx.fill();
    if (lit > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.R); lg.addColorStop(0, `rgba(120,110,200,${0.28 * lit})`); lg.addColorStop(1, 'rgba(120,110,200,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(c.x, c.y, c.R, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  if (!c.sprite) for (const pf of c.puffs) {
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
  if (c.glows.length) {   // lightning lighting up the cloud wall from inside
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const gl of c.glows) {
      const k = gl.life / 0.45, a = gl.max * clamp(k, 0, 1) * (k > 0.75 && k < 0.85 ? 0.4 : 1);
      const g = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
      g.addColorStop(0, `rgba(170,160,255,${0.55 * a})`); g.addColorStop(0.45, `rgba(120,110,220,${0.25 * a})`); g.addColorStop(1, 'rgba(120,110,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gl.x, gl.y, gl.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(140,160,185,0.1)'; ctx.lineWidth = 80 * (c.R / 2000);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 44; i++) { const a = c.spin * 1.4 + k * 1.57 + i * 0.12, rr = c.R * (0.2 + i / 44 * 0.85); const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
function drawCloud(c, shadow) {
  if (ready(IMG.clouds)) {   // a photographed cumulus, seen from above
    const v = Math.floor(c.seed * 37) % 4, w = c.s * 3.4, h = w * 320 / 420;
    ctx.save(); ctx.translate(c.x + (shadow ? -60 : 0), c.y + (shadow ? 90 : 0)); ctx.rotate((c.seed % 1) * 0.6 - 0.3);
    if (shadow) { ctx.globalAlpha = 0.3; ctx.drawImage(tinted('clouds', '#000'), v * 420, 0, 420, 320, -w / 2, -h / 2, w, h); }
    else { ctx.globalAlpha = 0.78; ctx.drawImage(IMG.clouds, v * 420, 0, 420, 320, -w / 2, -h / 2, w, h); }
    ctx.restore(); return;
  }
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
// one wing (the right one, +y), seen from above; k = how far it's spread (it shortens on the upstroke), sw = tip sweep
function wingPath(kind, k, sw) {
  ctx.beginPath();
  if (kind === 'frigate') {   // long, narrow, sharply crooked at the wrist
    ctx.moveTo(4, 1.5);
    ctx.quadraticCurveTo(10, 8 * k, 7 + sw * 0.3, 15 * k);
    ctx.quadraticCurveTo(-1 - sw, 24 * k, -13 - sw * 1.6, 34 * k);
    ctx.quadraticCurveTo(-8 - sw, 25 * k, -6, 16 * k);
    ctx.quadraticCurveTo(-2, 8 * k, -5, 1.5);
  } else {                    // a booby: straighter, pointed, a gentle bend
    ctx.moveTo(4, 1.5);
    ctx.quadraticCurveTo(9, 7 * k, 7 + sw * 0.3, 13 * k);
    ctx.quadraticCurveTo(2 - sw, 24 * k, -9 - sw * 1.5, 33 * k);
    ctx.quadraticCurveTo(-7 - sw * 0.5, 22 * k, -6.5, 13 * k);
    ctx.quadraticCurveTo(-4, 6 * k, -5.5, 1.5);
  }
  ctx.closePath();
}
function birdBody(kind) {
  const fr = kind === 'frigate';
  ctx.beginPath(); ctx.ellipse(1, 0, 11, fr ? 2.6 : 3.3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(11, 0, fr ? 2.4 : 2.9, 0, TAU); ctx.fill();
  ctx.beginPath();
  if (fr) { ctx.moveTo(-8, 1.3); ctx.lineTo(-25, 5.5); ctx.lineTo(-11, 0); ctx.lineTo(-25, -5.5); ctx.lineTo(-8, -1.3); }   // the deep forked tail
  else { ctx.moveTo(-8, 2.6); ctx.lineTo(-18, 1.2); ctx.lineTo(-19, 0); ctx.lineTo(-18, -1.2); ctx.lineTo(-8, -2.6); }    // a wedge tail
  ctx.closePath(); ctx.fill();
}
function drawBird(kind, x, y, rot, scale, k, sw, shadowFill) {
  const im = IMG[kind];
  if (ready(im)) {   // the photo, its wings foreshortened as they beat (seen from above, a raised wing looks shorter)
    const h = 70, w = h * im.naturalWidth / im.naturalHeight;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale * k);
    if (shadowFill) ctx.drawImage(tinted(kind, '#000'), -w / 2, -h / 2, w, h);
    else {
      ctx.save(); ctx.scale(1.12, 1.08); ctx.globalAlpha *= 0.55; ctx.drawImage(tinted(kind, '#ffc8a0'), -w / 2, -h / 2, w, h); ctx.restore();   // sunset rim, so dark birds read on dark water
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
    }
    ctx.restore(); return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  const wings = (fill, stroke, lw) => { for (const m of [1, -1]) { ctx.save(); ctx.scale(1, m); wingPath(kind, k, sw); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } ctx.restore(); } };
  if (shadowFill) { wings(shadowFill); ctx.fillStyle = shadowFill; birdBody(kind); ctx.restore(); return; }
  if (kind === 'frigate') {
    wings('#16131a', 'rgba(255,178,132,0.7)', 1.5);   // the sunset catches the edges of the black wings
    ctx.strokeStyle = 'rgba(168,134,110,0.8)'; ctx.lineWidth = 2.2;   // the pale bar across the upper wing
    for (const m of [1, -1]) { ctx.beginPath(); ctx.moveTo(0, 4 * k * m); ctx.quadraticCurveTo(4, 9 * k * m, 4, 14 * k * m); ctx.stroke(); }
    ctx.fillStyle = '#16131a'; birdBody(kind);
    ctx.strokeStyle = 'rgba(255,178,132,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(1, 0, 11, 2.6, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#a49c92'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(19.5, 0.2); ctx.lineTo(20, 1.4); ctx.stroke();   // hooked bill
  } else {
    wings('#f0ece2', 'rgba(25,22,30,0.55)', 1);
    for (const m of [1, -1]) {   // dark flight feathers: the outer hand and the trailing edge
      ctx.save(); ctx.scale(1, m); wingPath(kind, k, sw); ctx.clip();
      ctx.fillStyle = '#2a2530'; ctx.fillRect(-30, 22 * k, 44, 20); ctx.fillRect(-30, 0, 24.2, 40);
      ctx.restore();
    }
    ctx.fillStyle = '#f0ece2'; birdBody(kind);
    ctx.fillStyle = '#2a2530'; ctx.fillRect(-19, -1.2, 4, 2.4);
    ctx.fillStyle = '#e3bf63'; ctx.beginPath(); ctx.moveTo(13, -1); ctx.lineTo(19, 0); ctx.lineTo(13, 1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function birdPose(f, b, t) {
  const fr = f.kind === 'frigate', up = 0.5 + 0.5 * Math.sin(b.ph);
  return { k: 1 - b.amp * 0.45 * up, sw: b.amp * 5 * (1 - up), scale: (fr ? 1.15 : 1.05) * b.size * (1 + b.alt * 0.18), rot: f.dir + Math.sin(t * 0.7 + b.wob) * 0.08 };
}
function drawBirdShadows(t) {
  for (const f of state.world.flocks) {
    if (f.hit) continue;
    for (const b of f.birds) {
      const [x, y] = birdAt(f, b, t), q = birdPose(f, b, t);
      ctx.save(); ctx.globalAlpha = ready(IMG[f.kind]) ? 0.22 : 1;
      drawBird(f.kind, x - 55 - b.alt * 35, y + 85 + b.alt * 55, q.rot, q.scale * 0.95, q.k, q.sw, 'rgba(0,0,0,0.2)');
      ctx.restore();
    }
  }
}
function drawFlocks(t) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const f of state.world.flocks) {
    if (f.hit) continue;
    const fade = clamp(f.life, 0, 1);
    ctx.globalAlpha = fade;
    for (const b of f.birds) { const [x, y] = birdAt(f, b, t), q = birdPose(f, b, t); drawBird(f.kind, x, y, q.rot, q.scale, q.k, q.sw); }
  }
  ctx.globalAlpha = 1;
  for (const fe of state.world.feathers) {
    ctx.save(); ctx.translate(fe.x, fe.y); ctx.rotate(fe.a); ctx.globalAlpha = clamp(fe.life, 0, 1);
    ctx.fillStyle = fe.dark ? 'rgba(40,34,44,0.95)' : 'rgba(240,236,228,0.9)';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
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
// a small plane shape for the radar
function planeIcon(x, y, h, sc, fill) {
  const P = [[10, 0], [4, -1.6], [3, -9], [-0.5, -9], [-1, -1.6], [-6, -1.3], [-7.5, -4.5], [-9.5, -4.5], [-8.5, 0], [-9.5, 4.5], [-7.5, 4.5], [-6, 1.3], [-1, 1.6], [-0.5, 9], [3, 9], [4, 1.6]];
  ctx.save(); ctx.translate(x, y); ctx.rotate(h); ctx.fillStyle = fill; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1.6 * dpr; ctx.lineJoin = 'round';
  ctx.beginPath(); P.forEach(([px, py], i) => i ? ctx.lineTo(px * sc, py * sc) : ctx.moveTo(px * sc, py * sc)); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}
function pill(text, x, y, col, fs) {
  ctx.save(); ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + fs * 1.1, h = fs * 1.7;
  x = clamp(x, w / 2 + 4 * dpr, W - w / 2 - 4 * dpr);
  ctx.fillStyle = 'rgba(8,14,20,0.82)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.fillText(text, x, y + fs * 0.05);
  ctx.restore();
}
function drawRadar() {
  const s = state, w = s.world, size = Math.min(176, W / dpr * 0.3) * dpr, pad = 14 * dpr;
  const cx = W - pad - size / 2, cy = H - pad - size / 2 - (matchMedia('(pointer: coarse)').matches ? 80 * dpr : 0), k = size / 2 / 6000;
  const P = (x, y) => [cx + (x - s.plane.x) * k, cy + (y - s.plane.y) * k];
  ctx.save();
  ctx.fillStyle = 'rgba(6,14,12,0.8)'; ctx.strokeStyle = 'rgba(123,237,159,0.5)'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.clip();
  for (const c of w.cells) {
    const [sx, sy] = P(c.x, c.y);
    for (const [fr, col] of [[1.05, 'rgba(60,200,90,0.45)'], [0.78, 'rgba(240,210,60,0.6)'], [0.5, 'rgba(240,70,50,0.8)'], [0.25, 'rgba(200,60,200,0.85)']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, c.R * fr * k, 0, TAU); ctx.fill(); }
  }
  const [fx, fy] = P(w.finish.x, gateY(s.t)); ctx.fillStyle = '#f4b860'; ctx.fillRect(fx - 2 * dpr, fy - 7 * dpr, 4 * dpr, 14 * dpr);
  ctx.strokeStyle = 'rgba(123,237,159,0.25)'; ctx.lineWidth = 1 * dpr; for (const rr of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, size / 2 * rr, 0, TAU); ctx.stroke(); }
  ctx.restore();
  // your rival: a labeled plane in their color (pinned to the rim when they're out of range)
  const r = rivalNow();
  if (r) {
    let [rx, ry] = P(r.x, r.y);
    const dx = rx - cx, dy = ry - cy, dd = Math.hypot(dx, dy), lim = size / 2 - 9 * dpr;
    if (dd > lim) { rx = cx + dx / dd * lim; ry = cy + dy / dd * lim; }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.save(); ctx.strokeStyle = `rgba(94,200,229,${0.35 + 0.4 * pulse})`; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(rx, ry, (9 + 3 * pulse) * dpr, 0, TAU); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha = r.kind === 'down' ? 0.5 : 1; planeIcon(rx, ry, r.h, 0.85 * dpr, RIVAL); ctx.restore();
    const above = ry - 16 * dpr > cy - size / 2 + 4 * dpr;
    pill((rival.label || 'RIVAL') + (r.kind === 'ground' ? ' (GROUND)' : ''), rx, above ? ry - 17 * dpr : ry + 17 * dpr, RIVAL, 10 * dpr);
  }
  planeIcon(cx, cy, s.heading, 0.8 * dpr, '#ffffff');
  ctx.save(); ctx.fillStyle = 'rgba(200,230,210,0.85)'; ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('RADAR', cx, cy - size / 2 - 6 * dpr); ctx.restore();
}

// your rival's plane in the world: full plane art, an outline glow in their color, and a shadow on the water
function squash(h, bank) { ctx.rotate(h); ctx.scale(1, 1 - Math.abs(bank) * 0.22); ctx.rotate(-h); }   // wings foreshorten when banked
function drawRivalPlane(r) {
  if (!r || !rival.plane) return;
  const sink = r.sink || 0, sc = PLANE_SCALE * (1 - sink * 0.45), air = r.kind !== 'ground', off = air ? 1 - sink * 0.85 : 0.13;
  const pl = { kind: rival.plane.kind, reg: rival.plane.reg, stripe: rival.plane.stripe || '#1f5f9e', paint: rival.plane.paint, x: 0, y: 0, rot: r.h, flyable: true, inFlight: true, propAngle: air ? performance.now() / 18 : 0 };
  ctx.save(); ctx.globalAlpha = r.alpha == null ? 1 : r.alpha;
  if (ai && ai.smoke.length) for (const sm of ai.smoke) { ctx.fillStyle = `rgba(60,58,64,${0.4 * sm.life / 1.6})`; ctx.beginPath(); ctx.arc(sm.x, sm.y, sm.r, 0, TAU); ctx.fill(); }
  ctx.save(); ctx.translate(r.x - 90 * off, r.y + 140 * off); ctx.scale(sc, sc); squash(r.h, r.bank); G.Planes.silhouette(ctx, pl, 'rgba(0,0,0,0.28)'); ctx.restore();
  ctx.save(); ctx.translate(r.x, r.y); ctx.scale(sc * 1.18, sc * 1.18); squash(r.h, r.bank); G.Planes.silhouette(ctx, pl, `rgba(94,200,229,${air ? 0.55 : 0.4})`); ctx.restore();
  ctx.save(); ctx.translate(r.x, r.y); ctx.scale(sc, sc); squash(r.h, r.bank); G.Planes.draw(ctx, pl, state.t); ctx.restore();
  ctx.restore();
}
// screen-space overlays for your rival: a name tag over the plane when it's on screen, an edge arrow when it isn't
function drawRivalTag(cam, zoom) {
  const r = rivalNow(); if (!r) return;
  const name = rival.label || 'RIVAL', p = state.plane;
  const sx = (r.x - cam.x) * zoom + W / 2, sy = (r.y - cam.y) * zoom + H / 2, m = 52 * dpr;
  if (sx > -30 * dpr && sx < W + 30 * dpr && sy > -30 * dpr && sy < H + 30 * dpr) {
    const what = r.kind === 'ground' ? 'ON THE GROUND' : r.kind === 'down' ? 'GOING DOWN' : r.kind === 'through' ? 'THROUGH THE GATE' : (rival.plane && rival.plane.reg) || '';
    ctx.save(); ctx.globalAlpha = r.alpha == null ? 1 : Math.max(0.3, r.alpha);
    pill(what ? `${name} · ${what}` : name, sx, sy - 70 * zoom - 12 * dpr, RIVAL, 13 * dpr);
    ctx.restore();
    if (sx > 0 && sx < W && sy > 0 && sy < H) return;   // the plane itself is on screen
  }
  if (r.kind === 'ground') return;   // still on the strip: the radar shows it, no need to point back at it all flight
  const a = Math.atan2(sy - H / 2, sx - W / 2), ca = Math.cos(a), sa = Math.sin(a);
  const reach = Math.min((W / 2 - m) / Math.max(Math.abs(ca), 1e-3), (H / 2 - m) / Math.max(Math.abs(sa), 1e-3));   // where the line toward them leaves the screen
  const ex = W / 2 + ca * reach;
  let ey = clamp(H / 2 + sa * reach, 80 * dpr, H - m);
  if (ex < 250 * dpr) ey = Math.max(ey, 160 * dpr);                                   // keep clear of the gauges (top left)
  if (ex > W - 230 * dpr) ey = Math.min(ey, H - 250 * dpr);                           // and of the radar (bottom right)
  const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 200);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.scale(1.3 * pulse + 0.2, 1.3 * pulse + 0.2);
  ctx.fillStyle = RIVAL; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(20 * dpr, 0); ctx.lineTo(-12 * dpr, -13 * dpr); ctx.lineTo(-5 * dpr, 0); ctx.lineTo(-12 * dpr, 13 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  const miles = (Math.hypot(r.x - p.x, r.y - p.y) / PX_PER_MILE).toFixed(1);
  pill(`${name} ${miles} mi`, ex - Math.cos(a) * 44 * dpr, clamp(ey - Math.sin(a) * 34 * dpr, 24 * dpr, H - 20 * dpr), RIVAL, 12 * dpr);
}
function drawBolts() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of state.world.bolts) {
    const a = boltAlpha(b); if (a <= 0.01) continue;
    const g = ctx.createRadialGradient(b.gx, b.gy, 0, b.gx, b.gy, b.glow);
    g.addColorStop(0, `rgba(150,170,255,${0.45 * a})`); g.addColorStop(1, 'rgba(150,170,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.gx, b.gy, b.glow, 0, TAU); ctx.fill();
    for (const [col, al, wk] of [['120,150,255', 0.18, 7], ['190,210,255', 0.5, 2.6], ['255,255,255', 1, 1]]) {
      for (const q of b.paths) {
        ctx.strokeStyle = `rgba(${col},${a * al * q.k})`; ctx.lineWidth = q.w * wk;
        ctx.beginPath(); q.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function draw() {
  const s = state, w = s.world, p = s.plane;
  const r = canvas.getBoundingClientRect();
  dpr = G.Quality.dpr();
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
  const photo = drawOcean(s, zoom);
  if (!waves) waves = wavePattern();
  if (!photo) { ctx.save(); ctx.fillStyle = waves; ctx.translate(Math.sin(s.t * 0.3) * 20, 0); ctx.fillRect(s.cam.x - W / zoom, s.cam.y - H / zoom, W / zoom * 2, H / zoom * 2); ctx.restore(); }
  const glint = ctx.createRadialGradient(s.cam.x - 900, s.cam.y - 300, 50, s.cam.x - 900, s.cam.y - 300, 1400);
  glint.addColorStop(0, 'rgba(233,139,78,0.32)'); glint.addColorStop(0.35, 'rgba(123,56,70,0.18)'); glint.addColorStop(1, 'rgba(123,56,70,0)');
  ctx.fillStyle = glint; ctx.fillRect(s.cam.x - W / zoom, s.cam.y - H / zoom, W / zoom * 2, H / zoom * 2);

  for (const is of w.islands) drawIsland(is);
  for (const c of w.cells) drawCellShadow(c);
  for (const c of w.clouds) drawCloud(c, true);
  drawBirdShadows(s.t);
  drawGate(s.t);
  const rv = rivalNow();
  if (rv && rv.kind === 'ground') drawRivalPlane(rv);
  for (const c of w.cells) drawCell(c);
  drawFlocks(s.t);
  ctx.save(); ctx.strokeStyle = 'rgba(230,240,250,0.35)'; ctx.lineWidth = 3;
  for (const sk of w.streaks) { const l = 180, k = 1 - sk.life / 0.6; const x = sk.x + Math.cos(sk.a) * 900 * k, y = sk.y + Math.sin(sk.a) * 900 * k; ctx.globalAlpha = sk.life / 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(sk.a) * l, y - Math.sin(sk.a) * l); ctx.stroke(); }
  ctx.restore();
  if (rv && rv.kind !== 'ground') drawRivalPlane(rv);

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
  drawBolts();

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
  drawRivalTag(s.cam, zoom);
  drawRadar();
}

const fogs = Array.from({ length: 6 }, () => ({ x: Math.random() * 2, y: Math.random(), w: 0.5 + Math.random() * 0.5, a: 0.05 + Math.random() * 0.05, sp: 0.6 + Math.random() }));
function screenFog(t, zoom) {
  if (G.Quality.lite) return;
  const cam = state.cam;
  for (const f of fogs) {
    const fx = (((f.x * W - cam.x * zoom * 0.35 * f.sp + t * 18 * dpr) % (W * 2)) + W * 2) % (W * 2) - W * 0.5;
    const fy = (((f.y * H - cam.y * zoom * 0.35 * f.sp) % H) + H) % H, fw = f.w * W;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.5);
    g.addColorStop(0, `rgba(235,175,165,${f.a})`); g.addColorStop(1, 'rgba(235,175,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy, fw * 0.5, fw * 0.16, 0, 0, TAU); ctx.fill();
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

// ---------- first-timer help: a short card before your first flight, and a hint as each flight starts ----------
const coarse = () => matchMedia('(pointer: coarse)').matches;
function showHowto() {
  const touch = coarse();
  const lines = [
    touch ? '<b>Steer</b> with the ◀ and ▶ buttons.' : '<b>Steer</b> with the Left and Right arrow keys (or A and D).',
    touch ? '<b>Throttle</b> with the + and − buttons. More throttle is faster but burns fuel.' : '<b>Throttle</b> with the Up and Down arrow keys (or W and S). More throttle is faster but burns fuel.',
    '<b>Follow the gold arrow.</b> Stay out of the storm and dodge the birds.',
    rival ? '<b>First through the finish gate wins.</b>' : '<b>Fly through the finish gate</b> to escape.',
  ];
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,8,12,.5)';
  box.innerHTML = `<div style="max-width:440px;width:100%;box-sizing:border-box;background:rgba(10,16,22,.94);border:1px solid rgba(244,184,96,.55);border-radius:16px;padding:18px 20px 20px;color:#f3efe6;box-shadow:0 12px 40px rgba(0,0,0,.6)">
    <div style="font:400 34px 'Bebas Neue',sans-serif;letter-spacing:.05em;color:#f4b860;margin-bottom:4px">How to fly</div>
    <ul style="margin:0 0 18px;padding-left:20px;font:16px/1.45 system-ui,sans-serif">${lines.map(l => `<li style="margin:7px 0">${l}</li>`).join('')}</ul>
    <button type="button" style="display:block;width:100%;min-height:60px;border:0;border-radius:12px;background:#f4b860;color:#1a1208;font:400 34px 'Bebas Neue',sans-serif;letter-spacing:.1em;cursor:pointer">GO</button></div>`;
  box.querySelector('button').addEventListener('click', e => { e.preventDefault(); closeHowto(); });
  $('flight').appendChild(box); hud.howto = box;
}
function closeHowto() {
  if (!state || !state.howto) return;
  state.howto = false; seenHowto = true;
  try { localStorage.setItem('n4968n-flight-howto', '1'); } catch (e) {}
  if (hud.howto) { hud.howto.remove(); hud.howto = null; }
  lastT = performance.now();
}
function showHint() {
  if (hud.hint) hud.hint.remove();
  const touch = coarse(), el = document.createElement('div');
  el.style.cssText = `position:absolute;left:50%;bottom:${touch ? 230 : 22}px;transform:translateX(-50%);z-index:4;pointer-events:none;background:rgba(10,16,22,.82);border:1px solid rgba(255,255,255,.2);border-radius:18px;padding:8px 16px;color:#f3efe6;font:600 14px/1.35 system-ui,sans-serif;text-align:center;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;transition:opacity .6s`;
  el.innerHTML = (touch ? '◀ ▶ steer · − + throttle' : '← → steer · ↑ ↓ throttle') + ' · follow the <b style="color:#f4b860">gold arrow</b>';
  $('flight').appendChild(el); hud.hint = el;
  setTimeout(() => { el.style.opacity = '0'; }, 6000);
  setTimeout(() => { el.remove(); if (hud.hint === el) hud.hint = null; }, 6800);
}
function clearHud() { for (const k of ['howto', 'hint']) if (hud[k]) { hud[k].remove(); hud[k] = null; } }

let looping = false;
function step(dt) {
  if (state.howto) { pausedMs += dt * 1000; return; }   // the clock waits while you read the card (your rival's too)
  rivalTick(dt);
  if (state.intro > 0) { state.intro -= dt; if (state.intro <= 0) { say('Climbing to 4,500 feet. Follow the gold arrow.', 3); showHint(); } }
  else update(dt);
}
function frame(t) {
  if (!running) { looping = false; return; }
  let left = Math.min(0.5, (t - lastT) / 1000 || 0); lastT = t;   // real time, in small steps, however slow the computer draws
  try { while (left > 1e-4 && running) { const d = Math.min(1 / 30, left); step(d); left -= d; } if (running) draw(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
setInterval(() => {   // keep flying if animation frames pause (background tab)
  if (!running) return;
  const now = performance.now();
  if (now - lastT > 200) { let left = Math.min(1, (now - lastT) / 1000); lastT = now; while (left > 0) { const d = Math.min(0.05, left); step(d); left -= d; } }
}, 120);

G.Flight = {
  // o: { seed, cfg, modeName, modeColor, plane:{kind,reg,stripe,paint}, voice, onDone(result), onPos?, rival? }
  // rival: { plane, label, plan?, startedAt? }: an online rival sends positions through rivalPos(); a bot brings a plan
  // (from botPlan) that flight.js flies with its own AI.
  start(o) {
    opts = o; rival = o.rival || null; keys = {};
    reset(o);
    clearHud();
    $('flight').classList.remove('hidden');
    if (o.resume) restore(o.resume);
    else if (!seenHowto) { state.howto = true; showHowto(); }
    startAudio();
    running = true; lastT = performance.now();
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  },
  // enough to pick the flight back up after a page reload
  snapshot() {
    if (!running || !state) return null;
    const s = state, p = s.plane;
    return { x: p.x, y: p.y, rot: p.rot, heading: s.heading, bank: s.bank, thr: s.thr, speed: s.speed, hull: s.hull, fuel: s.fuel, t: s.t, cam: s.cam, intro: s.intro };
  },
  stop() { running = false; stopAudio(); clearHud(); $('flight').classList.add('hidden'); $('fMsg').classList.remove('on'); },
  setRival(r) {
    if (r && rival) { if (rival.everPos) r.everPos = true; if (rival.pos && !r.pos) { r.pos = rival.pos; r.posAt = rival.posAt; } if (r.status == null) r.status = rival.status; }
    rival = r;
  },
  rivalPos(pos) {
    if (!rival) return;
    const now = performance.now();
    if (pos) {
      rival.everPos = true;
      if (!live || !rival.pos || now - rival.posAt > 1500) live = { x: pos.x, y: pos.y, h: pos.h || 0, vx: 0, vy: 0, bank: 0 };
      else { const dt = Math.max(0.03, (now - rival.posAt) / 1000); live.vx = clamp((pos.x - rival.pos.x) / dt, -400, 400); live.vy = clamp((pos.y - rival.pos.y) / dt, -400, 400); }
    }
    rival.pos = pos; rival.posAt = now;
  },
  setRivalStatus(text) { if (rival) rival.status = text; },
  botPlan,
  get running() { return running; },
  debug() { return state; },
  debugRival() { return { ai, live, rival, now: rivalNow() }; },
  debugFlock(p, h) { return newFlock(p, h); },
  debugStep(dt) { if (running) step(dt); },
  debugDraw() { if (running) draw(); },
};
})();
