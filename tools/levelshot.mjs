import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = await (await b.newContext({ viewport: { width: 1100, height: 650 } })).newPage(); const errs=[]; H.on('pageerror', e => errs.push(e.message));
await H.goto(base); await H.fill('#name','Luke'); await H.click('#hostBtn');
await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const A = await (await b.newContext()).newPage(); await A.goto(base + '&norender'); await A.fill('#name','Bodhi'); await A.fill('#code', await H.textContent('#roomcode')); await A.click('#joinBtn');
await A.waitForFunction(() => window.__tv.conns.size === 1, null, {timeout: 20000});
await H.click('#startRoundBtn');
await A.evaluate(() => { const m = window.__tv.me; m.pos.set(4,0,8); m.rot = Math.PI; });
const shots = [[0,0,20, Math.PI, 0.02,'l1'], [-10,0,-8, Math.PI*0.25, 0.12,'l2'], [12,0,-6, -Math.PI*0.8, 0.0,'l3']];
for (const [x,y,z,yaw,pitch,name] of shots) {
  await H.evaluate(([x,z,yaw,pitch]) => { const m = window.__tv.me; m.pos.set(x,0,z); m.rot = yaw; window.__tv.camYaw = yaw; window.__tv.camPitch = pitch; }, [x,z,yaw,pitch]);
  await sleep(1800); await H.screenshot({ path: `tools/${name}.png` });
}
console.log('errors', errs);
await b.close();
