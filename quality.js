/* Keeps the game smooth on any computer. It watches how fast frames really arrive and, if a machine can't keep up,
   steps down the drawing resolution and the costliest effects. The game's speed never depends on this: every stage
   runs on real time, so a slow computer shows fewer frames but its character moves exactly as fast as anyone's. */
(() => {
'use strict';
const G = window.G = window.G || {};
const CAPS = [2, 1.5, 1.25, 1, 0.8, 0.6];   // the sharpest the canvases may draw at each level
const SLOW_MS = 40;                         // under 25 frames a second (a phone in low-power mode runs at 30, which is fine)
const KEY = 'n4968n-quality';
let level = 0; try { level = Math.min(CAPS.length - 1, Math.max(0, +sessionStorage.getItem(KEY) || 0)); } catch (e) {}
let last = 0, sum = 0, n = 0, skip = 40;

// how far the phone's notch or Dynamic Island reaches in from each side, for things drawn on a canvas
// (read fresh every half second: Safari settles the inset after the page has laid out and on every rotation)
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
let insets = { left: 0, right: 0 }, readAt = -1e9;
const inset = () => {
  if (performance.now() - readAt < 500) return insets;
  readAt = performance.now();
  if (!probe.isConnected && document.body) document.body.appendChild(probe);
  const c = getComputedStyle(probe);
  insets = { left: parseFloat(c.paddingLeft) || 0, right: parseFloat(c.paddingRight) || 0 };
  return insets;
};
G.safe = { get left() { return inset().left; }, get right() { return inset().right; } };

const scale = lv => Math.min(CAPS[lv], window.devicePixelRatio || 1);
G.Quality = {
  get level() { return level; },
  get lite() { return level >= 1; },     // no film grain or fever blur
  get bare() { return level >= 3; },     // cheapest dusk tint as well
  dpr() { return scale(level); },
  // a new stage is loading: its first moments say nothing about how fast this computer is
  settle() { sum = n = 0; skip = 60; },
  // call once per animation frame during play; returns true when the level just changed so canvases can be resized
  tick(now) {
    const d = now - last; last = now;
    if (document.hidden || d > 4000 || d <= 0) { sum = n = 0; return false; }   // (a long gap is a tab switch, not a slow frame)
    if (skip > 0) { skip -= Math.max(1, d / 16.7); return false; }
    sum += d; n++;
    if (n < 45 && sum < 1500) return false;     // a slow computer shouldn't have to wait for 45 slow frames
    const avg = sum / n; sum = n = 0;
    if (avg < SLOW_MS || level >= CAPS.length - 1) return false;
    const was = scale(level);
    level++;
    while (level > 1 && level < CAPS.length - 1 && scale(level) === was) level++;   // a step that changes nothing is wasted time
    try { sessionStorage.setItem(KEY, level); } catch (e) {}
    skip = 20;
    return true;
  },
};
})();
