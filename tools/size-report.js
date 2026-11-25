'use strict';
// node tools/size-report.js : after "npm run dist", shows what the installer is made of, and how it compares with the last build.
// Reads dist/win-unpacked (the app as installed) and the installer in dist/. Keeps dist/size-history.json so each build is compared with the one before.
const fs = require('fs'), path = require('path');
const dist = path.join(__dirname, '..', 'dist'), app = path.join(dist, 'win-unpacked');
if (!fs.existsSync(app)) { console.error('Run "npm run dist" first: dist/win-unpacked is missing.'); process.exit(1); }
const mb = (n) => (n / 1048576).toFixed(1).padStart(7) + ' MB';
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push({ p: path.relative(app, p), n: fs.statSync(p).size }); } })(app);
const total = files.reduce((a, f) => a + f.n, 0);
console.log('Installed size ' + mb(total).trim() + ' in ' + files.length + ' files\n\nBiggest files:');
files.sort((a, b) => b.n - a.n).slice(0, 15).forEach((f) => console.log(mb(f.n) + '  ' + f.p));
const yc = files.filter((f) => /^resources[\\/]app\.asar$/.test(f.p)).reduce((a, f) => a + f.n, 0);
console.log('\nYappyChat itself (app.asar): ' + mb(yc).trim() + '. Everything else is Electron, the browser engine the app runs on.');
const exe = fs.readdirSync(dist).find((f) => /^YappyChat-Setup-.*\.exe$/.test(f)), map = exe && fs.existsSync(path.join(dist, exe + '.blockmap')) ? exe + '.blockmap' : '';
const cur = { at: new Date().toISOString(), installed: total, installer: exe ? fs.statSync(path.join(dist, exe)).size : 0, name: exe || '' };
if (exe) console.log('\nInstaller ' + exe + ':' + mb(cur.installer) + (map ? '' : '\n  WARNING: no .blockmap next to it. Without it, updates download the whole installer.'));
if (!fs.existsSync(path.join(dist, 'latest.yml'))) console.log('  WARNING: dist/latest.yml is missing. Upload it with the installer or updates will not be found.');
const hf = path.join(dist, 'size-history.json'); let h = []; try { h = JSON.parse(fs.readFileSync(hf, 'utf8')); } catch (e) {}
const prev = h[h.length - 1];
if (prev && prev.name !== cur.name && cur.installer) { const d = cur.installer - prev.installer; console.log('\nAgainst ' + prev.name + ': ' + (d >= 0 ? '+' : '-') + mb(Math.abs(d)).trim() + ' (' + (d / prev.installer * 100).toFixed(1) + '%)'); }
if (cur.installer && (!prev || prev.name !== cur.name)) { h.push(cur); fs.writeFileSync(hf, JSON.stringify(h.slice(-30), null, 1)); }
