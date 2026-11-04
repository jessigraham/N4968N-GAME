/* Sounds for N4968N, all made in the browser with the Web Audio API. No sound files needed. */
(() => {
'use strict';
const G = window.G = window.G || {};

const Sfx = G.Sfx = {
  ctx: null, out: null, noise: null, muted: false,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.8;
    this.out.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },
  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    if (m && window.speechSynthesis) speechSynthesis.cancel();
  },
  panNode(v) {
    const ctx = this.ctx;
    const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (n.pan) n.pan.value = v;
    n.connect(this.out);
    return n;
  },
  env(g, t0, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },
  burst(pan, t0, dur, freq, type, peak) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    s.connect(f); f.connect(g); g.connect(this.panNode(pan));
    this.env(g, t0, peak, dur);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  },
  tone(pan, t0, dur, freq, type, peak, freqEnd) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    o.connect(g); g.connect(this.panNode(pan));
    this.env(g, t0, peak, dur);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  get t() { return this.ctx.currentTime; },
  click() { if (!this.ctx) return; this.burst(0, this.t, 0.03, 3000, 'highpass', 0.25); this.tone(0, this.t, 0.05, 180, 'square', 0.06); },
  dud() { if (!this.ctx) return; this.tone(0, this.t, 0.08, 110, 'square', 0.05); },
  prime() { if (!this.ctx) return; this.burst(0, this.t, 0.14, 1400, 'bandpass', 0.3); this.tone(0, this.t, 0.1, 240, 'triangle', 0.08, 150); },
  sputter() {
    if (!this.ctx) return;
    const t = this.t;
    for (let i = 0; i < 7; i++) this.burst(0, t + i * 0.11 + Math.random() * 0.05, 0.05 + Math.random() * 0.06, 450 + Math.random() * 400, 'lowpass', 0.6 * (1 - i / 9));
    this.tone(0, t, 0.9, 90, 'sawtooth', 0.12, 35);
  },
  caught() { if (!this.ctx) return; this.burst(0, this.t, 0.3, 1200, 'lowpass', 0.8); this.tone(0, this.t, 0.35, 60, 'sawtooth', 0.3, 140); },
  bang() {
    if (!this.ctx) return;
    const t = this.t, pan = Math.random() * 1.6 - 0.8;
    this.tone(pan, t, 0.35, 80, 'sine', 0.9, 40);
    this.burst(pan, t, 0.12, 500, 'lowpass', 0.7);
    this.burst(pan, t + 0.02, 0.05, 2500, 'bandpass', 0.2);
  },
  groan(level = 0.22) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t, o = ctx.createOscillator(), lfo = ctx.createOscillator(),
      la = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 80 + Math.random() * 35;
    lfo.frequency.value = 4 + Math.random() * 3; la.gain.value = 9;
    lfo.connect(la); la.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 3;
    o.connect(f); f.connect(g); g.connect(this.panNode(Math.random() * 1.6 - 0.8));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.75, t + 1.6);
    o.start(t); lfo.start(t); o.stop(t + 1.7); lfo.stop(t + 1.7);
  },
  beep(f) { if (!this.ctx) return; this.tone(0, this.t, 0.18, f, 'sine', 0.3); },
  win() { if (!this.ctx) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(0, this.t + i * 0.12, 0.35, f, 'triangle', 0.22)); },
  lose() { if (!this.ctx) return; this.tone(0, this.t, 1.8, 220, 'sawtooth', 0.15, 50); this.groan(); },
  // The winner screen: a stamp thud, count-up ticks, a pop as each stat lands, a brass fanfare, and a somber sting.
  thud() { if (!this.ctx) return; const t = this.t; this.tone(0, t, 0.5, 90, 'sine', 1, 38); this.burst(0, t, 0.18, 260, 'lowpass', 0.9); },
  tick() { if (!this.ctx) return; this.tone(0, this.t, 0.04, 1900, 'square', 0.035); },
  pop() { if (!this.ctx) return; const t = this.t; this.tone(0, t, 0.12, 520, 'triangle', 0.25, 1040); this.burst(0, t, 0.05, 3000, 'highpass', 0.12); },
  fanfare() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = this.t + 0.05;
    // a rising major arpeggio on bright brass (two detuned saws through a lowpass that opens as each note speaks)
    [[392, 0], [523, 0.13], [659, 0.26], [784, 0.39], [1047, 0.55]].forEach(([f, d], i) => {
      const len = i === 4 ? 1.4 : 0.32;
      for (const det of [-6, 6]) {
        const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, t0 + d); fl.frequency.exponentialRampToValueAtTime(3600, t0 + d + 0.08);
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.13, t0 + d + 0.04); g.gain.setValueAtTime(0.13, t0 + d + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + len);
        o.connect(fl); fl.connect(g); g.connect(this.out); o.start(t0 + d); o.stop(t0 + d + len + 0.05);
      }
    });
    // a cymbal swell under the last note
    const s = c.createBufferSource(), hf = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; hf.type = 'highpass'; hf.frequency.value = 5000;
    g.gain.setValueAtTime(0.0001, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
    s.connect(hf); hf.connect(g); g.connect(this.out); s.start(t0 + 0.2, Math.random()); s.stop(t0 + 2.7);
  },
  somber() {
    if (!this.ctx) return;
    const t0 = this.t + 0.05;
    [[220, 0], [174.6, 0.45], [146.8, 0.9]].forEach(([f, d], i) => this.tone(0, t0 + d, i === 2 ? 2.2 : 0.6, f, 'triangle', 0.22));
    this.tone(0, t0, 3.2, 55, 'sawtooth', 0.08, 50);
  },
  // Title-screen ambience: night insects, a low jungle hum, far-off groans, thunder with the lightning.
  amb: null, ambOn: false,
  ambience(on) {
    if (!this.ctx) return;
    this.ambOn = on;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.amb) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.out);
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      // crickets: a narrow band of noise pulsed fast, swelling slowly
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4700; bp.Q.value = 9;
      const chirp = ctx.createGain(); chirp.gain.value = 0;
      const fast = ctx.createOscillator(); fast.type = 'square'; fast.frequency.value = 26;
      const fastAmt = ctx.createGain(); fastAmt.gain.value = 0.5; fast.connect(fastAmt); fastAmt.connect(chirp.gain);
      const slow = ctx.createOscillator(); slow.frequency.value = 0.6;
      const slowAmt = ctx.createGain(); slowAmt.gain.value = 0.35; slow.connect(slowAmt); slowAmt.connect(chirp.gain);
      src.connect(bp); bp.connect(chirp); const cg = ctx.createGain(); cg.gain.value = 0.5; chirp.connect(cg); cg.connect(out);
      // low hum of the jungle
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const hum = ctx.createGain(); hum.gain.value = 0.25; src.connect(lp); lp.connect(hum); hum.connect(out);
      src.start(); fast.start(); slow.start();
      this.amb = { out };
      setInterval(() => { if (this.ambOn && !this.muted && Math.random() < 0.35) this.groan(0.08); }, 7000);
    }
    this.amb.out.gain.setTargetAtTime(on ? 0.35 : 0, t, 0.6);
  },
  thunder() {
    if (!this.ctx || !this.ambOn) return;
    const t = this.t + 0.4 + Math.random() * 0.9;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 140;
    s.connect(f); f.connect(g); g.connect(this.panNode(Math.random() * 1.2 - 0.6));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    s.start(t); s.stop(t + 3.3);
  },
  // Play a one-off recorded file (like a character's backstory line); only one plays at a time.
  files: {}, current: null,
  playFile(url) {
    if (!this.ctx) return;
    this.stopFile();
    const token = this.current = {};
    const get = this.files[url] || (this.files[url] = fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => this.ctx.decodeAudioData(b)));
    get.then(buf => {
      if (this.current !== token) return;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = buf; g.gain.value = 1.4; s.connect(g); g.connect(this.out); s.start(this.t + 0.25);
      token.src = s;
    }).catch(() => {});
  },
  stopFile() { if (this.current && this.current.src) { try { this.current.src.stop(); } catch (e) {} } this.current = null; },
  // Running for the airstrip: pounding footsteps and a racing heartbeat.
  run(dur) {
    if (!this.ctx) return;
    const t0 = this.t;
    for (let k = 0; k < dur / 0.27; k++) this.burst(k % 2 ? 0.3 : -0.3, t0 + k * 0.27, 0.07, 380, 'lowpass', 0.5);
    for (let k = 0; k < dur / 0.5; k++) {
      this.tone(0, t0 + k * 0.5, 0.12, 62, 'sine', 0.7, 45);
      this.tone(0, t0 + k * 0.5 + 0.16, 0.1, 58, 'sine', 0.5, 42);
    }
  },
  // Recorded character lines: assets/voice/<voice>-<line>.mp3 (voice = female or male). Missing files stay silent.
  voices: {},
  loadVoices(voice) {
    if (!this.ctx || this.voices[voice]) return;
    const set = this.voices[voice] = {};
    for (const line of ['clear', 'engine', 'mistake', 'whoa', 'airborne']) {
      fetch(`assets/voice/${voice}-${line}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(b => this.ctx.decodeAudioData(b)).then(buf => { set[line] = buf; }).catch(() => {});
    }
  },
  voice(voice, line) {
    const buf = this.ctx && this.voices[voice] && this.voices[voice][line];
    if (!buf) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; g.gain.value = 1.4;
    s.connect(g); g.connect(this.out); s.start();
    return true;
  },
  shout(text) {
    if (this.muted || !window.speechSynthesis) return;
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.25; u.pitch = 0.9; speechSynthesis.speak(u); } catch (e) { /* no speech, no problem */ }
  },
};

// While the bot plays, its clicks and sputters stay silent (its engine is still heard, quietly).
for (const k of ['click', 'dud', 'prime', 'sputter', 'caught', 'bang', 'groan', 'win', 'lose', 'shout']) {
  const f = Sfx[k];
  Sfx[k] = function (...a) { if (this.quiet) return; return f.apply(this, a); };
}

// One continuous engine + starter + stall-horn voice per plane. `level` makes the rival's engine quieter.
G.EngineVoice = class EngineVoice {
  constructor(pan, level = 1) {
    const ctx = Sfx.ctx;
    this.level = level;
    this.nodes = [];
    const mk = n => (this.nodes.push(n), n);
    this.pan = mk(Sfx.panNode(pan));
    this.vol = mk(ctx.createGain()); this.vol.gain.value = 0; this.vol.connect(this.pan);
    this.am = mk(ctx.createGain()); this.am.gain.value = 0.6; this.am.connect(this.vol);
    this.lfo = mk(ctx.createOscillator()); this.lfo.frequency.value = 6;
    const depth = mk(ctx.createGain()); depth.gain.value = 0.45;
    this.lfo.connect(depth); depth.connect(this.am.gain);
    this.filter = mk(ctx.createBiquadFilter()); this.filter.type = 'lowpass'; this.filter.Q.value = 2; this.filter.connect(this.am);
    this.o1 = mk(ctx.createOscillator()); this.o1.type = 'sawtooth'; this.o1.connect(this.filter);
    this.o2 = mk(ctx.createOscillator()); this.o2.type = 'square';
    const g2 = mk(ctx.createGain()); g2.gain.value = 0.3; this.o2.connect(g2); g2.connect(this.filter);
    // prop wash and wind
    this.ns = mk(ctx.createBufferSource()); this.ns.buffer = Sfx.noise; this.ns.loop = true;
    const nf = mk(ctx.createBiquadFilter()); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6;
    this.ng = mk(ctx.createGain()); this.ng.gain.value = 0;
    this.ns.connect(nf); nf.connect(this.ng); this.ng.connect(this.am);
    // starter whine
    this.sw = mk(ctx.createOscillator()); this.sw.type = 'triangle'; this.sw.frequency.value = 620;
    this.sg = mk(ctx.createGain()); this.sg.gain.value = 0;
    this.sw.connect(this.sg); this.sg.connect(this.am);
    // stall horn
    this.horn = mk(ctx.createOscillator()); this.horn.type = 'square'; this.horn.frequency.value = 640;
    const hf = mk(ctx.createBiquadFilter()); hf.type = 'lowpass'; hf.frequency.value = 1800;
    this.hg = mk(ctx.createGain()); this.hg.gain.value = 0;
    this.horn.connect(hf); hf.connect(this.hg); this.hg.connect(this.pan);
    [this.lfo, this.o1, this.o2, this.ns, this.sw, this.horn].forEach(n => n.start());
  }
  update(p) {
    const t = Sfx.ctx.currentTime, k = 0.06, rpm = Math.max(1, p.rpm), run = p.running, L = this.level;
    this.lfo.frequency.setTargetAtTime(Math.max(4, rpm / 60 * 2), t, k);
    this.o1.frequency.setTargetAtTime(run ? 38 + rpm * 0.04 : 34, t, k);
    this.o2.frequency.setTargetAtTime(run ? 19 + rpm * 0.02 : 17, t, k);
    this.filter.frequency.setTargetAtTime(run ? 260 + rpm * 0.5 : 320, t, k);
    let v = run ? 0.22 + p.throttle * 0.28 : p.cranking ? 0.2 : 0;
    if (p.airborne) v *= 0.6;
    this.vol.gain.setTargetAtTime(v * L, t, 0.08);
    this.sg.gain.setTargetAtTime(p.cranking ? 0.06 : 0, t, 0.03);
    this.ng.gain.setTargetAtTime(run ? 0.06 + p.throttle * 0.22 + p.speed / 500 : 0, t, 0.1);
    this.hg.gain.setTargetAtTime(p.stall ? 0.12 * L : 0, t, 0.02);
  }
  stop() {
    this.nodes.forEach(n => { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
  }
};
})();
