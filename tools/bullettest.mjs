import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const errs=[]; const mk = async (n, extra='&norender', vp={width:900,height:560}) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(base+extra); await p.fill('#name', n); return p; };
const H = await mk('Luke', ''); await H.click('#hostBtn'); await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const code = await H.textContent('#roomcode');
const A = await mk('Bodhi'), B = await mk('Albie');
for (const p of [A,B]) { await p.fill('#code', code); await p.click('#joinBtn'); }
await B.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await A.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await H.click('#startRoundBtn'); await sleep(800);
for (const p of [H,A,B]) await p.evaluate(() => { window.__sfxLog = []; });
// H at z=14 shooting toward A at z=0; B stands just beside the line of fire at z=7
await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,14); m.rot = Math.PI; window.__tv.camYaw = Math.PI; window.__tv.camPitch = 0; });
await A.evaluate(() => { const m = window.__tv.me; m.pos.set(0.6,0,2); m.rot = 0; });
await B.evaluate(() => { const m = window.__tv.me; m.pos.set(-1.6,0,7); m.rot = Math.PI/2; window.__tv.camYaw = Math.PI/2; });
await sleep(5000);
// muzzle is at the tip of the gun, out in front of the character at hand height
const mz = await H.evaluate(() => { const m = window.__tv.muzzlePos(); const me = window.__tv.me; return { fwd: me.pos.z - m.z, side: m.x - me.pos.x, y: m.y }; });
check('bullet origin is the gun muzzle (in front, right hand, hand height)', mz.fwd > 0.9 && mz.side > 0.2 && mz.y > 1.0 && mz.y < 2.2, JSON.stringify(mz));
await H.evaluate(() => { const p = [...window.__tv.remotes.values()].find(r => r.name === 'Bodhi'); const v = p.parts.screen.getWorldPosition(p.parts.group.position.clone()).project(window.__tv.camera); window.__tv.aim.set(v.x, v.y); window.__tv.shootPaint(0); window.__inflight = window.__tv.bulletsInFlight; });
const inFlight = await H.evaluate(() => window.__inflight);
check('the bullet is a visible object flying through the air', inFlight >= 1, 'bullets in flight: ' + inFlight);
await sleep(3500);
const logs = await Promise.all([H,A,B].map(p => p.evaluate(() => window.__sfxLog)));
check('shooter hears own shot', logs[0].includes('shot'));
check('bystander hears the distant shot', logs[2].includes('shot'), JSON.stringify(logs[2]));
check('bystander hears the bullet whizz past', logs[2].includes('whizz'));
check('the player hit hears their screen crack', logs[1].includes('crack'), JSON.stringify(logs[1]));
check('bystander hears the impact', logs[2].includes('glass') || logs[2].includes('thud'));
check('A screen cracked (bullet landed)', (await A.evaluate(() => window.__tv.mePaint.hits)) >= 1);
// reload animation seen by others
await H.keyboard.down('KeyF'); await sleep(700); await H.keyboard.up('KeyF'); await H.keyboard.down('KeyR'); await sleep(300); await H.keyboard.up('KeyR');
await B.waitForFunction(() => [...window.__tv.remotes.values()].find(r => r.name === 'Luke')?.reloading, null, { timeout: 5000 }).catch(() => {});
await sleep(600);
const seen = await B.evaluate(() => { const p = [...window.__tv.remotes.values()].find(r => r.name === 'Luke'); return { rl: p.reloading, dropped: !!p.parts.magDropped, gunTilt: +p.parts.gunInner.rotation.z.toFixed(2) }; });
check('others see the reload (drum dropped, gun tipped over)', seen.rl && seen.dropped && seen.gunTilt > 0.5, JSON.stringify(seen));
await H.screenshot({ path: 'tools/b-reload.png' });
await sleep(3500);
const after = await B.evaluate(() => { const p = [...window.__tv.remotes.values()].find(r => r.name === 'Luke'); return { rl: p.reloading, magVis: p.parts.mag.visible }; });
check('reload finishes, drum back in', !after.rl && after.magVis, JSON.stringify(after));
// a bullet mid-flight, seen from the bystander
await B.evaluate(() => { const m = window.__tv.me; m.pos.set(-6,0,9); window.__tv.camYaw = Math.PI * 0.75; window.__tv.camPitch = 0.05; });
await sleep(800);
await H.evaluate(() => { window.__tv.aim.set(0.02, 0.0); window.__tv.shootPaint(0); });
await sleep(60);
await H.screenshot({ path: 'tools/b-flight.png' });
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
