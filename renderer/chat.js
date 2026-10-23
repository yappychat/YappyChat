'use strict';
/* ---------- Highlights & watch list ---------- */
// Exact whole-word match, ignoring case. * stands for any run of letters/digits, so Mod* matches "mode" but Mod does not.
function wildRx(pat) { return new RegExp("(?<![\\w])" + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join("[\\w']*") + "(?![\\w])", 'i'); }
function compileHl() {
  S._hl = (S.settings.hl || []).filter((h) => h && h.w).map((h) => { let rx = null; try { rx = h.re ? new RegExp(h.w, 'i') : wildRx(h.w); } catch (e) {} return { ...h, rx }; }).filter((h) => h.rx);
  S._watch = new Set((S.settings.watch || []).map((x) => x.toLowerCase()));
  // Blacklist: one entry per line. * is a wildcard, /pattern/ is a regular expression.
  S._bl = (S.settings.blacklist || []).map((w) => String(w).trim()).filter(Boolean).map((w) => { try { const m = w.match(/^\/(.+)\/$/); return m ? new RegExp(m[1], 'i') : wildRx(w); } catch (e) { return null; } }).filter(Boolean);
}
const blHit = (w) => !!(S._bl && S._bl.length) && S._bl.some((r) => r.test(w));
function matchHighlight(m) {
  if (m.login === S.me.login) return null;
  const lc = m.text.toLowerCase();
  if (S.settings.hlMention) { const me = S.me.login; if (!S._meRx || S._meRx.l !== me) S._meRx = { l: me, rx: new RegExp('(^|[^a-z0-9_])@?' + me.replace(/[^\w]/g, '') + '($|[^a-z0-9_])') }; if (S._meRx.rx.test(lc)) return { color: '' }; }
  for (const h of S._hl || []) if (h.rx.test(m.text)) return h;
  return null;
}
function addHighlight(word) { if ((S.settings.hl || []).some((h) => h.w.toLowerCase() === word.toLowerCase())) return; saveSettings({ hl: [...(S.settings.hl || []), { w: word, color: '#5b8cff', re: false, snd: true }] }); compileHl(); }

/* ---------- IRC connection ---------- */
/* Which chats are live. By default only chats you have open (the active tab, or any chat showing in split view) are joined, logged and allowed to
   notify you. A chat in a tab you are not looking at is left (so you are not shown as sitting in it) and is rebuilt from recent messages when you open it.
   Settings > Chat can keep every tab live instead. */
