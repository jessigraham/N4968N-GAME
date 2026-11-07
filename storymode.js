/* Story mode, played in first person. Chapter 1, The Last Night: you walk the same camp as the race, on the evening everything went wrong.
   Look around, talk to the rest of your team, and make choices that are saved for the next chapter.
   The script reads top to bottom: `await line(...)` shows a line, `await ask(...)` waits for a choice.
   Text only for now; see story.md for the words and the plan for later chapters. */
(() => {
'use strict';
const G = window.G = window.G || {};
const $ = s => document.querySelector(s);
const SAVE = 'n4968n-story';

// Where everyone stands. x, y on the ground, panorama space, same as camp.js.
const TEAM = {
  ivy:   { x: 0.300, y: 0.775, face: 1 },
  elias: { x: 0.430, y: 0.750, face: 1 },
  wren:  { x: 0.725, y: 0.800, face: -1 },
  kip:   { x: 0.860, y: 0.835, face: -1 },
  briar: { x: 0.610, y: 0.860, face: -1 },
};
const CLUES = {
  radio: { x: 0.150, y: 0.655, gx: 0.190, gy: 0.770, prompt: 'Space or tap: look at the radio table' },
  log:   { x: 0.655, y: 0.600, gx: 0.650, gy: 0.775, prompt: 'Space or tap: read the logbook on the crates' },
  prints: { x: 0.548, y: 0.680, gx: 0.545, gy: 0.705, prompt: 'Space or tap: look at the mud on the trail' },
};
const SUPPLIES = {
  medkit: { x: 0.145, y: 0.850, gx: 0.190, gy: 0.860, name: 'the med kit', prompt: 'Space or tap: grab the med kit' },
  flare:  { x: 0.650, y: 0.835, gx: 0.660, gy: 0.880, name: 'the flare gun', prompt: 'Space or tap: grab the flare gun' },
  fuel:   { x: 0.692, y: 0.725, gx: 0.695, gy: 0.775, name: 'the fuel can', prompt: 'Space or tap: grab the fuel can' },
};
const TRAIL = { x: 0.545, y: 0.665 }, DOCK = { x: 0.965, y: 0.84 };

let run = 0, S = null, scene = null, cool = 0, finishDash = null, dashT = 0;
const built = () => document.getElementById('sm');
const short = id => G.CHARS[id].short;
const others = () => Object.keys(TEAM).filter(id => id !== S.char);

function build() {
  if (built()) return;
  const el = document.createElement('div');
  el.id = 'sm'; el.className = 'hidden';
  el.innerHTML = `
    <button id="smQuit" type="button">Quit</button>
    <div id="smRun" class="hidden"><span id="smRunText"></span><div><i id="smRunBar"></i></div></div>
    <div id="smTalk" class="hidden">
      <img id="smFace" alt="">
      <div id="smBody">
        <p id="smWho"></p><p id="smText"></p>
        <div id="smChoices"></div>
        <div id="smClock" class="hidden"><i id="smClockBar"></i></div>
        <div id="smNext">Space or tap to continue</div>
      </div>
    </div>
    <div id="smCard" class="hidden"><div class="inner" id="smCardIn"></div></div>`;
  document.body.appendChild(el);
  $('#smQuit').addEventListener('click', () => G.toMenu());
  $('#smTalk').addEventListener('click', e => { if (!e.target.closest('#smChoices') && next) next(); });
  window.addEventListener('keydown', e => {
    if (!scene || e.repeat) return;
    if (next && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); next(); return; }
    const n = /^Digit([1-4])$/.exec(e.code);
    if (n) { const b = $('#smChoices').children[n[1] - 1]; if (b) b.click(); }
  });
}

// Briar is the only voiced part of the story so far; everyone else is text
const VOICED = {
  'Nobody’s telling me anything, so I climbed the big palm and looked. There’s people on the ridge trail. They’re walking weird.': 't1',
  'I can get us past them. I know a shortcut. Are you going to tell me to go to my tent?': 't2',
  'Finally. Keep up. And don’t step on the snake log.': 't3',
  'That’s what the tiger said. Before.': 't4',
  'I’m ten, not dumb. Thanks for not hiding it. I’m coming with you.': 't5',
  'Still walking weird. Closer now, though.': 't6',
};

// ---------- the talk panel ----------
let next = null, clockTimer = 0;
function panel(who, text) {
  const face = $('#smFace');
  face.classList.toggle('hidden', !who);
  if (who) face.src = G.art(`${who}.png`);
  $('#smWho').textContent = who ? G.CHARS[who].name : '';
  $('#smWho').classList.toggle('hidden', !who);
  $('#smText').textContent = text;
  $('#smText').classList.toggle('thought', !who);
  $('#smChoices').innerHTML = '';
  $('#smClock').classList.add('hidden');
  $('#smTalk').classList.remove('hidden');
  scene.paused = true;
  G.Sfx.stopFile();
  if (who === 'briar' && VOICED[text]) G.Sfx.playFile(`assets/voice/briar-${VOICED[text]}.mp3`);
}
function closePanel() {
  $('#smTalk').classList.add('hidden');
  G.Sfx.stopFile();
  scene.paused = false;
  cool = performance.now() + 250;   // the key that closed this doesn't also open the next thing
}
function line(who, text) {
  const mine = run;
  panel(who, text);
  $('#smNext').classList.remove('hidden');
  return new Promise(res => { next = () => { next = null; if (mine === run) res(); }; });
}
// choices: [{ text, clue? }]; opts.time: seconds before it picks nothing (returns -1)
function ask(who, text, choices, opts = {}) {
  const mine = run;
  panel(who, text);
  next = null;
  $('#smNext').classList.add('hidden');
  return new Promise(res => {
    const done = i => { clearInterval(clockTimer); if (mine === run) res(i); };
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; if (c.clue) b.className = 'clue';
      b.innerHTML = `<span class="num">${i + 1}</span>`;
      b.append(c.text);
      b.addEventListener('click', () => done(i));
      $('#smChoices').appendChild(b);
    });
    if (opts.time) {
      const end = performance.now() + opts.time * 1000;
      $('#smClock').classList.remove('hidden');
      clearInterval(clockTimer);
      clockTimer = setInterval(() => {
        const left = (end - performance.now()) / (opts.time * 1000);
        $('#smClockBar').style.transform = `scaleX(${Math.max(0, left)})`;
        if (left <= 0) done(-1);
      }, 50);
    }
  });
}
const wait = ms => { const mine = run; return new Promise(res => setTimeout(() => { if (mine === run) res(); }, ms)); };
function card(html, button) {
  const mine = run;
  const c = $('#smCard');
  $('#smCardIn').innerHTML = html;
  c.classList.remove('hidden');
  if (!button) return Promise.resolve();
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'hero-btn'; b.textContent = button;
  $('#smCardIn').appendChild(b);
  return new Promise(res => b.addEventListener('click', () => { c.classList.add('hidden'); if (mine === run) res(); }));
}

