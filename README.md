# Escape the Island: N4968N (cockpit race prototype)

Two researchers are stranded on a jungle island where a mosquito-borne infection turns people into zombies. Each of you has made it to the hidden dirt-strip airport and climbed into a Cessna 172. **Whoever gets their engine started and their plane in the air first wins.** If the zombies reach your plane first (90 seconds), you're overrun.

This is the first playable piece of the game: the cockpit race. It runs in any web browser on a phone or a computer, and it's built only with free tools.

## How to play

The game opens on the title screen. From there:

1. **The story:** what happened on Kanoa Island, one line at a time (you can skip it).
2. **Who are you?** Choose Dr. Ivy Thorne or Dr. Elias Fernsby (Botanists), or Wren "Riptide" Calloway or Kip "Compass" Monroe (Jungle Explorers). You'll see their backstory and hear their line.
3. **Your path:** grab your things in the lab tent or at the river camp, then **run for the airstrip**.
4. **The jungle run.** Every game is a brand-new island: the camp, the airstrip (where it is and which way it points), the river and its bridges, and the trails with their dead ends and loops all change, so you can't memorize the way. Find the hidden airstrip. Follow the trails, read the trail signs, grab the torn map piece, listen for the radio getting louder, and watch for the windsock and the smoke above the trees. Mosquito swarms raise your fever (bug spray and med kits bring it down; a high fever blurs your vision and slows you). Zombies on the trails lunge and knock you back. At the airstrip, find a plane that can fly: look for fuel cans by the nose, chocks already pulled, and an open key box. That's the Cessna 172 N4968N or the Piper Cherokee N5512P. The others are covered up, missing a propeller, on a flat tire, or shot full of holes. (On Clear Skies, a soft arrow points to the planes that fly.)
5. **The cockpit race.** Your character's hands work the controls, and their voice shouts "Clear prop!" and reacts during the race.

**On your own:** choose **Solo practice**.

**Against a bot:** choose **Race a bot**. One of the three researchers you didn't pick races you the whole way: through the jungle (it takes the occasional wrong turn, fights zombies with its own weapon, and can get bitten and wake at a checkpoint), into whichever plane it reaches first, and through its own checklist, making mistakes like a real pilot. On Clear Skies it's slow and clumsy, on Crosswind it's an even match, and on Mayday it's fast and sharp. You can watch its cockpit live in the corner.

**Against a friend on another device:**
1. Choose **Invite a player**. You get a 4-letter code and a link.
2. Send the link (Copy or Share) to your friend's phone or computer, or read them the code.
3. Your friend opens the link (or chooses **Join with a code**) and presses **Join**.
4. Once they've joined, you each go through the story and choose your own researcher. When both of you reach the airstrip, the race starts together. You see your cockpit large and theirs live in a small window in the corner, hands and all.

On a phone, turn it sideways.

### The escape

When you lift off, the view pulls back over the island as your plane climbs past the volcano and the horde shrinks on the strip below. Then the winner's card slides in with their picture, their time, their mistakes and lives lost, and their line in their own voice:

- **Dr. Ivy Thorne:** "Cure's in my pocket. Zombies in my rearview."
- **Wren "Riptide" Calloway:** "Eleven jungles. Never lost a guest. Not starting tonight."
- **Dr. Elias Fernsby:** "Look, little guy. We're flying!"
- **Kip "Compass" Monroe:** "Finally. A direction I'm sure of. Up."

Online, both players see who won. If you didn't make it, the winner's card appears over your cockpit, with the zombies at the glass. **Fly again** runs the whole jungle and cockpit again. **Change researcher** (solo) lets you pick someone else.

### Sharing a map

The winner card shows the island's map code (like **Map KANOA-6ZJTN4**). **Copy map link** gives you a link that opens that exact island, so a friend can race the same jungle.

### Three ways to play

Pick one on the title screen. Online, the person who sends the invite picks for both.

| Mode | | Jungle clock | Cockpit clock | What's different |
|---|---|---|---|---|
| **Clear Skies** (easy) | "The fever's still miles away." | 5:00 | 2:00 | Few mosquitoes, slow zombies, smoke clue early, the next control glows right away |
| **Crosswind** (medium) | "They're closer than you think." | 3:30 | 1:30 | The normal game |
| **Mayday** (hard) | "Patient zero is already at the airstrip." | 2:15 | 1:00 | No trail signs, a faint radio, swarms of mosquitoes, fast zombies, no checklist highlight, 5-second mistakes |

In the jungle, zombies trickle in, come in waves at half time and at 80%, and pour out of the trees when the jungle clock runs out (you can still make it to the planes). In the cockpit, they reach the windows at half time and bang on the glass at 80%. All the numbers are in one table at the top of `game.js`.

### Running through the jungle

- **Computer:** arrow keys or WASD to run, **Shift** to sprint (watch the stamina bar), **Space** to fight back, **Space** or **Enter** to climb into a plane.
- **Phone:** the thumb joystick bottom-left, the weapon and **Sprint** buttons bottom-right, and **Climb in** when you reach a plane.
- **Online:** you both run the same jungle and see each other as a faded "RIVAL". Whoever climbs into a plane first gets a head start: the horde starts closing in on the airstrip for both of you.

