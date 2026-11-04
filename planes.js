/* Parked light aircraft seen from above, drawn in code from real top-view proportions (meters).
   Cessna 172 (high wing, struts, tapered outer wing), Cessna 150 (smaller 172), Piper Cherokee (low "Hershey bar" wing,
   stabilator), Piper Cub (yellow fabric taildragger), Beechcraft Baron (low-wing twin).
   Local frame: nose points +x, the left wing is -y. One unit = one meter. */
(() => {
'use strict';
const G = window.G = window.G || {};
const TAU = Math.PI * 2;
const K = 40;                       // pixels per meter in the jungle view (a person is ~1.7 m)
const SHADOW = [-0.7, 1.0];         // dusk light from the upper right, so shadows fall down-left (meters, world frame)

// ---------- shapes ----------
const mirror = pts => [...pts, ...pts.slice().reverse().map(([x, y]) => [x, -y])];
const TYPES = {
  c172: {
    high: true, span: 5.5, len: [3.3, -5.05],
    fus: mirror([[3.0, 0.42], [2.2, 0.55], [1.5, 0.6], [0.4, 0.6], [-0.9, 0.55], [-2.6, 0.34], [-4.6, 0.14], [-5.05, 0.1]]),
    wing: [[0.85, 0.5], [0.85, 2.6], [0.68, 5.35], [0.5, 5.5], [-0.42, 5.5], [-0.5, 5.35], [-0.75, 2.6], [-0.75, 0.5]],
    tail: [[-4.1, 0.15], [-4.3, 1.7], [-4.85, 1.75], [-4.95, 0.15]],
    fin: [-3.4, -5.05], glass: [[0.85, 1.6, 0.5, 0.42], [-0.75, -1.55, 0.46, 0.3]], wheels: [[-0.95, 1.25], [-0.95, -1.25]],
    spinner: 3.25, prop: 0.95,
  },
  cherokee: {
    high: false, span: 4.6, len: [3.1, -4.2],
    fus: mirror([[2.9, 0.42], [1.9, 0.56], [0.8, 0.6], [-0.9, 0.55], [-2.7, 0.3], [-4.2, 0.12]]),
    wing: [[0.55, 0.5], [0.55, 4.45], [0.42, 4.6], [-0.92, 4.6], [-1.05, 4.45], [-1.05, 0.5]],
    tail: [[-3.55, 0.12], [-3.55, 1.5], [-4.2, 1.5], [-4.2, 0.12]],
    fin: [-3.1, -4.2], glass: [[-0.5, 1.45, 0.52, 0.4]], wheels: [],
    spinner: 3.1, prop: 0.95,
  },
  cub: {
    high: true, span: 5.35, len: [2.7, -4.2],
    fus: mirror([[2.5, 0.36], [1.6, 0.4], [0.2, 0.4], [-1.5, 0.3], [-3.6, 0.12], [-4.2, 0.08]]),
    wing: [[0.75, 0.4], [0.75, 5.0], [0.55, 5.32], [-0.65, 5.32], [-0.85, 5.0], [-0.85, 0.4]],
    tail: [[-3.55, 0.1], [-3.65, 1.4], [-4.05, 1.5], [-4.15, 0.1]],
    fin: [-3.3, -4.25], glass: [[0.75, 1.3, 0.34, 0.3]], wheels: [[1.15, 0.9], [1.15, -0.9], [-4.0, 0]],
    spinner: 2.65, prop: 0.95,
  },
  baron: {
    high: false, span: 5.75, len: [3.7, -5.5],
    fus: mirror([[3.5, 0.3], [2.6, 0.56], [1.2, 0.64], [-1.0, 0.6], [-3.0, 0.32], [-5.5, 0.12]]),
    wing: [[0.9, 0.6], [0.5, 5.6], [0.35, 5.75], [-0.62, 5.75], [-0.75, 5.6], [-1.2, 0.6]],
    tail: [[-4.6, 0.12], [-4.75, 2.3], [-5.3, 2.3], [-5.45, 0.12]],
    fin: [-4.2, -5.5], glass: [[0.0, 1.4, 0.52, 0.38]], wheels: [],
    nacelles: [1.9, -1.9], spinner: 2.35, prop: 0.95,
  },
};
TYPES.c150 = { ...TYPES.c172, scale: 0.88 };

function path(ctx, pts, ySign = 1) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y * ySign) : ctx.moveTo(x, y * ySign));
  ctx.closePath();
}
function wingPath(ctx, T) { // both wings as one shape
  ctx.beginPath();
  for (const s of [1, -1]) { T.wing.forEach(([x, y], i) => i ? ctx.lineTo(x, y * s) : ctx.moveTo(x, y * s)); ctx.closePath(); }
}
function tailPath(ctx, T) {
  ctx.beginPath();
  for (const s of [1, -1]) { T.tail.forEach(([x, y], i) => i ? ctx.lineTo(x, y * s) : ctx.moveTo(x, y * s)); ctx.closePath(); }
}
function nacelles(ctx, T, fill) {
  if (!T.nacelles) return;
  for (const y of T.nacelles) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(0.75, y, 1.5, 0.32, 0, 0, TAU); ctx.fill(); }
}