const bgAll = () => S.settings.bgChats === 'all';
const chatLive = (c) => !!c && (bgAll() || !!c.shown);
function joinChannel(login) { if (S.ws && S.ws.readyState === 1 && !S.joinQ.includes(login)) S.joinQ.push(login); pumpJoins(); }
// Twitch sometimes accepts a JOIN and never confirms it, and that chat then stays silent. ROOMSTATE is the confirmation, so ask again if it does not come.
function watchJoin(c, n) { setTimeout(() => { if (c.gotRoom || !c.joined || !S.ws || S.ws.readyState !== 1 || !chatLive(c) || n >= 2) return; S.ws.send('JOIN #' + c.login); dbg('rejoin ' + c.login); watchJoin(c, n + 1); }, 9000); }
function pumpJoins() {
  if (S.joinTimer || !S.joinQ.length) return;
  S.joinTimer = setInterval(() => { // Twitch allows about 20 joins per 10 seconds
    let l = S.joinQ.shift(); while (l && !(S.chats.has(l) && chatLive(S.chats.get(l)) && !S.chats.get(l).joined)) l = S.joinQ.shift(); // skip chats that are not live or already joined
    if (!l) { clearInterval(S.joinTimer); S.joinTimer = null; return; }
    const c = S.chats.get(l); if (S.ws && S.ws.readyState === 1) { S.ws.send('JOIN #' + l); c.joined = true; c.hideAt = 0; c.gotRoom = false; watchJoin(c, 0); if (c.stale) refreshChat(c); else notice(c, 'Connected to chat'); }
  }, 600);
}
// Called whenever the set of visible chats may have changed, and every few seconds: joins chats that became live, leaves chats that have been out of view for a while
function syncJoins() {
  if (!S.ws || S.ws.readyState !== 1) return; const now = Date.now();
  S.chats.forEach((c) => {
    if (chatLive(c)) { c.hideAt = 0; if (!c.joined) joinChannel(c.login); else if (c.stale) refreshChat(c); return; }
    if (!c.joined) return; if (!c.hideAt) c.hideAt = now;
    if (now - c.hideAt >= 20000) { S.ws.send('PART #' + c.login); c.joined = false; c.stale = true; c.present = new Set(); } // short grace so flicking between tabs does not leave and rejoin each time
  });
}
// Rebuilds a chat that missed messages while it was out of view: clears it and loads the recent messages again, like a fresh open
function refreshChat(c) {
  c.stale = false; [...c.list.children].forEach((n) => { if (n !== c.histEnd) n.remove(); }); c.msgs.clear(); c.heldNodes = null; c.held = 0; c.histEnd.classList.add('hidden'); c.histN = 0; c.stick = true;
  notice(c, 'Connected to chat'); loadHistory(c).catch((e) => dbg('history ' + e));
}
setInterval(syncJoins, 5000);
// Chat connection. Reconnects wait longer each time (1, 2, 4 … up to 60 seconds, with a little randomness so thousands of apps don't all retry at once),
// and a quiet connection is tested with a PING every 4 minutes: no answer within 15 seconds means it is dead, even if Windows never said so.
let ircFails = 0, ircPing = 0, ircPong = 0;
function connect() {
  clearTimeout(S.retry); clearInterval(ircPing);
  const ws = (S.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'));
  let opened = false; ircPong = Date.now(); setConn(ircFails ? 'down' : 'wait');
  ws.onopen = () => { opened = true; ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands' + (S.settings.trackJoins !== false ? ' twitch.tv/membership' : '')); ws.send('PASS oauth:' + S.token); ws.send('NICK ' + S.me.login); S.chats.forEach((x) => { x.joined = false; }); S.joinQ = [...S.chats.keys()]; pumpJoins(); };
  ws.onmessage = (e) => { ircPong = Date.now(); if (opened && S.conn !== 'ok') setConn('ok'); if (ircFails && opened) ircFails = 0; e.data.split('\r\n').filter(Boolean).forEach((ln) => { try { handleLine(ln); } catch (x) { dbg('chat line ' + x); } }); }; // one bad line must not drop the rest of the batch
  ircPing = setInterval(() => {
    if (S.ws !== ws || ws.readyState !== 1) return;
    if (Date.now() - ircPong > 4 * 60000 + 15000) { try { ws.close(); } catch (e) {} return; } // no reply to the last ping: start again
    if (Date.now() - ircPong > 4 * 60000) ws.send('PING :yappychat');
  }, 15000);
  ws.onclose = async () => {
    clearInterval(ircPing); if (!S.token || S.ws !== ws) return; setConn('down');
    if (!ircFails) S.chats.forEach((c) => notice(c, 'Disconnected. Reconnecting…'));
    const wait = Math.min(60000, 1000 * 2 ** Math.min(ircFails, 6)) * (0.8 + Math.random() * 0.4); ircFails++;
    S.retry = setTimeout(async () => { try { const t = await cg.getToken(); if (t) S.token = t; } catch (e) {} if (S.token && S.ws === ws) connect(); }, wait); // a renewed login is picked up here
  };
}
// The connection light beside the channel name: green connected, amber connecting or joining, red reconnecting
function setConn(st) { S.conn = st; connPaint(); }
function connPaint() {
  const d = document.querySelector('#statsbar .conndot'), c = cur(); if (!d || !c) return;
  const st = S.conn !== 'ok' ? (S.conn || 'wait') : (c.gotRoom ? 'ok' : 'wait');
  d.className = 'conndot ' + st; d.dataset.tip = st === 'ok' ? 'Connected to chat' : st === 'down' ? 'Disconnected. Reconnecting…' : 'Connecting to chat…';
}
function parseIrc(line) {
  const tags = {}; let rest = line, prefix = '', trailing = null;
  if (rest[0] === '@') { const i = rest.indexOf(' '); rest.slice(1, i).split(';').forEach((t) => { const [k, ...v] = t.split('='); tags[k] = v.join('='); }); rest = rest.slice(i + 1); }
  if (rest[0] === ':') { const i = rest.indexOf(' '); prefix = rest.slice(1, i); rest = rest.slice(i + 1); }
  const ti = rest.indexOf(' :'); if (ti > -1) { trailing = rest.slice(ti + 2); rest = rest.slice(0, ti); }
  const parts = rest.split(' ').filter((x) => x !== '');
  // IRC only needs the ':' when the last parameter has a space in it. Twitch always sends it, but the recent-messages service leaves it out
  // for one-word messages ("PRIVMSG #chan hello"), so the last parameter IS the message then
  if (trailing === null && parts.length > 2) trailing = parts.pop();
  return { tags, prefix, cmd: parts[0], params: parts.slice(1), trailing };
}
function handleLine(line) {
  const p = parseIrc(line), c = S.chats.get((p.params[0] || '').replace('#', ''));
  if (c && !chatLive(c) && ['PRIVMSG', 'USERNOTICE', 'CLEARCHAT', 'CLEARMSG', 'JOIN', 'PART'].includes(p.cmd)) { c.stale = true; return; } // not open: nothing is shown, logged or notified
  switch (p.cmd) {
    case 'PING': S.ws.send('PONG :tmi.twitch.tv'); break;
    case 'RECONNECT': try { S.ws.close(); } catch (e) {} break; // Twitch is restarting this server: reconnect straight away (onclose takes care of it)
    case 'PRIVMSG': if (c) onChat(c, p); break;
    case 'JOIN': case 'PART': if (c) { const u = p.prefix.split('!')[0]; if (u) { c.present = c.present || new Set(); p.cmd === 'JOIN' ? c.present.add(u) : c.present.delete(u); } if (S.settings.trackJoins !== false) trackJP(c, p); } break;
    case '353': { const cc = S.chats.get((p.params[p.params.length - 1] || '').replace('#', '')); if (cc) { cc.present = cc.present || new Set(); (p.trailing || '').split(' ').filter(Boolean).forEach((n) => cc.present.add(n)); } break; }
    case 'USERSTATE': if (c) { const was = isMod(c); c.selfTags = p.tags; refreshTools(c); if (was !== isMod(c) && c.login === S.active) renderStats(); } break;
    case 'ROOMSTATE': if (c) { c.gotRoom = true; connPaint(); Object.assign(c.modes, p.tags); if (c.login === S.active) renderStats(); } break;
    case 'USERNOTICE': if (c && !(p.tags['source-room-id'] && p.tags['source-room-id'] !== p.tags['room-id'])) { const sys = unesc(p.tags['system-msg'] || ''), txt = sys + (p.trailing ? ' ' + p.trailing : ''); if (isDropNotice(p.tags['msg-id'], sys)) dropNotice(c, txt, p.tags.id); else notice(c, txt, 'sub'); if (p.tags['msg-id'] === 'raid') onRaid(c, p); } break;
    case 'NOTICE':
      if (/authentication failed|login unsuccessful/i.test(p.trailing || '')) { err('Twitch rejected the login. Please log in again.'); logout(); }
      else if (c) notice(c, p.trailing, 'mod'); else if (S.active && S.chats.get(S.active)) notice(S.chats.get(S.active), p.trailing, 'mod');
      break;
    case 'CLEARCHAT': if (c) onClear(c, p); break;
    case 'CLEARMSG': if (c) { const n = c.msgs.get(p.tags['target-msg-id']); if (n) markGone(n, 'deleted'); if (!c.mineDel || Date.now() - c.mineDel > 3000) logAct(c, 'delete', `A message from ${p.tags.login || 'someone'} was deleted`, undefined, p.tags.login, { msg: p.trailing, src: 'deleted' }); } break;
  }
}
// Joins and parts are collected and reported every 5 minutes
function trackJP(c, p) { const u = p.prefix.split('!')[0]; if (!u || u === S.me.login) return; c.jp = c.jp || { j: new Set(), p: new Set() }; (p.cmd === 'JOIN' ? c.jp.j : c.jp.p).add(u); }
// Collected every minute; entries stay in the Joins tab for the time set in Settings > Chat (2 minutes unless changed) (only for chats you can see) and are always written to the chat log
const feedMs = () => Math.max(1, Math.min(30, +S.settings.feedMin || 2)) * 60000;
function flushJP() {
  S.chats.forEach((c) => {
    if (!c.jp || (!c.jp.j.size && !c.jp.p.size)) return; const joined = [...c.jp.j].sort(), parted = [...c.jp.p].sort();
    if (joined.length) logLine(c, `* Joined: ${joined.join(', ')}`); if (parted.length) logLine(c, `* Left: ${parted.join(', ')}`);
    S.jp.unshift({ ts: Date.now(), c: c.login, joined, parted }); c.jp = { j: new Set(), p: new Set() }; if (S.jp.length > 200) S.jp.length = 200; if (c.shown) bump('joins');
  });
}
const visibleLogins = () => new Set([...S.chats.values()].filter((c) => c.shown).map((c) => c.login));
function pruneFeeds() {
  const now = Date.now(), lim = feedMs(), n0 = S.firsts.length + S.jp.length; S.firsts = S.firsts.filter((x) => now - x.ts < lim); S.jp = S.jp.filter((x) => now - x.ts < lim);
  S.unseen.firsts = Math.min(S.unseen.firsts || 0, S.firsts.length); S.unseen.joins = Math.min(S.unseen.joins || 0, S.jp.length);
  const ma = modActList().length; S.unseen.modact = Math.min(S.unseen.modact || 0, ma); const maChanged = ma !== S._maN; S._maN = ma; // Mod activity lines expire after 10 minutes
  return S.firsts.length + S.jp.length !== n0 || maChanged; // true when something expired
}
function markGone(node, label, red) { if (node.classList.contains('gone')) return; node.classList.add('gone'); node.querySelector('.line').prepend(el('span', 'tag' + (red ? ' red' : ''), esc(label))); }
function onClear(c, p) {
  const who = p.trailing, dur = p.tags['ban-duration'];
  if (!who) { logAct(c, 'clear', 'Chat was cleared'); return notice(c, 'Chat was cleared by a moderator', 'mod'); }
  c.list.querySelectorAll(`.msg[data-user="${who.replace(/\W/g, '')}"]`).forEach((n) => markGone(n, (dur ? 'timed out ' + fmtDur(+dur) : 'banned') + byWho(c, who), true));
  const text = dur ? `${who} was timed out for ${fmtDur(+dur)}` : `${who} was banned`;
  { const n = el('div', 'notice modn', `<b class="nlk" data-user="${esc(who.toLowerCase())}" data-tip="Open ${esc(who)}'s user card">${esc(who)}</b> ${dur ? 'was timed out for ' + fmtDur(+dur) : 'was banned'}${esc(byWho(c, who))}`); push(c, n); } logLine(c, `* ${text}`);
  const mine = c.mine && c.mine.get(who.toLowerCase()); if (!mine || Date.now() - mine > 4000) logAct(c, dur ? 'timeout' : 'ban', text, undefined, who);
}

/* ---------- Message rendering ---------- */
function rgbToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}
// Colour-blind help for chat names: simulate what the chosen kind of colour vision loses, then push that lost difference into channels it can still see (daltonisation)
const CVD = { protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]], tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
const CVD_FIX = { protan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]], deutan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]], tritan: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]] };
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)), unlin = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
function cbAdjust(hex, mode) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => lin(v / 255)), M = CVD[mode], F = CVD_FIX[mode];
  const sim = M.map((r) => r[0] * c[0] + r[1] * c[1] + r[2] * c[2]), err = c.map((v, i) => v - sim[i]);
  const out = c.map((v, i) => unlin(v + F[i][0] * err[0] + F[i][1] * err[1] + F[i][2] * err[2]));
  return '#' + out.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function nameStyle(color, login) {
  let hex = /^#[0-9a-f]{6}$/i.test(color) ? color : null;
  if (hex && S.settings.cbNames !== false && CB_MODES.includes(S.settings.cbMode)) hex = cbAdjust(hex, S.settings.cbMode);
  if (!hex) { let x = 0; for (const ch of login) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return `--h:${x % 360};--s:70%;--l:60%`; }
  const [h, s, l] = rgbToHsl(hex); return `--h:${h};--s:${s}%;--l:${l}%`;
}
const isMod = (c) => /(broadcaster|moderator)\//.test((c.selfTags && c.selfTags.badges) || '');
const modKnown = (c) => !c.selfTags || c.selfTags.badges === undefined || isMod(c);
const MODB = [['del', 'trash', 'Delete message (D)'], ['purge', 'eraser', 'Purge (P): clears their messages with a 1-second timeout'], ['to', 'clock', 'Timeout (T). Shift+T or right-click for other lengths'], ['ban', 'ban', 'Ban (B)'], ['warn', 'warn', 'Warn (W)']];
const toolsHtml = (tl) => `<div class="tools">${tl & 1 ? modBtns() + '<i class="sep"></i>' : tl & 4 ? `<button class="mi purge" data-a="purge" data-tip="Purge (P): clears their messages with a 1-second timeout">${ico('eraser', 15)}</button><i class="sep"></i>` : ''}${tl & 2 ? `<button data-a="reply" data-tip="Reply (R)">${ico('reply', 15)}</button>${S.settings.notMod ? '' : `<button data-a="pin" data-tip="Pin message">${ico('pin', 15)}</button>`}<button data-a="macro" data-tip="Save as a macro">${ico('bolt', 15)}</button><button data-a="copy" data-tip="Copy message">${ico('copy', 15)}</button>` : ''}</div>`;
document.addEventListener('pointerover', (e) => { const m = e.target.closest && e.target.closest('.msg[data-tl]'); if (m && !m.querySelector(':scope>.tools')) m.insertAdjacentHTML('beforeend', toolsHtml(+m.dataset.tl)); }, true);
const modBtns = (gutter) => MODB.filter((x) => !(gutter && x[0] === 'purge')).map(([a, i, t]) => `<button class="mi ${a}" data-a="${a}" data-tip="${t}" aria-label="${t}">${ico(i, 15)}</button>`).join('');
function onChat(c, p, hist) {
  let text = p.trailing || '', action = false; const t = p.tags, am = text.match(/^\x01ACTION (.*)\x01$/);
  if (am) { text = am[1]; action = true; }
  const login = p.prefix.split('!')[0];
  const src = t['source-room-id'] || '', foreign = !!src && src !== t['room-id']; // shared chat: this message was sent in another streamer's chat
  const m = { id: t.id, uid: t['user-id'], login, name: t['display-name'] || login, color: t.color, badges: ((foreign ? t['source-badges'] : t.badges) || '').split(',').filter(Boolean), text, action, emotes: t.emotes, ts: +t['tmi-sent-ts'] || Date.now(), first: !hist && !foreign && t['first-msg'] === '1', hist: !!hist, src, foreign, gifs: t.gifs || '', paid: t['pinned-chat-paid-amount'] ? { amount: +t['pinned-chat-paid-amount'], exp: +t['pinned-chat-paid-exponent'] || 0, cur: t['pinned-chat-paid-currency'] || '', level: t['pinned-chat-paid-level'] || '', sys: t['pinned-chat-paid-is-system-message'] === '1' } : null };
  if (foreign) (c.sharedUsers || (c.sharedUsers = new Set())).add(login); // viewers from the other channels in a shared chat
  if (foreign && !hist && !c.shared && (!c.sharedCheck || Date.now() - c.sharedCheck > 30000)) { c.sharedCheck = Date.now(); loadShared(c).catch(() => {}); }
  if (t['reply-parent-display-name']) m.reply = { name: unesc(t['reply-parent-display-name']), body: unesc(t['reply-parent-msg-body']), id: t['reply-parent-msg-id'] || '', login: (t['reply-parent-user-login'] || '').toLowerCase(), uid: t['reply-parent-user-id'] || '' };
  addMessage(c, m);
}

