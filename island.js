/* Story mode, Chapter 1: Landfall. Third person: you see your character walk the island.
   Five places joined into one map: the beach, the jungle trail, the clearing under the volcano, the river and the hunting grounds.
   Walk off the edge of a place (onto its gold arrow) to go to the next.
   In the clearing, two survivors are waiting. Gather wood, fronds, stones, bamboo and vine, fish the river, hunt the glade,
   and build the start of a village. Each step has a deadline: miss one and the volcano rumbles. Miss three and it blows. */
(() => {
'use strict';
const G = window.G = window.G || {};
const $ = s => document.querySelector(s);
const SAVE = 'n4968n-island';
const ui = () => G.StoryMode.ui;
const short = id => G.CHARS[id].short;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ASP = 3168 / 1344;

// ---------- the map. Positions are in panorama space (0..1 across and down), like camp.js ----------
// exits: walk onto one to travel; `in` is where you appear when you arrive through it.
const AREAS = {
  beach: {
    name: 'Beach', pano: 'assets/story/beach.jpg', depth: [0.97, 0.61], volcano: { x: 0.65, y: 0.145 },
    walkable: (x, y) => x > 0.02 && y < 0.97 && y > 0.61 && x < 0.64 + (y - 0.66) * 0.2 && !(x > 0.10 && x < 0.36 && y < 0.775),
    personH: y => 0.10 + (y - 0.61) * 0.62,
    title: 'Find a way inland', text: 'The plane is done. Smoke is rising from the mountain past the trees.',
    exits: [{ to: 'jungle', x: 0.445, y: 0.62, in: { x: 0.445, y: 0.66 }, label: 'Jungle trail' }],
    mats: [['wood', 0.52, 0.80], ['wood', 0.20, 0.90]],
    look: { plane: { x: 0.30, y: 0.75, gx: 0.38, gy: 0.80, text: ['N4968N. Not a scratch on her, and not a drop of fuel left in either tank. She isn’t flying anywhere.', 'Inland, the volcano breathes out a long grey plume.'], prompt: 'Space or tap: look at the plane' } },
  },
  jungle: {
    name: 'Jungle trail', pano: 'assets/story/jungle.jpg', depth: [0.97, 0.62], volcano: { x: 0.50, y: 0.20 },
    walkable: (x, y) => y < 0.97 && y > 0.62 && Math.abs(x - 0.515) < 0.02 + (y - 0.62) * 0.45,
    personH: y => 0.10 + (y - 0.62) * 0.7,
    title: 'Follow the trail inland', text: 'Toward the smoke.',
    exits: [{ to: 'clearing', x: 0.515, y: 0.635, in: { x: 0.515, y: 0.67 }, label: 'Clearing' }, { to: 'beach', x: 0.515, y: 0.965, in: { x: 0.515, y: 0.92 }, label: 'Beach' }],
    mats: [['vine', 0.40, 0.85]],
  },
  clearing: {
    name: 'Clearing', pano: 'assets/story/clearing.jpg', depth: [0.97, 0.58], volcano: { x: 0.41, y: 0.13 },
    walkable: (x, y) => x > 0.11 && y < 0.97 && y > 0.58 && x < 0.665 + (y - 0.6) * 0.18,
    personH: y => 0.08 + (y - 0.58) * 0.7,
    site: { x: 0.40, y: 0.74 },
    exits: [{ to: 'hunt', x: 0.125, y: 0.82, in: { x: 0.17, y: 0.82 }, label: 'Hunting grounds' }, { to: 'river', x: 0.70, y: 0.88, in: { x: 0.64, y: 0.88 }, label: 'River' }, { to: 'jungle', x: 0.40, y: 0.965, in: { x: 0.40, y: 0.92 }, label: 'Jungle trail' }],
    mats: [['wood', 0.20, 0.72], ['wood', 0.30, 0.92], ['wood', 0.52, 0.88], ['wood', 0.58, 0.66], ['frond', 0.17, 0.66], ['frond', 0.47, 0.64], ['frond', 0.26, 0.70],
      ['stone', 0.63, 0.74], ['stone', 0.56, 0.78], ['bamboo', 0.14, 0.92], ['vine', 0.36, 0.86]],
  },
  river: {
    name: 'River', pano: 'assets/story/river.jpg', depth: [0.97, 0.62], volcano: { x: 0.41, y: 0.13 },
    walkable: (x, y) => x > 0.09 && y < 0.97 && y > 0.62 && x < 0.45 + (y - 0.62) * 0.9,
    personH: y => 0.09 + (y - 0.62) * 0.7,
    title: 'The river', text: 'Stand on the rocks at the water and fish.',
    exits: [{ to: 'clearing', x: 0.095, y: 0.86, in: { x: 0.15, y: 0.86 }, label: 'Clearing' }],
    mats: [['stone', 0.30, 0.75], ['stone', 0.42, 0.86], ['stone', 0.22, 0.93], ['vine', 0.15, 0.70]],
    fishing: [{ id: 'fish1', gx: 0.50, gy: 0.71, wx: 0.57, wy: 0.665 }, { id: 'fish2', gx: 0.665, gy: 0.89, wx: 0.75, wy: 0.86 }],
  },
  hunt: {
    name: 'Hunting grounds', pano: 'assets/story/hunt.jpg', depth: [0.97, 0.55], volcano: { x: 0.465, y: 0.21 },
    walkable: (x, y) => x > 0.04 && x < 0.96 && y < 0.97 && y > 0.55,
    personH: y => 0.08 + (y - 0.55) * 0.66,
    title: 'The hunting grounds', text: 'Boar and jungle fowl. They bolt if you rush them.',
    exits: [{ to: 'clearing', x: 0.955, y: 0.85, in: { x: 0.90, y: 0.85 }, label: 'Clearing' }],
    mats: [['frond', 0.25, 0.66], ['bamboo', 0.10, 0.80], ['wood', 0.70, 0.64]],
    animals: [['boar', 0.35, 0.80], ['boar', 0.70, 0.70], ['fowl', 0.25, 0.90], ['fowl', 0.55, 0.62], ['fowl', 0.80, 0.92]],
  },
};
// where each place sits on the little map (column, row)
const MAP = { hunt: [0, 0], clearing: [1, 0], river: [2, 0], jungle: [1, 1], beach: [1, 2] };

const MATS = {
  wood:   { name: 'Wood',        img: 'log' },
  frond:  { name: 'Palm fronds', img: 'frond' },
  stone:  { name: 'Stones',      img: 'stone' },
  bamboo: { name: 'Bamboo',      img: 'bamboo' },
  vine:   { name: 'Vine',        img: 'vine' },
  fish:   { name: 'Fish',        img: 'fish' },
  meat:   { name: 'Meat',        img: 'meat' },
};
const ANIMALS = {
  boar: { name: 'boar', h: 0.11, speed: 0.05, run: 0.16, meat: 2, odds: [0.85, 0.35] },
  fowl: { name: 'jungle fowl', h: 0.08, speed: 0.04, run: 0.13, meat: 1, odds: [0.8, 0.3] },
};
// the milestones, in order. time: seconds before the volcano runs out of patience.
const BUILDS = [
  { id: 'shelter', name: 'Shelter', verb: 'Build a shelter', need: { wood: 3, frond: 2 }, time: 180, at: [-0.10, -0.01], h: 0.15,
    done: 'A roof. A real one. Whatever happens tonight, you’ll be dry.' },
  { id: 'firepit', name: 'Fire pit', verb: 'Build a fire pit', need: { stone: 4, wood: 1 }, time: 180, at: [0.0, 0.04], h: 0.07,
    done: 'Fire. Smoke from the clearing now, not just from the mountain.' },
  { id: 'meal', name: 'Meal', verb: 'Cook a meal', need: { fish: 2, meat: 1 }, time: 240, noPlace: true,
    done: 'Fish and boar over the fire. For the first time in days, nobody talks about the mountain.' },
  { id: 'water', name: 'Rain catcher', verb: 'Build a rain catcher', need: { bamboo: 2, vine: 2 }, time: 180, at: [0.11, -0.01], h: 0.17,
    done: 'Fresh water. The others actually cheer.' },
];
const RUMBLES = ['', 'The volcano rumbles. The ground shivers under your feet.', 'The volcano roars. Ash starts to fall.'];
const WEAPON = { ivy: 'vine whip', wren: 'machete', elias: 'fern', kip: 'camera flash', briar: 'slingshot' };

let I = null, scene = null, mine = 0, busy = false, smoke = [], ash = [], travelCool = 0;

// ---------- the volcano: smoke that thickens, a glow that reddens, ash, and the ground shaking ----------
function rumbleSound(level) {
  const S = G.Sfx;
  if (!S.ctx || S.muted) return;
  S.tone(0, S.t, 2.6 + level, 34, 'sine', 0.7 + level * 0.2, 24);
  S.burst(0, S.t, 2 + level, 110, 'lowpass', 0.5 + level * 0.25);
  S.burst(0, S.t + 0.4, 1.2, 60, 'lowpass', 0.4);
}
function under(ctx, c, toScreen, W, H, t) {
  const v = AREAS[I.area].volcano;
  if (!v) return;
  const [vx, vy] = toScreen(c, v.x, v.y), k = c.k * c.ph;
  const lvl = I.rumble;
  if (lvl) {   // the crater glows
    const r = k * (0.06 + lvl * 0.05) * (1 + Math.sin(t * 3) * 0.1);
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    g.addColorStop(0, `rgba(255,${120 - lvl * 30},40,${0.25 + lvl * 0.18})`); g.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(vx - r, vy - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
  }
  if (Math.random() < 0.25 + lvl * 0.35) smoke.push({ x: v.x + (Math.random() - 0.5) * 0.01, y: v.y, r: 0.012 + Math.random() * 0.01, a: 0.35 + lvl * 0.12, vy: 0.012 + lvl * 0.01, vx: 0.004 + Math.random() * 0.004 });
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.y -= p.vy / 60; p.x += p.vx / 60; p.r += 0.0006 * (1 + lvl); p.a -= 0.0018;
    if (p.a <= 0 || p.y < -0.1) { smoke.splice(i, 1); continue; }
    const [sx, sy] = toScreen(c, p.x, p.y), r = p.r * k;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    const tone = lvl > 1 ? '70,60,58' : '150,145,140';
    g.addColorStop(0, `rgba(${tone},${p.a})`); g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }
}
function over(ctx, c, toScreen, W, H) {
  const lvl = I.rumble;
  if (lvl >= 2) {   // ash drifting down, and the light going grey-orange
    if (Math.random() < 0.8) ash.push({ x: Math.random() * W, y: -10, s: 1 + Math.random() * 2, v: 30 + Math.random() * 40 });
    ctx.fillStyle = 'rgba(200,190,180,0.7)';
    for (let i = ash.length - 1; i >= 0; i--) {
      const a = ash[i]; a.y += a.v / 60; a.x += Math.sin(a.y / 30) * 0.4;
      if (a.y > H) { ash.splice(i, 1); continue; }
      ctx.fillRect(a.x, a.y, a.s, a.s);
    }
    ctx.fillStyle = 'rgba(120,60,30,0.16)'; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- fishing: cast, wait for the bobber to dip, then reel in fast ----------
function fishOver(ctx, c, toScreen, W, H, t) {
  const f = I.fish;
  if (!f) return;
  const [sx, sy] = toScreen(c, f.spot.wx, f.spot.wy), k = c.k * c.ph;
  const dip = f.phase === 'bite' ? 4 + Math.sin(t * 30) * 3 : Math.sin(t * 3) * 1.5;
  // the line from your hand to the bobber
  const [mx, my] = toScreen(c, G.Camp.me.x, G.Camp.me.y - AREAS.river.personH(G.Camp.me.y) * 0.7);
  ctx.strokeStyle = 'rgba(240,240,230,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo((mx + sx) / 2, Math.min(my, sy) - 40, sx, sy + dip); ctx.stroke();
  if (f.phase === 'bite') {   // ripples
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) { const r = ((t * 40 + i * 12) % 36) + 4; ctx.beginPath(); ctx.ellipse(sx, sy + 3, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.fillStyle = '#e8473a'; ctx.beginPath(); ctx.arc(sx, sy + dip, Math.max(3, k * 0.006), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy + dip - Math.max(2, k * 0.004), Math.max(2, k * 0.004), Math.PI, 0); ctx.fill();
  if (f.phase === 'bite') { ctx.font = '700 34px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd970'; ctx.fillText('!', sx, sy - 30); }
}
function startFishing(spot) {
  const me = G.Camp.me;
  I.fish = { spot, phase: 'wait', t: 2 + Math.random() * 4, x0: me.x, y0: me.y };
  G.Camp.say('Cast. Wait for the bite, then reel in!');
  act('Reel in');
}
function reel() {
  const f = I.fish;
  if (!f) return;
  if (f.phase === 'bite') { I.inv.fish++; G.Sfx.pop(); G.Camp.say('Got one! +1 fish'); hud(); }
  else G.Camp.say('Too soon. It swam off.');
  stopFishing();
}
function stopFishing() { I.fish = null; act(null); }
function fishTick(dt) {
  const f = I.fish;
  if (!f) return;
  const me = G.Camp.me;
  if (Math.hypot(me.x - f.x0, me.y - f.y0) > 0.01) { stopFishing(); return; }   // walked off
  f.t -= dt;
  if (f.phase === 'wait' && f.t <= 0) { f.phase = 'bite'; f.t = 0.9; G.Sfx.burst(0, G.Sfx.t, 0.15, 900, 'bandpass', 0.4); }
  else if (f.phase === 'bite' && f.t <= 0) { G.Camp.say('It got away. Cast again.'); stopFishing(); }
}

// ---------- hunting: animals wander, bolt if you rush them, and are easier to catch while calm ----------
function animalTick(dt) {
  const me = G.Camp.me, A = AREAS[I.area];
  for (const a of Object.values(scene.things)) {
    if (!a.animal) continue;
    if (a.off) { if ((a.back -= dt) <= 0) { a.off = false; a.x = 0.2 + Math.random() * 0.6; a.y = 0.62 + Math.random() * 0.3; } continue; }
    const kind = ANIMALS[a.animal];
    const dx = (a.x - me.x) * ASP, dy = a.y - me.y, d = Math.hypot(dx, dy);
    if (d < 0.16 && me.gait > 0.5) { a.scared = 2.5; a.tx = clamp(a.x + dx / d * 0.25 / ASP, 0.06, 0.94); a.ty = clamp(a.y + dy / d * 0.2, 0.58, 0.95); }
    a.scared = Math.max(0, (a.scared || 0) - dt);
    if (!a.tx || Math.hypot((a.tx - a.x) * ASP, a.ty - a.y) < 0.01) {
      a.moving = false;
      if ((a.rest = (a.rest || 0) - dt) <= 0) { a.rest = 1.5 + Math.random() * 3; a.tx = clamp(a.x + (Math.random() - 0.5) * 0.25, 0.06, 0.94); a.ty = clamp(a.y + (Math.random() - 0.5) * 0.12, 0.58, 0.95); }
      continue;
    }
    const sp = (a.scared ? kind.run : kind.speed) * dt, mx = (a.tx - a.x) * ASP, my = a.ty - a.y, m = Math.hypot(mx, my);
    const nx = a.x + mx / m * sp / ASP, ny = a.y + my / m * sp;
    if (A.walkable(nx, ny)) { a.x = nx; a.y = ny; } else a.tx = null;
    a.moving = true; a.gait = a.scared ? 22 : 10; a.flip = mx < 0;
    a.gx = a.x; a.gy = Math.min(0.96, a.y + 0.015);
    a.h = kind.h * (A.personH(a.y) / 0.2);
    a.prompt = `Space or tap: hunt the ${kind.name}${a.scared ? ' (it’s spooked)' : ''}`;
  }
}
function hunt(a) {
  const kind = ANIMALS[a.animal];
  const ok = Math.random() < kind.odds[a.scared ? 1 : 0];
  const w = WEAPON[I.char] || 'weapon';
  if (ok) {
    I.inv.meat += kind.meat; a.off = true; a.back = 40;
    G.Sfx.thud(); G.Camp.say(`Your ${w} does the job. +${kind.meat} meat`);
    hud();
  } else {
    a.scared = 3; a.tx = clamp(a.x + (Math.random() < 0.5 ? -0.3 : 0.3), 0.06, 0.94); a.ty = a.y;
    G.Sfx.dud(); G.Camp.say(`The ${kind.name} bolts. Creep up slower.`);
  }
}

// ---------- an on-screen action button (for touch) ----------
function act(label) {
  const b = $('#isAct');
  b.classList.toggle('hidden', !label);
  if (label) b.textContent = label;
}

// ---------- the HUD: what you're working on, what you carry, where you are, and the mountain's patience ----------
function hud() {
  const b = BUILDS[I.stage];
  $('#isInv').innerHTML = Object.entries(MATS).map(([m, d]) => `<span class="${I.inv[m] ? 'has' : ''}" title="${d.name}"><img src="assets/story/${d.img}.png" alt="${d.name}">${I.inv[m]}</span>`).join('');
  $('#isMap').innerHTML = Object.entries(MAP).map(([id, [cx, cy]]) =>
    `<span class="${id === I.area ? 'here' : I.seen[id] ? 'seen' : ''}" style="grid-column:${cx + 1};grid-row:${cy + 1}">${I.seen[id] ? AREAS[id].name : '?'}</span>`).join('');
  if (!I.met[I.survivors[0]] || !b) {
    const A = AREAS[I.area];
    if (!b) G.Camp.hud('The start of a village', 'Shelter, fire, food and water. For tonight, that’s enough.');
    else if (I.area === 'clearing') G.Camp.hud(I.survivors.length ? `Talk to ${short(I.survivors[0])}` : 'The clearing', '');
    else G.Camp.hud(A.title || A.name, A.text || '');
    return;
  }
  const have = Object.entries(b.need).map(([m, n]) => `${MATS[m].name} ${Math.min(I.inv[m], n)}/${n}`).join(' · ');
  G.Camp.hud(b.verb, `${have}. ${b.noPlace ? 'Cook it at the fire pit.' : 'Then bring it all to the village site.'}`);
}
function meter() {
  const b = BUILDS[I.stage];
  const el = $('#smRun');
  if (!b || !I.met[I.survivors[0]]) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const left = Math.max(0, I.deadline);
  $('#smRunText').textContent = I.rumble ? `Volcano: ${['', 'rumbling', 'roaring'][I.rumble]} · ${Math.ceil(left)}s` : `Before the volcano stirs: ${Math.ceil(left)}s`;
  $('#smRunBar').style.transform = `scaleX(${left / b.time})`;
  $('#smRunBar').style.background = ['#f5aa4a', '#ff7a3d', '#ff3b2f'][I.rumble];
}

// ---------- moving around the map. Every place keeps its own state while you're away ----------
function thingsFor(area) {
  if (I.things[area]) return I.things[area];
  const A = AREAS[area], t = {};
  (A.mats || []).forEach(([m, x, y], i) => { t['m' + i] = { mat: m, x, y, gx: x, gy: Math.min(0.955, y + 0.02), h: 0.025 + A.personH(y) * 0.18, img: `assets/story/${MATS[m].img}.png`, prompt: `Space or tap: pick up ${MATS[m].name.toLowerCase()}` }; });
  A.exits.forEach((e, i) => { t['x' + i] = { exit: e, x: e.x, y: e.y, gx: e.x, gy: e.y, mark: true, prompt: `→ ${e.label}` }; });
  for (const [id, l] of Object.entries(A.look || {})) t[id] = { ...l, mark: true };
  (A.fishing || []).forEach(f => { t[f.id] = { spot: f, x: f.wx, y: f.wy, gx: f.gx, gy: f.gy, mark: true, prompt: 'Space or tap: fish here' }; });
  (A.animals || []).forEach(([k, x, y], i) => { t['a' + i] = { animal: k, x, y, gx: x, gy: y + 0.015, h: ANIMALS[k].h, img: `assets/story/${k}.png`, prompt: '' }; });
  if (area === 'clearing') t.site = { x: A.site.x, y: A.site.y, gx: A.site.x, gy: A.site.y + 0.04, mark: true, prompt: 'Space or tap: build at the village site' };
  return (I.things[area] = t);
}
function enter(area, at) {
  I.area = area; I.seen[area] = true;
  stopFishing();
  const A = AREAS[area];
  smoke = []; ash = [];
  scene = {
    firstPerson: false, flies: false, tint: ['#e8c9a0', 0.12], heart: false,
    pano: A.pano, aspect: ASP, depth: A.depth, start: at || A.exits[0].in, walkable: A.walkable, personH: A.personH,
    backEdge: x => { for (let y = A.depth[1]; y < A.depth[0]; y += 0.005) if (A.walkable(x, y)) return y; return A.depth[0]; },
    things: thingsFor(area), actors: I.actors[area] || [], byId: {}, use, tick, under, over: (ctx, c, ts, W, H, t) => { over(ctx, c, ts, W, H); if (I.area === 'river') fishOver(ctx, c, ts, W, H, t); },
    paused: false, shake: 0,
  };
  scene.actors.forEach(a => { scene.byId[a.char] = a; });
  ui().setScene(scene);
  G.Camp.start({ char: I.char, role: 'Chapter 1: Landfall', title: '', text: '', scene });
  travelCool = 1;
  hud(); meter();
}
async function travel(exit) {
  if (I.traveling) return;
  I.traveling = true;
  const back = AREAS[exit.to].exits.find(e => e.to === I.area);
  await fade(() => enter(exit.to, back ? back.in : null));
  I.traveling = false;
  if (exit.to === 'clearing' && !I.met.arrived) arriveClearing();
}
async function fade(fn) {
  const f = $('#runFade');
  f.classList.remove('hidden'); void f.offsetWidth; f.style.transition = 'opacity .45s'; f.style.opacity = '1';
  await ui().wait(480);
  fn();
  f.style.opacity = '0';
  setTimeout(() => { f.classList.add('hidden'); f.style.opacity = ''; f.style.transition = ''; }, 480);
}

// ---------- the survivors and the village site ----------
function place(b) {
  if (b.noPlace) return;
  const s = AREAS.clearing.site;
  I.things.clearing['b-' + b.id] = { built: true, x: s.x + b.at[0], y: s.y + b.at[1], gx: s.x + b.at[0], gy: s.y + b.at[1] + 0.03, h: b.h, img: `assets/story/${b.id}.png`, prompt: `Your ${b.name.toLowerCase()}` };
}
async function arriveClearing() {
  I.met.arrived = true;
  const pool = ['kip', 'wren', 'elias', 'ivy', 'briar'].filter(c => c !== I.char).slice(0, 2);
  I.survivors = pool;
  const t = I.things.clearing;
  pool.forEach((c, i) => {
    const x = i ? 0.55 : 0.24, y = 0.73;
    const a = { char: c, x, y, face: i ? -1 : 1, label: short(c) };
    scene.actors.push(a); scene.byId[c] = a;
    t[c] = { x, y, h: 0.2, gx: x + (i ? -0.04 : 0.04), gy: y + 0.02, prompt: `Space or tap: talk to ${short(c)}` };
  });
  I.actors.clearing = scene.actors;
  busy = true;
  await ui().line(null, 'The trees open up. A clearing, a stream, and the volcano filling half the sky. Two people stand up from a smoky little fire.');
  if (mine !== ui().run) return;
  ui().closePanel(); busy = false; hud();
  G.Camp.say(`Talk to ${short(pool[0])}.`);
}
const MEET = {
  first: (c, other) => [
    `${short(c)}? No. You can’t be... you’re alive. We saw the plane come down and thought that was it.`,
    `${short(other)} and I washed up here three days ago. Nobody else. Just us, the bugs, and that.`,
    'That mountain grumbles when we’re slow. Don’t ask me how, but it does. Shelter first, then a fire, then food, then water.',
  ],
  second: () => 'Wood and fronds all over this clearing. Stones down at the river, through the gap on the right. Boar and fowl in the glade on the left. Fish in the river.',
};
async function talk(id) {
  const first = !I.met[id];
  I.met[id] = true;
  if (id === I.survivors[0] && first) {
    for (const l of MEET.first(id, I.survivors[1])) { await ui().line(id, l); if (mine !== ui().run) return; }
    const c = await ui().ask(id, 'Will you stay and help us build?', [{ text: 'We build it together.' }, { text: 'Just until I find a way off this rock.' }]);
    if (mine !== ui().run) return;
    I.promise = c === 0 ? 'together' : 'leaving';
    await ui().line(id, c === 0 ? 'Then it’s a village, not a camp. I like the sound of that.' : 'Fair. Help us survive the week first.');
    I.deadline = BUILDS[0].time;
  } else if (first) {
    await ui().line(id, MEET.second());
    const c = await ui().ask(id, 'I can keep gathering while you build, if you want.', [{ text: 'Yes. Bring me wood.' }, { text: 'Stay here and keep watch on the mountain.' }]);
    if (mine !== ui().run) return;
    I.helper = c === 0 ? id : null;
    await ui().line(id, c === 0 ? 'On it. I’ll drop whatever I find in your pile.' : 'Watching. If it starts to glow, I’m yelling.');
  } else {
    const b = BUILDS[I.stage];
    await ui().line(id, b ? `${b.verb} next. You need ${Object.entries(b.need).map(([m, n]) => `${n} ${MATS[m].name.toLowerCase()}`).join(' and ')}.` : 'Look at it. A village. Almost.');
  }
}
async function build() {
  const b = BUILDS[I.stage];
  if (!b) { await ui().line(null, 'Shelter, fire, food, water. The start of a village.'); return; }
  if (!I.met[I.survivors[0]]) { await ui().line(null, `Talk to ${short(I.survivors[0])} first.`); return; }
  const missing = Object.entries(b.need).filter(([m, n]) => I.inv[m] < n).map(([m, n]) => `${n - I.inv[m]} more ${MATS[m].name.toLowerCase()}`);
  if (missing.length) { await ui().line(null, `Not enough to ${b.verb.toLowerCase()} yet. You need ${missing.join(' and ')}.`); return; }
  const c = await ui().ask(null, `${b.verb} here?`, [{ text: `${b.verb.split(' ')[0]} it (${Object.entries(b.need).map(([m, n]) => `${n} ${MATS[m].name.toLowerCase()}`).join(', ')})` }, { text: 'Not yet.' }]);
  if (mine !== ui().run || c !== 0) return;
  for (const [m, n] of Object.entries(b.need)) I.inv[m] -= n;
  I.built[b.id] = true; place(b);
  G.Sfx.thud(); G.Sfx.pop();
  await ui().line(null, b.done);
  if (mine !== ui().run) return;
  I.stage++;
  if (I.rumble) { I.rumble--; G.Camp.say('The mountain settles. For now.'); }
  if (BUILDS[I.stage]) I.deadline = BUILDS[I.stage].time;
  hud(); meter();
  if (!BUILDS[I.stage]) { await ui().wait(900); if (mine === ui().run) villageDone(); }
}

// ---------- using whatever you're standing next to ----------
async function use(id) {
  if (busy || ui().cooling()) return;
  const t = scene.things[id];
  if (!t) return;
  if (t.exit) { travel(t.exit); return; }
  if (t.mat) { I.inv[t.mat]++; t.off = true; t.back = 30; G.Sfx.pop(); G.Camp.say(`+1 ${MATS[t.mat].name.toLowerCase()}`); hud(); return; }
  if (t.spot) { if (I.fish) reel(); else startFishing(t.spot); return; }
  if (t.animal) { hunt(t); return; }
  busy = true;
  const at = mine;
  if (t.text) { for (const l of t.text) { await ui().line(null, l); if (at !== ui().run) return; } }
  else if (id === 'site') await build();
  else if (I.survivors.includes(id)) { scene.focus = t.x; await talk(id); scene.focus = undefined; }
  else if (t.built) await ui().line(null, BUILDS.find(b => 'b-' + b.id === id).done);
  if (at !== ui().run) return;
  ui().closePanel(); busy = false; hud(); meter();
}

// ---------- every frame ----------
let helpT = 0;
function tick(dt, me) {
  travelCool = Math.max(0, travelCool - dt);
  // walking onto a gold arrow takes you there
  if (!travelCool && !I.traveling && !busy) for (const t of Object.values(scene.things)) if (t.exit && Math.hypot((me.x - t.x) * ASP, me.y - t.y) < 0.03) { travel(t.exit); break; }
  for (const t of Object.values(scene.things)) if (t.mat && t.off && (t.back -= dt) <= 0) t.off = false;   // more washes up, more falls
  // materials left in other places grow back too
  for (const [area, things] of Object.entries(I.things)) if (area !== I.area) for (const t of Object.values(things)) if (t.mat && t.off && (t.back -= dt) <= 0) t.off = false;
  if (I.area === 'river') fishTick(dt);
  if (I.area === 'hunt') animalTick(dt);
  scene.shake = Math.max(I.rumble * 1.2, scene.shake - dt * 10);
  if (I.helper && BUILDS[I.stage] && (helpT += dt) > 25) { helpT = 0; I.inv.wood++; G.Camp.say(`${short(I.helper)} adds some wood to your pile. +1 wood`); hud(); }
  if (busy || I.traveling || !BUILDS[I.stage] || !I.met[I.survivors[0]]) { meter(); return; }   // the clock starts once you know the plan
  I.deadline -= dt;
  if (I.deadline <= 0) {
    I.rumble++;
    scene.shake = 10 + I.rumble * 6;
    rumbleSound(I.rumble);
    if (I.rumble >= 3) { erupt(); return; }
    G.Camp.say(RUMBLES[I.rumble]);
    I.deadline = 75;
  }
  meter();
}

async function erupt() {
  busy = true; scene.paused = true; stopFishing();
  G.Sfx.bang(); rumbleSound(3);
  scene.shake = 26;
  await ui().wait(1600);
  if (mine !== ui().run) return;
  $('#smRun').classList.add('hidden');
  await ui().card(`<p class="role">Chapter 1: Landfall</p><h2>The mountain blew</h2>
    <p>The sky went black at noon. You ran for the beach with whatever you could carry.</p>
    <p>The island gave you three warnings. Next time, build faster.</p>`, 'Try again');
  if (mine === ui().run) api.start(I.char);
}

function villageDone() {
  const built = BUILDS.filter(b => I.built[b.id] && !b.noPlace).map(b => b.name.toLowerCase());
  try { localStorage.setItem(SAVE, JSON.stringify({ chapter: 1, char: I.char, built: I.built, rumble: I.rumble, survivors: I.survivors, promise: I.promise })); } catch (e) {}
  $('#smRun').classList.add('hidden'); act(null);
  ui().card(`<p class="role">End of Chapter 1</p><h2>Landfall</h2>
    <ul>
      <li><b>Your village</b>${built.join(', ')}, and a first meal by the fire</li>
      <li><b>Survivors</b>You, ${I.survivors.map(short).join(' and ')}</li>
      <li><b>Your promise</b>${I.promise === 'leaving' ? 'Only until you find a way off the island.' : 'You build it together.'}</li>
      <li><b>The volcano</b>${['Quiet. You never gave it a reason.', 'It rumbled once. They noticed.', 'It roared. There’s ash on everything.'][I.rumble]}</li>
    </ul>
    <p>Chapter 2 will bring more survivors, more buildings, and a mountain that is not finished.</p>
    <button type="button" class="hero-btn" id="isAgain">Play again</button>
    <button type="button" class="link" id="isMenu">Main menu</button>`);
  $('#isAgain').addEventListener('click', () => { $('#smCard').classList.add('hidden'); api.start(I.char); });
  $('#isMenu').addEventListener('click', () => G.toMenu());
}

const api = G.Island = {
  async start(char) {
    ui().build();
    G.useStoryArt(true);
    mine = ui().newRun();
    busy = false; helpT = 0;
    I = { char, area: 'beach', inv: { wood: 0, frond: 0, stone: 0, bamboo: 0, vine: 0, fish: 0, meat: 0 }, built: {}, stage: 0, rumble: 0, deadline: 0,
      met: {}, survivors: [], helper: null, promise: '', things: {}, actors: {}, seen: {}, fish: null, traveling: false };
    G.Intro.stop();
    $('#menu').classList.add('hidden');
    $('#sm').classList.remove('hidden');
    $('#smQuit').classList.remove('hidden');
    $('#smTalk').classList.add('hidden');
    for (const [id, tag] of [['isInv', 'div'], ['isMap', 'div'], ['isAct', 'button']]) if (!$('#' + id)) {
      const d = document.createElement(tag); d.id = id; if (tag === 'button') { d.type = 'button'; d.className = 'hidden'; d.addEventListener('click', reel); } $('#sm').appendChild(d);
    }
    enter('beach', { x: 0.42, y: 0.86 });
    scene.paused = true;
    $('#smCard').style.background = 'linear-gradient(180deg, rgba(6,4,12,.15), rgba(6,4,12,.88) 62%), url(assets/story/beach.jpg) center/cover';
    await ui().card(`<p class="role">Chapter 1</p><h2>Landfall</h2>
      <p>The storm spat you out over open water. The fuel ran out. You put her down on the first sand you saw.</p>
      <p>No boats. No radio. A jungle, a river, a mountain, and smoke rising from somewhere inland.</p>`, 'Climb out');
    $('#smCard').style.background = '';
    if (mine !== ui().run) return;
    scene.paused = false;
    G.Camp.say('Walk around. Follow the gold arrows to explore.');
  },
  debug() { return { I, scene }; },
};
})();