// everything that casts a shadow, as one flat shape
function silhouette(ctx, T, fill) {
  ctx.fillStyle = fill;
  wingPath(ctx, T); ctx.fill();
  path(ctx, T.fus); ctx.fill();
  tailPath(ctx, T); ctx.fill();
  nacelles(ctx, T, fill);
}

// ---------- the ground around a parked plane: worn grass, chocks, ropes, fuel cans ----------
function ground(ctx, p, T) {
  // worn dirt where the wheels sit
  for (const [x, y] of T.wheels.length ? T.wheels : [[-0.9, 1.2], [-0.9, -1.2], [2.2, 0]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 0.6);
    g.addColorStop(0, 'rgba(90,66,40,0.45)'); g.addColorStop(1, 'rgba(90,66,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 0.6, 0.4, 0, 0, TAU); ctx.fill();
  }
  if (p.oil) { ctx.fillStyle = 'rgba(15,12,10,0.45)'; ctx.beginPath(); ctx.ellipse(1.6, 0.3, 0.7, 0.4, 0.4, 0, TAU); ctx.fill(); }
  const chock = (x, y) => { ctx.fillStyle = '#d9a520'; ctx.fillRect(x - 0.2, y - 0.12, 0.4, 0.24); ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 0.04; ctx.strokeRect(x - 0.2, y - 0.12, 0.4, 0.24); };
  const mains = T.wheels.length ? T.wheels.slice(0, 2) : [[-0.9, 1.2], [-0.9, -1.2]];
  if (p.flyable) {
    // chocks already pulled and tossed aside, fuel cans by the nose, the key lockbox open
    chock(mains[0][0] - 1.6, mains[0][1] + 0.9); chock(mains[1][0] - 1.4, mains[1][1] - 1.1);
    for (const [x, y] of [[2.4, 1.5], [2.0, 1.9]]) {
      ctx.fillStyle = '#b8261d'; ctx.fillRect(x - 0.22, y - 0.16, 0.44, 0.32);
      ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x + 0.12, y - 0.06, 0.08, 0.12);
    }
    ctx.fillStyle = '#6d7076'; ctx.fillRect(-1.6, -1.9, 0.36, 0.28);
    ctx.fillStyle = '#2b2d31'; ctx.fillRect(-1.56, -1.86, 0.28, 0.2);
    ctx.fillStyle = '#ffd970'; ctx.beginPath(); ctx.arc(-1.42, -1.76, 0.05, 0, TAU); ctx.fill();
  } else {
    for (const [x, y] of mains) { chock(x + 0.4, y); chock(x - 0.4, y); }
    // tie-down ropes from the wingtips to stakes in the ground
    ctx.strokeStyle = 'rgba(210,190,150,0.8)'; ctx.lineWidth = 0.05;
    for (const s of [1, -1]) {
      const tip = (T.span - 0.5) * s;
      ctx.beginPath(); ctx.moveTo(-0.1, tip); ctx.lineTo(-0.6, tip + 0.9 * s); ctx.stroke();
      ctx.fillStyle = '#3a2b1a'; ctx.beginPath(); ctx.arc(-0.6, tip + 0.9 * s, 0.08, 0, TAU); ctx.fill();
    }
  }
}

