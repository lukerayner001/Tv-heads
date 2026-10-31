import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage(); await H.goto(base); await H.fill('#name','Luke'); await H.click('#hostBtn');
await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const A = await (await b.newContext()).newPage(); await A.goto(base + '&norender'); await A.fill('#name','Bodhi'); await A.fill('#code', await H.textContent('#roomcode')); await A.click('#joinBtn');
await A.waitForFunction(() => window.__tv.conns.size === 1, null, {timeout: 20000});
await H.evaluate(() => { for (const el of document.querySelectorAll('#featureList input')) el.checked = ['paint'].includes(el.dataset.k); });
await H.click('#startRoundBtn');
await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,12); m.rot = Math.PI; window.__tv.camYaw = Math.PI; window.__tv.camPitch = 0.05; });
await A.evaluate(() => { const m = window.__tv.me; m.pos.set(1,0,3.5); m.rot = 0; });
await sleep(1500); await H.screenshot({ path: 'tools/cam1.png' });
await H.keyboard.down('KeyQ'); await sleep(900); await H.screenshot({ path: 'tools/cam2.png' }); await H.keyboard.up('KeyQ');
// walk sideways (strafe) and check character turns to run direction
await H.keyboard.down('KeyD'); await sleep(700); await H.keyboard.up('KeyD');
console.log('after strafe right: rot', (await H.evaluate(() => window.__tv.me.rot)).toFixed(2), 'camYaw', (await H.evaluate(() => window.__tv.camYaw)).toFixed(2), 'x', (await H.evaluate(() => window.__tv.me.pos.x)).toFixed(2));
await b.close();