// ---------- the people: each one has something to say, and how you answer decides who follows you later ----------
const SHOW = 'Show them Teo’s log page';
const TALKS = {
  async ivy() {
    await line('ivy', 'Don’t touch anything on that table without gloves. Teo’s blood work came back an hour ago.');
    await line('ivy', 'It isn’t the fever we’ve been treating. It’s the same fever, doing something new.');
    const c = await ask('ivy', 'I haven’t told the others. Should I?', [
      { text: 'Tell them. They deserve to know.' },
      { text: 'Wait until we’re sure.' },
      ...(S.page ? [{ text: SHOW, clue: true }] : []),
    ]);
    if (c === 0) { S.trust.ivy = true; await line('ivy', 'Good. I wanted someone to say that.'); }
    else if (c === 1) { S.trust.ivy = false; await line('ivy', 'Sure of what? Fine. It’s on you, then.'); }
    else { S.trust.ivy = true; await line('ivy', '“Feel fine.” Three times. That’s not a symptom I have a name for. Stay close to me.'); }
  },
  async wren() {
    await line('wren', 'Every bird on this island went quiet at six o’clock. Birds don’t do that.');
    const c = await ask('wren', 'I say we pack light and walk out tonight, before whatever scared them gets here.', [
      { text: 'I’m with you. Tell me when.' },
      { text: 'Nobody walks into that jungle in the dark.' },
      ...(S.page ? [{ text: SHOW, clue: true }] : []),
    ]);
    if (c === 0) { S.trust.wren = true; await line('wren', 'Then stay where I can see you, and keep your boots on.'); }
    else if (c === 1) { S.trust.wren = false; await line('wren', 'Eleven jungles says the dark isn’t what kills you. Your call.'); }
    else { S.trust.wren = true; await line('wren', 'He wrote that an hour ago? Then we don’t have until morning. Good thing you found it.'); }
  },
  async elias() {
    await line('elias', 'My ferns have all turned toward the tree line. Every one. Since about six.');
    const c = await ask('elias', 'I realize how that sounds.', [
      { text: 'Show me.' },
      { text: 'Elias, not now.' },
      ...(S.page ? [{ text: SHOW, clue: true }] : []),
    ]);
    if (c === 0) { S.trust.elias = true; await line('elias', 'Thank you. Truly. Nobody ever asks. Look, even this little guy is leaning.'); }
    else if (c === 1) { S.trust.elias = false; await line('elias', 'No. Of course. Never now.'); }
    else { S.trust.elias = true; await line('elias', 'Oh, Teo. He watered these for me when I had the flu. Whatever you decide, I’ll come with you.'); }
  },
  async kip() {
    await line('kip', 'Good news, I finally figured out which way north is.');
    await line('kip', 'Bad news, it’s the way all the footprints are going. Is that bad? That feels bad.');
    const c = await ask('kip', 'Should I be scared? I can’t tell. The frog looks scared.', [
      { text: 'Stay close to me and you’ll be fine.' },
      { text: 'Go keep an eye on the dock.' },
      ...(S.page ? [{ text: SHOW, clue: true }] : []),
    ]);
    if (c === 0) { S.trust.kip = true; await line('kip', 'Close. Got it. The frog and I are excellent at close.'); }
    else if (c === 1) { S.trust.kip = false; await line('kip', 'The dock. Which is, uh. Yep. Going.'); }
    else { S.trust.kip = true; await line('kip', 'Okay. Okay, so yes, scared. Thanks for telling me straight. Almost nobody does.'); }
  },
};
TALKS.briar = async () => {
  await line('briar', 'Nobody’s telling me anything, so I climbed the big palm and looked. There’s people on the ridge trail. They’re walking weird.');
  const c = await ask('briar', 'I can get us past them. I know a shortcut. Are you going to tell me to go to my tent?', [
    { text: 'No. Show me the shortcut.' },
    { text: 'Go to your tent, Briar.' },
    ...(S.page ? [{ text: SHOW, clue: true }] : []),
  ]);
  if (c === 0) { S.trust.briar = true; await line('briar', 'Finally. Keep up. And don’t step on the snake log.'); }
  else if (c === 1) { S.trust.briar = false; await line('briar', 'That’s what the tiger said. Before.'); }
  else { S.trust.briar = true; await line('briar', 'I’m ten, not dumb. Thanks for not hiding it. I’m coming with you.'); }
};
const AGAIN = {
  briar: 'Still walking weird. Closer now, though.',
  ivy: 'Keep your hands away from your face. I mean it.',
  wren: 'Clock’s running. Find what you need to find.',
  elias: 'They’re still leaning. I’ve stopped pretending they aren’t.',
  kip: 'Still north. I checked twice.',
};

