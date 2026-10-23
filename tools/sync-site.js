#!/usr/bin/env node
// The website and the server re-use some of the app's own files so a name, price or look can never differ between them.
// Run this after changing any of them:  node tools/sync-site.js
const fs = require('fs'), path = require('path');
const from = path.join(__dirname, '..', 'renderer'), site = path.join(__dirname, '..', 'server'), to = path.join(site, 'public', 'app');
fs.mkdirSync(to, { recursive: true });
// shown on the website (the shop previews are the app's own code and styling)
for (const f of ['yappy.js', 'icons.js', 'previews.js', 'previews.css', 'perks.css', 'perkdata.js', 'safecss.js', 'holiday.js', 'sounds.js']) { fs.copyFileSync(path.join(from, f), path.join(to, f)); console.log('copied', f, '-> server/public/app'); }
// used by the server itself (catalogue, prices, holiday windows, checking admin-made CSS)
for (const f of ['perkdata.js', 'safecss.js']) { fs.copyFileSync(path.join(from, f), path.join(site, f)); console.log('copied', f, '-> server'); }
