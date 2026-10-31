import * as THREE from 'three';
import { Peer } from 'peerjs';

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const ARENA = 26;
const COLORS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0x9b5de5, 0x06d6a0, 0xffb703, 0xef476f];
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function setStatus(msg, bad) {
  const s = $('status');
  s.textContent = msg;
  s.style.color = bad ? '#ff8a8a' : '#cfe8ff';
}

// ---------- renderer / scene ----------
// Which graphics chip? Some new phone GPUs (e.g. PowerVR in the Pixel 10) have driver bugs with shadows.
const gpuName = (() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const n = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(n);
  } catch { return 'unknown'; }
})();
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const safeGfx = qs.has('safe') || lsGet('tvhead-safe') === '1' || (lsGet('tvhead-safe') !== '0' && /PowerVR|Imagination/i.test(gpuName));
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch && !safeGfx, precision: safeGfx ? 'mediump' : 'highp', powerPreference: safeGfx ? 'default' : 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, safeGfx ? 1 : isTouch ? 1.5 : 2));   // lighter on phones = smoother
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !safeGfx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f3b);
scene.fog = new THREE.Fog(0x1b1f3b, 30, 70);
if (qs.has('whitetest') && !safeGfx) { scene.background = new THREE.Color(0xffffff); scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); }   // test hook: fake a broken driver

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6, -10);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x404060, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(12, 25, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 512 : 1024, isTouch ? 512 : 1024);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 70 });
scene.add(sun);

// floor
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b3160'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#323a72'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(13, 13);
  t.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4fcf, roughness: 0.6 });
  for (const [x, z, w, d] of [[0, ARENA, ARENA * 2, 1], [0, -ARENA, ARENA * 2, 1], [ARENA, 0, 1, ARENA * 2], [-ARENA, 0, 1, ARENA * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, d), wallMat);
    m.position.set(x, 0.75, z);
    m.receiveShadow = true;
    scene.add(m);
  }
}

// obstacles (axis-aligned boxes used for collision)
const obstacles = [];
{
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xc58b4e, roughness: 0.8 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8ecae6, roughness: 0.5 });
  const layout = [
    [-8, -6, 3, 3, 2, crateMat], [9, 7, 3, 3, 2, crateMat], [-12, 12, 2, 6, 2.5, crateMat], [14, -12, 6, 2, 2.5, crateMat],
    [0, 0, 2, 2, 5, pillarMat], [-17, -15, 2, 2, 5, pillarMat], [18, 16, 2, 2, 5, pillarMat], [3, -16, 4, 2, 1.5, crateMat],
    [-3, 17, 4, 2, 1.5, crateMat],
  ];
  for (const [x, z, w, d, h, mat] of layout) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
}

function collide(p, r = 0.7) {
  const lim = ARENA - 0.5 - r;
  p.x = Math.max(-lim, Math.min(lim, p.x));
  p.z = Math.max(-lim, Math.min(lim, p.z));
  for (const o of obstacles) {
    const cx = Math.max(o.minX, Math.min(o.maxX, p.x));
    const cz = Math.max(o.minZ, Math.min(o.maxZ, p.z));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    }
  }
}

// ---------- "NO SIGNAL" test card ----------
const cardCanvas = document.createElement('canvas');
cardCanvas.width = 320; cardCanvas.height = 240;
function drawCard(t = 0) {
  const g = cardCanvas.getContext('2d');
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  bars.forEach((b, i) => { g.fillStyle = b; g.fillRect(i * 320 / 7, 0, 320 / 7 + 1, 170); });
  g.fillStyle = '#111'; g.fillRect(0, 170, 320, 70);
  g.fillStyle = '#000'; g.fillRect(70, 85, 180, 50);
  g.fillStyle = (Math.floor(t * 2) % 2) ? '#fff' : '#ddd';
  g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('NO SIGNAL', 160, 111);
}
drawCard();
const cardTex = new THREE.CanvasTexture(cardCanvas);

// ---------- TV screen shader ----------
const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
blankTex.needsUpdate = true;
const SCREEN_ASPECT = 1.15 / 0.86;
function makeScreenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: cardTex },
      card: { value: cardTex },
      hasVideo: { value: 0 },
      videoAspect: { value: 4 / 3 },
      time: { value: 0 },
      staticAmt: { value: 0 },
      power: { value: 1 },
      alpha: { value: 1 },
      damage: { value: 0 },
      crack: { value: crackTex },
      paint: { value: blankTex },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform sampler2D card; uniform float hasVideo; uniform float videoAspect;
      uniform float time; uniform float staticAmt; uniform float power;
      uniform float alpha; uniform float damage; uniform sampler2D crack; uniform sampler2D paint;
      varying vec2 vUv;
      float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float d = dot(c,c);
        vec2 uv = 0.5 + c * (1.0 + 0.15 * d);            // CRT bulge
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.02,0.02,0.02,alpha); return; }
        // power-off: collapse to a horizontal line
        float squash = max(power, 0.001);
        float py = 0.5 + (uv.y - 0.5) / squash;
        if (py < 0.0 || py > 1.0) { gl_FragColor = vec4(0.02,0.02,0.02,alpha); return; }
        vec2 suv = vec2(uv.x, py);
        vec2 t = suv;                                       // cover-fit video into 4:3 screen
        float sa = ${SCREEN_ASPECT.toFixed(4)};
        if (videoAspect > sa) t.x = 0.5 + (t.x - 0.5) * (sa / videoAspect);
        else t.y = 0.5 + (t.y - 0.5) * (videoAspect / sa);
        vec3 col = hasVideo > 0.5 ? texture2D(map, t).rgb : texture2D(card, suv).rgb;
        float n = rnd(floor(suv * vec2(160.0,120.0)) + fract(time * 13.7) * 91.0);
        col = mix(col, vec3(n), max(staticAmt, damage * 0.12));
        float gr = dot(col, vec3(0.3, 0.59, 0.11));
        col = mix(col, vec3(gr), clamp(damage * 1.4, 0.0, 1.0));       // drains colour as it gets damaged
        vec2 cr = texture2D(crack, suv).rg;
        col = mix(col, vec3(0.92), max(cr.r * step(0.3, damage), cr.g * step(0.6, damage)));
        vec4 pc = texture2D(paint, suv);
        col = mix(col, pc.rgb, pc.a);                      // paintball splats
        col *= 0.86 + 0.14 * sin(suv.y * 480.0);          // scanlines
        col *= 1.0 - d * 1.1;                               // vignette
        col += (1.0 - power) * 0.8;                         // flash when switching off
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

// ---------- name label ----------
function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect(8, 8, 240, 48, 20); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.slice(0, 14), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(2.2, 0.55, 1);
  s.position.y = 3.35;
  s.renderOrder = 10;
  return s;
}

// ---------- TV-head character ----------
function makeTVHead(color, name) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2d2d34, roughness: 0.5 });
  const casing = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  const legL = new THREE.Group(); legL.position.set(-0.22, 0.75, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.22, 0.75, 0); g.add(legR);
  for (const leg of [legL, legR]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.3), dark); m.position.y = -0.375; m.castShadow = true; leg.add(m);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.45), dark); f.position.set(0, -0.7, 0.07); f.castShadow = true; leg.add(f);
  }
  add(new THREE.BoxGeometry(0.95, 0.85, 0.55), body, 0, 1.18, 0);
  const armL = add(new THREE.BoxGeometry(0.2, 0.7, 0.22), body, -0.6, 1.15, 0);
  const armR = add(new THREE.BoxGeometry(0.2, 0.7, 0.22), body, 0.6, 1.15, 0);
  add(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 10), dark, 0, 1.7, 0);

  // the TV
  add(new THREE.BoxGeometry(1.45, 1.1, 0.95), casing, 0, 2.3, 0);
  add(new THREE.BoxGeometry(1.25, 0.95, 0.05), dark, 0, 2.3, 0.47); // bezel
  const screenMat = makeScreenMaterial();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.86), screenMat);
  screen.position.set(0, 2.3, 0.501);
  g.add(screen);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), metal, 0.62, 1.86, 0.48).rotation.x = Math.PI / 2;
  // antennas
  for (const s of [-1, 1]) {
    const a = add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), metal, 0.18 * s, 3.2, 0);
    a.rotation.z = -0.45 * s;
    add(new THREE.SphereGeometry(0.06, 8, 8), metal, 0.38 * s, 3.62, 0);
  }
  add(new THREE.SphereGeometry(0.12, 10, 8), dark, 0, 2.86, 0);
  const label = makeLabel(name || 'Player');
  g.add(label);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.4 }));
  gun.position.set(0, -0.4, 0.22); gun.visible = false; armR.add(gun);
  return { group: g, screenMat, screen, legL, legR, armL, armR, label, gun };
}

function setLabel(p, name, muted = p.muted) {
  if (p.name === name && p.muted === muted) return;
  p.name = name; p.muted = muted;
  p.parts.group.remove(p.parts.label);
  p.parts.label = makeLabel(muted ? name + ' 🔇' : name);
  p.parts.group.add(p.parts.label);
}

// ---------- state ----------
let peer = null;
let localStream = null;
let myName = 'Player';
let myColor = COLORS[Math.floor(Math.random() * COLORS.length)];
let roomCode = '';
let started = false;
const conns = new Map();   // peerId -> DataConnection
const calls = new Map();   // peerId -> MediaConnection
const remotes = new Map(); // peerId -> player

const me = {
  pos: new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30),
  rot: Math.random() * Math.PI * 2, vy: 0, y: 0, score: 0, stunUntil: 0, zapCooldown: 0, walk: 0,
};
collide(me.pos);
let meParts = null;

// hidden holder for <video> elements (iOS needs them in the DOM)
const videoHolder = $('videos');

function attachVideoToScreen(screenMat, stream, mirror) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true;
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.srcObject = stream;
  videoHolder.appendChild(v);
  v.play().catch(() => {});
  const tex = new THREE.VideoTexture(v);
  tex.minFilter = THREE.LinearFilter;
  if (mirror) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; }
  screenMat.uniforms.map.value = tex;
  screenMat.uniforms.hasVideo.value = 1;
  return { video: v, tex };
}

function ensureRemote(id) {
  let p = remotes.get(id);
  if (p) return p;
  const parts = makeTVHead(0xaaaaaa, '…');
  scene.add(parts.group);
  p = { id, parts, name: '…', color: null, target: { x: 0, z: 0, r: 0, y: 0 }, pos: new THREE.Vector3(), rot: 0, y: 0,
        score: 0, stunned: false, walk: 0, seen: false, video: null, lastMsg: performance.now(), paint: makePaintLayer() };
  parts.screenMat.uniforms.paint.value = p.paint.tex;
  remotes.set(id, p);
  updateScores();
  return p;
}

function removeRemote(id) {
  const p = remotes.get(id);
  if (p) {
    scene.remove(p.parts.group);
    stopVoice(p);
    if (p.video) { p.video.video.srcObject = null; p.video.video.remove(); p.video.tex.dispose(); }
    remotes.delete(id);
  }
  conns.delete(id);
  const c = calls.get(id); if (c) { try { c.close(); } catch {} calls.delete(id); }
  updateScores();
}