const LOOKS = {
  async radio() {
    await line(null, 'The radio table. The handset has been torn off by its cord. The wires behind it are chewed through, not cut.');
    await line(null, 'Teo’s chair is on its side. His coffee is still warm.');
  },
  async log() {
    await line(null, 'Teo’s log, left open on the crates. The last entries get shorter.');
    await line(null, '“Supply boat turned back. Quarantine.”');
    await line(null, '“Fever 104. Feel fine.”');
    await line(null, '“Can’t sleep. Feel fine. Feel fine. Feel fine.”');
    const c = await ask(null, 'You could take the page.', [{ text: 'Tear it out. People should see this.' }, { text: 'Leave it. No need to start a panic.' }]);
    S.page = c === 0;
  },
  async prints() {
    await line(null, 'Bare footprints in the mud, one set, heading up the trail into the trees.');
    await line(null, 'They go straight through the edge of the fire pit. Whoever made them didn’t flinch.');
  },
};

function updateHud() {
  const n = Object.keys(CLUES).filter(id => S.seen[id]).length;
  G.Camp.hud('Find out what happened to Teo', `Clues found: ${n} of 3. Your team might know something too.`);
}

// ---------- using whatever you're standing next to ----------
let busy = false;
async function use(id) {
  if (busy || performance.now() < cool) return;
  const mine = run;
  busy = true;
  if (LOOKS[id]) {
    await LOOKS[id]();
    if (mine !== run) return;
    S.seen[id] = true;
    scene.things[id].mark = false;
    closePanel(); busy = false; updateHud();
    if (Object.keys(CLUES).every(k => S.seen[k])) theGeneratorDies();
    return;
  }
  if (TALKS[id]) {
    scene.focus = scene.things[id].x;   // look them in the eye
    if (S.trust[id] === undefined) await TALKS[id]();
    else await line(id, AGAIN[id]);
    if (mine !== run) return;
    scene.focus = undefined;
    closePanel(); busy = false;
    return;
  }
  if (SUPPLIES[id] && dashT > 0) {
    S.took = id;
    for (const k of Object.keys(SUPPLIES)) scene.things[k].off = true;
    G.Sfx.pop();
    G.Camp.say(`You grab ${SUPPLIES[id].name}. Now the trail!`);
    busy = false;
    return;
  }
  if (id === 'exit') { busy = false; if (finishDash) finishDash(); return; }
  busy = false;
}

