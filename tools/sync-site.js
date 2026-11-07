#!/usr/bin/env node
// The website and the server re-use some of the app's own files so a name, price or look can never differ between them.
// Run this after changing any of them:  node tools/sync-site.js
const fs = require('fs'), path = require('path');
const from = path.join(__dirname, '..', 'renderer'), site = path.join(__dirname, '..', 'server'), to = path.join(site, 'public', 'app');
fs.mkdirSync(to, { recursive: true });
// shown on the website (the shop previews are the app's own code and styling)
for (const f of ['yappy.js', 'icons.js', 'previews.js', 'previews.css', 'perks.css', 'perkdata.js', 'safecss.js', 'holiday.js', 'sounds.js', 'releases.js']) { fs.copyFileSync(path.join(from, f), path.join(to, f)); console.log('copied', f, '-> server/public/app'); }
// Sound files the shared scripts play (Yappy's squeaks and the notification sounds)
{ const sf = path.join(from, 'assets', 'sounds'), st = path.join(to, 'assets', 'sounds'); fs.mkdirSync(st, { recursive: true }); for (const f of fs.readdirSync(sf)) fs.copyFileSync(path.join(sf, f), path.join(st, f)); console.log('copied sounds -> server/public/app/assets/sounds'); }
// used by the server itself (catalogue, prices, holiday windows, checking admin-made CSS)
for (const f of ['perkdata.js', 'safecss.js', 'releases.js']) { fs.copyFileSync(path.join(from, f), path.join(site, f)); console.log('copied', f, '-> server'); }

// README: "New in" the latest version, from the same release notes
const readme = path.join(__dirname, '..', 'README.md'), rel = require(path.join(from, 'releases.js'))[0];
if (rel && fs.existsSync(readme)) {
  const block = `<!-- release notes: written by tools/sync-site.js from renderer/releases.js -->\n## ${rel.fixes ? 'Fixes in' : 'New in'} ${rel.v}\n\n${rel.items.map(([t, b]) => `- **${t}.** ${b}`).join('\n')}\n\nEarlier versions: https://yappy.chat/changelog\n<!-- /release notes -->`;
  const md = fs.readFileSync(readme, 'utf8'), out = md.replace(/<!-- release notes:[\s\S]*?<!-- \/release notes -->/, block);
  if (out !== md) { fs.writeFileSync(readme, out); console.log('README:', rel.fixes ? 'Fixes in' : 'New in', rel.v); }
}
