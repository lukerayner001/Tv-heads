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
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f3b);
scene.fog = new THREE.Fog(0x1b1f3b, 30, 70);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6, -10);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x404060, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(12, 25, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
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
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform sampler2D card; uniform float hasVideo; uniform float videoAspect;
      uniform float time; uniform float staticAmt; uniform float power;
      varying vec2 vUv;
      float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float d = dot(c,c);
        vec2 uv = 0.5 + c * (1.0 + 0.15 * d);            // CRT bulge
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.02,0.02,0.02,1.0); return; }
        // power-off: collapse to a horizontal line
        float squash = max(power, 0.001);
        float py = 0.5 + (uv.y - 0.5) / squash;
        if (py < 0.0 || py > 1.0) { gl_FragColor = vec4(0.02,0.02,0.02,1.0); return; }
        vec2 suv = vec2(uv.x, py);
        vec2 t = suv;                                       // cover-fit video into 4:3 screen
        float sa = ${SCREEN_ASPECT.toFixed(4)};
        if (videoAspect > sa) t.x = 0.5 + (t.x - 0.5) * (sa / videoAspect);
        else t.y = 0.5 + (t.y - 0.5) * (videoAspect / sa);
        vec3 col = hasVideo > 0.5 ? texture2D(map, t).rgb : texture2D(card, suv).rgb;
        float n = rnd(floor(suv * vec2(160.0,120.0)) + fract(time * 13.7) * 91.0);
        col = mix(col, vec3(n), staticAmt);
        col *= 0.86 + 0.14 * sin(suv.y * 480.0);          // scanlines
        col *= 1.0 - d * 1.1;                               // vignette
        col += (1.0 - power) * 0.8;                         // flash when switching off
        gl_FragColor = vec4(col, 1.0);
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

  return { group: g, screenMat, legL, legR, armL, armR, label };
}

function setLabel(p, name) {
  if (p.name === name) return;
  p.name = name;
  p.parts.group.remove(p.parts.label);
  p.parts.label = makeLabel(name);
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
        score: 0, stunned: false, walk: 0, seen: false, video: null, lastMsg: performance.now() };
  remotes.set(id, p);
  updateScores();
  return p;
}

function removeRemote(id) {
  const p = remotes.get(id);
  if (p) {
    scene.remove(p.parts.group);
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
function peerOptions() {
  const o = { debug: 1 };
  if (qs.get('peerhost')) {          // only for local testing
    o.host = qs.get('peerhost'); o.port = +qs.get('peerport') || 9000; o.path = '/'; o.secure = false;
    o.config = { iceServers: [] };
  }
  return o;
}

function send(conn, msg) { if (conn.open) { try { conn.send(msg); } catch {} } }
function broadcast(msg) { for (const c of conns.values()) send(c, msg); }

function setupConn(conn) {
  conn.on('open', () => {
    conns.set(conn.peer, conn);
    ensureRemote(conn.peer);
    send(conn, { t: 'hi', name: myName, color: myColor });
    if (peer.id === 'tvhead-' + roomCode) {
      // host: tell newcomer who else is here
      send(conn, { t: 'peers', ids: [...conns.keys()].filter((k) => k !== conn.peer) });
    }
    setStatus(`${conns.size + 1} player${conns.size ? 's' : ''} in room ${roomCode}`);
  });
  conn.on('data', (m) => onData(conn.peer, m));
  conn.on('close', () => { removeRemote(conn.peer); toast('A player left'); });
  conn.on('error', () => {});
}

function connectTo(id) {
  if (conns.has(id) || id === peer.id) return;
  const conn = peer.connect(id, { serialization: 'json' });
  setupConn(conn);
  const call = peer.call(id, localStream);
  if (call) setupCall(call);
}

function setupCall(call) {
  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    const p = ensureRemote(call.peer);
    if (p.video) return;
    p.video = attachVideoToScreen(p.parts.screenMat, stream, false);
  });
  call.on('error', () => {});
}

function onData(from, m) {
  const p = ensureRemote(from);
  p.lastMsg = performance.now();
  switch (m.t) {
    case 'hi':
      setLabel(p, String(m.name || 'Player'));
      recolor(p, m.color | 0);
      toast(`${p.name} joined`);
      updateScores();
      break;
    case 'peers':
      for (const id of m.ids || []) connectTo(id);
      break;
    case 's':
      p.target.x = m.x; p.target.z = m.z; p.target.r = m.r; p.target.y = m.y;
      if (!p.seen) { p.pos.set(m.x, 0, m.z); p.rot = m.r; p.seen = true; }
      p.stunned = !!m.st;
      if (p.score !== m.sc) { p.score = m.sc; updateScores(); }
      break;
    case 'zap':
      spawnBeam(p.pos, p.rot, p.y, m.len);
      break;
    case 'hit':
      if (performance.now() > me.stunUntil) {
        me.stunUntil = performance.now() + 1500;
        toast(`Zapped by ${p.name}!`);
        buzz();
      }
      break;
  }
}

