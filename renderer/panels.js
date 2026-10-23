'use strict';
/* ---------- Activity sidebar ---------- */
const SIDE_TABS = [['mentions', 'Mentions', 'bell'], ['users', 'Users', 'community'], ['automod', 'AutoMod', 'shield'], ['unbans', 'Unbans', 'user'], ['modact', 'Mod activity', 'sword'], ['suspicious', 'Suspicious users', 'radar'], ['firsts', 'Firsts', 'star'], ['joins', 'Joins', 'users'], ['whispers', 'Whispers', 'whisper'], ['links', 'Links', 'link'], ['live', 'Live', 'tv'], ['yappy', 'Yappy', 'yappy']]; // the old Mod log is part of Mod activity now
// The tabs can be dragged into any order; the order is remembered
const MOD_TABS = new Set(['automod', 'unbans', 'firsts', 'links', 'modact', 'suspicious']);
const xd = (k, i) => `<button class="ibtn sm xdel" data-a="dis" data-k="${k}" data-i="${i}" data-tip="Dismiss" aria-label="Dismiss">${ico('x', 13)}</button>`; // every item in the activity panel can be dismissed on its own
const sideTabs = () => { const o = S.settings.sideOrder || [], by = new Map(SIDE_TABS.filter((x) => !(S.settings.notMod && MOD_TABS.has(x[0]))).map((x) => [x[0], x])); return [...o.filter((k) => by.has(k)), ...[...by.keys()].filter((k) => !o.includes(k))].map((k) => by.get(k)); };
const unseenTotal = () => Object.entries(S.unseen).reduce((a, [k, b]) => a + (k === 'joins' ? 0 : b), 0); // joins/parts are noisy, so they keep their own count and stay out of the bell
function renderBell() { const n = unseenTotal(), b = $('#sideBtn'); b.innerHTML = ico('bell', 18) + (n ? `<span class="count">${n > 99 ? '99+' : n}</span>` : ''); }
// New items count as unseen until you actually open that tab; actioning an item does not change the count
// Open the activity panel on a tab (and unfold it if only the icons were showing)
function openSide(tab) { saveSettings({ sidebar: true, sideCollapsed: false }); if (tab) { S.sideTab = tab; S.sideNone = false; } renderSide(); }
/* Sections can be pinned: pinned ones stay open at the top of the panel, and the section you open next appears underneath. Click a section's icon again (or unpin it) to close it. */
const sidePins = () => { const ok = new Set(sideTabs().map((x) => x[0])); return (S.settings.sidePins || []).filter((k) => ok.has(k)); };
// How many sections can sit stacked at once depends on how tall the window is (three or four, counting the one you just opened)
const maxSecs = () => (innerHeight >= 1000 ? 4 : 3);
const sideSecs = () => { const p = sidePins(); return !S.sideNone && !p.includes(S.sideTab) ? [...p, S.sideTab] : p; };
const sideShows = (k) => !!(S.settings.sidebar && !S.settings.sideCollapsed && sideSecs().includes(k));
const sideFolded = () => !!(S.settings.sidebar && S.settings.sideCollapsed);
function bump(tab) { if (!sideShows(tab)) S.unseen[tab] = (S.unseen[tab] || 0) + 1; renderSideSoon(); }
// A burst of activity redraws the panel once, not once per item
let rsT = 0; // Channel names in a Yappy entry are links: they add the channel if needed and open its chat
function yText(x) { let h = esc(x.text); (x.chans || []).forEach((ch) => { const n = esc(ch.name || ch.login), i = h.indexOf(n); if (i >= 0) h = h.slice(0, i) + swl(ch) + h.slice(i + n.length); }); return h; }
function renderSideSoon() { if (rsT) return; rsT = setTimeout(() => { rsT = 0; renderSide(); }, 120); }
const KIND_ICON = { term: 'list', note: 'note', automod: 'shield', unbanreq: 'user', ban: 'ban', timeout: 'clock', untimeout: 'clock', delete: 'trash', unban: 'user', warn: 'warn', clear: 'x', mode: 'shield' };
const relT = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
// An unban request, laid out like Twitch's Mod View: who, when, what they wrote, then Approve and Deny
const ubCard = (x) => {
  const i = S.unbans.indexOf(x), st = x.status || 'pending';
  return `<div class="ubcard${st !== 'pending' ? ' res ' + st : ''}"><div class="ubh"><span class="ubav">${esc((x.name || '?')[0].toUpperCase())}</span><div class="ubw"><b class="lk" data-u="${esc(x.user)}" data-c="${esc(x.c)}" data-tip="Open their user card: chat history and notes">${esc(x.name)}</b><span class="ubt">Requested ${relT(x.ts)}</span></div>${st === 'pending' && i >= 0 ? xd('unbans', i) : ''}</div><div class="ubq">${x.text ? esc(x.text) : '<i>No message</i>'}</div>` +
    (st === 'pending' ? `<div class="ubb"><button class="btn sm ubok" data-a="approve" data-i="${i}">${ico('check', 13)} Approve</button><button class="btn sm ubno" data-a="reject" data-i="${i}">${ico('x', 13)} Deny</button></div>` : `<div class="ubres">${st === 'approved' ? ico('check', 13) + ' Approved' : ico('x', 13) + ' Denied'}${x.by ? ' by ' + esc(x.by) : ''}${x.resolved ? ' · ' + relT(x.resolved) : ''}${x.note ? `<div class="faint">${esc(x.note)}</div>` : ''}</div>`) + `</div>`;
};
// Approved and denied requests come from Twitch when you open those views
function unbanResolved(c, view) {
  if (!c) return [];
  const key = c.login + ':' + view, got = S.ubRes.get(key), q = (S.unbanQ || '').toLowerCase().replace(/^@/, '');
  if (!got || Date.now() - got.at > 60000) { if (!got || !got.busy) loadUbResolved(c, view); }
  return ((got && got.list) || []).filter((x) => !q || x.user.toLowerCase().includes(q) || (x.name || '').toLowerCase().includes(q));
}
async function loadUbResolved(c, view) {
  const key = c.login + ':' + view, prev = S.ubRes.get(key) || { list: [] }; S.ubRes.set(key, { ...prev, busy: true, at: Date.now() });
  const r = await helix('moderation/unban_requests', { query: mq(c, { status: view, first: '50' }) });
  const list = ok(r) ? ((r.json && r.json.data) || []).map((x) => ({ c: c.login, id: x.id, user: x.user_login, name: x.user_name || x.user_login, text: x.text, ts: Date.parse(x.created_at) || Date.now(), status: view, by: x.moderator_name || x.moderator_login || '', note: x.resolution_text || '', resolved: Date.parse(x.resolved_at) || 0 })) : prev.list;
  S.ubRes.set(key, { list, at: Date.now(), busy: false }); if (sideShows('unbans')) renderSide();
}
// Mod activity: deletes, timeouts, bans and warnings from the last 10 minutes
const MODACT_MS = 10 * 60000, MODACT_KINDS = /^(ban|timeout|delete|warn)$/;
const modActList = () => { const now = Date.now(); return S.modlog.filter((x) => MODACT_KINDS.test(x.kind) && !x.actX && now - x.ts < MODACT_MS); };
// Mod activity: everything moderators did while YappyChat was open, filtered by action, channel and time
// AutoMod's buttons, one row and one style, in the activity rail and in chat: Allow, Deny, then deny-and-act
const amBtns = (attr) => `<div class="ambar">${[['allow', 'check', 'Allow', 'Let the message through'], ['deny', 'x', 'Deny', 'Keep it hidden'], ['to', 'clock', '', 'Deny and time them out'], ['warn', 'warn', '', 'Deny and warn them'], ['ban', 'ban', '', 'Deny and ban them']].map(([k, i, l, t]) => `<button class="amb-${k}${l ? ' lab' : ''}" ${attr(k)} data-tip="${t}" aria-label="${l || t}">${ico(i, 14)}${l ? `<span>${l}</span>` : ''}</button>`).join('')}</div>`;
const SEC_SEARCH = new Set(['mentions', 'suspicious', 'firsts', 'joins', 'whispers', 'live', 'yappy']); // sections with their own search box use theirs (Users, AutoMod, Unbans, Mod activity, Links)
function secFilter(k, root) { const q = ((S.secQ || {})[k] || '').trim().toLowerCase(), l = (root || document).querySelector(`.ssec[data-k="${k}"] .slist`); if (!l) return; let shown = 0; l.querySelectorAll(':scope > .sitem').forEach((x) => { const hit = !q || x.textContent.toLowerCase().includes(q); x.classList.toggle('hidden', !hit); if (hit) shown++; }); let nf = l.querySelector(':scope > .secnf'); if (q && !shown) { if (!nf) l.append(el('div', 'none secnf', 'Nothing matches that search.')); } else if (nf) nf.remove(); }
const MA_FILTERS = [['all', 'All'], ['delete', 'Deletes'], ['timeout', 'Timeouts'], ['ban', 'Bans'], ['warn', 'Warnings'], ['automod', 'AutoMod'], ['term', 'Words'], ['unban', 'Unbans'], ['other', 'Other']];
const maGroup = (k) => (k === 'untimeout' ? 'unban' : /^(delete|timeout|ban|warn|term|unban|automod)$/.test(k) ? k : 'other');
function modActView() {
  const f = S.maFilter || 'all', range = S.maRange || 'recent', here = S.maChan === 'here', now = Date.now(), cl = curLogin(), q = (S.maQ || '').trim().toLowerCase();
  const l = S.modlog.filter((x) => (range === 'all' || (!x.actX && now - x.ts < MODACT_MS)) && (f === 'all' || maGroup(x.kind) === f) && (!here || x.c === cl) && (!q || [x.text, x.target, x.by, x.msg, x.c].join(' ').toLowerCase().includes(q)));
  const head = `<input id="ma-q" class="sidesearch maq-in" type="search" placeholder="Search names, mods and messages" value="${esc(S.maQ || '')}" spellcheck="false" autocomplete="off">` +
    `<div class="mahead"><select id="ma-f" aria-label="Which actions">${MA_FILTERS.map(([k, t]) => `<option value="${k}"${f === k ? ' selected' : ''}>${k === 'all' ? 'All' : t}</option>`).join('')}</select><select id="ma-range" aria-label="How far back" data-tip="Last 10 minutes: lines go away after 10 minutes, or click one to clear it. Whole session: everything since YappyChat opened."><option value="recent"${range === 'recent' ? ' selected' : ''}>10 min</option><option value="all"${range === 'all' ? ' selected' : ''}>Session</option></select><select id="ma-chan" aria-label="Which channels"><option value="all"${!here ? ' selected' : ''}>All chats</option><option value="here"${here ? ' selected' : ''}>This chat</option></select><button class="ibtn sm" id="ma-save" data-tip="Save a report of this session's moderation (a spreadsheet file)" aria-label="Save a report">${ico('download', 15)}</button></div>`;
  return { head, items: l.map(maItem).join('') || `<div class="none">${q ? 'Nothing matches that search.' : f === 'all' ? (range === 'recent' ? 'No moderation in the last 10 minutes. Yours and other moderators\' actions appear here as they happen.' : 'No moderation since YappyChat opened.') : 'Nothing of that kind ' + (range === 'recent' ? 'in the last 10 minutes.' : 'since YappyChat opened.')}</div>` };
}
// Save the whole session's moderation (all actions, or one chat when "This chat" is picked) as a spreadsheet to keep or share with the mod team
async function saveModReport() {
  const here = S.maChan === 'here', cl = curLogin(), rows = S.modlog.filter((x) => !here || x.c === cl).slice().sort((a, b) => a.ts - b.ts);
  if (!rows.length) return toast('Nothing to report yet: no moderation since YappyChat opened.', { ms: 3500 });
  const q = (v) => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }, d = (t) => { const x = new Date(t); return x.toLocaleDateString() + ' ' + x.toLocaleTimeString(); };
  const csv = [['Time', 'Channel', 'Moderator', 'Action', 'Person', 'What happened', 'Message'].join(',')].concat(rows.map((x) => [d(x.ts), '#' + x.c, x.by || '', MA_FILTERS.find((f) => f[0] === maGroup(x.kind)) ? MA_FILTERS.find((f) => f[0] === maGroup(x.kind))[1] : x.kind, x.target || '', x.text, x.msg || ''].map(q).join(','))).join('\r\n');
  const counts = {}; rows.forEach((x) => { const by = x.by || 'unknown'; counts[by] = (counts[by] || 0) + 1; });
  const sum = '\r\n\r\nModerator,Actions\r\n' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => q(k) + ',' + v).join('\r\n');
  try { const r = await cg.saveReport({ text: csv + sum, name: `YappyChat-mod-report-${here ? cl + '-' : ''}${new Date().toISOString().slice(0, 10)}` }); if (r && r.error) return err(r.error); if (r && r.ok) toast('Report saved as ' + r.name, { ms: 3500 }); } catch (e) { err('Could not save the report.'); }
}
// One line of Mod activity: In #channel, by who · what happened (the person's name opens their card) · the message behind it
function maItem(x) {
  const i = S.modlog.indexOf(x), c = S.chats.get(x.c), me = (S.me && S.me.login || '').toLowerCase(), byMe = x.by && x.by.toLowerCase() === me;
  const lk = (u, label) => `<b class="lk" data-u="${esc(String(u).toLowerCase())}" data-c="${esc(x.c)}" data-tip="Open ${esc(label || u)}'s user card">${esc(label || u)}</b>`;
  const by = !x.by ? 'by a moderator' : byMe ? 'by you' : 'by ' + lk(x.by);
  let t = esc(x.text.replace(/^You /, '').replace(new RegExp('^' + (x.by || '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ', 'i'), ''));
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (x.target) { const rx = new RegExp('(^|[^\\w])(' + esc(x.target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w])', 'i'); t = t.replace(rx, (m0, p1, p2) => p1 + lk(x.target, p2)); }
  const canUndo = (x.kind === 'ban' || x.kind === 'timeout') && x.target && c && isMod(c) && !x.undone;
  const label = x.src === 'automod' ? 'Held by AutoMod' : x.src === 'deleted' || x.kind === 'delete' ? '' : 'Their last message'; // a deleted message needs no label: the line above already says it was deleted
  return `<div class="sitem click act k-${esc(x.kind)}${x.undone ? ' undone' : ''}" data-act="${i}"><div class="meta"><b>${ico(KIND_ICON[x.kind] || 'file', 13)} <span>In #${esc(x.c)}, ${by}</span></b><span>${x.target && x.src !== 'automod' ? ctxBtn({ c: x.c, login: x.target, ts: x.ts }) : ''}${tmFmt(x.ts)}</span></div>` +
    `<div class="mabody">${t}${x.undone ? ' <i class="faint">(undone)</i>' : ''}</div>` +
    (x.msg ? `<div class="maquote">${label ? `<span>${label}</span>` : ''}${esc(x.msg)}</div>` : '') +
    (canUndo ? `<button class="ibtn sm undo" data-a="mv-undo" data-i="${i}" data-tip="Undo: lift this ${x.kind === 'ban' ? 'ban' : 'timeout'} on ${esc(x.target)}" aria-label="Undo">${ico('undo', 15)}</button>` : '') + `</div>`;
}
// AutoMod: what is waiting now, or the history of everything that was dealt with (who did it, and what they tried to send)
function amView(xd, none) {
  const view = S.amView || 'waiting', here = S.amChan !== 'all', ac = S.active, q = (S.amQ || '').trim().toLowerCase(), f = S.amF || 'all';
  const match = (x) => (!here || x.c === ac) && (!q || [x.name, x.login, x.text, x.reason, x.by].join(' ').toLowerCase().includes(q));
  const head = `<input id="am-q" class="sidesearch maq-in" type="search" placeholder="Search names and messages" value="${esc(S.amQ || '')}" spellcheck="false" autocomplete="off">` +
    `<div class="mahead"><select id="am-view" aria-label="Which AutoMod messages"><option value="waiting"${view === 'waiting' ? ' selected' : ''}>Waiting${S.queue.length ? ' (' + S.queue.length + ')' : ''}</option><option value="history"${view === 'history' ? ' selected' : ''}>History</option></select>` +
    (view === 'history' ? `<select id="am-f" aria-label="Which results">${[['all', 'All'], ['allowed', 'Allowed'], ['denied', 'Denied'], ['expired', 'Expired']].map(([k, t]) => `<option value="${k}"${f === k ? ' selected' : ''}>${t}</option>`).join('')}</select>` : '') +
    `<select id="am-chan" aria-label="Which channels"><option value="here"${here ? ' selected' : ''}>This chat</option><option value="all"${!here ? ' selected' : ''}>All chats</option></select></div>`;
  if (view === 'waiting') {
    const l = S.queue.filter(match);
    return { head: head + (l.length ? `<div class="pending">${l.length} waiting for review${here ? ' in ' + esc((S.chats.get(ac) || {}).name || ac) : ''}</div>` : ''), items: l.map((x) => { const i = S.queue.indexOf(x); return `<div class="sitem ydel">${xd('automod', i)}<div class="meta"><b>${here ? '' : 'In #'}${esc(x.c)}</b><span>${tmFmt(x.ts)}</span></div><div class="faint amreason">${esc(x.reason)}</div><div><b class="lk" data-u="${esc(x.login)}" data-c="${esc(x.c)}">${esc(x.name)}:</b> ${esc(x.text)}</div>${amBtns((k) => `data-a="${k === 'allow' || k === 'deny' ? k : 'am-' + k}" data-i="${i}"`)}</div>`; }).join('') || none(q ? 'Nothing waiting matches that search.' : `Messages AutoMod holds${here ? ' in ' + esc((S.chats.get(ac) || {}).name || 'this chat') : ''} appear here while YappyChat is open. Once someone allows or denies one, it moves to History.`) };
  }
  const me = (S.me && S.me.login || '').toLowerCase(), l = (S.amHist || []).filter((x) => match(x) && (f === 'all' || x.result === f));
  return { head, items: l.map((x) => `<div class="sitem amh ${esc(x.result)}"><div class="meta"><b>${here ? '' : 'In #' + esc(x.c) + ' · '}<span class="amres">${x.result === 'allowed' ? ico('check', 12) + ' Allowed' : x.result === 'denied' ? ico('x', 12) + ' Denied' : 'Expired'}</span>${x.by ? ' by ' + (x.by.toLowerCase() === me ? 'you' : `<b class="lk" data-u="${esc(x.by.toLowerCase())}" data-c="${esc(x.c)}">${esc(x.by)}</b>`) : ''}${x.then ? ', then ' + esc(x.then) : ''}</b><span>${tmFmt(x.at)}</span></div><div><b class="lk" data-u="${esc(x.login)}" data-c="${esc(x.c)}">${esc(x.name)}</b> tried to send:</div><div class="maquote">${esc(x.text)}</div><div class="faint amreason">${esc(x.reason)}</div></div>`).join('') || none(q || f !== 'all' ? 'Nothing matches.' : 'AutoMod messages that were allowed, denied or expired while YappyChat was open are listed here.') };
}
// A live notification is kept in the Live tab (Yappy's own tab is for his suggestions and tips)
function lvLog(e) { S.lvlog.unshift({ ts: Date.now(), ...e }); S.lvlog.length = Math.min(S.lvlog.length, 100); bump('live'); }
function renderSide() {
  const fq = document.activeElement && (/^(ma-q|am-q)$/.test(document.activeElement.id) || document.activeElement.dataset.q) ? [document.activeElement.id || '', document.activeElement.selectionStart, document.activeElement.dataset.q] : null; // keep typing in a search box when the panel redraws
  const hadU = document.activeElement && document.activeElement.id === 'usQ' ? document.activeElement.selectionStart : -1, hadQ = document.activeElement && document.activeElement.id === 'unbanQ', qEnd = hadQ ? document.activeElement.selectionStart : 0;
  pruneFeeds(); const side = $('#side'), open = !!S.settings.sidebar; if (!sideTabs().some((x) => x[0] === S.sideTab)) S.sideTab = 'mentions'; const t = S.sideTab;
  const fold = open && !!S.settings.sideCollapsed;
  if (!sideSecs().length) S.sideNone = false; const secs = fold ? [] : sideSecs(); if (open && !fold) secs.forEach((k) => { if (S.unseen[k]) S.unseen[k] = 0; });
  $('#sideBtn').classList.toggle('on', open); renderBell();
  side.classList.toggle('hidden', !open); $('#sideWrap').classList.toggle('hidden', !open); $('#sideWrap').classList.toggle('collapsed', fold); side.classList.toggle('folded', fold); document.body.classList.toggle('side-open', open); applySideW(); if (!open) return;
  const btns = (i, a, b) => `<div class="btnrow"><button class="btn sm" data-a="${a[0]}" data-i="${i}">${a[1]}</button><button class="btn sm danger" data-a="${b[0]}" data-i="${i}">${b[1]}</button></div>`;
  const none = (s, go, label) => `<div class="none">${s}${go ? `<div><button class="btn sm" data-a="empty-go" data-go="${go}">${label}</button></div>` : ''}</div>`; // an empty section says what will appear, plus one next step
  const build = (t) => { let items = '', head = '';
  if (t === 'mentions') items = S.mentions.map((x, i) => `<div class="sitem ydel click${x.kind ? ' k-' + x.kind : ''}" data-i="${i}" ${(x.color || (x.kind === 'hl' && chanColor(x.c))) ? `style="--hc:${esc(x.color || chanColor(x.c))}"` : ''}>${xd('mentions', i)}<div class="meta"><b>${esc(x.c)}${x.kind === 'watch' ? ' · watching' : ''}</b><span><button class="ibtn sm mreply" data-a="m-reply" data-i="${i}" data-tip="Reply: @${esc(x.name)} in ${esc(x.c)}" aria-label="Reply to ${esc(x.name)}">${ico('reply', 13)}</button>${ctxBtn(x)}${tmFmt(x.ts)}</span></div><div><b>${esc(x.name)}:</b> ${esc(x.text)}</div></div>`).join('') || none('Messages that mention you, match a highlight, or come from someone on your watch list show up here. Click one to jump to its channel.', 'set:Highlights', 'Add highlight words');
  if (t === 'automod') { const v = amView(xd, none); head = v.head; items = v.items; }
  if (t === 'unbans') {
    const c = S.chats.get(S.active), view = S.ubView || 'pending', all = c ? S.unbans.filter((x) => x.c === c.login && !(S.hiddenUb && S.hiddenUb.has(x.id))) : [];
    const list = view === 'pending' ? unbanList() : unbanResolved(c, view);
    if (c && view === 'pending') refreshUnbans(c);
    const seg = `<div class="mahead"><select id="ub-view" aria-label="Which requests"><option value="pending"${view === 'pending' ? ' selected' : ''}>Pending${all.length ? ' (' + all.length + ')' : ''}</option><option value="approved"${view === 'approved' ? ' selected' : ''}>Approved</option><option value="denied"${view === 'denied' ? ' selected' : ''}>Denied</option></select></div>`;
    head = `<input id="unbanQ" class="sidesearch maq-in" type="search" placeholder="Search names" value="${esc(S.unbanQ || '')}" spellcheck="false" autocomplete="off">` + seg + `${c && c._ubErr ? `<div class="faint" style="padding:0 12px">${esc(c._ubErr)}</div>` : ''}`;
    items = list.map(ubCard).join('') || none(!c ? 'Open a channel to see its unban requests.' : (S.unbanQ ? 'Nobody with that name.' : view !== 'pending' ? `No ${view} requests to show in ${esc(c.name)}.` : isMod(c) ? `No pending unban requests in ${esc(c.name)}.` : 'You need to be a moderator of this channel to see unban requests.'));
  }
  if (t === 'live') items = S.lvlog.map((x, i) => `<div class="sitem ydel click lvitem" data-lv="${esc(x.login || '')}">${xd('live', i)}<div class="meta"><b>${x.login ? swl({ login: x.login, name: x.name || x.login }) : 'Your channels'}</b><span>${tmFmt(x.ts)}</span></div><div>${x.summary ? esc(x.text) : `${x.game ? 'Playing <b>' + esc(x.game) + '</b>' : 'Live now'}${x.title ? ' · ' + esc(x.title) : ''}`}</div></div>`).join('') || none('When a channel you have open (or follow, if you chose that) goes live, it is listed here.', 'notif:live', 'See what\'s notified');
  if (t === 'modact') { const v = modActView(); head = v.head; items = v.items; }
  if (t === 'suspicious') {
    const ac = S.chats.get(S.active), mon = ac && ac.susp ? [...ac.susp.entries()] : [];
    head = (mon.length ? `<div class="susp-now"><div class="faint">Watched in ${esc(ac.name)} right now</div>${mon.map(([l, st]) => `<span class="schip ${st === 'restricted' ? 'rs' : 'mn'}"><b class="lk" data-u="${esc(l)}" data-c="${esc(ac.login)}">${esc(l)}</b> ${st === 'restricted' ? 'restricted' : 'monitored'}<button class="ibtn sm" data-a="susp-clear" data-u="${esc(l)}" data-tip="Stop ${st === 'restricted' ? 'restricting' : 'monitoring'}" aria-label="Clear">${ico('x', 12)}</button></span>`).join('')}</div>` : '') + ``;
    items = S.susp.map((x, i) => `<div class="sitem ydel susp ${x.status === 'restricted' ? 'rs' : 'mn'}">${xd('suspicious', i)}<div class="meta"><b>${esc(x.c)}</b><span>${tmFmt(x.ts)}</span></div><div><span class="tag${x.status === 'restricted' ? ' red' : ''}">${x.status === 'restricted' ? 'Restricted' : x.status === 'active_monitoring' ? 'Monitored' : 'Flagged'}</span> <b class="lk" data-u="${esc(x.login)}" data-c="${esc(x.c)}">${esc(x.name)}${x.update ? '' : ':'}</b> ${esc(x.text)}${x.why && x.why.length ? `<div class="faint">${esc(x.why.map((w) => ({ manually_added: 'added by a moderator', ban_evader: 'likely ban evader', banned_in_shared_channel: 'banned in a shared channel' }[w] || w.replace(/_/g, ' '))).join(', '))}</div>` : ''}</div>${x.id ? `<div class="btnrow ic"><button class="ibtn" data-a="susp-del" data-i="${i}" data-tip="Delete this message">${ico('trash', 15)}</button><button class="ibtn" data-a="susp-to" data-i="${i}" data-tip="Time out">${ico('clock', 15)}</button><button class="ibtn" data-a="susp-ban" data-i="${i}" data-tip="Ban">${ico('ban', 15)}</button></div>` : ''}</div>`).join('') || none('Messages from people you monitor or restrict, and from accounts Twitch flags as likely ban evaders, appear here as they chat. Type /monitor or /restrict and a name to add someone.', 'cmd:/monitor ', 'Monitor someone');
  }
  if (t === 'firsts') items = S.firsts.map((x, i) => `<div class="sitem ydel">${xd('firsts', i)}<div class="meta"><b>${esc(x.c)}</b><span>${tmFmt(x.ts)}</span></div><div><b class="lk" data-u="${esc(x.login)}" data-c="${esc(x.c)}">${esc(x.name)}:</b> ${esc(x.text)}</div><div class="btnrow ic"><button class="ibtn${x.greeted ? ' on' : ''}" data-a="f-greet" data-i="${i}" data-tip="${x.greeted ? 'Greeted' : 'Greet them (reply with one of your greetings)'}">${ico('hand', 15)}</button><button class="ibtn" data-a="f-del" data-i="${i}" data-tip="Delete message">${ico('trash', 15)}</button><button class="ibtn" data-a="f-to" data-i="${i}" data-tip="Timeout">${ico('clock', 15)}</button><button class="ibtn" data-a="f-ban" data-i="${i}" data-tip="Ban">${ico('ban', 15)}</button><button class="ibtn" data-a="f-watch" data-i="${i}" data-tip="Add to watch list">${ico('eye', 15)}</button></div></div>`).join('') || none('People sending their very first message show up here for the time set in Settings > Chat, so you can check on newcomers quickly without the list growing huge.');
  if (t === 'joins') items = S.jp.filter((x) => visibleLogins().has(x.c)).map((x) => `<div class="sitem ydel jp">${xd('joins', S.jp.indexOf(x))}<div class="meta"><b>${esc(x.c)}</b><span>${tmFmt(x.ts)}</span></div>${x.joined.length ? `<div class="jl"><span class="jtag in">Joined ${x.joined.length}</span> ${esc(x.joined.join(', '))}</div>` : ''}${x.parted.length ? `<div class="jl"><span class="jtag out">Parted ${x.parted.length}</span> ${esc(x.parted.join(', '))}</div>` : ''}</div>`).join('') || none(S.settings.trackJoins === false ? 'Joins and parts are switched off.' : 'People joining and leaving the chats you can see appear here for the time set in Settings > Chat (updated every minute). Everything is kept in the chat logs. Twitch may not report them in very large channels.', S.settings.trackJoins === false ? 'set:Chat' : '', 'Turn them on');
  if (t === 'yappy') items = S.ylog.map((x, i) => `<div class="sitem ydel"><button class="ibtn sm xdel" data-a="ydel" data-i="${i}" data-tip="Dismiss" aria-label="Dismiss">${ico('x', 13)}</button><div class="meta"><b>${x.c ? swl({ login: x.c, name: (S.chats.get(x.c) || {}).name || x.c }) : 'Yappy'}</b><span>${tmFmt(x.ts)}</span></div><div>${yText(x)}</div>${x.result ? `<div class="faint">${esc(x.result)}</div>` : ''}</div>`).join('') || none('Raids, whispers, ban-list matches and everything Yappy suggests are kept here with the time, so you can see what you missed.');
  if (t === 'users') head = '<div class="usmount"></div>';
  if (t === 'links') { const v = linksView(); head = v.head; items = v.items; }
  if (t === 'whispers') items = [...S.whispers.values()].sort((a, b) => b.last - a.last).map((th) => `<div class="sitem ydel whisper">${xd('whispers', th.uid)}<div class="meta"><b>${esc(th.name)}</b><span>${tmFmt(th.last)}</span></div><div class="wmsgs">${th.msgs.slice(-6).map((m) => `<div class="${m.me ? 'me' : ''}">${m.me ? 'You: ' : ''}${esc(m.text)}</div>`).join('')}</div><div class="wreply"><input data-u="${th.uid}" placeholder="Reply to ${esc(th.name)}" maxlength="500"><button class="btn sm" data-a="wsend" data-u="${th.uid}">Send</button></div></div>`).join('') || none('Whispers sent to you appear here, and Yappy lets you know when one arrives. You can reply right here.');
  return { items, head }; };
  const keep = {}; let focused = null; side.querySelectorAll('.wreply input').forEach((i) => { keep[i.dataset.u] = i.value; if (document.activeElement === i) focused = i.dataset.u; });
  const clearFor = (t) => t === 'unbans' ? '<button class="ibtn" data-a="ub-refresh" data-tip="Refresh from Twitch">' + ico('undo', 15) + '</button>' : ((t === 'mentions' && S.mentions.length) || (t === 'yappy' && S.ylog.length) || (t === 'firsts' && S.firsts.length) || (t === 'joins' && S.jp.length) || (t === 'links' && S.links.length) || (t === 'live' && S.lvlog.length) || (t === 'suspicious' && S.susp.length) || (t === 'modact' && modActList().length) ? '<button class="ibtn" data-a="clear" data-k="'+t+'" data-tip="Clear this list">' + ico('trash', 15) + '</button>' : '');
  const tabs = sideTabs(), txt = !!S.settings.railText;
  side.classList.toggle('rail-txt', txt);
  const pins = sidePins(), nm = (k) => (tabs.find((x) => x[0] === k) || [k, k])[1];
  const secHtml = (k) => { const v = build(k), pn = pins.includes(k); if (SEC_SEARCH.has(k)) v.head = `<input class="sidesearch maq-in secq" type="search" data-q="${k}" placeholder="Search" value="${esc((S.secQ || {})[k] || '')}" spellcheck="false" autocomplete="off" aria-label="Search ${esc(nm(k))}">` + v.head; return `<div class="ssec" data-k="${k}"><div class="shead" draggable="true" data-tip="Drag to move this section"><b>${nm(k)}</b><span class="shb">${clearFor(k)}<button class="ibtn${pn ? ' on' : ''}" data-a="pin" data-k="${k}" data-tip="${pn ? 'Unpin and close this section' : 'Pin this section so it stays open'}" aria-label="${pn ? 'Unpin' : 'Pin'}">${ico('pin', 15)}</button></span></div>${v.head}<div class="slist">${v.items}</div>${k === 'live' || k === 'yappy' ? `<div class="sfoot"><button class="btn sm" data-a="notif" data-k="${k}">${ico('bell', 14)} See what's notified</button></div>` : ''}</div>`; };
  side.innerHTML = `<div class="sbody">${secs.map(secHtml).join('')}</div><div class="srail">${tabs.map(([k, l, i]) => `<button class="stab${secs.includes(k) ? ' on' : ''}${pins.includes(k) ? ' pinned' : ''}" data-t="${k}" draggable="true" ${txt ? '' : `data-tip="${l}${pins.includes(k) ? ' (pinned, click to close it)' : secs.includes(k) ? (pins.length ? ' (click again to close it)' : ' (click again to fold the panel)') : ''} (drag to reorder)" data-tip-side="left"`}>${txt ? `<span class="sl">${l}</span>` : ''}${ico(i, 18)}${S.unseen[k] ? `<span class="count">${S.unseen[k]}</span>` : ''}</button>`).join('')}${railToolsFor(cur()).map(([k, i, l]) => `<button class="stab rtool" data-a="railtool" data-k="${k}" data-tip="${l} (right-click to take it off the rail)" data-tip-side="left">${txt ? `<span class="sl">${l}</span>` : ''}${ico(i, 18)}</button>`).join('')}<button class="stab rplus" data-a="railadd" data-tip="Add a tool to the rail" data-tip-side="left">${txt ? '<span class="sl">Add a tool</span>' : ''}${ico('plus', 18)}</button><button class="stab rtog${txt ? ' on' : ''}" data-a="railtxt" data-tip="${txt ? 'Hide' : 'Show'} names" data-tip-side="left">${txt ? `<span class="sl">Hide names</span>` : ''}${ico('text', 18)}</button></div>`;
  if (secs.includes('users')) mountUsers(side, hadU);
  SEC_SEARCH.forEach((k) => { if ((S.secQ || {})[k]) secFilter(k, side); });
  if (fq) { const q0 = fq[2] ? side.querySelector(`.secq[data-q="${fq[2]}"]`) : document.getElementById(fq[0]); if (q0) { q0.focus(); try { q0.setSelectionRange(fq[1], fq[1]); } catch (e) {} } }
  const ub = $('#unbanQ', side); if (ub && hadQ) { ub.focus(); try { ub.setSelectionRange(qEnd, qEnd); } catch (e) {} }
  if (ub) ub.oninput = () => { S.unbanQ = ub.value; const v2 = S.ubView || 'pending', l = v2 === 'pending' ? unbanList() : unbanResolved(cur(), v2); $('.ssec[data-k=unbans] .slist', side).innerHTML = l.map(ubCard).join('') || none('Nobody with that name.'); };
  side.querySelectorAll('.wreply input').forEach((i) => { if (keep[i.dataset.u]) i.value = keep[i.dataset.u]; if (focused === i.dataset.u) i.focus(); });
  if (fold) applySideW(); // the folded panel is only as wide as its icons
}
/* ---------- Users: search anyone in the active channel, then see their details. Switching to another chat starts again at the search. ---------- */
async function usersGrouped(c, q) {
  q = (q || '').toLowerCase().replace(/^@/, ''); const ch = await liveChatters(c), roles = await roleSets(c).catch(() => null) || { mods: new Set(), vips: new Set() };
  const groups = Object.fromEntries(ROLE_ORDER.map((k) => [k, []]));
  ch.map.forEach((name, login) => { if (q && !login.includes(q) && !String(name).toLowerCase().includes(q)) return; const u = { login, name, n: ((c.users.get(login) || {}).msgs || []).length }; groups[roleOfUser(c, login, roles)].push(u); if (KNOWN_BOTS.has(login)) groups['Chat Bots'].push(u); });
  Object.values(groups).forEach((g) => g.sort((a, b) => a.login.localeCompare(b.login)));
  return { groups, ch };
}
function openUsers(c, login) { // /user, and the Users tab: open the panel on this person (or on the search)
  c = c || cur(); if (!c) return err('Open a channel first.');
  if (c.login !== S.active) setActive(c.login);
  S.us = { c: c.login, q: login || '', sel: null, node: null }; openSide('users'); if (login) setTimeout(() => openCard(c, login, $('#side') || document.body), 80);
}
// Picking someone in the Users panel opens their user card as a pop-out; the list stays where it was
function userSelect(c, login, anchor) { openCard(c, login, anchor || $('#side') || document.body); }
function mountUsers(side, hadU) {
  const c = cur(), host = $('.usmount', side); if (!host) return;
  if (!c) { host.innerHTML = '<div class="none">Open a channel to search the people in it.</div>'; return; }
  const settingsHost = el('div', 'uset-wrap'); chatSettingsBlock(c, settingsHost); host.append(settingsHost);
  if (!S.us || S.us.c !== c.login) S.us = { c: c.login, q: '', sel: null, node: null }; // a new chat: back to the search
  const us = S.us;
  if (us.sel) {
    if (!us.node) { us.node = el('div', 'usview sel', `<button class="btn sm" data-us="back">${ico('undo', 14)} Search</button><div class="uscard"></div>`); us.node.onclick = (e) => { if (e.target.closest('[data-us=back]')) { us.sel = null; us.node = null; renderSide(); } }; openCard(c, us.sel, null, $('.uscard', us.node)); }
    host.append(us.node); return;
  }
  const n = el('div', 'usview', `<input id="usQ" class="sidesearch" placeholder="Search people in ${esc(c.name)}" value="${esc(us.q || '')}" spellcheck="false" autocomplete="off"><div class="usres"></div><div class="usfoot"><button class="btn sm" data-us="blocked">Blocked users</button></div>`);
  const res = $('.usres', n), icons = { Broadcaster: 'stream', Staff: 'spark', Moderators: 'shield', VIPs: 'star', 'Chat Bots': 'bolt', Users: 'users' };
  const draw = async () => {
    const q = us.q.trim().toLowerCase().replace(/^@/, ''), { groups, ch } = await usersGrouped(c, q); if (!n.isConnected && !res.isConnected) return;
    const total = ROLE_ORDER.reduce((a, k) => a + (k === 'Chat Bots' ? 0 : groups[k].length), 0), look = q && /^\w{2,25}$/.test(q) && !ROLE_ORDER.some((k) => groups[k].some((u) => u.login === q));
    const note = ch.live ? `${(ch.total || total).toLocaleString()} in chat, live from Twitch` : ({ scope: 'Showing who YappyChat has seen. Twitch\'s full list needs one permission: <a href="#" data-us="grant">grant it</a>.', notmod: 'Showing who YappyChat has seen. Twitch only gives the full list to the streamer and moderators.', denied: 'Twitch refused the full list here, so this shows who YappyChat has seen. You need to be a moderator of this channel.', error: 'Could not reach Twitch\'s list, so this shows who YappyChat has seen.' }[ch.why] || '');
    res.innerHTML = `<div class="faint usnote">${note}</div>` + ROLE_ORDER.filter((k) => groups[k].length).map((k) => `<div class="cm-sec${us.col && us.col[k] ? ' shut' : ''}" data-sec="${k}"><span class="cm-ic">${ico(icons[k], 15)}</span><b>${k}</b><i class="cm-n">${groups[k].length.toLocaleString()}</i><span class="cm-chev">${ico('chev', 14)}</span></div>` + (us.col && us.col[k] ? '' : groups[k].slice(0, 150).map((u) => `<div class="sitem click usrow" data-u="${esc(u.login)}"><div class="meta"><b>${esc(u.name)}</b><span>${u.n ? u.n + ' message' + (u.n === 1 ? '' : 's') : ''}</span></div></div>`).join('') + (groups[k].length > 150 ? `<div class="faint usnote">${groups[k].length - 150} more. Type a name above to find them.</div>` : ''))).join('') + (look ? `<div class="sitem click usrow" data-u="${esc(q)}"><div class="meta"><b>Look up “${esc(q)}” on Twitch</b></div></div>` : '') || '<div class="none">Nobody here yet. Type a Twitch name to look someone up.</div>';
  };
  const inp0 = $('#usQ', n); inp0.oninput = () => { us.q = inp0.value; draw(); }; inp0.onkeydown = (e) => { if (e.key === 'Enter') { const r0 = $('.usrow', res); if (r0) userSelect(c, r0.dataset.u, r0); } };
  n.querySelector('[data-us=blocked]').onclick = () => blockedWin();
  res.onclick = (e) => { const sec = e.target.closest('.cm-sec'); if (sec) { us.col = us.col || {}; us.col[sec.dataset.sec] = !us.col[sec.dataset.sec]; return draw(); } if (e.target.closest('[data-us=grant]')) { e.preventDefault(); return askScope('moderator:read:chatters', () => { c._chatters = null; draw(); }); } const r0 = e.target.closest('.usrow'); if (r0) userSelect(c, r0.dataset.u, r0); };
  draw(); const iv = setInterval(() => { if (!n.isConnected) return clearInterval(iv); if (document.activeElement !== inp0 || !us.q) draw(); }, 20000); host.append(n); if (hadU >= 0 || !us.focused) { us.focused = true; inp0.focus(); try { const p = hadU >= 0 ? hadU : inp0.value.length; inp0.setSelectionRange(p, p); } catch (e) {} }
}
async function automod(item, action) {
  if (!item) return;
  const r = await helix('moderation/automod/message', { method: 'POST', body: { user_id: S.me.id, msg_id: item.id, action } });
  if (!ok(r)) err(apiErr(r)); else { const c = S.chats.get(item.c); amRecord(item, action === 'ALLOW' ? 'allowed' : 'denied', S.me.login); if (c) logAct(c, 'automod', `${action === 'ALLOW' ? 'allowed' : 'denied'} ${item.name}'s message held by AutoMod`, S.me.login, item.login, { msg: item.text, src: 'automod' }); amDone(item, action === 'ALLOW' ? 'Allowed by you' : 'Denied by you', action === 'ALLOW'); }
  S.queue = S.queue.filter((x) => x !== item); renderSide();
}
// An AutoMod hold with an action on the person as well: the held message is denied (removed), then the timeout, warning or ban goes out
async function amAct(item, act, anchor) {
  const c = item && S.chats.get(item.c); if (!c) return;
  if (!item.uid) item.uid = await idOf(item.login); if (!item.uid) return err('Could not find that user.');
  await automod(item, 'DENY'); const h = (S.amHist || []).find((x) => x.id === item.id); if (h) h.then = { to: 'timed out', ban: 'banned', warn: 'warned' }[act];
  if (act === 'to') ban(c, item.uid, item.login, S.settings.timeoutDefault, '', item.text);
  else if (act === 'ban') ban(c, item.uid, item.login, 0, '', item.text);
  else if (act === 'warn') askWarn(c, item.uid, item.login, anchor || $('#side'));
}
// Suspicious users (monitored and restricted): Twitch tells moderators when someone is added, changed or removed, and when they chat
function onSuspicious(login, type, ev) {
  const c = S.chats.get(login); if (!c) return; c.susp = c.susp || new Map();
  const st = ev.low_trust_status || 'none', who = (ev.user_login || '').toLowerCase(); if (!who) return;
  if (st === 'none') c.susp.delete(who); else c.susp.set(who, st);
  const base = { c: login, uid: ev.user_id, login: who, name: ev.user_name || who, status: st, ts: Date.now(), why: ev.types || [] };
  if (type.endsWith('.message')) S.susp.unshift({ ...base, id: ev.message && ev.message.message_id, text: (ev.message && ev.message.text) || '' });
  else S.susp.unshift({ ...base, update: true, why: [], text: st === 'none' ? `is no longer monitored or restricted${ev.moderator_user_name ? ' (by ' + ev.moderator_user_name + ')' : ''}` : `was ${st === 'restricted' ? 'restricted' : 'put on monitoring'}${ev.moderator_user_name ? ' by ' + ev.moderator_user_name : ''}` });
  S.susp.length = Math.min(S.susp.length, 150); bump('suspicious');
}
async function unbanReq(item, status) {
  const c = item && S.chats.get(item.c); if (!c) return;
  const r = await helix('moderation/unban_requests', { method: 'PATCH', query: mq(c, { unban_request_id: item.id, status }) });
  if (!ok(r)) err(apiErr(r)); else logAct(c, 'unban', `Unban request from ${item.name} ${status}`, undefined, item.user);
  S.unbans = S.unbans.filter((x) => x !== item); renderSide();
}
function addUnban(c, id, user, name, text, ts) { if (!S.unbans.some((x) => x.id === id)) { S.unbans.unshift({ c, id, user, name: name || user, text, ts: ts || Date.now() }); return true; } return false; }
// Unban requests for the chat you are in, straight from Twitch (replaces what was held for that channel)
async function refreshUnbans(c, force) {
  if (!c || !isMod(c) || c._ubBusy || (!force && Date.now() - (c._ubAt || 0) < 20000)) return; c._ubAt = Date.now(); c._ubBusy = true;
  const r = await helix('moderation/unban_requests', { query: mq(c, { status: 'pending', first: '100' }) }); c._ubBusy = false;
  if (!ok(r)) { c._ubErr = apiErr(r); if (sideShows('unbans')) renderSide(); return; } c._ubErr = '';
  S.unbans = S.unbans.filter((x) => x.c !== c.login); ((r.json && r.json.data) || []).forEach((x) => S.unbans.push({ c: c.login, id: x.id, user: x.user_login, name: x.user_name || x.user_login, text: x.text, ts: Date.parse(x.created_at) || Date.now() }));
  if (sideShows('unbans')) renderSide();
}
const unbanList = () => { const c = cur(), q = (S.unbanQ || '').toLowerCase().replace(/^@/, ''); return S.unbans.filter((x) => c && x.c === c.login && !(S.hiddenUb && S.hiddenUb.has(x.id)) && (!q || x.user.toLowerCase().includes(q) || (x.name || '').toLowerCase().includes(q))).sort((a, b) => b.ts - a.ts); };
$('#side').onclick = async (e) => {
  const b = e.target.closest('button'), it = e.target.closest('.sitem.click'), lk = e.target.closest('.lk');
  if (b && b.dataset.a === 'ctx') { e.stopPropagation(); return showContext(S.chats.get(b.dataset.c), { id: b.dataset.id, login: b.dataset.u, ts: +b.dataset.ts }, b); }
  if (b && b.dataset.a === 'm-reply') { // @ them in that chat and put the cursor in the message box
    const x = S.mentions[+b.dataset.i]; if (!x) return; const go = () => { const i = inp(); const at = '@' + (x.login || x.name) + ' '; if (!i.value.startsWith(at)) i.value = at + i.value.replace(/^@\S+\s*/, ''); i.focus(); i.setSelectionRange(i.value.length, i.value.length); try { syncPlaceholder(); } catch (e) {} };
    if (S.chats.has(x.c)) { if (S.active !== x.c) setActive(x.c); setTimeout(go, 30); } else addChannel(x.c).then(() => setTimeout(go, 200)); return;
  }
  if (b && b.dataset.a === 'ma-f') { S.maFilter = b.dataset.f; return renderSide(); }
  if (b && b.dataset.a === 'am-f') { S.amF = b.dataset.f; return renderSide(); }
  if (b && b.dataset.a === 'mv-undo') return modViewAct('mv-undo', b.dataset.i);
  const act = e.target.closest('[data-act]'); if (act && !b && !e.target.closest('.lk,a') && (S.maRange || 'recent') === 'recent') { const x = S.modlog[+act.dataset.act]; if (x) x.actX = true; return renderSide(); }
  const lv = e.target.closest('[data-lv]'); if (lv && !e.target.closest('button,a') && lv.dataset.lv) { const l = lv.dataset.lv; return S.chats.has(l) ? setActive(l) : addChannel(l); }
  if (b && b.dataset.a === 'ub-view') { S.ubView = b.dataset.v; return renderSide(); }
  if (b && b.dataset.a === 'susp-clear') { const c = cur(); if (c) suspicious(c, b.dataset.u, null); return; }
  if (b && /^susp-(del|to|ban)$/.test(b.dataset.a || '')) { const x = S.susp[+b.dataset.i], c = x && S.chats.get(x.c); if (!c) return; const a = b.dataset.a; if (a === 'susp-del') { del(c, x.id, x.text, x.login); } else if (a === 'susp-to') ban(c, x.uid, x.login, S.settings.timeoutDefault, '', x.text); else ban(c, x.uid, x.login, 0, '', x.text); return; }
  if (b && /^am-(to|warn|ban)$/.test(b.dataset.a || '')) return amAct(S.queue[+b.dataset.i], b.dataset.a.slice(3), b);
  if (b && b.dataset.a === 'ub-refresh') { refreshUnbans(cur(), true); S.ubRes.clear(); return toast('Checking Twitch for unban requests', { ms: 1500 }); }
  if (b && b.dataset.a === 'dis') { const k = b.dataset.k, i = b.dataset.i, n = +i; if (k === 'mentions') S.mentions.splice(n, 1); else if (k === 'automod') S.queue.splice(n, 1); else if (k === 'unbans') { const u = S.unbans[n]; if (u) (S.hiddenUb = S.hiddenUb || new Set()).add(u.id); } else if (k === 'firsts') S.firsts.splice(n, 1); else if (k === 'joins') S.jp.splice(n, 1); else if (k === 'whispers') S.whispers.delete(i) || S.whispers.delete(n); else if (k === 'links') S.links.splice(n, 1); else if (k === 'modlog') S.modlog.splice(n, 1); else if (k === 'live') S.lvlog.splice(n, 1); else if (k === 'suspicious') S.susp.splice(n, 1); return renderSide(); }
  if (b && b.dataset.a === 'ydel') { S.ylog.splice(+b.dataset.i, 1); return renderSide(); }
  if (b && b.dataset.a === 'railadd') return openRailAdd(b);
  if (b && b.dataset.a === 'railtool') return railTool(b.dataset.k);
  if (b && b.dataset.a === 'railtxt') { saveSettings({ railText: !S.settings.railText }); return renderSide(); }
  if (b && b.dataset.t) { // an icon opens its section; the open one's icon again closes it (the panel folds when nothing is left)
    const k = b.dataset.t, pins = sidePins();
    if (S.settings.sideCollapsed) { S.sideTab = k; S.sideNone = false; saveSettings({ sideCollapsed: false }); }
    else if (pins.includes(k)) { saveSettings({ sidePins: pins.filter((x) => x !== k) }); if (k === S.sideTab) S.sideNone = true; if (!sideSecs().length) saveSettings({ sideCollapsed: true }); }
    else if (k === S.sideTab && !S.sideNone) { if (pins.length) S.sideNone = true; else saveSettings({ sideCollapsed: true }); }
    else { S.sideTab = k; S.sideNone = false; }
    return renderSide();
  }
  if (b && b.dataset.a === 'pin') {
    const k = b.dataset.k, pins = sidePins();
    if (pins.includes(k)) { saveSettings({ sidePins: pins.filter((x) => x !== k) }); if (k === S.sideTab) S.sideNone = true; if (!sideSecs().length) saveSettings({ sideCollapsed: true }); }
    else { if (pins.length >= maxSecs() - 1) return toast(`This window has room for ${maxSecs()} sections at once (the pinned ones plus the one you open). Unpin one first, or make the window taller.`, { ms: 3800 }); saveSettings({ sidePins: [...pins, k] }); if (k === S.sideTab) S.sideNone = false; }
    return renderSide();
  }
  if (lk) { const c = S.chats.get(lk.dataset.c); if (c) openCard(c, lk.dataset.u, lk); return; }
  if (b && b.dataset.a === 'empty-go') { const [k, v] = b.dataset.go.split(/:(.*)/); if (k === 'set') return openSettings(v); if (k === 'notif') return openNotifPop(v, b); if (k === 'cmd') { const i = inp(); i.value = v; return i.focus(); } return; }
  if (b && b.dataset.a === 'notif') { openNotifPop(b.dataset.k, b); return; }
  if (b && b.dataset.a === 'clear') { const k = b.dataset.k || S.sideTab; if (k === 'mentions') S.mentions = []; if (k === 'yappy') S.ylog = []; if (k === 'firsts') S.firsts = []; if (k === 'joins') S.jp = []; if (k === 'links') S.links = []; if (k === 'live') S.lvlog = []; if (k === 'suspicious') S.susp = []; if (k === 'modact') S.modlog.forEach((x) => { if (MODACT_KINDS.test(x.kind)) x.actX = true; }); return renderSide(); }
  if (b && b.dataset.a === 'wsend') { const inp = $(`.wreply input[data-u="${b.dataset.u}"]`, $('#side')); return sendWhisper(b.dataset.u, inp); }
  if (b && b.dataset.a && b.dataset.a.startsWith('mv-')) return modViewAct(b.dataset.a, b.dataset.i);
  if (b && b.dataset.a) {
    const i = +b.dataset.i, a = b.dataset.a;
    if (a.startsWith('l-')) return linkAct(a, S.links[i]);
    if (a === 'allow' || a === 'deny') return automod(S.queue[i], a.toUpperCase());
    if (a === 'approve' || a === 'reject') return unbanReq(S.unbans[i], a === 'approve' ? 'approved' : 'denied');
    const f = S.firsts[i], c = f && S.chats.get(f.c); if (!c) return;
    if (a === 'f-greet') return greetFirst(i, b);
    if (a === 'f-del') { if (f.id) del(c, f.id, f.text, f.login); b.closest('.sitem').classList.add('done'); }
    if (a === 'f-to') ban(c, f.uid, f.login, S.settings.timeoutDefault, '', f.text);
    if (a === 'f-ban') ban(c, f.uid, f.login, 0, '', f.text);
    if (a === 'f-watch') { saveSettings({ watch: [...new Set([...(S.settings.watch || []), f.login])] }); compileHl(); toast(`Watching ${f.login}`, { ms: 2200 }); }
    return;
  }
  if (it && S.mentions[+it.dataset.i]) setActive(S.mentions[+it.dataset.i].c);
};

(function () {
  const side = $('#side'); let drag = null, dragSec = null;
  // Stacked sections: drag a section's header onto another to swap places (an unpinned one becomes pinned where you drop it)
  side.addEventListener('dragstart', (e) => { const h = e.target.closest && e.target.closest('.shead'); if (!h) return; dragSec = h.parentElement.dataset.k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'sec:' + dragSec); });
  side.addEventListener('dragover', (e) => { const s2 = e.target.closest && e.target.closest('.ssec'); if (!dragSec || !s2) return; e.preventDefault(); side.querySelectorAll('.ssec.dropt').forEach((x) => x.classList.remove('dropt')); if (s2.dataset.k !== dragSec) s2.classList.add('dropt'); });
  side.addEventListener('drop', (e) => {
    const s2 = e.target.closest && e.target.closest('.ssec'); if (!dragSec || !s2) return; e.preventDefault(); e.stopPropagation();
    const from = dragSec, to = s2.dataset.k; dragSec = null; side.querySelectorAll('.ssec.dropt').forEach((x) => x.classList.remove('dropt')); if (from === to) return;
    const pins = sidePins(), order = sideSecs().filter((k) => k !== from); order.splice(Math.max(0, order.indexOf(to)) + (sideSecs().indexOf(from) < sideSecs().indexOf(to) ? 1 : 0), 0, from);
    const np = order.filter((k) => pins.includes(k) || k === from); if (np.length > maxSecs() - 1 + (pins.includes(from) ? 0 : 0) && !pins.includes(from)) return toast(`This window has room for ${maxSecs()} sections at once. Unpin one first.`, { ms: 3000 });
    saveSettings({ sidePins: np }); if (from === S.sideTab) S.sideNone = false; renderSide();
  }, true);
  side.addEventListener('dragend', () => { dragSec = null; side.querySelectorAll('.ssec.dropt').forEach((x) => x.classList.remove('dropt')); });
  side.addEventListener('contextmenu', (e) => { const b = e.target.closest && e.target.closest('.rtool'); if (!b) return; e.preventDefault(); saveSettings({ railTools: (S.settings.railTools || []).filter((x) => x !== b.dataset.k) }); renderSide(); toast('Taken off the rail', { ms: 1500 }); });
  side.addEventListener('dragstart', (e) => { const b = e.target.closest && e.target.closest('.stab'); if (!b) return; drag = b.dataset.t; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag); });
  side.addEventListener('dragover', (e) => { const b = e.target.closest && e.target.closest('.stab'); if (!drag || !b) return; e.preventDefault(); side.querySelectorAll('.stab.dragover').forEach((x) => x.classList.remove('dragover')); if (b.dataset.t !== drag) b.classList.add('dragover'); });
  side.addEventListener('drop', (e) => {
    const b = e.target.closest && e.target.closest('.stab'); if (!drag || !b) return; e.preventDefault();
    const order = sideTabs().map((x) => x[0]), from = order.indexOf(drag), to = order.indexOf(b.dataset.t); if (from < 0 || to < 0 || from === to) { drag = null; return renderSide(); }
    order.splice(to, 0, order.splice(from, 1)[0]); drag = null; saveSettings({ sideOrder: order }); renderSide();
  });
  side.addEventListener('dragend', () => { drag = null; side.querySelectorAll('.stab.dragover').forEach((x) => x.classList.remove('dragover')); });
})();

/* ---------- Whispers ---------- */
function addWhisper(uid, login, name, text, me, plain) {
  if (!me && !plain && S.settings.alertsOn !== false && typeof text === 'string' && text.startsWith(ALERT_PREFIX)) return incomingAlert(uid, login, name, text.slice(ALERT_PREFIX.length), text);
  const th = S.whispers.get(uid) || { uid, login, name, msgs: [], last: 0 }; th.msgs.push({ text, me, ts: Date.now() }); th.last = Date.now(); S.whispers.set(uid, th);
  if (!me) { bump('whispers'); play('whisper'); yLog(`${name} whispered you: ${text.length > 70 ? text.slice(0, 70) + '…' : text}`); notifyYappy(S.settings.streamer ? 'You have a new whisper.' : `${name} whispered you: ${text.length > 70 ? text.slice(0, 70) + '…' : text}`, [{ label: 'Open', primary: true, fn: () => { openSide('whispers'); } }], 'whisper'); } else renderSide();
}
// Start (or continue) a whisper with someone: opens the Whispers tab with the reply box focused
function openWhisper(uid, login, name) {
  if (!S.whispers.has(uid)) S.whispers.set(uid, { uid, login, name: name || login, msgs: [], last: Date.now() }); else S.whispers.get(uid).last = Date.now();
  openSide('whispers'); setTimeout(() => { const i = $(`.wreply input[data-u="${uid}"]`, $('#side')); if (i) i.focus(); }, 60);
}
async function sendWhisper(uid, inp) {
  const text = inp.value.trim(); if (!text) return; inp.value = '';
  const r = await helix('whispers', { method: 'POST', query: { from_user_id: S.me.id, to_user_id: uid }, body: { message: text } });
  if (!ok(r)) { inp.value = text; return err(apiErr(r)); }
  addWhisper(uid, '', S.whispers.get(uid).name, text, true);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest && e.target.closest('.wreply')) sendWhisper(e.target.dataset.u, e.target); });
