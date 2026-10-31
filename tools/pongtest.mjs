import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const errs = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const mk = async (n, extra='&norender', vp={width:800,height:500}) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(base+extra); await p.fill('#name', n); return p; };
const H = await mk('Luke', ''); await H.click('#hostBtn'); await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const code = await H.textContent('#roomcode');
const A = await mk('Bodhi'), B = await mk('Albie');
for (const p of [A,B]) { await p.fill('#code', code); await p.click('#joinBtn'); }
await B.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await A.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await H.selectOption('#mode', 'pong');
check('feature list dims for pong', await H.evaluate(() => document.getElementById('featureList').classList.contains('dim')));
await H.evaluate(() => { document.getElementById('target').value = '5'; });
await H.click('#startRoundBtn'); await sleep(1500);
const sides = await Promise.all([H,A,B].map(p => p.evaluate(() => window.__tv.pong && { n: window.__tv.pong.sides.length, owned: window.__tv.pong.sides.filter(s => s.owner).length, mine: !!window.__tv.pong.mySide })));
check('3 players -> triangle, everyone has a side', sides.every(s => s && s.n === 3 && s.owned === 3 && s.mine), JSON.stringify(sides));
await sleep(2500);
const p1 = await A.evaluate(() => ({ ...window.__tv.pongBall() }));
await sleep(600);
const p2 = await A.evaluate(() => ({ ...window.__tv.pongBall() }));
check('ball is served and synced to others', Math.hypot(p1.vx, p1.vz) > 5 && (p1.x !== p2.x || p1.z !== p2.z), JSON.stringify([p1.x, p1.z, p2.x, p2.z]));
// rig a hit: ball straight at the host's bat; move the other bats out of the way
await A.evaluate(() => { const pg = window.__tv.pong; pg.s = pg.mySide.len / 2; });
await B.evaluate(() => { const pg = window.__tv.pong; pg.s = -pg.mySide.len / 2; });
await sleep(800);
const hit = await H.evaluate(() => { const pg = window.__tv.pong, s = pg.mySide, bl = window.__tv.pongBall(); pg.s = 0;
  Object.assign(bl, { x: s.mx + s.nx * 4, z: s.mz + s.nz * 4, vx: -s.nx * 11, vz: -s.nz * 11, waitUntil: 0, speed: 11, lastHit: null }); return true; });
await sleep(700);
const lh = await H.evaluate(() => window.__tv.pongBall().lastHit);
const hid = await H.evaluate(() => window.__tv.peer.id);
check('ball bounces off the host TV bat', lh === hid);
await H.screenshot({ path: 'tools/pong-host.png' });
// rig a goal: host just hit it, ball heading at Bodhi's side while his bat is at the far end
const aid = await A.evaluate(() => window.__tv.peer.id);
await A.evaluate(() => { const pg = window.__tv.pong; pg.s = pg.mySide.len / 2; }); await sleep(800);
await H.evaluate((aid) => { const pg = window.__tv.pong, s = pg.sides.find(x => x.owner === aid), bl = window.__tv.pongBall();
  Object.assign(bl, { x: s.mx + s.nx * 3 - s.tx * 4, z: s.mz + s.nz * 3 - s.tz * 4, vx: -s.nx * 11, vz: -s.nz * 11, waitUntil: 0, lastHit: window.__tv.peer.id }); }, aid);
await sleep(1500);
const hs = await H.evaluate(() => window.__tv.me.score);
check('goal past a moved bat scores for the last hitter', hs >= 1, 'host score ' + hs);
// layout shapes for other counts (pure function check via a fresh round with fake ids)
const shapes = await H.evaluate(() => [1,2,4,5,6].map(n => { const ids = Array.from({length:n}, (_, i) => 'p'+i); window.__tv.cfgIds = ids; return n; }));
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