async function getCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 20, max: 24 } },
      audio: false,
    });
    $('selfview').srcObject = localStream;
    $('selfview').play().catch(() => {});
    return true;
  } catch (e) {
    // No camera: send the NO SIGNAL card as our video so connections still work.
    const s = cardCanvas.captureStream ? cardCanvas.captureStream(5) : null;
    localStream = s;
    $('selfwrap').classList.add('nocam');
    toast('No camera – you’ll show NO SIGNAL');
    return false;
  }
}

function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
}

function onPeerError(err) {
  console.warn('peer error', err.type, err);
  if (err.type === 'unavailable-id') { setStatus('That room code is taken – trying another…'); peer.destroy(); host(); }
  else if (err.type === 'peer-unavailable') {
    if (!conns.size) { setStatus('Room not found. Check the code.', true); showLobby(); }
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

async function prepare() {
  myName = ($('name').value.trim() || 'Player').slice(0, 14);
  try { localStorage.setItem('tvhead-name', myName); } catch {}
  setStatus('Starting camera…');
  await getCamera();
  if (!meParts) {
    meParts = makeTVHead(myColor, myName);
    meParts.group.remove(meParts.label);
    scene.add(meParts.group);
    if (localStream && !$('selfwrap').classList.contains('nocam')) attachVideoToScreen(meParts.screenMat, localStream, false);
  }
}

async function host() {
  if (!peer) await prepare();
  roomCode = makeCode();
  setStatus('Creating room…');
  peer = new Peer('tvhead-' + roomCode, peerOptions());
  wirePeer();
  peer.on('open', () => { startGame(); setStatus(`Room ${roomCode} – waiting for players`); });
}

async function join() {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { setStatus('Enter the 4-letter room code', true); return; }
  await prepare();
  roomCode = code;
  setStatus('Joining…');
  peer = new Peer(undefined, peerOptions());
  wirePeer();
  peer.on('open', () => { connectTo('tvhead-' + roomCode); startGame(); });
}

function startGame() {
  started = true;
  $('lobby').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('roomcode').textContent = roomCode;
  if (isTouch) $('touch').classList.remove('hidden');
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
  const rows = [{ name: myName + ' (you)', score: me.score, color: myColor }];
  for (const p of remotes.values()) rows.push({ name: p.name, score: p.score, color: p.color ?? 0xaaaaaa });
  rows.sort((a, b) => b.score - a.score);
  $('scores').innerHTML = rows.map((r) =>
    `<div><span class="dot" style="background:#${r.color.toString(16).padStart(6, '0')}"></span>${escapeHtml(r.name)}<b>${r.score}</b></div>`).join('');
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

$('hostBtn').onclick = () => host();
$('joinBtn').onclick = () => join();
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
try { $('name').value = localStorage.getItem('tvhead-name') || ''; } catch {}
if (/^#[A-Za-z]{4}$/.test(location.hash)) $('code').value = location.hash.slice(1).toUpperCase();
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
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const touch = { x: 0, y: 0, zap: false, jump: false };
{
  const pad = $('stick'), knob = $('knob');
  let id = null, cx = 0, cy = 0;
  const R = 50;
  pad.addEventListener('pointerdown', (e) => {
    id = e.pointerId; pad.setPointerCapture(id);
    const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = dx / R; touch.y = dy / R;
  };
  pad.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  for (const [btn, k] of [[$('zapBtn'), 'zap'], [$('jumpBtn'), 'jump']]) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[k] = true; btn.classList.add('down'); });
    const up = () => { touch[k] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  }
}

function readInput() {
  let fwd = 0, turn = 0, zap = false, jump = false;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
  if (keys.has('KeyF') || keys.has('Enter') || keys.has('KeyK')) zap = true;
  if (keys.has('Space')) jump = true;
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    fwd += -dz(gp.axes[1] || 0);
    turn += -dz(gp.axes[0] || 0) - dz(gp.axes[2] || 0);
    if (gp.buttons[0]?.pressed) jump = true;
    if (gp.buttons[2]?.pressed || gp.buttons[1]?.pressed || gp.buttons[7]?.pressed || gp.buttons[5]?.pressed) zap = true;
  }
  fwd += -touch.y; turn += -touch.x;
  zap ||= touch.zap; jump ||= touch.jump;
  return { fwd: Math.max(-1, Math.min(1, fwd)), turn: Math.max(-1, Math.min(1, turn)), zap, jump };
}

// ---------- zap beams ----------
const beams = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.9 });
function spawnBeam(pos, rot, y, len = 14) {
  const geo = new THREE.CylinderGeometry(0.08, 0.08, len, 6);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, beamMat.clone());
  m.position.set(pos.x + Math.sin(rot) * 0.55, 2.3 + y, pos.z + Math.cos(rot) * 0.55);
  m.rotation.y = rot;
  scene.add(m);
  beams.push({ m, life: 0.25 });
}

