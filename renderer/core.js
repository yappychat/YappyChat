'use strict';
/* ---------- Basics ---------- */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// Flash the taskbar button (and the tray icon) when something needs you and you are in another window
function flashMe(why) { try { if (S.settings.flashOn === false || S.settings.streamer || !isBg() || !cg.flash) return; cg.flash(String(why || '')); } catch (e) {} }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = (s = '') => s.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\r/g, '').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');
const MAX_CHANNELS = 50;
const CB_MODES = ['protan', 'deutan', 'tritan'];
// Every stat that can appear in the Session Information strip: [key, label, default on]
const STAT_DEFS = [['bans', 'Bans', 1], ['timeouts', 'Timeouts', 1], ['deletes', 'Deletes', 1], ['warns', 'Warnings', 0], ['chatters', 'Chatters', 1], ['msgs', 'Chats', 1], ['mpm', 'Chats / min', 0], ['emotes', 'Emotes sent', 0], ['firsts', 'First-timers', 0], ['viewers', 'Viewers', 1], ['live', 'Time live', 1], ['games', 'Games played', 0]];
// Sound events: [key, label, default tone, default on]
const SOUND_EVENTS = [['highlight', 'Highlighted message', 'ping', 1], ['watch', 'Watch-list chatter', 'bell', 1], ['live', 'Someone goes live', 'chime', 1], ['automod', 'AutoMod or unban request', 'blip', 1], ['yappy', 'Yappy suggestion', 'soft', 1], ['first', 'First-time chatter', 'pop', 0], ['whisper', 'Whisper received', 'harp', 1], ['alert', 'Alert from a mod (/alert)', 'bell', 1]];
const DEF = {
  theme: 'dark', fontSize: 14, timestamps: true, logging: true, hl: [], watch: [], notes: {}, tabs: [], timeoutDefault: 600, clientId: '', split: false, sidebar: false, hlMention: true, badges: true, confirmBans: false,
  emotes7tv: true, emotesBttv: true, emotesFfz: true, zeroWidth: true, emoteSize: 'md', volume: 0.6, soundOn: {}, soundTone: {}, soundCustom: {},
  liveNotify: true, liveDesktop: true, liveFollowed: true, yappyShow: true, yappySuggest: true, yappyAnimate: true,
  modButtons: 'always', modSide: 'left', hoverKeys: false, pauseHover: true, linkWarn: true, flyout: true, streamer: false, streamerMute: true,
  season: 'auto', holidayTheme: true, holidayLogo: true, holidayYappy: true, statsShow: {}, colW: {}, splitSet: [],
  perkIds: {}, myPerk: null,
  tsFormat: 'HH:MM:SS', sharedAvatars: true, sessHide: false, cbMode: 'off', cbNames: true, cbCues: false, sharePing: true, seenVersion: '', noticeSeen: 0, chanStyle: {}, amChat: true, amChatAuto: true, amChatTerms: true, pauseBlur: true, feedMin: 2, lastPing: '', compact: true, lastActive: '', myLoadout: null, yappyNotify: false, history: true, historyCount: 100, trackJoins: true, closeAction: 'quit', bgChats: 'open', sideW: 340, blacklist: [], blNames: true,
  macros: [], announcements: [], banList: [], banAuto: false, shifts: {}, tl: {}, chanNotes: {}, linkQueue: true, linkAllow: [],
  palette: 'default', notMod: false, sideLabels: false, greetings: ['Welcome to the chat, {user}!', 'Hey {user}, welcome in! Have a look at the rules if you get a moment.'], flashOn: true, warnSaved: [], toPresets: [60, 600, 3600, 86400, 604800], railTools: [], hideFromCapture: false, lockMin: 0, lockSalt: '', lockHash: '', revokeOnLogout: true, yappyBuzz: true, alertsOn: true, startWin: false, startHidden: false, toolsOpen: {},
  pip: { open: false, channel: 'follow', w: 480, muted: true, corner: 1, dock: null, dockSize: 0.45, extra: [] }
};
// Optional permissions power the extra tools. Logging in never fails without them: each tool says what it needs and offers to ask for it.
// Optional permissions power the extra tools. Logging in never asks for them: each tool says what it needs and asks for that one permission when you open it.
const OPTIONAL_SCOPES = ['moderator:read:guest_star', 'moderator:read:chatters', 'moderator:manage:shoutouts', 'moderator:manage:automod_settings', 'moderation:read', 'channel:manage:polls', 'channel:manage:predictions', 'channel:manage:raids', 'channel:manage:broadcast', 'channel:edit:commercial', 'channel:manage:vips', 'channel:read:subscriptions', 'channel:read:vips', 'moderator:read:suspicious_users', 'clips:edit', 'user:read:chat', 'channel:manage:moderators', 'user:manage:chat_color', 'user:manage:blocked_users', 'moderator:manage:suspicious_users', 'channel:read:ads', 'channel:manage:ads', 'user:read:blocked_users', 'user:read:moderated_channels', 'user:write:chat'];
const SCOPE_WHY = { 'moderator:read:chatters': 'see who is in chat', 'moderator:manage:shoutouts': 'send shoutouts', 'moderator:manage:automod_settings': 'change AutoMod settings', 'moderation:read': 'read the banned, moderator and VIP lists', 'channel:manage:polls': 'run polls', 'channel:manage:predictions': 'run predictions', 'channel:manage:raids': 'start raids', 'channel:manage:broadcast': 'edit the stream title and category and add markers', 'channel:edit:commercial': 'run ads', 'channel:manage:vips': 'manage VIPs', 'channel:read:subscriptions': 'show subscriber numbers on the dashboard', 'clips:edit': 'make clips', 'moderator:read:guest_star': 'see guests streaming together', 'user:read:chat': 'show gifted-drop notices that Twitch only sends this way', 'user:read:subscriptions': 'tell which channels you subscribe to (so the stream window can skip ads for you)', 'channel:manage:moderators': 'add or remove moderators (/mod and /unmod)', 'user:manage:chat_color': 'change your name colour (/color)', 'user:manage:blocked_users': 'block and unblock people (/block and /unblock)', 'moderator:manage:suspicious_users': 'monitor or restrict a user (/monitor and /restrict)', 'channel:read:ads': 'see your ad schedule', 'channel:manage:ads': 'snooze your next ad', 'user:read:blocked_users': 'show the people you blocked', 'user:read:moderated_channels': 'list the channels you moderate', 'moderator:read:warnings': 'show when someone accepts a warning', 'user:write:chat': 'send and pin a message (/pin your message)' };
// What every login needs: reading and sending chat, your emotes, who you follow (live alerts), whispers (whispers and /alert), the list of who is in chat and which channels you subscribe to (the stream window uses that to skip ads).
const CORE_SCOPES = ['chat:read', 'chat:edit', 'user:read:emotes', 'user:read:follows', 'user:read:whispers', 'user:manage:whispers', 'moderator:read:chatters', 'user:read:subscriptions'];
// Only for moderators: the message buttons, Shield Mode, AutoMod, unban requests, blocked terms, warnings, announcements and follower age on user cards.
// Someone who ticks "I'm not a moderator" never grants these.
const MOD_SCOPES = ['moderator:manage:banned_users', 'moderator:manage:chat_messages', 'moderator:manage:chat_settings', 'moderator:manage:shield_mode', 'moderator:manage:automod', 'moderator:manage:unban_requests', 'moderator:manage:blocked_terms', 'moderator:manage:warnings', 'moderator:read:warnings', 'moderator:manage:announcements', 'moderator:read:followers'];
// ONE sign-in asks for everything: the core permissions, the moderator ones and every tool permission. Someone who ticks "I'm not a moderator" gets the core
// ones plus the few that viewers use; if they later switch to moderator view, YappyChat asks once more for the rest.
const VIEWER_SCOPES = ['user:read:chat', 'user:manage:chat_color', 'user:manage:blocked_users', 'user:read:blocked_users', 'clips:edit'];
const requiredScopes = () => (S.settings.notMod ? [...CORE_SCOPES, ...VIEWER_SCOPES] : [...new Set([...CORE_SCOPES, ...MOD_SCOPES, ...OPTIONAL_SCOPES])]);
// A new login asks for what is required plus the optional permissions you already granted before (so logging in again never takes a tool away)
const loginScopes = () => [...new Set([...requiredScopes(), ...(S.scopes || []).filter((x) => OPTIONAL_SCOPES.includes(x))])];
const REQUIRED = [...CORE_SCOPES, ...MOD_SCOPES]; // kept for older code paths
const S = {
  settings: {}, token: null, clientId: '', me: null, chats: new Map(), scopes: [], active: null, global: new Map(), globalBadges: new Map(), ws: null, retry: null, es: null, esId: null, esOld: null,
  mentions: [], queue: [], unbans: [], firsts: [], ylog: [], modlog: [], sideTab: 'mentions', unseen: { mentions: 0, automod: 0, unbans: 0, yappy: 0, firsts: 0, whispers: 0, joins: 0, links: 0, modact: 0, suspicious: 0, live: 0 }, lvlog: [], susp: [], ubRes: new Map(), jp: [], links: [], whispers: new Map(), whisperSub: false, perkSeen: new Set(), ac: null, yCool: {}, dragPane: null,
  twitchGlobal: [], twitchGlobalMap: new Map(), myMap: new Map(), myLoaded: false, mine: [], myIds: new Set(), owners: new Map(), live: new Map(), liveBase: false, liveTimer: null, playerBase: {}, hostedFail: false, pipLogin: null, manualCheck: false, joinQ: [], imgFail: {}, replyTo: null
};
const cur = () => S.chats.get(S.active);
const saveSettings = (p) => { Object.assign(S.settings, p); try { cg.setSettings(p); } catch (e) {} };
// Timeout lengths you chose in Settings > Moderation (seconds), used on user cards and the right-click menu of the timeout button
const toLens = () => { const l = (Array.isArray(S.settings.toPresets) ? S.settings.toPresets : []).map(Number).filter((x) => x >= 1 && x <= 1209600); return l.length ? [...new Set(l)].slice(0, 8) : [60, 600, 3600, 86400, 604800]; };
const fmtDur = (s) => s >= 604800 ? s / 604800 + 'w' : s >= 86400 ? s / 86400 + 'd' : s >= 3600 ? s / 3600 + 'h' : s >= 60 ? s / 60 + 'm' : s + 's';
// Timestamp formats: H hour, M minute, S second (two letters = padded, one = plain). Capital letters are bright, lower case letters are softer.
// P / p adds AM/PM and switches to a 12-hour clock. Anything else (colons, dots, spaces) is shown as typed.
function fmtTs(ts, f) {
  f = String(f || 'HH:MM:SS'); const d = new Date(ts), H = d.getHours(), pm = /p/i.test(f), v = { h: pm ? H % 12 || 12 : H, m: d.getMinutes(), s: d.getSeconds() };
  return f.replace(/([Hh]+|[Mm]+|[Ss]+|[Pp])|([^HhMmSsPp]+)/g, (x, tok, lit) => {
    if (lit) return esc(lit); const k = tok[0].toLowerCase(), dim = tok[0] === tok[0].toLowerCase();
    const txt = k === 'p' ? (H < 12 ? 'AM' : 'PM') : tok.length >= 2 ? String(v[k]).padStart(2, '0') : String(v[k]);
    return dim ? `<span class="tdim">${txt}</span>` : txt;
  });
}
const fmtClock = (ms) => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const tmFmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const sw = (id, on) => `<label class="sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;
const hexOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');

/* ---------- Tooltips for icon buttons (one floating element, so nothing clips it) ---------- */
(function () {
  let tip, t = 0;
  const hide = () => { clearTimeout(t); if (tip) tip.classList.remove('on'); };
  document.addEventListener('mouseover', (e) => {
    const n = e.target.closest && e.target.closest('[data-tip]'); if (!n) return hide();
    clearTimeout(t); t = setTimeout(() => {
      if (!tip) { tip = el('div', 'tip'); document.body.append(tip); }
      tip.textContent = n.dataset.tip; tip.classList.add('on');
      const r = n.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
      if (n.dataset.tipSide === 'left') { tip.style.left = Math.max(6, r.left - w - 8) + 'px'; tip.style.top = Math.max(6, Math.min(innerHeight - h - 6, r.top + r.height / 2 - h / 2)) + 'px'; return; }
      tip.style.top = (r.bottom + h + 12 > innerHeight ? r.top - h - 8 : r.bottom + 8) + 'px';
    }, 280);
  });
  document.addEventListener('pointerdown', hide, true); document.addEventListener('scroll', hide, true);
  // Icon-only buttons get their tooltip as an accessible name, so a screen reader says "Add channel" instead of just "button".
  // Keyboard users see the same tooltip when the button gets focus.
  const name = (n) => { if (n.nodeType !== 1) return; const list = n.matches && n.matches('[data-tip]') ? [n] : []; if (n.querySelectorAll) list.push(...n.querySelectorAll('button[data-tip],[role=button][data-tip],a[data-tip],.ibtn[data-tip]')); list.forEach((b) => { if (!b.hasAttribute('aria-label') && !(b.textContent || '').trim()) b.setAttribute('aria-label', String(b.dataset.tip).split('\n')[0].slice(0, 120)); }); };
  name(document.body); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(name))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('focusin', (e) => { const n = e.target; if (n && n.matches && n.matches(':focus-visible') && n.dataset && n.dataset.tip) n.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  document.addEventListener('focusout', hide);
})();

/* ---------- Toasts (fade out) ---------- */
function toast(msg, o = {}) {
  if (S.settings.streamer && o.private) return;
  const t = el('div', 'toast' + (o.type === 'err' ? ' err' : ''));
  t.append(el('span', null, esc(msg)));
  if (o.action) { const b = el('button', null, esc(o.action.label)); b.onclick = () => { o.action.fn(); t.remove(); }; t.append(b); }
  const x = el('button', 'tx', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.title = 'Dismiss'; x.onclick = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }; t.append(x);
  $('#toasts').append(t);
  const ms = o.ms || 6000; setTimeout(() => t.classList.add('out'), ms - 450); setTimeout(() => t.remove(), ms);
}
const err = (m) => toast(m, { type: 'err' });

/* ---------- Popovers (modeless: they never swallow a click) and modals ---------- */
function closePop() { const p = S.pop; if (p) { p.node.remove(); S.pop = null; if (p.onClose) p.onClose(); } }
function closeModal() { $('#modals').innerHTML = ''; }
function closeLayer() { closePop(); closeModal(); }
// Popovers are placed next to what you clicked, kept fully inside the window, and re-fitted whenever their content grows (user cards load in stages).
// o.vcenter centres the popover vertically instead (used for user cards, which are tall).
function popover(node, anchor, o = {}) {
  if (o.toggle && S.pop && S.pop.anchor === anchor) { closePop(); return false; } // pressing the same button again closes it
  closePop(); node.classList.add('pop'); if (!o.nox && !hasClose(node) && (node.querySelector(':scope > h3') || node.classList.contains('ucard'))) { node.classList.add('hasx'); node.append(closeX(closePop)); } $('#pops').append(node);
  const fit = () => {
    const r = anchor.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight;
    node.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    node.style.top = Math.max(8, Math.min(innerHeight - h - 8, o.vcenter ? (innerHeight - h) / 2 : o.up ? r.top - h - 8 : r.bottom + 6)) + 'px';
  };
  fit(); let ro = null; if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(node); }
  S.pop = { node, anchor, sticky: !!o.sticky, onClose: () => { if (ro) ro.disconnect(); if (o.onClose) o.onClose(); } };
  return true;
}
// Every window and titled panel gets a small × in its corner, for people who don't know to click outside or press Esc
const closeX = (fn) => { const b = el('button', 'mclose', ico('x', 15)); b.type = 'button'; b.setAttribute('aria-label', 'Close'); b.dataset.tip = 'Close (Esc)'; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
const hasClose = (node) => !!node.querySelector('.mclose, #db-x, [data-close]');
function modal(node) {
  closePop(); const L = $('#modals'); L.innerHTML = '';
  const bd = el('div', 'backdrop'); bd.onmousedown = (e) => { if (e.target === bd) closeModal(); };
  node.classList.add('modal'); if (!hasClose(node)) { node.classList.add('hasx'); node.append(closeX(closeModal)); } bd.append(node); L.append(bd);
}
// A click anywhere outside an open popover closes it, and the click carries on to whatever was under it
document.addEventListener('pointerdown', (e) => {
  const p = S.pop; if (!p || p.sticky) return;
  if (p.node.contains(e.target) || (p.anchor && p.anchor.contains && p.anchor.contains(e.target))) return;
  closePop();
}, true);

/* ---------- Twitch API ---------- */
// Asks Twitch directly whether the login is still good, so one odd 401 can never throw you out
async function tokenReallyDead() { try { const r = await cg.http({ url: 'https://id.twitch.tv/oauth2/validate', headers: { Authorization: 'OAuth ' + S.token } }); return r.status === 401; } catch (e) { return false; } }
// Rate limits: Twitch gives each login a bucket of points per minute and says how many are left (Ratelimit-Remaining) and when it refills
// (Ratelimit-Reset, Unix seconds). When the bucket is nearly empty, or Twitch answers 429, every request waits for the refill instead of failing.
const RL = { remaining: Infinity, reset: 0, until: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function noteLimits(r) {
  const h = r.headers || {}, rem = parseInt(h['ratelimit-remaining']), rst = parseInt(h['ratelimit-reset']);
  if (!isNaN(rem)) RL.remaining = rem; if (!isNaN(rst)) RL.reset = rst * 1000;
  if (r.status === 429) RL.until = Math.max(RL.until, RL.reset > Date.now() ? RL.reset : Date.now() + (parseInt(h['retry-after']) || 5) * 1000);
}
let refreshed = 0;
async function helix(path, { method = 'GET', query, body, retry = true } = {}) {
  const url = 'https://api.twitch.tv/helix/' + path + (query ? '?' + (typeof query === 'string' ? query : new URLSearchParams(query)) : '');
  const idem = method === 'GET';
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(RL.until, RL.remaining <= 2 && RL.reset > Date.now() ? RL.reset : 0) - Date.now();
    if (wait > 0) await sleep(Math.min(wait + 250, 65000));
    const r = await cg.http({ url, method, headers: { Authorization: 'Bearer ' + S.token, 'Client-Id': S.clientId, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    noteLimits(r);
    if (r.status === 429 && retry && attempt < 3) continue; // waits for the refill above, then tries again
    if ((r.status >= 500 || r.status === 0) && idem && retry && attempt < 2) { await sleep(800 * 2 ** attempt + Math.random() * 400); continue; } // Twitch hiccup or no connection: a reading request is tried again
    // Only a genuinely invalid token logs you out. Other 401s (missing scope, not a moderator here) are just errors for that request.
    // (Twitch also answers 401 with wording like "...must match the user ID found in the request's OAuth token" when a moderator tries an owner-only action, which must never log you out.)
    if (r.status === 401 && S.token && /^\s*invalid oauth token\.?\s*$/i.test((r.json && r.json.message) || '')) {
      if (attempt === 0 && Date.now() - refreshed > 60000) { refreshed = Date.now(); const t = cg.refreshToken ? await cg.refreshToken().catch(() => null) : null; if (t && t !== S.token) { S.token = t; continue; } } // device-code logins renew themselves
      if (await tokenReallyDead()) { err('Your Twitch login has ended. Please log in again.'); logout(); }
    }
    return r;
  }
}
const ok = (r) => r.status >= 200 && r.status < 300;
// Plain-language errors: Twitch's own message when it gives one, otherwise what happened and what to do
const apiErr = (r) => {
  if (r.status === 0) return r.error === 'timeout' ? 'Twitch took too long to answer. Try again in a moment.' : r.error === 'blocked' ? 'YappyChat does not talk to that address.' : 'No connection to Twitch. Check your internet connection.';
  if (r.status === 429) return 'Twitch says that was too many requests in a minute. Wait a moment and try again.';
  if (r.status >= 500) return 'Twitch is having trouble right now. Try again in a minute.';
  if (r.status === 403) return (r.json && r.json.message) || 'Twitch says your account is not allowed to do that here.';
  return (r.json && r.json.message) || 'Twitch could not do that (error ' + r.status + ').';
};
// Anything that breaks in the page is written to the local diagnostics log (with tokens removed) so a bug report can say what happened
addEventListener('error', (e) => { try { cg.reportError(e.error || { message: e.message + ' @ ' + e.filename + ':' + e.lineno }); } catch (x) {} });
addEventListener('unhandledrejection', (e) => { try { cg.reportError(e.reason || 'unhandled rejection'); } catch (x) {} });
const getJson = async (url) => { const r = await cg.http({ url }); return r.status === 200 ? r.json : null; };
async function idOf(login) { const r = await helix('users', { query: { login } }); return r.json && r.json.data && r.json.data[0] && r.json.data[0].id; }
const mq = (c, extra) => ({ broadcaster_id: c.id, moderator_id: S.me.id, ...extra });

/* ---------- Sounds ---------- */
const lastPlay = {}; let soundBusy = 0;
function playSound(tone, ev, force) {
  const v = S.settings.volume;
  if (tone === 'custom') { const u = (S.settings.soundCustom || {})[ev]; if (u) return Sounds.playUrl(u, v); tone = 'ping'; }
  Sounds.play(tone, v);
}
// Events that can use a channel's own sound (set by right-clicking its tab)
const CH_SOUND_EVENTS = ['highlight', 'watch', 'first', 'automod', 'live'];
// Alert sounds never overlap (if two things happen together only the first is heard) and each kind has a cooldown, so nobody can spam a sound to grab your attention
function play(ev, channel) {
  const s = S.settings, d = SOUND_EVENTS.find((x) => x[0] === ev); if (!d) return;
  if (channel && ((s.chanStyle || {})[channel] || {}).mute) return; // muted channel: no sound, no Yappy buzz (it is still logged and listed)
  if (s.yappyBuzz !== false && !s.streamer && ev !== 'first' && window.Yappy && Yappy.buzz) { try { Yappy.buzz(); } catch (e) {} } // Yappy buzzes for every notification, even when sounds are off
  const cs = channel && CH_SOUND_EVENTS.includes(ev) ? (s.chanStyle || {})[channel] : null, own = cs && cs.sound;
  if (s.streamer && s.streamerMute) return;
  const on = (s.soundOn || {})[ev]; if (on === undefined ? !d[3] : !on) return;
  if (own === 'none') return; // silent in this channel
  const now = Date.now(), cd = (s.soundCooldown === undefined ? 10 : +s.soundCooldown) * 1000;
  if (now < soundBusy || now - (lastPlay[ev] || 0) < Math.max(400, cd)) return;
  const tone = own && own !== 'custom' ? own : own === 'custom' ? 'custom' : (s.soundTone || {})[ev] || d[2];
  lastPlay[ev] = now; soundBusy = now + (tone === 'custom' ? Math.max(500, 1000 * (+(s.soundCustom || {})[ev + '_dur'] || 3)) : Sounds.dur(tone)) + 120;
  playSound(tone, ev);
}

/* ---------- Links open in the default browser, after a warning (unless switched off) ---------- */
function openExternal(url) { if (/^https?:\/\//i.test(url)) cg.openExternal(url); }
function openLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (S.settings.linkWarn === false) return openExternal(url);
  let host = url; try { host = new URL(url).host; } catch (e) {}
  const n = el('div', 'stack', `<h3>${ico('link', 18)} Leaving YappyChat</h3><div class="sd">This link opens in your default browser. YappyChat can't vouch for what's on the other side.</div><div class="linkbox">${esc(url)}</div><div class="sd">Site: <b>${esc(host)}</b></div><label class="row chk"><span>Don't show this warning again</span>${sw('lw-off', false)}</label><div class="row"><button class="btn" id="lw-x">Cancel</button><button class="btn primary" id="lw-go">Open in browser</button></div>`);
  modal(n); $('#lw-x', n).onclick = closeModal; $('#lw-go', n).focus();
  $('#lw-go', n).onclick = () => { if ($('#lw-off', n).checked) saveSettings({ linkWarn: false }); closeModal(); openExternal(url); };
}

/* ---------- Moderation log (my actions plus clears I can see) ---------- */
function logAct(c, kind, text, by, target, extra) {
  // Your own actions say "You …"; anything else seen in chat (a timeout, a deletion) has no name until Twitch's moderation feed says who did it
  if (!by && /^You /.test(text) && S.me) by = S.me.login;
  recordMod(c.login, kind, text, by, target, extra); // the same action from Twitch's moderation feed is merged into this one (see recordMod)
}
