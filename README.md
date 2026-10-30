# 📺 TV Heads

A browser multiplayer 3D game where every player is a character with a TV for a head, and the TV screen shows that player's live webcam.

**Play:** open the GitHub Pages link for this repo, tap **Host a new game**, and share the 4‑letter room code (or the *Copy invite* link). Works on PC and phone (front camera). Up to 6 players (rooms are capped). If the host leaves, another player automatically takes over the room code, and anyone who drops out rejoins on their own.

## Controls
| | Keyboard | Gamepad | Phone |
|---|---|---|---|
| Move / turn | W/S, A/D (or arrows) | Left stick | Joystick |
| Jump | Space | A | JUMP |
| Zap | F | X / B / RT | ZAP |
| Mute mic | M | – | 🎤 button |

A zap fills the other player's screen with static and stuns them.

**Proximity voice chat:** you hear other players louder the closer they are (silent beyond ~20 m), panned left/right by where they stand. Headphones avoid echo. A player's name tag glows green while they talk and shows 🔇 when muted.

## How it works
- **Three.js** renders the 3D arena. Each player's webcam stream becomes a `VideoTexture` on their TV screen (CRT shader with scanlines and static).
- **WebRTC via PeerJS** sends webcam video and game data directly between players. The host's room code is used only to introduce players to each other. PeerJS's free public lobby and relay servers are used by default.
- Everything is bundled into one self-contained `index.html`.

## Develop
```
npm install
node build.mjs        # bundles main.js + template.html → index.html
```
Local test with your own lobby server: `node tools/peersrv.cjs`, serve the folder, then open `index.html?peerhost=127.0.0.1&peerport=9000`.
