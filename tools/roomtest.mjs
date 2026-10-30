import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const url = 'http://127.0.0.1:8080/tv-heads.html?max=4&norender&peerhost=127.0.0.1&peerport=9000';
const errs = [];
const mk = async (n) => { const c = await b.newContext({ viewport: { width: 320, height: 240 } }); const p = await c.newPage(); p.name = n; p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(url); await p.fill('#name', n); return p; };
const counts = (ps) => Promise.all(ps.map(p => p.evaluate(() => window.__tv.conns.size)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const join = async (p, code) => { await p.fill('#code', code); await p.click('#joinBtn'); };

const H = await mk('Host'); await H.click('#hostBtn');
await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const code = await H.textContent('#roomcode'); console.log('room', code);
const ps = [H];
// 1) two players join at the exact same moment, then two more at the same moment
const A = await mk('A'), B = await mk('B'), C = await mk('C');
await Promise.all([join(A, code), join(B, code), join(C, code)]);
ps.push(A,B,C);
await sleep(9000);
console.log('cap=4 for test. 4 players joined at once, conns each (want 3):', await counts(ps));
const F = await mk('F'); await join(F, code); await sleep(4000);
console.log('5th player status:', await F.textContent('#status'), '| in game:', await F.evaluate(() => !document.getElementById('lobby').classList.contains('hidden') ? 'no' : 'yes'));
// 3) host leaves
await H.context().close(); ps.shift();
await sleep(22000);
const holders = await Promise.all(ps.map(p => p.evaluate(() => window.__tv.holdingDoor)));
console.log('after host left, conns (want 2):', await counts(ps), 'new host flags:', holders);
// a new player can join with the same code
const G = await mk('G'); await join(G, code); ps.push(G); await sleep(8000);
console.log('G joined via new host, conns (want 3):', await counts(ps), 'G status:', await G.textContent('#status'));
console.log('errors', errs); await b.close();