async function subWhisper() { const r = await helix('eventsub/subscriptions', { method: 'POST', body: { type: 'user.whisper.message', version: '1', condition: { user_id: S.me.id }, transport: { method: 'websocket', session_id: S.esId } } }); S.whisperSub = ok(r); }

/* ---------- Mod actions, as Twitch's own moderation feed reports them (with who did them) ---------- */
function modEventText(ev) {
  if (/_(blocked|permitted)_term$/.test(ev.action || '')) { const t = ev.automod_terms || {}, w = (t.terms || []).map((x) => '"' + x + '"').join(', '), add = /^add/.test(ev.action), bl = /blocked/.test(ev.action); return `${add ? 'added' : 'removed'} ${w || 'a word'} ${add ? 'to' : 'from'} the ${bl ? 'blocked' : 'allowed'} words`; }
  const a = ev.action, d = ev[a] || {}, u = d.user_name || d.user_login || '', why = d.reason ? ` (${d.reason})` : '';
  const T = { ban: `banned ${u}${why}`, timeout: `timed out ${u}${d.expires_at ? ' until ' + tmFmt(d.expires_at) : ''}${why}`, unban: `unbanned ${u}`, untimeout: `removed the timeout on ${u}`, delete: `deleted a message from ${u}`, clear: 'cleared chat', warn: `warned ${u}${d.reason ? ': ' + d.reason : ''}`, emoteonly: 'turned emote-only on', emoteonlyoff: 'turned emote-only off', followers: 'turned followers-only on', followersoff: 'turned followers-only off', uniquechat: 'turned unique chat on', uniquechatoff: 'turned unique chat off', slow: `turned slow mode on (${d.wait_time_seconds || ''}s)`, slowoff: 'turned slow mode off', subscribers: 'turned subscribers-only on', subscribersoff: 'turned subscribers-only off', raid: `started a raid to ${u}`, unraid: 'cancelled the raid', vip: `added VIP ${u}`, unvip: `removed VIP ${u}`, mod: `added moderator ${u}`, unmod: `removed moderator ${u}`, approve_unban_request: `approved the unban request from ${u}`, deny_unban_request: `denied the unban request from ${u}`, add_blocked_term: 'added a blocked term', add_permitted_term: 'added a permitted term', delete_blocked_term: 'removed a blocked term', delete_permitted_term: 'removed a permitted term' };
  return T[a] || a.replace(/_/g, ' ');
}
function onModEvent(login, ev) {
  const c = S.chats.get(login); if (!c) return; const a = ev.action || '', kind = /^(ban|timeout|unban|untimeout|delete|clear|warn)$/.test(a) ? a : /_(blocked|permitted)_term$/.test(a) ? 'term' : /unban_request$/.test(a) ? 'unban' : 'mode';
  const tgt = (ev[a] || {}).user_login; recordMod(login, kind, modEventText(ev), ev.moderator_user_name || ev.moderator_user_login || 'A moderator', tgt, a === 'delete' && ev.delete && ev.delete.message_body ? { msg: ev.delete.message_body, src: 'deleted' } : undefined);
  try { actedBy(c, kind, ev); } catch (e) {} // other mods' actions show who did them on the line
}