// ---------- the turn: the lights go, and Teo comes back ----------
async function theGeneratorDies() {
  const mine = run;
  busy = true;
  scene.paused = true;
  for (const id of Object.keys(scene.things)) scene.things[id].off = true;
  scene.heart = true;
  G.Sfx.dud();
  scene.fade = 1;   // the tick eases the camp to dark
  await line(null, 'The generator coughs and dies. Every light in camp goes out except the fire.');
  if (mine !== run) return;
  const teo = { char: 'kip', x: TRAIL.x, y: TRAIL.y + 0.002, dark: true, face: 1, to: { x: 0.525, y: 0.775 }, pace: 0.42, alpha: 0 };
  scene.actors.push(teo); scene.fadeIn = teo;
  scene.focus = 0.52;
  G.Sfx.groan(0.3);
  await wait(1800);
  if (mine !== run) return;
  const weapon = { ivy: 'vine whip', wren: 'machete', elias: 'fern', kip: 'camera', briar: 'slingshot' }[S.char];
  const c = await ask(null, 'Someone is walking down the trail, barefoot, in a straight line. It’s Teo. He isn’t slowing down.', [
    { text: 'Call out to him.' },
    { text: 'Get everyone behind the fire!' },
    { text: `Take your ${weapon} and meet him.` },
  ], { time: 9 });
  if (mine !== run) return;
  const team = others();
  // the person he reaches first: someone you never spoke to, if there is one
  const nearest = team.find(id => S.trust[id] === undefined) || team[0];
  if (c === 0 || c === -1) {
    if (c === 0) {
      S.learned = 'They come to your voice.';
      await line(null, '“Teo! Teo, it’s us!” His head snaps up. He stops walking. He starts to run.');
    } else {
      S.learned = 'Standing still doesn’t save you.';
      await line(null, 'Nobody moves. You don’t either. He walks right into the firelight, and then he’s moving fast.');
    }
    if (mine !== run) return;
    teo.pace = 1.2; teo.to = { x: scene.byId[nearest].x, y: scene.byId[nearest].y };
    S.bitten = nearest; G.Sfx.groan(0.5);
    await wait(900);
    if (mine !== run) return;
    await line(null, `He goes for ${short(nearest)}. It takes all of you to drag him off.`);
    if (mine !== run) return;
    teo.gone = true;
  } else if (c === 1) {
    S.learned = 'Fire holds them. For now.';
    teo.to = { x: 0.505, y: 0.765 };
    for (const id of team) scene.byId[id].to = { x: 0.40 + 0.2 * Math.random(), y: 0.945 };
    await line(null, 'You shove everyone past the fire and into the dark behind it. Teo stops at the edge of the light, swaying.');
    if (mine !== run) return;
    await line(null, 'He looks at the flames. He looks through you. He doesn’t cross.');
    if (mine !== run) return;
    teo.gone = true;
  } else {
    S.learned = 'They can be stopped. You’ve done it now.';
    S.struck = true;
    S.trust.wren = S.trust.wren === undefined ? true : S.trust.wren;
    if (S.char !== 'elias') S.trust.elias = false;
    teo.pace = 0.25;
    await line(null, `You meet him at the edge of the camp. It takes three swings. Teo doesn’t get up.`);
    if (mine !== run) return;
    await line(null, 'Nobody says anything. Nobody quite looks at you, either.');
    if (mine !== run) return;
    teo.gone = true;
  }
  G.Sfx.groan(0.4);
  await line(null, 'Then the tree line starts to move. There are more of them, on both sides of camp.');
  if (mine !== run) return;
  await line(null, 'There’s only one place left to go: the old airstrip, past the ridge. You have time to grab one thing. Then get to the trail.');
  if (mine !== run) return;
  closePanel(); busy = false;
  theDash();
}