// Extra badges beside a chatter's messages. Raid is a best guess: someone new to this chat in the minutes after a raid arrived.
function userFlags(c, m, wasKnown) {
  const out = [], now = Date.now(), l = m.login; if (m.own || m.foreign) return out;
  const st = c.susp && c.susp.get(l);
  if (st === 'restricted') out.push(['Restricted', 'red', 'Restricted: only moderators see what they write']); else if (st === 'active_monitoring') out.push(['Monitored', 'red', 'A moderator is monitoring this person']);
  const to = c.toAt && c.toAt.get(l); if (to && now - to < 5 * 60000) out.push(['Timed out recently', 'tofade', `Timed out ${Math.max(1, Math.round((now - to) / 60000))} min ago`, `animation-delay:${Math.round(5 * 60000 - (now - to))}ms`]); // fades out 5 minutes after the timeout
  if (c.raid && now - c.raid.at < 4 * 60000 && !wasKnown && !/(broadcaster|moderator|vip|subscriber|founder)\//.test((m.badges || []).join(','))) (c.raiders = c.raiders || new Set()).add(l);
  if (c.raiders && c.raiders.has(l) && c.raid && now - c.raid.at < 15 * 60000) out.push(['Raid', 'raid tofade', `Probably came with the raid from ${c.raid.from} (a best guess: they were new in chat just after it)`, `animation-delay:${Math.round(15 * 60000 - (now - c.raid.at))}ms`]); // gone 15 minutes after the raid
  return out;
}
function addMessage(c, m) {
  if (m.foreign && S.settings.sharedMsgs === false) return; // Settings > Chat: leave out what other channels say in a shared chat
  if (m.id && !m.hist) { c.seenIds = c.seenIds || new Set(); if (c.seenIds.has(m.id)) return; c.seenIds.add(m.id); if (c.seenIds.size > 3000) c.seenIds = new Set([...c.seenIds].slice(-1500)); } // the same message can arrive twice (a reconnect, or a shared chat), but is shown and logged once
  const s = S.settings, hist = !!m.hist, hit = matchHighlight(m), watched = S._watch && S._watch.has(m.login) && m.login !== S.me.login;
  m.hl = !!hit;
  const wasKnown = c.users.has(m.login), fl = hist ? [] : userFlags(c, m, wasKnown); // badges on the right: Raid, Monitored, Restricted, Timed out recently
  const u = c.users.get(m.login) || { id: m.uid, name: m.name, msgs: [], first: m.ts }; u.id = u.id || m.uid; if (!hist) u.live = true;
  u.msgs.push({ text: m.text, ts: m.ts, id: m.id, emo: m.emotes, gifs: m.gifs }); if (u.msgs.length > (c.shown ? 40 : 15)) u.msgs.shift(); u.badges = m.badges;
  c.users.delete(m.login); c.users.set(m.login, u); while (c.users.size > 4000) c.users.delete(c.users.keys().next().value); // most recently active last; the quietest chatters drop out of big channels
  const toks = tokens(c, m.text, m.emotes, m.own, m.gifs); noteConvo(c, m); dashMsg(c, m);
  if (!hist) { c.stat.msgs++; c.stat.emotes += toks.filter((x) => x.t === 'e').length; c.times.push(m.ts); if (m.first) c.stat.firsts++; }
  if (!hist && spamFold(c, m, hit || watched)) return; // the same text again within seconds: '×2' on the first line instead of a new one
  const d = el('div', 'msg' + (hist ? ' hist' : '') + (hit ? ' hl' : '') + (watched ? ' watched' : '') + (m.action ? ' action' : '') + (m.first ? ' first' : ''));
  d.dataset.id = m.id || ''; d.dataset.user = m.login; d.dataset.uid = m.uid || ''; d.dataset.ts = m.ts;
  if (hist ? (c.altH = !c.altH) : (c.altL = !c.altL)) d.classList.add('alt'); // alternating backgrounds: fixed per line, so nothing flickers when old lines are trimmed
  const color = hit && hit.color ? hit.color : watched ? '#b08cff' : '';
  if (color) d.style.setProperty('--hc', color);
  const room = m.foreign ? roomOf(m.src) : null;
  const badges = !s.badges ? '' : m.badges.map((b) => { const u2 = (room && room.badges.get(b)) || (m.foreign ? S.globalBadges.get(b) || c.badges.get(b) : c.badges.get(b) || S.globalBadges.get(b)); return u2 ? `<img class="badge" src="${esc(u2)}" alt="">` : ''; }).join('');
  const av = s.sharedAvatars !== false && m.src && (m.foreign || (c.shared && c.shared.ids.length > 1)) ? roomAv(c, m.src) : '';
  const pk = Perks.parts(m.uid), firstSeen = !hist && pk && pk.ent && !S.perkSeen.has(m.uid), isSelf = m.uid === S.me.id, canMod = !isSelf && m.id && modKnown(c) && !(m.foreign ? /(^|,)(broadcaster|moderator|lead_moderator|staff|admin)\//.test(m.badges.join(',')) : /broadcaster\//.test(m.badges.join(','))) && s.modButtons !== 'off' && !s.notMod && !((s.chanStyle || {})[c.login] || {}).noMod;
  if (pk && pk.mbg) d.className += ' ' + pk.mbg; // a supporter's message background (switched off in Settings by body.mbg-off)
  const gutter = s.modButtons === 'always' && canMod, note = (s.notes || {})[m.login];
  // The hover toolbar is only built when the pointer reaches a message (see toolsHtml), so hundreds of messages do not each hold a dozen icons
  const tl = (s.modButtons === 'hover' && canMod ? 1 : 0) | (m.id && s.flyout ? 2 : 0) | (gutter ? 4 : 0); if (tl) d.dataset.tl = tl; // 4: the gutter shows four buttons, so Purge sits in the hover toolbar
  if (gutter) d.classList.add('hasmod'); else if (s.modButtons === 'always' && !s.notMod && modKnown(c) && isMod(c) && !((s.chanStyle || {})[c.login] || {}).noMod) d.classList.add('modpad'); // lines nobody can moderate (the streamer, other channels' mods) stay lined up with the rest
  if (firstSeen) S.perkSeen.add(m.uid);
  d.innerHTML = (m.reply ? `<div class="reply${m.reply.login ? ' conv' : ''}"${m.reply.login ? ` data-with="${esc(m.reply.login)}" data-tip="Open the conversation between these two"` : ''}>${ico('reply', 12)} <b>${esc(m.reply.name)}</b> ${esc(m.reply.body)}<span class="rcount"></span></div>` : '') +
    `<div class="line">${m.first ? '<span class="tag">First message</span>' : ''}${fl.map((f) => `<span class="tag ${f[1]}" data-tip="${esc(f[2])}"${f[3] ? ` style="${f[3]}"` : ''}>${f[0]}</span>`).join('')}${gutter ? `<span class="mod">${modBtns(true)}</span>` : ''}` +
    (s.timestamps ? `<span class="ts">${fmtTs(m.ts, s.tsFormat)}</span> ` : '') +
    av + badges + (pk ? pk.badge : '') + (pk ? pk.title : '') +
    `<span class="${pk ? pk.cls : 'nm'}" style="${pk ? pk.style : ''}"${pk && pk.tip ? ` data-tip="${esc(pk.tip)}" data-perk="1"` : ''}><span class="name${s.blNames !== false && (blHit(m.login) || blHit(m.name)) ? ' bl' : ''}" style="${nameStyle(m.color, m.login)}">${esc(m.name)}</span></span>` +
    (note ? `<span class="notei" data-tip="${esc(note.text.slice(0, 120))}">${ico('note', 12)}</span>` : '') +
    (watched ? `<span class="notei" data-tip="On your watch list">${ico('eye', 12)}</span>` : '') +
    `<span class="colon">${m.action ? '' : ':'}</span> <span class="mt">${bodyHtml(toks)}</span></div>` +
    '';
  if (firstSeen) Holiday.playEntrance(d, pk.ent); // everyone using YappyChat sees a supporter's entrance, not just the supporter
  if (m.id) c.msgs.set(m.id, d);
  if (m.reply && m.reply.login) convoBadge(c, d, m.login, m.reply.login);
  if (c.search) applySearch(c, d);
  acctBadge(c, m, d);
  if (hist) return push(c, d, true);
  if (m.paid) { d.classList.add('paid', 'pinned'); d.querySelector('.line').prepend(el('span', 'tag pintag', paidLabel(m.paid))); }
  push(c, d); spamNote(c, m, d); logLine(c, `${m.name}: ${m.text}`); watch(c, m); softStats(); if (m.paid) addPin(c, { key: 'paid:' + (m.id || m.ts), id: m.id, name: m.name, text: m.text, kind: 'paid', paid: m.paid, until: Date.now() + paidMs(m.paid.level) });
  if (!m.foreign) { queueLinks(c, m); checkBanList(c, m); }
  if (m.first && !m.own) { S.firsts.unshift({ c: c.login, uid: m.uid, login: m.login, name: m.name, text: m.text, ts: m.ts, id: m.id }); S.firsts.length = Math.min(S.firsts.length, 100); bump('firsts'); play('first', c.login); }
  if (watched) { S.mentions.unshift({ c: c.login, name: m.name, login: m.login, id: m.id, text: m.text, ts: m.ts, kind: 'watch' }); S.mentions.length = Math.min(S.mentions.length, 200); bump('mentions'); play('watch', c.login); flashMe(`${m.name} in ${c.name}`); }
  else if (hit) { S.mentions.unshift({ c: c.login, name: m.name, login: m.login, id: m.id, text: m.text, ts: m.ts, kind: 'hl', color: hit.color }); S.mentions.length = Math.min(S.mentions.length, 200); bump('mentions'); if (hit.snd !== false) play('highlight', c.login); flashMe(`Highlight in ${c.name}`); }
  if ((hit || watched) && c.login !== S.active) { c.unread = true; renderTabs(); }
  if (hit || watched) { try { mentionPill(c, d, m.name); } catch (e) {} }
}
function notice(c, text, kind = '') { push(c, el('div', 'notice ' + (kind === 'mod' ? 'modn' : kind), esc(text || ''))); } // 'mod' alone is the mod-button gutter class, so notices use 'modn'
function push(c, node, hist) {
  if (hist) { node.classList.add('old'); return c.list.insertBefore(node, c.histEnd); } // recent history goes above the "live from here" divider
  // While the pointer is over the chat nothing moves at all, wherever you are scrolled: new lines wait in a queue (nothing is trimmed from the top) and join the chat when the pointer leaves
  if (c.hover && !c.list.matches(':hover')) { c.hover = false; flushHeld(c); } // the pointer left without a mouseleave (the chat moved or was hidden): never stay paused
  if (c.hover && S.settings.pauseHover !== false) { (c.heldNodes = c.heldNodes || []).push(node); c.held = c.heldNodes.length; c.resume.textContent = `Paused · ${c.held} new`; c.resume.classList.remove('hidden'); return; }
  c.list.append(node);
  { let o = node, i = 0; while (o && i < 30) { o = o.previousElementSibling; i++; } if (o && o.classList) o.classList.add('old'); } // only the newest 30 messages keep animated perk effects
  trimChat(c);
  if (c.stick) stickScroll(c);
}
// Keeps a chat to its line limit. Scrolled up, the limit is much higher, and anything removed above is made up for in the scroll position, so what you are reading never moves.
function trimChat(c) {
  const cap = (c.shown ? 600 : 160) + (c.histN || 0) + (c.stick ? 0 : 2500);
  let over = c.list.children.length - cap; if (over <= 0) return;
  let lost = 0;
  while (over-- > 0) { let f = c.list.firstChild; if (f === c.histEnd) f = f.nextSibling; if (!f) break; if (!c.stick) lost += f.offsetHeight; if (f.dataset && f.dataset.id) c.msgs.delete(f.dataset.id); f.remove(); }
  if (lost) c.list.scrollTop -= lost;
}
// The lines that waited while the pointer was over the chat now join it
function flushHeld(c) {
  const q = c.heldNodes; c.heldNodes = null; c.held = 0; if (!q || !q.length) return;
  q.forEach((n) => c.list.append(n));
  { let o = q[q.length - 1], i = 0; while (o && i < 30) { o = o.previousElementSibling; i++; } if (o && o.classList) o.classList.add('old'); }
  trimChat(c);
  if (!c.stick) { c.resume.textContent = 'Jump to latest'; c.resume.classList.remove('hidden'); }
}
// One scroll per frame however many messages arrived, instead of a forced layout for every message
function stickScroll(c) { if (c.stickQ) return; c.stickQ = requestAnimationFrame(() => { c.stickQ = 0; if (c.stick) c.list.scrollTop = c.list.scrollHeight; }); }
function logLine(c, line) { if (S.settings.logging) cg.log(c.login, `[${new Date().toTimeString().slice(0, 8)}] ${line}`); }
// The message as plain text, with each emote as its name (so copying "gg PogChamp" keeps the emote, and pasting it into chat shows it again)
const msgText = (node) => { const b = node && node.querySelector('.mt'); if (!b) return ''; const c = b.cloneNode(true); c.querySelectorAll('img').forEach((i) => i.replaceWith(document.createTextNode(i.getAttribute('alt') || ''))); return c.textContent.replace(/\s+/g, ' ').trim(); };

/* ---------- Recent messages, so a chat is never empty when you open it ---------- */
async function loadHistory(c) {
  if (S.settings.history === false) return;
  const n = Math.max(10, Math.min(800, +S.settings.historyCount || 100));
  const r = await cg.http({ url: `https://recent-messages.robotty.de/api/v2/recent-messages/${encodeURIComponent(c.login)}?limit=${n}` });
  if (!S.chats.has(c.login)) return; const lines = (r.json && r.json.messages) || []; let shown = 0;
  for (const line of lines) { let p; try { p = parseIrc(line); } catch (e) { continue; } if (p.cmd === 'PRIVMSG') { try { onChat(c, p, true); shown++; } catch (e) { dbg('history line ' + e); } } }
  c.histN = shown; if (shown) c.histEnd.classList.remove('hidden'); if (c.stick) c.list.scrollTop = c.list.scrollHeight; try { if (c.login === S.active) showNewLine(c); } catch (e) {}
  dbg(`history ${c.login}: ${shown} messages (status ${r.status}${r.json && r.json.error ? ', ' + r.json.error : ''})`);
}

/* ---------- Search inside a chat (Ctrl+F) ---------- */
function applySearch(c, node) { const q = c.search; node.classList.toggle('nomatch', !!q && !(node.textContent.toLowerCase().includes(q))); }
function runSearch(c) {
  const q = (c.search || '').toLowerCase(); c.list.classList.toggle('searching', !!q); let n = 0;
  c.list.querySelectorAll('.msg').forEach((node) => { applySearch({ search: q }, node); if (q && !node.classList.contains('nomatch')) n++; });
  c.sbar.querySelector('.scount').textContent = q ? n + ' found' : ''; if (!q && c.stick) c.list.scrollTop = c.list.scrollHeight;
}
function toggleSearch(c) {
  c = c || cur(); if (!c) return; const open = c.sbar.classList.toggle('hidden') === false, i = c.sbar.querySelector('input');
  if (open) { i.focus(); i.select(); } else { c.search = ''; i.value = ''; runSearch(c); }
}

/* ---------- Emotes (7TV, BTTV, FFZ, Twitch) ---------- */
const twTemplate = (tpl, id) => (tpl || 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}').replace('{{id}}', id).replace('{{format}}', 'default').replace('{{theme_mode}}', 'dark').replace('{{scale}}', '2.0');
const twEmote = (id) => ({ url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`, fb: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/static/dark/2.0 https://static-cdn.jtvnw.net/emoticons/v1/${id}/2.0` });
// Animated emotes are redrawn on the graphics card all the time, in busy chats by the hundred, and that competes with the video. While a stream is open (the default) new messages use the still picture of each emote.
const stillOn = () => S.settings.emoteAnim === 'off' || (S.settings.emoteAnim !== 'on' && document.body.classList.contains('streamcalm'));
const stillUrl = (u) => String(u).replace(/(emoticons\/v2\/[^/]+)\/default\//, '$1/static/').replace(/(cdn\.(?:7tv\.app|betterttv\.net)\/emote\/[^/]+\/\dx)\.webp$/, '$1.png');
const provOn = (src) => { const k = { '7tv': 'emotes7tv', bttv: 'emotesBttv', ffz: 'emotesFfz' }[src]; return !k || S.settings[k] !== false; };
function addBadges(map, resp) { ((resp && resp.data) || []).forEach((set) => set.versions.forEach((v) => map.set(set.set_id + '/' + v.id, v.image_url_2x))); }
function addEmotes(map, bttv, ffz, stv) {
  const bl = Array.isArray(bttv) ? bttv : bttv ? [...(bttv.channelEmotes || []), ...(bttv.sharedEmotes || [])] : [];
  bl.forEach((e) => map.set(e.code, { src: 'bttv', url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`, fb: `https://cdn.betterttv.net/emote/${e.id}/1x.webp https://cdn.betterttv.net/emote/${e.id}/3x.webp https://cdn.betterttv.net/emote/${e.id}/2x.png https://cdn.betterttv.net/emote/${e.id}/2x` }));
  const abs = (u) => (u.startsWith('//') ? 'https:' + u : u);
  if (ffz && ffz.sets) Object.values(ffz.sets).forEach((set) => (set.emoticons || []).forEach((e) => map.set(e.name, { src: 'ffz', url: abs(e.urls['2'] || e.urls['1']), fb: abs(e.urls['1'] || e.urls['2']) })));
  const sl = stv ? stv.emotes || (stv.emote_set && stv.emote_set.emotes) || [] : [];
  sl.forEach((e) => map.set(e.name, { src: '7tv', url: `https://cdn.7tv.app/emote/${e.id}/2x.webp`, fb: `https://cdn.7tv.app/emote/${e.id}/1x.webp https://cdn.7tv.app/emote/${e.id}/3x.webp https://cdn.7tv.app/emote/${e.id}/4x.webp https://cdn.7tv.app/emote/${e.id}/2x.avif https://cdn.7tv.app/emote/${e.id}/2x.png`, zw: !!((e.flags & 1) || (e.data && (e.data.flags & 256))) }));
}
async function loadChannelAssets(c) {
  const [b, f, s, cb, te] = await Promise.all([getJson('https://api.betterttv.net/3/cached/users/twitch/' + c.id), getJson('https://api.frankerfacez.com/v1/room/id/' + c.id), getJson('https://7tv.io/v3/users/twitch/' + c.id), helix('chat/badges', { query: { broadcaster_id: c.id } }), helix('chat/emotes', { query: { broadcaster_id: c.id } })]);
  c.emotes.clear(); addEmotes(c.emotes, b, f, s); addBadges(c.badges, cb.json);
  // Use the image links Twitch itself returns for each emote (most reliable for subscriber emotes), with the CDN pattern as backup
  // The default image is animated for emotes that have an animation; Twitch's own static links are the backup
  const fromApi = (e) => { const im = e.images || {}, t = twEmote(e.id); return { url: t.url, fb: [im.url_2x, im.url_1x, im.url_4x, t.fb].filter(Boolean).join(' ') }; };
  c.twitch = ((te.json && te.json.data) || []).map((e) => ({ id: e.id, name: e.name, type: e.emote_type, ...fromApi(e) }));
  c.twitchMap.clear(); c.twitch.forEach((e) => c.twitchMap.set(e.name, { src: 'twitch', url: e.url, fb: e.fb, id: e.id }));
  c.assetsLoaded = true; c.assetsAt = Date.now(); if (c.onAssets) c.onAssets();
}
// Emotes follow the chat you are looking at: reload when it is opened, switched to, or has gone stale
async function loadUsable(c) {
  c.usable = new Set(); let after = '';
  for (let i = 0; i < 12; i++) { const r = await helix('chat/emotes/user', { query: after ? { user_id: S.me.id, broadcaster_id: c.id, after } : { user_id: S.me.id, broadcaster_id: c.id } }); if (!ok(r)) break; (r.json.data || []).forEach((e) => { c.usable.add(e.id); S.myMap.set(e.name, { src: 'twitch', ...twEmote(e.id) }); }); after = r.json.pagination && r.json.pagination.cursor; if (!after) break; }
  if (c.onAssets) c.onAssets();
}
function ensureAssets(c, force) { if (!c || c.loadingAssets) return; if (!force && c.assetsAt && Date.now() - c.assetsAt < 10 * 60000 && c.usable) return; c.loadingAssets = true; Promise.all([loadChannelAssets(c), loadUsable(c)]).catch((e) => dbg('assets ' + e)).finally(() => { c.loadingAssets = false; }); }
async function loadGlobals() {
  const [b, f, s, gb, ge] = await Promise.all([getJson('https://api.betterttv.net/3/cached/emotes/global'), getJson('https://api.frankerfacez.com/v1/set/global'), getJson('https://7tv.io/v3/emote-sets/global'), helix('chat/badges/global'), helix('chat/emotes/global')]);
  S.global.clear(); addEmotes(S.global, b, f, s); addBadges(S.globalBadges, gb.json);
  S.twitchGlobal = ((ge.json && ge.json.data) || []).map((e) => { const im = e.images || {}; const t = twEmote(e.id); return { id: e.id, name: e.name, url: t.url, fb: [im.url_2x, im.url_1x, t.fb].filter(Boolean).join(' ') }; });
  S.twitchGlobalMap.clear(); S.twitchGlobal.forEach((e) => S.twitchGlobalMap.set(e.name, { src: 'twitch', url: e.url, fb: e.fb }));
}
async function reloadEmotes() { S.imgFail = {}; await loadGlobals(); for (const c of S.chats.values()) await loadChannelAssets(c); toast('Emotes reloaded'); }
function tokens(c, text, emotesTag, own, gifsTag) {
  const cps = Array.from(text), ranges = [], out = []; let pos = 0;
  if (gifsTag && S.settings.gifs !== false) parseGifs(gifsTag).forEach((g) => ranges.push({ s: g.s, e: g.e, gif: g }));
  if (emotesTag) emotesTag.split('/').forEach((e) => { const [id, locs] = e.split(':'); if (locs) locs.split(',').forEach((l) => { const [s, en] = l.split('-').map(Number); ranges.push({ s, e: en, id }); }); });
  ranges.sort((a, b) => a.s - b.s);
  const find = (w) => { const em = c.emotes.get(w) || S.global.get(w); if (em && provOn(em.src)) return em; return own ? c.twitchMap.get(w) || S.myMap.get(w) || S.twitchGlobalMap.get(w) : null; };
  // Whitespace is kept as its own token, so spaces around words, links and emotes are never lost
  const pushText = (str) => str.split(/(\s+)/).forEach((w) => { if (!w) return; const em = /^\s+$/.test(w) ? null : find(w); out.push(em ? { t: 'e', url: em.url, fb: em.fb, name: w, zw: em.zw && S.settings.zeroWidth } : { t: 'w', w }); });
  ranges.forEach((r) => { if (r.s < pos) return; if (r.s > pos) pushText(cps.slice(pos, r.s).join('')); out.push(r.gif ? { t: 'g', url: r.gif.url, id: r.gif.id, alt: cps.slice(r.s, r.e + 1).join('') } : { t: 'e', ...twEmote(r.id), name: cps.slice(r.s, r.e + 1).join('') }); pos = r.e + 1; });
  if (pos < cps.length) pushText(cps.slice(pos).join(''));
  return out;
}
const LINK_RX = /^((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tv|gg|io|co|me|app|dev|ly|xyz|gl|be|link)(?:\/[^\s]*)?)$/i;
function bodyHtml(toks) {
  return toks.map((t) => {
    if (t.t === 'g') return gifHtml(t);
    if (t.t === 'e') return `<img class="emote${t.zw ? ' zw' : ''}" src="${esc(stillOn() ? stillUrl(t.url) : t.url)}" data-fb="${esc(t.fb || '')}" alt="${esc(t.name)}" data-tip="${esc(t.name)}" referrerpolicy="no-referrer">`;
    const w = t.w, tail = (w.match(/[.,!?;:)\]]+$/) || [''])[0], core = tail ? w.slice(0, -tail.length) : w;
    if (blHit(w)) return `<span class="bl" tabindex="0" data-tip="Hidden by your blacklist. Hover to reveal">${esc(w)}</span>`;
    if (core.length > 3 && LINK_RX.test(core)) { const href = /^https?:/i.test(core) ? core : 'https://' + core; return `<a class="lnk" href="#" data-url="${esc(href)}" data-tip="${esc(href)}">${esc(core)}</a>${esc(tail)}`; }
    if (/^@\w+/.test(w)) return `<span class="at" data-user="${esc(w.replace(/^@/, '').replace(/\W.*$/, '').toLowerCase())}">${esc(w)}</span>`;
    return esc(w);
  }).join('');
}
// If an emote image fails, walk through its backup URLs, then fall back to the emote's name
document.addEventListener('error', (e) => {
  const i = e.target; if (!i || i.tagName !== 'IMG' || !i.classList.contains('emote')) return;
  const left = (i.dataset.fb || '').split(' ').filter(Boolean);
  try { const h = new URL(i.src).host; S.imgFail[h] = (S.imgFail[h] || 0) + 1; } catch (x) {}
  if (left.length) { i.dataset.fb = left.slice(1).join(' '); i.src = left[0]; } else i.replaceWith(el('span', 'emote-missing', esc(i.alt)));
}, true);

/* ---------- Moderation actions ---------- */
function markMine(c, login) { c.mine = c.mine || new Map(); c.mine.set(String(login).toLowerCase(), Date.now()); }
async function del(c, msgId, text, login) {
  c.mineDel = Date.now();
  const r = await helix('moderation/chat', { method: 'DELETE', query: mq(c, { message_id: msgId }) });
  if (!ok(r)) return modFail(c, r, 'delete messages', () => del(c, msgId, text, login));
  c.stat.deletes++; renderStats(); logLine(c, `* ${S.me.login} deleted a message`); logAct(c, 'delete', `You deleted a message${login ? ' from ' + login : ''}`, undefined, login, { msg: text, src: 'deleted' }); learn(c, text); actionBurst(c);
}
async function ban(c, uid, login, duration, reason, text, quiet) {
  const data = { user_id: uid }; if (duration) data.duration = duration; if (reason) data.reason = reason;
  const r = await helix('moderation/bans', { method: 'POST', query: mq(c), body: { data } });
  if (!ok(r)) { modFail(c, r, duration ? 'time out' : 'ban', () => ban(c, uid, login, duration, reason, text, quiet)); return false; }
  markMine(c, login); const key = duration ? 'timeouts' : 'bans'; c.stat[key]++; renderStats(); learn(c, text); actionBurst(c);
  const what = duration ? `timed out ${login} for ${fmtDur(duration)}` : `banned ${login}`;
  logLine(c, `* ${S.me.login} ${what}${reason ? ' (' + reason + ')' : ''}`); logAct(c, duration ? 'timeout' : 'ban', `You ${what}${reason ? ' (' + reason + ')' : ''}`, undefined, login);
  if (!duration && !reason && S.settings.banNote !== false && !quiet) askBanNote(c, login);
  if (quiet) return true;
  const guest = c.sharedUsers && c.sharedUsers.has(String(login).toLowerCase()) ? '. They came in through shared chat, so Twitch only applies this while the shared chat lasts.' : '';
  toast((duration ? `Timed out ${login} for ${fmtDur(duration)}` : `Banned ${login}`) + guest, { ms: guest ? 8000 : 6000, action: { label: 'Undo', fn: async () => { if (await unban(c, uid, login)) { c.stat[key]--; renderStats(); } } } }); return true;
}
async function unban(c, uid, login, quiet) {
  const r = await helix('moderation/bans', { method: 'DELETE', query: mq(c, { user_id: uid }) });
  if (!ok(r)) { modFail(c, r, 'unban', () => unban(c, uid, login, quiet)); return false; }
  if (!quiet) toast(`Unbanned ${login}`); logLine(c, `* ${S.me.login} unbanned ${login}`); logAct(c, 'unban', `You unbanned ${login}`, undefined, login); return true;
}
async function warnUser(c, uid, login, reason) {
  const w = await helix('moderation/warnings', { method: 'POST', query: mq(c), body: { data: { user_id: uid, reason } } });
  if (!ok(w)) return modFail(c, w, 'warn', () => warnUser(c, uid, login, reason));
  c.stat.warns++; renderStats(); toast(`Warned ${login}`); logLine(c, `* ${S.me.login} warned ${login}: ${reason}`); logAct(c, 'warn', `You warned ${login}: ${reason}`, undefined, login);
}
async function clearChat(c) { const r = await helix('moderation/chat', { method: 'DELETE', query: mq(c) }); if (!ok(r)) err(apiErr(r)); else logAct(c, 'clear', 'You cleared chat'); }
async function setMode(c, body) { const r = await helix('chat/settings', { method: 'PATCH', query: mq(c), body }); if (!ok(r)) err(apiErr(r)); else logAct(c, 'mode', 'You changed chat settings: ' + Object.keys(body).join(', ')); }
async function setShield(c, on) { const r = await helix('moderation/shield_mode', { method: 'PUT', query: mq(c), body: { is_active: on } }); if (!ok(r)) return err(apiErr(r)); c.shield = on; renderStats(); logAct(c, 'mode', 'Shield Mode ' + (on ? 'on' : 'off')); }

const WARN_PRESETS = ['Please follow the chat rules.', 'Stop spamming, please.', 'Keep it respectful.', 'No self-promotion, please.'];
const savedWarns = () => (Array.isArray(S.settings.warnSaved) ? S.settings.warnSaved : []).filter((x) => typeof x === 'string' && x.trim());
function askWarn(c, uid, login, anchor) {
  const presets = [...savedWarns(), ...WARN_PRESETS.filter((p) => !savedWarns().includes(p))].slice(0, 12);
  const n = el('div', 'stack', `<h3>Warn ${esc(login)}</h3><div class="btnrow">${presets.map((p, i) => `<button class="btn sm" data-p="${i}">${esc(p.length > 40 ? p.slice(0, 39) + '…' : p)}</button>`).join('')}</div><input id="wr" placeholder="Reason (they will see this)" maxlength="500"><button class="btn primary" id="wr-go">Send warning</button>`);
  popover(n, anchor); const inp = $('#wr', n); inp.focus();
  const go = () => { const r = inp.value.trim(); if (!r) return err('Add a reason first. Twitch requires one for warnings.'); closePop(); warnUser(c, uid, login, r); };
  n.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { inp.value = presets[+b.dataset.p]; inp.focus(); }));
  $('#wr-go', n).onclick = go; inp.onkeydown = (e) => e.key === 'Enter' && go();
}

// Right-click the timeout button: pick a length (and a saved reason) instead of the default
function pickTimeout(c, uid, login, text, anchor) {
  const reasons = savedWarns();
  const n = el('div', 'stack topick', `<h3>${ico('clock', 16)} Time out ${esc(login)}</h3><div class="btnrow">${toLens().map((s) => `<button class="btn sm" data-d="${s}">${fmtDur(s)}</button>`).join('')}</div>` +
    `<input id="tp-r" placeholder="Reason (optional)" maxlength="500">` + (reasons.length ? `<div class="warnchips">${reasons.map((w, i) => `<span class="wchip"><button data-wi="${i}">${esc(w.length > 34 ? w.slice(0, 33) + '…' : w)}</button></span>`).join('')}</div>` : ''));
  popover(n, anchor); const r = $('#tp-r', n);
  n.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.wi !== undefined) { r.value = reasons[+b.dataset.wi] || ''; return r.focus(); } if (b.dataset.d) { closePop(); ban(c, uid, login, +b.dataset.d, r.value.trim(), text); } };
}
document.addEventListener('contextmenu', (e) => {
  const b = e.target.closest && e.target.closest('.msg button[data-a=to]'); if (!b) return; const msg = b.closest('.msg'), ch = msg.closest('.chat'), c = ch && S.chats.get(ch.dataset.login); if (!c) return;
  e.preventDefault(); pickTimeout(c, msg.dataset.uid, msg.dataset.user, msgText(msg), b);
}, true);