/* ---------- EventSub (live AutoMod holds and unban requests) ---------- */
// EventSub (activity events). Twitch sends a keepalive every few seconds; if none arrives within the time Twitch named, the socket is treated as dead.
// A "revocation" (for example after a new login with different permissions revoked the old token) starts a fresh session so the events come back.
let esLast = 0, esDog = 0;
function connectES(url) {
  const fresh = !url, ws = new WebSocket(url || 'wss://eventsub.wss.twitch.tv/ws'); S.es = ws; esLast = Date.now();
  ws.onmessage = (e) => {
    esLast = Date.now(); let d; try { d = JSON.parse(e.data); } catch (x) { return; } const t = d.metadata && d.metadata.message_type;
    if (t === 'session_welcome') {
      S.esId = d.payload.session.id; const ka = (d.payload.session.keepalive_timeout_seconds || 10) * 1000;
      clearInterval(esDog); esDog = setInterval(() => { if (S.es === ws && Date.now() - esLast > ka + 5000) { clearInterval(esDog); try { ws.close(); } catch (x) {} } }, 5000);
      if (fresh) { subWhisper(); S.chats.forEach((c) => { c.subbed = false; subscribeES(c); }); } if (S.esOld) { S.esOld.onclose = null; S.esOld.close(); S.esOld = null; }
    }
    else if (t === 'session_reconnect') { S.esOld = ws; connectES(d.payload.session.reconnect_url); }
    else if (t === 'notification') onES(d.metadata.subscription_type, d.payload.event);
    else if (t === 'revocation') { dbg('eventsub revoked ' + (d.payload.subscription && d.payload.subscription.status)); clearTimeout(restartES.t); restartES.t = setTimeout(restartES, 3000); }
  };
  ws.onclose = () => { if (S.es === ws && S.token) setTimeout(() => S.token && S.es === ws && connectES(), 5000); };
  return ws;
}
// A brand new EventSub session with every subscription made again (used after the login changed)
function restartES() { if (!S.token) return; const old = S.es; S.es = null; if (old) { old.onclose = null; try { old.close(); } catch (x) {} } clearInterval(esDog); S.esId = null; S.whisperSub = false; connectES(); }
async function subscribeES(c) {
  if (!S.esId || c.subbed) return; c.subbed = true;
  const sub = (type, version) => helix('eventsub/subscriptions', { method: 'POST', body: { type, version, condition: { broadcaster_user_id: c.id, moderator_user_id: S.me.id }, transport: { method: 'websocket', session_id: S.esId } } });
  sub('channel.unban_request.create', '1');
  if (hasScope('user:read:chat')) helix('eventsub/subscriptions', { method: 'POST', body: { type: 'channel.chat.notification', version: '1', condition: { broadcaster_user_id: c.id, user_id: S.me.id }, transport: { method: 'websocket', session_id: S.esId } } }); // gifted-drop notices
  for (const type of ['channel.shared_chat.begin', 'channel.shared_chat.update', 'channel.shared_chat.end']) helix('eventsub/subscriptions', { method: 'POST', body: { type, version: '1', condition: { broadcaster_user_id: c.id }, transport: { method: 'websocket', session_id: S.esId } } });
  // Version 2 says why a message was held (AutoMod category or a blocked term) and which words; fall back to version 1 if Twitch refuses it
  for (const type of ['automod.message.hold', 'automod.message.update']) sub(type, '2').then((x) => { if (!ok(x)) sub(type, '1'); });
  helix('eventsub/subscriptions', { method: 'POST', body: { type: 'channel.moderate', version: '2', condition: { broadcaster_user_id: c.id, moderator_user_id: S.me.id }, transport: { method: 'websocket', session_id: S.esId } } }).then((x) => { if (ok(x)) c.modSub = true; });
  if (hasScope('moderator:read:warnings')) sub('channel.warning.acknowledge', '1');
  if (hasScope('moderator:read:suspicious_users') || hasScope('moderator:manage:suspicious_users')) for (const type of ['channel.suspicious_user.message', 'channel.suspicious_user.update']) sub(type, '1');
  const r = await helix('moderation/unban_requests', { query: mq(c, { status: 'pending' }) });
  if (ok(r)) { ((r.json && r.json.data) || []).forEach((x) => addUnban(c.login, x.id, x.user_login, x.user_name, x.text, Date.parse(x.created_at))); renderSide(); }
}
function onES(type, ev) {
  if (type === 'user.whisper.message') return addWhisper(ev.from_user_id, ev.from_user_login, ev.from_user_name || ev.from_user_login, (ev.whisper && ev.whisper.text) || '', false);
  if (type.startsWith('channel.shared_chat.')) return onSharedEvent(type, ev);
  if (type === 'channel.warning.acknowledge') { const wc = S.chats.get((ev.broadcaster_user_login || '').toLowerCase()); if (wc) { logAct(wc, 'warn', `${ev.user_name || ev.user_login} accepted their warning`, undefined, ev.user_login); userEvent(ev.user_login, wc.login, 'warn', 'Accepted a warning'); } return; }
  if (type === 'channel.moderate') { const mc = S.chats.get((ev.broadcaster_user_login || '').toLowerCase()); return mc && chatLive(mc) ? onModEvent(mc.login, ev) : undefined; }
  const login = (ev.broadcaster_user_login || '').toLowerCase(); if (!S.chats.has(login)) return;
  if (!chatLive(S.chats.get(login))) return; // a chat you do not have open stays quiet
  const review = (tab) => ({ label: 'Review', fn: () => { openSide(tab); } });
  if (type === 'channel.chat.notification') { if (/drops/i.test(ev.notice_type || '')) dropNotice(S.chats.get(login), ev.system_message, ev.message_id); return; }
  if (type === 'automod.message.update') return amUpdate(login, ev);
  if (type.startsWith('channel.suspicious_user.')) return onSuspicious(login, type, ev);
  if (type === 'automod.message.hold') {
    const c = S.chats.get(login), info = amInfo(ev), text = (ev.message && ev.message.text) || '';
    play('automod', login); userEvent(ev.user_login, login, 'automod', `AutoMod held a message (${info.label}): ${text.slice(0, 80)}`);
    const item = { c: login, login: ev.user_login, uid: ev.user_id, id: ev.message_id, name: ev.user_name || ev.user_login, text, reason: info.label, kind: info.kind, ts: Date.now() };
    S.queue.unshift(item); if (S.queue.length > 100) S.queue.length = 100;
    const inChat = c && amLine(c, item, info, ev);
    bump('automod'); if (!inChat || !c.shown) toast(`AutoMod held a message in ${login}`, { action: review('automod'), private: true });
  } else if (type === 'channel.unban_request.create') {
    userEvent(ev.user_login, login, 'unbanreq', `Asked to be unbanned: ${(ev.text || '').slice(0, 100)}`); play('automod'); if (addUnban(login, ev.id, ev.user_login, ev.user_name, ev.text, Date.parse(ev.created_at))) bump('unbans'); toast(`${ev.user_name || ev.user_login} requested an unban in ${login}`, { action: review('unbans'), private: true });
  }
}

