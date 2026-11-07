'use strict';
/* ---------- Basics ---------- */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// Flash the taskbar button (and the tray icon) when something needs you and you are in another window
function flashMe(why) { try { if (S.settings.flashOn === false || S.settings.streamer || !isBg() || !cg.flash) return; cg.flash(String(why || '')); } catch (e) {} }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Switches published from yappy.chat/admin (see checkFlags): a feature listed in S.flags.off is turned off for everyone until it is switched back on */
const flagOff = (k) => !!(S.flags && S.flags.off && S.flags.off[k]);
const unesc = (s = '') => s.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\r/g, '').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');
const MAX_CHANNELS = 50;
const CB_MODES = ['protan', 'deutan', 'tritan'];
// Every stat that can appear in the Session Information strip: [key, label, default on]
// What each counter counts (shown when you rest on it): your own actions, not the whole mod team's (Mod activity has everyone's)
const STAT_TIP = { bans: 'Bans you made since you opened this chat', timeouts: 'Timeouts you gave since you opened this chat', deletes: 'Messages you deleted since you opened this chat', warns: 'Warnings you sent since you opened this chat', chatters: 'Different people who chatted since you opened this chat', msgs: 'Messages since you opened this chat' };
const STAT_DEFS = [['bans', 'Bans', 1], ['timeouts', 'Timeouts', 1], ['deletes', 'Deletes', 1], ['warns', 'Warnings', 0], ['chatters', 'Chatters', 1], ['msgs', 'Chats', 1], ['mpm', 'Chats / min', 0], ['emotes', 'Emotes sent', 0], ['firsts', 'First-timers', 0], ['viewers', 'Viewers', 1], ['live', 'Time live', 1], ['games', 'Games played', 0]];
// Sound events: [key, label, default tone, default on]
const SOUND_EVENTS = [['highlight', 'Highlighted message', 'bubble', 1], ['watch', 'Watch-list chatter', 'shine', 1], ['live', 'Someone goes live', 'golive', 1], ['automod', 'AutoMod or unban request', 'headsup', 1], ['yappy', 'Yappy suggestion', 'tap', 1], ['first', 'First-time chatter', 'welcome', 0], ['whisper', 'Whisper received', 'hush', 1], ['alert', 'Alert from a mod (/alert)', 'attention', 1]];
const DEF = {
  theme: 'dark', fontSize: 14, timestamps: true, logging: true, hl: [], watch: [], notes: {}, tabs: [], timeoutDefault: 600, clientId: '', split: false, sidebar: false, hlMention: true, badges: true, confirmBans: false,
  emotes7tv: true, emotesBttv: true, emotesFfz: true, zeroWidth: true, emoteSize: 'md', volume: 0.6, soundOn: {}, soundTone: {}, soundCustom: {},
  liveNotify: true, liveDesktop: true, liveFollowed: true, yappyShow: true, yappySuggest: true, yappyAnimate: true,
  modButtons: 'always', modSide: 'left', hoverKeys: false, pauseHover: true, linkWarn: true, flyout: true, streamer: false, streamerMute: true,
  season: 'auto', holidayTheme: true, holidayLogo: true, holidayYappy: true, statsShow: {}, colW: {}, splitSet: [],
  perkIds: {}, myPerk: null,
  tsFormat: 'HH:MM:SS', sharedAvatars: true, sessHide: true, cbMode: 'off', cbNames: true, cbCues: false, sharePing: true, seenVersion: '', noticeSeen: 0, chanStyle: {}, amChat: true, amChatAuto: true, amChatTerms: true, pauseBlur: true, feedMin: 2, lastPing: '', compact: true, lastActive: '', myLoadout: null, yappyNotify: false, history: true, historyCount: 100, trackJoins: true, closeAction: 'quit', bgChats: 'open', sideW: 340, blacklist: [], blNames: true,
  macros: [], announcements: [], banList: [], banAuto: false, shifts: {}, tl: {}, chanNotes: {}, linkQueue: true, linkAllow: [],
  palette: 'default', notMod: false, focus: false, sideLabels: false, greetings: ['Welcome to the chat, {user}!', 'Hey {user}, welcome in! Have a look at the rules if you get a moment.'], flashOn: true, warnSaved: [], toPresets: [60, 600, 3600, 86400, 604800], railTools: [], hideFromCapture: false, lockMin: 0, lockSalt: '', lockHash: '', revokeOnLogout: true, yappyBuzz: true, alertsOn: true, startWin: false, startHidden: false, toolsOpen: {},
  pip: { open: false, channel: 'follow', w: 480, muted: true, corner: 1, dock: null, dockSize: 0.45, extra: [] }
};
// Optional permissions power the extra tools. Logging in never asks for them: each tool says what it needs and asks for that one permission when you open it.
const OPTIONAL_SCOPES = ['moderator:read:guest_star', 'moderator:read:chatters', 'moderator:manage:shoutouts', 'moderator:manage:automod_settings', 'moderation:read', 'channel:manage:polls', 'channel:manage:predictions', 'channel:manage:raids', 'channel:manage:broadcast', 'channel:edit:commercial', 'channel:manage:vips', 'channel:read:subscriptions', 'channel:read:vips', 'moderator:read:suspicious_users', 'clips:edit', 'user:read:chat', 'channel:manage:moderators', 'user:manage:chat_color', 'user:manage:blocked_users', 'moderator:manage:suspicious_users', 'channel:read:ads', 'channel:manage:ads', 'user:read:blocked_users', 'user:read:moderated_channels', 'user:write:chat', 'user:read:whispers', 'user:manage:whispers', 'user:read:subscriptions'];
const SCOPE_WHY = { 'user:read:whispers': 'receive whispers', 'user:manage:whispers': 'send whispers', 'moderator:read:chatters': 'see who is in chat', 'moderator:manage:shoutouts': 'send shoutouts', 'moderator:manage:automod_settings': 'change AutoMod settings', 'moderation:read': 'read the banned, moderator and VIP lists', 'channel:manage:polls': 'run polls', 'channel:manage:predictions': 'run predictions', 'channel:manage:raids': 'start raids', 'channel:manage:broadcast': 'edit the stream title and category and add markers', 'channel:edit:commercial': 'run ads', 'channel:manage:vips': 'manage VIPs', 'channel:read:subscriptions': 'show subscriber numbers on the dashboard', 'clips:edit': 'make clips', 'moderator:read:guest_star': 'see guests streaming together', 'user:read:chat': 'show gifted-drop notices that Twitch only sends this way', 'user:read:subscriptions': 'tell which channels you subscribe to (so the stream window can skip ads for you)', 'channel:manage:moderators': 'add or remove moderators (/mod and /unmod)', 'user:manage:chat_color': 'change your name colour (/color)', 'user:manage:blocked_users': 'block and unblock people (/block and /unblock)', 'moderator:manage:suspicious_users': 'monitor or restrict a user (/monitor and /restrict)', 'channel:read:ads': 'see your ad schedule', 'channel:manage:ads': 'snooze your next ad', 'user:read:blocked_users': 'show the people you blocked', 'user:read:moderated_channels': 'list the channels you moderate', 'moderator:read:warnings': 'show when someone accepts a warning', 'user:write:chat': 'send and pin a message (/pin your message)' };
// What every login needs: reading and sending chat, your emotes, who you follow (live alerts) and the list of who is in chat.
const CORE_SCOPES = ['chat:read', 'chat:edit', 'user:read:emotes', 'user:read:follows', 'moderator:read:chatters'];
// Asked the first time they're needed, never at sign-in (streamers get whispers at sign-in, for /alert): whispers, and which channels you subscribe to (the ad-skip hint).
const WHISPER_SCOPES = ['user:read:whispers', 'user:manage:whispers'], LATER_SCOPES = [...WHISPER_SCOPES, 'user:read:subscriptions'];
// Only for moderators: the message buttons, Shield Mode, AutoMod, unban requests, blocked terms, warnings, announcements and follower age on user cards.
// Someone who ticks "I'm not a moderator" never grants these.
const MOD_SCOPES = ['moderator:manage:banned_users', 'moderator:manage:chat_messages', 'moderator:manage:chat_settings', 'moderator:manage:shield_mode', 'moderator:manage:automod', 'moderator:manage:unban_requests', 'moderator:manage:blocked_terms', 'moderator:manage:warnings', 'moderator:read:warnings', 'moderator:manage:announcements', 'moderator:read:followers', 'moderator:read:moderators', 'moderator:read:vips'];
// ONE sign-in asks for everything: the core permissions, the moderator ones and every tool permission. Someone who ticks "I'm not a moderator" gets the core
// ones plus the few that viewers use; if they later switch to moderator view, YappyChat asks once more for the rest.
const VIEWER_SCOPES = ['user:read:chat', 'user:manage:chat_color', 'user:manage:blocked_users', 'user:read:blocked_users', 'clips:edit'];
// Channel-owner tools (ads, raids, title and game, polls, predictions, VIPs and mods). Moderators aren't asked for these at sign-in: Twitch would list them as
// "Run commercials" or "Manage your broadcast" though a mod can't use them. They're asked for together the first time someone opens one, or at sign-in when you chose Streamer.
const STREAMER_SCOPES = ['channel:manage:polls', 'channel:manage:predictions', 'channel:manage:raids', 'channel:manage:broadcast', 'channel:edit:commercial', 'channel:manage:vips', 'channel:manage:moderators', 'channel:read:ads', 'channel:manage:ads', 'channel:read:subscriptions', 'channel:read:vips', 'moderator:read:guest_star'];
const requiredScopes = () => { const st = S.settings.useAs === 'streamer'; return S.settings.notMod ? [...CORE_SCOPES, ...VIEWER_SCOPES] : [...new Set([...CORE_SCOPES, ...MOD_SCOPES, ...OPTIONAL_SCOPES.filter((x) => (st || !STREAMER_SCOPES.includes(x)) && !(LATER_SCOPES.includes(x) && !(st && WHISPER_SCOPES.includes(x))))])]; };
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
// Spell check in the message boxes follows Settings > Chat (on unless turned off); applied when a box gets focus, so new chat panes pick it up too
document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.matches && t.matches('#input, .pin, .th-input')) t.spellcheck = S.settings.spell !== false; });
// Timeout lengths you chose in Settings > Moderation (seconds), used on user cards and the right-click menu of the timeout button
const toLens = () => { const l = (Array.isArray(S.settings.toPresets) ? S.settings.toPresets : []).map(Number).filter((x) => x >= 1 && x <= 1209600); return l.length ? [...new Set(l)].slice(0, 8) : [60, 600, 3600, 86400, 604800]; };
// Durations. Short ("10m", "1m 40s", "1h 30m") on buttons and tags; long ("10 minutes", "1 hour 30 minutes") in sentences. At most two parts, never decimals.
const DUR_U = [[604800, 'w', 'week'], [86400, 'd', 'day'], [3600, 'h', 'hour'], [60, 'm', 'minute'], [1, 's', 'second']];
function durParts(s) { s = Math.max(0, Math.round(+s || 0)); const out = []; for (const [n, a, l] of DUR_U) { if (out.length === 2) break; const v = Math.floor(s / n); if (v) { out.push([v, a, l]); s -= v * n; } else if (out.length) break; } return out.length ? out : [[0, 's', 'second']]; }
const fmtDur = (s) => durParts(s).map(([v, a]) => v + a).join(' ');
const fmtDurLong = (s) => durParts(s).map(([v, , l]) => `${v} ${l}${v === 1 ? '' : 's'}`).join(' ');
// Timestamp formats: H hour, M minute, S second (two letters = padded, one = plain). Capital letters are bright, lower case letters are softer.
// P / p adds AM/PM and switches to a 12-hour clock. Anything else (colons, dots, spaces) is shown as typed.
function fmtTs(ts, f, plain) {
  f = String(f || 'HH:MM:SS'); const d = new Date(ts), H = d.getHours(), pm = /p/i.test(f), v = { h: pm ? H % 12 || 12 : H, m: d.getMinutes(), s: d.getSeconds() };
  return f.replace(/([Hh]+|[Mm]+|[Ss]+|[Pp])|([^HhMmSsPp]+)/g, (x, tok, lit) => {
    if (lit) { lit = lit.replace(/[<>&"'`]/g, ''); return plain ? lit : esc(lit); } /* separators only: the format can come from an imported settings file */ const k = tok[0].toLowerCase(), dim = !plain && tok[0] === tok[0].toLowerCase();
    const txt = k === 'p' ? (H < 12 ? 'AM' : 'PM') : tok.length >= 2 ? String(v[k]).padStart(2, '0') : String(v[k]);
    return dim ? `<span class="tdim">${txt}</span>` : txt;
  });
}
const fmtClock = (ms) => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
// Every time YappyChat shows follows your timestamp format (Settings > Chat), so the chat, Mod activity, user cards and the rest always agree.
const tmFmt = (ts) => fmtTs(ts, S.settings.tsFormat, true);
const tmShort = (ts) => fmtTs(ts, String(S.settings.tsFormat || 'HH:MM:SS').replace(/[:.\s]?[Ss]+/g, '') || 'HH:MM', true); // the same clock without seconds (graphs, schedules)
// A day and a time: "Today 18:15:31", "Yesterday …", "12 Oct 18:15:31" (the year only when it isn't this year)
function dateTime(ts) {
  const d = new Date(ts), now = new Date(), day = (x) => x.toDateString(), y = new Date(now); y.setDate(now.getDate() - 1);
  const pre = day(d) === day(now) ? 'Today' : day(d) === day(y) ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
  return pre + ' ' + tmFmt(ts);
}
const sw = (id, on) => `<label class="sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;

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
  msg = String(msg == null ? '' : msg).trim(); if (/[\p{L}\p{N}"')]$/u.test(msg) && msg.split(/\s+/).length >= 3 && !/\)$/.test(msg)) msg += '.'; // every note reads as a sentence
  // The same note again while it's still showing: keep the one already there, moved to the front, rather than stacking copies
  const same = !o.action && [...$('#toasts').children].find((x) => x.classList.contains('toast') && !x.classList.contains('out') && x.dataset.m === msg);
  if (same) { $('#toasts').append(same); if (same._again) same._again(); return; }
  const t = el('div', 'toast' + (o.type === 'err' ? ' err' : '')); t.dataset.m = msg;
  t.append(el('span', null, esc(msg)));
  if (o.action) { const b = el('button', null, esc(o.action.label)); b.onclick = () => { o.action.fn(); t.remove(); }; t.append(b); }
  const x = el('button', 'tx', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.title = 'Dismiss'; x.onclick = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }; t.append(x);
  $('#toasts').append(t);
  // Long enough to read (about 3.5 words a second, plus a moment), and it waits while your pointer is on it
  const words = msg.split(/\s+/).length, ms = Math.max(o.ms || 6000, 1800 + words * 290); let left = ms, at = Date.now(), tm = 0;
  const go = () => { at = Date.now(); tm = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, Math.max(500, left - 450)); };
  t.addEventListener('mouseenter', () => { clearTimeout(tm); left -= Date.now() - at; t.classList.remove('out'); });
  t.addEventListener('mouseleave', () => { left = Math.max(left, 1500); go(); });
  t._again = () => { clearTimeout(tm); left = ms; go(); };
  go();
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
// Renews the login after Twitch said the current one has expired. Returns 'ok' (S.token is the renewed login), 'later' (Twitch could not be reached:
// keep the login and try again) or 'dead' (Twitch rejected it, so you really are logged out). Only 'dead' may ever end the session.
let renewing = null;
function renewLogin(why) {
  if (renewing) return renewing;
  renewing = (async () => {
    try {
      const r = cg.renewToken ? await cg.renewToken() : { token: await cg.refreshToken(), state: 'new' };
      if (r && r.token && r.token !== S.token) { S.token = r.token; return 'ok'; }
      if (r && r.state === 'dead') { diagNote('login', 'ended: Twitch rejected the saved login (' + why + ')'); return 'dead'; }
      if (r && r.state === 'error') { diagNote('login', 'kept: Twitch could not be reached to renew it (' + why + ')'); return 'later'; }
      const v = await cg.http({ url: 'https://id.twitch.tv/oauth2/validate', headers: { Authorization: 'OAuth ' + S.token } }); // nothing to renew with: ask Twitch directly
      if (v.status === 200) return 'ok';
      if (v.status === 401) { diagNote('login', 'ended: Twitch says the login is invalid (' + why + ')'); return 'dead'; }
      return 'later';
    } catch (e) { return 'later'; } finally { setTimeout(() => { renewing = null; }, 0); }
  })();
  return renewing;
}
const diagNote = (k, d) => { try { cg.note && cg.note(k, d); } catch (e) {} };
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
    if (wait > 0) { RL.held = (RL.held || 0) + 1; rlNotice(wait); try { await sleep(Math.min(wait + 250, 65000)); } finally { RL.held--; rlNotice(0); } }
    const r = await cg.http({ url, method, headers: { Authorization: 'Bearer ' + S.token, 'Client-Id': S.clientId, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    noteLimits(r);
    if (r.status === 429 && retry && attempt < 3) continue; // waits for the refill above, then tries again
    if ((r.status >= 500 || r.status === 0) && idem && retry && attempt < 2) { await sleep(800 * 2 ** attempt + Math.random() * 400); continue; } // Twitch hiccup or no connection: a reading request is tried again
    // Only a genuinely invalid token logs you out. Other 401s (missing scope, not a moderator here) are just errors for that request.
    // (Twitch also answers 401 with wording like "...must match the user ID found in the request's OAuth token" when a moderator tries an owner-only action, which must never log you out.)
    if (r.status === 401 && S.token && /^\s*invalid oauth token\.?\s*$/i.test((r.json && r.json.message) || '')) {
      if (attempt === 0 && Date.now() - refreshed > 60000) { refreshed = Date.now(); const rn = await renewLogin('api'); if (rn === 'ok') continue; if (rn === 'dead') { err('Your Twitch login has ended. Please log in again.'); logout(true); } } /* device-code logins renew themselves; if Twitch can't be reached, this request fails and the login stays */
    }
    return r;
  }
}
const ok = (r) => r.status >= 200 && r.status < 300;
// Plain-language errors: what happened and what to do. Twitch's own wording is used only when it reads as a normal sentence;
// anything technical (field names, IDs, codes) is replaced with a plain line, and Twitch's original goes to the diagnostics log.
const TECHY = /_id\b|\bparameter|\bfield\b|malformed|\bquery\b|\bbody\b|\bjson\b|\btoken\b|\boauth\b|\bscope|\bheader|\bclient\b|\bendpoint|\bschema|\bnull\b|\bundefined\b|\bstatus code\b/i;
const apiErr = (r) => {
  if (r.status === 0) return r.error === 'timeout' ? 'Twitch took too long to answer. Try again in a moment.' : r.error === 'blocked' ? "YappyChat only talks to Twitch and the emote sites, so it didn't open that address." : "Can't reach Twitch. Check your internet connection, then try again.";
  if (r.status === 429) return 'That was a lot of requests in a short time, so Twitch asked YappyChat to slow down. Wait a moment and try again.';
  if (r.status >= 500) return 'Twitch is having trouble right now. Try again in a minute.';
  const raw = String((r.json && r.json.message) || ''), hit = API_PLAIN.find(([re]) => re.test(raw));
  if (hit) return hit[1];
  if (raw) dbg(`twitch said (${r.status}): ${raw}`);
  if (r.status === 401) return 'Twitch needs you to log in again (or to allow a new permission). Use Settings > Account.';
  if (r.status === 403) return "Twitch says your account isn't allowed to do that here.";
  if (r.status === 404) return "Twitch couldn't find that. It may have been removed, or the name may be spelt differently.";
  if (raw && !TECHY.test(raw) && raw.length < 200) return 'Twitch says: ' + raw.replace(/\s*$/, '').replace(/([^.!?])$/, '$1.');
  return "Twitch didn't accept that. Try again, and if it keeps happening let us know at yappy.chat/contact.";
};
// Twitch's own wording for common refusals, said plainly (what happened, and what to do). The first match wins, so specific lines come first.
const API_PLAIN = [
  [/message-status|already set or the new status was invalid/i, 'Another moderator already handled that message.'],
  [/is already banned/i, "They're already banned."],
  [/(user|target) is not banned|not (currently )?(banned|timed out)/i, "They aren't banned or timed out, so there's nothing to lift."],
  [/someone else is updating/i, 'Another moderator is acting on this person at the same moment. Try again in a second.'],
  [/missing (required )?scope|missing.*permission|token.*scope/i, 'YappyChat needs another Twitch permission for this. Log in again from Settings > Account to allow it.'],
  [/not one of the broadcaster's moderators|user is not a moderator/i, "They aren't a moderator."],
  [/is not a vip|not one of the broadcaster's vips/i, "They aren't a VIP."],
  [/already a moderator/i, "They're already a moderator."],
  [/already a vip/i, "They're already a VIP."],
  [/remove them as a moderator|is a moderator.*vip/i, "They're a moderator. Remove them as a moderator first (/unmod), then make them a VIP."],
  [/remove them as a vip|is a vip.*moderator/i, "They're a VIP. Remove their VIP first (/unvip), then make them a moderator."],
  [/vip slots/i, 'The channel has used all its VIP slots. Remove a VIP first.'],
  [/build a community/i, 'Twitch only allows VIPs once the channel has finished the Build a Community achievement.'],
  [/must be (a )?moderator|not a moderator|moderator.*required/i, "You're not a moderator in that channel, so Twitch won't allow it."],
  [/broadcaster.*must match|must match the user id|only the broadcaster/i, 'Only the streamer can do that through apps.'],
  [/shout ?out.*themselves|themselves a shout/i, "You can't shout out your own channel."],
  [/not streaming live or does not have one or more viewers/i, 'Shoutouts only work while the channel is live and has viewers.'],
  [/shout ?out cooldown|wait for the shout/i, 'Twitch allows one shoutout every 2 minutes, and the same streamer once an hour. Try again a bit later.'],
  [/raid themselves/i, "You can't raid your own channel."],
  [/already (in the process of )?raiding/i, 'A raid is already counting down. Cancel it first to raid someone else.'],
  [/not accept raids|doesn't accept raids/i, "That channel doesn't accept raids from you."],
  [/number of allowed raids/i, 'Twitch allows 10 raids in 10 minutes. Wait a little and try again.'],
  [/whisper (to )?(themselves|yourself)/i, "You can't whisper yourself."],
  [/verified phone/i, "Twitch only lets accounts with a verified phone number send whispers. Add one in Twitch's settings (Security and Privacy)."],
  [/settings prevent|restricted.*whisper|whispers from strangers/i, "They only accept whispers from people they know, so Twitch didn't deliver it."],
  [/number of whisper|whisper.*(limit|recipients)/i, 'Twitch limits how many whispers you can send, and to how many new people each day. Try again later.'],
  [/capture clips|clips.*(disabled|restricted|followers|subscribers)/i, 'This channel only lets some people make clips (for example followers or subscribers), or has clips turned off.'],
  [/vods?.*(disabled|enabled)|past broadcasts/i, "Markers need the channel to save past broadcasts. The streamer can turn that on in Twitch's Stream settings."],
  [/named colou?r|not a valid colou?r|(turbo|prime).*colou?r|colou?r.*(turbo|prime)/i, 'That colour is not available. Use a colour name like blue or coral; custom colours (#ff7a00) need Twitch Turbo or Prime.'],
  [/commercial.*(cooldown|wait)|wait.*before running/i, 'Twitch needs a short break between ad breaks. Try again in a few minutes.'],
  [/not (a )?(partner|affiliate)|partners? (and|or) affiliates?/i, 'Only Partners and Affiliates can run ads.'],
  [/snoozes? (left|remaining)|no snooze/i, 'There are no ad snoozes left right now. Twitch gives one back every hour.'],
  [/already (been )?resolved/i, 'Another moderator already answered that unban request.'],
  [/minimum of 2 characters|maximum of 500 characters/i, 'Blocked words and phrases must be 2 to 500 characters long.'],
  [/(poll|prediction).*(already|active|in progress)|already.*(poll|prediction)/i, "There's already a poll or prediction running. End it first."],
  [/duplicate|already exists|already (on|in) the list/i, "That's already on the list."],
  [/cannot (ban|timeout|warn) (a )?(moderator|broadcaster|staff)|may not be (banned|timed out|warned)/i, "Twitch won't let you do that to a moderator or the streamer."],
  [/not found|does not exist|no user/i, "Twitch couldn't find that. Check the name and try again."],
  [/too long|exceeds|maximum length/i, "That's longer than Twitch allows. Shorten it and try again."],
  [/must be broadcasting|not (streaming )?live|offline/i, 'That only works while the channel is live.'],
  [/rate limit|too many/i, 'That was a lot of requests in a short time, so Twitch asked YappyChat to slow down. Wait a moment and try again.'],
];
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
  if (s.focus && ['live', 'yappy', 'first'].includes(ev)) return; // Focus: only what needs you now (mentions, the watch list, AutoMod, whispers, /alert) makes a sound
  if (s.yappyBuzz !== false && !s.streamer && !s.focus && ev !== 'first' && window.Yappy && Yappy.buzz) { try { Yappy.buzz(); } catch (e) {} } // Yappy buzzes for every notification, even when sounds are off
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
  if (/^You:? /.test(text) && S.me) { by = by || S.me.display_name || S.me.login; text = text.replace(/^You:? /, ''); }
  recordMod(c.login, kind, text, by, target, extra); // the same action from Twitch's moderation feed is merged into this one (see recordMod)
}

// When Twitch's limit is reached (many actions in a minute, for example during a raid), requests wait for the refill instead of failing.
// A note says so, with how many are waiting and roughly how long, so an action that takes a few seconds never looks lost. It goes when the queue is empty.
let rlToast = null, rlEnd = 0;
function rlNotice(wait) {
  if (wait > 0) rlEnd = Math.max(rlEnd, Date.now() + wait);
  const n = RL.held || 0;
  if (!n) { if (rlToast) { const t = rlToast; rlToast = null; t.classList.add('out'); setTimeout(() => t.remove(), 200); } return; }
  if (wait > 0 && wait < 1500 && !rlToast) return; // a short wait needs no note
  const secs = Math.max(1, Math.ceil((rlEnd - Date.now()) / 1000)), text = `Twitch is limiting how fast YappyChat can act. ${n} ${n === 1 ? 'request is' : 'requests are'} waiting and will go through in about ${secs}s. Nothing is lost.`;
  if (!rlToast || !rlToast.isConnected) { rlToast = el('div', 'toast rl', `<span>${esc(text)}</span>`); $('#toasts').append(rlToast); } else rlToast.firstChild.textContent = text;
}
// How long a timeout has left, as Twitch's feed gives it (an end time): a few seconds have already passed, so it is rounded to what the mod most likely chose
const roundDur = (s) => (s >= 3500 ? Math.round(s / 60) * 60 : s >= 60 ? Math.round(s / 5) * 5 : Math.max(1, Math.round(s)));
// Names as people see them: a person's display name (as seen in chat) rather than their lowercase login, and a channel's display name without a "#"
const dn = (c, login) => { const l = String(login || '').toLowerCase(), u = c && c.users && c.users.get(l); return (u && u.name) || login || ''; };
const chName = (login) => (S.chats.get(login) || {}).name || login || '';
// "1 message", "2 messages": a count with the right word
const plural = (n, one, many) => `${typeof n === 'number' ? n.toLocaleString() : n} ${+String(n).replace(/,/g, '') === 1 ? one : many || one + 's'}`;

// A yes/no question in YappyChat's own style (instead of the plain Windows box). Resolves true for yes; closing it counts as no.
// A button that needs a second click to act (for buttons inside a window that's already open, where a second window would cover it)
function armButton(b, again, fn) { let armed = 0; const label = b.textContent; b.addEventListener('click', () => { if (armed) { clearTimeout(armed); armed = 0; b.textContent = label; return fn(); } b.textContent = again; armed = setTimeout(() => { armed = 0; b.textContent = label; }, 4000); }); }
// Jumping to an older message: lines far up the chat aren't drawn until they're near (see style.css), so their heights are only guesses and a
// jump would land in the wrong place. For a moment every line in that chat is drawn at its real size, the message is centred, and then the
// usual saving comes back (lines keep the size they were drawn at, so nothing moves).
function centerOn(n) {
  if (!n || !n.isConnected) return; const L = n.closest('.list'); if (L) { L.classList.add('cvall'); clearTimeout(L._cvT); }
  n.scrollIntoView({ block: 'center' }); requestAnimationFrame(() => { if (n.isConnected) n.scrollIntoView({ block: 'center' }); });
  if (L) L._cvT = setTimeout(() => L.classList.remove('cvall'), 1500);
}
function ask(title, text, okLabel = 'OK', danger = false) {
  return new Promise((res) => {
    const n = el('div', 'stack askbox', `<h3>${esc(title)}</h3>${text ? `<div class="sd">${esc(text)}</div>` : ''}<div class="btnrow"><span class="grow"></span><button class="btn" type="button" data-q="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-q="yes">${esc(okLabel)}</button></div>`);
    const prev = $('#modals .modal'); // asked from inside a window (Settings): that window comes back afterwards
    let done = false; const fin = (v) => { if (done) return; done = true; clearInterval(iv); if (n.isConnected) closeModal(); if (prev && !$('#modals .modal')) modal(prev); res(v); };
    modal(n); n.querySelector('[data-q=yes]').onclick = () => fin(true); n.querySelector('[data-q=no]').onclick = () => fin(false);
    const iv = setInterval(() => { if (!n.isConnected) fin(false); }, 300); setTimeout(() => n.querySelector('[data-q=yes]').focus(), 30);
  });
}
