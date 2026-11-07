/* The pilot's hands: reach to each control, press/turn/pull it, then return out of view.
   Uses the character's first-person hand picture (assets/characters/hand-<character>.png). */
(() => {
'use strict';
const G = window.G = window.G || {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeIn = k => k * k;

const SIZE = 320;            // drawn hand size in virtual units
const REACH = 0.2, PRESS = 0.25, BACK = 0.35;   // seconds
const REST_R = [1260, 1120], REST_L = [330, 1120];

// Load each character's hand once and find the fingertip (the top-left-most solid pixel).
const imgs = {};
function handImage(char) {
  const src = G.art(`hand-${char}.png`);
  if (imgs[src]) return imgs[src];
  const rec = imgs[src] = { img: new Image(), ready: false, tip: [150, 95], w: 512 };
  rec.img.onload = () => {
    rec.w = rec.img.naturalWidth;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); x.drawImage(rec.img, 0, 0, 128, 128);
      const d = x.getImageData(0, 0, 128, 128).data;
      let best = Infinity;
      for (let y = 0; y < 128; y++) for (let i = 0; i < 128; i++) {
        if (d[(y * 128 + i) * 4 + 3] > 140 && i + y * 1.2 < best) { best = i + y * 1.2; rec.tip = [(i + 2) / 128 * rec.w, (y + 3) / 128 * rec.w]; }
      }
    } catch (e) { /* keep the default fingertip */ }
    rec.ready = true;
  };
  rec.img.src = src;
  return rec;
}
G.preloadHands = () => ['ivy', 'wren', 'elias', 'kip'].forEach(handImage);

// Where a fingertip goes for each control (depends on where the knob currently is).
function target(p, ctrl) {
  switch (ctrl) {
    case 'master': return [150, 556];
    case 'key': return [152, 704];
    case 'clear': return [70, 300];
    case 'oil': return [733, 560];
    case 'beacon': return [842, p.beacon ? 646 : 682];
    case 'prime': return [740, 770 + (p.primeAnim || 0) * 44];
    case 'throttle': return [918, 768 + (1 - p.throttle) * 44];
    case 'mixture': return [1008, 768 + (p.mixture ? 0 : 1) * 44];
    case 'fuel': return [884, 858];
    case 'flaps': return [1502, 528 + p.flaps / 10 * 70];
    default: return null;
  }
}

// Called when the player works a control. `hold` keeps the hand there until release().
// If the hand is still out (on its way back, or on another control), it glides from where it is instead of
// snapping back off screen first; that snap was the glitch when working controls quickly one after another.
G.reach = (p, ctrl, hold) => {
  const from = p.handAt && performance.now() - p.handAt.when < 120 ? { x: p.handAt.x, y: p.handAt.y, left: p.handAt.left } : null;
  p.hand = { ctrl, seq: (p.hand ? p.hand.seq : 0) + 1, start: performance.now(), hold: !!hold, release: 0, shaky: false, from };
};
G.releaseHand = p => { if (p.hand && p.hand.hold) { p.hand.hold = false; p.hand.release = performance.now(); } };

function drawHand(ctx, char, x, y, mirror, rot, squash) {
  const rec = handImage(char);
  if (!rec.ready) return;
  const k = SIZE / rec.w;
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.rotate(rot);
  ctx.scale(squash, 2 - squash);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
  ctx.drawImage(rec.img, -rec.tip[0] * k, -rec.tip[1] * k, rec.w * k, rec.w * k);
  ctx.restore();
}

G.drawHands = (ctx, p, t, opt) => {
  const char = p.char || 'ivy';
  const now = performance.now();
  // nerves: the hand trembles when the zombies are at the glass
  const prog = t / G.RACE_TIME;   // the zombies bang on the glass from 80% of the cockpit clock
  const tremble = opt.racing && !p.done && prog > 0.8 ? 2 + (prog - 0.8) * 30 : 0;
  const jitter = amp => [Math.sin(now / 37) * amp, Math.cos(now / 29) * amp];

  // both hands on the yoke while pulling back
  if (p.pull) {
    const d = 22, [jx, jy] = jitter(tremble);
    drawHand(ctx, char, 300 + jx, 812 + d + jy, true, -0.35, 1);
    drawHand(ctx, char, 600 + jx, 812 + d + jy, false, -0.35, 1);
    return;
  }
  const h = p.hand;
  if (!h || h.ctrl === 'yoke') return;
  const tgt = target(p, h.ctrl);
  if (!tgt) return;
  const el = (now - h.start) / 1000;
  let k;
  if (el < REACH) k = easeOut(el / REACH);
  else if (h.hold) k = 1;
  else {
    const leave = h.release ? (now - h.release) / 1000 : el - REACH - PRESS;
    k = leave < 0 ? 1 : 1 - easeIn(clamp(leave / BACK, 0, 1));
  }
  if (k <= 0.001) { p.handAt = null; return; }
  const left = tgt[0] < 560;
  const rest = left ? REST_L : REST_R;
  // reaching out starts from where this same hand already was; heading back always goes to rest
  const reaching = el < REACH;
  const start = reaching && h.from && h.from.left === left ? [h.from.x, h.from.y] : rest;
  let x = start[0] + (tgt[0] - start[0]) * k, y = start[1] + (tgt[1] - start[1]) * k;
  if (!reaching && k < 1) { x = rest[0] + (tgt[0] - rest[0]) * k; y = rest[1] + (tgt[1] - rest[1]) * k; }
  // a quick press: the hand pushes in and squashes a little right after arriving
  const pressK = el > REACH ? clamp(1 - (el - REACH) / 0.14, 0, 1) : 0;
  const squash = 1 - 0.06 * pressK;
  y += 6 * pressK;
  let rot = left ? 0.12 : -0.05;
  if (h.ctrl === 'key' && p.cranking) rot += 0.35;          // turning the key to START
  if (h.ctrl === 'fuel') rot += 0.3 * pressK;              // twisting the fuel selector
  if (h.ctrl === 'clear') rot += Math.sin(now / 90) * 0.12; // waving at the side window
  const shake = h.shaky && el < 1 ? 7 : 0;
  const [jx, jy] = jitter(tremble + shake);
  drawHand(ctx, char, x + jx, y + jy, left, rot, squash);
  p.handAt = { x, y, left, when: now };
};
})();