// ---------- the plane itself ----------
function body(ctx, p, T, t) {
  const white = p.paint || '#efece3', grimy = !p.flyable;
  const wingGrad = (x0, x1, light) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, light); g.addColorStop(0.35, white); g.addColorStop(1, shadeHex(white, 0.8));
    return g;
  };
  const drawWing = () => {
    ctx.fillStyle = wingGrad(T.wing[0][0], T.wing[T.wing.length - 1][0], shadeHex(white, 1.08));
    wingPath(ctx, T); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.04; ctx.stroke();
    // flap and aileron hinge lines, a few panel seams, the stripe across the wingtips
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.03;
    const te = T.wing[T.wing.length - 1][0];
    for (const s of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(te + 0.38, 0.7 * s); ctx.lineTo(te + 0.38, (T.span - 0.4) * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(te, T.span * 0.5 * s); ctx.lineTo(te + 0.38, T.span * 0.5 * s); ctx.stroke();
      for (let k = 1; k < 4; k++) { const y = (0.6 + k * (T.span - 0.6) / 4) * s; ctx.beginPath(); ctx.moveTo(T.wing[0][0] - 0.05, y); ctx.lineTo(te + 0.4, y); ctx.stroke(); }
    }
    ctx.save(); wingPath(ctx, T); ctx.clip();
    ctx.fillStyle = p.stripe; ctx.globalAlpha = 0.85;
    for (const s of [1, -1]) ctx.fillRect(-2, (T.span - 0.75) * s - (s < 0 ? 0.4 : 0), 4, 0.4);
    ctx.globalAlpha = 1;
    if (grimy) for (const [x, y, r] of p.grime) { ctx.fillStyle = 'rgba(70,90,50,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, x, 0, TAU); ctx.fill(); }
    ctx.restore();
    // registration painted on top of the right wing
    ctx.save(); ctx.translate(-0.1, T.span * 0.55); ctx.rotate(Math.PI / 2 + (Math.sin(p.rot) > 0 ? Math.PI : 0));   // keep it readable
    ctx.scale(1 / K, 1 / K); ctx.fillStyle = 'rgba(25,25,30,0.85)'; ctx.font = `800 ${0.62 * K}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.reg, 0, 0);
    ctx.restore();
    // fuel caps on top of each wing; the Cherokee's dark non-slip walkway at the left wing root
    const capX = (T.wing[0][0] + T.wing[T.wing.length - 1][0]) / 2;
    for (const y of [-T.span * 0.42, T.span * 0.42]) {
      ctx.fillStyle = '#9a9ca0'; ctx.beginPath(); ctx.arc(capX, y, 0.09, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.02; ctx.stroke();
    }
    if (p.kind === 'cherokee') { ctx.fillStyle = 'rgba(25,25,28,0.75)'; ctx.fillRect(T.wing[T.wing.length - 1][0] + 0.1, -1.25, T.wing[0][0] - T.wing[T.wing.length - 1][0] - 0.2, 0.6); }
    // nav lights: red on the left wingtip, green on the right
    for (const [y, c] of [[-T.span, '#ff3030'], [T.span, '#30ff70']]) {
      const g = ctx.createRadialGradient(0, y, 0, 0, y, 0.6);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, y, 0.6, 0, TAU); ctx.fill();
    }
  };
  const drawFuselage = () => {
    const g = ctx.createLinearGradient(0, -0.6, 0, 0.6);
    g.addColorStop(0, shadeHex(white, 0.82)); g.addColorStop(0.45, shadeHex(white, 1.06)); g.addColorStop(1, shadeHex(white, 0.78));
    ctx.fillStyle = g; path(ctx, T.fus); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.04; ctx.stroke();
    // the stripe down both sides, a bit faded
    ctx.save(); path(ctx, T.fus); ctx.clip();
    ctx.fillStyle = p.stripe; ctx.globalAlpha = 0.8;
    ctx.fillRect(T.len[1], 0.32, T.len[0] - T.len[1], 0.14); ctx.fillRect(T.len[1], -0.46, T.len[0] - T.len[1], 0.14);
    ctx.globalAlpha = 1;
    // cowling seams and the darker anti-glare panel ahead of the windshield
    ctx.fillStyle = 'rgba(30,30,35,0.35)'; ctx.fillRect(T.glass[0][1], -0.2, 0.5, 0.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(T.len[0] - 1.2, -0.6); ctx.lineTo(T.len[0] - 1.2, 0.6); ctx.stroke();
    ctx.restore();
  };
  const drawGlass = () => {
    for (const [x0, x1, w0, w1] of T.glass) {
      const g = ctx.createLinearGradient(x1, 0, x0, 0);
      g.addColorStop(0, '#1d2b38'); g.addColorStop(1, '#3d5a73');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, -w0); ctx.lineTo(x1, -w1); ctx.lineTo(x1, w1); ctx.lineTo(x0, w0); ctx.closePath(); ctx.fill();
      // a glint of the last light
      ctx.strokeStyle = `rgba(255,235,210,${0.35 + 0.15 * Math.sin(t * 0.7 + p.x)})`; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * 0.2, -w0 * 0.6); ctx.lineTo(x0 + (x1 - x0) * 0.7, w0 * 0.2); ctx.stroke();
    }
  };
  const drawTail = () => {
    ctx.fillStyle = shadeHex(white, 0.95); tailPath(ctx, T); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.04; ctx.stroke();
    ctx.fillStyle = shadeHex(white, 0.75); ctx.fillRect(T.fin[1], -0.07, T.fin[0] - T.fin[1], 0.14);   // the fin, edge-on from above
    ctx.fillStyle = p.stripe; ctx.fillRect(T.fin[1], -0.07, 0.5, 0.14);
  };
  const drawNose = () => {
    const props = T.nacelles ? T.nacelles.map(y => [T.spinner, y]) : [[T.spinner, 0]];
    for (const [x, y] of props) {
      if (T.nacelles) { ctx.fillStyle = shadeHex(white, 0.92); ctx.beginPath(); ctx.ellipse(0.75, y, 1.5, 0.32, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.04; ctx.stroke(); }
      if (p.noProp) { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x - 0.1, y, 0.1, 0, TAU); ctx.fill(); continue; }
      ctx.strokeStyle = '#1b1b1d'; ctx.lineWidth = 0.14; ctx.lineCap = 'round';
      const a = p.propAngle + y;
      ctx.beginPath(); ctx.moveTo(x, y - Math.cos(a) * T.prop); ctx.lineTo(x, y + Math.cos(a) * T.prop); ctx.stroke();
      ctx.fillStyle = '#d9d9d9'; ctx.beginPath(); ctx.ellipse(x, y, 0.22, 0.17, 0, 0, TAU); ctx.fill();
    }
  };
  const drawWheels = () => {
    T.wheels.forEach(([x, y], i) => {
      const flat = p.flatTire && i === 0;
      ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.ellipse(x, y, flat ? 0.34 : 0.27, flat ? 0.16 : 0.1, 0, 0, TAU); ctx.fill();
    });
  };

  if (T.high) {
    // high wing: wheels and tail show, the wing sits over the cabin
    drawWheels(); drawTail(); drawFuselage(); drawGlass(); drawNose(); drawWing();
    // the windshield just ahead of the wing still shows
    const [x0, x1, w0, w1] = T.glass[0];
    ctx.fillStyle = '#2a3d50'; ctx.beginPath(); ctx.moveTo(T.wing[0][0], -w0); ctx.lineTo(x1, -w1); ctx.lineTo(x1, w1); ctx.lineTo(T.wing[0][0], w0); ctx.closePath(); ctx.fill();
    void x0;
  } else {
    // low wing: the wing sits under the cabin, so the cabin glass shows on top
    drawWheels(); drawWing(); nacelles(ctx, T, shadeHex(white, 0.92)); drawTail(); drawFuselage(); drawGlass(); drawNose();
  }
  if (p.bulletHoles) {
    ctx.fillStyle = '#111';
    for (const [x, y] of [[-0.1, 2.2], [0.2, 2.6], [-0.3, 2.9], [0.1, 3.3], [-0.5, 2.5]]) { ctx.beginPath(); ctx.arc(x, y, 0.07, 0, TAU); ctx.fill(); }
  }
  if (p.cover) {
    // a canvas cover, half pulled off, with ropes hanging
    ctx.fillStyle = '#5b6146';
    ctx.beginPath(); ctx.moveTo(1.7, -0.8); ctx.lineTo(1.0, -2.6); ctx.lineTo(-1.1, -2.9); ctx.lineTo(-1.9, -0.6); ctx.lineTo(-1.4, 1.2); ctx.lineTo(0.3, 1.6); ctx.lineTo(1.5, 0.9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.05;
    for (const [a, b, c, d] of [[1.2, -1.8, -1.2, -1.2], [0.8, -0.2, -1.4, 0.4], [-0.3, -2.6, -0.6, 1.2]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(210,190,150,0.8)';
    ctx.beginPath(); ctx.moveTo(-1.9, -0.6); ctx.quadraticCurveTo(-2.6, -1.2, -2.8, -2.2); ctx.stroke();
  }
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

G.Planes = {
  K,
  // a plane's length in pixels, for parking and collisions
  size(p) { const T = TYPES[p.kind]; return { len: (T.len[0] - T.len[1]) * K * (T.scale || 1), span: T.span * 2 * K * (T.scale || 1) }; },
  draw(ctx, p, t) {
    const T = TYPES[p.kind], sc = (T.scale || 1) * K;
    if (!p.grime) p.grime = Array.from({ length: 7 }, (_, i) => [((i * 37) % 13) / 13 * 1.6 - 0.9, ((i * 53) % 17) / 17 * T.span * 2 - T.span, 0.3 + (i % 3) * 0.2]);
    if (p.propAngle == null) p.propAngle = (p.x * 7.3) % TAU;
    // shadow on the ground (higher wings throw it farther)
    const lift = T.high ? 1.3 : 1;
    if (!p.inFlight) {   // parked: a shadow on the ground (in flight, the flight draws one far below)
    ctx.save(); ctx.translate(p.x + SHADOW[0] * sc * lift, p.y + SHADOW[1] * sc * lift); ctx.rotate(p.rot);
    if (p.flatTire) ctx.rotate(0.04);
    ctx.filter = 'blur(5px)';   // a soft dusk shadow (browsers without canvas filters just get a sharp one)
    ctx.scale(sc, sc); silhouette(ctx, T, 'rgba(0,0,0,0.32)'); ctx.restore();
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sc, sc);
    if (!p.inFlight) ground(ctx, p, T);   // chocks, ropes and fuel cans stay on the ground
    body(ctx, p, T, t);
    ctx.restore();
  },
  // points along the fuselage you can't walk through (world coordinates)
  solid(p) {
    const T = TYPES[p.kind], sc = (T.scale || 1) * K, c = Math.cos(p.rot), s = Math.sin(p.rot);
    const out = [];
    for (let x = T.len[0] - 0.6; x >= T.len[1] + 0.8; x -= 1.0) out.push({ x: p.x + c * x * sc, y: p.y + s * x * sc, r: 0.65 * sc });
    if (T.nacelles) for (const y of T.nacelles) out.push({ x: p.x - s * y * sc + c * 0.8 * sc, y: p.y + c * y * sc + s * 0.8 * sc, r: 0.45 * sc });
    return out;
  },
};
})();
