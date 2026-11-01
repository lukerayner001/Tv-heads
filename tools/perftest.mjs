import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = 'http://127.0.0.1:8080/' + (process.argv[2] || 'tv-heads.html') + '?peerhost=127.0.0.1&peerport=9000';
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__draws = 0; window.__frames = 0;
  for (const P of [WebGL2RenderingContext.prototype]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const o = P[f]; if (o) P[f] = function () { window.__draws++; return o.apply(this, arguments); }; }
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
});
const H = await ctx.newPage(); H.on('pageerror', e => errs.push(e.message));
await H.goto(base); await H.click('#hostBtn'); await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const peers = [];
for (let i = 0; i < 3; i++) { const p = await (await b.newContext()).newPage(); await p.goto(base + '&norender'); await p.fill('#code', await H.textContent('#roomcode')); await p.click('#joinBtn'); peers.push(p); }
await H.waitForFunction(() => window.__tv.conns.size === 3, null, { timeout: 30000 });
await H.click('#startRoundBtn'); await sleep(2000);
await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0, 0, 18); m.rot = Math.PI; window.__tv.camYaw = Math.PI; window.__tv.camPitch = 0.05; });
for (let i = 0; i < peers.length; i++) await peers[i].evaluate((i) => { window.__tv.me.pos.set(-6 + i * 6, 0, 4); window.__tv.me.rot = 0; }, i);
await sleep(4000);
const info = await H.evaluate(() => { const r = window.__renderer; return null; });
await H.evaluate(() => { window.__draws = 0; window.__frames = 0; }); await sleep(5000);
console.log(process.argv[2], 'draw calls per frame:', await H.evaluate(() => Math.round(window.__draws / Math.max(1, window.__frames))), errs.slice(0, 2));
await b.close();