function tryZap() {
  const fx = Math.sin(me.rot), fz = Math.cos(me.rot);
  let best = null, bestD = 16;
  for (const p of remotes.values()) {
    if (!p.seen) continue;
    const dx = p.pos.x - me.pos.x, dz = p.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1 || d > bestD) continue;
    if ((dx * fx + dz * fz) / d < 0.975) continue;
    best = p; bestD = d;
  }
  const len = best ? bestD : 16;
  spawnBeam(me.pos, me.rot, me.y, len);
  broadcast({ t: 'zap', len });
  if (best && !best.stunned) {
    const c = conns.get(best.id);
    if (c) send(c, { t: 'hit' });
    me.score++;
    updateScores();
  }
}

// ---------- animate ----------
function animateBody(parts, walk, speed) {
  const a = Math.sin(walk) * 0.6 * speed;
  parts.legL.rotation.x = a; parts.legR.rotation.x = -a;
  parts.armL.rotation.x = -a * 0.8; parts.armR.rotation.x = a * 0.8;
}
function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

let last = performance.now();
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
    const stunned = now < me.stunUntil;
    const speed = stunned ? 2.5 : 7;
    me.rot += inp.turn * 2.6 * dt;
    me.pos.x += Math.sin(me.rot) * inp.fwd * speed * dt;
    me.pos.z += Math.cos(me.rot) * inp.fwd * speed * dt;
    collide(me.pos);
    if (inp.jump && me.y === 0) me.vy = 7;
    me.vy -= 20 * dt; me.y = Math.max(0, me.y + me.vy * dt); if (me.y === 0) me.vy = 0;
    me.zapCooldown -= dt;
    if (inp.zap && me.zapCooldown <= 0 && !stunned) { me.zapCooldown = 0.6; tryZap(); }
    me.walk += Math.abs(inp.fwd) * dt * 10;

    meParts.group.position.set(me.pos.x, me.y, me.pos.z);
    meParts.group.rotation.y = me.rot;
    animateBody(meParts, me.walk, Math.abs(inp.fwd));
    meParts.screenMat.uniforms.staticAmt.value = stunned ? 0.75 : 0;
    meParts.screenMat.uniforms.time.value = time;
    $('selfwrap').classList.toggle('stunned', stunned);

    // camera follow
    const fx = Math.sin(me.rot), fz = Math.cos(me.rot), rx = -fz, rz = fx;   // forward / right (over-the-shoulder)
    camPos.set(me.pos.x - fx * 6.5 + rx * 1.8, 5.6 + me.y * 0.5, me.pos.z - fz * 6.5 + rz * 1.8);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
    lookAt.set(me.pos.x + fx * 6 + rx * 0.9, 2.3, me.pos.z + fz * 6 + rz * 0.9);
    camera.lookAt(lookAt);

    sendTimer += dt;
    if (sendTimer > 1 / 15) {
      sendTimer = 0;
      broadcast({ t: 's', x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2), r: +me.rot.toFixed(3), y: +me.y.toFixed(2), st: stunned ? 1 : 0, sc: me.score });
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
    p.parts.group.rotation.y = p.rot;
    p.parts.group.visible = p.seen;
    animateBody(p.parts, p.walk, Math.min(1, sp / 7));
    const u = p.parts.screenMat.uniforms;
    u.time.value = time;
    u.staticAmt.value = p.stunned ? 0.75 : (u.hasVideo.value ? 0 : 0.15);
    // power-off look if we haven't heard from them for a while
    const quiet = now - p.lastMsg > 4000;
    u.power.value += ((quiet ? 0 : 1) - u.power.value) * Math.min(1, dt * 6);
    if (p.video) {
      const v = p.video.video;
      if (v.videoWidth) u.videoAspect.value = v.videoWidth / v.videoHeight;
    }
  }
  if (meParts) {
    const sv = $('selfview');
    if (sv.videoWidth) meParts.screenMat.uniforms.videoAspect.value = sv.videoWidth / sv.videoHeight;
  }

  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life -= dt;
    b.m.material.opacity = Math.max(0, b.life / 0.25);
    if (b.life <= 0) { scene.remove(b.m); b.m.geometry.dispose(); beams.splice(i, 1); }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// expose a little for testing
window.__tv = { remotes, me, conns };
