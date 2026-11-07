#!/usr/bin/env node
// Fill in YappyChat's own addresses in one go (instead of editing main.js, perks.js and package.json by hand).
//   node tools/configure.js --github your-github-name [--repo YappyChat] [--site https://yappy.chat] [--twitch-client-id abc123]
// --site can wait until you have the domain; whatever you leave out is left as it was.
// Run it again any time; it replaces the previous values too.
'use strict';
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const site = String(args.site || '').replace(/\/+$/, ''), gh = String(args.github || ''), repo = String(args.repo || 'yappychat'), tw = args['twitch-client-id'];
if ((site && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) || !/^[A-Za-z0-9-]{1,39}$/.test(gh) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
  console.error('Usage: node tools/configure.js --github your-github-username [--repo YappyChat] [--site https://yourdomain.com] [--twitch-client-id YOUR_PUBLIC_APP_ID]');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const edit = (rel, fn) => { const p = path.join(root, rel); const before = fs.readFileSync(p, 'utf8'), after = fn(before); if (after !== before) { fs.writeFileSync(p, after); console.log('updated ' + rel); } else console.log('unchanged ' + rel); };
edit('main.js', (s) => s
  .replace(/githubOwner: '[^']*'/, `githubOwner: '${gh}'`)
  .replace(/githubRepo: '[^']*'/, `githubRepo: '${repo}'`)
  .replace(/siteUrl: '[^']*'/, (m) => (site ? `siteUrl: '${site}'` : m))
  .replace(/twitchClientId: '[^']*'/, (m) => (tw !== undefined ? `twitchClientId: '${String(tw).replace(/[^a-z0-9]/gi, '')}'` : m)));
edit('renderer/perks.js', (s) => s
  .replace(/const API_URL = '[^']*';/, (m) => (site ? `const API_URL = '${site}';` : m))
  .replace(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\//, `https://raw.githubusercontent.com/${gh}/${repo}/`));
edit('package.json', (s) => { const j = JSON.parse(s); j.build.publish = [{ provider: 'github', owner: gh, repo }]; return JSON.stringify(j, null, 2) + '\n'; });
edit('server/.env.example', (s) => s.replace(/https:\/\/github\.com\/[^/]+\/[^/]+\/releases/g, `https://github.com/${gh}/${repo}/releases`).replace(/^SITE_URL=.*$/m, (m) => (site ? `SITE_URL=${site}` : m)));
console.log('\nDone. Updates come from github.com/' + gh + '/' + repo + (site ? ' and the app talks to ' + site + '.' : '. The website address is not set yet.'));