function recolor(p, color) {
  if (p.color === color) return;
  p.color = color;
  p.parts.group.traverse((o) => {
    if (o.isMesh && o.material.color && o.material.color.getHex() === 0xaaaaaa) o.material = o.material.clone(), o.material.color.setHex(color);
  });
}

// ---------- networking ----------
// ---------- connection helpers (STUN finds a direct route; TURN relays when there isn't one) ----------
// Relay (TURN) for players whose networks block a direct link. ExpressTURN free tier, 1 TB/month.
const iceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: ['turn:free.expressturn.com:3478?transport=udp', 'turn:free.expressturn.com:3478?transport=tcp'],
    username: '000000002108901705',
    credential: '+dyhhWeT4XsCsbLO6yWExNws2pM=',
  },
];
async function loadIce() {}
const hasRelay = () => iceServers.some((s) => [].concat(s.urls).some((u) => String(u).startsWith('turn')));

function peerOptions() {
  const o = { debug: 1, config: { iceServers } };
  if (qs.has('relay')) o.config.iceTransportPolicy = 'relay';   // ?relay forces everything through the relay (for testing it)
  if (qs.get('peerhost')) {          // only for local testing
    o.host = qs.get('peerhost'); o.port = +qs.get('peerport') || 9000; o.path = '/'; o.secure = false;
    o.config = { iceServers: [] };
  }
  return o;
}

function send(conn, msg) { if (conn.open) { try { conn.send(msg); } catch {} } }
function broadcast(msg) { for (const c of conns.values()) send(c, msg); }

const MAX_PLAYERS = +qs.get('max') || 6;   // ?max= only used for testing
const doorId = () => 'tvhead-' + roomCode;
let door = null;              // a second Peer that owns the room code; one player holds it at a time
let holdingDoor = false;
let claiming = false;
let joinedAt = 0;
const pending = new Map();    // peerId -> time we started connecting
const doorHolders = new Set();

function setupConn(conn) {
  conn.on('open', () => {
    pending.delete(conn.peer);
    const old = conns.get(conn.peer);
    conns.set(conn.peer, conn);
    if (old && old !== conn) { try { old.close(); } catch {} }   // duplicate link – keep the newest
    ensureRemote(conn.peer);
    send(conn, { t: 'hi', name: myName, color: myColor });
    if (roundId) send(conn, { t: 'round', rid: roundId, cfg, state: roundState });
    updateStatus();
  });
  conn.on('data', (m) => onData(conn.peer, m));
  conn.on('close', () => {
    pending.delete(conn.peer);
    if (conns.get(conn.peer) !== conn) return;   // a replaced duplicate, not a real leave
    const p = remotes.get(conn.peer);
    toast(`${p && p.name !== '…' ? p.name : 'A player'} left`);
    doorHolders.delete(conn.peer);
    removeRemote(conn.peer);
    updateStatus();
  });
  conn.on('error', () => {});
}

function connectTo(id) {
  if (!id || conns.has(id) || id === peer.id) return;
  if (performance.now() - (pending.get(id) || -1e9) < 10000) return;
  pending.set(id, performance.now());
  const conn = peer.connect(id, { serialization: 'json' });
  setupConn(conn);
  const call = peer.call(id, localStream);
  if (call) setupCall(call);
}

// The "door" answers newcomers with the list of everyone in the room (or "full").
function openDoor(onOpen, onTaken) {
  const d = new Peer(doorId(), peerOptions());
  d.on('open', () => { door = d; holdingDoor = true; updateScores(); onOpen && onOpen(); });
  d.on('error', (err) => {
    if (err.type === 'unavailable-id') { d.destroy(); onTaken && onTaken(); }
    else console.warn('door error', err.type);
  });
  d.on('connection', (c) => {
    c.on('open', () => {
      const ids = [peer.id, ...conns.keys()];
      send(c, ids.length >= MAX_PLAYERS ? { t: 'full' } : { t: 'roster', ids });
      setTimeout(() => { try { c.close(); } catch {} }, 1500);
    });
    c.on('error', () => {});
  });
  d.on('disconnected', () => { if (!d.destroyed) d.reconnect(); });
}

// Every few seconds: share who we're connected to (fixes players who joined at the same moment),
// and if nobody holds the room code any more (host left), the longest-standing id takes it over.
let knocking = false;
setInterval(() => {
  if (!started || !peer || !peer.open) return;
  const now = performance.now();
  // heartbeat: players we haven't heard from in 8 s have gone (closed tab, lost signal)
  for (const [id, p] of [...remotes]) {
    if (now - p.lastMsg > 8000) {
      const c = conns.get(id);
      doorHolders.delete(id);
      removeRemote(id);
      try { c && c.close(); } catch {}
      toast(`${p.name !== '…' ? p.name : 'A player'} left`);
      updateStatus();
    }
  }
  broadcast({ t: 'peers', ids: [...conns.keys()], door: holdingDoor ? 1 : 0 });
  if (now - joinedAt < 7000 || holdingDoor || claiming || knocking) return;
  if (conns.size === 0) {
    // on our own (e.g. phone was locked): knock on the room again, or take it over if it's empty
    knocking = true;
    knock((r) => {
      knocking = false;
      if (r.t === 'roster') { for (const id of r.ids) connectTo(id); }
      else if (r === 'missing' || r === 'timeout') claimDoor();
    });
    return;
  }
  if (doorHolders.size === 0) {
    const all = [peer.id, ...conns.keys()].sort();
    if (all[0] === peer.id) claimDoor();
  }
}, 3000);

function claimDoor() {
  claiming = true;
  openDoor(() => { claiming = false; if (conns.size) toast(`You’re now hosting room ${roomCode}`); updateFeatureChips(); $('nextRoundBtn').classList.remove('hidden'); $('hostWait').classList.add('hidden'); if (roundState !== 'playing' && !$('waiting').classList.contains('hidden')) showSettings(); }, () => { claiming = false; });
}

// Ask whoever holds the room code for the player list. Calls back with the reply,
// or 'missing' (nobody holds the code) / 'timeout'.
let knockFail = null;
function knock(done) {
  let finished = false;
  const c = peer.connect(doorId(), { serialization: 'json' });
  const finish = (r) => {
    if (finished) return; finished = true;
    clearTimeout(timer); knockFail = null;
    try { c.close(); } catch {}
    done(r);
  };
  const timer = setTimeout(() => finish('timeout'), 8000);
  knockFail = () => finish('missing');
  c.on('data', finish);
  c.on('error', () => {});
}

function updateStatus() {
  const n = conns.size + 1;
  setStatus(`${n} player${n > 1 ? 's' : ''} in room ${roomCode}`);
  updateScores();
}

// Keep each outgoing video small: plenty for a TV screen, and it makes the free relay allowance last.
const MAX_VIDEO_BITRATE = 200_000;   // bits per second
function capVideo(call) {
  const pc = call.peerConnection;
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== 'video') continue;
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
    params.encodings[0].maxFramerate = 15;
    sender.setParameters(params).catch(() => {});
  }
}

function setupCall(call) {
  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    capVideo(call);
    const p = ensureRemote(call.peer);
    attachVoice(p, stream);
    if (p.video) return;
    p.video = attachVideoToScreen(p.parts.screenMat, stream, false);
  });
  call.on('error', () => {});
}

function onData(from, m) {
  const p = ensureRemote(from);
  p.lastMsg = performance.now();
  if (onRuleData(p, m) || onPaintData(p, m) || onPongData(p, m)) return;
  switch (m.t) {
    case 'hi':
      setLabel(p, String(m.name || 'Player'));
      recolor(p, m.color | 0);
      toast(`${p.name} joined`);
      updateScores();
      break;
    case 'peers':
      if (m.door) doorHolders.add(from); else doorHolders.delete(from);
      // the lower id dials, so two players never call each other at the same time
      for (const id of m.ids || []) if (!conns.has(id) && id !== peer.id && peer.id < id) connectTo(id);
      updateScores();
      break;
    case 's':
      p.target.x = m.x; p.target.z = m.z; p.target.r = m.r; p.target.y = m.y;
      if (!p.seen) { p.pos.set(m.x, 0, m.z); p.rot = m.r; p.seen = true; }
      p.stunned = !!m.st;
      if (!!m.mu !== !!p.muted) setLabel(p, p.name, !!m.mu);
      p.hp = m.hp ?? MAX_HP; p.ko = !!m.ko; p.hidden = !!m.hd;
      { const sc = m.rd === roundId ? (m.sc | 0) : 0; if (p.score !== sc) { p.score = sc; updateScores(); } }
      break;
    case 'zap':
      spawnBeam(p.pos, p.rot, p.y, m.len, m.w || 0);
      break;
    case 'hit':
      onHit(p, m);
      break;
  }
}

const VIDEO_C = { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 20, max: 24 } };
const AUDIO_C = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
let micTrack = null;
let micMuted = false;

async function tryMedia(c) { try { return await navigator.mediaDevices.getUserMedia(c); } catch { return null; } }

async function getCamera() {
  let s = await tryMedia({ video: VIDEO_C, audio: AUDIO_C });
  let vTrack = s?.getVideoTracks()[0] || null;
  let aTrack = s?.getAudioTracks()[0] || null;
  if (!s) {                                   // one of them was refused / missing – try separately
    vTrack = (await tryMedia({ video: VIDEO_C }))?.getVideoTracks()[0] || null;
    aTrack = (await tryMedia({ audio: AUDIO_C }))?.getAudioTracks()[0] || null;
  }
  if (vTrack) {
    $('selfview').srcObject = new MediaStream([vTrack]);
    $('selfview').play().catch(() => {});
  } else {
    // No camera: send the NO SIGNAL card as our video so connections still work.
    vTrack = cardCanvas.captureStream ? cardCanvas.captureStream(5).getVideoTracks()[0] : null;
    $('selfwrap').classList.add('nocam');
  }
  micTrack = aTrack;
  localStream = new MediaStream([vTrack, aTrack].filter(Boolean));
  if (!aTrack) { $('micBtn').classList.add('off'); $('micBtn').textContent = '🎤✕'; }
  if (!$('selfwrap').classList.contains('nocam') && aTrack) return true;
  toast(!vTrack || $('selfwrap').classList.contains('nocam') ? (aTrack ? 'No camera – voice only' : 'No camera or mic') : 'No mic – others won’t hear you');
  return false;
}

function setMic(muted) {
  if (!micTrack) { toast('No microphone available'); return; }
  micMuted = muted;
  micTrack.enabled = !muted;
  $('micBtn').classList.toggle('off', muted);
  $('micBtn').textContent = muted ? '🔇' : '🎤';
  toast(muted ? 'Mic muted' : 'Mic on');
}

// ---------- proximity voice ----------
let audioCtx = null;
const VOICE_NEAR = 4, VOICE_FAR = 22;
function initAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  audioCtx.resume().catch(() => {});
  // iOS needs a resume inside a gesture; keep trying on taps.
  const kick = () => { if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {}); };
  addEventListener('pointerdown', kick); addEventListener('keydown', kick);
}

