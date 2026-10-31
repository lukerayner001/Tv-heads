import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-features=WebRtcHideLocalIpsWithMdns','--use-gl=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const base = 'http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000&mpbase=/mp&mpmodel=/mp/face_landmarker.task';
const errs = [];
const mk = async (n, extra='&norender') => { const c = await b.newContext({ viewport: { width: 900, height: 600 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(n+': '+e.message)); await p.goto(base+extra); await p.fill('#name', n); return p; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (p, f, a) => p.evaluate(f, a);
const place = (p, x, z, r) => ev(p, ([x,z,r]) => { const m = window.__tv.me; m.pos.set(x,0,z); m.rot = r; }, [x,z,r]);
const zap = async (p) => { await p.keyboard.down('KeyF'); await sleep(120); await p.keyboard.up('KeyF'); };
const st = (p) => ev(p, () => ({ score: window.__tv.me.score, hp: window.__tv.me.hp, hidden: window.__tv.me.hidden, rid: window.__tv.roundId, state: window.__tv.roundState, photos: window.__tv.zapPhotos.length }));
const vis = (p, id) => ev(p, id => !document.getElementById(id).classList.contains('hidden'), id);
let ok = 0, bad = 0; const check = (name, cond, info='') => { cond ? ok++ : bad++; console.log((cond ? 'PASS ' : 'FAIL ') + name, info); };

const H = await mk('Host'); await H.click('#hostBtn');
await H.waitForFunction(() => document.getElementById('roomcode').textContent.length===4);
const code = await H.textContent('#roomcode');
check('host sees settings panel', await vis(H, 'settings'));
const A = await mk('Ann'), B = await mk('Bob');
for (const p of [A,B]) { await p.fill('#code', code); await p.click('#joinBtn'); }
await A.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
await B.waitForFunction(() => window.__tv.conns.size === 2, null, {timeout: 20000});
check('joiners see waiting banner', await vis(A, 'waiting') && await vis(B, 'waiting'));

// --- round 1: damage + hide + freeze + zapcam, first to 2
await H.evaluate(() => { for (const el of document.querySelectorAll('#featureList input')) el.checked = ['damage','hide','zapcam','billboards','freeze','shout'].includes(el.dataset.k); document.getElementById('target').value = '5'; });
await H.click('#startRoundBtn'); await sleep(800);
const [sh, sa, sb] = await Promise.all([st(H), st(A), st(B)]);
check('round synced to everyone', sh.rid && sh.rid === sa.rid && sa.rid === sb.rid && sa.state === 'playing', JSON.stringify([sh.rid, sa.rid, sb.rid]));
check('settings closed, waiting gone', !(await vis(H,'settings')) && !(await vis(A,'waiting')));

// damage: H zaps A three times -> KO -> H scores 1
await place(H, 0, -10, Math.PI); await place(A, 0, -16, 0); await place(B, 15, 15, 0); await sleep(800);
for (let i = 0; i < 3; i++) { await zap(H); await sleep(1900); }
let s1 = await st(H), s2 = await st(A);
check('3 hits = KO = 1 point for shooter', s1.score === 1, JSON.stringify(s1));
check('zap cam took a photo per hit', s1.photos === 3, s1.photos);
check('victim knocked out / respawned', s2.hp === 3 || s2.hp === 0, JSON.stringify(s2));
const remoteKo = await ev(H, () => [...window.__tv.remotes.values()].find(p => p.name === 'Ann')?.ko);
check('others see the KO', remoteKo === true);
await sleep(3500);
check('victim respawned with full health', (await st(A)).hp === 3);

// hide: B covers camera, H can't hit B
await ev(B, () => { window.__tv.fakeDark = true; }); await sleep(600);
check('B is hidden', (await st(B)).hidden);
await place(H, 0, 0, Math.PI/2 * 0 + 0); await place(B, 0, 6, 0); await sleep(800);
await place(H, 0, 0, 0); await sleep(300);
const seenHidden = await ev(H, () => [...window.__tv.remotes.values()].find(p => p.name === 'Bob')?.hidden);
check('others see B as hidden', seenHidden === true);
await zap(H); await sleep(800);
check('hidden B not hit', (await st(B)).hp === 3);
await zap(B); await sleep(300);
check('hidden B cannot zap', (await ev(B, () => document.getElementById('toast').textContent)).includes('Uncover'));
await ev(B, () => { window.__tv.fakeDark = false; }); await sleep(600);
check('B visible again', !(await st(B)).hidden);

// freeze: H moves (fake camera motion) and loses a point; A stays still
await ev(H, () => { window.__tv.fakeMotion = 30; }); await ev(A, () => { window.__tv.fakeMotion = 0; });
await ev(H, () => window.__tv.callFreeze()); await sleep(400);
check('freeze shown to others', await vis(A, 'freeze'));
await sleep(1500);
check('mover loses a point', (await st(H)).score === 0, JSON.stringify(await st(H)));
await ev(H, () => { window.__tv.fakeMotion = 0; }); await sleep(2500);

// shout power: a loud zap reaches further (A at distance 22)
await place(H, -20, -3, Math.PI/2); await place(A, 2, -3, 0); await ev(H, () => { window.__tv.fakeLoud = 0; }); await sleep(1000);
await zap(H); await sleep(1900);
check('quiet zap misses at 22m', (await st(A)).hp === 3);
await ev(H, () => { window.__tv.fakeLoud = 1; }); await zap(H); await sleep(500); await ev(H, () => { window.__tv.fakeLoud = 0; });
check('loud zap hits at 22m', (await st(A)).hp === 2, JSON.stringify(await st(A)));

// win: give H the points via two more KOs is slow; instead check win detection by setting score
await ev(H, () => { window.__tv.me.score = 5; }); await sleep(1200);
check('results shown on all when someone hits target', await vis(H,'results') && await vis(A,'results') && await vis(B,'results'));
check('host gets Next round button', await vis(H,'nextRoundBtn') && !(await vis(A,'nextRoundBtn')));
const winnerA = await A.textContent('#winner');
check('winner announced', winnerA.includes('Host wins'), winnerA);
check('zap cam gallery shows photos', (await ev(H, () => document.querySelectorAll('#gallery img').length)) >= 3);

// --- round 2: mouth to fire + laugh, no damage
await H.click('#nextRoundBtn');
await H.evaluate(() => { for (const el of document.querySelectorAll('#featureList input')) el.checked = ['mouth','laugh'].includes(el.dataset.k); document.getElementById('target').value = '5'; });
await H.click('#startRoundBtn'); await sleep(800);
check('round 2 resets scores', (await st(H)).score === 0 && (await st(A)).state === 'playing');
await ev(H, () => { window.__tv.fakeFace = { jaw: 0, smile: 0 }; });
await place(H, 0, -10, Math.PI); await place(A, 0, -14, 0); await place(B, 20, 20, 0); await H.waitForFunction(() => !!window.__tv.face, null, {timeout: 90000}).catch(()=>{}); await sleep(800);
await zap(H); await sleep(600);
check('button does not fire in mouth mode', (await st(H)).score === 0);
await ev(H, () => { window.__tv.faceState.jaw = 0; window.__tv.fakeFace = { jaw: 0.9, smile: 0 }; }); await sleep(1500);
await ev(H, () => { window.__tv.fakeFace = { jaw: 0, smile: 0 }; }); await sleep(300);
check('open mouth fires and scores (no damage mode)', (await st(H)).score === 1, JSON.stringify(await st(H)));
await ev(A, () => { window.__tv.fakeFace = { jaw: 0, smile: 0.9 }; }); await sleep(900); await ev(A, () => { window.__tv.fakeFace = { jaw: 0, smile: 0 }; });
await sleep(500);
check('A laughs -> nearest (H) gets a point', (await st(H)).score === 2, JSON.stringify(await st(H)));

// late joiner gets the round
const C = await mk('Cat'); await C.fill('#code', code); await C.click('#joinBtn'); await sleep(5000);
const sc = await st(C);
check('late joiner gets current round', sc.rid === (await st(H)).rid && sc.state === 'playing', JSON.stringify(sc));

// real MediaPipe load from local files
const M = await mk('Mia', ''); await M.fill('#code', code); await M.click('#joinBtn'); await sleep(4000);
await ev(M, () => window.__tv.face);
await M.waitForFunction(() => !!window.__tv.face, null, { timeout: 120000 }).then(() => check('MediaPipe face tracker loads', true)).catch(() => check('MediaPipe face tracker loads', false));
await M.screenshot({ path: 'tools/shot-mia.png' });
console.log(`\n${ok} passed, ${bad} failed`); console.log('errors', errs);
await b.close();