// ---------- the run: real walking, one thing to grab, and they're coming ----------
function theDash() {
  const mine = run;
  G.Camp.hud('Grab one thing. Get to the trail.', 'Med kit by the tent, flare gun by the fire, fuel can by the drums.');
  scene.focus = undefined;
  const t = scene.things;
  for (const [id, s] of Object.entries(SUPPLIES)) t[id] = { ...s, mark: true };
  t.exit = { x: TRAIL.x, y: 0.69, gx: TRAIL.x, gy: 0.70, mark: true, prompt: 'Space or tap: run for the ridge' };
  // your team makes their own choice now, and you can see it
  for (const id of others()) {
    const a = scene.byId[id];
    a.pace = 0.8;
    S.withYou = S.withYou || [];
    if (S.trust[id]) { a.to = TRAIL; a.leaving = true; S.withYou.push(id); }
    else { a.to = DOCK; a.leaving = true; }
  }
  const spawn = [[0.05, 0.86, 'wren'], [0.95, 0.90, 'elias'], [0.30, 0.74, 'ivy'], [0.80, 0.78, 'kip']];
  scene.walkers = spawn.map(([x, y, char]) => { const a = { char, x, y, dark: true, face: 1, pace: 0.42, alpha: 0 }; scene.actors.push(a); return a; });
  dashT = 22;
  $('#smRun').classList.remove('hidden');
  finishDash = async () => {
    finishDash = null; dashT = 0;
    $('#smRun').classList.add('hidden');
    busy = true; scene.paused = true;
    G.Sfx.run(1.8);
    await wait(500);
    if (mine === run) theEnd();
  };
}