function attachVoice(p, stream) {
  if (p.voice || !stream.getAudioTracks().length) return;
  if (audioCtx) {
    const src = audioCtx.createMediaStreamSource(stream);
    const gain = audioCtx.createGain(); gain.gain.value = 0;
    const pan = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    const an = audioCtx.createAnalyser(); an.fftSize = 256;
    src.connect(an);
    src.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(audioCtx.destination); } else gain.connect(audioCtx.destination);
    p.voice = { src, gain, pan, an, buf: new Uint8Array(an.fftSize) };
  } else {
    // very old browsers: plain element, volume only
    const a = new Audio(); a.srcObject = stream; a.autoplay = true; a.play().catch(() => {});
    videoHolder.appendChild(a);
    p.voice = { el: a };
  }
}

function updateVoice(p) {
  if (!p.voice) return;
  const dx = p.pos.x - me.pos.x, dz = p.pos.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  let vol = d <= VOICE_NEAR ? 1 : d >= VOICE_FAR ? 0 : 1 - (d - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR);
  vol = vol * vol;                                           // falls off more naturally
  if (!p.seen || p.parts.screenMat.uniforms.power.value < 0.3) vol = 0;
  p.vol = vol;
  if (p.voice.el) { p.voice.el.volume = vol; return; }
  const t = audioCtx.currentTime;
  p.voice.gain.gain.setTargetAtTime(vol, t, 0.08);
  if (p.voice.pan) {
    const rx = -Math.cos(me.rot), rz = Math.sin(me.rot);    // listener's right
    const side = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
    p.voice.pan.pan.setTargetAtTime(side * 0.8, t, 0.08);
  }
  // talking indicator
  const an = p.voice.an; an.getByteTimeDomainData(p.voice.buf);
  let peak = 0; for (const v of p.voice.buf) peak = Math.max(peak, Math.abs(v - 128));
  p.talking = peak > 10 && !p.muted;
}

function stopVoice(p) {
  if (!p.voice) return;
  if (p.voice.el) p.voice.el.remove();
  else { p.voice.src.disconnect(); p.voice.gain.disconnect(); p.voice.pan?.disconnect(); }
  p.voice = null;
}

function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
}

function onPeerError(err) {
  console.warn('peer error', err.type, err);
  if (err.type === 'peer-unavailable') {
    if (String(err.message).includes(doorId()) && knockFail) knockFail();
  }
  else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') setStatus('Can’t reach the lobby server – check your internet.', true);
  else if (err.type === 'browser-incompatible') setStatus('This browser can’t do video calls. Try Chrome or Safari.', true);
}

function wirePeer() {
  peer.on('connection', setupConn);
  peer.on('call', (call) => { call.answer(localStream); setupCall(call); });
  peer.on('error', onPeerError);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
}

async function withMainPeer(cb) {
  await loadIce();
  if (peer && peer.open) return cb();
  if (!peer) { peer = new Peer(undefined, peerOptions()); wirePeer(); }
  peer.once('open', cb);
}

let prepared = false;
async function prepare() {
  if (prepared) return;
  prepared = true;
  initAudio();
  myName = ($('name').value.trim() || 'Player').slice(0, 14);
  try { localStorage.setItem('tvhead-name', myName); } catch {}
  setStatus('Starting camera…');
  await getCamera();
  if (!meParts) {
    meParts = makeTVHead(myColor, myName);
    meParts.group.remove(meParts.label);
    scene.add(meParts.group);
    if (localStream && !$('selfwrap').classList.contains('nocam')) meVideo = attachVideoToScreen(meParts.screenMat, localStream, false);
    ensureMicMeter();
    mePaint = makePaintLayer();
    meParts.screenMat.uniforms.paint.value = mePaint.tex;
  }
}

let busy = false;
async function host() {
  if (busy) return; busy = true;
  await prepare();
  roomCode = makeCode();
  setStatus('Creating room…');
  withMainPeer(() => openDoor(
    () => { busy = false; joinedAt = performance.now(); startGame(); updateStatus(); },
    () => { busy = false; host(); },                      // code already in use – pick another
  ));
}

async function join() {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { setStatus('Enter the 4-letter room code', true); return; }
  if (busy) return; busy = true;
  await prepare();
  roomCode = code;
  setStatus('Joining…');
  withMainPeer(() => tryJoin(0));
}

let sawRoom = false;
function tryJoin(attempt) {
  if (attempt === 0) sawRoom = false;
  knock((r) => {
    if (r === 'timeout') sawRoom = true;   // the room answered the lobby but we couldn't reach it
    if (r.t === 'full') { busy = false; setStatus(`Room ${roomCode} is full (${MAX_PLAYERS} players max).`, true); return; }
    if (r.t === 'roster') {
      busy = false; joinedAt = performance.now(); startGame();
      for (const id of r.ids) connectTo(id);
      updateStatus(); return;
    }
    // nobody answering – the host may be handing over, so try a few more times
    if (attempt < 4) { setStatus('Looking for room…'); setTimeout(() => tryJoin(attempt + 1), 3000); }
    else if (sawRoom) {
      busy = false;
      setStatus(hasRelay()
        ? 'Found the room but couldn’t connect. Try again, or switch Wi-Fi/mobile data.'
        : 'Found the room but your networks block a direct link – a relay server is needed.', true);
    }
    else { busy = false; setStatus('Room not found. Check the code (and that the host’s screen is on).', true); }
  });
}

function startGame() {
  started = true;
  try { sessionStorage.setItem('tvhead-room', roomCode); } catch {}
  $('lobby').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('roomcode').textContent = roomCode;
  if (isTouch) $('touch').classList.remove('hidden');
  if (!roundId) { if (holdingDoor) showSettings(); else $('waiting').classList.remove('hidden'); }
  updateFeatureChips();
  updateScores();
}
function showLobby() { $('lobby').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); started = false; }

// ---------- UI ----------
let toastTimer;
function toast(t) {
  const el = $('toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function buzz() { try { navigator.vibrate && navigator.vibrate(120); } catch {} }

function updateScores() {
  const rows = [{ name: (holdingDoor ? '👑 ' : '') + myName + ' (you)', score: me.score, color: myColor }];
  for (const p of remotes.values()) rows.push({ name: (doorHolders.has(p.id) ? '👑 ' : '') + p.name, score: p.score, color: p.color ?? 0xaaaaaa });
  rows.sort((a, b) => b.score - a.score);
  $('scores').innerHTML = rows.map((r) =>
    `<div><span class="dot" style="background:#${r.color.toString(16).padStart(6, '0')}"></span>${escapeHtml(r.name)}<b>${r.score}</b></div>`).join('');
  checkWin();
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

$('hostBtn').onclick = () => host();
$('micBtn').onclick = () => setMic(!micMuted);
$('joinBtn').onclick = () => join();
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
try { $('name').value = localStorage.getItem('tvhead-name') || ''; } catch {}
if (/^#[A-Za-z]{4}$/.test(location.hash)) $('code').value = location.hash.slice(1).toUpperCase();
else { try { const rc = sessionStorage.getItem('tvhead-room'); if (rc) $('code').value = rc; } catch {} }
$('safeGfx').checked = safeGfx;
$('safeGfx').onchange = () => { lsSet('tvhead-safe', $('safeGfx').checked ? '1' : '0'); location.reload(); };
$('gpuName').textContent = gpuName;
$('copyBtn').onclick = async () => {
  const link = location.href.split('#')[0] + '#' + roomCode;
  try { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
  catch { toast('Room code: ' + roomCode); }
};

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyM' && started && !e.repeat) setMic(!micMuted);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let touchLookDX = 0, touchLookDY = 0;
const touch = { x: 0, y: 0, zap: false, jump: false, aim: false };
{
  // floating joystick: put your thumb down anywhere on the left side
  const zone = $('moveZone'), stick = $('stick'), knob = $('knob');
  let id = null, cx = 0, cy = 0;
  const R = 55;
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId; zone.setPointerCapture(id);
    cx = e.clientX; cy = e.clientY;
    stick.style.left = cx + 'px'; stick.style.top = cy + 'px';
    stick.classList.add('active');
    knob.style.transform = '';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    touch.x = dead(dx / R); touch.y = dead(dy / R);
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null; touch.x = touch.y = 0; knob.style.transform = ''; stick.classList.remove('active');
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  // look: drag on the right side (sensitivity scales with screen size so every phone feels the same)
  const look = $('lookZone');
  let lid = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', (e) => { if (lid !== null) return; lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lid) return;
    touchLookDX += (e.clientX - lx) / Math.min(innerWidth, innerHeight);
    touchLookDY += (e.clientY - ly) / Math.min(innerWidth, innerHeight);
    lx = e.clientX; ly = e.clientY;
  });
  const lend = (e) => { if (e.pointerId === lid) lid = null; };
  look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);

  for (const [btn, k] of [[$('zapBtn'), 'zap'], [$('jumpBtn'), 'jump']]) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); touch[k] = true; btn.classList.add('down'); });
    const up = () => { touch[k] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  }
  // AIM is a toggle on phones – much easier than holding it while you shoot
  $('aimBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); touch.aim = !touch.aim; $('aimBtn').classList.toggle('on', touch.aim); });
}

// ---------- Arc Raiders-style look: pointer lock, over-the-shoulder camera, fixed crosshair ----------
let camYaw = me.rot, camPitch = -0.1;
let mouseDX = 0, mouseDY = 0, mouseFire = false, mouseAim = false;
const locked = () => document.pointerLockElement === renderer.domElement;
const overlayOpen = () => ['settings', 'results', 'lobby'].some((id) => !$(id).classList.contains('hidden'));
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!started || overlayOpen()) return;
  if (!locked()) { try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} return; }
  if (e.button === 0) mouseFire = true;
  if (e.button === 2) mouseAim = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseFire = false; if (e.button === 2) mouseAim = false; });
addEventListener('mousemove', (e) => { if (locked()) { mouseDX += e.movementX; mouseDY += e.movementY; } });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => { if (!locked()) { mouseFire = false; mouseAim = false; } });
function releaseMouse() { if (locked()) document.exitPointerLock(); }

function readInput() {
  let fwd = 0, strafe = 0, lookX = 0, lookY = 0, zap = false, jump = false, aim = false, sprint = false;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (keys.has('ArrowLeft')) lookX -= 1;              // keyboard-only players can still turn
  if (keys.has('ArrowRight')) lookX += 1;
  if (keys.has('KeyF') || keys.has('Enter') || keys.has('KeyK')) zap = true;
  if (keys.has('Space')) jump = true;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) sprint = true;
  if (keys.has('KeyQ')) aim = true;
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    fwd += -dz(gp.axes[1] || 0);
    strafe += dz(gp.axes[0] || 0);
    lookX += dz(gp.axes[2] || 0); lookY += dz(gp.axes[3] || 0);
    if (gp.buttons[0]?.pressed) jump = true;
    if (gp.buttons[7]?.pressed || gp.buttons[5]?.pressed || gp.buttons[2]?.pressed) zap = true;
    if (gp.buttons[6]?.pressed || gp.buttons[4]?.pressed) aim = true;
    if (gp.buttons[10]?.pressed || gp.buttons[1]?.pressed) sprint = true;
  }
  fwd += -touch.y; strafe += touch.x;
  zap ||= touch.zap || mouseFire;
  jump ||= touch.jump; aim ||= mouseAim || touch.aim;
  return { fwd: Math.max(-1, Math.min(1, fwd)), strafe: Math.max(-1, Math.min(1, strafe)), lookX, lookY, zap, jump, aim, sprint };
}

