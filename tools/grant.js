#!/usr/bin/env node
// Adds or updates a supporter in registry.json. Perks are keyed by Twitch name (resolved to the user ID by the app's lookup).
//   node tools/grant.js <name> --add 5                 add $5 to their running total (decides the badge tier)
//   node tools/grant.js <name> --own effects:glow,aurora plates:neon titles:yapper skins:crown entrances:pop sounds:arcade
//   node tools/grant.js <name> --pack halloween,christmas   give seasonal packs
//   node tools/grant.js <name> --equip effect=glow plate=neon title=yapper skin=crown entrance=pop pc=#5ad1ff fxc=#ff5da2
//   node tools/grant.js <name> --gift-from <giver>     record a gift: receiver gets the items, giver gets the Gifter title
//   node tools/grant.js <name> --hide                  hide their badge (supporter wall opt-out)
//   node tools/grant.js <name> --remove
// Effects: glow pulse shimmer neon aurora inferno. Plates: solid dash rainbow neon.
// Titles: yapper chatterbox hype night legend. Skins: shades crown headphones halo sparkles. Entrances: pop slide sparkle.
// Sound packs: arcade cozy. Packs: see HOL in renderer/perks.js (halloween, christmas, newyear, thanksgiving, easter, july4).
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'registry.json');
const args = process.argv.slice(2), clean = (s) => (s || '').toLowerCase().replace(/^@/, ''), login = clean(args.shift());
if (!/^\w{3,25}$/.test(login)) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 16).join('\n')); process.exit(1); }
const flag = (k) => args.indexOf('--' + k);
const vals = (k) => { const i = flag(k); if (i < 0) return []; const o = []; for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) o.push(args[j]); return o; };
const db = JSON.parse(fs.readFileSync(file, 'utf8')); db.users = db.users || [];
const find = (n) => db.users.find((x) => x.login.toLowerCase() === n);
let u = find(login);
if (flag('remove') >= 0) { db.users = db.users.filter((x) => x !== u); u = null; }
else {
  if (!u) { u = { login, total: 0 }; db.users.push(u); }
  if (vals('add')[0]) u.total = (u.total || 0) + Number(vals('add')[0]);
  const own = vals('own'); if (own.length) { u.owned = u.owned || {}; own.forEach((t) => { const [k, v] = t.split(':'); u.owned[k] = [...new Set([...(u.owned[k] || []), ...(v || '').split(',').filter(Boolean)])]; }); }
  const pk = vals('pack'); if (pk.length) { u.owned = u.owned || {}; u.owned.packs = [...new Set([...(u.owned.packs || []), ...pk.join(',').split(',').filter(Boolean)])]; }
  const eq = vals('equip'); if (eq.length) { u.loadout = u.loadout || {}; eq.forEach((t) => { const i = t.indexOf('='); if (i > 0) u.loadout[t.slice(0, i)] = t.slice(i + 1); }); }
  const gf = vals('gift-from')[0]; if (gf) { const g = clean(gf); let gu = find(g); if (!gu) { gu = { login: g, total: 0 }; db.users.push(gu); } gu.gifts = (gu.gifts || 0) + 1; }
  if (flag('hide') >= 0) u.hidden = true;
}
fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n'); console.log('Saved', login, JSON.stringify(u || 'removed'));