/* ---------- Composer wiring ---------- */
// The same behaviour for the bar at the bottom and for the box inside each chat (Settings > Chat > Message box in every chat)
function wireInput(box, onFocus) {
  box.addEventListener('input', updateAC);
  box.addEventListener('input', () => { sentPos = -1; });
  box.addEventListener('focus', () => { lastIn = box; });
  if (onFocus) box.addEventListener('focus', onFocus);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { S.ac = null; $('#ac').classList.add('hidden'); return send(); }
    if (!S.ac && e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && /\S$/.test(box.value.slice(0, box.selectionStart))) { updateAC(true); if (S.ac) return e.preventDefault(); } // Tab starts a completion even for a single letter
    if (!S.ac && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && sentNav(e.key === 'ArrowUp' ? -1 : 1)) return e.preventDefault();
    if (!S.ac) return;
    if (e.key === 'Tab') { e.preventDefault(); acceptAC(S.ac.sel); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = S.ac.items.length; S.ac.sel = (S.ac.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; drawAC(); }
    else if (e.key === 'Escape') { S.ac = null; $('#ac').classList.add('hidden'); }
  });
}
wireInput($('#input'));
$('#ac').onmousedown = (e) => { const i = e.target.closest('.aci'); if (i) { e.preventDefault(); acceptAC(+i.dataset.i); } };