function tick(dt, me) {
  if (scene.fade && scene.dark < 1) scene.dark = Math.min(1, scene.dark + dt * 1.2);
  if (scene.fadeIn && scene.fadeIn.alpha < 1) scene.fadeIn.alpha = Math.min(1, scene.fadeIn.alpha + dt * 0.8);
  for (const a of scene.actors) if (a.leaving && Math.hypot(a.x - a.to.x, a.y - a.to.y) < 0.03) { a.alpha = (a.alpha === undefined ? 1 : a.alpha) - dt * 1.5; if (a.alpha <= 0) a.gone = true; }
  if (!dashT) return;
  dashT = Math.max(0.0001, dashT - dt);
  if (dashT <= 0.0001 && !S.took && !scene.things.medkit.off) {   // too slow: the supplies are out of reach
    for (const k of Object.keys(SUPPLIES)) scene.things[k].off = true;
    G.Camp.say('No time. Leave it. Run!');
  }
  $('#smRunText').textContent = dashT > 0.001 ? (S.took ? 'Get to the trail!' : 'They’re coming') : 'Run!';
  $('#smRunBar').style.transform = `scaleX(${dashT / 22})`;
  for (const w of scene.walkers) {
    if (w.alpha < 1) w.alpha = Math.min(1, w.alpha + dt);
    w.to = { x: me.x, y: me.y };
    w.pace = dashT < 8 ? 0.62 : 0.42;   // they get closer the longer you take
    if (!S.bit && Math.hypot((w.x - me.x) * 2.36, w.y - me.y) < 0.035) {
      S.bit = true;
      G.Sfx.groan(0.6); G.Sfx.dud();
      G.Camp.say('It got your arm. Keep moving!');
      w.gone = true;
    }
  }
  // standing on the trail is enough; nobody should have to stop and press a key here
  if (finishDash && Math.hypot((me.x - TRAIL.x) * 2.36, me.y - 0.70) < 0.035) finishDash();
}

// ---------- the chapter card: everything the next chapter will remember ----------
function theEnd() {
  const team = others();
  const lines = [];
  const withYou = S.withYou || [];
  const left = team.filter(id => !withYou.includes(id));
  lines.push(['Who came with you', withYou.length ? withYou.map(short).join(', ') : 'Nobody. You’re alone.']);
  if (left.length) lines.push(['Who took the river instead', left.map(short).join(', ')]);
  if (S.bitten) lines.push(['Who got hurt', withYou.includes(S.bitten) ? `${short(S.bitten)} is with you, and keeps a sleeve pulled down.` : `${short(S.bitten)} took the river, bleeding.`]);
  lines.push(['What you learned', S.learned]);
  lines.push(['What you carried out', S.took ? SUPPLIES[S.took].name.replace(/^t/, 'T') : 'Only what was in your pockets.']);
  if (S.page) lines.push(['In your pocket', 'A page from Teo’s log.']);
  if (S.bit) lines.push(['Your arm', 'You got bitten on the way out. You feel fine.']);
  try { localStorage.setItem(SAVE, JSON.stringify({ chapter: 1, ...S })); } catch (e) {}
  G.Sfx.ambience(true);
  const c = $('#smCard');
  $('#smQuit').classList.add('hidden');
  card(`<p class="role">End of Chapter 1</p><h2>The Last Night</h2>
    <ul>${lines.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join('')}</ul>
    <button type="button" class="hero-btn" id="smGo">Chapter 2: Get to the plane</button>
    <button type="button" class="link" id="smAgain">Play Chapter 1 again</button>
    <button type="button" class="link" id="smMenu">Main menu</button>`);
  $('#smGo').addEventListener('click', () => { c.classList.add('hidden'); G.storyRun(S.char, landfall); });
  $('#smAgain').addEventListener('click', () => { c.classList.add('hidden'); api.start(S.char); });
  $('#smMenu').addEventListener('click', () => G.toMenu());
}