// ---------- zap beams ----------
const beams = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.9 });
function spawnBeam(pos, rot, y, len = 14, power = 0) {
  const r = 0.08 + 0.22 * power;
  const geo = new THREE.CylinderGeometry(r, r, len, 6);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, beamMat.clone());
  if (power > 0.3) m.material.color.setHex(0xff9f1c);
  m.position.set(pos.x + Math.sin(rot) * 0.55, 2.3 + y, pos.z + Math.cos(rot) * 0.55);
  m.rotation.y = rot;
  scene.add(m);
  beams.push({ m, life: 0.25 });
}

function tryZap(power = 0) {
  if (me.hidden) { toast('👻 Uncover your camera to zap'); return; }
  const range = 16 + 12 * power;
  const fx = Math.sin(me.rot), fz = Math.cos(me.rot);
  let best = null, bestD = range;
  for (const p of remotes.values()) {
    if (!p.seen || p.hidden || p.ko) continue;
    const dx = p.pos.x - me.pos.x, dz = p.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1 || d > bestD) continue;
    if ((dx * fx + dz * fz) / d < 0.975) continue;
    best = p; bestD = d;
  }
  const len = best ? bestD : range;
  spawnBeam(me.pos, me.rot, me.y, len, power);
  broadcast({ t: 'zap', len, w: +power.toFixed(2) });
  if (best && !best.stunned) {
    const c = conns.get(best.id);
    if (c) send(c, { t: 'hit', rd: roundId });
    zapCam(best);
    if (playing() && !cfg.damage) { me.score++; updateScores(); }
  }
}

// =====================================================================
// ---------- rounds, host settings and camera/voice features ----------
// =====================================================================
const FEATURES = [
  ['damage', '💥 Screen damage', '3 hits knock a TV out. Knockouts score.'],
  ['hide', '👻 Cover to hide', 'Cover your camera to go invisible (no zapping while hidden).'],
  ['zapcam', '📸 Zap cam', 'Snap a photo of every face you zap – gallery at the end.'],
  ['billboards', '🏆 Leader billboards', 'Giant screens show whoever’s winning.'],
  ['mouth', '😮 Mouth to fire', 'Open your mouth wide to shoot.'],
  ['laugh', '😂 Try not to laugh', 'Smile and the nearest player gets a point.'],
  ['freeze', '🗿 Freeze!', 'When FREEZE! is called, move – or your face moves – and lose a point.'],
  ['shout', '📣 Shout power', 'The louder you shout as you zap, the further it goes.'],
  ['gun', '🔫 Blaster', 'Replaces the zap. Hold to fire fast. Hits crack their screen – and their view. 60% cracked = smashed.'],
];
const DEFAULT_CFG = { target: 10, damage: true, hide: true, zapcam: true, billboards: true, mouth: false, laugh: false, freeze: false, shout: false, gun: false, mode: 'battle' };
const MAX_HP = 3;
let cfg = { ...DEFAULT_CFG };
let roundId = 0;
let roundState = 'setup';          // setup | playing | ended
const zapPhotos = [];
me.hp = MAX_HP; me.koUntil = 0; me.hidden = false;
const playing = () => roundState === 'playing';

// ----- settings panel (host) -----
function savedCfg() { try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem('tvhead-cfg') || '{}') }; } catch { return { ...DEFAULT_CFG }; } }
function buildSettings() {
  const c = savedCfg();
  $('featureList').innerHTML = FEATURES.map(([k, name, desc]) =>
    `<label class="feat"><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}><span><b>${name}</b><small>${desc}</small></span></label>`).join('');
  $('target').value = String(c.target);
  $('mode').value = c.mode || 'battle';
  $('featureList').classList.toggle('dim', $('mode').value === 'pong');
}
$('mode').onchange = () => $('featureList').classList.toggle('dim', $('mode').value === 'pong');
function readSettings() {
  const c = { target: +$('target').value || 10, mode: $('mode').value };
  for (const el of $('featureList').querySelectorAll('input')) c[el.dataset.k] = el.checked;
  try { localStorage.setItem('tvhead-cfg', JSON.stringify(c)); } catch {}
  return c;
}
function showSettings() { releaseMouse(); buildSettings(); hideOverlays(); $('settings').classList.remove('hidden'); }
function hideOverlays() { for (const id of ['settings', 'results', 'waiting']) $(id).classList.add('hidden'); }
$('startRoundBtn').onclick = () => startRound();
$('settingsBtn').onclick = () => showSettings();
$('closeSettingsBtn').onclick = () => { $('settings').classList.add('hidden'); if (!playing()) $('waiting').classList.remove('hidden'); };
$('nextRoundBtn').onclick = () => showSettings();
$('keepPlayingBtn').onclick = () => $('results').classList.add('hidden');

function startRound() {
  const c = readSettings();
  if (c.mode === 'pong') c.pongIds = [peer.id, ...conns.keys()].sort();
  const m = { t: 'round', rid: Date.now(), cfg: c, state: 'playing' };
  applyRound(m);
  broadcast(m);
}

function applyRound(m) {
  if (!m.rid || m.rid <= roundId) return;
  roundId = m.rid;
  cfg = { ...DEFAULT_CFG, ...m.cfg };
  me.score = 0; me.hp = MAX_HP; me.koUntil = 0; me.stunUntil = 0;
  touch.aim = false; $('aimBtn').classList.remove('on');
  zapPhotos.length = 0;
  for (const p of remotes.values()) { p.score = 0; clearPaint(p.paint); }
  clearPaint(mePaint); clearFloorSplats(); setTimeout(redrawPaintView);
  roundState = m.state === 'ended' ? 'ended' : 'playing';
  if (cfg.mode === 'pong') buildPong();
  else {
    destroyPong();
    if (meParts) { meParts.group.visible = true; meParts.group.scale.setScalar(1); }
    if (Math.abs(me.pos.x) > 100) respawn();
  }
  nextFreezeAt = performance.now() + 12000 + Math.random() * 10000;
  hideOverlays();
  if (roundState === 'playing') toast(`Round on! First to ${cfg.target}`);
  else $('waiting').classList.remove('hidden');
  if (cfg.mouth || cfg.laugh) ensureFace();
  updateFeatureChips();
  updateScores();
}

function updateFeatureChips() {
  const on = FEATURES.filter(([k]) => cfg[k]).map(([, n]) => n.split(' ')[0]).join(' ');
  $('chips').textContent = !roundId ? 'Warm-up' : cfg.mode === 'pong' ? `🏓 TV Pong · first to ${cfg.target}` : `First to ${cfg.target} ${on}`;
  $('settingsBtn').classList.toggle('hidden', !holdingDoor);
  $('zapBtn').textContent = cfg.mouth && face ? '😮' : cfg.gun && roundId ? '🔫' : '⚡';
}

function checkWin() {
  if (!playing()) return;
  const all = [{ name: myName, score: me.score, mine: true }, ...[...remotes.values()].map((p) => ({ name: p.name, score: p.score }))];
  const w = all.find((r) => r.score >= cfg.target);
  if (w) endRound(w);
}

function endRound(w) {
  roundState = 'ended';
  releaseMouse();
  updateScores();
  hideOverlays();
  $('winner').textContent = w.mine ? '🏆 You win!' : `🏆 ${w.name} wins!`;
  $('finalScores').innerHTML = $('scores').innerHTML;
  $('gallery').innerHTML = zapPhotos.length
    ? zapPhotos.map((p) => `<figure><img src="${p.src}"><figcaption>${escapeHtml(p.caption)}</figcaption></figure>`).join('')
    : (cfg.zapcam ? '<p class="muted">No zap-cam photos this round.</p>' : '');
  $('galleryTitle').classList.toggle('hidden', !cfg.zapcam);
  $('nextRoundBtn').classList.toggle('hidden', !holdingDoor);
  $('hostWait').classList.toggle('hidden', holdingDoor);
  $('results').classList.remove('hidden');
}

// ----- camera sampler: brightness (hide) + motion (freeze) -----
const sampCanvas = document.createElement('canvas');
sampCanvas.width = 16; sampCanvas.height = 12;
const sampCtx = sampCanvas.getContext('2d', { willReadFrequently: true });
let prevLum = null, camMotion = 0, darkCount = 0, sampT = 0;
function sampleCamera(now) {
  if (now - sampT < 150) return;
  sampT = now;
  const v = $('selfview');
  const hasCam = !$('selfwrap').classList.contains('nocam') && v.readyState >= 2;
  let dark = false;
  if (window.__tv.fakeDark !== undefined) dark = window.__tv.fakeDark;
  else if (hasCam) {
    sampCtx.drawImage(v, 0, 0, 16, 12);
    const d = sampCtx.getImageData(0, 0, 16, 12).data;
    const lum = new Float32Array(192);
    let sum = 0;
    for (let i = 0; i < 192; i++) { lum[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; sum += lum[i]; }
    const mean = sum / 192;
    let vr = 0, diff = 0;
    for (let i = 0; i < 192; i++) { vr += (lum[i] - mean) ** 2; if (prevLum) diff += Math.abs(lum[i] - prevLum[i]); }
    const std = Math.sqrt(vr / 192);
    camMotion = prevLum ? diff / 192 : 0;
    prevLum = lum;
    dark = mean < 30 && std < 14;          // a hand over the lens: dark and flat
  }
  if (window.__tv.fakeMotion !== undefined) camMotion = window.__tv.fakeMotion;
  darkCount = dark ? darkCount + 1 : 0;
  const wantHidden = cfg.hide && playing() && darkCount >= 2;
  if (wantHidden !== me.hidden) { me.hidden = wantHidden; toast(wantHidden ? '👻 Hidden! Uncover to zap' : 'Visible again'); }
}

// ----- opacity for hidden players -----
function setOpacity(parts, o) {
  if (parts.opacity === o) return;
  parts.opacity = o;
  parts.group.traverse((m) => {
    if (!m.material) return;
    if (m.material.uniforms && m.material.uniforms.alpha) { m.material.uniforms.alpha.value = o; m.material.transparent = o < 1; }
    else { m.material.transparent = o < 1; m.material.opacity = o; }
    m.castShadow = o >= 1;
  });
}

// ----- zap cam -----
const snapCanvas = document.createElement('canvas');
snapCanvas.width = 240; snapCanvas.height = 180;
function zapCam(p) {
  if (!cfg.zapcam || !p.video || !p.video.video.videoWidth) return;
  const v = p.video.video, g = snapCanvas.getContext('2d');
  const va = v.videoWidth / v.videoHeight, ca = 4 / 3;
  let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
  if (va > ca) { sw = sh * ca; sx = (v.videoWidth - sw) / 2; } else { sh = sw / ca; sy = (v.videoHeight - sh) / 2; }
  g.drawImage(v, sx, sy, sw, sh, 0, 0, 240, 180);
  const src = snapCanvas.toDataURL('image/jpeg', 0.75);
  zapPhotos.push({ src, caption: `${myName} zapped ${p.name}` });
  if (zapPhotos.length > 24) zapPhotos.shift();
  const pop = $('snapPop');
  pop.src = src; pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
}

// ----- screen-damage cracks -----
const crackCanvas = document.createElement('canvas');
crackCanvas.width = 256; crackCanvas.height = 192;
{
  const g = crackCanvas.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 192);
  g.globalCompositeOperation = 'lighter';
  const crack = (color, x, y, n, len) => {
    g.strokeStyle = color; g.lineWidth = 5; g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + Math.random() * 0.6, cx = x, cy = y;
      g.beginPath(); g.moveTo(cx, cy);
      for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.9; cx += Math.cos(a) * len * (0.5 + Math.random()); cy += Math.sin(a) * len * (0.5 + Math.random()); g.lineTo(cx, cy); }
      g.stroke();
    }
  };
  crack('#f00', 80, 70, 7, 22);
  crack('#0f0', 175, 115, 9, 26);
}
const crackTex = new THREE.CanvasTexture(crackCanvas);