/* ---------- Emote picker (modeless: stays open while you click chat) ---------- */
async function loadMine() {
  if (S.myLoaded) return; S.myLoaded = true; S.mine = []; S.myIds = new Set(); S.owners = new Map(); S.ownerInfo = new Map(); let after = '';
  for (let i = 0; i < 40; i++) {
    const r = await helix('chat/emotes/user', { query: after ? { user_id: S.me.id, after } : { user_id: S.me.id } }); if (!ok(r)) break;
    (r.json.data || []).forEach((e) => { S.mine.push(e); S.myIds.add(e.id); S.myMap.set(e.name, { src: 'twitch', url: twTemplate(r.json.template, e.id), fb: twEmote(e.id).url + ' ' + twEmote(e.id).fb }); });
    after = r.json.pagination && r.json.pagination.cursor; if (!after) break;
  }
  const ids = [...new Set(S.mine.map((e) => e.owner_id).filter((x) => x && x !== '0'))];
  for (let i = 0; i < ids.length; i += 100) { const r = await helix('users', { query: 'id=' + ids.slice(i, i + 100).join('&id=') }); ((r.json && r.json.data) || []).forEach((u) => { S.owners.set(u.id, u.display_name); S.ownerInfo.set(u.id, { name: u.display_name, avatar: u.profile_image_url, login: u.login }); }); }
}
async function openPicker(anchor) {
  if (S.pop && S.pop.node.classList.contains('epick')) return closePop();
  const c = cur(); if (!c) return;
  const n = el('div', 'epick', `<input id="ep-q" placeholder="Search emotes" spellcheck="false"><div class="eptabs"><button data-t="channel" class="on">${esc(c.name)}</button><button data-t="global">Global</button><button data-t="mine">My emotes</button></div><div class="epbody" id="ep-body"></div>`);
  popover(n, (anchor && anchor.nodeType === 1 && anchor) || (S.settings.paneInput && c.pcomp && c.pcomp.querySelector('.pemote')) || $('#emoteBtn'), { up: true, sticky: true }); let tab = 'channel';
  const byProv = (m, src) => [...m].filter(([, v]) => v.src === src && provOn(src)).map(([name, v]) => ({ name, url: v.url, fb: v.fb }));
  const sections = () => {
    if (tab === 'channel') return [[`Twitch · ${c.name}`, c.twitch.map((e) => ({ ...e, locked: c.usable ? !c.usable.has(e.id) : S.myLoaded && !S.myIds.has(e.id) }))], ['7TV', byProv(c.emotes, '7tv')], ['BetterTTV', byProv(c.emotes, 'bttv')], ['FrankerFaceZ', byProv(c.emotes, 'ffz')]];
    if (tab === 'global') return [['Twitch', S.twitchGlobal], ['7TV', byProv(S.global, '7tv')], ['BetterTTV', byProv(S.global, 'bttv')], ['FrankerFaceZ', byProv(S.global, 'ffz')]];
    return [];
  };
  // "My emotes" are split per channel, like Twitch's own emote picker: this channel first, then the others, then Twitch's own at the end
  const TYPE_LABEL = { subscriptions: 'Subscriber', follower: 'Follower', bitstier: 'Bits', rewards: 'Channel points', hypetrain: 'Hype train', limitedtime: 'Limited time' };
  const mineGroups = () => {
    const g = new Map(); (S.mine || []).forEach((e) => { const k = e.owner_id || '0'; (g.get(k) || g.set(k, []).get(k)).push(e); });
    return [...g].map(([id, list]) => { const info = id === c.id ? { name: c.name, avatar: c.avatar } : (S.ownerInfo && S.ownerInfo.get(id)) || {}; return { id, name: id === '0' ? 'Twitch' : info.name || 'Other channels', avatar: info.avatar, list }; })
      .sort((a, b) => (b.id === c.id) - (a.id === c.id) || (a.id === '0') - (b.id === '0') || a.name.localeCompare(b.name));
  };
  const drawMine = (q) => {
    const groups = mineGroups().map((gr) => ({ ...gr, list: gr.list.filter((e) => !q || e.name.toLowerCase().includes(q)) })).filter((gr) => gr.list.length);
    const nav = groups.length > 1 ? `<div class="epnav">${groups.map((gr) => `<button data-g="${esc(gr.id)}" data-tip="${esc(gr.name)}">${gr.avatar ? `<img src="${esc(gr.avatar)}" alt="">` : `<span>${esc(gr.name.slice(0, 1))}</span>`}</button>`).join('')}</div>` : '';
    return nav + groups.map((gr) => {
      const types = [...new Set(gr.list.map((e) => e.emote_type))], multi = types.length > 1;
      const grid = (l) => `<div class="egrid">${l.slice(0, 500).map((e) => { const t = twEmote(e.id); return `<button class="em" data-n="${esc(e.name)}" data-tip="${esc(e.name)}"><img class="emote" src="${esc(t.url)}" data-fb="${esc(t.fb || '')}" alt="${esc(e.name)}" referrerpolicy="no-referrer"></button>`; }).join('')}</div>`;
      return `<div class="eph" id="eg-${esc(gr.id)}">${gr.avatar ? `<img class="epav" src="${esc(gr.avatar)}" alt="">` : ''}${esc(gr.name)}${gr.id === c.id ? ' <span class="faint">(this chat)</span>' : ''} · ${gr.list.length}</div>` +
        (multi ? types.map((t) => `<div class="epsub">${esc(TYPE_LABEL[t] || 'Other')}</div>${grid(gr.list.filter((e) => e.emote_type === t))}`).join('') : grid(gr.list));
    }).join('');
  };
  const draw = () => {
    const q = $('#ep-q', n).value.trim().toLowerCase(); let html = '';
    if (tab === 'mine') { $('#ep-body', n).innerHTML = drawMine(q) || `<div class="none">${S.myLoaded && S.mine && S.mine.length ? 'No emotes found.' : 'Loading your emotes…'}</div>`; return; }
    sections().forEach(([title, items]) => {
      const f = items.filter((e) => !q || e.name.toLowerCase().includes(q)); if (!f.length) return;
      html += `<div class="eph">${esc(title)} · ${f.length}</div><div class="egrid">${f.slice(0, 500).map((e) => `<button class="em${e.locked ? ' locked' : ''}" data-n="${esc(e.name)}" data-tip="${esc(e.name)}"><img class="emote" src="${esc(e.url)}" data-fb="${esc(e.fb || '')}" alt="${esc(e.name)}" referrerpolicy="no-referrer"></button>`).join('')}</div>`;
    });
    $('#ep-body', n).innerHTML = html || `<div class="none">${tab === 'mine' && !(S.mine && S.mine.length) ? 'Loading your emotes…' : c.assetsLoaded || tab !== 'channel' ? 'No emotes found.' : 'Loading emotes…'}</div>`;
  };
  const load = async () => { if (!S.myLoaded) { await loadMine(); draw(); } };
  $('#ep-q', n).oninput = draw; $('#ep-q', n).focus(); draw(); load(); ensureAssets(c); c.onAssets = () => { if (S.pop && S.pop.node === n) draw(); };
  n.querySelectorAll('.eptabs button').forEach((b) => (b.onclick = async () => { tab = b.dataset.t; n.querySelectorAll('.eptabs button').forEach((x) => x.classList.toggle('on', x === b)); draw(); if (tab === 'mine') { await load(); draw(); } }));
  n.addEventListener('mousedown', (e) => { if (e.target.closest('.em')) e.preventDefault(); }); // keep typing focus in the chat box
  $('#ep-body', n).onclick = (e) => {
    const nv = e.target.closest('.epnav button'); if (nv) { const t = $('#eg-' + CSS.escape(nv.dataset.g), n); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const b = e.target.closest('.em'); if (!b) return; const i = inp(), p = i.selectionStart ?? i.value.length, pre = i.value.slice(0, p), sp = pre && !/\s$/.test(pre) ? ' ' : '';
    i.value = pre + sp + b.dataset.n + ' ' + i.value.slice(p); const np = (pre + sp + b.dataset.n + ' ').length; i.focus(); i.setSelectionRange(np, np);
  };
}

/* ---------- Suggest a feature & updates ---------- */
function openFeedback() {
  const n = el('div', 'stack', `<h3>Suggest a feature</h3><div class="sec">Tell the developer what would make YappyChat better. Your suggestion is sent with your Twitch name.</div><input id="f-t" placeholder="Short title" maxlength="120"><textarea id="f-d" rows="6" maxlength="3000" placeholder="What should YappyChat do, and why would it help?"></textarea><div class="row"><button class="btn" id="f-x">Cancel</button><button class="btn primary" id="f-go">Send</button></div>`);
  modal(n); $('#f-t', n).focus(); $('#f-x', n).onclick = closeModal;
  $('#f-go', n).onclick = async () => {
    const title = $('#f-t', n).value.trim(), body = $('#f-d', n).value.trim(); if (!title) return err('Add a short title first.');
    const b = $('#f-go', n); b.disabled = true; b.textContent = 'Sending…';
    const r = await cg.http({ url: Perks.API_URL + '/api/suggest', method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, name: S.me.login }) }).catch(() => null);
    if (r && ok(r)) { closeModal(); toast('Suggestion sent. Thank you!', { ms: 3000 }); return; }
    b.disabled = false; b.textContent = 'Send'; err(r && r.json && r.json.error ? r.json.error : 'Could not send it right now. Please try again later.');
  };
}
// The window asks for an update check once it is up (an answer sent while it was still loading would be lost), every 3 hours, and when you return after a while
let lastUpd = 0; const askUpdate = () => { lastUpd = Date.now(); try { cg.checkUpdate(); } catch (e) {} };
setTimeout(askUpdate, 600); setInterval(askUpdate, 3 * 3600 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastUpd > 3600 * 1000) askUpdate(); });
// The green download button beside the stream button: it slides its words out to the left for 10 seconds, then leaves just the icon
let updBtnT = 0;
function showUpdBtn(d) {
  const b = $('#updBtn'), ready = d.state === 'downloaded'; if (!b) return;
  b.classList.remove('hidden'); b.classList.toggle('ready', ready); b.dataset.ver = d.version || '';
  $('#updI').innerHTML = ico('download', 17);
  $('#updL').textContent = ready ? 'Update ready · restart' : 'Update available';
  b.dataset.tip = ready ? `YappyChat ${d.version} is downloaded. Click to restart and update` : `YappyChat ${d.version || ''} is downloading in the background`;
  b.classList.add('open'); clearTimeout(updBtnT); updBtnT = setTimeout(() => b.classList.remove('open'), 10000);
}
$('#updBtn') && ($('#updBtn').onclick = () => { const b = $('#updBtn'); if (b.classList.contains('ready')) cg.installUpdate(); else toast(`YappyChat ${b.dataset.ver || ''} is downloading in the background. It will be ready to install soon.`); });
// The bar under the login box: shows the launch check, so people know the app is looking for a newer version
let luT = setTimeout(() => { const b = $('#loginUpd'); if (b) b.classList.add('off'); }, 25000);
function loginUpd(d) {
  const bar = $('#loginUpd'); if (!bar) return; const t = $('#luText'), sp = $('#luSpin'), go = $('#luGo'); clearTimeout(luT);
  const hide = (ms) => { luT = setTimeout(() => bar.classList.add('off'), ms); };
  bar.classList.remove('off'); go.classList.add('hidden'); sp.classList.remove('done');
  if (d.state === 'checking') { t.textContent = 'Checking for updates…'; luT = setTimeout(() => bar.classList.add('off'), 25000); }
  else if (d.state === 'none') { sp.classList.add('done'); t.textContent = 'YappyChat is up to date'; hide(2800); }
  else if (d.state === 'available') t.textContent = `Downloading YappyChat ${d.version || ''}…`;
  else if (d.state === 'downloaded') { sp.classList.add('done'); t.textContent = `YappyChat ${d.version} is ready`; go.classList.remove('hidden'); go.onclick = () => cg.installUpdate(); }
  else if (/only work in the installed/.test(d.message || '')) bar.classList.add('off');
  else { t.textContent = 'Could not check for updates'; hide(3500); }
}
cg.onUpdate((d) => {
  loginUpd(d);
  if (d.state === 'downloaded') { showUpdBtn(d); toast(`YappyChat ${d.version} is ready to install.`, { ms: 60000, action: { label: 'Restart to update', fn: () => cg.installUpdate() } }); }
  else if (d.state === 'available') { showUpdBtn(d); if (S.manualCheck) toast(`Downloading YappyChat ${d.version} in the background…`); }
  else if (S.manualCheck && d.state === 'none') toast('You are on the latest version.');
  else if (S.manualCheck && d.state === 'error') err(d.message);
  if (d.state !== 'available' && d.state !== 'checking') S.manualCheck = false;
});

