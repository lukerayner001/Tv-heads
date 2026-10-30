import { build } from 'esbuild';
import fs from 'fs';
const r = await build({ entryPoints: ['main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = fs.readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/tv-heads.html', html);
fs.writeFileSync('index.html', html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB');
