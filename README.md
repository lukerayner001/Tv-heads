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
| Reload | R | X | ⟳ button |
| Aim down sights | Right click (or Q) | LT / LB | AIM button (toggle) |
| Sprint | Shift | B / L3 | – |
| Jump | Space | A | JUMP |
| Mute mic | M | – | 🎤 button |

A zap fills the other player's screen with static and stuns them.

**Proximity voice chat:** you hear other players louder the closer they are (silent beyond ~20 m), panned left/right by where they stand. Headphones avoid echo. A player's name tag glows green while they talk and shows 🔇 when muted.

## The game
A blaster battle. Hold the trigger to fire fast – 20 rounds a magazine, then a 1.8 s reload where you can't shoot (it reloads by itself when empty, or press R early to pick your moment); every hit cracks the other player's TV screen – and their own view. Crack a screen 60% (or land 30 hits) to smash it and score. The leader's live face is shown on giant billboards around the arena. The host (👑) sets **first to 5/10/15/20** and starts the first round. When someone wins there's a quick score screen, then everyone respawns at spread-out random spots and the next round starts automatically; the blaster works during warm-up too, but nothing scores until the round starts.

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
