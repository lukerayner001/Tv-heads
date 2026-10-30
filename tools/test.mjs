import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(require_path());
function require_path(){ return process.env.PWPATH; }
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const url = 'http://localhost:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const errs = [];
const mk = async (n) => { const c = await b.newContext({ viewport: n==='B'?{width:390,height:844}:{width:1000,height:650}, hasTouch: n==='B', isMobile: n==='B' }); const p = await c.newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(n+' console: '+m.text()); }); await p.goto(url); return p; };
const A = await mk('A'), B = await mk('B');
await A.fill('#name','Luke'); await A.click('#hostBtn');
await A.waitForFunction(() => document.getElementById('roomcode').textContent.length===4, null, {timeout:15000});
const code = await A.textContent('#roomcode'); console.log('room', code);
await B.fill('#name','Bodhi'); await B.fill('#code', code); await B.click('#joinBtn');
await A.waitForFunction(() => [...window.__tv.remotes.values()].some(p => p.video && p.seen), null, {timeout:20000});
await B.waitForFunction(() => [...window.__tv.remotes.values()].some(p => p.video && p.seen), null, {timeout:20000});
// put B in front of A, facing A, and A facing B
await A.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,-10); m.rot = Math.PI; });
await B.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,-16); m.rot = 0; });
await A.waitForTimeout(1500);
await B.screenshot({ path: 'tools/shotB.png' });
// A zaps forward... A at z=-10 facing PI (towards -z) → B at -16
await A.keyboard.down('KeyF'); await A.waitForTimeout(150); await A.keyboard.up('KeyF');
await A.waitForTimeout(200);
await A.screenshot({ path: 'tools/shotA.png' });
console.log('A score', await A.evaluate(() => window.__tv.me.score), 'B stunned', await B.evaluate(() => performance.now() < window.__tv.me.stunUntil));
await B.waitForTimeout(100); await B.screenshot({ path: 'tools/shotB2.png' });
console.log('errors', errs);
await b.close();