// ----- leader billboards -----
const billboards = [];
{
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x555577 });
  const spots = [[0, -(ARENA - 1.2), 0], [0, ARENA - 1.2, Math.PI], [-(ARENA - 1.2), 0, Math.PI / 2], [ARENA - 1.2, 0, -Math.PI / 2]];
  for (const [x, z, ry] of spots) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(8.6, 6.6, 0.4), frameMat); box.position.y = 7; g.add(box);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), postMat); post.position.set(3 * s, 2, 0); g.add(post); }
    const mat = makeScreenMaterial();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), mat); scr.position.set(0, 7, 0.21); g.add(scr);
    const lbl = makeLabel('LEADER'); lbl.position.set(0, 10.8, 0); lbl.scale.set(6, 1.5, 1); g.add(lbl);
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    billboards.push({ g, mat, lbl, leader: undefined });
  }
}
let meVideo = null;
function updateBillboards(time) {
  const show = cfg.billboards && roundId > 0;
  let lead = null, best = 0;
  if (show) {
    if (me.score > best) { best = me.score; lead = { id: 'me', name: myName, tex: meVideo?.tex, v: meVideo?.video }; }
    for (const p of remotes.values()) if (p.score > best) { best = p.score; lead = { id: p.id, name: p.name, tex: p.video?.tex, v: p.video?.video }; }
  }
  for (const b of billboards) {
    b.g.visible = show;
    if (!show) continue;
    const u = b.mat.uniforms;
    u.time.value = time;
    const key = lead ? lead.id + ':' + lead.name : '';
    if (b.leader !== key) {
      b.leader = key;
      b.g.remove(b.lbl); b.lbl = makeLabel(lead ? '👑 ' + lead.name : 'No leader yet'); b.lbl.position.set(0, 10.8, 0); b.lbl.scale.set(6, 1.5, 1); b.g.add(b.lbl);
      u.map.value = lead && lead.tex ? lead.tex : cardTex;
      u.hasVideo.value = lead && lead.tex ? 1 : 0;
    }
    if (lead && lead.v && lead.v.videoWidth) u.videoAspect.value = lead.v.videoWidth / lead.v.videoHeight;
  }
}

// ----- knockouts -----
function respawn() {
  me.pos.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40);
  collide(me.pos);
  me.hp = MAX_HP;
  if (mePaint && mePaint.coverage > 0) { clearPaint(mePaint); redrawPaintView(); broadcast({ t: 'clean' }); }
}

// ----- freeze! -----
let nextFreezeAt = Infinity, freeze = null;   // freeze = { start, end, caught }
function callFreeze() {
  const m = { t: 'freeze', rd: roundId };
  broadcast(m);
  startFreeze();
}
function startFreeze() {
  const now = performance.now();
  freeze = { start: now, end: now + 3500, graceEnd: now + 900, caught: false };
  const el = $('freeze'); el.textContent = 'FREEZE!'; el.classList.remove('hidden');
  buzz();
}
function updateFreeze(now, inp) {
  if (holdingDoor && cfg.freeze && playing() && now > nextFreezeAt) {
    nextFreezeAt = now + 15000 + Math.random() * 15000;
    callFreeze();
  }
  if (!freeze) return;
  if (now > freeze.end) {
    $('freeze').classList.add('hidden');
    if (!freeze.caught && playing()) toast('Safe! 🗿');
    freeze = null; return;
  }
  if (now < freeze.graceEnd || freeze.caught || me.koUntil > now) return;
  const moved = Math.abs(inp.fwd) > 0.15 || Math.abs(inp.strafe) > 0.15 || inp.jump || inp.zap || camMotion > 9;
  if (moved) {
    freeze.caught = true;
    $('freeze').textContent = 'YOU MOVED!';
    if (playing()) { me.score = Math.max(0, me.score - 1); updateScores(); }
    me.stunUntil = now + 1500;
    buzz();
  }
}

// ----- mic loudness (shout power) -----
let micAnalyser = null, micBuf = null, loud = 0;
function ensureMicMeter() {
  if (micAnalyser || !audioCtx || !micTrack) return;
  const src = audioCtx.createMediaStreamSource(new MediaStream([micTrack]));
  micAnalyser = audioCtx.createAnalyser(); micAnalyser.fftSize = 512;
  micBuf = new Float32Array(micAnalyser.fftSize);
  src.connect(micAnalyser);
}
function updateLoudness(dt) {
  let level = 0;
  if (window.__tv.fakeLoud !== undefined) level = window.__tv.fakeLoud;
  else if (micAnalyser && !micMuted) {
    micAnalyser.getFloatTimeDomainData(micBuf);
    let s = 0; for (const x of micBuf) s += x * x;
    level = Math.min(1, Math.sqrt(s / micBuf.length) * 6);
  }
  loud = Math.max(level, loud - dt * 1.5);      // hold peaks briefly
  const meter = $('loudMeter');
  meter.classList.toggle('hidden', !(cfg.shout && playing()));
  meter.firstElementChild.style.width = Math.round(loud * 100) + '%';
}