/* ---------- Settings ---------- */
const SET_SECTIONS = [['General', 'gear'], ['Appearance', 'spark'], ['Chat', 'chat'], ['Moderation', 'shield'], ['Filters', 'hide'], ['Highlights', 'star'], ['Saved messages', 'bolt'], ['Session', 'lines'], ['Emotes', 'smile'], ['Sounds', 'vol'], ['Yappy', 'yappy'], ['Your Perks', 'heart'], ['Security', 'lock'], ['About', 'help'], ['Account', 'user']];
const NOMOD_HIDE = new Set(['Moderation', 'Filters', 'Session']); // sections that only make sense for moderators
const oldSections = () => SET_SECTIONS.filter((x) => !(S.settings.notMod && NOMOD_HIDE.has(x[0])));
// Settings are shown as 8 groups; each group holds one or more of the original sections (shown as sub-headings), so nothing moved inside them
const SET_GROUPS = [['General', 'gear', ['General']], ['Appearance', 'spark', ['Appearance']], ['Chat', 'chat', ['Chat', 'Emotes', 'Saved messages']], ['Moderation', 'shield', ['Moderation', 'Filters', 'Session']], ['Notifications', 'bell', ['Highlights', 'Sounds', 'Yappy']], ['Account', 'lock', ['Account', 'Security']], ['Your Perks', 'heart', ['Your Perks']], ['About', 'help', ['About']]];
const setGroups = () => { const have = new Set(oldSections().map((x) => x[0])); return SET_GROUPS.map(([g, i, subs]) => [g, i, subs.filter((x) => have.has(x))]).filter((x) => x[2].length); };
const groupOf = (name) => (setGroups().find(([g, , subs]) => g === name || subs.includes(name)) || setGroups()[0]);
const setSections = () => setGroups().map(([g, i]) => [g, i]);
// Each setting row names its control for screen readers (a switch or menu on its own has no visible text of its own)
const srowName = (l) => String(l).replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();
const srow = (l, d, ctl) => {
  const c = String(ctl), m = c.match(/<(input|select)\b[^>]*>/), named = !m || /aria-label=/.test(m[0]);
  const out = named ? c : c.replace(m[0], m[0].replace(/^<(input|select)/, `<$1 aria-label="${srowName(l)}"`));
  return `<div class="srow"><div><div class="sl">${l}</div>${d ? `<div class="sd">${d}</div>` : ''}</div>${out}</div>`;
};
const sk = (k, on, extra = '') => `<label class="sw"><input type="checkbox" data-k="${k}" ${extra} ${on ? 'checked' : ''}><i></i></label>`;
// One menu for every theme: Automatic, Default, the four seasons, the holidays and Minimal
// Holiday themes only show around their dates (and while you are using one)
const themeOptions = () => { const now = new Date(), cur = themeValue(S.settings); return [['auto', 'Automatic (by date)'], ['default', 'Default'], ...Holiday.seasons.map((x) => [x.id, x.name]), ['ocean', 'Ocean blue'], ['cottoncandy', 'Cotton candy'], ['millennial', 'Millennial'], ['contrast', 'High contrast (easiest to read)'], ...Holiday.list.filter((h) => h.id === cur || h.range(now)).map((h) => [h.id, h.name]), ['minimal', 'Minimal (flat and fast)']]; };
const themeValue = (s) => ((s.palette || 'default') !== 'default' ? s.palette : (s.season || 'auto') === 'none' ? 'default' : s.season || 'auto');
const themePatch = (v) => (v === 'auto' ? { palette: 'default', season: 'auto' } : v === 'default' ? { palette: 'default', season: 'none' } : PALETTES.some((x) => x[0] === v) ? { palette: v, season: 'none' } : { palette: 'default', season: v });
const sel = (k, opts, val, num, extra = '') => `<select data-k="${k}" ${num ? 'data-num="1"' : ''} ${extra}>${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const firstOf = (m, src) => { for (const v of m.values()) if (v.src === src) return v; return null; };
function emoteDiag() {
  const c = cur(), cnt = (m) => { const o = { '7tv': 0, bttv: 0, ffz: 0 }; m.forEach((v) => { if (o[v.src] !== undefined) o[v.src]++; }); return o; }, g = cnt(S.global), h = c && cnt(c.emotes);
  const fails = Object.entries(S.imgFail).map(([h2, n]) => `${esc(h2)} (${n})`).join(', ');
  return `Global: 7TV ${g['7tv']}, BTTV ${g.bttv}, FFZ ${g.ffz}, Twitch ${S.twitchGlobal.length}` + (c ? `<br>${esc(c.name)}: 7TV ${h['7tv']}, BTTV ${h.bttv}, FFZ ${h.ffz}, Twitch ${c.twitch.length}` : '') + (fails ? `<br>Images that failed to load from: ${fails}` : '');
}
function testEmotes(out) {
  out.innerHTML = '';
  [['Twitch', S.twitchGlobal[0]], ['7TV', firstOf(S.global, '7tv')], ['BTTV', firstOf(S.global, 'bttv')], ['FFZ', firstOf(S.global, 'ffz')]].forEach(([l, e]) => {
    const row = el('div', null, e ? `${l}: testing…` : `${l}: no emote data loaded (the list request failed)`); out.append(row); if (!e) return;
    const im = new Image(); im.onload = () => (row.textContent = `${l}: images load OK`); im.onerror = () => (row.textContent = `${l}: image failed to load (${e.url})`); im.src = e.url;
  });
}
// Every keyboard shortcut in one list
const SHORTCUTS = [
  ['Around the app', [['Ctrl+K', 'Jump to a channel'], ['Ctrl+1 to 9', 'Go to that tab'], ['Ctrl+Tab', 'Next tab'], ['Ctrl+Shift+Tab', 'Previous tab'], ['Ctrl+Shift+T', 'Reopen the tab you closed'], ['Ctrl+Shift+P', 'Command panel'], ['Ctrl+,', 'Settings'], ['Ctrl+Shift+A', 'Activity rail'], ['Ctrl+Shift+E', 'Split view'], ['Ctrl+Shift+L', 'Window layouts'], ['Ctrl + / Ctrl -', 'Bigger or smaller text'], ['Ctrl+0', 'Normal text size'], ['Ctrl+Shift+F', 'Search every channel'], ['Ctrl+F', 'Search this chat'], ['Ctrl+Shift+S', 'Streamer mode'], ['Esc', 'Close a panel, window or reply']]],
  ['Typing', [['Enter', 'Send'], ['Tab', 'Complete an emote, @name or command'], ['Up / Down', 'Bring back what you sent before'], ['/', 'Start a command; the list of commands appears']]],
  ['On a message (hover it with Hover hotkeys on, or select it)', [['Alt+Up / Down', 'Select the previous or next message'], ['Shift+click', 'Pick several messages, then act on them together'], ['D', 'Delete'], ['P', 'Purge (1-second timeout)'], ['T', 'Time out'], ['Shift+T', 'Time out: pick the length and a reason'], ['B', 'Ban'], ['W', 'Warn'], ['R', 'Reply'], ['Enter', 'Open their user card']]]
];
const shortcutsHtml = () => SHORTCUTS.map(([h, l]) => `<div class="sd" style="margin-top:10px"><b>${h}</b></div><div class="kbd-grid">${l.map(([k, t]) => `<span class="kbd-k">${k}</span><span>${t}</span>`).join('')}</div>`).join('');
function settingsEffects() { syncVol(); applyTheme(); applySplit(); renderSide(); applyYappy(); renderTabs(); compileHl(); renderStats(); applyHoliday(); applyStreamer(); syncStartup(); applySecurity(); }
let lastStart = '';
function syncStartup() { const k = !!S.settings.startWin + ':' + !!S.settings.startHidden; if (k === lastStart) return; const first = lastStart === ''; lastStart = k; if (first) return; try { cg.startupSet({ on: !!S.settings.startWin, hidden: !!S.settings.startHidden }); } catch (e) {} }
lastStart = '';
function hlRows() {
  const hl = S.settings.hl || [];
  return hl.map((h, i) => `<div class="hlrow" data-i="${i}"><input class="hw" value="${esc(h.w)}" placeholder="word or pattern" spellcheck="false"><input type="color" class="hc" value="${esc(h.color || '#5b8cff')}" data-tip="Highlight colour"><label class="mini" data-tip="Treat as a regular expression"><input type="checkbox" class="hre" ${h.re ? 'checked' : ''}>regex</label><label class="mini" data-tip="Play a sound"><input type="checkbox" class="hsn" ${h.snd !== false ? 'checked' : ''}>${ico('vol', 13)}</label><button class="ibtn hx" data-tip="Remove">${ico('trash', 14)}</button></div>`).join('') || '<div class="sd">No highlight words yet.</div>';
}
// Tabs along the top of a settings group: one per sub-section (or per heading in a one-section group) to jump straight to it
function setJumpTabs(n, gname) {
  const pane = $('.spane', n), h3 = pane && pane.querySelector(':scope>h3'); if (!h3) return;
  let hs = [...pane.querySelectorAll(':scope>h4.ssub')];
  if (hs.length < 2) { const sl = [...pane.querySelectorAll(':scope>div.sl')].filter((x) => x.getAttribute('style') && x.nextElementSibling && !x.nextElementSibling.matches('textarea')); hs = sl[0] && sl[0].previousElementSibling === h3 ? sl : [h3, ...sl]; }
  if (hs.length < 2) return;
  const bar = el('div', 'sjump'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', gname + ' sections');
  hs.forEach((h, i) => { const b = el('button', i ? '' : 'on'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = h === h3 ? (h.textContent.trim() || gname) : h.textContent.trim(); b._h = h;
    b.onclick = () => { pane.scrollTo({ top: h === h3 ? 0 : h.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - bar.offsetHeight - 10, behavior: 'smooth' }); }; bar.append(b); });
  h3.after(bar);
  const mark = () => { const top = pane.getBoundingClientRect().top + bar.offsetHeight + 24; let cur = bar.firstChild; [...bar.children].forEach((b) => { if (b._h.getBoundingClientRect().top <= top) cur = b; }); if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) cur = bar.lastChild; [...bar.children].forEach((b) => { b.classList.toggle('on', b === cur); b.setAttribute('aria-selected', b === cur); }); };
  pane.addEventListener('scroll', mark, { passive: true }); setTimeout(mark, 80);
}
function openSettings(section = 'General', focus) {
  const grp = groupOf(section), sub = grp[2].includes(section) && grp[2].length > 1 ? section : null; section = grp[0];
  const s = S.settings, P = Perks.describe(S.me.id);
  const soundRows = SOUND_EVENTS.map(([ev, label, def, don]) => {
    const on = (s.soundOn || {})[ev], tone = (s.soundTone || {})[ev] || def, custom = tone === 'custom';
    return `<div class="srow"><div><div class="sl">${label}</div>${custom ? `<div class="sd">${esc((s.soundCustom || {})[ev + '_name'] || 'No file chosen')}</div>` : ''}</div><div class="row gap8"><select data-map="soundTone" data-key="${ev}">${[...Sounds.tones, ...Perks.soundTones(), ['custom', 'My own file…']].map(([v, l]) => `<option value="${v}" ${v === tone ? 'selected' : ''}>${l}</option>`).join('')}</select>${custom ? `<button class="ibtn" data-pick="${ev}" data-tip="Choose a sound file">${ico('file', 15)}</button>` : ''}<button class="ibtn" data-test="${ev}" data-tip="Play">${ico('vol', 15)}</button><label class="sw"><input type="checkbox" data-map="soundOn" data-key="${ev}" ${on === undefined ? (don ? 'checked' : '') : on ? 'checked' : ''}><i></i></label></div></div>`;
  }).join('');
  const body = {
    General: srow('How you use YappyChat', 'Sets the buttons and activity rail to suit you. Choosing again puts those back to the defaults for that choice.', sel('useAs', [['mod', 'Moderator'], ['streamer', 'Streamer'], ['viewer', 'Viewer'], ['skip', 'My own setup']], s.useAs || 'skip')) + srow('When I close the window', 'Minimise to tray keeps chat, alerts and Yappy running. Right-click the tray icon to quit.', sel('closeAction', [['quit', 'Quit YappyChat'], ['tray', 'Minimise to the tray']], s.closeAction || 'quit')) +
      srow('Start with Windows', 'Open YappyChat when you sign in to Windows.', sel('startMode', [['off', 'Off'], ['on', 'On'], ['tray', 'On, minimised to the tray']], s.startWin ? (s.startHidden ? 'tray' : 'on') : 'off')) +
      srow('Keep the stream smooth', 'Pauses Yappy\'s idle motion and glowing name effects while a stream is open, so the video gets all of the graphics card.', sk('calmStream', s.calmStream !== false)) +
      srow('Graphics acceleration', 'On is faster. If the stream buffers or stutters, try Off, then restart YappyChat.', sel('hwAccel', [['on', 'On (recommended)'], ['off', 'Off']], s.hwAccel === 'off' ? 'off' : 'on')) +
      srow('Check video decoding', 'Shows whether this PC decodes stream video on the graphics card. Useful when the stream buffers or high qualities are missing.', '<button class="btn" id="s-vid">Check</button>') +
      srow('Split view', 'Show up to 6 channels in a grid. Drag a pane header to snap it, drag an edge to resize.', sk('split', s.split)) +
      srow('Activity sidebar', 'Mentions, AutoMod, unbans, first-timers, joins, whispers, Yappy and mod actions.', sk('sidebar', s.sidebar)) +
      srow('Streamer mode', 'Blurs activity and chatter details, hides desktop notifications and mutes sounds. Ctrl+Shift+S.', sk('streamer', s.streamer)) +
      srow('Mute sounds in streamer mode', '', sk('streamerMute', s.streamerMute !== false)) +
      srow('Flash the taskbar', 'When you are away from the window, flash its taskbar button and the tray icon for a highlight, a mention or a channel going live.', sk('flashOn', s.flashOn !== false)) + srow('Live notifications', 'Sound, toast and a live dot on the tab.', sk('liveNotify', s.liveNotify)) + srow('Windows notification when live', '', sk('liveDesktop', s.liveDesktop)) + srow('Include channels you follow', 'Otherwise only open tabs are watched.', sk('liveFollowed', s.liveFollowed)) +
      `<div class="sl" style="margin-top:18px">Stream window</div>` + srow('Start muted', 'Use the player volume control to unmute.', sk('pipMuted', s.pip.muted, 'data-pip="muted"')) +
      `<div class="sd" style="margin-top:10px">Drag the stream window by its header to snap it to a screen edge or float it. The header menu sets which stream it shows: <b>Follow active tab</b> or a fixed channel.</div>`,
    Appearance: `<div class="sl" style="margin-top:6px">Colours and themes</div>` + srow('Colour mode', 'Dark, light, or Soft, which is in between and easy on the eyes.', sel('theme', [['dark', 'Dark'], ['soft', 'Soft (between light and dark)'], ['light', 'Light']], s.theme)) +
      srow('Themes', 'Seasons, colour themes and a flat Minimal look. Holiday themes appear here around their dates.', sel('themePick', themeOptions(), themeValue(s))) +
      srow('Theme colours', '', sk('holidayTheme', s.holidayTheme !== false)) + srow('Animated logo', '', sk('holidayLogo', s.holidayLogo !== false)) + srow('Yappy outfit', '', sk('holidayYappy', s.holidayYappy !== false)) +
      srow("I'm not a Moderator", 'Hides all moderator elements.', sk('notMod', !!s.notMod)) +
      srow('Save power in the background', 'Pause decorative animations while YappyChat is in the background.', sk('pauseBlur', s.pauseBlur !== false)) +
      `<div class="sl" style="margin-top:18px">Easier to see</div>` + srow('Colour vision', 'Uses status colours that are easier to tell apart.', sel('cbMode', [['off', 'Standard colours'], ['protan', 'Protanopia (red-weak)'], ['deutan', 'Deuteranopia (green-weak)'], ['tritan', 'Tritanopia (blue-yellow)']], s.cbMode || 'off')) +
      srow('Make chat name colours easier to tell apart', 'Adjusts viewer name colours for readability. Only affects your view.', sk('cbNames', s.cbNames !== false)) +
      srow('Add symbols to status colours', 'Adds symbols to status labels and underlines links.', sk('cbCues', !!s.cbCues)) +
      `<div class="sl" style="margin-top:18px">Chat lines</div>` + srow('Compact layout', 'Tighter spacing so more chat fits on screen.', sk('compact', s.compact !== false)) +
      srow('Quick look at names', 'Rest the pointer on a name for half a second to see their account age, follow age and past actions here.', sk('namePeek', s.namePeek !== false)) +
      srow('Keep deleted messages visible', 'Deleted, timed-out and banned messages stay in chat, greyed out and in italics, so you can still see what was said. Off: they show as "message deleted".', sk('showDeleted', s.showDeleted !== false)) +
      srow('Alternating backgrounds', 'Every second message is slightly lighter (darker on light themes), so lines are easier to tell apart.', sk('altRows', !!s.altRows)) +
      srow('Text size', 'Chat text size in pixels.', `<input type="range" data-k="fontSize" data-num="1" min="12" max="22" value="${s.fontSize}">`),
    Chat: srow('Message backgrounds', 'Supporters can wear a soft colour behind their messages. Hide them, or keep them still.', sel('msgBg', [['on', 'Show'], ['still', 'Show, without movement'], ['off', 'Hide']], s.msgBg || 'on')) + srow('Mod buttons', 'Delete, timeout, ban and warn icons beside each message.', sel('modButtons', [['always', 'Always visible'], ['hover', 'On hover'], ['off', 'Hidden']], s.modButtons)) +
      srow('Mod buttons side', 'Which side of each message the buttons sit on. On the right, badges like Raid and First message move to the left.', sel('modSide', [['left', 'Left'], ['right', 'Right']], s.modSide || 'left')) + srow('Hover hotkeys', 'Press D, T, B or W over a message to delete, time out, ban or warn.', sk('hoverKeys', s.hoverKeys)) +
      srow('Reply, pin and copy buttons', 'Toolbar shown when hovering a message.', sk('flyout', s.flyout !== false)) +
      srow('Show GIFs', 'Show the GIFs people send as pictures. Each one has an X to hide it.', sk('gifs', s.gifs !== false)) +
      srow('Pinned messages', 'Show a pinned message (paid Hype Chat, or one a moderator pinned) in a strip at the top of the chat. Each has an X.', sk('pins', s.pins !== false)) +
      srow('Messages from other channels', 'In a shared chat (Stream Together), show what people in the other streamers\' chats say. Off keeps only this channel\'s own chat.', sk('sharedMsgs', s.sharedMsgs !== false)) +
      srow('Your name colour', 'Change the colour Twitch shows beside your name.', '<button class="btn sm" id="s-color">Choose</button>') +
      srow('Shared chat pictures', 'Show the source channel picture beside shared chat messages.', sk('sharedAvatars', s.sharedAvatars !== false)) +
      srow('Message box in every chat', 'Gives each chat its own message box, which suits split view. The bar at the bottom, where Yappy sits, stays.', sk('paneInput', !!s.paneInput)) +
      srow('Split view layout', 'How the chats sit when more than one is open. You can also change it from the grid icon in a chat\'s header.', sel('splitLayout', SPLIT_LAYOUTS, s.splitLayout || 'grid')) +
      srow('Pause chat on hover', 'Stop scrolling while the pointer is over chat.', sk('pauseHover', s.pauseHover !== false)) +
      srow('Warn before opening links', 'Confirm before opening links in your browser.', sk('linkWarn', s.linkWarn !== false)) +
      srow('Chats in tabs you are not looking at', 'Chats that are not open do not notify or log, and catch up when opened.', sel('bgChats', [['open', 'Only chats I have open'], ['all', 'All tabs']], s.bgChats || 'open')) +
      srow('Recent messages', 'Load recent messages when a chat opens. Uses a public recent-messages service, which receives the channel name.', sk('history', s.history !== false)) +
      srow('How many recent messages', '', sel('historyCount', [[50, '50'], [100, '100'], [250, '250'], [500, '500']], s.historyCount || 100, true)) +
      srow('Track joins and parts', 'Record joins and parts for open chats. Twitch may not report them in large channels.', sk('trackJoins', s.trackJoins !== false)) +
      srow('Keep Firsts and Joins for', 'How long entries stay in those tabs. Logs are kept.', sel('feedMin', [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes']], s.feedMin || 2, true)) +
      srow('Timestamps', 'Show the time before each message.', sk('timestamps', s.timestamps)) + tsPane(s) + srow('Badges', 'Applies to new messages.', sk('badges', s.badges)) +
      srow('Emote suggestions', 'Show emote suggestions while typing. Tab still completes them.', sk('acEmotes', s.acEmotes !== false)) +
      srow('Emote size', '', sel('emoteSize', [['sm', 'Small'], ['md', 'Default'], ['lg', 'Large']], s.emoteSize)) +
      srow('Save chat logs', 'One file per channel per day.', sk('logging', s.logging)) + srow('Logs folder', '%APPDATA%\\YappyChat\\logs', '<button class="btn" id="s-logs">Open folder</button>'),
    Moderation: `<div class="sl" style="margin-top:18px">Actions</div>` + srow('Fold copy-paste spam', 'The same message again within 20 seconds adds ×2, ×3… to the first line instead of a new line. Click the count to act on everyone who sent it.', sk('foldSpam', s.foldSpam !== false)) + srow('New account badge', 'A badge beside messages from accounts made in the last 7 days (channels you moderate).', sk('newAcctBadge', s.newAcctBadge !== false)) + srow('Default timeout', 'Used by the timeout button on messages (and the T key).', sel('timeoutDefault', [[60, '1 minute'], [300, '5 minutes'], [600, '10 minutes'], [1800, '30 minutes'], [3600, '1 hour'], [86400, '1 day']], s.timeoutDefault, true)) + srow('Timeout lengths', 'The buttons on a user card and when you right-click the timeout button. For example: 1m, 10m, 1h, 1d, 1w', `<input id="s-tolens" value="${esc(toLens().map(fmtDur).join(', '))}" spellcheck="false" style="width:220px">`) + srow('Confirm before banning', 'Ask first when you use the ban button on a message.', sk('confirmBans', s.confirmBans)) + srow('Ask for a note after a ban', 'A small prompt to record why, saved as a private note on that person. You can skip it.', sk('banNote', s.banNote !== false)) + srow('Link review queue', 'Links and clips that viewers post in channels you moderate are collected in the Links tab so you can check them. Moderators and VIPs are skipped.', sk('linkQueue', s.linkQueue !== false)) + `<div class="sl" style="margin-top:14px">Sites that never need review</div><div class="sd">One site per line, like <code>youtube.com</code>. Clip links are always queued.</div><textarea data-k="linkAllow" aria-label="Allowed link domains, one per line" data-list="1" rows="3" spellcheck="false" style="width:100%;margin-top:6px">${esc((s.linkAllow || []).join('\n'))}</textarea>` +
      `<div class="sl" style="margin-top:18px">Watch list</div><div class="sd">One username per line. Their messages are highlighted, listed in Mentions and play the watch sound.</div><textarea data-k="watch" data-list="1" aria-label="Watch list, one username per line" rows="4" spellcheck="false" style="width:100%;margin-top:8px">${esc((s.watch || []).join('\n'))}</textarea>` +
      `<div class="sl" style="margin-top:18px">Saved reasons</div><div class="sd">Reasons you reuse for warnings, timeouts and bans. They appear under the reason box on a user card, in the warn menu and when you right-click the timeout button. One per line, up to 20.</div><textarea data-k="warnSaved" data-lines="1" rows="4" spellcheck="false" maxlength="10000" aria-label="Saved warnings, one per line" style="width:100%;margin-top:8px">${esc((s.warnSaved || []).join('\n'))}</textarea>` + `<div class="sl" style="margin-top:18px">Announcements</div>` + annPane(),
    Highlights: srow('Highlight my name', 'Highlight messages that mention you.', sk('hlMention', s.hlMention)) + `<div class="sl" style="margin-top:18px">Highlight words</div><div class="sd">Whole-word match, ignoring case. <code>*</code> is a wildcard (<code>Mod*</code> matches "moderator"). Tick regex for patterns.</div><div id="hl-rows">${hlRows()}</div><button class="btn sm" id="hl-add" style="margin-top:8px">${ico('plus', 14)} Add word</button>` + (hlSuggestions().length ? `<div class="sl" style="margin-top:18px">Suggested</div><div class="sd">Click one to highlight it too.</div><div class="warnchips">${hlSuggestions().map(([w, d]) => `<span class="wchip"><button data-hlsug="${esc(w)}" data-tip="${esc(d)}">${ico('plus', 12)} ${esc(w)}</button></span>`).join('')}</div>` : ''),
    Filters: `<div class="sl">AutoMod in chat</div><div class="sd">Held messages appear in chat with Allow and Deny buttons, and in the Activity panel's AutoMod tab. Applies to channels you moderate.</div>` + srow('Show held messages in chat', 'Off: held messages appear only in the AutoMod tab.', sk('amChat', s.amChat !== false)) + srow('AutoMod categories and baseline', 'Messages held for hate, harassment, sexual content and the like. Twitch does not tell apps which of its own AutoMod levels caught a message, so these are shown together.', sk('amChatAuto', s.amChatAuto !== false)) + srow('Channel blocked terms', 'Messages held because they matched a blocked or permitted term list.', sk('amChatTerms', s.amChatTerms !== false)) +
      `<div class="btnrow" style="margin-top:10px"><button class="btn" id="s-filt">Open chat filters for this channel</button></div><div class="sd" style="margin-top:6px">AutoMod levels and Twitch's blocked terms for the channel you are viewing.</div><div class="sl" style="margin-top:22px">Cover and ban lists</div>` + blockPane(s),
    'Saved messages': macroPane() + (s.notMod ? '' : `<div class="sl" style="margin-top:18px">Greetings</div><div class="sd">One greeting per line, used by the Greet button in the Firsts tab. <code>{user}</code> and <code>{channel}</code> are filled in.</div><textarea data-k="greetings" data-lines="1" rows="4" spellcheck="false" maxlength="1500" style="width:100%;margin-top:8px">${esc((s.greetings || []).join('\n'))}</textarea>`),
    Session: `<div class="sd" style="margin-bottom:6px">Choose which counters appear in the channel bar.</div>` + STAT_DEFS.map(([k, l, d]) => srow(l, '', `<label class="sw"><input type="checkbox" data-map="statsShow" data-key="${k}" ${statOn(k, d) ? 'checked' : ''}><i></i></label>`)).join(''),
    Emotes: srow('Animated emotes', 'Moving emotes are redrawn constantly and can make a stream buffer. "Still while a stream is open" shows a still picture in new messages only while a stream window is showing.', sel('emoteAnim', [['stream', 'Still while a stream is open'], ['on', 'Always animated'], ['off', 'Never animated']], s.emoteAnim || 'stream')) + srow('7TV emotes', 'Channel and global 7TV emotes. Applies to new messages.', sk('emotes7tv', s.emotes7tv)) + srow('BetterTTV emotes', '', sk('emotesBttv', s.emotesBttv)) + srow('FrankerFaceZ emotes', '', sk('emotesFfz', s.emotesFfz)) + srow('Zero-width emotes', 'Let overlay emotes sit on top of the previous emote.', sk('zeroWidth', s.zeroWidth)) +
      `<div class="sl" style="margin-top:16px">Emotes loaded</div><div class="sd" id="emo-diag">${emoteDiag()}</div><div class="btnrow" style="margin-top:10px"><button class="btn sm" id="emo-reload">Reload emotes</button><button class="btn sm" id="emo-test">Test emote images</button></div><div class="sd" id="emo-out" style="margin-top:8px"></div>`,
    Sounds: srow('Volume', 'For every YappyChat sound.', `<input type="range" data-k="volume" data-num="1" min="0" max="1" step="0.05" value="${s.volume}">`) + srow('Cooldown', 'Minimum time before the same alert can sound again. Sounds never overlap. Activity tabs still list everything.', sel('soundCooldown', [[0, 'None'], [5, '5 seconds'], [10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '1 minute']], s.soundCooldown === undefined ? 10 : s.soundCooldown, true)) + soundRows + `<div class="sd" style="margin-top:8px">"My own file" accepts an mp3, wav or ogg up to 500 KB and 5 seconds.</div>`,
    Yappy: `<div class="about"><div id="set-yappy" style="width:90px"></div><div class="sd">Yappy suggests actions when he spots patterns such as spam or raids. Nothing happens without your confirmation. Notices are kept in the Activity panel.</div></div>` +
      srow('Show Yappy', 'The mascot in the corner.', sk('yappyShow', s.yappyShow)) + srow('Yappy tells you about notices', 'Raids, whispers, ban-list matches and the like. Off (the default): they wait quietly in the Yappy section of the activity rail.', sk('yappyNotify', !!s.yappyNotify)) + srow('Suggestions', 'Yappy suggests actions when he spots spam, raids or repeat offenders.', sk('yappySuggest', s.yappySuggest !== false)) + srow('Buzz on notifications', 'Yappy shakes and goes cross-eyed when something needs your attention.', sk('yappyBuzz', s.yappyBuzz !== false)) + srow('Position', 'Yappy sits beside the Chat button, as tall as it. Drag him anywhere you like and the bar takes the full width. Notices always appear at the bottom middle of the window.', '<button class="btn" id="y-reset">Put back by the Chat button</button>') +
      `<div class="sl" style="margin-top:18px">What goes to the Yappy section</div><div class="sd">Switched off, a notice is not kept or shown at all.</div>` + YAPPY_KINDS.filter(([k]) => k !== 'live').map(([k, l, d]) => srow(l, d, `<label class="sw"><input type="checkbox" data-map="yappyKinds" data-key="${k}" ${(s.yappyKinds || {})[k] !== false ? 'checked' : ''}><i></i></label>`)).join(''),
    'Your Perks': `<div id="yp-body">${Perks.selectorHtml()}</div>`,
    Security: securityPane(s),
    About: `<div class="about"><img src="assets/yappy.png" alt=""><div><div class="sl">YappyChat <span id="ver"></span></div><div class="sd">Twitch moderation chat client.</div></div></div>` + srow('Updates', 'Checked automatically every few hours.', '<div class="row gap8"><button class="btn" id="s-upd">Check for updates</button><button class="btn" id="s-new">What\'s new</button></div>') + srow('Tour', 'Short tour of the main window.', '<button class="btn" id="s-tour">Replay the tour</button>') + srow('Window layout', 'Save the current layout, or restore the default. Saved layouts are listed in the command palette (Ctrl+Shift+P).', '<div class="row gap8"><button class="btn" id="s-lsave">Save current</button><button class="btn" id="s-lay">Reset</button></div>') + srow('Start fresh', 'Erase settings and login, then restart as a new install. Chat logs are kept.', '<button class="btn danger" id="s-fresh">Start fresh</button>') + 
      `<div class="sl" style="margin-top:16px">Shortcuts</div>${shortcutsHtml()}` + permissionsPane(),
    Account: srow('Signed in as', 'Twitch', `<b>${esc(S.me.login)}</b>`) + srow('Back up settings', 'Save your settings, highlights, notes, macros and layouts to a file, to keep or to load on another PC. Your login and app lock are not included.', '<div class="row gap8"><button class="btn sm" id="s-bk">Save a backup</button><button class="btn sm" id="s-rs">Load a backup</button></div>') + srow('Blocked users', 'See and unblock the people you blocked on Twitch.', '<button class="btn sm" id="s-blocked">Open</button>') + srow('Share anonymous usage statistics', 'Send anonymous usage statistics to help improve YappyChat: app version, theme and which features are used. No chat messages, channel names or account details are sent.', sk('sharePing', s.sharePing)) + srow('Send crash reports', 'If YappyChat crashes, send a short report the next time it starts: the error, the app and Windows versions. Tokens, names, chat and settings are removed first. It is also kept in the diagnostics log on your computer.', sk('crashReports', s.crashReports !== false)) + srow('Diagnostics log', 'Errors YappyChat noticed, with logins and tokens removed. Attach it to a bug report.', '<button class="btn" id="s-diag">Show the file</button>') + srow('Log out', 'Sign in again to continue.', '<button class="btn danger" id="s-out">Log out</button>')
  };
  const n = el('div', 'settings', `<div class="snav">${setSections().map(([x, i]) => `<button data-s="${x}" class="${x === section ? 'on' : ''}">${ico(i, 15)}<span>${x}</span></button>`).join('')}</div><div class="spane"><h3>${esc(section)}</h3>${grp[2].length === 1 ? body[grp[2][0]] : grp[2].map((x) => `<h4 class="ssub" id="ss-${x.replace(/\W+/g, '-').toLowerCase()}">${x === 'Session' ? 'Session Information' : esc(x)}</h4>${body[x]}`).join('')}</div>`);
  $('.snav', n).insertAdjacentHTML('beforeend', `<button class="btn support" id="s-support">Support Yappy</button>`);
  $('.snav', n).insertAdjacentHTML('afterbegin', `<input class="ssearch" id="s-find" type="search" placeholder="Search settings" spellcheck="false" autocomplete="off" aria-label="Search settings">`);
  modal(n);
  // Search: every setting's name and description, across all sections
  { let idx = null; const find = $('#s-find', n), pane = $('.spane', n), orig = pane.innerHTML;
    const build = () => { idx = []; oldSections().forEach(([sec]) => { const t = document.createElement('div'); t.innerHTML = body[sec] || ''; t.querySelectorAll('.srow').forEach((r) => { const l = r.querySelector('.sl'), d = r.querySelector('.sd'); if (l) idx.push([sec, l.textContent.trim(), d ? d.textContent.trim() : '']); }); }); };
    find.oninput = () => {
      const q = find.value.trim().toLowerCase(); if (!q) { pane.innerHTML = orig; return openSettings(section); }
      if (!idx) build(); const words = q.split(/\s+/), hits = idx.filter(([s0, l, d]) => words.every((w) => (s0 + ' ' + l + ' ' + d).toLowerCase().includes(w))).slice(0, 40);
      pane.innerHTML = `<h3>Settings matching “${esc(find.value.trim())}”</h3>` + (hits.map(([s0, l, d]) => `<button class="sres" data-sec="${esc(s0)}" data-l="${esc(l)}"><span class="faint">${esc(groupOf(s0)[0])}${groupOf(s0)[0] !== s0 ? ' › ' + esc(s0) : ''}</span><b>${esc(l)}</b>${d ? `<span class="sd">${esc(d.length > 140 ? d.slice(0, 139) + '…' : d)}</span>` : ''}</button>`).join('') || '<div class="faint">Nothing matches. Try another word.</div>');
      pane.querySelectorAll('.sres').forEach((b) => (b.onclick = () => openSettings(b.dataset.sec, b.dataset.l)));
    };
  }
  setJumpTabs(n, grp[0]);
  if (sub && !focus) setTimeout(() => { const h = n.querySelector('#ss-' + sub.replace(/\W+/g, '-').toLowerCase()); if (h) h.scrollIntoView({ block: 'start' }); }, 30);
  if (focus) setTimeout(() => { const r = [...n.querySelectorAll('.spane .srow')].find((x) => { const l = x.querySelector('.sl'); return l && l.textContent.trim() === focus; }); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('sfound'); setTimeout(() => r.classList.remove('sfound'), 2200); } }, 60);
  n.querySelectorAll('.snav button').forEach((b) => (b.onclick = () => openSettings(b.dataset.s)));
  n.querySelectorAll('[data-k],[data-map]').forEach((i) => {
    const h = () => {
      const v = i.type === 'checkbox' ? i.checked : i.dataset.list ? i.value.split('\n').map((x) => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean) : i.dataset.lines ? i.value.split('\n').map((x) => x.trim()).filter(Boolean) : i.dataset.num ? +i.value : i.value;
      if (i.dataset.map) { saveSettings({ [i.dataset.map]: { ...(S.settings[i.dataset.map] || {}), [i.dataset.key]: v } }); if (i.dataset.map === 'soundTone') { if (v === 'custom') openSettings(section); else playSound(v, i.dataset.key); } }
      else if (i.dataset.k === 'themePick') saveSettings(themePatch(v));
      else if (i.dataset.k === 'useAs') { if (v !== 'skip') applyUseAs(v); else saveSettings({ useAs: 'skip' }); setTimeout(() => openSettings('General'), 50); }
      else if (i.dataset.k === 'startMode') saveSettings({ startWin: v !== 'off', startHidden: v === 'tray' });
      else if (i.dataset.k === 'hwAccel') { saveSettings({ hwAccel: v }); toast('Restart YappyChat to apply this.', { ms: 6000 }); }
      else if (i.dataset.pip) savePip({ [i.dataset.pip]: v }); else { const was = S.settings.split; saveSettings({ [i.dataset.k]: v }); if (i.dataset.k === 'notMod' && !v && requiredScopes().some((x) => !hasScope(x))) setTimeout(() => regrant('moderator tools', null).then((okk) => { if (!okk) { saveSettings({ notMod: true }); document.body.classList.add('nomod'); } renderSide(); }), 50); if (i.dataset.k === 'split' && v && !was) seedSplit();  if (i.dataset.k === 'bgChats') syncJoins(); if (i.dataset.k === 'paneInput') applyPaneInput(); }
      settingsEffects();
    };
    i.addEventListener(i.tagName === 'TEXTAREA' || i.type === 'range' ? 'input' : 'change', h);
  });
  n.querySelectorAll('[data-test]').forEach((b) => (b.onclick = () => { const ev = b.dataset.test, d = SOUND_EVENTS.find((x) => x[0] === ev); playSound((S.settings.soundTone || {})[ev] || d[2], ev); }));
  n.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = async () => { const r = await cg.pickSound(); if (!r) return; if (r.error) return err(r.error); const dur = await new Promise((res) => { const a = new Audio(r.dataUrl); a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); setTimeout(() => res(0), 4000); }); if (!dur) return err('That file could not be read as audio.'); if (dur > 5.05) return err(`That sound is ${dur.toFixed(1)} seconds long. The limit is 5 seconds.`); const sc = { ...(S.settings.soundCustom || {}), [b.dataset.pick]: r.dataUrl, [b.dataset.pick + '_name']: r.name, [b.dataset.pick + '_dur']: dur }; saveSettings({ soundCustom: sc }); playSound('custom', b.dataset.pick); openSettings(section); }));
  const on = (id, fn) => { const b = $(id, n); if (b) b.onclick = fn; };
  on('#y-reset', () => { saveSettings({ yappyPos: null }); Yappy.place(null); toast('Yappy is back beside the Chat button', { ms: 1800 }); });
  on('#s-color', () => { closeModal(); colorPicker(); });
  on('#s-blocked', () => { closeModal(); blockedWin(); });
  on('#s-filt', () => { const c = cur(); if (!c) return err('Open a channel first.'); moreTool(c, 'filters'); });
  on('#s-lsave', () => askText('Save window layout', 'Layout name', 'Save', (v) => saveLayout(v)));
  on('#s-fresh', () => { if (confirm('Erase all YappyChat settings and log out, then restart as a fresh install? Your chat logs are kept.')) cg.startFresh(); }); on('#s-tour', () => { closeModal(); setTimeout(startTour, 150); }); on('#s-lay', () => { closeModal(); resetLayout(); });
  on('#s-vid', () => { cg.videoInfo().then((v) => { const d = v.devices.map((x) => `${x.active ? '* ' : ''}vendor ${x.vendor} device ${x.device} driver ${x.driver || '?'}`).join('; ') || 'unknown'; const m = `Video decoding: ${v.status.video_decode || 'unknown'}. Graphics drawing: ${v.status.gpu_compositing || 'unknown'}. Acceleration setting: ${S.settings.hwAccel === 'off' ? 'Off' : 'On'}. Graphics: ${d}. Chromium ${v.chromium}, Electron ${v.electron}.`; toast(m, { ms: 30000 }); try { dbg(m); } catch (e) {} }).catch(() => toast('Could not read the video information.')); });
  { const tl = $("#s-tolens", n); if (tl) tl.onchange = () => { const l = tl.value.split(/[,\s]+/).map(parseDur).filter(Boolean); if (!l.length) { tl.value = toLens().map(fmtDur).join(', '); return err('Use lengths like 1m, 10m, 1h, 1d'); } saveSettings({ toPresets: l.slice(0, 8) }); tl.value = toLens().map(fmtDur).join(', '); toast('Timeout lengths saved', { ms: 1500 }); }; }
  on('#s-bk', backupSettings); on('#s-rs', restoreSettings);
  n.querySelectorAll('[data-hlsug]').forEach((b) => (b.onclick = () => { addHl(b.dataset.hlsug); openSettings('Highlights'); }));
  on('#s-new', () => { cg.version().then((v) => { closeModal(); setTimeout(() => showWhatsNew(v), 150); }); });
  on('#s-logs', () => cg.openLogs()); on('#s-diag', () => cg.openDiagnostics && cg.openDiagnostics()); on('#s-out', logout); on('#s-support', () => Perks.openShop()); on("#s-tip", () => Perks.openShop());
  on('#s-perk', async () => { await Perks.load(true); toast('Supporter list refreshed', { ms: 2000 }); });
  on('#s-upd', () => { S.manualCheck = true; toast('Checking for updates…'); cg.checkUpdate(); });
  on('#emo-reload', async () => { toast('Reloading emotes…'); await reloadEmotes(); $('#emo-diag', n).innerHTML = emoteDiag(); });
  on('#emo-test', () => testEmotes($('#emo-out', n)));
  const bl = $('#bl-text', n); if (bl) bl.addEventListener('input', () => { saveSettings({ blacklist: bl.value.split('\n').map((x) => x.trim()).filter(Boolean) }); compileHl(); });
  const hr = $('#hl-rows', n);
  if (hr) {
    const upd = () => { const rows = [...hr.querySelectorAll('.hlrow')].map((r) => ({ w: r.querySelector('.hw').value.trim(), color: r.querySelector('.hc').value, re: r.querySelector('.hre').checked, snd: r.querySelector('.hsn').checked })); saveSettings({ hl: rows.filter((r) => r.w) }); compileHl(); };
    hr.addEventListener('input', upd); hr.addEventListener('change', upd);
    hr.addEventListener('click', (e) => { const x = e.target.closest('.hx'); if (!x) return; x.closest('.hlrow').remove(); upd(); if (!hr.querySelector('.hlrow')) hr.innerHTML = hlRows(); });
    on('#hl-add', () => { const hl = [...(S.settings.hl || []).filter((h) => h.w), { w: '', color: '#5b8cff', re: false, snd: true }]; S.settings.hl = hl; hr.innerHTML = hlRows(); const w = hr.querySelectorAll('.hw'); w[w.length - 1].focus(); });
  }
  bindMacros(n); bindAnns(n); bindBans(n); bindTs(n); bindSecurity(n, section);
  if ($('#ver', n)) cg.version().then((v) => { $('#ver', n).textContent = 'v' + v; });
  if ($('#set-yappy', n)) Yappy.mount($('#set-yappy', n), { follow: true });
  const yp = $('#yp-body', n); if (yp) { const rerender = () => { yp.innerHTML = Perks.selectorHtml(); Perks.bindSelector(yp, rerender); }; Perks.bindSelector(yp, rerender); }
}

