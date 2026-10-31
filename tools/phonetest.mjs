import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const P = await ctx.newPage(); const errs=[]; P.on('pageerror', e => errs.push(e.message));
await P.goto(base); await P.fill('#name','Albie'); await P.click('#hostBtn');
await P.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
await P.click('#closeSettingsBtn');
const cdp = await ctx.newCDPSession(P);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x,y,id]) => ({ x, y, id })) });
const st = () => P.evaluate(() => ({ x: window.__tv.me.pos.x, z: window.__tv.me.pos.z, yaw: window.__tv.camYaw }));
await P.evaluate(() => { window.__tv.me.pos.set(0,0,10); window.__tv.camYaw = Math.PI; });
await sleep(300);
const s0 = await st();
// finger 1 on the left: push up (forward). finger 2 on the right: swipe right (look)
await touch('touchStart', [[90, 600, 1]]);
await touch('touchMove', [[90, 540, 1]]);
await touch('touchStart', [[90, 540, 1], [300, 400, 2]]);
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[90, 540, 1], [300 + i * 6, 400, 2]]); await sleep(30); }
await sleep(500);
const s1 = await st();
await touch('touchEnd', []);
const moved = Math.hypot(s1.x - s0.x, s1.z - s0.z);
check('joystick moves the player', moved > 1.5, moved.toFixed(2));
check('right-side swipe turns the camera', Math.abs(s1.yaw - s0.yaw) > 0.3 && Math.abs(s1.yaw - s0.yaw) < 1.5, (s1.yaw - s0.yaw).toFixed(2));
check('stick appears where the thumb went down', await P.evaluate(() => document.getElementById('stick').style.left) === '90px');
await sleep(400);
check('stick fades after release', !(await P.evaluate(() => document.getElementById('stick').classList.contains('active'))));
// fire button + aim toggle
const shotBefore = await P.evaluate(() => window.__tv.me.lastShot || 0);
const zb = await P.locator('#zapBtn').boundingBox();
await touch('touchStart', [[zb.x + zb.width/2, zb.y + zb.height/2, 3]]); await sleep(120); await touch('touchEnd', []);
await sleep(200);
check('fire button shoots', (await P.evaluate(() => window.__tv.me.lastShot || 0)) > shotBefore);
const ab = await P.locator('#aimBtn').boundingBox();
await touch('touchStart', [[ab.x + ab.width/2, ab.y + ab.height/2, 4]]); await touch('touchEnd', []); await sleep(600);
check('AIM toggles on', await P.evaluate(() => document.getElementById('aimBtn').classList.contains('on') && window.__tv.me.aiming));
await P.screenshot({ path: 'tools/phone-aim.png' });
await touch('touchStart', [[ab.x + ab.width/2, ab.y + ab.height/2, 4]]); await touch('touchEnd', []); await sleep(600);
check('AIM toggles off', !(await P.evaluate(() => window.__tv.me.aiming)));
// a tap in the look zone must NOT shoot
const shot2 = await P.evaluate(() => window.__tv.me.lastShot || 0);
await touch('touchStart', [[250, 300, 5]]); await touch('touchEnd', []); await sleep(300);
check('tapping the view does not fire by accident', (await P.evaluate(() => window.__tv.me.lastShot || 0)) === shot2);
await P.screenshot({ path: 'tools/phone.png' });
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