// ----- face tracking (mouth to fire, try not to laugh) -----
let face = null, faceLoading = false, lastFace = 0;
const faceState = { jaw: 0, smile: 0 };
async function ensureFace() {
  if (face || faceLoading) return;
  if ($('selfwrap').classList.contains('nocam') && window.__tv.fakeFace === undefined) { toast('Face features need a camera'); return; }
  faceLoading = true;
  toast('Loading face tracking…');
  const base = qs.get('mpbase') || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
  const model = qs.get('mpmodel') || 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  try {
    const vision = await import(/* @vite-ignore */ base + '/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
    try { face = await vision.FaceLandmarker.createFromOptions(fileset, opts(safeGfx ? 'CPU' : 'GPU')); }
    catch { face = await vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    toast('😮 Face tracking ready');
  } catch (e) {
    console.warn('face tracking failed', e);
    toast('Face tracking isn’t available on this device');
  }
  faceLoading = false;
  updateFeatureChips();
}
function updateFace(now) {
  if (!(cfg.mouth || cfg.laugh) || !playing()) return;
  if (window.__tv.fakeFace) { Object.assign(faceState, window.__tv.fakeFace); return; }
  const v = $('selfview');
  if (!face || v.readyState < 2 || now - lastFace < 70) return;
  lastFace = now;
  try {
    const r = face.detectForVideo(v, now);
    const cats = r.faceBlendshapes?.[0]?.categories;
    if (!cats) { faceState.jaw = 0; faceState.smile = 0; return; }
    const get = (n) => cats.find((c) => c.categoryName === n)?.score || 0;
    faceState.jaw = get('jawOpen');
    faceState.smile = (get('mouthSmileLeft') + get('mouthSmileRight')) / 2;
  } catch {}
}
const facePresent = () => !!face || !!window.__tv.fakeFace;
let mouthWasOpen = false, smileSince = 0, laughCooldown = 0;
function mouthFire() {
  const open = faceState.jaw > 0.45;
  const fire = open && !mouthWasOpen;
  mouthWasOpen = open;
  return fire;
}
function updateLaugh(now) {
  if (!cfg.laugh || !playing() || now < laughCooldown) return;
  if (faceState.smile > 0.55) {
    if (!smileSince) smileSince = now;
    if (now - smileSince > 350) {
      smileSince = 0; laughCooldown = now + 3500;
      me.stunUntil = now + 1200;
      let near = null, nd = Infinity;
      for (const p of remotes.values()) {
        if (!p.seen) continue;
        const d = Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
        if (d < nd) { nd = d; near = p; }
      }
      if (near) { const c = conns.get(near.id); if (c) send(c, { t: 'laughpt', rd: roundId }); toast(`😂 You laughed! +1 to ${near.name}`); }
      else toast('😂 You laughed!');
      buzz();
    }
  } else smileSince = 0;
}

// ----- messages for the features -----
function onRuleData(p, m) {
  switch (m.t) {
    case 'round': applyRound(m); return true;
    case 'freeze': if (m.rd === roundId) startFreeze(); return true;
    case 'ko':
      if (m.rd === roundId && playing()) { me.score++; toast(cfg.gun ? `🔫 You smashed ${p.name}'s screen!` : `💥 You knocked out ${p.name}!`); updateScores(); }
      return true;
    case 'laughpt':
      if (m.rd === roundId && playing()) { me.score++; toast(`😂 You made ${p.name} laugh! +1`); updateScores(); }
      return true;
  }
  return false;
}
function onHit(p, m) {
  const now = performance.now();
  if (me.hidden || now < me.koUntil || now < me.stunUntil) return;
  me.stunUntil = now + 1500;
  buzz();
  if (cfg.damage && !cfg.gun && playing() && m.rd === roundId) {
    me.hp--;
    if (me.hp <= 0) {
      me.koUntil = now + 3000;
      me.stunUntil = me.koUntil;
      const c = conns.get(p.id);
      if (c) send(c, { t: 'ko', rd: roundId });
      toast(`💥 Knocked out by ${p.name}!`);
      setTimeout(respawn, 3000);
      return;
    }
    toast(`Zapped by ${p.name}! ${'❤️'.repeat(me.hp)}`);
  } else toast(`Zapped by ${p.name}!`);
}

// =====================================================================
// ---------- blaster: rapid fire, hits crack the screen (and the victim's view) ----------
// =====================================================================
const PAINT_W = 256, PAINT_H = 192, PAINT_OUT = 0.6;   // screen smashed at 60% cracked
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makePaintLayer() {
  const c = document.createElement('canvas');
  c.width = PAINT_W; c.height = PAINT_H;
  const tex = new THREE.CanvasTexture(c);
  return { c, g: c.getContext('2d', { willReadFrequently: true }), tex, coverage: 0 };
}
function clearPaint(layer) {
  if (!layer) return;
  layer.g.clearRect(0, 0, PAINT_W, PAINT_H);
  layer.tex.needsUpdate = true;
  layer.coverage = 0;
}
// A bullet crack at u,v (0..1 across the TV, v=0 at the bottom). Same seed = same crack on every device.
function drawCrack(layer, u, v, size, seed) {
  drawCrackOn(layer.g, PAINT_W, PAINT_H, u, v, size, seed, 1);
  layer.tex.needsUpdate = true;
}
function drawCrackOn(g, W, H, u, v, size, seed, lw) {
  const r = seeded(seed);
  const x = u * W, y = (1 - v) * H, R = size * W;
  g.save();
  const frost = g.createRadialGradient(x, y, 0, x, y, R * 0.3);
  frost.addColorStop(0, 'rgba(255,255,255,0.95)');
  frost.addColorStop(0.35, 'rgba(225,238,255,0.65)');
  frost.addColorStop(1, 'rgba(220,235,255,0)');
  g.fillStyle = frost; g.beginPath(); g.arc(x, y, R * 0.3, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const n = 7 + Math.floor(r() * 5);
  const rings = [[], []];
  const rays = [];
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5, px = x, py = y;
    const len = R * (0.55 + r() * 0.75), seg = 6, pts = [[px, py]];
    for (let s = 1; s <= seg; s++) {
      a += (r() - 0.5) * 0.45;
      px += Math.cos(a) * len / seg; py += Math.sin(a) * len / seg;
      pts.push([px, py]);
      if (s === 2) rings[0].push([px, py]);
      if (s === 4) rings[1].push([px, py]);
    }
    rays.push(pts);
  }
  const stroke = (pts, w) => {
    g.lineWidth = (w + 2) * lw; g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
    g.lineWidth = w * lw; g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
  };
  for (const pts of rays) stroke(pts, 1.6);
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {      // the web-like rings between rays
    if (r() < 0.25) continue;
    const a = ring[i], b = ring[(i + 1) % ring.length];
    stroke([a, [(a[0] + b[0]) / 2 + (r() - 0.5) * 6 * W / 256, (a[1] + b[1]) / 2 + (r() - 0.5) * 6 * W / 256], b], 1.1);
  }
  g.restore();
}
const covCanvas = document.createElement('canvas');
covCanvas.width = 64; covCanvas.height = 48;
const covCtx = covCanvas.getContext('2d', { willReadFrequently: true });
function measureCoverage(layer) {
  covCtx.clearRect(0, 0, 64, 48);
  covCtx.drawImage(layer.c, 0, 0, 64, 48);
  const d = covCtx.getImageData(0, 0, 64, 48).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++;
  layer.coverage = n / (64 * 48);
  return layer.coverage;
}

let mePaint = null;
const myCracks = [];
// my own view gets the same cracks, mirrored (I'm looking out through the glass)
const paintView = $('paintView');
const pvCtx = paintView.getContext('2d');
function redrawPaintView() {
  paintView.width = innerWidth; paintView.height = innerHeight;
  pvCtx.clearRect(0, 0, paintView.width, paintView.height);
  if (!mePaint?.coverage || !cfg.gun) { myCracks.length = 0; return; }
  const lw = Math.max(1, paintView.width / 700);
  for (const c of myCracks) drawCrackOn(pvCtx, paintView.width, paintView.height, 1 - c.u, c.v, c.s, c.seed, lw);
}
addEventListener('resize', redrawPaintView);

function applyPaint(m, fromId) {
  if (m.id === peer?.id) {
    const now = performance.now();
    if (!mePaint || now < me.koUntil) return;
    drawCrack(mePaint, m.u, m.v, m.s, m.seed);
    myCracks.push({ u: m.u, v: m.v, s: m.s, seed: m.seed });
    measureCoverage(mePaint);
    redrawPaintView();
    me.shakeUntil = now + 140;
    sfx('crack');
    const cov = measureCoverage(mePaint);
    if (cov >= PAINT_OUT && playing() && m.rd === roundId) {
      me.koUntil = now + 3000; me.stunUntil = me.koUntil;
      const by = remotes.get(fromId);
      const c = conns.get(fromId);
      if (c) send(c, { t: 'ko', rd: roundId });
      toast(`💥 Screen smashed by ${by ? by.name : 'someone'}!`);
      buzz();
      setTimeout(respawn, 3000);
    }
  } else {
    const target = remotes.get(m.id);
    if (target && target.paint) drawCrack(target.paint, m.u, m.v, m.s, m.seed);
  }
}

// ----- sound: tiny synthesized shot + glass crack -----
let noiseBuf = null;
function sfx(kind) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  if (!noiseBuf) {
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
  const f = audioCtx.createBiquadFilter(); const gn = audioCtx.createGain();
  const t = audioCtx.currentTime;
  if (kind === 'shot') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7; gn.gain.setValueAtTime(0.18, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.07); }
  else { f.type = 'highpass'; f.frequency.value = 2500; gn.gain.setValueAtTime(0.35, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.18); }
  src.connect(f); f.connect(gn); gn.connect(audioCtx.destination);
  src.start(t); src.stop(t + 0.25);
}

// ----- aiming (fixed centre crosshair) -----
const aim = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const crosshair = $('crosshair');
let fireQueued = false;
const paintOn = () => cfg.gun && playing();
let gunHeat = 0;

// ----- effects: tracers, sparks, glass, bullet holes -----
const fxGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const holeGeo = new THREE.CircleGeometry(0.1, 10);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x15151a });
const decals = [];
function fx(mesh, life, vel) { mesh.userData.fx = true; scene.add(mesh); beams.push({ m: mesh, life, vel, shared: true }); }
function sparks(p, color = 0xffd166, n = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(p);
    fx(m, 0.25 + Math.random() * 0.15, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8));
  }
}
function glass(p) { sparks(p, 0xcfe8ff, 9); sparks(p, 0xffffff, 3); }
function tracer(a, b) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 }));
  m.position.copy(a); m.lookAt(b); m.userData.fx = true;
  scene.add(m); beams.push({ m, life: 0.07 });
}
function flash(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d5, transparent: true }));
  m.position.copy(p); m.userData.fx = true; scene.add(m); beams.push({ m, life: 0.05 });
}
function bulletHole(p, n) {
  const m = new THREE.Mesh(holeGeo, holeMat);
  m.position.copy(p).addScaledVector(n, 0.02);
  m.lookAt(m.position.clone().add(n));
  m.userData.fx = true;
  scene.add(m); decals.push(m);
  if (decals.length > 250) scene.remove(decals.shift());
}
function clearFloorSplats() { for (const d of decals) scene.remove(d); decals.length = 0; }

function isMine(o) { while (o) { if (meParts && o === meParts.group) return true; o = o.parent; } return false; }
function ownerOf(o) {
  while (o) { for (const p of remotes.values()) if (p.parts.group === o) return p; o = o.parent; }
  return null;
}
function muzzlePos() {
  const fx_ = Math.sin(me.rot), fz = Math.cos(me.rot);
  return new THREE.Vector3(me.pos.x + fx_ * 0.9 - fz * 0.6, 1.15 + me.y, me.pos.z + fz * 0.9 + fx_ * 0.6);
}

const _aimJ = new THREE.Vector2(), _n = new THREE.Vector3();
let lastSnap = new Map();
function shootPaint(power = 0) {
  if (me.hidden) { toast('👻 Uncover your camera to shoot'); return; }
  const spread = (me.aiming ? 0.006 : 0.02) + gunHeat * 0.03;
  _aimJ.set(aim.x + (Math.random() - 0.5) * spread, aim.y + (Math.random() - 0.5) * spread * camera.aspect);
  raycaster.setFromCamera(_aimJ, camera);
  const muzzle = muzzlePos();
  let hit = null;
  for (const h of raycaster.intersectObjects(scene.children, true)) {
    const o = h.object;
    if (o.isSprite || o.userData.fx || isMine(o) || !o.visible) continue;
    if (h.point.clone().sub(muzzle).dot(raycaster.ray.direction) < 0.2) continue;   // behind the gun
    const owner = ownerOf(o);
    if (owner && (owner.hidden || owner.ko || !owner.seen)) continue;
    hit = { h, owner }; break;
  }
  const end = hit ? hit.h.point : raycaster.ray.at(90, new THREE.Vector3());
  gunHeat = Math.min(1, gunHeat + 0.12);
  tracer(muzzle, end); flash(muzzle); sfx('shot');
  let kind = 0;
  if (hit && hit.owner) {
    kind = 2;
    glass(end);
    if (hit.h.object === hit.owner.parts.screen && hit.h.uv) {
      const msg = { t: 'paint', id: hit.owner.id, u: +hit.h.uv.x.toFixed(3), v: +hit.h.uv.y.toFixed(3), s: 0.2 + 0.1 * power, seed: (Math.random() * 1e9) | 0, rd: roundId };
      applyPaint(msg, peer.id);
      broadcast(msg);
      const now = performance.now();
      if (now - (lastSnap.get(hit.owner.id) || 0) > 1500) { lastSnap.set(hit.owner.id, now); zapCam(hit.owner); }
    }
  } else if (hit) {
    kind = 1;
    _n.copy(hit.h.face ? hit.h.face.normal : new THREE.Vector3(0, 1, 0)).transformDirection(hit.h.object.matrixWorld);
    bulletHole(end, _n); sparks(end);
  }
  const r2 = (v) => +v.toFixed(2);
  broadcast({ t: 'shot', o: muzzle.toArray().map(r2), e: end.toArray().map(r2), k: kind, n: kind === 1 ? _n.toArray().map(r2) : undefined });
}

function updateBalls(dt) {
  gunHeat = Math.max(0, gunHeat - dt * 1.4);
  crosshair.style.transform = `scale(${(me.aiming ? 0.6 : 1) * (1 + gunHeat * 0.8)})`;
}

function onPaintData(p, m) {
  switch (m.t) {
    case 'shot': {
      const a = new THREE.Vector3().fromArray(m.o), b = new THREE.Vector3().fromArray(m.e);
      tracer(a, b); flash(a);
      if (m.k === 1 && m.n) { bulletHole(b, new THREE.Vector3().fromArray(m.n)); sparks(b); }
      else if (m.k === 2) glass(b);
      return true;
    }
    case 'paint': applyPaint(m, p.id); return true;
    case 'clean': clearPaint(p.paint); return true;
  }
  return false;
}

// =====================================================================
// ---------- TV Pong: your TV head is the bat ----------
// =====================================================================
const PONG_C = new THREE.Vector3(400, 0, 0);   // built away from the battle arena
const PONG_SCALE = 2;                          // big TV heads = big bats
const BAT_HALF = 0.725 * PONG_SCALE;           // half the TV's width
const BALL_R = 0.45, BALL_Y = 2.3 * PONG_SCALE;
const pongMode = () => cfg.mode === 'pong' && roundId > 0;
let pong = null;     // { ids, sides, group, ball, mySide }
let pongBall = { x: 0, z: 0, vx: 0, vz: 0, t: 0, lastHit: null, waitUntil: 0 };
let pongSendT = 0;

