/* The beginning of the game: opening story → choose your researcher → backstory → path scene → run for the airstrip.
   Text comes from story.md. Each player goes through it on their own device. */
(() => {
'use strict';
const G = window.G = window.G || {};
const $ = s => document.querySelector(s);

const OPENING = [
  'Kanoa Island. Four hundred miles from anywhere.',
  'A fever carried by mosquitoes is spreading across the Pacific. No medicine stops it.',
  'But Kanoa’s jungle grows plants found nowhere else on Earth. So a small camp of botanists and jungle explorers came here with one job: find the cure before the fever finds everyone else.',
  'For three years, they searched. They were close.',
  'Then the mosquitoes on Kanoa changed.',
  'The fever reached the camp. The ones it takes don’t stay down. They get back up.',
  'The supply boat isn’t coming. The radio is dead.',
  'But somewhere past the ridge, hidden under the canopy, there’s an old dirt airstrip. And on it, a few small planes that still might fly.',
  'Only one way off this island. Wheels up, before they find you.',
];

const BIOS = {
  ivy: {
    teaser: 'Found the only thing that slows the fever.',
    story: 'Dr. Ivy Thorne came to Kanoa to study the moonflower orchid, a plant that only blooms in the dark. Her last test showed something nobody expected: its nectar slows the fever. She has the only sample in her lab coat pocket. She also has a pilot’s license she earned to reach research sites no road goes to. Now she has to use it.',
    line: 'I have the only cure on this island in my pocket. I’m not leaving it here.',
    place: 'The lab tent', scene: 'lab', title: 'Get the sample. Get out.',
    text: 'The generator coughs. The lights flicker. Something is scratching at the tent flap.',
    items: ['Moonflower sample', 'Flight bag'],
  },
  wren: {
    teaser: 'Knows every trail. Never lost a guest.',
    story: 'Wren earned the name Riptide the day she swam a flooded river to pull a guide out of it. She has led expeditions through eleven jungles and never lost a guest. She guided the cure team to every sample they ever found. She knows every trail on Kanoa, she can read a river like a map, and she flies bush planes into strips most pilots won’t touch. Tonight her whole team is gone, and she’s not about to be next.',
    line: 'I know these trails better than anyone. Let’s go. Now!',
    place: 'The river camp', scene: 'river', title: 'Grab your gear.',
    text: 'The river is loud tonight. Not loud enough to cover the footsteps in the trees.',
    items: ['Trail map', 'Your hat'],
  },
  elias: {
    teaser: 'Talks to his ferns. They talk back.',
    story: 'Dr. Elias Fernsby talks to his ferns, and he swears they talk back. He came to Kanoa to grow the cure: a jungle fern whose sap might teach the body to fight the fever. His greenhouse is the last building with its lights still on. When the first zombie walked out of the trees, his ferns were the first to notice. He grabbed his favorite one and ran.',
    line: 'Okay, little guy. We’re getting on that plane.',
    place: 'The lab tent', scene: 'lab', title: 'Don’t forget the fern.',
    text: 'Glass rattles in the greenhouse. Every light in camp is out except yours, and they can see it.',
    items: ['Your favorite fern', 'Flight bag'],
  },
  kip: {
    teaser: 'Lost in 14 jungles. Still has the frog.',
    story: 'They call him Compass because he has never once known which way north is. Kip has been lost in fourteen jungles and found his way out of every single one, usually with a new friend and a better story. He came to Kanoa to guide the scientists to a rare tree frog whose skin might hold part of the cure. He got the frog. He also got chased by zombies. He still has the frog.',
    line: 'Good news, I found the frog. Bad news, everyone else found us.',
    place: 'The river camp', scene: 'river', title: 'Map. Hat. Frog. Go.',
    text: 'The frog is in your pocket. It looks worried. Something big just stepped into the river behind you.',
    items: ['Trail map', 'Your hat'],
  },
};

let onDone = null, onPick = null, step = 0, timer = 0, chosen = null;

function show(name) { G.showScreen(name); }

// ---------- opening story: one line at a time ----------
function storyLine() {
  clearTimeout(timer);
  const el = $('#storyText');
  if (step >= OPENING.length) { toSelect(); return; }
  el.classList.remove('in'); void el.offsetWidth;
  el.textContent = OPENING[step];
  el.classList.add('in');
  $('#storyCount').textContent = `${step + 1} / ${OPENING.length}`;
  timer = setTimeout(() => { step++; storyLine(); }, 2600 + OPENING[step].length * 38);
}
$('#storyNext').addEventListener('click', () => { step++; storyLine(); });
$('#storySkip').addEventListener('click', () => { clearTimeout(timer); toSelect(); });

// ---------- choose your researcher ----------
function toSelect() {
  clearTimeout(timer);
  G.Intro.setScene('jungle');
  show('select');
}
const cards = $('#selectCards');
for (const [id, c] of Object.entries(G.CHARS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pcard'; b.dataset.char = id;
  b.innerHTML = `<img src="assets/characters/${id}.png" alt=""><span class="role">${c.label}</span><b>${c.name}</b><small>${BIOS[id].teaser}</small><span class="weapon">${c.icon} Weapon: ${c.weapon}</span>`;
  b.addEventListener('click', () => toBackstory(id));
  cards.appendChild(b);
}

// ---------- backstory card with the spoken line ----------
function toBackstory(id) {
  chosen = id;
  const c = G.CHARS[id], bio = BIOS[id];
  $('#bsImg').src = `assets/characters/${id}.png`;
  $('#bsRole').textContent = c.label;
  $('#bsName').textContent = c.name;
  $('#bsStory').textContent = bio.story;
  $('#bsLine').textContent = '“' + bio.line + '”';
  $('#bsWeapon').innerHTML = `<b>${c.icon} ${c.weapon}.</b> ${c.weaponLine}`;
  show('backstory');
  G.Sfx.init();
  G.Sfx.playFile(`assets/voice/${id}-intro.mp3`);
}
$('#bsBack').addEventListener('click', () => { G.Sfx.stopFile(); show('select'); });
$('#bsGo').addEventListener('click', () => { G.Sfx.stopFile(); if (onPick) onPick(chosen); toPath(chosen); });

// ---------- path scene: grab your things, then run ----------
function toPath(id) {
  const bio = BIOS[id];
  G.Intro.setScene(bio.scene);
  $('#pathPlace').textContent = bio.place;
  $('#pathTitle').textContent = bio.title;
  $('#pathText').textContent = bio.text;
  const box = $('#pathItems'); box.innerHTML = '';
  const run = $('#pathRun'); run.disabled = true; run.classList.remove('ready');
  let left = bio.items.length;
  bio.items.forEach(name => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item'; b.textContent = 'Grab: ' + name;
    b.addEventListener('click', () => {
      if (b.classList.contains('got')) return;
      b.classList.add('got'); b.textContent = '✓ ' + name;
      G.Sfx.click();
      if (--left === 0) { run.disabled = false; run.classList.add('ready'); }
    });
    box.appendChild(b);
  });
  show('path');
}
$('#pathRun').addEventListener('click', () => {
  const fade = $('#runFade');
  fade.classList.remove('hidden'); void fade.offsetWidth; fade.classList.add('on');
  G.Sfx.run(2.4);
  setTimeout(() => {
    G.Intro.setScene('jungle');
    if (onDone) onDone(chosen);
    setTimeout(() => { fade.classList.remove('on'); setTimeout(() => fade.classList.add('hidden'), 600); }, 200);
  }, 2400);
});

G.Story = {
  // Start the opening. pick(char) fires when a researcher is chosen; done(char) when they reach the airstrip.
  begin(pick, done) {
    onPick = pick; onDone = done; step = 0; chosen = null;
    G.Intro.setScene('story');
    show('story');
    storyLine();
  },
  // straight to choosing a researcher (after a game, to switch characters)
  chooseAgain(pick, done) { onPick = pick; onDone = done; chosen = null; toSelect(); },
  stop() { clearTimeout(timer); G.Sfx.stopFile(); },
};
})();
