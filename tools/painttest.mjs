import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000';
const errs = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
const mk = async (n, vp) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(base); await p.fill('#name', n); return p; };
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const H = await mk('Luke', {width: 900, height: 600}); await H.click('#hostBtn'); await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const A = await mk('Bodhi', {width: 600, height: 450}); await A.fill('#code', await H.textContent('#roomcode')); await A.click('#joinBtn');
await A.waitForFunction(() => window.__tv.conns.size === 1, null, {timeout: 20000});
await H.evaluate(() => { for (const el of document.querySelectorAll('#featureList input')) el.checked = ['paint','zapcam'].includes(el.dataset.k); document.getElementById('target').value = '5'; });
await H.click('#startRoundBtn'); await sleep(800);
check('crosshair shown in paint round', await H.evaluate(() => !document.getElementById('crosshair').classList.contains('hidden')));
await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,12); m.rot = Math.PI; });
await A.evaluate(() => { const m = window.__tv.me; m.pos.set(0.5,0,6); m.rot = 0; });
await sleep(1500);
// aim at a point on A's screen (slightly off centre each shot) and fire
const shoot = async (ox, oy) => H.evaluate(([ox, oy]) => {
  const p = [...window.__tv.remotes.values()][0];
  const THREEv = p.parts.group.position.clone(); THREEv.y += 2.3 + oy; THREEv.x += ox;
  // project with the camera via the aim vector: use the renderer's camera from a ball origin trick
  const cam = window.__tvcam; const v = THREEv.project(cam);
  window.__tv.aim.set(v.x, v.y); window.__tv.shootPaint(0);
}, [ox, oy]);
await H.evaluate(() => { window.__tvcam = window.__tv.camera; });
const hasCam = await H.evaluate(() => !!window.__tv.camera);
if (!hasCam) { console.log('need camera exposed'); }
await shoot(0, 0); await sleep(1200);
const cov1 = await A.evaluate(() => window.__tv.mePaint.coverage);
check('paint lands on A screen, A coverage > 0', cov1 > 0.03, cov1.toFixed(3));
const remoteCov = await H.evaluate(() => { const p=[...window.__tv.remotes.values()][0]; const d=p.paint.g.getImageData(0,0,256,192).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>128) n++; return n/(256*192); });
check('H sees same paint on A TV', Math.abs(remoteCov - cov1) < 0.03, remoteCov.toFixed(3));
await A.screenshot({ path: 'tools/p-victim-view.png' });
await shoot(-0.35,0.2); await sleep(500); await shoot(0.35,-0.2); await sleep(900); await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,9.5); }); await sleep(900); await H.screenshot({ path: 'tools/p-mid.png' }); await H.evaluate(() => { const m = window.__tv.me; m.pos.set(0,0,12); }); await sleep(900);
const offs = [[-0.35,0.2],[0.35,-0.2],[-0.3,-0.25],[0.3,0.25],[0,0.3],[0,-0.3],[-0.45,0],[0.45,0],[0.2,0.1],[-0.2,-0.1],[0.1,-0.35],[-0.1,0.35]];
for (const [x,y] of offs) { if ((await H.evaluate(() => window.__tv.me.score)) >= 1) break; await shoot(x, y); await sleep(450); }
await sleep(800);
await H.screenshot({ path: 'tools/p-shooter.png' });
const hs = await H.evaluate(() => window.__tv.me.score);
check('A painted out at 50% -> H scores', hs === 1, 'H score ' + hs);
check('zap cam photos from paint hits', (await H.evaluate(() => window.__tv.zapPhotos.length)) > 0);
await sleep(3500);
check('A respawns clean', (await A.evaluate(() => window.__tv.mePaint.coverage)) === 0);
const remoteCov2 = await H.evaluate(() => { const p=[...window.__tv.remotes.values()][0]; const d=p.paint.g.getImageData(0,0,256,192).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>128) n++; return n; });
check('others see A clean again', remoteCov2 === 0);
console.log(`${ok} passed, ${bad} failed`, errs);
await b.close();