/* ---------- Clicks and hover tools inside a chat ---------- */
function doMsgAction(c, msg, a, anchor) {
  const id = msg.dataset.id, login = msg.dataset.user, uid = msg.dataset.uid, text = msgText(msg);
  if (a === 'del') del(c, id, text, login);
  else if (a === 'purge') ban(c, uid, login, 1, 'Purge', text);
  else if (a === 'to') ban(c, uid, login, S.settings.timeoutDefault, '', text);
  else if (a === 'tolen') pickTimeout(c, uid, login, text, anchor || msg);
  else if (a === 'ban') { if (!S.settings.confirmBans || confirm(`Ban ${login}?`)) ban(c, uid, login, 0, '', text); }
  else if (a === 'warn') askWarn(c, uid, login, anchor || msg);
  else if (a === 'copy') { navigator.clipboard.writeText(text).then(() => toast('Message copied', { ms: 1800 })); }
  else if (a === 'reply') setReply(c, { id, name: msg.querySelector('.name').textContent, text, login });
  else if (a === 'pin') pinMessage(c, id);
  else if (a === 'macro') saveMacroFrom(text);
}
function onListClick(c, e) {
  if (onMediaClick(c, e)) return;
  if (e.shiftKey && bulkClick(c, e)) return; // Shift+click picks several messages
  const xn = e.target.closest('.xn'); if (xn) return openFold(c, xn.closest('.msg'), xn);
  const am = e.target.closest('.am'); if (am) return amClick(c, am, e);
  const cv = e.target.closest('.reply.conv'); if (cv) { const mm = cv.closest('.msg'); return openConvo(c, mm.dataset.user, cv.dataset.with); }
  const lnk = e.target.closest('.lnk'); if (lnk) { e.preventDefault(); return openLink(lnk.dataset.url); }
  const pk = e.target.closest('.pb,.ttl,.nm[data-perk]'); if (pk && !e.target.closest('.name')) return Perks.openShop();
  const nl = e.target.closest('.nlk'); if (nl) return openCard(c, nl.dataset.user, nl); // a name in a 'was banned / timed out' line
  const msg = e.target.closest('.msg'); if (!msg) return;
  const b = e.target.closest('button[data-a]');
  if (b) return doMsgAction(c, msg, b.dataset.a, b);
  const at = e.target.closest('.at'); if (at) return openCard(c, at.dataset.user, at);
  if (e.target.closest('.name')) openCard(c, msg.dataset.user, e.target.closest('.name'));
}
// Pinning has no documented API, so this sends Twitch's own /pin chat command and shows whatever Twitch answers
document.addEventListener('mouseover', (e) => { const m = e.target.closest && e.target.closest('.msg'); S.hoverMsg = m || null; });
// Keyboard moderation (no mouse needed): Alt+Up picks the newest message in the chat you are in, Alt+Up / Alt+Down move between messages,
// then D delete, T time out, B ban, W warn, R reply, Enter opens the person's card, Escape goes back to typing. A screen reader hears each message.
const kbLive = (() => { const n = el('div', 'sr-only'); n.setAttribute('aria-live', 'polite'); n.setAttribute('role', 'status'); document.body.append(n); return n; })();
function kbSelect(m) {
  if (S.kbMsg) S.kbMsg.classList.remove('kbsel'); S.kbMsg = m || null; if (!m) return;
  m.classList.add('kbsel'); m.scrollIntoView({ block: 'nearest' });
  const c = S.chats.get(m.closest('.chat').dataset.login), mod = c && modKnown(c) && m.dataset.uid !== (S.me && S.me.id);
  kbLive.textContent = (m.querySelector('.name') ? m.querySelector('.name').textContent + ': ' : '') + msgText(m) + '. ' + (mod ? 'D delete, T time out, B ban, W warn, ' : '') + 'R reply, Enter for their card, Escape to go back.';
}
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const c = cur(); if (!c) return; const all = [...c.list.querySelectorAll('.msg[data-id]')]; if (!all.length) return;
    e.preventDefault(); const i = S.kbMsg && S.kbMsg.isConnected ? all.indexOf(S.kbMsg) : -1;
    const next = i < 0 ? all[all.length - 1] : all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))];
    if (!c.list.hasAttribute('tabindex')) { c.list.tabIndex = -1; c.list.setAttribute('role', 'log'); c.list.setAttribute('aria-label', 'Chat in ' + c.login); }
    c.list.focus({ preventScroll: true }); kbSelect(next); return;
  }
  const tg = (document.activeElement || {}).tagName; if (/INPUT|TEXTAREA|SELECT/.test(tg) || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = S.kbMsg && S.kbMsg.isConnected ? S.kbMsg : S.settings.hoverKeys ? S.hoverMsg : null; if (!target) return;
  const c = S.chats.get(target.closest('.chat').dataset.login); if (!c) return;
  if (target === S.kbMsg) {
    if (e.key === 'Escape') { e.preventDefault(); kbSelect(null); return inp().focus(); }
    if (e.key === 'Enter') { e.preventDefault(); return openCard(c, target.dataset.user, target.querySelector('.name') || target); }
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); doMsgAction(c, target, 'reply'); kbSelect(null); return inp().focus(); }
  }
  const a = e.shiftKey && e.key.toLowerCase() === 't' ? 'tolen' : e.shiftKey ? null : { d: 'del', p: 'purge', t: 'to', b: 'ban', w: 'warn' }[e.key.toLowerCase()]; if (!a) return;
  if (!modKnown(c) || !target.dataset.id || target.dataset.uid === S.me.id) return;
  e.preventDefault(); doMsgAction(c, target, a, a === 'tolen' ? target.querySelector('.name') || target : undefined);
});