/* ---------- Activity sidebar width (drag the edge) ---------- */
function applySideW() { const fold = sideFolded(), rail = $('.srail'); document.documentElement.style.setProperty('--sidew', fold ? ((rail && rail.offsetWidth) || 52) + 'px' : Math.max(300, Math.min(720, +S.settings.sideW || 340)) + 'px'); $('#sideGrip').classList.toggle('hidden', !S.settings.sidebar || fold); }
(function () {
  const g = $('#sideGrip'); let drag = false;
  g.addEventListener('pointerdown', (e) => { drag = true; g.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); });
  g.addEventListener('pointermove', (e) => { if (!drag) return; const r = $('.main').getBoundingClientRect(), w = Math.max(300, Math.min(Math.min(720, innerWidth - 440), r.right - e.clientX)); S.settings.sideW = Math.round(w); applySideW(); });
  const end = () => { if (!drag) return; drag = false; document.body.classList.remove('resizing'); saveSettings({ sideW: S.settings.sideW }); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('dblclick', () => { saveSettings({ sideW: 340 }); applySideW(); });
})();

// 'See what's notified' at the bottom of the Live and Yappy sections: what lands there, and what also pops up
function openNotifPop(k, anchor) {
  const s = S.settings, kinds = s.yappyKinds || {};
  const row = (attr, on, l, d) => `<label class="nrow"><span><b>${l}</b>${d ? `<span class="sd">${d}</span>` : ''}</span><span class="sw"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><i></i></span></label>`;
  const body = k === 'live'
    ? `<h3>${ico('tv', 16)} Live notifications</h3><div class="sd">Channels going live are always listed here: your open tabs${s.liveFollowed ? ' and the channels you follow' : ''}.</div>` +
      row('data-s="liveFollowed"', s.liveFollowed, 'Include channels you follow', 'Otherwise only your open tabs') +
      row('data-s="liveNotify"', s.liveNotify, 'Sound and pop-up', 'When a channel goes live') +
      row('data-s="liveDesktop"', s.liveDesktop, 'Windows notification', 'Shows even when YappyChat is in the background') +
      row('data-kind="live"', kinds.live !== false, 'Count when you log in', 'How many of your channels are live')
    : `<h3>${ico('yappy', 16)} Yappy's notices</h3><div class="sd">Raids, whispers and Yappy's tips are kept here. Live channels have their own section.</div>` +
      row('data-s="yappyNotify"', !!s.yappyNotify, 'Yappy also tells you', 'He says it (or a pop-up appears) as it happens') +
      row('data-s="yappySuggest"', s.yappySuggest !== false, 'Suggestions', 'Actions for spam, raids and repeat offenders') +
      `<div class="sl" style="margin-top:8px">Keep these</div>` + YAPPY_KINDS.filter(([x]) => x !== 'live').map(([x, l, d]) => row(`data-kind="${x}"`, kinds[x] !== false, l, d)).join('');
  const n = el('div', 'stack notifpop', body);
  popover(n, anchor, { toggle: true });
  n.onchange = (e) => {
    const i = e.target; if (i.dataset.s) saveSettings({ [i.dataset.s]: i.checked });
    else if (i.dataset.kind) saveSettings({ yappyKinds: { ...(S.settings.yappyKinds || {}), [i.dataset.kind]: i.checked } });
  };
}

