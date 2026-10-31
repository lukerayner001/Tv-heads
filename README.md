# 📺 TV Heads

A browser multiplayer 3D game where every player is a character with a TV for a head, and the TV screen shows that player's live webcam.

**Play:** open the GitHub Pages link for this repo, tap **Host a new game**, and share the 4‑letter room code (or the *Copy invite* link). Works on PC and phone (front camera). Up to 6 players (rooms are capped). If the host leaves, another player automatically takes over the room code, and anyone who drops out rejoins on their own.

## Controls
Third-person, over-the-shoulder shooter controls (Arc Raiders style).

| | Keyboard + mouse | Gamepad | Phone |
|---|---|---|---|
| Look / aim | Mouse (click the game to lock the cursor, Esc to free it) | Right stick | Drag on the right side |
| Move / strafe | WASD | Left stick | Thumb down anywhere on the left side (floating stick) |
| Shoot | Left click (or F) | RT / RB | Big red button |
| Aim down sights | Right click (or Q) | LT / LB | AIM button (toggle) |
| Sprint | Shift | B / L3 | – |
| Jump | Space | A | JUMP |
| Mute mic | M | – | 🎤 button |

A zap fills the other player's screen with static and stuns them.

**Proximity voice chat:** you hear other players louder the closer they are (silent beyond ~20 m), panned left/right by where they stand. Headphones avoid echo. A player's name tag glows green while they talk and shows 🔇 when muted.

## Rounds & features
The host (👑) picks what's on for each round in **Round settings** (⚙ button), plus the win target (first to 5/10/15/20). Everyone sees a results screen when someone wins, then the host starts the next round.

| Feature | What it does |
|---|---|
| 💥 Screen damage | 3 hits knock a TV out (screen fades, cracks, then switches off). Knockouts score. Off = every hit scores. |
| 👻 Cover to hide | Cover your camera to go invisible. You can't zap or be zapped while hidden. |
| 📸 Zap cam | Snaps the face of everyone you zap; gallery on the results screen (stays on your device). |
| 🏆 Leader billboards | Giant screens show the leader's live face. |
| 😮 Mouth to fire | Open your mouth wide to shoot (face tracking via Google MediaPipe, runs on-device). |
| 😂 Try not to laugh | Smile and the nearest player gets a point. |
| 🗿 Freeze! | Every 15–30 s "FREEZE!" is called – move, or let your face move, and lose a point. |
| 📣 Shout power | The louder you shout as you zap, the further and bigger the zap. |
| 🔫 Blaster | Replaces the zap. Hold to fire ~10 shots a second (hitscan, tracers, muzzle flash). Hits crack the victim's TV screen *and* their own view; bullets leave holes and sparks on the level. Crack it 60% (or land 30 hits) and their screen is smashed (scores like a knockout). Repeat hits on the same spot add small chips instead of new cracks, so it stays smooth. Right-click aim tightens the spread; holding the trigger widens it. |

## 🏓 TV Pong (mini-game)
Pick **TV Pong** as the game in Round settings. Your TV head is your bat – the ball bounces off your live face. The table grows with the room: one player gets a practice box, two play classic rectangle pong, and 3–6 players get a triangle, square, pentagon or hexagon with one goal side each. Slide with A/D, arrows, the mouse, the left stick, or by dragging on a phone. Hit the edge of your TV to angle the ball. If the ball gets past someone, whoever touched it last scores. The ball speeds up with every hit. Players who join mid-game spectate until the next round.

## How it works
- **Three.js** renders the 3D arena. Each player's webcam stream becomes a `VideoTexture` on their TV screen (CRT shader with scanlines and static).
- **WebRTC via PeerJS** sends webcam video and game data directly between players. The host's room code is used only to introduce players to each other. The PeerJS public lobby server introduces players; an ExpressTURN relay (free tier) carries connections that can't go direct. Video is capped at ~200 kbps / 15 fps per stream. Add `?relay` to the URL to force the relay for testing.
- Everything is bundled into one self-contained `index.html`.

## Develop
```
npm install
node build.mjs        # bundles main.js + template.html → index.html
```
Local test with your own lobby server: `node tools/peersrv.cjs`, serve the folder, then open `index.html?peerhost=127.0.0.1&peerport=9000`.