// One side per player. 1 player = practice box, 2 = classic rectangle, 3+ = triangle, square, pentagon, hexagon…
function pongLayout(ids) {
  const n = ids.length;
  const pts = [];
  let owners = [];
  if (n <= 2) {
    const W = 16, Lz = n === 2 ? 24 : 16;
    pts.push([-W / 2, -Lz / 2], [W / 2, -Lz / 2], [W / 2, Lz / 2], [-W / 2, Lz / 2]);
    owners = [ids[0], null, ids[1] ?? null, null];
  } else {
    const L = 16, R = L / (2 * Math.sin(Math.PI / n));
    for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n - Math.PI / 2 - Math.PI / n; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
    owners = ids.slice();
  }
  return pts.map((a, k) => {
    const b = pts[(k + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -mx, nz = -mz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;   // inward normal
    return { a, b, mx, mz, len, nx, nz, tx: -nz, tz: nx, owner: owners[k] ?? null };     // t = the owner's "right"
  });
}

function buildPong() {
  destroyPong();
  const ids = cfg.pongIds || [];
  const sides = pongLayout(ids.length ? ids : [peer?.id]);
  const g = new THREE.Group();
  g.position.copy(PONG_C);
  // floor
  const shape = new THREE.Shape(sides.map((s) => new THREE.Vector2(s.a[0], -s.a[1])));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x1d6b4f, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; g.add(floor);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const centre = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.8, 32), lineMat); centre.rotation.x = -Math.PI / 2; centre.position.y = 0.02; g.add(centre);
  for (const s of sides) {
    const ang = Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (s.owner) {
      const owner = s.owner === peer?.id ? { color: myColor } : remotes.get(s.owner);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, s.len), new THREE.MeshBasicMaterial({ color: owner?.color ?? 0xffffff }));
      strip.position.set(s.mx, 0.08, s.mz); strip.rotation.y = ang; g.add(strip);
    } else {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, s.len + 0.6), new THREE.MeshStandardMaterial({ color: 0x5a4fcf, transparent: true, opacity: 0.55 }));
      wall.position.set(s.mx - s.nx * 0.3, 3, s.mz - s.nz * 0.3); wall.rotation.y = ang; g.add(wall);
    }
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3b0, emissiveIntensity: 0.9 }));
  ball.position.set(0, BALL_Y, 0); g.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  scene.add(g);
  pong = { ids, sides, group: g, ball, shadow, mySide: sides.find((s) => s.owner === peer?.id) || null, s: 0 };
  pongBall = { x: 0, z: 0, vx: 0, vz: 0, t: performance.now(), lastHit: null, waitUntil: performance.now() + 2500, speed: 11 };
  if (pong.mySide) { placeOnSide(pong.mySide, 0); }
}
function destroyPong() {
  if (!pong) return;
  scene.remove(pong.group);
  pong.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  pong = null;
}
function placeOnSide(side, s) {
  // stand behind the line so the TV screen sits on it, facing the middle
  const back = 0.5 * PONG_SCALE;
  me.pos.set(PONG_C.x + side.mx + side.tx * s - side.nx * back, 0, PONG_C.z + side.mz + side.tz * s - side.nz * back);
  me.rot = Math.atan2(side.nx, side.nz);
}

// Where is a player's bat along their side? (from their position)
function batOffset(side, x, z) { return (x - PONG_C.x - side.mx) * side.tx + (z - PONG_C.z - side.mz) * side.tz; }
function sideActive(id) { return id === peer?.id || remotes.has(id); }

function serveBall() {
  const owned = pong.sides.filter((s) => s.owner && sideActive(s.owner));
  const target = owned.length ? owned[Math.floor(Math.random() * owned.length)] : pong.sides[0];
  const a = (Math.random() - 0.5) * 0.8;                       // a bit off-centre
  const dx = -target.nx * Math.cos(a) + target.tx * Math.sin(a), dz = -target.nz * Math.cos(a) + target.tz * Math.sin(a);
  pongBall.speed = 11;
  Object.assign(pongBall, { x: 0, z: 0, vx: dx * pongBall.speed, vz: dz * pongBall.speed, lastHit: null });
}

// Only the host moves the ball; everyone else draws what the host sends.
function simulateBall(dt, now) {
  const b = pongBall;
  if (now < b.waitUntil) { b.x = 0; b.z = 0; b.vx = 0; b.vz = 0; return; }
  if (b.vx === 0 && b.vz === 0) serveBall();
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    b.x += b.vx * dt / steps; b.z += b.vz * dt / steps;
    for (const s of pong.sides) {
      const d = (b.x - s.mx) * s.nx + (b.z - s.mz) * s.nz;     // distance inside the line
      const vin = b.vx * s.nx + b.vz * s.nz;
      const along = (b.x - s.mx) * s.tx + (b.z - s.mz) * s.tz;
      if (Math.abs(along) > s.len / 2 + 1) continue;
      if (s.owner && sideActive(s.owner)) {
        if (d < BALL_R && d > -BALL_R && vin < 0) {
          const bx = s.owner === peer.id ? me.pos.x : remotes.get(s.owner).target.x;
          const bz = s.owner === peer.id ? me.pos.z : remotes.get(s.owner).target.z;
          const off = along - batOffset(s, bx, bz);
          if (Math.abs(off) <= BAT_HALF + BALL_R) {
            // bounce off the TV: hit near the edge to angle it, like real pong
            b.speed = Math.min(26, b.speed * 1.06);
            const k = Math.max(-1, Math.min(1, off / (BAT_HALF + BALL_R))) * 0.9;
            const dx = s.nx * Math.cos(k) + s.tx * Math.sin(k), dz = s.nz * Math.cos(k) + s.tz * Math.sin(k);
            b.vx = dx * b.speed; b.vz = dz * b.speed;
            b.x = s.mx + s.nx * BALL_R + s.tx * along; b.z = s.mz + s.nz * BALL_R + s.tz * along;
            b.lastHit = s.owner;
            broadcast({ t: 'pbonk', id: s.owner });
            bonk(s.owner);
          }
        } else if (d < -1.8) {
          const m = { t: 'pgoal', who: s.owner, by: b.lastHit, rd: roundId };
          broadcast(m); onPongGoal(m);
          b.waitUntil = now + 1500; b.vx = b.vz = 0; b.x = b.z = 0;
          return;
        }
      } else if (d < BALL_R && vin < 0) {                       // wall: plain bounce
        b.vx -= 2 * vin * s.nx; b.vz -= 2 * vin * s.nz;
        b.x += s.nx * (BALL_R - d); b.z += s.nz * (BALL_R - d);
      }
    }
    if (Math.hypot(b.x, b.z) > 40) { b.waitUntil = now + 800; b.vx = b.vz = 0; }   // escaped through a corner
  }
}

function bonk(id) {
  const p = id === peer?.id ? null : remotes.get(id);
  const mat = p ? p.parts.screenMat : meParts?.screenMat;
  if (mat) { mat.uniforms.staticAmt.value = 0.5; setTimeout(() => (mat.uniforms.staticAmt.value = 0), 120); }
  if (!p) buzz();
}

function onPongGoal(m) {
  if (m.rd !== roundId) return;
  const name = (id) => (id === peer?.id ? 'you' : remotes.get(id)?.name || 'someone');
  if (m.by === peer?.id && m.who !== peer?.id && playing()) { me.score++; updateScores(); toast(`🏓 You scored past ${name(m.who)}!`); }
  else if (m.who === peer?.id) { toast(m.by && m.by !== peer?.id ? `🏓 ${name(m.by)} got one past you!` : '🏓 Own goal!'); me.stunUntil = performance.now() + 900; buzz(); }
  else toast(`🏓 Goal past ${name(m.who)}!`);
}

function onPongData(p, m) {
  switch (m.t) {
    case 'pb':
      if (m.rd !== roundId || holdingDoor) return true;
      Object.assign(pongBall, { x: m.x, z: m.z, vx: m.vx, vz: m.vz, t: performance.now(), lastHit: m.lh ?? null, speed: Math.hypot(m.vx, m.vz) || 11 });
      return true;
    case 'pgoal': onPongGoal(m); return true;
    case 'pbonk': bonk(m.id); return true;
  }
  return false;
}

// my own frame in pong mode: slide along my side, fixed camera behind my bat
function pongMe(dt, now, time, inp) {
  if (!pong) buildPong();
  const side = pong.mySide;
  const stunned = now < me.stunUntil;
  if (side) {
    const speed = 13;
    pong.s += inp.strafe * speed * dt * (stunned ? 0.5 : 1) + mouseDX * 0.03 + touchLookDX * 18;
    const lim = side.len / 2 - BAT_HALF * 0.6;
    pong.s = Math.max(-lim, Math.min(lim, pong.s));
    const ox = me.pos.x;
    placeOnSide(side, pong.s);
    me.walk += Math.abs(me.pos.x - ox) * 3;
  }
  mouseDX = mouseDY = touchLookDX = touchLookDY = 0;
  me.y = 0;
  // ball
  if (holdingDoor) {
    simulateBall(dt, now);
    pongSendT += dt;
    if (pongSendT > 0.05) { pongSendT = 0; broadcast({ t: 'pb', x: +pongBall.x.toFixed(2), z: +pongBall.z.toFixed(2), vx: +pongBall.vx.toFixed(2), vz: +pongBall.vz.toFixed(2), lh: pongBall.lastHit, rd: roundId }); }
    pong.ball.position.set(pongBall.x, BALL_Y, pongBall.z);
  } else {
    const t = Math.min(0.25, (now - pongBall.t) / 1000);       // glide between host updates
    pong.ball.position.set(pongBall.x + pongBall.vx * t, BALL_Y, pongBall.z + pongBall.vz * t);
  }
  pong.shadow.position.set(pong.ball.position.x, 0.03, pong.ball.position.z);
  // camera
  if (side) {
    camPos.set(PONG_C.x + side.mx - side.nx * 9, 15, PONG_C.z + side.mz - side.nz * 9);
    lookAt.set(PONG_C.x + side.nx * 1.5, 0, PONG_C.z + side.nz * 1.5);
  } else {                                                      // spectating
    camPos.set(PONG_C.x + Math.sin(time * 0.2) * 4, 26, PONG_C.z + 18);
    lookAt.set(PONG_C.x, 0, PONG_C.z);
  }
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 8));
  camera.lookAt(lookAt);
  if (Math.abs(camera.fov - 60) > 0.05) { camera.fov = 60; camera.updateProjectionMatrix(); }
  meParts.group.visible = !!side;
  meParts.group.scale.setScalar(side ? PONG_SCALE : 1);
  meParts.group.position.set(me.pos.x, 0, me.pos.z);
  meParts.group.rotation.y = me.rot;
  animateBody(meParts, me.walk, Math.min(1, Math.abs(inp.strafe)));
  const mu = meParts.screenMat.uniforms;
  mu.time.value = time; mu.damage.value = 0; mu.power.value = 1;
  setOpacity(meParts, 0.55);                                   // see the ball through your own TV
  crosshair.classList.add('hidden');
  $('hearts').textContent = side ? '🏓 ← → to move' : '👀 Spectating';
  $('lockHint').classList.add('hidden');
}

// ---------- graphics health check ----------
// If the 3D view comes out solid white (a driver bug), switch to simple graphics and reload.
let gfxNext = 3000, gfxWhite = 0;
const px = new Uint8Array(4);
function gfxCheck(now) {
  if (now < gfxNext || now > 60000 || !started) return;
  gfxNext = now + 1500;
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  let white = 0;
  for (const [fx, fy] of [[0.2, 0.8], [0.8, 0.8], [0.5, 0.95], [0.15, 0.3], [0.85, 0.3]]) {
    gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (px[0] > 245 && px[1] > 245 && px[2] > 245) white++;
  }
  gfxWhite = white >= 4 ? gfxWhite + 1 : 0;
  if (gfxWhite >= 2) {
    if (!safeGfx) { lsSet('tvhead-safe', '1'); toast('Switching to simple graphics…'); setTimeout(() => location.reload(), 800); }
    else showGfxProblem('The 3D view isn’t drawing on this device.');
    gfxNext = Infinity;
  }
}
function showGfxProblem(msg) {
  $('gfxMsg').innerHTML = `📺 ${msg}<br><small>Graphics chip: ${escapeHtml(gpuName)}</small><br><button id="gfxReload">Reload</button>`;
  $('gfxMsg').classList.remove('hidden');
  $('gfxReload').onclick = () => location.reload();
}
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                                   // lets the browser try to restore it
  if (!safeGfx) lsSet('tvhead-safe', '1');
  showGfxProblem('Graphics crashed. Trying to recover – or tap Reload (you’ll rejoin with the same code).');
});
renderer.domElement.addEventListener('webglcontextrestored', () => { $('gfxMsg').classList.add('hidden'); toast('Graphics recovered'); });

