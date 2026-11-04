/* N4968N cockpit race: rules, controls, race flow and screens. Plain JavaScript, no build step. */
(() => {
'use strict';
const G = window.G;
const { Sfx, Net } = G;

// ---------- Tuning: change these to make the race easier or harder ----------
// ---------- Difficulty modes: every number that changes with the mode lives here ----------
// jungleClock: seconds before zombies swarm the trails. cockpitClock: seconds from climbing in until they reach the plane.
// Jungle zombies trickle in, then come in waves at 50% and 80% of the jungle clock; at zero they pour out of the trees.
// In the cockpit they reach the windows at 50% and bang on the glass at 80% of the cockpit clock.
const MODES = G.MODES = {
  easy: {
    name: 'Clear Skies', tag: 'The fever’s still miles away.', color: '#5ec8e5',
    jungleClock: 300, cockpitClock: 120, penalty: 2, hintAfter: 0, cardHighlight: true,
    swarms: 5, swarmFever: 6, zombies: 6, zombieSpeed: 0.75, startAwake: 0.4, wave: 3, pour: 8,
    smokeAfter: 20, signs: true, radio: 1.4, planeHint: true,
    // fighting back: seconds to react to a lunge, seconds between attacks, chance two lunge together
    counterWindow: 0.8, counterCooldown: 1, pairLunge: 0,
    // health: lost per bite, lost per second while the fever is 80%+, fever after respawning
    bite: 25, feverDrain: 1.5, respawnFever: 30,
    // the bot rival: jungle speed (1 = your running speed), chance of a wrong turn, seconds per cockpit action,
    // chance of a cockpit mistake, chance of beating a zombie
    routeRange: [1900, 2700],   // how long the real trail from camp to the strip may be (pixels)
    botSpeed: 0.7, botDetour: 0.5, botStep: 1.7, botMistake: 0.3, botFight: 0.5,
  },
  medium: {
    name: 'Crosswind', tag: 'They’re closer than you think.', color: '#f5aa4a',
    jungleClock: 210, cockpitClock: 90, penalty: 3, hintAfter: 5, cardHighlight: true,
    swarms: 9, swarmFever: 9, zombies: 11, zombieSpeed: 1, startAwake: 0.6, wave: 5, pour: 12,
    smokeAfter: 45, signs: true, radio: 1,
    counterWindow: 0.5, counterCooldown: 1.5, pairLunge: 0,
    bite: 34, feverDrain: 2.5, respawnFever: 30,
    routeRange: [2200, 3200],
    botSpeed: 0.85, botDetour: 0.3, botStep: 1.05, botMistake: 0.14, botFight: 0.7,
  },
  hard: {
    name: 'Mayday', tag: 'Patient zero is already at the airstrip.', color: '#ff5a4f',
    jungleClock: 135, cockpitClock: 60, penalty: 5, hintAfter: Infinity, cardHighlight: false,
    swarms: 15, swarmFever: 12, zombies: 15, zombieSpeed: 1.35, startAwake: 1, wave: 7, pour: 16,
    smokeAfter: 90, signs: false, radio: 0.45,
    counterWindow: 0.3, counterCooldown: 2, pairLunge: 0.35,
    bite: 50, feverDrain: 4, respawnFever: 30,
    routeRange: [2600, 4000],
    botSpeed: 1.0, botDetour: 0.12, botStep: 0.6, botMistake: 0.04, botFight: 0.9,
  },
};
let modeKey = 'medium';
try { const m = localStorage.getItem('n4968n-mode'); if (MODES[m]) modeKey = m; } catch (e) {}
const M = () => MODES[modeKey];
let RACE_TIME = M().cockpitClock;   // seconds until the zombies overrun the airstrip (set from the mode)
const FLOOD_WAIT = 7;   // seconds to wait after over-priming
const VR = { 0: 55, 10: 55, 20: 60, 30: 65 };            // knots needed to lift off, by flap setting
const FLAP_DRAG = { 0: 1, 10: 1, 20: 0.85, 30: 0.7 };   // acceleration on the takeoff roll

const PILOTS = [
  { name: 'Player 1', reg: 'N4968N', color: '#f2c14e' },
  { name: 'Player 2', reg: 'N3721B', color: '#5ec8e5', decoy: true },
];
// Computer keyboard shortcuts (left hand). Touch and mouse work on the controls themselves.
const KEYS = {
  KeyQ: 'master', KeyW: 'fuel', KeyE: 'mixture', KeyR: 'prime',
  KeyA: 'beacon', KeyS: 'clear', KeyD: 'key', KeyF: 'oil',
  KeyZ: 'flaps', KeyX: 'thrDn', KeyC: 'thrUp', KeyV: 'yoke',
};
G.KEYLABEL = { master: 'Q', fuel: 'W', mixture: 'E', prime: 'R', beacon: 'A', clear: 'S', key: 'D', oil: 'F', flaps: 'Z', throttle: 'C+ X−', yoke: 'V' };

// The checklist, in order. "soft" steps can be (mistakenly) skipped; "manual" steps wait for you to move on.
const STEPS = [
  { id: 'master', short: 'Master ON', ctrls: ['master'], ready: p => p.master },
  { id: 'fuel', short: 'Fuel selector BOTH', ctrls: ['fuel'], ready: p => p.fuel === 'BOTH', soft: true },
  { id: 'mixture', short: 'Mixture RICH (in)', ctrls: ['mixture'], ready: p => p.mixture },
  { id: 'crack', short: 'Throttle in ¼ inch', ctrls: ['throttle'], ready: p => p.throttle >= 0.05 && p.throttle <= 0.25 },
  { id: 'prime', short: 'Prime 2–3 times', label: p => p.strokes ? `Primed ${p.strokes} of 3${p.strokes >= 2 ? ' ✓' : ''}` : 'Prime 2–3 times',
    ctrls: ['prime'], ready: p => p.warm || (p.strokes >= 2 && p.strokes <= 3), manual: p => !p.warm && p.strokes < 3, soft: true },
  { id: 'beacon', short: 'Beacon ON', ctrls: ['beacon'], ready: p => p.beacon },
  { id: 'clear', short: 'Shout “CLEAR!”', ctrls: ['clear'], ready: p => p.cleared },
  { id: 'start', short: 'Key to START (hold)', ctrls: ['key'], ready: p => p.running },
  { id: 'oil', short: 'Oil pressure green', ctrls: ['oil'], ready: p => p.oilChecked },
  { id: 'flaps', short: 'Flaps 10°', ctrls: ['flaps'], ready: p => p.flaps === 10 },
  { id: 'full', short: 'Full throttle', ctrls: ['throttle'], ready: p => p.throttle >= 0.95 },
  { id: 'rotate', short: '55 kt: pull back', ctrls: ['yoke'], ready: p => p.airborne },
];
const IDX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
G.STEPS = STEPS; G.RACE_TIME = RACE_TIME;
G.mode = M;

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = G.fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const dpr = Math.min(2, window.devicePixelRatio || 1);
const hasKeyboard = matchMedia('(hover: hover) and (pointer: fine)').matches;

// ---------- State ----------
let mode = 'solo';         // 'solo' or 'online'
let state = 'menu';        // 'menu' | 'countdown' | 'race' | 'end'
let raceT = 0, countdown = 0, endAt = 0;
let me = null, opp = null, oppGone = false;
let wantAgain = { me: false, them: false };
let lastSend = 0;

// The four researchers you can play (all fictional). `path` picks the story path, `voice` the recorded lines.
const CHARS = G.CHARS = {
  ivy: { name: 'Dr. Ivy Thorne', short: 'Ivy', path: 'botanist', label: 'Botanist', voice: 'female',
    weapon: 'Vine Whip', icon: '🌿', weaponLine: 'A living strangler-fig vine that cracks out and snaps zombies back. Sometimes it grabs a tree and slingshots her forward.' },
  wren: { name: 'Wren “Riptide” Calloway', short: 'Wren', path: 'safari', label: 'Jungle Explorer', voice: 'female',
    weapon: 'Machete “Mildred”', icon: '🔪', weaponLine: 'A wide, flashing slash that sends them stumbling back.' },
  elias: { name: 'Dr. Elias Fernsby', short: 'Elias', path: 'botanist', label: 'Botanist', voice: 'male',
    weapon: 'The Fern', icon: '🪴', weaponLine: 'He swings his potted fern by the pot like a club. The fern is always fine. He always apologizes.' },
  kip: { name: 'Kip “Compass” Monroe', short: 'Kip', path: 'safari', label: 'Jungle Explorer', voice: 'male',
    weapon: 'Camera Flash', icon: '📸', weaponLine: 'A blinding flash that freezes zombies in place for a couple of seconds.' },
};
const charName = c => (CHARS[c] || CHARS.ivy).name;
let myChar = 'ivy';
try { const saved = localStorage.getItem('n4968n-char'); if (CHARS[saved]) myChar = saved; } catch (e) {}
function pickChar(c) {
  myChar = c;
  try { localStorage.setItem('n4968n-char', c); } catch (e) {}
  document.querySelectorAll('#charPick button').forEach(b => b.classList.toggle('on', b.dataset.char === c));
  if (me && state === 'menu') me.char = c;
}

function makeZombies() {
  const zs = [];
  for (let i = 0; i < 18; i++) {
    const side = Math.random() < 0.5 ? -1 : 1, onStrip = Math.random() < 0.25;
    zs.push({
      x: side * (onStrip ? 0.45 + Math.random() * 0.45 : 1.3 + Math.random() * 1.1),
      z0: 6 + Math.random() * 10, zEnd: 1.1 + Math.random() * 1.2,
      appear: Math.random() * 0.6, walk: 0.7 + Math.random() * 0.6, ph: Math.random() * 6,
      limp: Math.random() < 0.5, hunch: (Math.random() - 0.5) * 0.4,
      coat: ['lab', 'khaki', 'rags', 'rags'][Math.floor(Math.random() * 4)],
    });
  }
  return zs;
}

function newPlayer(slot) {
  return {
    slot, ...PILOTS[slot],
    step: 0, lastStep: 0, stepSince: 0, master: false, fuel: 'LEFT', mixture: false, throttle: 0,
    strokes: 0, primeAnim: 0, beacon: false, cleared: false, running: false, cranking: false, crank: 0,
    oil: 0, oilT: 0, oilChecked: false, flaps: 0, rpm: 0, propAngle: 0, speed: 0, dist: 0, warm: false,
    floodUntil: 0, starve: 0, rotT: 0, pull: false, airborne: false, alt: 0, done: false, overrun: false,
    finishT: 0, lockUntil: 0, mistakes: 0, skipped: [], hold: {}, holdT: {},
    msg: '', msgT: -99, msgDur: 0, msgColor: '#fff', stall: false, shake: 0,
    nextBang: 0, nextGroan: 20 + Math.random() * 15, prints: [], zombies: makeZombies(), view: null, voice: null,
    char: 'ivy', hand: null, lastVoice: -99, whoaDone: false,
  };
}

function say(p, text, color = '#fff', dur = 2.5) { p.msg = text; p.msgT = raceT; p.msgDur = dur; p.msgColor = color; }

// The player's character speaks (female or male recorded voice).
function speak(p, line, gap = 0) {
  if (p !== me || raceT - p.lastVoice < gap) return false;
  p.lastVoice = raceT;
  return Sfx.voice((CHARS[p.char] || CHARS.ivy).voice, line);
}

G.winner = () => [me, opp].filter(p => p && p.airborne).sort((a, b) => a.finishT - b.finishT)[0] || null;

// ---------- Rules ----------
function cascade(p) {
  while (p.step < STEPS.length) {
    const s = STEPS[p.step];
    if ((s.manual && s.manual(p)) || !s.ready(p)) break;
    p.step++;
  }
}

function penalty(p, text) {
  p.lockUntil = raceT + M().penalty;
  p.mistakes++;
  p.shake = 0.4;
  Object.keys(p.hold).forEach(k => { p.hold[k] = false; });
  Sfx.sputter();
  if (p.hand) p.hand.shaky = true;
  speak(p, 'mistake', 6);
  say(p, text, '#ff6b6b', M().penalty);
}

// Is this control allowed right now? Moving on to the next step's control finishes a soft step (even if it's wrong).
function gate(p, ctrl) {
  if (state !== 'race' || p.done) return false;
  if (raceT < p.lockUntil) { Sfx.dud(); return false; }
  const cur = p.step;
  if (STEPS.some((s, i) => i <= cur && s.ctrls.includes(ctrl))) return true;
  const owner = STEPS.findIndex((s, i) => i > cur && s.ctrls.includes(ctrl));
  const s = STEPS[cur];
  if (owner === cur + 1 && (s.ready(p) || s.soft)) {
    if (!s.ready(p)) p.skipped.push(cur);
    p.step++;
    return true;
  }
  penalty(p, `Out of order! Sputter… −${M().penalty}s\nFirst: ${s.short}`);
  return false;
}

function act(p, ctrl, arg) {
  if (p.sim && G.reach) G.reach(p, ctrl, false);   // the bot's hand reaches too
  if (!gate(p, ctrl)) return false;
  apply(p, ctrl, arg);
  cascade(p);
  return true;
}

function apply(p, ctrl, arg) {
  switch (ctrl) {
    case 'master': p.master = true; Sfx.click(); break;
    case 'fuel': p.fuel = { LEFT: 'BOTH', BOTH: 'RIGHT', RIGHT: 'OFF', OFF: 'LEFT' }[p.fuel]; Sfx.click(); break;
    case 'beacon': p.beacon = true; Sfx.click(); break;
    case 'mixture':
      if (arg === false) {
        if (p.mixture && p.running) engineQuit(p, 'Mixture pulled to CUTOFF.\nThat shuts the engine off! Push it back in.');
        p.mixture = false;
      } else p.mixture = true;
      Sfx.click();
      break;
    case 'prime': {
      p.strokes++;
      p.primeAnim = 1;
      Sfx.prime();
      const limit = p.warm ? 1 : 3;
      if (p.strokes > limit && !p.running) {
        p.floodUntil = Math.max(p.floodUntil, raceT) + (p.strokes === limit + 1 ? FLOOD_WAIT : 2);
        p.mistakes++;
        speak(p, 'mistake', 6);
        say(p, p.warm ? 'A warm engine needs no prime!\nFLOODED. Wait before starting.' : 'Too much prime!\nFLOODED. Wait before starting.', '#ff9f43', 3);
      } else if (!p.running && !p.warm) {
        say(p, p.strokes === 1 ? 'Primer: 1 stroke. Prime once or twice more.'
          : p.strokes === 2 ? 'Primer: 2 strokes ✓\nNext: Beacon ON (a 3rd stroke is OK too)'
          : 'Primer: 3 strokes ✓ That’s enough!\nNext: Beacon ON', p.strokes === 1 ? '#fff' : '#7bed9f', 2.2);
      }
      break;
    }
    case 'clear': p.cleared = true; say(p, '“CLEAR PROP!”', '#fff', 1.5); if (!speak(p, 'clear')) Sfx.shout('Clear prop!'); break;
    case 'key': Sfx.click(); break;
    case 'oil':
      if (!p.running) say(p, 'Engine isn’t running yet', '#ff9f43', 1.5);
      else if (p.oil >= 0.8) { p.oilChecked = true; say(p, 'Oil pressure green ✓', '#7bed9f', 1.5); }
      else say(p, 'Oil pressure still rising…\ncheck again in a moment', '#ff9f43', 1.5);
      break;
    case 'flaps': p.flaps = (p.flaps + 10) % 40; Sfx.click(); break;
    case 'throttle':
      if (arg && 'set' in arg) p.throttle = clamp(arg.set, 0, 1);
      else if (arg && 'delta' in arg) p.throttle = clamp(p.throttle + arg.delta, 0, 1);
      break;
  }
}

function startNeed(p) {
  if (p.fuel === 'OFF') return { need: Infinity, why: 'No fuel! The fuel selector is OFF' };
  if (!p.mixture) return { need: Infinity, why: 'Mixture is in CUTOFF' };
  if (p.throttle > 0.35) return { need: Infinity, why: 'Too much throttle.\nPull it back to ¼ inch' };
  if (p.throttle < 0.02) return { need: Infinity, why: 'Throttle is closed.\nPush it in a little' };
  if (raceT < p.floodUntil) return { need: Infinity, why: 'FLOODED! Let go of the key and wait' };
  if (p.warm) return { need: 0.8 };
  if (p.strokes < 2) return { need: 3.2, why: 'Cold engine, not enough prime…\nkeep cranking' };
  return { need: 1.0 };
}

function engineQuit(p, why) {
  p.running = false; p.warm = true; p.cleared = false; p.oilChecked = false;
  p.starve = 0; p.crank = 0; p.strokes = 0;
  p.step = IDX.fuel;
  p.skipped = p.skipped.filter(i => i < IDX.fuel);
  p.mistakes++;
  p.shake = 0.6;
  Sfx.sputter();
  speak(p, 'mistake', 3);
  say(p, why, '#ff6b6b', 5);
}

function takeoff(p) {
  p.airborne = true; p.done = true; p.finishT = raceT; p.step = STEPS.length; p.stall = false;
  Sfx.win();
  speak(p, 'airborne');
  sendSnapshot();
}

function updateMe(p, dt) {
  const locked = raceT < p.lockUntil;
  if (!p.done && state === 'race') {
    for (const [id, dir] of [['thrUp', 1], ['thrDn', -1]]) {
      if (p.hold[id] && !locked && raceT - p.holdT[id] > 0.25) p.throttle = clamp(p.throttle + dir * 0.55 * dt, 0, 1);
    }
    if (p.dragThrottle != null && !locked) p.throttle = p.dragThrottle;

    p.cranking = !!p.hold.key && !p.running && p.master && !locked;
    if (p.cranking) {
      p.crank += dt;
      const r = startNeed(p);
      if (p.crank >= r.need) {
        p.running = true; p.crank = 0; p.oil = 0;
        Sfx.caught();
        speak(p, 'engine', 2);
        say(p, 'It caught! Engine running.', '#7bed9f', 2);
      } else if (r.why && p.crank > 1.1 && raceT - p.msgT > 1.6) say(p, r.why, '#ff9f43', 1.8);
    } else p.crank = Math.max(0, p.crank - dt);

    if (p.running) {
      p.oil = Math.min(1, p.oil + dt * 0.5);
      const rolling = p.step >= IDX.full && p.speed > 5;
      if (p.fuel === 'OFF') p.starve += dt;
      else if (p.fuel !== 'BOTH' && rolling) p.starve += dt;
      else p.starve = 0;
      if (p.starve > 2.2) {
        engineQuit(p, p.fuel === 'OFF'
          ? 'ENGINE QUIT! Fuel selector is OFF.\nSet BOTH, throttle back, restart.'
          : `ENGINE QUIT! The ${p.fuel.toLowerCase()} tank alone can't feed it.\nFuel selector BOTH, throttle back, restart.`);
      }
    } else p.oil = Math.max(0, p.oil - dt * 0.4);

    const acc = p.running && p.step >= IDX.full ? p.throttle * 10 * FLAP_DRAG[p.flaps] - 1 - (p.stall ? 6 : 0) : -12;
    p.speed = clamp(p.speed + acc * dt, 0, 85);

    p.stall = false;
    p.pull = !!p.hold.yoke && !locked;
    if (p.pull && p.step === IDX.rotate) {
      const vr = VR[p.flaps];
      if (p.speed >= vr) { p.rotT += dt; if (p.rotT >= 0.6) takeoff(p); }
      else {
        p.stall = true; p.rotT = 0;
        if (raceT - p.msgT > 1.2) say(p, `Too slow to fly! STALL!\nWait for ${vr} knots`, '#ff6b6b', 1.3);
      }
    } else p.rotT = Math.max(0, p.rotT - dt);

    if (!p.done) cascade(p);
    if (p.step !== p.lastStep) { p.lastStep = p.step; p.stepSince = raceT; }

    const rem = RACE_TIME - raceT, k = raceT / RACE_TIME;   // zombies reach the windows at 50%, bang on the glass at 80%
    if (k > 0.3 && raceT > p.nextGroan) { p.nextGroan = raceT + 3 + Math.random() * rem / 8; Sfx.groan(); }
    if (k > 0.5 && !p.whoaDone) { p.whoaDone = true; speak(p, 'whoa'); }
    if (k > 0.8 && raceT > p.nextBang) {
      p.nextBang = raceT + 0.5 + Math.random() * (rem / 12 + 0.4);
      Sfx.bang();
      p.shake = 0.25;
      p.prints.push({ x: Math.random(), y: 0.25 + Math.random() * 0.55, r: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
      if (p.prints.length > 14) p.prints.shift();
    }
  }
  p.oilT = clamp(p.oilT + (p.running ? 0.04 : -0.01) * dt, 0.05, 0.6);
  p.primeAnim = Math.max(0, p.primeAnim - dt * 3);
  visuals(p, dt);
}

function visuals(p, dt) {
  const target = p.running ? 650 + p.throttle * 1750 : p.cranking ? 180 : 0;
  if (p === me || p.sim) p.rpm += (target - p.rpm) * Math.min(1, dt * (p.running ? 3 : 1.5));
  p.propAngle += p.rpm / 60 * Math.PI * 2 * dt;
  if (p.airborne) { p.alt += dt * 0.35; p.speed = Math.min(80, p.speed + dt * 3); }
  p.dist += p.speed * dt * 0.05;
  p.shake = Math.max(0, p.shake - dt);
  if (p.airborne && !p.upAt) p.upAt = performance.now();
  if (p.voice) {
    if (p.upAt) p.voice.level = (p === me ? 1 : 0.25) * Math.max(0, 1 - (performance.now() - p.upAt) / 6000);
    p.voice.update(p);
  }
}

// ---------- Online: share a snapshot of my cockpit ~10 times a second ----------
const SNAP = ['planeType', 'char', 'step', 'master', 'fuel', 'mixture', 'throttle', 'strokes', 'beacon', 'cleared', 'running', 'cranking',
  'oil', 'oilT', 'oilChecked', 'flaps', 'rpm', 'speed', 'airborne', 'overrun', 'done', 'finishT', 'mistakes',
  'stall', 'rotT', 'pull', 'warm', 'skipped', 'prints', 'msg', 'msgColor', 'primeAnim'];
function sendSnapshot() {
  if (mode !== 'online' || !me) return;
  const d = { reg: me.reg };
  for (const k of SNAP) d[k] = me[k];
  d.msgLeft = Math.max(0, me.msgDur - (raceT - me.msgT));
  d.lockLeft = Math.max(0, me.lockUntil - raceT);
  d.floodLeft = Math.max(0, me.floodUntil - raceT);
  d.shake = me.shake;
  d.char = me.char;
  if (me.hand) d.hand = { ctrl: me.hand.ctrl, seq: me.hand.seq, hold: me.hand.hold, shaky: me.hand.shaky };
  Net.send({ t: 's', d });
}
function applySnapshot(d) {
  if (!opp) return;
  const wasAirborne = opp.airborne;
  for (const k of SNAP) if (k in d) opp[k] = d[k];
  opp.msgT = raceT; opp.msgDur = d.msgLeft;
  opp.lockUntil = raceT + d.lockLeft;
  opp.floodUntil = raceT + d.floodLeft;
  opp.shake = Math.max(opp.shake, d.shake || 0);
  if (d.reg && d.reg !== opp.reg) { opp.reg = d.reg; $('#oppName').textContent = charName(opp.char) + ' · ' + opp.reg; }
  if (d.char && d.char !== opp.char) { opp.char = d.char; $('#oppName').textContent = charName(opp.char) + ' · ' + opp.reg; }
  // replay the rival's hand: only the action is sent, the motion is animated here
  if (d.hand) {
    if (!opp.hand || d.hand.seq !== opp.hand.seq) { G.reach(opp, d.hand.ctrl, d.hand.hold); opp.hand.seq = d.hand.seq; }
    else if (opp.hand.hold && !d.hand.hold) G.releaseHand(opp);
    opp.hand.shaky = d.hand.shaky;
  }
  if (opp.airborne && !wasAirborne) say(me, `Your rival ${opp.reg} just took off!`, '#5ec8e5', 2.5);
}

Net.onMsg = m => {
  if (!m || !m.t) return;
  if (m.t === 's') applySnapshot(m.d);
  else if (m.t === 'start') { if (Net.role === 'guest') beginRace(); }
  else if (m.t === 'again') { wantAgain.them = true; againMsg = 'Your rival wants a rematch!'; $('#resStatus').textContent = againMsg; maybeRematch(); }
  else if (m.t === 'mode' || (m.t === 'hello' && m.mode)) { if (Net.role === 'guest') { setMode(m.mode, true); updateRival(); } }
  else if (m.t === 'jungle') { if (Net.role === 'guest') startJungle(m.seed); }
  else if (m.t === 'bitten') { G.Jungle.notice(`${charName(oppChar)} was bitten! They're back at a checkpoint.`); }
  else if (m.t === 'pos') { G.Jungle.setGhost({ ...m, char: oppChar || 'kip' }); }
  else if (m.t === 'boarded') rivalBoarded(m.plane, m.jungle);
  else if (m.t === 'pick') { oppChar = m.char; updateRival(); }
  else if (m.t === 'ready') { oppChar = m.char || oppChar; ready.them = true; updateRival(); maybeStart(); }
};
Net.onOpen = () => {
  Net.send({ t: 'hello', mode: Net.role === 'host' ? modeKey : undefined });
  setStatus(Net.role === 'host' ? '#inviteStatus' : '#joinStatus', 'Connected! Here comes the story…');
  setTimeout(startStory, 1400);
};

// ---------- The beginning: story → researcher → path → airstrip (each player on their own device) ----------
let oppChar = null, ready = { me: false, them: false };
function startStory() {
  ready = { me: false, them: false };
  if (mode === 'online') oppGone = false;
  oppChar = null;
  updateRival();
  G.Story.begin(pick => {
    pickChar(pick);
    if (mode === 'bot') pickBot();
    if (mode === 'online') Net.send({ t: 'pick', char: pick });
  }, () => {
    if (mode === 'online' && !Net.connected()) mode = 'solo';   // rival left during the story
    if (mode === 'solo' || mode === 'bot') { startJungle(newSeed()); return; }
    ready.me = true;
    Net.send({ t: 'ready', char: myChar });
    showScreen('airstrip');
    updateRival();
    maybeStart();
  });
}
function pickBot() {   // one of the three researchers you didn't pick
  const others = Object.keys(CHARS).filter(c => c !== myChar);
  oppChar = others[Math.floor(Math.random() * others.length)];
  updateRival();
}
function updateRival() {
  const chip = $('#rivalChip');
  if (mode === 'bot') {
    chip.classList.toggle('hidden', state !== 'menu' || !oppChar);
    if (oppChar) chip.innerHTML = `<img src="assets/characters/${oppChar}.png" alt="" style="height:28px;vertical-align:middle;margin:-6px 4px -6px -4px">Your rival: <b>${CHARS[oppChar].name}</b> · ${CHARS[oppChar].icon} ${CHARS[oppChar].weapon}`;
    return;
  }
  chip.classList.toggle('hidden', mode !== 'online' || state !== 'menu');
  if (oppGone) { chip.textContent = 'Your rival left'; return; }
  const who = oppChar ? CHARS[oppChar].name : null;
  const modeNote = Net.role === 'guest' ? ` · <span style="color:${M().color}">${M().name}</span>` : '';
  chip.innerHTML = (ready.them ? `Rival: <b>${who}</b> · at the airstrip` : who ? `Rival: <b>${who}</b> · getting ready` : 'Rival: reading the story…') + modeNote;
  $('#stripText').textContent = ready.them ? `${who} is here too. Get to your plane…` : `Waiting for ${who || 'your rival'} to reach the airstrip…`;
}
function maybeStart() {
  if (Net.role === 'host' && ready.me && ready.them && Net.connected()) {
    const seed = newSeed();
    setTimeout(() => { Net.send({ t: 'jungle', seed }); startJungle(seed); }, 900);
  }
}

// ---------- Map codes: every game is a new island; share its code to replay it ----------
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const mapCode = seed => { let s = '', n = seed >>> 0; for (let i = 0; i < 6; i++) { s = CODE_CHARS[n % 32] + s; n = Math.floor(n / 32); } return 'KANOA-' + s; };
const codeSeed = code => { const c = String(code || '').toUpperCase().replace(/^KANOA-?/, ''); if (!/^[2-9A-HJ-NP-Z]{6}$/.test(c)) return null; let n = 0; for (const ch of c) n = n * 32 + CODE_CHARS.indexOf(ch); return n >>> 0; };
let sharedSeed = codeSeed(new URLSearchParams(location.search).get('map'));
function newSeed() {
  if (sharedSeed !== null) { const s = sharedSeed; sharedSeed = null; return s; }   // a map someone shared
  return Math.floor(Math.random() * 32 ** 6) >>> 0;
}
let currentSeed = 0;

// ---------- The jungle run: find the airstrip, then climb into a plane ----------
// your rival (online player or bot) climbed into a plane: their cockpit clock is now running
function rivalBoarded(plane, jungle) {
  rivalBoardedAt = performance.now(); oppPlane = plane; if (jungle) oppJungle = jungle;
  G.Jungle.markTaken(plane);
  if (state === 'jungle') G.Jungle.rivalArrived(RACE_TIME + 3);
}
let rivalBoardedAt = null, oppPlane = null, botArrives = null, botJungleDeaths = 0;
function startJungle(seed) {
  currentSeed = seed;
  rivalBoardedAt = null; oppPlane = null;
  myJungle = { time: 0, deaths: 0 }; oppJungle = { time: 0, deaths: 0 }; botArrives = null; botJungleDeaths = 0;
  wantAgain = { me: false, them: false }; againMsg = '';
  hideEnding();
  state = 'jungle';
  $('#menu').classList.add('hidden');
  G.Intro.stop(); Sfx.ambience(false); G.Story.stop();
  $('#result').classList.add('hidden');
  $('#quitBtn').classList.remove('hidden');
  $('#timer .lbl').textContent = 'Zombies swarm the trails in';
  document.body.classList.add('playing');
  updateRival();
  RACE_TIME = G.RACE_TIME = M().cockpitClock;
  G.Jungle.start({
    seed, char: myChar, mode: M(),
    onPos: mode === 'online' ? pos => Net.send({ t: 'pos', ...pos }) : null,
    onBitten: mode === 'online' ? () => Net.send({ t: 'bitten' }) : null,
    bot: mode === 'bot' ? oppChar : null,
    onBotBoard: mode === 'bot' ? (plane, jungle) => rivalBoarded(plane, jungle) : null,
    onBoard: plane => {
      myJungle = G.Jungle.stats();
      botArrives = mode === 'bot' && rivalBoardedAt === null ? G.Jungle.botEta() : null;
      if (botArrives !== null) botJungleDeaths = (G.Jungle.botStats() || {}).deaths || 0;
      if (mode === 'online') Net.send({ t: 'boarded', plane: plane.id, jungle: myJungle });
      // if your rival got there first, their race clock is already running
      const offset = rivalBoardedAt === null ? 0 : (performance.now() - rivalBoardedAt) / 1000 - 3;
      beginRace({ plane, offset });
    },
    onLate: () => { G.Jungle.stop(); beginRace({ offset: RACE_TIME + 1 }); },
  });
}
Net.onClose = () => {
  if (mode !== 'online') return;
  oppGone = true;
  if (opp && !opp.done) { opp.done = true; }
  if (me && state === 'race') say(me, 'Your rival disconnected.\nKeep going!', '#ff9f43', 3);
  setStatus('#inviteStatus', 'Your friend left.', true);
  setStatus('#joinStatus', 'The race host left.', true);
  $('#resStatus').textContent = 'Your rival left the race.';
  updateRival();
  if (state === 'menu' && ready.me) { mode = 'solo'; beginRace(); }   // was waiting at the airstrip
};
Net.onStatus = (kind, text) => {
  const el = Net.role === 'host' ? '#inviteStatus' : '#joinStatus';
  setStatus(el, text, kind === 'error');
  if (Net.role === 'host' && Net.code) {
    $('#inviteCode').textContent = Net.code;
    $('#inviteLink').value = Net.inviteLink(Net.code);
  }
};
function setStatus(sel, text, err) { const el = $(sel); el.textContent = text; el.classList.toggle('err', !!err); }

function maybeRematch() {
  if (Net.role === 'host' && wantAgain.me && wantAgain.them && Net.connected()) {
    const seed = newSeed();
    Net.send({ t: 'jungle', seed }); startJungle(seed);
  }
}

// ---------- Input ----------
function keyDown(ctrl) {
  if (!me) return;
  Sfx.init();
  if (state === 'race' && !me.done) {
    const handCtrl = ctrl === 'thrUp' || ctrl === 'thrDn' ? 'throttle' : ctrl;
    G.reach(me, handCtrl, ['throttle', 'key', 'yoke'].includes(handCtrl));
  }
  if (ctrl === 'thrUp' || ctrl === 'thrDn') {
    if (act(me, 'throttle', { delta: ctrl === 'thrUp' ? 0.1 : -0.1 })) { me.hold[ctrl] = true; me.holdT[ctrl] = raceT; }
  } else if (ctrl === 'key' || ctrl === 'yoke') {
    if (act(me, ctrl)) me.hold[ctrl] = true;
  } else act(me, ctrl, ctrl === 'mixture' ? true : undefined);
}
function keyUp(ctrl) { if (me) { me.hold[ctrl] = false; G.releaseHand(me); } }

window.addEventListener('keydown', e => {
  const ctrl = KEYS[e.code];
  if (!ctrl || e.metaKey || e.ctrlKey || e.altKey || state === 'menu' || document.activeElement.tagName === 'INPUT') return;
  e.preventDefault();
  if (!e.repeat) keyDown(ctrl);
});
window.addEventListener('keyup', e => { const c = KEYS[e.code]; if (c) keyUp(c); });
window.addEventListener('blur', () => { if (me) { me.hold = {}; me.dragThrottle = null; } });

// Touch / mouse on the cockpit itself
const pointers = new Map();
const meCanvas = $('#meCanvas');
function toVirtual(e) {
  const r = meCanvas.getBoundingClientRect(), v = me && me.view;
  if (!v) return { x: -1, y: -1 };
  return { x: ((e.clientX - r.left) * dpr - v.ox) / v.s, y: ((e.clientY - r.top) * dpr - v.oy) / v.s };
}
meCanvas.addEventListener('pointerdown', e => {
  Sfx.init();
  if (!me) return;
  const v = toVirtual(e), id = G.hitSpot(v.x, v.y);
  if (!id) return;
  e.preventDefault();
  try { meCanvas.setPointerCapture(e.pointerId); } catch (err) {}
  const info = { id, y0: v.y, thr0: me.throttle, moved: false, ok: true };
  if (state === 'race' && !me.done) G.reach(me, id, ['throttle', 'key', 'yoke', 'mixture'].includes(id));
  pointers.set(e.pointerId, info);
  if (id === 'throttle' || id === 'mixture') info.ok = gate(me, id);
  else if (id === 'key' || id === 'yoke') { if (act(me, id)) me.hold[id] = true; else info.ok = false; }
  else act(me, id);
});
meCanvas.addEventListener('pointermove', e => {
  const info = pointers.get(e.pointerId);
  if (!info || !info.ok || !me) return;
  const dy = toVirtual(e).y - info.y0;
  if (Math.abs(dy) > 10) info.moved = true;
  if (!info.moved) return;
  if (info.id === 'throttle') { me.dragThrottle = clamp(info.thr0 - dy / 55, 0, 1); }
  else if (info.id === 'mixture') {
    if (dy < -20 && !me.mixture) act(me, 'mixture', true);
    if (dy > 25 && me.mixture) act(me, 'mixture', false);
  }
});
function pointerEnd(e) {
  const info = pointers.get(e.pointerId);
  if (!info) return;
  pointers.delete(e.pointerId);
  if (!me) return;
  G.releaseHand(me);
  if (info.id === 'key' || info.id === 'yoke') me.hold[info.id] = false;
  if (!info.ok) return;
  if (info.id === 'throttle') {
    if (me.dragThrottle != null) { act(me, 'throttle', { set: me.dragThrottle }); me.dragThrottle = null; }
    else if (!info.moved) act(me, 'throttle', { delta: 0.1 });   // one tap = cracked open ¼ inch
  } else if (info.id === 'mixture' && !info.moved) act(me, 'mixture', true);
}
meCanvas.addEventListener('pointerup', pointerEnd);
meCanvas.addEventListener('pointercancel', pointerEnd);
meCanvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Screens and race flow ----------
function showScreen(name) {
  document.querySelectorAll('#menu .screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== name));
  $('#menu .card').classList.toggle('bare', ['home', 'story', 'select', 'backstory', 'path', 'airstrip'].includes(name));
  $('#menu').dataset.screen = name;
  $('#menu').classList.remove('hidden');
  G.Intro.start();
  if (soundWanted) Sfx.ambience(true);
  if (name === 'home') G.Intro.setScene('jungle');
  updateRival();
}
G.showScreen = showScreen;

// Difficulty: picked on the title screen; online, the host's pick applies to both players.
function setMode(k, fromHost) {
  if (!MODES[k]) return;
  modeKey = k;
  if (!fromHost) { try { localStorage.setItem('n4968n-mode', k); } catch (e) {} }
  const m = M();
  document.querySelectorAll('#modePick button').forEach(b => b.classList.toggle('on', b.dataset.mode === k));
  $('#modeTag').textContent = m.tag;
  $('#modeTag').style.color = m.color;
  const badge = $('#modeBadge');
  badge.textContent = m.name; badge.style.color = m.color; badge.style.borderColor = m.color;
  document.documentElement.style.setProperty('--mode', m.color);
  if (mode === 'online' && Net.role === 'host' && !fromHost) Net.send({ t: 'mode', mode: k });
}
document.querySelectorAll('#modePick button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

// Title-screen sound: silent until the first tap, then jungle ambience (unless switched off).
let soundWanted = false, soundTouched = false;
function setIntroSound(on) {
  soundWanted = on;
  Sfx.init();
  Sfx.ambience(on && state === 'menu');
  $('#introSound').textContent = on ? '🔊 Sound on' : '🔈 Sound off';
}
$('#menu').addEventListener('pointerdown', e => {
  if (soundTouched || e.target.id === 'introSound') return;
  soundTouched = true;
  if (!Sfx.muted) setIntroSound(true);
});
$('#introSound').addEventListener('click', () => {
  soundTouched = true;
  const on = !soundWanted;
  setIntroSound(on);
  if (on && Sfx.muted) { Sfx.setMuted(false); $('#muteBtn').textContent = 'Sound: on'; }
});
$('#goHow').addEventListener('click', () => showScreen('how'));
function goFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  try { const r = el.requestFullscreen && el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}

const PLANES = { c172: 'N4968N', piper: 'N5512P' };
function beginRace(o = {}) {
  Sfx.init();
  hideEnding();
  RACE_TIME = G.RACE_TIME = M().cockpitClock;
  G.Jungle.stop();
  [me, opp].forEach(p => p && p.voice && p.voice.stop());
  const mySlot = mode === 'online' && Net.role === 'guest' ? 1 : 0;
  me = newPlayer(mySlot);
  me.char = myChar;
  Sfx.loadVoices(CHARS[myChar].voice);
  opp = mode === 'online' || mode === 'bot' ? newPlayer(1 - mySlot) : null;
  oppGone = false;
  wantAgain = { me: false, them: false };
  if (Sfx.ctx) {
    me.voice = new G.EngineVoice(0, 1);
    if (opp) opp.voice = new G.EngineVoice(0.6, 0.25);
  }
  $('#arena').className = opp ? 'duo' : 'solo';
  $('#oppWrap').classList.toggle('hidden', !opp);
  if (o.plane) { me.reg = o.plane.reg; me.planeType = o.plane.kind === 'cherokee' ? 'cherokee' : 'c172'; }
  if (opp) {
    opp.char = oppChar || 'kip';
    if (oppPlane) opp.reg = PLANES[oppPlane] || opp.reg;
    $('#oppName').textContent = charName(opp.char) + ' · ' + opp.reg;
  }
  $('#menu').classList.add('hidden');
  G.Intro.stop(); Sfx.ambience(false);
  $('#result').classList.add('hidden');
  $('#quitBtn').classList.remove('hidden');
  document.body.classList.add('playing');
  state = 'countdown'; countdown = 3; raceT = 0; endAt = 0; step.lastBeep = 4;
  $('#timer .lbl').textContent = 'Zombies overrun the airstrip in';
  if (o.offset > 0) {   // your rival reached the planes first: the horde is already on its way
    state = 'race'; raceT = Math.min(RACE_TIME, o.offset);
    say(me, `Your rival got here ${Math.round(o.offset + 3)}s ahead of you. Hurry!`, '#ff9f43', 3);
  }
  if (mode === 'bot' && opp) {
    if (oppPlane) {
      startBot();
      if (raceT > 0) {   // the bot has been working its checklist while you were still in the jungle
        const end = raceT, keep = state; state = 'race';
        opp.botWait = 1.2;
        for (let tt = 0; tt < end && !opp.done; tt += 0.05) { raceT = tt; botStep(0.05); }
        raceT = end; state = keep;
      }
    } else if (botArrives === null) botArrives = RACE_TIME + 999;   // never boards (rematch from the card)
  }
  G.Story.stop(); updateRival();
  fitAll();
}

// ---------- The bot in the cockpit: works the checklist like a person, with mistakes by mode ----------
function startBot() {
  if (!opp || opp.sim) return;
  opp.sim = true;
  if (!oppPlane) oppPlane = me.reg === 'N4968N' ? 'piper' : 'c172';
  opp.reg = PLANES[oppPlane]; opp.planeType = oppPlane === 'piper' ? 'cherokee' : 'c172';
  opp.botWait = raceT + 1.2;
  opp.primeTarget = 2 + (Math.random() < 0.5 ? 1 : 0);
  $('#oppName').textContent = charName(opp.char) + ' · ' + opp.reg;
}
function botStep(dt) {
  Sfx.quiet = true;
  try { botThink(opp); updateMe(opp, dt); } finally { Sfx.quiet = false; }
}
function botThink(p) {
  const cfg = M();
  if (p.done || state !== 'race' || raceT < p.lockUntil) return;
  const id = STEPS[p.step] && STEPS[p.step].id;
  if (STEPS.findIndex(s => s.id === 'full') > p.step) { p.hold.thrUp = false; p.hold.yoke = false; }   // after an engine quit
  if (id !== 'start') p.hold.key = false;
  if (raceT < (p.botWait || 0)) return;
  const wait = k => { p.botWait = raceT + cfg.botStep * k * (0.6 + Math.random() * 0.8); };
  const slip = () => Math.random() < cfg.botMistake;
  switch (id) {
    case 'master': if (slip() && !p.slipped) { p.slipped = true; act(p, 'beacon'); } else act(p, 'master'); wait(1); break;   // out of order: sputter
    case 'fuel': if (slip() && !p.skipFuel) { p.skipFuel = true; act(p, 'mixture', true); } else act(p, 'fuel'); wait(1); break;  // forgets BOTH
    case 'mixture': act(p, 'mixture', true); wait(1); break;
    case 'crack': act(p, 'throttle', p.throttle > 0.25 ? { set: 0.12 } : { delta: 0.1 }); wait(1); break;
    case 'prime':
      if (p.primeTarget < 4 && slip() && !p.overPrimed) { p.overPrimed = true; p.primeTarget = 4; }            // over-primes and floods
      if (p.strokes < p.primeTarget) { act(p, 'prime'); wait(0.4); } else { act(p, 'beacon'); wait(1); }
      break;
    case 'beacon': if (p.overPrimed && p.strokes < 4) { act(p, 'prime'); wait(0.4); } else { act(p, 'beacon'); wait(1); } break;   // one stroke too many floods it
    case 'clear': act(p, 'clear'); wait(1); break;
    case 'start': if (raceT < p.floodUntil) p.hold.key = false; else if (!p.hold.key && act(p, 'key')) p.hold.key = true; break;
    case 'oil': if (p.oil >= 0.8) { act(p, 'oil'); wait(0.8); } break;
    case 'flaps': act(p, 'flaps'); wait(1); break;
    case 'full': if (!p.hold.thrUp && act(p, 'throttle', { delta: 0.1 })) { p.hold.thrUp = true; p.holdT.thrUp = raceT; } break;
    case 'rotate': if (p.speed >= VR[p.flaps] + 1 && !p.hold.yoke && act(p, 'yoke')) p.hold.yoke = true; break;
  }
}

// ---------- The ending: fly-out over the island, then the winner card ----------
const WIN_LINES = {
  ivy: 'Cure’s in my pocket. Zombies in my rearview.',
  wren: 'Eleven jungles. Never lost a guest. Not starting tonight.',
  elias: 'Look, little guy. We’re flying!',
  kip: 'Finally. A direction I’m sure of. Up.',
};
let againMsg = '';
let endingShown = false, cardShown = false, playedWinFor = null, cardTimer = 0;
let myJungle = { time: 0, deaths: 0 }, oppJungle = { time: 0, deaths: 0 };

function startEnding() {
  endingShown = true;
  if (me.airborne) setTimeout(() => G.Ending.flyout(showCard), 1200);   // you escaped: watch the plane climb away
  else setTimeout(showCard, 2200);                                       // left on the strip: the card over your cockpit
}

function showCard() {
  cardShown = true;
  fillCard();
  $('#result').classList.remove('hidden');
  clearInterval(cardTimer);
  cardTimer = setInterval(() => { if (cardShown) fillCard(); }, 700);   // the rival may still be racing
}

function escapeLine(p, jungle) {
  if (p.airborne) {
    const total = jungle.time + p.finishT;
    return `escaped in ${fmt(total)} (jungle ${fmt(jungle.time)}, cockpit ${p.finishT.toFixed(1)} s) · ${p.mistakes} mistake${p.mistakes === 1 ? '' : 's'} · ${jungle.deaths} li${jungle.deaths === 1 ? 'fe' : 'ves'} lost`;
  }
  if (p === opp && oppGone) return 'left the race';
  return p.overrun ? `left on the strip · ${jungle.deaths} li${jungle.deaths === 1 ? 'fe' : 'ves'} lost` : 'still on the strip…';
}

function fillCard() {
  const w = G.winner(), m = M(), card = $('#result .card');
  card.classList.toggle('loser', !!w && w !== me && !me.airborne);
  card.classList.toggle('overrun', !w);
  if (w) {
    $('#winImg').src = `assets/characters/${w.char}.png`;
    $('#winBadge').textContent = `ESCAPED KANOA · ${m.name.toUpperCase()}`;
    $('#winBadge').style.color = m.color;
    $('#resTitle').textContent = charName(w.char);
    $('#winLine').textContent = '“' + WIN_LINES[w.char] + '”';
    let sub;
    if (w === me) {
      sub = mode === 'solo' ? `You got ${me.reg} off the island with ${fmt(RACE_TIME - me.finishT)} to spare.`
        : opp && opp.airborne ? `Your rival escaped too, ${(opp.finishT - me.finishT).toFixed(1)} s behind you.`
        : opp && opp.overrun ? 'Your rival was left on the strip.' : 'Your rival is still on the strip…';
    } else sub = me.airborne ? `You escaped too, ${(me.finishT - w.finishT).toFixed(1)} s behind.` : 'You were left on the strip.';
    $('#resSub').textContent = sub;
    if (playedWinFor !== w) { playedWinFor = w; Sfx.playFile(`assets/voice/${w.char}-win.mp3`); }
  } else {
    $('#winImg').src = `assets/characters/${me.char}.png`;
    $('#winBadge').textContent = `LEFT ON KANOA · ${m.name.toUpperCase()}`;
    $('#winBadge').style.color = '#ff6b6b';
    $('#resTitle').textContent = 'Overrun';
    $('#winLine').textContent = '“The horde reached the plane.”';
    $('#resSub').textContent = opp && !opp.done ? 'You were left on the strip. Your rival is still trying…' : 'Nobody got off the island.';
  }
  const list = $('#resList');
  list.innerHTML = '';
  for (const [p, jungle, who] of [[me, myJungle, 'You'], [opp, oppJungle, 'Rival']]) {
    if (!p) continue;
    const li = document.createElement('li');
    li.innerHTML = `<b>${who}</b> · ${charName(p.char)} in ${p.reg}: ${escapeLine(p, jungle)}`;
    list.appendChild(li);
  }
  $('#resStatus').textContent = mode === 'online' && oppGone ? 'Your rival left the race.' : againMsg;
  $('#again').disabled = mode === 'online' && oppGone;
  $('#changeChar').classList.toggle('hidden', mode === 'online');
  $('#mapCode').textContent = 'Map ' + mapCode(currentSeed);
}

function hideEnding() {
  cardShown = false; endingShown = false; playedWinFor = null;
  clearInterval(cardTimer);
  G.Ending.stop(); Sfx.stopFile();
  $('#result').classList.add('hidden');
}

function toMenu() {
  Net.leave();
  [me, opp].forEach(p => p && p.voice && p.voice.stop());
  me = newPlayer(0); opp = null;
  G.Story.stop(); G.Jungle.stop(); hideEnding();
  $('#timer .lbl').textContent = 'Zombies overrun the airstrip in';
  mode = 'solo'; state = 'menu';
  $('#arena').className = 'solo';
  $('#oppWrap').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#quitBtn').classList.add('hidden');
  document.body.classList.remove('playing');
  showScreen('home');
}

$('#goSolo').addEventListener('click', () => { Sfx.init(); goFullscreen(); Net.leave(); mode = 'solo'; startStory(); });
$('#goBot').addEventListener('click', () => { Sfx.init(); goFullscreen(); Net.leave(); mode = 'bot'; startStory(); });
$('#goInvite').addEventListener('click', () => {
  Sfx.init(); mode = 'online';
  $('#inviteCode').textContent = '····'; $('#inviteLink').value = '';
  showScreen('invite');
  Net.host();
});
$('#goJoin').addEventListener('click', () => { Sfx.init(); mode = 'online'; showScreen('join'); setStatus('#joinStatus', ''); $('#joinCode').focus(); });
document.querySelectorAll('#menu .back').forEach(b => b.addEventListener('click', () => { Net.leave(); mode = 'solo'; showScreen('home'); }));
$('#joinBtn').addEventListener('click', () => {
  const code = $('#joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { setStatus('#joinStatus', 'The code has 4 letters.', true); return; }
  Sfx.init(); goFullscreen(); mode = 'online'; Net.join(code);
});
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#copyBtn').addEventListener('click', async () => {
  const link = $('#inviteLink').value; if (!link) return;
  try { await navigator.clipboard.writeText(link); $('#copyBtn').textContent = 'Copied!'; }
  catch (e) { $('#inviteLink').select(); document.execCommand && document.execCommand('copy'); $('#copyBtn').textContent = 'Copied!'; }
  setTimeout(() => { $('#copyBtn').textContent = 'Copy link'; }, 1500);
});
if (navigator.share) $('#shareBtn').classList.remove('hidden');
$('#shareBtn').addEventListener('click', () => {
  const link = $('#inviteLink').value; if (!link) return;
  navigator.share({ title: 'N4968N cockpit race', text: `Race me off the zombie island! Code ${Net.code}`, url: link }).catch(() => {});
});
$('#again').addEventListener('click', () => {
  if (mode === 'solo' || mode === 'bot') { startJungle(newSeed()); return; }
  wantAgain.me = true; Net.send({ t: 'again' });
  againMsg = wantAgain.them ? 'Starting…' : 'Waiting for your rival to press Fly again…';
  $('#resStatus').textContent = againMsg;
  maybeRematch();
});
$('#copyMap').addEventListener('click', async () => {
  const link = location.origin + location.pathname + '?map=' + mapCode(currentSeed);
  try { await navigator.clipboard.writeText(link); $('#copyMap').textContent = 'Link copied!'; } catch (e) { $('#copyMap').textContent = link; }
  setTimeout(() => { $('#copyMap').textContent = 'Copy map link'; }, 1800);
});
$('#changeChar').addEventListener('click', () => {
  hideEnding();
  [me, opp].forEach(p => p && p.voice && p.voice.stop());
  state = 'menu';
  document.body.classList.remove('playing');
  $('#quitBtn').classList.add('hidden');
  G.Story.chooseAgain(c => { pickChar(c); if (mode === 'bot') pickBot(); }, () => startJungle(newSeed()));
});
$('#toMenu').addEventListener('click', toMenu);
$('#quitBtn').addEventListener('click', toMenu);
$('#muteBtn').addEventListener('click', e => { Sfx.setMuted(!Sfx.muted); e.target.textContent = 'Sound: ' + (Sfx.muted ? 'off' : 'on'); });

// ---------- Main loop ----------
function fit(canvas) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function fitAll() { fit(meCanvas); fit($('#oppCanvas')); }
new ResizeObserver(fitAll).observe($('#arena'));

function step(dt, now) {
  const cd = $('#countdown');
  if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== step.lastBeep && n > 0) { step.lastBeep = n; Sfx.beep(660); }
    cd.textContent = n > 0 ? n : 'GO!';
    cd.classList.remove('hidden');
    if (countdown <= 0) { state = 'race'; step.lastBeep = 3; Sfx.beep(990); setTimeout(() => cd.classList.add('hidden'), 500); }
  }
  if (state === 'race') {
    const everyone = [me, opp].filter(Boolean);
    if (!everyone.every(p => p.done)) {
      raceT = Math.min(RACE_TIME, raceT + dt);
      if (raceT >= RACE_TIME && !me.done) {
        me.done = true; me.overrun = true; me.stall = false; me.cranking = false; me.running = false; me.prints.length = 0;
        Sfx.lose();
        sendSnapshot();
      }
      // an online rival who stopped sending past the deadline counts as overrun
      if (opp && !opp.done && raceT >= RACE_TIME && !Net.connected()) { opp.done = true; if (mode === 'bot') opp.overrun = true; }
    } else state = 'end';
    if (me.done && !endingShown) startEnding();
  }
  if (me && (state === 'race' || state === 'end')) updateMe(me, dt);
  if (opp && mode === 'bot' && state === 'race' && !opp.sim && botArrives !== null && raceT >= botArrives) {
    startBot(); oppJungle = { time: myJungle.time + botArrives, deaths: botJungleDeaths };
  }
  if (opp && opp.sim && (state === 'race' || state === 'end')) botStep(dt);
  else if (opp && (state === 'race' || state === 'end')) visuals(opp, dt);
}

let last = performance.now();
function frame(now) {
  let total = Math.min(1, (now - last) / 1000);
  last = now;
  while (total > 0) { const dt = Math.min(0.05, total); step(dt, now); total -= dt; }
  if (mode === 'online' && ['countdown', 'race', 'end'].includes(state) && now - lastSend > 100) { lastSend = now; sendSnapshot(); }
  draw();
}
function draw() {
  const rem = RACE_TIME - raceT;
  $('#time').textContent = state === 'jungle' ? fmt(Math.max(0, M().jungleClock - G.Jungle.elapsed())) : fmt(state === 'menu' ? M().cockpitClock : rem);
  $('#timer').classList.toggle('danger', state === 'race' && rem < 20);
  if (document.hidden) return;
  const racing = state === 'race';
  if (me) {
    const cssScale = Math.min(meCanvas.clientWidth / G.CAMERA.w, meCanvas.clientHeight / G.CAMERA.h);
    G.drawCockpit(meCanvas.getContext('2d'), me, meCanvas.width, meCanvas.height, raceT,
      { own: true, racing, keys: hasKeyboard, compact: cssScale < 0.62, solo: mode === 'solo', hintAfter: M().hintAfter, cardHighlight: M().cardHighlight });
  }
  if (opp) {
    const oc = $('#oppCanvas');
    G.drawCockpit(oc.getContext('2d'), opp, oc.width, oc.height, raceT, { mini: true, compact: true, racing });
    const st = opp.airborne ? 'airborne!' : opp.overrun ? 'overrun' : oppGone ? 'disconnected' : !oppPlane && opp.step === 0 && !opp.master ? 'still in the jungle'
      : opp.running ? 'engine running' : `step ${Math.min(opp.step + 1, STEPS.length)}/${STEPS.length}`;
    $('#oppStatus').textContent = '· ' + st;
  }
}
function loop(now) {
  try { frame(now); } catch (e) { console.error(e); }   // never let one bad frame stop the game
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// Hidden or throttled tabs pause animation frames; keep the race clock and the online link ticking anyway.
setInterval(() => { const now = performance.now(); if (now - last > 150) frame(now); }, 100);

// ---------- Start up ----------
me = newPlayer(0);
me.char = myChar;
setMode(modeKey, true);
G.preloadHands();
document.querySelectorAll('#charPick button').forEach(b => b.addEventListener('click', () => pickChar(b.dataset.char)));
pickChar(myChar);
fitAll();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) {
  mode = 'online';
  showScreen('join');
  $('#joinCode').value = joinParam.toUpperCase().slice(0, 4);
  setStatus('#joinStatus', 'You were invited! Press Join to connect.');
} else showScreen('home');

// Handy for testing from the browser console.
window.N4968N = { get me() { return me; }, get opp() { return opp; }, get state() { return state; }, get raceT() { return raceT; }, keyDown, keyUp };
})();