### Fighting back and staying alive

Each researcher has a weapon:

- **Dr. Ivy Thorne, Vine Whip:** a strangler-fig vine that snaps zombies back. Now and then it grabs a tree and slingshots her forward.
- **Wren "Riptide" Calloway, Machete "Mildred":** a wide slash that sends them stumbling.
- **Dr. Elias Fernsby, The Fern:** swung by the pot like a club. The fern is always fine, and he always apologizes.
- **Kip "Compass" Monroe, Camera Flash:** a blinding flash that freezes zombies for two seconds.

When a zombie is about to lunge, it crouches under a red **!**. Press **Space** (or the weapon button on a phone) in time to counter. The weapon then needs a moment to recharge, shown by the ring around its icon. If you miss, you're bitten and lose health; high fever also drains health slowly. Med kits restore health. At zero health you go down, then wake at the last **checkpoint lantern** you passed with full health. The clock keeps running, though. Online, your rival hears about it.

| Mode | Time to react | Recharge | Bite |
|---|---|---|---|
| Clear Skies | 0.8 s | 1 s | −25 health |
| Crosswind | 0.5 s | 1.5 s | −34 health |
| Mayday | 0.3 s | 2 s | −50 health, and they sometimes lunge in pairs |

### Working the cockpit

Use the controls just as a pilot would. Tap a switch, drag the throttle knob, hold the key, pull back on the yoke. On a computer you can also use the keys shown in the small white tags.

| Checklist step | What to do | Key |
|---|---|---|
| 1. Master ON | tap the red MASTER switch | Q |
| 2. Fuel selector BOTH | tap the fuel selector on the floor | W |
| 3. Mixture RICH | tap (push in) the red mixture knob | E |
| 4. Throttle in ¼ inch | tap the black throttle knob once | C |
| 5. Prime 2–3 times | tap the primer 2 or 3 times | R |
| 6. Beacon ON | tap the BCN switch | A |
| 7. Shout "CLEAR!" | tap the window on the left | S |
| 8. Key to START | hold the ignition key until the engine catches | D (hold) |
| 9. Oil pressure green | tap the oil gauge once it's in the green | F |
| 10. Flaps 10° | tap the flap lever | Z |
| 11. Full throttle | drag the throttle knob up all the way | C (hold) |
| 12. At 55 knots, pull back | hold the yoke | V (hold) |

### Mistakes cost time
- **Out of order:** the engine sputters and you're stuck for 3 seconds.
- **Too much prime:** the engine floods, and you have to wait before it will start.
- **Fuel selector not on BOTH:** the engine starts, then quits on the takeoff roll. Fix the fuel, pull the throttle back, and restart.
- **Pulling back too early:** the stall horn sounds and you lose speed.
- **Pulling the mixture out** while the engine runs shuts it off.
- If you're stuck for a few seconds, the control you need starts to glow.

## Running it on your computer

Open a terminal in this folder and run:

```bash
python3 -m http.server 8765
```

Then visit http://localhost:8765 in your browser.

## Putting it online for free (GitHub Pages)
1. In GitHub Desktop, click **Push origin**.
2. In your repository on GitHub, open **Settings → Pages**, choose **Deploy from a branch**, then **main** and **/ (root)**, and click **Save**.
3. After a minute or two, GitHub shows the game's web address on that page.

## How it's built (all free)
- Plain HTML, CSS and JavaScript, with no build step and no accounts.
- `intro.js` paints the island at dusk (sky, volcano, palms, fog, fireflies, film grain). The title, the story and the view out of the cockpit all share it.
- `instruments.js` draws the six-pack, tachometer and engine gauges (fuel, oil, amps, suction) like real round gauges, with damped needles and gyros that spin up after the engine starts. Their faces are drawn once and reused, so phones stay smooth.
- `cockpit.js` draws the pilot's-seat view, panel, palm trees and zombies in code (no paid art).
- `jungle.js` makes and draws the jungle run (trails, river, trees, mosquitoes, zombies, the airstrip and its planes) in code. No downloaded art.
- `planes.js` draws the parked planes from above at real size (Cessna 172 and 150, Piper Cherokee, Piper Cub, Beechcraft Baron), with shadows, nav lights, stripes, chocks, tie-downs and fuel cans.
- `ending.js` plays the escape: the camera pulls back over the island as the plane climbs away.
- `hands.js` animates the character's hand reaching for each control, using the hand pictures in `assets/characters/`.
- `assets/voice/` holds the recorded character lines (a female and a male voice).
- `sound.js` makes the engine, starter, stall horn, bangs and groans with the browser's built-in audio.
- `net.js` connects the two devices with [PeerJS](https://peerjs.com/), which is free and open source. Its free public server only helps the two browsers find each other. The race itself goes directly between the devices.
- `game.js` holds the checklist rules, the race and the menus. Settings like the 90-second timer are at the top of the file.

## What's next
1. **The airport:** walk out of the jungle, find N4968N among six parked planes, and watch zombies approach across the strip.
2. **The island:** explore the jungle for clues to the airport, with mosquitoes and an infection meter.
3. **Polish:** your own characters and voices, better art, and music.
4. **Design question:** one shared plane (the loser repairs a decoy for a comeback) or one plane each (as now).