// ---------- animate ----------
function animateBody(parts, walk, speed) {
  const a = Math.sin(walk) * 0.6 * speed;
  parts.legL.rotation.x = a; parts.legR.rotation.x = -a;
  parts.armL.rotation.x = -a * 0.8; parts.armR.rotation.x = a * 0.8;
}
function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

let last = performance.now();
let adsT = 0;
let sendTimer = 0;
let cardTimer = 0;
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  cardTimer += dt;
  if (cardTimer > 0.5) { cardTimer = 0; drawCard(time); cardTex.needsUpdate = true; }

  if (meParts && started) {
    const inp = readInput();
    if (pongMode()) pongMe(dt, now, time, inp); else {
    sampleCamera(now); updateFace(now); updateLoudness(dt);
    const ko = now < me.koUntil;
    if (ko) { inp.fwd = 0; inp.strafe = 0; inp.jump = false; inp.zap = false; inp.aim = false; }
    const stunned = now < me.stunUntil;
    // look
    const sens = inp.aim ? 0.0014 : 0.0024;
    const tSens = inp.aim ? 1.6 : 2.8;                  // radians per screen-width of swipe
    camYaw -= mouseDX * sens + touchLookDX * tSens + inp.lookX * 2.4 * dt;
    camPitch -= mouseDY * sens + touchLookDY * tSens * 0.7 + inp.lookY * 1.6 * dt;
    camPitch = Math.max(-0.75, Math.min(0.85, camPitch));
    mouseDX = mouseDY = touchLookDX = touchLookDY = 0;
    // move relative to the camera
    const fyx = Math.sin(camYaw), fyz = Math.cos(camYaw), ryx = -fyz, ryz = fyx;
    let mx = fyx * inp.fwd + ryx * inp.strafe, mz = fyz * inp.fwd + ryz * inp.strafe;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sprinting = inp.sprint && !inp.aim && inp.fwd > 0.3;
    const speed = stunned ? 2.5 : inp.aim ? 4 : sprinting ? 10.5 : 7;
    me.pos.x += mx * speed * dt;
    me.pos.z += mz * speed * dt;
    collide(me.pos);
    // facing: towards where you're going, but square up to the crosshair when aiming or shooting
    const combat = inp.aim || now - (me.lastShot || 0) < 600;
    if (combat) me.rot = angleLerp(me.rot, camYaw, 1 - Math.exp(-dt * 20));
    else if (ml > 0.1) me.rot = angleLerp(me.rot, Math.atan2(mx, mz), 1 - Math.exp(-dt * 10));
    me.aiming = inp.aim;
    const moveAmt = Math.min(1, ml);
    if (inp.jump && me.y === 0) me.vy = 7;
    me.vy -= 20 * dt; me.y = Math.max(0, me.y + me.vy * dt); if (me.y === 0) me.vy = 0;
    me.zapCooldown -= dt;
    let fire = inp.zap || fireQueued;
    fireQueued = false;
    if (cfg.mouth && playing() && facePresent()) fire = (paintOn() ? faceState.jaw > 0.45 : mouthFire()) && !ko;   // mouth replaces the button
    if (fire && me.zapCooldown <= 0 && !stunned && !ko) {
      const power = cfg.shout && playing() ? loud : 0;
      me.rot = camYaw; me.lastShot = now;               // shots go where the crosshair is
      if (paintOn()) { me.zapCooldown = 0.1; shootPaint(power); }
      else { me.zapCooldown = 0.6; tryZap(power); }
    }
    crosshair.classList.toggle('hidden', !started || overlayOpen());
    updateLaugh(now);
    updateFreeze(now, inp);
    me.walk += moveAmt * dt * (sprinting ? 14 : 10);

    meParts.group.position.set(me.pos.x, me.y, me.pos.z);
    meParts.group.rotation.y = me.rot;
    animateBody(meParts, me.walk, moveAmt);
    meParts.gun.visible = paintOn();
    if (paintOn()) { meParts.armR.rotation.x = -1.45; meParts.armL.rotation.x = -1.2; }
    const mu = meParts.screenMat.uniforms;
    mu.staticAmt.value = stunned ? 0.75 : 0;
    mu.time.value = time;
    mu.damage.value = cfg.damage && !cfg.gun && roundId ? 1 - me.hp / MAX_HP : 0;
    mu.power.value += ((ko ? 0 : 1) - mu.power.value) * Math.min(1, dt * 6);
    setOpacity(meParts, me.hidden ? 0.3 : adsT > 0.5 ? 0.45 : 1);
    $('selfwrap').classList.toggle('ghost', me.hidden);
    $('hearts').textContent = !roundId ? '' : cfg.gun
      ? (ko ? '💥 Screen smashed!' : `🔫 Screen ${Math.round((mePaint?.coverage || 0) * 100)}% cracked / ${PAINT_OUT * 100}%`)
      : cfg.damage ? (ko ? '💥 KO' : '❤️'.repeat(Math.max(0, me.hp))) : '';
    $('selfwrap').classList.toggle('stunned', stunned);

    // camera follow
    // over-the-right-shoulder camera; right mouse / Q / LT tightens in to aim
    adsT += ((inp.aim ? 1 : 0) - adsT) * Math.min(1, dt * 12);
    const dist = 5.2 - 1.9 * adsT, shoulder = 1.25 + 0.45 * adsT;
    const cp = Math.cos(camPitch), dx = Math.sin(camYaw) * cp, dy = Math.sin(camPitch), dz = Math.cos(camYaw) * cp;
    const pivX = me.pos.x + ryx * shoulder, pivY = 2.75 + me.y, pivZ = me.pos.z + ryz * shoulder;
    camPos.set(pivX - dx * dist, Math.max(0.5, pivY - dy * dist), pivZ - dz * dist);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 18));
    lookAt.set(camera.position.x + dx * 10, camera.position.y + dy * 10, camera.position.z + dz * 10);
    camera.lookAt(lookAt);
    if (now < (me.shakeUntil || 0)) { camera.position.x += (Math.random() - 0.5) * 0.14; camera.position.y += (Math.random() - 0.5) * 0.14; }
    let fov = 62 - 20 * adsT + (sprinting ? 6 : 0);
    if (camera.aspect < 1.2) {                          // portrait phones: keep a decent sideways view
      const h = THREE.MathUtils.degToRad(fov * 1.25);
      fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / camera.aspect)));
    }
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    crosshair.classList.toggle('ads', inp.aim);
    $('lockHint').classList.toggle('hidden', isTouch || locked() || overlayOpen());

    }
    sendTimer += dt;
    if (sendTimer > 1 / 15) {
      sendTimer = 0;
      broadcast({ t: 's', x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2), r: +me.rot.toFixed(3), y: +me.y.toFixed(2), st: now < me.stunUntil ? 1 : 0, sc: me.score, mu: micMuted || !micTrack ? 1 : 0,
        hp: me.hp, ko: now < me.koUntil ? 1 : 0, hd: me.hidden ? 1 : 0, rd: roundId });
    }
  } else {
    // lobby: slow orbit
    camera.position.set(Math.sin(time * 0.15) * 30, 14, Math.cos(time * 0.15) * 30);
    camera.lookAt(0, 0, 0);
  }

  for (const p of remotes.values()) {
    const k = 1 - Math.exp(-dt * 12);
    const ox = p.pos.x, oz = p.pos.z;
    p.pos.x += (p.target.x - p.pos.x) * k;
    p.pos.z += (p.target.z - p.pos.z) * k;
    p.y += (p.target.y - p.y) * k;
    p.rot = angleLerp(p.rot, p.target.r, k);
    const sp = Math.hypot(p.pos.x - ox, p.pos.z - oz) / Math.max(dt, 0.001);
    p.walk += sp * dt * 1.4;
    p.parts.group.position.set(p.pos.x, p.y, p.pos.z);
    p.parts.group.scale.setScalar(pong && pong.ids.includes(p.id) ? PONG_SCALE : 1);
    p.parts.group.rotation.y = p.rot;
    p.parts.group.visible = p.seen;
    animateBody(p.parts, p.walk, Math.min(1, sp / 7));
    p.parts.gun.visible = paintOn();
    if (paintOn()) { p.parts.armR.rotation.x = -1.45; p.parts.armL.rotation.x = -1.2; }
    const u = p.parts.screenMat.uniforms;
    u.time.value = time;
    u.staticAmt.value = p.stunned ? 0.75 : (u.hasVideo.value ? 0 : 0.15);
    u.damage.value = cfg.damage && !cfg.gun && roundId ? 1 - (p.hp ?? MAX_HP) / MAX_HP : 0;
    // power-off look if knocked out or we haven't heard from them for a while
    const quiet = now - p.lastMsg > 4000;
    u.power.value += ((quiet || p.ko ? 0 : 1) - u.power.value) * Math.min(1, dt * 6);
    setOpacity(p.parts, p.hidden ? 0.06 : 1);
    updateVoice(p);
    p.parts.label.material.color.setHex(p.talking ? 0x9dff9d : 0xffffff);
    if (p.video) {
      const v = p.video.video;
      if (v.videoWidth) u.videoAspect.value = v.videoWidth / v.videoHeight;
    }
  }
  if (meParts) {
    const sv = $('selfview');
    if (sv.videoWidth) meParts.screenMat.uniforms.videoAspect.value = sv.videoWidth / sv.videoHeight;
  }

  updateBillboards(time);
  updateBalls(dt);
  checkWin();

  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life -= dt;
    b.m.material.opacity = Math.max(0, Math.min(1, b.life / 0.12));
    if (b.vel) { b.vel.y -= 15 * dt; b.m.position.addScaledVector(b.vel, dt); }
    if (b.life <= 0) { scene.remove(b.m); if (!b.shared) b.m.geometry.dispose(); b.m.material.dispose(); beams.splice(i, 1); }
  }

  if (!qs.has('norender')) { renderer.render(scene, camera); gfxCheck(now); }
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// expose a little for testing
window.__tv = { gpuName, safeGfx, get decals() { return decals.length; }, get pong() { return pong; }, pongBall: () => pongBall, get camYaw() { return camYaw; }, set camYaw(v) { camYaw = v; }, set camPitch(v) { camPitch = v; }, camera, aim, get mePaint() { return mePaint; }, shootPaint, calls, remotes, me, conns, startRound, get cfg() { return cfg; }, get roundId() { return roundId; }, get roundState() { return roundState; }, get zapPhotos() { return zapPhotos; }, get freeze() { return freeze; }, callFreeze, faceState, get face() { return face; }, get holdingDoor() { return holdingDoor; }, get peer() { return peer; }, get audioCtx() { return audioCtx; } };