document.addEventListener('change', (e) => { if (e.target.id === 'ub-view') { S.ubView = e.target.value; renderSide(); } else if (e.target.id === 'ma-f') { S.maFilter = e.target.value; renderSide(); } else if (e.target.id === 'am-f') { S.amF = e.target.value; renderSide(); } else if (e.target.id === 'am-view') { S.amView = e.target.value; renderSide(); } else if (e.target.id === 'am-chan') { S.amChan = e.target.value; renderSide(); } else if (e.target.id === 'ma-range') { S.maRange = e.target.value; renderSide(); } else if (e.target.id === 'ma-chan') { S.maChan = e.target.value; renderSide(); } });
// Typing in the Mod activity or AutoMod search redraws only that list, so the box keeps its focus
document.addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('secq')) { S.secQ = { ...(S.secQ || {}), [e.target.dataset.q]: e.target.value }; return secFilter(e.target.dataset.q); }
  if (e.target.id === 'ma-q') { S.maQ = e.target.value; const l = document.querySelector('.ssec[data-k=modact] .slist'); if (l) l.innerHTML = modActView().items; }
  else if (e.target.id === 'am-q') { S.amQ = e.target.value; const l = document.querySelector('.ssec[data-k=automod] .slist'); if (l) l.innerHTML = amView((k, i) => `<button class="ibtn sm xdel" data-a="dis" data-k="${k}" data-i="${i}" data-tip="Dismiss" aria-label="Dismiss">${ico('x', 13)}</button>`, (t) => `<div class="none">${t}</div>`).items; }
});
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#ma-save')) saveModReport(); });
