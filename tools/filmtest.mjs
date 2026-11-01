import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)(process.env.PWPATH);
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok=0, bad=0; const check=(n,c,i='')=>{ c?ok++:bad++; console.log((c?'PASS ':'FAIL ')+n, i); };
const errs=[];
const open = async (q) => { const P = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage(); P.on('pageerror', e => errs.push(e.message)); await P.goto('http://127.0.0.1:8080/tv-heads.html?peerhost=127.0.0.1&peerport=9000' + q); await P.click('#hostBtn'); await P.waitForFunction(() => document.getElementById('roomcode').textContent.length===4); await P.click('#closeSettingsBtn'); return P; };
const brightness = async (P) => { const buf = await P.screenshot(); const { createRequire: cr } = await import('module'); return buf; };
const meanCentre = async (P, name) => { await P.screenshot({ path: `tools/${name}.png` }); return 0; };
// 1) film breaks (outputs black) -> game turns the filter off by itself and keeps drawing
let P = await open('&blacktest');
await sleep(9000);
check('black film output detected -> filter switched off automatically', !(await P.evaluate(() => window.__tv.useFilm)));
check('the choice is remembered and the tick box is off', await P.evaluate(() => localStorage.getItem('tvhead-nofilm') === '1' && !document.getElementById('filmOpt').checked));
await sleep(1500); await P.screenshot({ path: 'tools/f-auto.png' });
await P.context().close();
// 2) simple-graphics mode (as on the Pixel 10) with the film filter on
P = await open('&safe');
await P.evaluate(() => localStorage.setItem('tvhead-nofilm', '0'));
await P.reload(); await P.click('#hostBtn'); await P.waitForFunction(() => document.getElementById('roomcode').textContent.length===4); await P.click('#closeSettingsBtn');
await sleep(9000);
check('simple mode keeps the film filter (no false alarm)', await P.evaluate(() => window.__tv.useFilm && window.__tv.safeGfx));
await P.screenshot({ path: 'tools/f-safe.png' });
// 3) manual off
await P.evaluate(() => { const c = document.getElementById('filmOpt'); c.checked = false; c.dispatchEvent(new Event('change')); });
await sleep(1500);
check('film can be switched off by hand', !(await P.evaluate(() => window.__tv.useFilm)));
await P.screenshot({ path: 'tools/f-off.png' });
console.log(`${ok} passed, ${bad} failed`, errs.slice(0,3));
await b.close();
