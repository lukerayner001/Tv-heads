import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const H = await (await b.newContext()).newPage(); await H.goto(base + '&norender'); await H.click('#hostBtn');
await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const A = await (await b.newContext({ viewport: { width: 1000, height: 650 } })).newPage(); const errs=[]; A.on('pageerror', e => errs.push(e.message));
await A.goto(base); await A.fill('#code', await H.textContent('#roomcode')); await A.click('#joinBtn');
await A.waitForFunction(() => window.__tv.conns.size === 1, null, {timeout: 20000});
await H.evaluate(() => { for (const el of document.querySelectorAll('#featureList input')) el.checked = ['gun'].includes(el.dataset.k); document.getElementById('target').value = '10'; });
await H.click('#startRoundBtn'); await sleep(1000);
// hammer the exact same spot on A's screen 25 times (just under the smash count), measuring A's frame times
const aid = await A.evaluate(() => window.__tv.peer.id);
await A.evaluate(() => { window.__ft = []; let l = performance.now(); const f = (t) => { window.__ft.push(t - l); l = t; if (window.__ft.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const rid = await H.evaluate(() => window.__tv.roundId);
for (let i = 0; i < 25; i++) {
  await H.evaluate(([aid, rid, i]) => { const conns = window.__tv.conns; for (const c of conns.values()) c.send({ t: 'paint', id: aid, u: 0.5, v: 0.5, s: 0.2, seed: 1000 + i, rd: rid }); }, [aid, rid, i]);
  await sleep(100);
}
await sleep(500);
const info = await A.evaluate(() => ({ cracks: window.__tv.mePaint.cracks.length, chips: window.__tv.mePaint.chips.length, hits: window.__tv.mePaint.hits, ko: performance.now() < window.__tv.me.koUntil, worst: Math.max(...window.__ft.slice(5)).toFixed(0), avg: (window.__ft.slice(5).reduce((a,b)=>a+b,0)/(window.__ft.length-5)).toFixed(1) }));
check('same-spot hits become cheap chips, not full cracks', info.cracks <= 2 && info.chips >= 23, JSON.stringify(info));
check('25 hits: not smashed yet', !info.ko);
for (let i = 25; i < 31; i++) { await H.evaluate(([aid, rid, i]) => { for (const c of window.__tv.conns.values()) c.send({ t: 'paint', id: aid, u: 0.5, v: 0.5, s: 0.2, seed: 1000 + i, rd: rid }); }, [aid, rid, i]); await sleep(100); }
await sleep(500);
check('focused fire still smashes the screen (30 hits)', await A.evaluate(() => performance.now() < window.__tv.me.koUntil));
check('shooter scored', (await H.evaluate(() => window.__tv.me.score)) === 1);
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