// ---------- after the flight: the storm spits you out over a new island ----------
function landfall() {
  build();
  G.Camp.stop(); G.Intro.stop();
  $('#menu').classList.add('hidden');
  $('#sm').classList.remove('hidden');
  $('#smTalk').classList.add('hidden'); $('#smRun').classList.add('hidden'); $('#smQuit').classList.add('hidden');
  const withYou = (S.withYou || []).map(short);
  const c = $('#smCard');
  c.style.background = 'linear-gradient(180deg, rgba(6,4,12,.15), rgba(6,4,12,.88) 62%), url(assets/story/beach.jpg) center/cover';
  card(`<p class="role">Chapter 3</p><h2>Landfall</h2>
    <p>The fuel ran out over open water. You put her down on the first sand you saw.</p>
    <p>${withYou.length ? `${withYou.join(', ')} climbed out behind you.` : 'You climb out alone.'} No boats. No roads. Nobody on the radio. Just this beach, and all the time in the world to build something.</p>
    <p>Then you see the smoke. Someone else is already here.</p>
    <p class="role">Next: find the survivors and start the village</p>
    <button type="button" class="hero-btn" id="smMenu2">Main menu</button>`);
  $('#smMenu2').addEventListener('click', () => { c.style.background = ''; G.toMenu(); });
}

const api = G.StoryMode = {
  // from the main menu: choose a character, then play
  begin() {
    G.Story.chooseFor(id => G.Island.start(id));   // the story now opens on the island beach; The Last Night is kept for later
  },
  // shared with island.js: the talk panel, chapter cards and the run token that cancels a script when you quit
  ui: {
    build, line, ask, card, wait, closePanel,
    setScene(s) { scene = s; },
    get run() { return run; },
    newRun() { return ++run; },
    cooling: () => performance.now() < cool,
  },
  async start(char) {
    build();
    G.useStoryArt(true);
    const mine = ++run;
    S = { char, seen: {}, trust: {}, page: false, took: null, bit: false, bitten: null, learned: '', withYou: null, struck: false };
    busy = false; dashT = 0; finishDash = null; next = null; clearInterval(clockTimer);
    const things = {};
    for (const [id, c] of Object.entries(CLUES)) things[id] = { ...c, mark: true };
    const actors = [], byId = {};
    for (const [id, p] of Object.entries(TEAM)) {
      if (id === char) continue;
      const a = { char: id, x: p.x, y: p.y, face: p.face, label: short(id) };
      actors.push(a); byId[id] = a;
      things[id] = { x: p.x, y: p.y, h: 0.2, gx: p.x + (p.face > 0 ? 0.03 : -0.03), gy: p.y + 0.015, prompt: `Space or tap: talk to ${short(id)}` };
    }
    scene = { firstPerson: true, things, actors, byId, use, tick, paused: true, heart: false, dark: 0, fade: 0, walkers: [] };
    G.Intro.stop();
    $('#menu').classList.add('hidden');
    $('#sm').classList.remove('hidden');
    $('#smQuit').classList.remove('hidden');
    $('#smRun').classList.add('hidden');
    $('#smTalk').classList.add('hidden');
    G.Camp.start({ char, role: 'Chapter 1: The Last Night', title: '', text: '', scene });
    updateHud();
    await card(`<p class="role">Chapter 1</p><h2>The Last Night</h2>
      <p>Day 1,096 on Kanoa Island. 6:41 in the evening.</p>
      <p>The radio went dead an hour ago. Nobody has seen Teo, the radio operator, since.</p>
      <p>Everything you choose tonight comes with you.</p>`, 'Begin');
    if (mine !== run) return;
    scene.paused = false;
    G.Camp.say('Walk around. Look at what’s marked. Talk to people.');
  },
  // the race's own screens take over for the plane escape
  hide() { $('#sm').classList.add('hidden'); G.Camp.stop(); },
  stop() {
    run++; next = null; clearInterval(clockTimer); scene = null; dashT = 0; finishDash = null;
    const el = built();
    if (el) { el.classList.add('hidden'); $('#smCard').classList.add('hidden'); $('#smRun').classList.add('hidden'); for (const id of ['#isInv', '#isMap']) if ($(id)) $(id).innerHTML = ''; if ($('#isAct')) $('#isAct').classList.add('hidden'); }
    if (G.Camp) G.Camp.stop();
  },
  // for testing
  landfall,
  debug() { return { S, scene, dashT }; },
};
})();