/* ---------- Composer, replies and commands ---------- */
// The input you type in: the bar at the bottom, or the box inside the chat when Settings > Chat > "Message box in every chat" is on
// The box you are typing in: the last one you used (the bar at the bottom, or the active chat's own box), else the chat's own box when those are switched on
let lastIn = null;
const inp = () => { const c = cur(); if (lastIn && lastIn.isConnected && (lastIn.id === 'input' || (c && c.pin === lastIn))) return lastIn; return (S.settings.paneInput && c && c.pin) || $('#input'); };
function setReply(c, r) { S.replyTo = r ? { ...r, c: c && c.login } : null; $('#replybar').classList.add('hidden'); S.chats.forEach((x) => x.pbar && x.pbar.classList.add('hidden')); if (!r || !c) return; const bar = S.settings.paneInput && c.pbar ? c.pbar : $('#replybar'); bar.classList.remove('hidden'); bar.innerHTML = `${ico('reply', 14)} <span>Replying to <b>${esc(r.name)}</b>: ${esc(r.text.slice(0, 90))}</span><button class="icon" id="reply-x" data-tip="Cancel reply">${ico('x', 14)}</button>`; $('#reply-x', bar).onclick = () => setReply(c, null); $('#input').focus(); }
// Up / Down in the message box walks back through the last 10 things you sent. Kept in memory for this session only: never saved to disk or settings.
S.sent = []; let sentPos = -1, sentDraft = '';
function rememberSent(text) { if (S.sent[S.sent.length - 1] !== text) S.sent.push(text); if (S.sent.length > 10) S.sent.shift(); sentPos = -1; sentDraft = ''; }
function sentNav(dir) {
  const el0 = inp(); if (!S.sent.length) return false;
  if (sentPos === -1) { if (dir > 0 || (el0.value && el0.selectionStart > 0)) return false; sentDraft = el0.value; sentPos = S.sent.length - 1; }
  else { sentPos += dir; if (sentPos < 0) sentPos = 0; if (sentPos >= S.sent.length) { sentPos = -1; el0.value = sentDraft; el0.setSelectionRange(el0.value.length, el0.value.length); return true; } }
  el0.value = S.sent[sentPos]; el0.setSelectionRange(el0.value.length, el0.value.length); return true;
}
async function send() {
  const c = cur(), box0 = inp(), text = box0.value.trim(); if (!c || !text) return; box0.value = ''; rememberSent(text);
  if (text[0] === '/' && !/^\/me\s/i.test(text)) return command(c, text);
  const rp = S.replyTo && S.replyTo.c === c.login ? S.replyTo : null;
  if (postChat(c, text, rp) && rp) setReply(c, null);
}
// Sends a chat message (optionally as a reply) and shows it straight away
function postChat(c, text, rp) {
  if (!S.ws || S.ws.readyState !== 1) { err('Not connected to chat yet.'); return false; }
  S.ws.send((rp ? `@reply-parent-msg-id=${rp.id} ` : '') + `PRIVMSG #${c.login} :${text}`);
  const me = /^\/me\s/i.test(text), t = c.selfTags || {};
  addMessage(c, { id: '', uid: S.me.id, login: S.me.login, name: t['display-name'] || S.me.login, color: t.color, badges: (t.badges || '').split(',').filter(Boolean), text: me ? text.slice(4) : text, action: me, ts: Date.now(), own: true, reply: rp ? { name: rp.name, body: rp.text, login: rp.login || '' } : null });
  return true;
}
/* ---------- Emote and @name autocomplete ---------- */
function updateAC(force) {
  const i0 = inp(), c = cur(), box = $('#ac'), pre = i0.value.slice(0, i0.selectionStart), m = pre.match(/(\S+)$/);
  if (c && m && pre[0] === '/' && !/\s/.test(pre)) { // typing a command: suggest the ones that fit
    const q = pre.slice(1).toLowerCase(), its = (typeof cmdList === 'function' ? cmdList(c) : []).filter((x) => x[0].startsWith(q)).slice(0, 10).map((x) => ({ text: '/' + x[0], label: x[1], sub: x[2].slice(0, 60) }));
    if (!its.length || (its.length === 1 && its[0].text === pre)) { S.ac = null; return box.classList.add('hidden'); } S.ac = { items: its, sel: 0, len: pre.length }; return drawAC();
  }
  if (!c || !m || m[1].length < (force === true ? 1 : 2)) { S.ac = null; return box.classList.add('hidden'); }
  const w = m[1], lw = w.toLowerCase(); let items = [];
  if (w[0] === ';') items = (S.settings.macros || []).filter((m) => m.n && m.t && (`;${m.n}`).toLowerCase().includes(lw)).map((m) => ({ text: m.t, label: ';' + m.n, sub: m.t.slice(0, 50) }));
  else if (w[0] === '@') items = [...c.users.values()].map((u) => ({ text: '@' + u.name })).filter((x) => x.text.toLowerCase().startsWith(lw));
  else {
    const seen = new Set();
    // Includes the Twitch emotes you can actually use anywhere (subscriber emotes from other channels too), but not this channel's locked ones
    const usableHere = (v) => v.src !== 'twitch' || !v.id || !c.usable || c.usable.has(v.id) || S.myIds.has(v.id);
    // Chatter names first (people who have spoken here, most recent first), then emotes; picking a name writes it as an @mention
    const lastTs = (u) => (u.msgs && u.msgs.length ? u.msgs[u.msgs.length - 1].ts : 0);
    [...c.users.entries()].filter(([l, u]) => l.startsWith(lw) || (u.name || '').toLowerCase().startsWith(lw)).sort((a, b) => lastTs(b[1]) - lastTs(a[1])).slice(0, 4).forEach(([l, u]) => items.push({ text: '@' + (u.name || l), label: u.name || l, sub: 'chatter' }));
    const nNames = items.length, emo = [];
    if (S.settings.acEmotes !== false || force === true) [c.emotes, S.global, c.twitchMap, S.twitchGlobalMap, S.myMap].filter(Boolean).forEach((mp) => mp.forEach((v, k) => { if (!seen.has(k) && provOn(v.src) && usableHere(v) && k.toLowerCase().includes(lw)) { seen.add(k); emo.push({ text: k, url: v.url, fb: v.fb }); } }));
    emo.sort((a, b) => b.text.toLowerCase().startsWith(lw) - a.text.toLowerCase().startsWith(lw) || a.text.length - b.text.length);
    items = items.concat(emo.slice(0, 10 - nNames));
  }
  items = items.slice(0, 10);
  if (!items.length) { S.ac = null; return box.classList.add('hidden'); }
  S.ac = { items, sel: 0, len: w.length }; drawAC();
}
function drawAC() { const box = $('#ac'), r = inp().getBoundingClientRect(); box.style.left = Math.max(8, Math.min(innerWidth - 250, r.left)) + 'px'; box.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px'; box.classList.remove('hidden'); box.innerHTML = S.ac.items.map((x, i) => `<div class="aci${i === S.ac.sel ? ' on' : ''}" data-i="${i}">${x.url ? `<img class="emote" src="${esc(x.url)}" data-fb="${esc(x.fb || '')}" alt="${esc(x.text)}">` : ''}<span>${esc(x.label || x.text)}</span>${x.sub ? `<span class="faint"> ${esc(x.sub)}</span>` : ''}</div>`).join(''); }
function acceptAC(i) {
  const i0 = inp(), it = S.ac.items[i], pos = i0.selectionStart;
  i0.value = i0.value.slice(0, pos - S.ac.len) + it.text + ' ' + i0.value.slice(pos);
  const np = pos - S.ac.len + it.text.length + 1; i0.setSelectionRange(np, np); S.ac = null; $('#ac').classList.add('hidden'); i0.focus();
}

/* ---------- Shield panel ---------- */
async function openGuard(c, anchor) {
  const m = c.modes, fo = +m['followers-only'] >= 0 ? m['followers-only'] : 'off';
  const opt = (arr, val) => arr.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('');
  const n = el('div', 'stack', `<h3>Shield · ${esc(c.name)}</h3>` +
    `<div class="row">Slow mode<select id="g-slow">${opt([[0, 'Off'], [3, '3s'], [5, '5s'], [10, '10s'], [30, '30s'], [60, '1m'], [120, '2m']], +m.slow || 0)}</select></div>` +
    `<div class="row">Followers-only<select id="g-fol">${opt([['off', 'Off'], [0, 'Any follower'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week'], [43200, '1 month']], fo)}</select></div>` +
    `<div class="row">Subscribers-only${sw('g-sub', m['subs-only'] === '1')}</div><div class="row">Emote-only${sw('g-emo', m['emote-only'] === '1')}</div>` +
    `<div class="row">Unique chat${sw('g-r9k', m.r9k === '1')}</div><div class="row">Shield Mode${sw('g-shield', c.shield)}</div><button id="g-clear" class="btn danger">Clear chat</button>`);
  if (popover(n, anchor, { toggle: true }) === false) return;
  $('#g-slow', n).onchange = (e) => setMode(c, { slow_mode: +e.target.value > 0, ...(+e.target.value > 0 && { slow_mode_wait_time: +e.target.value }) });
  $('#g-fol', n).onchange = (e) => setMode(c, e.target.value === 'off' ? { follower_mode: false } : { follower_mode: true, follower_mode_duration: +e.target.value });
  $('#g-sub', n).onchange = (e) => setMode(c, { subscriber_mode: e.target.checked });
  $('#g-emo', n).onchange = (e) => setMode(c, { emote_mode: e.target.checked });
  $('#g-r9k', n).onchange = (e) => setMode(c, { unique_chat_mode: e.target.checked });
  $('#g-shield', n).onchange = (e) => setShield(c, e.target.checked);
  const cl = $('#g-clear', n); let armed = false;
  cl.onclick = () => { if (!armed) { armed = true; cl.textContent = 'Click again to clear chat'; } else { closePop(); clearChat(c); } };
  const r = await helix('moderation/shield_mode', { query: mq(c) });
  if (ok(r) && r.json.data[0]) { c.shield = r.json.data[0].is_active; const s = $('#g-shield', n); if (s) s.checked = c.shield; renderStats(); }
}

/* ---------- User card (with private mod notes and watch list) ---------- */
// What this person said in this channel before now: YappyChat's saved chat logs (when logging is on) plus the recent messages Twitch's chat history service holds
async function userHistory(c, login, u, card) {
  const box = $('#uc-hist', card), ymd = (ms) => { const d = new Date(ms), z = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  // The same message can come from this session, the saved logs and Twitch's history service, with times a second or two apart: match them by text and time so each shows once
  // A row remembers which sources have it, so a message that all three have still shows once. Lines with no text (an empty log line, a message that was only removed) are left out.
  const rows = [], add = (src, d, t, text, ms, i, emo, gifs) => {
    if (!String(text == null ? '' : text).replace(/[\s\u200b\u3164\ufe0f]+/g, '')) return;
    const near = rows.find((r) => r.text === text && Math.abs(r.ms - ms) <= 8000 && !r.srcs.has(src));
    if (near) { near.srcs.add(src); if (near.i == null && i != null) { near.i = i; } if (!near.emo && emo) near.emo = emo; if (!near.gifs && gifs) near.gifs = gifs; return; }
    rows.push({ srcs: new Set([src]), src, d, t, text, ms, i, emo, gifs });
  };
  (u.msgs || []).forEach((m, i) => add('live', ymd(m.ts), new Date(m.ts).toTimeString().slice(0, 8), m.text, m.ts, i, m.emo, m.gifs));
  try { const f = (await (cg.userLogs && cg.userLogs(c.login, [login, u.name]))) || []; f.forEach((x) => add('log', x.d, x.t, x.text, Date.parse(x.d + 'T' + x.t) || 0)); } catch (e) {}
  try {
    const r = await cg.http({ url: `https://recent-messages.robotty.de/api/v2/recent-messages/${encodeURIComponent(c.login)}?limit=800` });
    ((r.json && r.json.messages) || []).forEach((line) => { try { const p = parseIrc(line); if (p.cmd !== 'PRIVMSG' || (p.prefix.split('!')[0] || '').toLowerCase() !== login) return; const ms = +p.tags['tmi-sent-ts'] || 0, am = (p.trailing || '').match(/^\x01ACTION (.*)\x01$/); add('hist', ymd(ms), new Date(ms).toTimeString().slice(0, 8), am ? am[1] : p.trailing || '', ms, null, p.tags.emotes, p.tags.gifs); } catch (e) {} });
  } catch (e) {}
  if (!card.isConnected) return;
  rows.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t)); // oldest first, newest at the bottom, like Twitch
  const total = rows.length, shown = rows.slice(-400); let last = '', html = '';
  const nm = esc(u.name || login), today = ymd(Date.now());
  shown.forEach((r) => { if (r.d !== last) { last = r.d; html += `<div class="uc-day"><span>${r.d === today ? 'Today' : new Date(r.d + 'T00:00').toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>`; } html += `<div class="uc-m"${r.i != null ? ` data-i="${r.i}"` : ''}><span class="t">${esc(r.t.slice(0, 5))}</span><b class="uc-who">${nm}:</b><span class="tx">${bodyHtml(tokens(c, r.text, r.emo, true, r.gifs))}</span>${r.i != null && u.msgs[r.i].id && (isMod(c) || isOwner(c)) ? `<button class="x" data-tip="Delete this message">${ico('trash', 13)}</button>` : ''}</div>`; });
  $('#ut-m', card).textContent = total >= 400 ? '400+' : String(total);
  box.innerHTML = html || `<div class="faint">No messages found for ${nm} yet. YappyChat builds this from the chat it has seen (saved logs when Save chat logs is on) plus Twitch's recent-messages service, so it can't show everything Twitch itself holds.</div>`;
  box.scrollTop = box.scrollHeight;
}
const ago = (d) => { const days = Math.floor((Date.now() - new Date(d)) / 864e5), y = Math.floor(days / 365), m = Math.floor((days % 365) / 30); return y ? `${y}y ${m}mo` : m ? `${m}mo` : `${days}d`; };
const ib = (id, i, tip, cls = '') => `<button class="ibtn ${cls}" id="${id}" data-tip="${tip}" aria-label="${tip}">${ico(i, 16)}</button>`;
async function openCard(c, login, anchor, host) { // host: show the card inside that element (the Users panel) instead of a popover
  login = login.toLowerCase(); const u = c.users.get(login) || { name: login, msgs: [] };
  const watched = (S.settings.watch || []).includes(login), note = (S.settings.notes || {})[login], onList = (S.settings.banList || []).some((b) => b.login === login);
  const n = el('div', 'ucard', `<div class="uc-head"><img class="uc-av" alt=""><div class="grow"><div class="uc-name">${esc(u.name)}</div><div class="uc-sub" id="uc-sub">Loading…</div></div>${ib('uc-watch', 'eye', watched ? 'Remove from watch list' : 'Add to watch list', watched ? 'on' : '')}${ib('prof', 'link', 'Open Twitch profile')}${ib('uc-at', 'reply', 'Mention in chat')}${login === S.me.login ? '' : ib('uc-wh', 'whisper', 'Whisper')}</div><div class="uc-bio" id="uc-bio"></div>` +
    `<div class="reasonrow"><input id="reason" placeholder="Reason (needed to warn)" data-tip="Needed for warnings, optional for timeouts and bans" maxlength="500">${ib('uc-wsave', 'star', 'Save this reason to use again')}<button class="btn sm" id="uc-warn" data-tip="Send a warning with this reason">${ico('warn', 14)} Warn</button></div><div class="warnchips" id="uc-wchips"></div><div class="sec">Timeout</div><div class="btnrow"><button class="btn sm" data-d="1" data-tip="Purge: clears their messages with a 1-second timeout">${ico('eraser', 14)} Purge</button>${toLens().map((s) => `<button class="btn sm" data-d="${s}">${fmtDur(s)}</button>`).join('')}</div>` +
    `<div class="btnrow"><button class="btn sm danger" data-d="0">${ico('ban', 14)} Ban</button><button class="btn sm" id="unb">Unban</button>${ib('uc-bl', 'list', onList ? 'Remove from your shared ban list' : 'Add to your shared ban list', onList ? 'on' : '')}<button class="btn sm" id="uc-all" data-tip="Ban in every channel where you are a moderator">Ban everywhere</button></div>` +
    `<div class="uc-tabs" role="tablist"><button class="on" role="tab" data-ut="m"><b id="ut-m">…</b><span>Messages</span></button><button role="tab" data-ut="a"><b id="ut-a">0/0/0</b><span>Mod actions</span></button><button role="tab" data-ut="n"><b id="ut-n">${note && note.text ? 1 : 0}</b><span>Notes</span></button></div>` +
    `<div class="uc-pane" data-p="m"><input class="uc-find" id="uc-find" type="search" placeholder="Search their messages" spellcheck="false" autocomplete="off"><div class="uc-msgs tall" id="uc-hist"><div class="faint">Loading…</div></div></div>` +
    `<div class="uc-pane hidden" data-p="a"><div class="uc-msgs tall" id="uc-acts"></div><div class="faint">Bans / timeouts / warnings in ${esc(c.name)}, as YappyChat saw them while it was open. Twitch does not give apps the full list.</div></div>` +
    `<div class="uc-pane hidden" data-p="n"><textarea id="uc-note" class="sens-i" rows="5" placeholder="Add a note about ${esc(u.name)}">${esc(note ? note.text : '')}</textarea><div class="faint">Only you can see this. It is saved on this computer. Twitch's own mod comments are not available to apps.</div></div>`);
  if (host) { host.innerHTML = ''; host.append(n); } else popover(n, anchor, { vcenter: true });
  // Mod actions in this channel (kept on this computer), and the counts shown on the tab
  const evs = userEvents(login).filter((x) => !x.c || x.c === c.login), tm = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), cnt = (k) => evs.filter((x) => x.kind === k).length;
  $('#ut-a', n).textContent = `${cnt('ban')}/${cnt('timeout')}/${cnt('warn')}`;
  $('#uc-acts', n).innerHTML = evs.map((x) => `<div class="uc-m uc-e k-${esc(x.kind)}"><span class="t">${tm(x.ts)}</span><span class="tx">${ico(KIND_ICON[x.kind] || 'file', 12)} ${esc(x.text)}</span></div>`).join('') || '<span class="uc-sub">No moderation actions recorded for this person here.</span>';
  { const f = $('#uc-find', n); f.oninput = () => { const q = f.value.trim().toLowerCase(), box = $('#uc-hist', n); let shown = 0; box.querySelectorAll('.uc-m').forEach((r) => { const hit = !q || r.textContent.toLowerCase().includes(q); r.classList.toggle('hidden', !hit); if (hit) shown++; }); let nf = $('.uc-nf', box); if (q && !shown) { if (!nf) box.append(el('div', 'faint uc-nf', 'No messages with that word.')); } else if (nf) nf.remove(); }; }
  userHistory(c, login, u, n); // older messages from the saved logs and Twitch's recent messages, so the card shows more than this session
  let uid = u.id, t0 = 0;
  $('#uc-note', n).oninput = (e) => { clearTimeout(t0); t0 = setTimeout(() => { const notes = { ...(S.settings.notes || {}) }; const v = e.target.value.trim(); $('#ut-n', n).textContent = v ? '1' : '0'; if (v) notes[login] = { text: v, ts: Date.now() }; else delete notes[login]; saveSettings({ notes }); }, 400); };
  const r = await helix('users', { query: { login } }), info = r.json && r.json.data && r.json.data[0];
  if (info) {
    uid = info.id; $('.uc-av', n).src = info.profile_image_url; $('.uc-name', n).textContent = info.display_name; $('#uc-bio', n).textContent = info.description || '';
    let sub = 'Account created ' + new Date(info.created_at).toLocaleDateString() + ' (' + ago(info.created_at) + ')';
    const f = modKnown(c) ? await helix('channels/followers', { query: { broadcaster_id: c.id, user_id: uid } }) : { status: 0 };
    if (ok(f) && f.json) sub += f.json.data && f.json.data[0] ? ' · Following for ' + ago(f.json.data[0].followed_at) : ' · Not following';
    $('#uc-sub', n).textContent = sub;
  } else $('#uc-sub', n).textContent = 'Profile unavailable';
  const reason = () => $('#reason', n).value.trim();
  const chips = () => { const l = savedWarns(); $('#uc-wchips', n).innerHTML = l.map((w, i) => `<span class="wchip"><button data-wi="${i}" data-tip="${esc(w)}">${esc(w.length > 34 ? w.slice(0, 33) + '…' : w)}</button><button class="wx" data-wx="${i}" data-tip="Remove this saved reason" aria-label="Remove">×</button></span>`).join(''); $('#uc-wchips', n).classList.toggle('hidden', !l.length); }; chips();
  n.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.wi !== undefined) { const w = savedWarns()[+b.dataset.wi]; if (w) { $('#reason', n).value = w; $('#reason', n).focus(); } return; }
    if (b.dataset.wx !== undefined) { saveSettings({ warnSaved: savedWarns().filter((x, i) => i !== +b.dataset.wx) }); return chips(); }
    if (b.id === 'uc-wsave') { const r = reason(); if (!r) return err('Type the reason first, then save it.'); if (savedWarns().includes(r)) return toast('Already saved', { ms: 1500 }); if (savedWarns().length >= 20) return toast('You can save 20 reasons. Remove one in Settings > Moderation.', { ms: 3000 }); saveSettings({ warnSaved: [...savedWarns(), r] }); chips(); return toast('Reason saved. Edit them in Settings > Moderation.', { ms: 2500 }); }
    if (b.dataset.ut) { n.querySelectorAll('[data-ut]').forEach((x) => x.classList.toggle('on', x === b)); n.querySelectorAll('.uc-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== b.dataset.ut)); const hb = $('#uc-hist', n); if (b.dataset.ut === 'm' && hb) hb.scrollTop = hb.scrollHeight; return; }
    if (b.classList.contains('x')) { const row = b.closest('.uc-m'), m = u.msgs[+row.dataset.i]; del(c, m.id, m.text, login); row.classList.add('gone'); b.remove(); return; }
    if (b.id === 'prof') return openLink('https://www.twitch.tv/' + login);
    if (b.id === 'uc-at') { closePop(); const i = inp(); i.value += (i.value && !/\s$/.test(i.value) ? ' ' : '') + '@' + login + ' '; return i.focus(); }
    if (b.id === 'uc-bl') { if (!uid) uid = await idOf(login); const has = (S.settings.banList || []).some((x) => x.login === login); if (has) saveSettings({ banList: S.settings.banList.filter((x) => x.login !== login) }); else addToBanList(login, uid, reason()); b.classList.toggle('on', !has); b.dataset.tip = has ? 'Add to your shared ban list' : 'Remove from your shared ban list'; return toast(has ? `${login} removed from the ban list` : `${login} added to the ban list`, { ms: 2200 }); }
    if (b.id === 'uc-watch') { const w = new Set(S.settings.watch || []); w.has(login) ? w.delete(login) : w.add(login); saveSettings({ watch: [...w] }); compileHl(); b.classList.toggle('on', w.has(login)); b.dataset.tip = w.has(login) ? 'Remove from watch list' : 'Add to watch list'; return toast(w.has(login) ? `Watching ${login}. Their messages are highlighted.` : `Stopped watching ${login}`, { ms: 2500 }); }
    if (!uid) uid = await idOf(login); if (!uid) return err('Could not find that user.');
    if (b.id === 'uc-wh') { closePop(); return openWhisper(uid, login, u.name); }
    if (b.id === 'uc-warn') { if (!reason()) return err('Add a reason first. Twitch requires one for warnings.'); closePop(); return warnUser(c, uid, login, reason()); }
    if (b.id === 'uc-all') { closePop(); return banEverywhere(login, uid, reason()); }
    if (b.dataset.d !== undefined) { closePop(); ban(c, uid, login, +b.dataset.d, reason()); }
    else if (b.id === 'unb') { closePop(); unban(c, uid, login); }
  };
}
// Selecting chat and pressing Ctrl+C: emotes are copied as their names, one message per line
document.addEventListener('copy', (e) => {
  const sel = getSelection(); if (!sel || !sel.rangeCount || sel.isCollapsed) return; const r = sel.getRangeAt(0), host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  if (!host || !host.closest || !host.closest('.chat, .sitem, .ucard, .toolwin')) return; if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
  const f = r.cloneContents(); if (!f.querySelector('img')) return;
  f.querySelectorAll('img').forEach((i) => i.replaceWith(document.createTextNode(i.getAttribute('alt') || ''))); f.querySelectorAll('.tools, .mod, .mb').forEach((x) => x.remove());
  const msgs = [...f.querySelectorAll('.msg')], text = (msgs.length ? msgs.map((m) => m.textContent) : [f.textContent]).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  if (!text) return; e.clipboardData.setData('text/plain', text); e.preventDefault();
});
