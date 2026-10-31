import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?norender&peerhost=127.0.0.1&peerport=9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const errs=[]; const mk = async (n) => { const p = await (await b.newContext()).newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(base); await p.fill('#name', n); return p; };
const H = await mk('Luke'); await H.click('#hostBtn'); await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const code = await H.textContent('#roomcode');
const A = await mk('Bodhi'), B = await mk('Albie');
for (const p of [A,B]) { await p.fill('#code', code); await p.click('#joinBtn'); }
await B.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await H.evaluate(() => { document.getElementById('target').value = '5'; }); await H.click('#startRoundBtn'); await sleep(1000);
const all = [H, A, B];
const pos = () => Promise.all(all.map(p => p.evaluate(() => [window.__tv.me.pos.x, window.__tv.me.pos.z])));
// bunch everyone together, then someone wins
for (const p of all) await p.evaluate(() => window.__tv.me.pos.set(0.5, 0, 3));
await A.evaluate(() => { window.__tv.me.score = 5; }); await sleep(1200);
check('quick score screen on everyone', (await Promise.all(all.map(p => p.evaluate(() => !document.getElementById('results').classList.contains('hidden'))))).every(Boolean));
const txt = await B.textContent('#nextIn');
check('countdown shown', /Next round in \d/.test(txt), txt);
const rid1 = await H.evaluate(() => window.__tv.roundId);
await sleep(6500);
const st = await Promise.all(all.map(p => p.evaluate(() => ({ rid: window.__tv.roundId, state: window.__tv.roundState, score: window.__tv.me.score, results: !document.getElementById('results').classList.contains('hidden') }))));
check('next round starts by itself for everyone', st.every(s => s.rid !== rid1 && s.rid === st[0].rid && s.state === 'playing' && s.score === 0 && !s.results), JSON.stringify(st));
const p2 = await pos();
const spread = Math.min(...[[0,1],[0,2],[1,2]].map(([i,j]) => Math.hypot(p2[i][0]-p2[j][0], p2[i][1]-p2[j][1])));
check('players reset to separate random spots', spread > 4, 'closest pair ' + spread.toFixed(1) + 'm ' + JSON.stringify(p2.map(p => p.map(v => +v.toFixed(1)))));
check('nobody spawned inside cover', (await Promise.all(all.map(p => p.evaluate(() => window.__tv.spotClear(window.__tv.me.pos.x, window.__tv.me.pos.z, 1.0))))).every(Boolean));
// host leaves during the score screen: the new host carries on
await B.evaluate(() => { window.__tv.me.score = 5; }); await sleep(1500);
const rid2 = await A.evaluate(() => window.__tv.roundId);
await H.context().close();
await A.waitForFunction((r) => window.__tv.roundId !== r && window.__tv.roundState === 'playing', rid2, { timeout: 40000 }).then(() => check('new host starts the next round after the old host left', true)).catch(() => check('new host starts the next round after the old host left', false));
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
