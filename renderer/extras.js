'use strict';
/* ---------- Moderator tools: user timeline, shift log, macros, command palette, raid banner, channel notes and rules,
   scheduled announcements, shared ban list, search across channels, link review queue ---------- */

const pad2 = (n) => String(n).padStart(2, '0');
const weekOf = (ts = Date.now()) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const expandMacro = (t, c) => String(t || '').replace(/\{(channel|streamer)\}/gi, c ? c.name : '').replace(/\{me\}/gi, S.me ? S.me.login : '');
const slow = (key, fn, ms = 4000) => { slow.t = slow.t || {}; clearTimeout(slow.t[key]); slow.t[key] = setTimeout(fn, ms); };

/* ===== 1. Per-user timeline (bans, timeouts, deletes, warnings, AutoMod holds, unban requests across all your channels) ===== */
const tlMap = () => (S.tl || (S.tl = new Map(Object.entries(S.settings.tl || {}))));
function userEvent(login, chan, kind, text, by) {
  login = String(login || '').toLowerCase(); if (!login) return;
  const m = tlMap(), a = m.get(login) || [];
  a.unshift({ ts: Date.now(), c: chan, kind, text: String(text || '').slice(0, 200), by: by || '' }); if (a.length > 100) a.length = 100;
  m.delete(login); m.set(login, a); while (m.size > 600) m.delete(m.keys().next().value);
  slow('tl', () => saveSettings({ tl: Object.fromEntries(m) }));
}
const userEvents = (login) => tlMap().get(String(login).toLowerCase()) || [];

/* ===== 2. Mod shift log: weekly totals per moderator ===== */
const SHIFT_COLS = [['ban', 'Bans'], ['timeout', 'Timeouts'], ['delete', 'Deleted messages'], ['warn', 'Warnings']];
const SHIFT_ICON = { ban: 'ban', timeout: 'clock', delete: 'trash', warn: 'warn' };
function countShift(by, kind, chan) {
  by = String(by || '').toLowerCase(); if (!by) return;
  const k = ['ban', 'timeout', 'delete', 'warn', 'unban', 'untimeout', 'clear'].includes(kind) ? kind : 'mode';
  const sh = S.settings.shifts || (S.settings.shifts = {}), w = weekOf(), wk = sh[w] || (sh[w] = {}), r = wk[by] || (wk[by] = {}); r[k] = (r[k] || 0) + 1;
  if (chan) { const sc = S.settings.shiftsC || (S.settings.shiftsC = {}), cw = sc[w] || (sc[w] = {}), cc = cw[chan] || (cw[chan] = {}), cr = cc[by] || (cc[by] = {}); cr[k] = (cr[k] || 0) + 1; const ks = Object.keys(sc).sort(); while (ks.length > 12) delete sc[ks.shift()]; }
  const keys = Object.keys(sh).sort(); while (keys.length > 12) delete sh[keys.shift()];
  slow('shifts', () => saveSettings({ shifts: S.settings.shifts, shiftsC: S.settings.shiftsC || {} }), 8000);
}
// Every moderation event, from my own actions and from Twitch's moderation feed, passes through here
// The message behind an action: what was deleted, what AutoMod held, or the person's last message before a timeout, ban or warning
function actMsg(chan, kind, target, extra) {
  if (extra && extra.msg) return { msg: String(extra.msg).slice(0, 300), src: extra.src || (kind === 'delete' ? 'deleted' : 'chat') };
  const tl = String(target || '').toLowerCase(); if (!tl || !/^(ban|timeout|warn|delete)$/.test(kind)) return {};
  const now = Date.now(), am = [...(S.amHist || []), ...S.queue].find((x) => x.c === chan && String(x.login).toLowerCase() === tl && now - (x.at || x.ts) < 120000);
  if (am) return { msg: am.text, src: 'automod' };
  const c = S.chats.get(chan), u = c && c.users.get(tl), last = u && u.msgs && u.msgs[u.msgs.length - 1];
  return last && now - last.ts < 30 * 60000 ? { msg: String(last.text).slice(0, 300), src: 'chat' } : {};
}
function recordMod(chan, kind, text, by, target, extra) {
  // One action can arrive twice: from your own click or the chat itself, and from Twitch's moderation feed (which knows who did it). Keep one line, with the name.
  const now = Date.now(), tl = String(target || '').toLowerCase(), dup = S.modlog.find((x) => x.c === chan && x.kind === kind && String(x.target || '').toLowerCase() === tl && now - x.ts < 8000 && (kind !== 'mode' || x.text === text));
  const am = actMsg(chan, kind, target, extra);
  if (dup) { if (by && !dup.by) { dup.by = by; dup.text = text; } if (am.msg && (!dup.msg || am.src === 'deleted' || am.src === 'automod')) { dup.msg = am.msg; dup.src = am.src; } if (sideShows('modact')) renderSide(); return; }
  S.modlog.unshift({ ts: now, c: chan, kind, text, by: by || '', target: target || '', msg: am.msg || '', src: am.src || '' }); if (S.modlog.length > 2000) S.modlog.length = 2000; // the whole session, for the history view
  if (kind !== 'mode') bump('modact');
  if (kind === 'timeout' && target) { const tc = S.chats.get(chan); if (tc) { (tc.toAt = tc.toAt || new Map()).set(String(target).toLowerCase(), Date.now()); } } // a badge on their next messages
  try { modSuggest(chan, kind, target, by); } catch (e) {}
  if (target) userEvent(target, chan, kind, by ? `${by} ${text}` : text, by);
  countShift(by || (S.me && S.me.login), kind, chan); dashMod(chan, kind, by);
  if (sideShows('modact')) renderSide();
}
// Weekly totals for one channel (weeks counted before per-channel tracking only exist for all channels together)
function weekRows(w, chan) {
  const sc = (S.settings.shiftsC || {})[w], wk = (chan && sc ? sc[chan] : (S.settings.shifts || {})[w]) || {};
  return Object.entries(wk).map(([mod, r]) => ({ mod, ...r, total: (r.ban || 0) + (r.timeout || 0) + (r.delete || 0) + (r.warn || 0) })).sort((a, b) => b.total - a.total || a.mod.localeCompare(b.mod));
}
const curLogin = () => S.active || '', curName = () => { const c = S.chats.get(S.active); return c ? c.name : 'this chat'; };
function modlogView() {
  const own = !!S.me && curLogin() === S.me.login, v = own ? S.modView || 'feed' : 'feed', none = (s) => `<div class="none">${s}</div>`; // weekly totals per moderator: the streamer's own channel only
  const tabs = !own ? '' : `<div class="seg"><button data-a="mv-feed" class="${v === 'feed' ? 'on' : ''}">Feed</button><button data-a="mv-week" class="${v === 'week' ? 'on' : ''}">Weekly totals</button></div>`;
  if (v === 'feed') return { head: tabs, items: S.modlog.map((x, i) => x.c === curLogin() ? { x, i } : null).filter(Boolean).map(({ x, i }) => { const c = S.chats.get(x.c), canUndo = (x.kind === 'ban' || x.kind === 'timeout') && x.target && c && isMod(c) && !x.undone; return `<div class="sitem ydel log${x.undone ? ' undone' : ''}">${xd('modlog', i)}<div class="lgmain"><div class="meta"><b>${ico(KIND_ICON[x.kind] || 'file', 13)} ${esc(x.c)}</b><span>${tmFmt(x.ts)}</span></div><div>${x.by ? `<b>${esc(x.by)}</b> ` : ''}${esc(x.text)}${x.undone ? ' <i class="faint">(undone)</i>' : ''}</div></div>${canUndo ? `<button class="ibtn undo" data-a="mv-undo" data-i="${i}" data-tip="Undo: lift this ${x.kind === 'ban' ? 'ban' : 'timeout'} on ${esc(x.target)}" aria-label="Undo">${ico('undo', 16)}</button>` : ''}</div>`; }).join('') || none(curLogin() ? `Bans, timeouts, deletes and chat changes in ${esc(curName())}, with who did each one. Switch chat to see another channel's.` : 'Open a channel to see its moderation actions.') };
  const weeks = Object.keys(S.settings.shifts || {}).sort().reverse(), w = weeks.includes(S.modWeek) ? S.modWeek : weeks[0] || weekOf(), rows = weekRows(w, curLogin());
  const sel = `<div class="srow2 wk"><select id="mv-week">${(weeks.length ? weeks : [w]).map((x) => `<option value="${x}" ${x === w ? 'selected' : ''}>Week of ${x}</option>`).join('')}</select><button class="btn sm" data-a="mv-copy">Copy report</button></div>`;
  const table = rows.length ? `<table class="shift"><tr><th>Moderator</th>${SHIFT_COLS.map(([k, l]) => `<th data-tip="${l}" aria-label="${l}">${ico(SHIFT_ICON[k], 15)}</th>`).join('')}<th data-tip="Total actions" aria-label="Total">&Sigma;</th></tr>${rows.map((r) => `<tr><td>${esc(r.mod)}</td>${SHIFT_COLS.map(([k]) => `<td>${r[k] || 0}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table><div class="sd" style="padding:8px 4px">Counts actions seen in ${esc(curName())} while YappyChat was open. Weeks start on Monday and the last 12 are kept.</div>` : none('No moderation actions have been counted for this week yet.');
  return { head: tabs + sel, items: table };
}
async function modUndo(i) {
  const x = S.modlog[i], c = x && S.chats.get(x.c); if (!x || !c || !x.target) return;
  const uid = await idOf(x.target); if (!uid) return err(`User "${x.target}" was not found.`);
  if (await unban(c, uid, x.target)) { x.undone = true; renderSide(); }
}
function modViewAct(a, i) {
  if (a === 'mv-undo') return modUndo(+i);
  if (a === 'mv-feed' || a === 'mv-week') { S.modView = a === 'mv-feed' ? 'feed' : 'week'; return renderSide(); }
  if (a === 'mv-copy') {
    const w = S.modWeek || Object.keys(S.settings.shifts || {}).sort().reverse()[0] || weekOf(), rows = weekRows(w, curLogin());
    const txt = `Mod report, week of ${w}\n` + ['Moderator', ...SHIFT_COLS.map((x) => x[1]), 'Total'].join('\t') + '\n' + rows.map((r) => [r.mod, ...SHIFT_COLS.map(([k]) => r[k] || 0), r.total].join('\t')).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Report copied', { ms: 2000 }));
  }
}
document.addEventListener('change', (e) => { if (e.target.id === 'mv-week') { S.modWeek = e.target.value; renderSide(); } });

/* ===== 3. Macros (saved quick replies) ===== */
const macros = () => S.settings.macros || [];
function runMacro(m) {
  const c = cur(); if (!c) return err('Open a channel first.');
  const i = inp(); i.value = expandMacro(m.t, c); if (m.s) send(); else i.focus();
}
function openMacroMenu(anchor) {
  const list = macros().filter((m) => m.n && m.t);
  const n = el('div', 'stack', `<h3>Macros</h3>` + (list.length ? list.map((m, i) => `<button class="btn macroi" data-i="${i}"><b>${esc(m.n)}</b><span>${esc(m.t.slice(0, 60))}</span>${m.s ? '<i class="jtag in">sends</i>' : ''}</button>`).join('') : '<div class="sd">No macros yet. Save messages you send often, like rules reminders or links.</div>') + `<button class="btn primary" id="mc-edit">${list.length ? 'Edit macros' : 'Create a macro'}</button>`);
  popover(n, anchor, { up: true });
  n.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closePop(); if (b.id === 'mc-edit') return openSettings('Saved messages'); runMacro(list[+b.dataset.i]); };
}
function macroRows() {
  const l = macros(); if (!l.length) return '<div class="sd">No macros yet.</div>';
  return l.map((m) => `<div class="mrow"><input class="mn" placeholder="Name" value="${esc(m.n)}" maxlength="30"><input class="mt" placeholder="Message… ({channel} {me} are filled in)" value="${esc(m.t)}" maxlength="500"><label class="chk" data-tip="Send straight away instead of just filling the message box"><input type="checkbox" class="ms" ${m.s ? 'checked' : ''}> Send</label><button class="hx ibtn" data-tip="Remove">${ico('x', 14)}</button></div>`).join('');
}
const macroPane = () => `<div class="sd">Saved messages you can drop into chat from the lightning-bolt button next to the message box, or from the command palette (Ctrl+Shift+P). Use <code>{channel}</code> for the channel name and <code>{me}</code> for your name. Commands such as <code>/timeout</code> work too.</div><div id="mc-rows">${macroRows()}</div><button class="btn sm" id="mc-add" style="margin-top:8px">${ico('plus', 14)} Add macro</button>`;
function bindMacros(n) {
  const box = $('#mc-rows', n); if (!box) return;
  const read = () => [...box.querySelectorAll('.mrow')].map((r) => ({ n: r.querySelector('.mn').value.trim(), t: r.querySelector('.mt').value.trim(), s: r.querySelector('.ms').checked }));
  const save = () => saveSettings({ macros: read().filter((m) => m.n || m.t) });
  box.addEventListener('input', save); box.addEventListener('change', save);
  box.addEventListener('click', (e) => { const x = e.target.closest('.hx'); if (!x) return; x.closest('.mrow').remove(); save(); if (!box.querySelector('.mrow')) box.innerHTML = macroRows(); });
  $('#mc-add', n).onclick = () => { S.settings.macros = [...read(), { n: '', t: '', s: false }]; box.innerHTML = macroRows(); const r = box.querySelectorAll('.mn'); r[r.length - 1].focus(); };
}

/* ===== 4. Raid banner with one-click Shield Mode ===== */
function onRaid(c, p) {
  const t = p.tags, name = unesc(t['msg-param-displayName'] || t['msg-param-login'] || 'Someone'), n = +t['msg-param-viewerCount'] || 0;
  c.raid = { at: Date.now(), from: name, n }; c.raiders = new Set();
  if (c.banner) c.banner.remove();
  const mod = modKnown(c) && isMod(c);
  const b = c.banner = el('div', 'banner raid', `<div class="bt">${ico('warn', 15)} <span><b>Raid incoming</b> from ${esc(name)} with ${n.toLocaleString()} viewer${n === 1 ? '' : 's'}</span></div>${mod ? `<div class="btnrow"><button class="btn sm primary" data-b="shield">Shield Mode</button><button class="btn sm" data-b="fol">Followers-only 10m</button><button class="btn sm" data-b="emote">Emote-only</button><button class="btn sm ghost" data-b="x">Dismiss</button></div>` : '<div class="btnrow"><button class="btn sm ghost" data-b="x">Dismiss</button></div>'}`);
  c.view.insertBefore(b, c.list);
  b.onclick = (e) => {
    const k = e.target.closest('button'); if (!k) return; const a = k.dataset.b;
    if (a === 'x') return b.remove();
    if (a === 'shield') { setShield(c, true).then(() => { k.textContent = 'Shield on'; k.disabled = true; setTimeout(() => { if (c.shield) toast(`Shield Mode is still on in ${c.name}`, { ms: 20000, action: { label: 'Turn off', fn: () => setShield(c, false) } }); }, 15 * 60000); }); }
    if (a === 'fol') { setMode(c, { follower_mode: true, follower_mode_duration: 10 }); k.disabled = true; }
    if (a === 'emote') { setMode(c, { emote_mode: true }); k.disabled = true; }
  };
  setTimeout(() => b.remove(), 10 * 60000);
  notifyYappy(`A raid of ${n.toLocaleString()} from ${name} is arriving in ${c.name}.`, mod ? [{ label: 'Shield Mode', primary: true, fn: () => setShield(c, true) }] : [], 'raid', [{ login: c.login, name: c.name }]);
}

/* ===== 5. Per-channel notes and rules cheat-sheet ===== */
function openNotes(c, anchor) {
  const all = S.settings.chanNotes || {}, d = all[c.login] || { notes: '', rules: [] };
  const n = el('div', 'stack', `<h3>${ico('book', 16)} ${esc(c.name)} · notes and rules</h3><div class="sd">Only you can see these. They stay on this computer, are never sent to Twitch or anyone else, and are blurred in streamer mode.</div><div class="sec">Rules (click one to put it in your message box)</div><div class="rules sens-i" id="rl"></div><div class="sec">Edit rules, one per line</div><textarea id="rl-ed" class="sens-i" rows="4" spellcheck="false" placeholder="No spoilers&#10;Be kind&#10;English only">${esc((d.rules || []).join('\n'))}</textarea><div class="sec">Private notes <span class="faint">(this computer only)</span></div><textarea id="nt" class="sens-i" rows="4" spellcheck="false" placeholder="Things to remember about this channel">${esc(d.notes || '')}</textarea>`);
  if (popover(n, anchor, { toggle: true }) === false) return;
  const paint = () => { const rs = (S.settings.chanNotes[c.login] || d).rules || []; $('#rl', n).innerHTML = rs.length ? rs.map((r, i) => `<div class="rule" data-i="${i}"><span>${i + 1}</span>${esc(r)}</div>`).join('') : '<div class="sd">No rules yet. Add some below.</div>'; };
  const save = () => { const cn = { ...(S.settings.chanNotes || {}) }; cn[c.login] = { notes: $('#nt', n).value, rules: $('#rl-ed', n).value.split('\n').map((x) => x.trim()).filter(Boolean) }; saveSettings({ chanNotes: cn }); };
  S.settings.chanNotes = S.settings.chanNotes || {}; if (!S.settings.chanNotes[c.login]) S.settings.chanNotes[c.login] = d; paint();
  $('#nt', n).oninput = save; $('#rl-ed', n).oninput = () => { save(); paint(); };
  $('#rl', n).onclick = (e) => { const r = e.target.closest('.rule'); if (!r) return; const i = inp(); i.value = (S.settings.chanNotes[c.login].rules || [])[+r.dataset.i] || ''; closePop(); i.focus(); };
}

/* ===== 6. Command palette (Ctrl+Shift+P) ===== */
function paletteItems() {
  const c = cur(), it = [], add = (l, h, fn) => it.push({ l, h, fn });
  S.chats.forEach((x) => add('Go to ' + x.name, 'Channel', () => setActive(x.login)));
  macros().filter((m) => m.n && m.t).forEach((m) => add('Macro: ' + m.n, m.s ? 'Sends the message' : 'Fills the message box', () => runMacro(m)));
  if (c) {
    add(`${c.shield ? 'Turn off' : 'Turn on'} Shield Mode in ${c.name}`, 'Moderation', () => setShield(c, !c.shield));
    add(c.modes['emote-only'] === '1' ? 'Turn off emote-only' : 'Turn on emote-only', 'Moderation', () => setMode(c, { emote_mode: c.modes['emote-only'] !== '1' }));
    add(c.modes['subs-only'] === '1' ? 'Turn off subscribers-only' : 'Turn on subscribers-only', 'Moderation', () => setMode(c, { subscriber_mode: c.modes['subs-only'] !== '1' }));
    add('Followers-only: 10 minutes', 'Moderation', () => setMode(c, { follower_mode: true, follower_mode_duration: 10 }));
    add('Followers-only: off', 'Moderation', () => setMode(c, { follower_mode: false }));
    add('Slow mode: off', 'Moderation', () => setMode(c, { slow_mode: false }));
    add('Slow mode: 30 seconds', 'Moderation', () => setMode(c, { slow_mode: true, slow_mode_wait_time: 30 }));
    add('Open notes and rules', c.name, () => openNotes(c, $('#statsbar')));
    add('Search this chat', 'Ctrl+F', () => toggleSearch(c));
  }
  add('Search all channels', 'Ctrl+Shift+F', openGlobalSearch);
  if (S.me && S.chats.has(S.me.login)) add('Open the streamer dashboard', 'Streamer', openDash);
  if (hasLock()) add('Lock YappyChat', 'Security', lockNow);
  if (c && !S.settings.notMod) { if (isOwner(c)) { add('Run a poll', c.name, () => pollWin(c)); add('Run a prediction', c.name, () => predWin(c)); } add('Who is in chat', c.name, () => usersWin(c)); add('Banned users', c.name, () => moreTool(c, 'banned')); add('Chat filters (AutoMod, blocked terms)', c.name, () => moreTool(c, 'filters')); add('Make a clip', c.name, () => moreTool(c, 'clip')); if (isOwner(c)) add('Add a stream marker', c.name, () => moreTool(c, 'marker')); }
  add(S.settings.sidebar ? 'Hide the activity sidebar' : 'Show the activity sidebar', 'View', () => { saveSettings({ sidebar: !S.settings.sidebar }); renderSide(); });
  sideTabs().forEach(([k, l]) => add('Activity: ' + l, 'View', () => { openSide(k); }));
  add(S.settings.split ? 'Turn off split view' : 'Turn on split view', 'View', () => $('#splitBtn').click());
  if ((S.closed || []).length) add('Reopen closed channel: ' + S.closed[0], 'Tabs', () => addChannel(S.closed.shift()));
  if (S.settings.split) add(S.settings.splitStack ? 'Split view: place chats side by side' : 'Split view: stack chats top to bottom', 'View', () => { saveSettings({ splitStack: !S.settings.splitStack }); applySplit(); });
  add(S.settings.pip.open ? 'Close the stream window' : 'Open the stream window', 'View', () => $('#pipBtn').click());
  if (S.settings.pip.open) add('Add another stream (up to four)', 'View', () => mvAdd());
  add(S.settings.streamer ? 'Turn off streamer mode' : 'Turn on streamer mode', 'Ctrl+Shift+S', () => { saveSettings({ streamer: !S.settings.streamer }); applyStreamer(); });
  add('Add a channel', 'Channels', addChannelPrompt);
  setSections().forEach(([s]) => add('Settings: ' + (s === 'Session' ? 'Session Information' : s), 'Settings', () => openSettings(s)));
  add('Save window layout…', 'View', () => askText('Save window layout', 'Layout name', 'Save', (v) => saveLayout(v)));
  Object.keys(S.settings.layouts || {}).forEach((k) => { add('Layout: ' + k, 'View', () => applyLayout(k)); add('Delete layout: ' + k, 'View', () => deleteLayout(k)); });
  add('Take the tour', 'Help', startTour); add('Reset the window layout', 'Help', () => resetLayout()); add("What's new", 'Help', () => cg.version().then(showWhatsNew));
  add('Volume of YappyChat sounds', 'Sounds', () => openVolume($('#volBtn')));
  add('Sign in to Twitch in the stream player (skips ads for subscriptions)', 'Stream', () => playerSignIn());
  add('Open the logs folder', 'Files', () => cg.openLogs());
  add('Support Yappy (perks page)', 'Link', () => Perks.openShop());
  return it;
}
function openPalette() {
  if (!S.me) return;
  const n = el('div', 'stack switcher', `<input id="pl-q" placeholder="Type a command…" spellcheck="false" autocomplete="off"><div class="swlist" id="pl-l"></div>`); modal(n);
  const q = $('#pl-q', n), l = $('#pl-l', n), all = paletteItems(); let sel = 0, list = [];
  const draw = () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    list = all.filter((x) => words.every((w) => (x.l + ' ' + x.h).toLowerCase().includes(w))).slice(0, 40); sel = Math.min(sel, Math.max(0, list.length - 1));
    l.innerHTML = list.map((x, i) => `<div class="swi${i === sel ? ' on' : ''}" data-i="${i}"><span>${esc(x.l)}</span><span class="faint">${esc(x.h)}</span></div>`).join('') || '<div class="none">Nothing matches</div>';
    const on = l.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const x = list[i]; if (!x) return; closeModal(); setTimeout(x.fn, 0); };
  q.oninput = () => { sel = 0; draw(); };
  q.onkeydown = (e) => { if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') run(sel); };
  l.onclick = (e) => { const r = e.target.closest('.swi'); if (r) run(+r.dataset.i); };
  draw(); q.focus();
}

/* ===== 7. Scheduled announcements (Twitch's own chat announcements, sent while YappyChat is open) ===== */
const ANN_COLORS = [['primary', 'Channel colour'], ['blue', 'Blue'], ['green', 'Green'], ['orange', 'Orange'], ['purple', 'Purple']];
const anns = () => S.settings.announcements || [];
const modChans = () => [...S.chats.values()].filter((c) => isMod(c)); // announcements can only be set up for channels where you are a moderator or the broadcaster
S.annState = {};
async function sendAnn(a, c, manual) {
  const st = S.annState[a.id] || (S.annState[a.id] = {}); st.last = Date.now(); st.msgs = c.stat.msgs;
  const text = expandMacro(a.text, c).slice(0, 500); if (!text) return false;
  const r = await helix('chat/announcements', { method: 'POST', query: mq(c), body: { message: text, color: a.color || 'primary' } });
  if (!ok(r)) { if (manual || !st.warned) { st.warned = true; err(`Announcement in ${c.name} failed: ${apiErr(r)}`); } return false; }
  st.warned = false; logAct(c, 'mode', 'You sent an announcement: ' + text.slice(0, 60)); if (manual) toast('Announcement sent', { ms: 2000 }); return true;
}
function annTick() {
  const now = Date.now();
  anns().forEach((a) => {
    if (!a.on || !a.text) return; const c = S.chats.get(a.c); if (!c || !isMod(c)) return;
    const st = S.annState[a.id] || (S.annState[a.id] = { last: now, msgs: c.stat.msgs });
    if (now - st.last < Math.max(5, +a.every || 30) * 60000) return;
    if (a.liveOnly !== false && !S.live.has(c.login)) return;
    if ((+a.minChat || 0) > 0 && c.stat.msgs - (st.msgs || 0) < +a.minChat) return;
    sendAnn(a, c);
  });
}
function annRows() {
  const l = anns(), chans = modChans(); if (!l.length) return `<div class="sd">No announcements yet.${chans.length ? '' : ' You are not a moderator in any open channel yet.'}</div>`;
  return l.map((a) => `<div class="arow" data-id="${esc(a.id)}"><div class="mrow"><select class="ac_c">${chans.map((c) => `<option value="${c.login}" ${a.c === c.login ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}${chans.some((c) => c.login === a.c) ? '' : `<option value="${esc(a.c)}" selected disabled>${esc(a.c)} (not a moderator here)</option>`}</select><input class="at_t" placeholder="Announcement text" value="${esc(a.text)}" maxlength="500"><button class="hx ibtn" data-tip="Remove">${ico('x', 14)}</button></div><div class="mrow sm"><label>Every <input type="number" class="at_e" min="5" max="1440" value="${+a.every || 30}"> min</label><label class="chk" data-tip="Waits until the stream is live"><input type="checkbox" class="at_l" ${a.liveOnly !== false ? 'checked' : ''}> only while live</label><label data-tip="Waits for this many chat messages since the last announcement">after <input type="number" class="at_m" min="0" max="500" value="${+a.minChat || 0}"> chats</label><select class="at_k">${ANN_COLORS.map(([v, t]) => `<option value="${v}" ${(a.color || 'primary') === v ? 'selected' : ''}>${t}</option>`).join('')}</select><label class="chk"><input type="checkbox" class="at_o" ${a.on ? 'checked' : ''}> on</label><button class="btn sm" data-send>Send now</button></div></div>`).join('');
}
const annPane = () => `<div class="sd">Sent on a timer while the channel's tab is open and you moderate it. Use <code>{channel}</code> for its name.</div><div id="an-rows">${annRows()}</div><button class="btn sm" id="an-add" style="margin-top:8px">${ico('plus', 14)} Add announcement</button>`;
function bindAnns(n) {
  const box = $('#an-rows', n); if (!box) return;
  const read = () => [...box.querySelectorAll('.arow')].map((r) => ({ id: r.dataset.id, c: r.querySelector('.ac_c').value, text: r.querySelector('.at_t').value.trim(), every: Math.max(5, +r.querySelector('.at_e').value || 30), liveOnly: r.querySelector('.at_l').checked, minChat: Math.max(0, +r.querySelector('.at_m').value || 0), color: r.querySelector('.at_k').value, on: r.querySelector('.at_o').checked }));
  const save = () => saveSettings({ announcements: read() });
  box.addEventListener('input', save); box.addEventListener('change', save);
  box.addEventListener('click', (e) => {
    const row = e.target.closest('.arow'); if (!row) return;
    if (e.target.closest('.hx')) { row.remove(); save(); if (!box.querySelector('.arow')) box.innerHTML = annRows(); }
    else if (e.target.closest('[data-send]')) { const a = read().find((x) => x.id === row.dataset.id), c = a && S.chats.get(a.c); if (!c || !isMod(c)) return err('You need to be a moderator in that channel.'); if (!a.text) return err('Add the announcement text first.'); sendAnn(a, c, true); }
  });
  $('#an-add', n).onclick = () => { const mc = modChans(); if (!mc.length) return err('Announcements are only for channels where you are a moderator or the broadcaster. Open one of those first.'); S.settings.announcements = [...read(), { id: 'a' + Date.now().toString(36), c: (mc.find((x) => x.login === S.active) || mc[0]).login, text: '', every: 30, liveOnly: true, minChat: 5, color: 'primary', on: false }]; saveSettings({ announcements: S.settings.announcements }); box.innerHTML = annRows(); };
}

/* ===== 8. Shared ban list: remember troublemakers once, ban them everywhere you moderate ===== */
const banList = () => S.settings.banList || [];
const banMap = () => new Map(banList().map((b) => [b.login, b]));
function addToBanList(login, id, reason) {
  login = String(login).toLowerCase(); if (banList().some((b) => b.login === login)) return false; if (banList().length >= 500) { err('The ban list is full (500).'); return false; }
  saveSettings({ banList: [...banList(), { login, id: id || '', reason: reason || '', ts: Date.now() }] }); return true;
}
function checkBanList(c, m) {
  if (m.hist || m.own || !banList().length || !modKnown(c) || !isMod(c)) return;
  const b = banMap().get(m.login); if (!b) return; c.blSeen = c.blSeen || new Set(); if (c.blSeen.has(m.login)) return; c.blSeen.add(m.login);
  const uid = m.uid || b.id, why = 'Shared ban list' + (b.reason ? ': ' + b.reason : '');
  if (S.settings.banAuto) { ban(c, uid, m.login, 0, why.slice(0, 200), m.text); return; }
  notifyYappy(`${m.name} is on your shared ban list${b.reason ? ' (' + b.reason + ')' : ''}. Ban them in ${c.name}?`, [{ label: 'Ban', primary: true, fn: () => ban(c, uid, m.login, 0, why.slice(0, 200), m.text) }, { label: 'Ignore', fn: () => {} }], 'banlist');
}
async function banEverywhere(login, uid, reason) {
  const targets = [...S.chats.values()].filter((c) => modKnown(c) && isMod(c) && !(c.id === uid));
  if (!targets.length) return err('You are not a moderator in any open channel.');
  const n = el('div', 'stack', `<h3>Ban ${esc(login)} everywhere?</h3><div class="sd">This bans them in ${targets.length} channel${targets.length === 1 ? '' : 's'} where you are a moderator: ${esc(targets.map((c) => c.name).join(', '))}.</div><div class="row"><button class="btn" id="be-x">Cancel</button><button class="btn danger" id="be-go">Ban in ${targets.length}</button></div>`);
  modal(n); $('#be-x', n).onclick = closeModal;
  $('#be-go', n).onclick = async () => {
    closeModal(); let good = 0, bad = [];
    for (const c of targets) {
      const r = await helix('moderation/bans', { method: 'POST', query: mq(c), body: { data: { user_id: uid, reason: (reason || 'Shared ban list').slice(0, 200) } } });
      if (ok(r)) { good++; c.stat.bans++; markMine(c, login); logAct(c, 'ban', `You banned ${login} (everywhere)`, undefined, login); } else bad.push(c.name);
    }
    renderStats(); toast(`Banned ${login} in ${good} channel${good === 1 ? '' : 's'}${bad.length ? '. Failed in ' + bad.join(', ') : ''}`, { ms: 7000, type: bad.length ? 'err' : '' });
  };
}
function banRows() {
  const l = banList(); if (!l.length) return '<div class="sd">The list is empty. Add people from their user card, or paste names below.</div>';
  return l.map((b) => `<div class="mrow"><b class="grow">${esc(b.login)}</b><span class="sd grow2">${esc(b.reason || '')}</span><button class="hx ibtn" data-l="${esc(b.login)}" data-tip="Remove from list">${ico('x', 14)}</button></div>`).join('');
}
const banPane = (s) => srow('Ban automatically', 'When someone on the list speaks in a channel where you are a moderator, ban them straight away. Otherwise Yappy asks first.', sk('banAuto', !!s.banAuto)) + `<div class="sd" style="margin-top:8px">Stored on this computer only. Share it with other moderators with Copy and Paste.</div><div id="bn-rows" style="margin-top:8px">${banRows()}</div><div class="sl" style="margin-top:14px">Add names</div><textarea id="bn-text" rows="3" spellcheck="false" placeholder="one username per line" style="width:100%"></textarea><input id="bn-why" placeholder="Reason (optional)" maxlength="100" style="width:100%;margin-top:6px"><div class="btnrow" style="margin-top:8px"><button class="btn sm primary" id="bn-add">Add to list</button><button class="btn sm" id="bn-copy">Copy list</button></div><div class="sd" id="bn-st"></div>`;
function bindBans(n) {
  const rows = $('#bn-rows', n); if (!rows) return;
  rows.onclick = (e) => { const x = e.target.closest('.hx'); if (!x) return; saveSettings({ banList: banList().filter((b) => b.login !== x.dataset.l) }); rows.innerHTML = banRows(); };
  $('#bn-copy', n).onclick = () => navigator.clipboard.writeText(banList().map((b) => b.login).join('\n')).then(() => toast('List copied', { ms: 2000 }));
  $('#bn-add', n).onclick = async () => {
    const names = [...new Set($('#bn-text', n).value.split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^@/, '')).filter((x) => /^\w{3,25}$/.test(x)))].filter((x) => !banMap().has(x)), st = $('#bn-st', n);
    if (!names.length) return err('Nothing new to add.'); const why = $('#bn-why', n).value.trim(); let added = 0;
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100), r = await helix('users', { query: chunk.map((x) => 'login=' + encodeURIComponent(x)).join('&') }), found = new Map(((r.json && r.json.data) || []).map((u) => [u.login, u.id]));
      chunk.forEach((x) => { if (found.has(x) && addToBanList(x, found.get(x), why)) added++; });
    }
    $('#bn-text', n).value = ''; rows.innerHTML = banRows(); st.textContent = `Added ${added} of ${names.length}${added < names.length ? ' (the rest were not found)' : ''}.`;
  };
}

/* ===== 9. Search every open channel at once (Ctrl+Shift+F), optionally the saved logs too ===== */
function openGlobalSearch() {
  if (!S.chats.size) return addChannelPrompt();
  const n = el('div', 'stack switcher wide', `<input id="gs-q" placeholder="Search messages in all your channels…" spellcheck="false" autocomplete="off"><label class="row chk"><span>Also search saved logs (older days)</span>${sw('gs-logs', false)}</label><div class="swlist tall" id="gs-l"></div>`); modal(n);
  const q = $('#gs-q', n), l = $('#gs-l', n); let res = [], t = 0;
  const hl = (s, w) => { const i = s.toLowerCase().indexOf(w); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + w.length)) + '</mark>' + esc(s.slice(i + w.length)); };
  const draw = (w) => { l.innerHTML = res.length ? res.map((r, i) => `<div class="swi gs" data-i="${i}"><span class="gc">${esc(r.c)}</span><span class="gt">${esc(r.when)}</span><span class="gm"><b>${esc(r.who)}</b>${r.who ? ': ' : ''}${hl(r.text, w)}</span></div>`).join('') : `<div class="none">${w.length < 2 ? 'Type at least two letters.' : 'No matches'}</div>`; };
  const run = async () => {
    const w = q.value.trim().toLowerCase(); res = []; if (w.length < 2) return draw(w);
    S.chats.forEach((c) => { c.list.querySelectorAll('.msg').forEach((node) => { if (res.length >= 150 || !node.textContent.toLowerCase().includes(w)) return; const nm = node.querySelector('.name'); res.push({ c: c.login, who: nm ? nm.textContent : '', text: msgText(node) || node.textContent, when: (node.querySelector('.ts') || {}).textContent || '', node, live: true }); }); });
    draw(w);
    if ($('#gs-logs', n).checked && cg.searchLogs) { const mine = q.value; const f = await cg.searchLogs(w); if (q.value !== mine) return; (f || []).forEach((x) => { if (res.length < 300) res.push({ c: x.c, who: '', text: x.line, when: x.d }); }); draw(w); }
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 180); }; $('#gs-logs', n).onchange = run;
  l.onclick = (e) => {
    const r = res[+((e.target.closest('.swi') || {}).dataset || {}).i]; if (!r) return; closeModal(); if (S.chats.has(r.c)) setActive(r.c);
    if (r.node && r.node.isConnected) setTimeout(() => { r.node.scrollIntoView({ block: 'center' }); r.node.classList.add('flash'); setTimeout(() => r.node.classList.remove('flash'), 2200); const c = S.chats.get(r.c); if (c) c.stick = false; }, 60);
  };
  q.focus();
}

/* ===== 10. Link and clip review queue ===== */
const URL_RX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
function queueLinks(c, m) {
  if (S.settings.linkQueue === false || m.hist || m.own || !isMod(c)) return;
  if (m.badges.some((b) => /^(broadcaster|moderator|vip)\//.test(b))) return;
  const found = (m.text.match(URL_RX) || []).slice(0, 3), allow = S.settings.linkAllow || [];
  found.forEach((raw) => {
    let u; try { u = new URL(/^https?:/i.test(raw) ? raw : 'https://' + raw); } catch (e) { return; }
    const host = u.hostname.replace(/^www\./, '').toLowerCase(), clip = host === 'clips.twitch.tv' || (/(^|\.)twitch\.tv$/.test(host) && /\/clip\//.test(u.pathname));
    if (!clip && allow.some((d) => host === d || host.endsWith('.' + d))) return;
    if (S.links.some((x) => x.login === m.login && x.url === u.href)) return;
    S.links.unshift({ c: c.login, id: m.id, uid: m.uid, login: m.login, name: m.name, url: u.href, host, clip, text: m.text, ts: m.ts }); S.links.length = Math.min(S.links.length, 150); bump('links');
  });
}
function linksView() {
  const none = (s) => `<div class="none">${s}</div>`;
  const items = S.links.map((x, i) => `<div class="sitem ydel">${xd('links', i)}<div class="meta"><b>${esc(x.c)}${x.clip ? ' · clip' : ''}</b><span>${tmFmt(x.ts)}</span></div><div><b class="lk" data-u="${esc(x.login)}" data-c="${esc(x.c)}">${esc(x.name)}:</b> <span class="lnkq">${esc(x.url.length > 90 ? x.url.slice(0, 90) + '…' : x.url)}</span></div><div class="btnrow ic"><button class="ibtn" data-a="l-open" data-i="${i}" data-tip="Open the link (asks first)">${ico('link', 15)}</button><button class="ibtn" data-a="l-del" data-i="${i}" data-tip="Delete the message">${ico('trash', 15)}</button><button class="ibtn" data-a="l-to" data-i="${i}" data-tip="Timeout">${ico('clock', 15)}</button><button class="btn sm" data-a="l-ok" data-i="${i}">${x.clip ? 'Approve clip' : 'Looks fine'}</button>${x.clip ? '' : `<button class="btn sm" data-a="l-site" data-i="${i}" data-tip="Never queue links to ${esc(x.host)} again">Allow site</button>`}</div></div>`).join('');
  return { head: S.links.length ? `<div class="pending">${S.links.length} link${S.links.length === 1 ? '' : 's'} to check</div>` : '', items: items || none(S.settings.linkQueue === false ? 'The link queue is off. Turn it on in Settings > Moderation.' : 'Links and clips posted by viewers in channels you moderate appear here, so you can check them after the fact. Messages from moderators and VIPs are skipped.') };
}
function linkAct(a, x) {
  if (!x) return; const c = S.chats.get(x.c);
  if (a === 'l-open') return openLink(x.url);
  if (a === 'l-del' && c && x.id) del(c, x.id, x.text, x.login);
  if (a === 'l-to' && c) ban(c, x.uid, x.login, S.settings.timeoutDefault, 'Link', x.text);
  if (a === 'l-site') { saveSettings({ linkAllow: [...new Set([...(S.settings.linkAllow || []), x.host])] }); S.links = S.links.filter((y) => y.host !== x.host); toast(`Links to ${x.host} will no longer be queued`, { ms: 3000 }); return renderSide(); }
  S.links = S.links.filter((y) => y !== x); renderSide();
}

/* ===== Hooks used elsewhere ===== */
function extraKeys(e) {
  const k = e.key.toLowerCase();
  if (k === 'p' && e.shiftKey) { e.preventDefault(); openPalette(); return true; }
  if (k === 'f' && e.shiftKey) { e.preventDefault(); openGlobalSearch(); return true; }
  return false;
}

/* ===== Ban notes: after a ban without a reason, offer to keep a private note about why ===== */
function askBanNote(c, login) {
  const t = el('div', 'toast note', `<div class="nt-q">Why did you ban <b>${esc(login)}</b>? <span class="faint">Saved as a private note, only on this computer.</span></div><div class="nt-r"><input class="nt-i" placeholder="Reason (optional)" maxlength="200"><button class="nt-s">Save note</button><button class="nt-x faint">Skip</button></div>`);
  $('#toasts').append(t); const i = $('.nt-i', t); i.focus(); let done = false;
  const close = () => { if (done) return; done = true; t.classList.add('out'); setTimeout(() => t.remove(), 450); };
  const save = () => {
    const v = i.value.trim(); if (!v) return close();
    const notes = { ...(S.settings.notes || {}) }, line = `Banned in ${c.name}: ${v}`; notes[login] = { text: notes[login] ? notes[login].text + '\n' + line : line, ts: Date.now() }; saveSettings({ notes });
    userEvent(login, c.login, 'note', 'Ban note: ' + v); toast('Note saved', { ms: 1600 }); close();
  };
  $('.nt-s', t).onclick = save; $('.nt-x', t).onclick = close; i.onkeydown = (e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') close(); };
  setTimeout(close, 30000);
}

/* ===== Timestamp format setting ===== */
const TS_PRESETS = ['HH:MM:SS', 'HH:MM:ss', 'HH:MM', 'H:MM:SS', 'HH:MM:SS P', 'hh:MM'];
const tsPane = (s) => `<div class="srow"><div><div class="sl">Timestamp format</div><div class="sd">H = hour, M = minute, S = second. Two letters pad with a zero (<code>HH</code> = 09, <code>H</code> = 9). <b>Capital letters are bright, lower case letters are softer</b>, so <code>HH:MM:ss</code> dims the seconds. Add <code>P</code> for AM/PM (12-hour clock).</div><div class="btnrow" style="margin-top:8px">${TS_PRESETS.map((p) => `<button class="btn sm" data-ts="${p}">${p}</button>`).join('')}</div></div><div class="tsbox"><input id="ts-fmt" aria-label="Timestamp format" value="${esc(s.tsFormat || 'HH:MM:SS')}" maxlength="24" spellcheck="false"><span class="ts" id="ts-prev">${fmtTs(Date.now(), s.tsFormat)}</span></div></div>`;
function bindTs(n) {
  const i = $('#ts-fmt', n); if (!i) return; const set = (v) => { i.value = v; saveSettings({ tsFormat: v.trim() || 'HH:MM:SS' }); $('#ts-prev', n).innerHTML = fmtTs(Date.now(), S.settings.tsFormat); };
  i.oninput = () => set(i.value); n.querySelectorAll('[data-ts]').forEach((b) => (b.onclick = () => set(b.dataset.ts)));
}

/* ===== Settings > Filters: the word/name blacklist and the shared ban list together ===== */
const blockPane = (s) => `<div class="sens"><div class="sl">Blacklist · words and names to cover</div><div class="sd">Matching words are covered; hover to reveal. One word per line, case-insensitive. <code>*</code> is a wildcard (<code>bad*</code>), <code>/pattern/</code> is a regular expression. Applies to new messages.</div><textarea id="bl-text" rows="6" spellcheck="false" placeholder="one word or name per line" style="width:100%;margin-top:10px">${esc((s.blacklist || []).join('\n'))}</textarea>${srow('Cover usernames too', 'Also hide chatter names that match.', sk('blNames', s.blNames !== false))}</div>` +
  `<div class="sens"><div class="sl" style="margin-top:22px">Ban list · people to ban on sight</div>${banPane(s)}</div><div class="sd" style="margin-top:12px">Both lists are blurred in streamer mode until you hover over or click into them.</div>`;

/* ===== Volume button: the volume of YappyChat's own sounds (the stream has its own volume control) ===== */
function syncVol() { const b = $('#volBtn'); if (!b) return; const v = +S.settings.volume; b.innerHTML = ico(v > 0 ? 'vol' : 'mute', 18); b.classList.toggle('on', !(v > 0)); }
function openVolume(anchor) {
  const v = Math.round((+S.settings.volume || 0) * 100);
  const n = el('div', 'stack volpop', `<h3>${ico('vol', 16)} YappyChat sounds</h3><div class="row"><button class="ibtn" id="vp-m" data-tip="Mute or unmute YappyChat sounds"></button><input type="range" id="vp-r" min="0" max="100" value="${v}"><b id="vp-n">${v}%</b></div><div class="sd">Alerts, mentions and Yappy. The stream has its own volume control in the player. Choose which sounds play in Settings &gt; Sounds.</div>`);
  if (popover(n, anchor, { toggle: true }) === false) return; let last = v || 60; const r = $('#vp-r', n), m = $('#vp-m', n);
  const draw = () => { $('#vp-n', n).textContent = r.value + '%'; m.innerHTML = ico(+r.value > 0 ? 'vol' : 'mute', 16); };
  const set = (x) => { r.value = x; draw(); saveSettings({ volume: x / 100 }); syncVol(); }; draw();
  r.oninput = () => { set(+r.value); if (+r.value) last = +r.value; clearTimeout(set.t); set.t = setTimeout(() => playSound('ping', 'highlight'), 160); };
  m.onclick = () => { if (+r.value > 0) { last = +r.value; set(0); } else { set(last || 60); playSound('ping', 'highlight'); } };
}

/* ===== First-run tour: a short walk through the main parts of the window ===== */
// The tour covers the essentials in 7 steps; the last one lists where to find everything else
const TOUR_MORE = [['Split view', 'grid button at the top'], ['Window layouts', 'button beside the rail button'], ['Command panel', 'Ctrl+Shift+P'], ['Streamer dashboard', 'pulse button (your channel)'], ['Timeout lengths and reasons', 'Settings > Moderation'], ['Highlights and sounds', 'Settings > Notifications'], ['Channel notes and rules', 'book button by Shield'], ['Text size', 'Ctrl + and Ctrl -']];
const TOUR = [
  { pv: 'welcome', t: 'Welcome to YappyChat', b: 'Eight quick stops. Replay this any time from Settings > About.' },
  { pv: 'tabs', sel: '.tabbar', sel2: '#addTab', t: 'Your channels', b: 'Press + (or Ctrl+K) and type a channel name to add it. Right-click a tab for its colour, sound, text size and mod buttons.' },
  { pv: 'chat', dk: 'chat', dsel: '.td-list', sel: '#chats', t: 'Moderate from chat', b: 'Delete, timeout, ban and warn sit beside each message (or press D, T, B, W). Shift+click several messages to act on them together. Click a name for their card.' },
  { sel: '#chats', t: 'Repeated messages fold up', b: 'When someone sends the same message again within 20 seconds, the first line gets ×2, ×3… instead of filling chat. Click the count to see who sent it and act on all of them. Rather see every line? Switch off "Fold copy-paste spam" in Settings > Moderation.',
    demo: '<div class="tour-fold" aria-hidden="true"><div><b style="color:#69ccff">Kito</b> gg everyone</div><div class="tf-hit"><b style="color:#ff6b9a">BigFollowz</b> Get 1000 followers today at bigfollowz dot com <span class="tf-n">×12</span></div><div><b style="color:#7ee081">Mira</b> mods pls</div><div><b style="color:#ffcf5a">Raider_One</b> raid hype!! <span class="tf-n">×2</span></div></div>' },
  { pv: 'activity', sel: '#sideWrap', side: true, t: 'The activity rail', b: 'Mentions, AutoMod, Mod activity, unban requests and more. Press + at the bottom to add tools, and drag section headers to reorder them.' },
  { pv: 'yappy', sel: '.y-wrap', t: 'Yappy', b: 'Yappy spots spam, raids and repeat offenders and suggests what to do. His notices wait in the Yappy section of the rail.' },
  { pv: 'stream', dk: 'stream', dsel: '.tourpip', sel: '#pipBtn', t: 'Stream window', b: 'Watch the stream in the app. Drag it to a screen edge to snap it, or add up to four streams.' },
  { pv: 'settings', sel: '#settingsBtn', t: 'Settings', b: 'Everything is in 8 groups, with a search box at the top.' },
  { t: 'Explore more', b: 'When you are ready, these are worth a look:', list: TOUR_MORE }
];
// Saved window layouts: split view, stream window and activity panel, applied to the channels that are open
function saveLayout(name) {
  name = name.slice(0, 30); const s = S.settings, L = { ...(s.layouts || {}) };
  L[name] = { split: !!s.split, splitSet: [...(s.splitSet || [])], splitStack: !!s.splitStack, sidebar: !!s.sidebar, sideW: s.sideW, sidePins: [...(s.sidePins || [])], railTools: [...(s.railTools || [])], pip: JSON.parse(JSON.stringify(s.pip)) };
  saveSettings({ layouts: L, layCur: name, layPrev: s.layCur && s.layCur !== name ? s.layCur : s.layPrev || '' }); toast(`Layout "${name}" saved`, { ms: 2000 });
}
function applyLayout(name) {
  const L = (S.settings.layouts || {})[name]; if (!L) return;
  const s0 = S.settings; saveSettings({ split: L.split, splitSet: L.splitSet.filter((x) => S.chats.has(x)), splitStack: L.splitStack, sidebar: L.sidebar, sideW: L.sideW, ...(L.sidePins ? { sidePins: L.sidePins, railTools: L.railTools || [] } : {}), pip: { ...S.settings.pip, ...L.pip }, layCur: name, layPrev: s0.layCur && s0.layCur !== name ? s0.layCur : s0.layPrev || '' });
  try { renderPip(); applySplit(); applySideW(); renderSide(); } catch (e) {}
  toast(`Layout "${name}"`, { ms: 1500 });
}
// The layouts button beside the activity rail button: click for the list (and to save the current one), right-click to jump back to the layout you used before
function openLayouts(anchor) {
  const names = Object.keys(S.settings.layouts || {}), cur0 = S.settings.layCur;
  const n = el('div', 'stack moremenu laymenu', `<h3>${ico('layout', 16)} Window layouts</h3>` + (names.length ? names.map((k) => `<div class="layrow"><button class="btn macroi" data-lay="${esc(k)}"><b>${ico('layout', 14)} ${esc(k)}${cur0 === k ? ' <span class="faint">(current)</span>' : ''}</b></button><button class="ibtn sm" data-lx="${esc(k)}" data-tip="Delete this layout" aria-label="Delete ${esc(k)}">${ico('trash', 13)}</button></div>`).join('') : '<div class="faint" style="padding:2px 0 6px">No layouts yet. A layout remembers your split view, stream window and activity rail.</div>') + `<button class="btn primary" data-lnew="1">${ico('plus', 14)} Save the current layout</button><div class="faint" style="padding-top:4px">Right-click the layouts button to jump back to the layout you used before.</div>`);
  popover(n, anchor, { toggle: true });
  n.onclick = (e) => {
    const x = e.target.closest('[data-lx]'); if (x) { deleteLayout(x.dataset.lx); closePop(); return; }
    const l = e.target.closest('[data-lay]'); if (l) { closePop(); return applyLayout(l.dataset.lay); }
    if (e.target.closest('[data-lnew]')) { closePop(); askText('Save window layout', 'Layout name', 'Save', (v) => saveLayout(v)); }
  };
}
function layoutBack() {
  const p = S.settings.layPrev, L = S.settings.layouts || {};
  if (p && L[p]) return applyLayout(p);
  toast(Object.keys(L).length ? 'Pick a layout first. After that, right-click jumps back to the one before.' : 'No layouts saved yet. Click the layouts button to save one.', { ms: 3500 });
}
function deleteLayout(name) { const L = { ...(S.settings.layouts || {}) }; delete L[name]; saveSettings({ layouts: L }); toast(`Layout "${name}" deleted`, { ms: 1800 }); }
// Puts the window layout back to how a brand new install looks (stream closed, no split view, panel default width, Yappy in his corner)
function resetLayout(quiet) {
  saveSettings({ pip: { open: false, channel: 'follow', w: 480, muted: true, corner: 1, dock: null, dockSize: 0.45 }, split: false, sideW: 340, yappyPos: null, sideOrder: [] });
  try { renderPip(); applySplit(); applySideW(); renderSide(); Yappy.place(null); } catch (e) {}
  if (!quiet) toast('Window layout reset', { ms: 2200 });
}

// The tour's practice window: when no chat or stream is open there is nothing to point at, so the tour builds a pretend chat and a pretend stream window
// (nothing is sent anywhere, and both are removed when the tour ends)
const DEMO_MSGS = [
  ['BuzzBee', '#ff6bd6', 'mod', 'welcome in everyone, chat rules are in the panel'], ['NovaKitten', '#4da3ff', '', 'that was an insane play'], ['pixel_pete', '#2fbf71', 'vip', 'GG, clutch as always'],
  ['Tofu_Toast', '#ffb340', '', 'first time here, hi!', 1], ['Moonlit', '#b08cff', '', '@yappydemo can you play the new map next?', 0, 1], ['grumbleduck', '#ff6b6b', '', 'free followers at totally-real-link dot example'], ['SleepyOtter', '#4dd0e1', '', 'so cosy tonight'],
  ['BuzzBee', '#ff6bd6', 'mod', 'no links please, thank you'], ['LemonLime', '#c5e84d', '', 'the music slaps'], ['Tofu_Toast', '#ffb340', '', 'this chat is so friendly'], ['pixel_pete', '#2fbf71', 'vip', 'that boss never stood a chance'], ['NovaKitten', '#4da3ff', '', 'clip it!']
];
function buildTourDemo() {
  const out = { chat: false, stream: false, stop() {} }, timers = [], nodes = [], t = (fn, ms) => timers.push(setInterval(fn, ms));
  const chatHere = S.chats.size && $('#chats .chat:not(.hidden)'), pipHere = !$('#pip').classList.contains('hidden');
  if (!chatHere) {
    out.chat = true; const box = $('#chats'), d = el('div', 'tourdemo', `<div class="td-bar"><b>yappydemo</b><span class="live">LIVE</span><span>1,204 viewers</span><span>2:14:09</span><span>312 messages</span><span>4 bans</span><span class="grow"></span><button class="btn sm td-notes" tabindex="-1">${ico('note', 13)} Notes</button></div>` +
      `<div class="chat td-chat"><div class="phead td-head"><span class="pgrab">${ico('grab', 14)}</span><span class="pn">yappydemo</span><span class="pbtns">${['pin', 'bolt', 'list', 'shield', 'clock'].map((i) => `<button tabindex="-1">${ico(i, 14)}</button>`).join('')}</span></div><div class="list td-list"></div></div>`);
    box.append(d); nodes.push(d); const list = $('.td-list', d); let n = 0;
    const add = () => { const k = n++, [nm, col, bd, tx, first, hit] = DEMO_MSGS[k % DEMO_MSGS.length], ts = new Date().toTimeString().slice(0, 5), m = el('div', 'msg' + (hit ? ' hl' : '') + (first ? ' first' : '') + ' td-m' + (k === 5 ? ' show' : ''));
      m.innerHTML = `<div class="line">${first ? '<span class="tag">First message</span>' : ''}<span class="ts">${ts}</span> ${bd ? `<span class="td-badge ${bd}"></span>` : ''}<span class="nm"><span class="name" style="color:${col}">${nm}</span></span><span class="colon">:</span> <span class="mt">${esc(tx)}</span></div><div class="tools">${modBtns()}<i class="sep"></i><button data-a="reply" data-tip="Reply">${ico('reply', 15)}</button></div>`;
      list.append(m); while (list.children.length > 30) list.firstChild.remove(); list.scrollTop = list.scrollHeight; };
    for (let i = 0; i < 7; i++) add(); t(add, 2200);
    list.onclick = (e) => { const b = e.target.closest('button[data-a]'), m = b && b.closest('.td-m'); if (!m) return; const a = b.dataset.a; if (a === 'reply') return toast('In a real chat this starts a reply', { ms: 1800 }); m.classList.add('gone'); toast({ del: 'Deleted (practice only)', to: 'Timed out (practice only)', ban: 'Banned (practice only)', warn: 'Warned (practice only)' }[a] || 'Practice only', { ms: 1800 }); };
  }
  if (!pipHere) {
    out.stream = true; const p = el('div', 'pip tourpip', `<div class="pip-head"><span class="pn" style="font-size:12.5px;font-weight:600;padding:0 4px">yappydemo</span><span class="grow"></span><button tabindex="-1">${ico('vol', 15)}</button><button tabindex="-1">${ico('x', 15)}</button></div><div class="pip-view"><div class="td-video"><span class="td-live">LIVE</span><span class="td-views">1.2K</span><i class="td-s1"></i><i class="td-s2"></i><i class="td-s3"></i><b>Demo stream</b></div></div><div class="pip-foot"><span class="pip-grip"></span></div>`);
    p.style.cssText = 'right:28px;bottom:96px;width:400px;height:262px'; document.body.append(p); nodes.push(p);
  }
  out.stop = () => { timers.forEach(clearInterval); nodes.forEach((x) => x.remove()); };
  return out;
}
function startTour() {
  if ($('#tour')) return; closeLayer();
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'; };
  const demo = buildTourDemo(), steps = TOUR.map((x) => (x.dk && demo[x.dk] ? { ...x, sel: x.dsel, sel2: '', pv: '' } : x)).filter((x) => !x.sel || x.side || vis($(x.sel))); let i = 0, sideWas = !!S.settings.sidebar, sideByTour = false;
  // The activity step opens the panel so it can be shown, and puts it back how it was afterwards
  const tourSide = (want) => { if (want && !S.settings.sidebar) { saveSettings({ sidebar: true }); renderSide(); sideByTour = true; } else if (!want && sideByTour) { saveSettings({ sidebar: sideWas }); renderSide(); sideByTour = false; } };
  const root = el('div', '', `<div class="tour-hole"></div><div class="tour-card"><div class="tour-pv"></div><div class="tour-t"></div><div class="tour-b"></div><div class="tour-f"><span class="tour-n"></span><span class="grow"></span><button class="btn sm ghost" data-t="skip">Skip tour</button><button class="btn sm" data-t="back">Back</button><button class="btn sm primary" data-t="next">Next</button></div></div>`); root.id = 'tour'; document.body.append(root);
  const hole = $('.tour-hole', root), card = $('.tour-card', root);
  const finish = () => { tourSide(false); demo.stop(); root.remove(); document.removeEventListener('keydown', key, true); removeEventListener('resize', draw); saveSettings({ tourDone: true }); };
  const draw = () => {
    const st = steps[i]; tourSide(!!st.side); const tgt = st.sel ? $(st.sel) : null; $('.tour-t', root).textContent = st.t; $('.tour-b', root).textContent = st.b; if (st.list) $('.tour-b', root).insertAdjacentHTML('beforeend', `<ul class="tour-l">${st.list.map(([a, w]) => `<li><b>${esc(a)}</b><span>${esc(w)}</span></li>`).join('')}</ul>`); const pvEl = $('.tour-pv', root); pvEl.innerHTML = st.demo || (st.pv && window.Previews ? Previews.html(st.pv) : ''); pvEl.style.display = pvEl.innerHTML ? '' : 'none'; if (pvEl.innerHTML && !st.demo && window.Previews) Previews.mount(pvEl); $('.tour-n', root).textContent = `${i + 1} of ${steps.length}`;
    $('[data-t=back]', root).style.visibility = i ? 'visible' : 'hidden'; $('[data-t=next]', root).textContent = i === steps.length - 1 ? 'Finish' : 'Next'; $('[data-t=skip]', root).style.display = i === steps.length - 1 ? 'none' : '';
    const w = 380, h = card.offsetHeight || 170;
    // The card never sits on the stream window: it picks the nearest spot that does not touch it
    const setCard = (cx, cy) => {
      cx = Math.max(10, Math.min(innerWidth - w - 10, cx)); cy = Math.max(10, Math.min(innerHeight - h - 10, cy));
      const pe = $('.tourpip') || $('#pip'), pr = pe && !pe.classList.contains('hidden') ? pe.getBoundingClientRect() : null, bad = (x, y) => pr && hit(pr, { left: x - 8, right: x + w + 8, top: y - 8, bottom: y + h + 8 });
      if (bad(cx, cy)) { const alts = [[(innerWidth - w) / 2, (innerHeight - h) / 2], [10, innerHeight - h - 10], [innerWidth - w - 10, innerHeight - h - 10], [10, 60], [innerWidth - w - 10, 60], [(innerWidth - w) / 2, 60], [(innerWidth - w) / 2, innerHeight - h - 10]].sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); const f = alts.find(([x, y]) => !bad(x, y)); if (f) [cx, cy] = f; }
      card.style.left = cx + 'px'; card.style.top = cy + 'px';
    };
    if (!tgt) { hole.style.cssText = 'left:50%;top:50%;width:0;height:0'; setCard((innerWidth - w) / 2, (innerHeight - h) / 2); return; }
    const r0 = tgt.getBoundingClientRect(), t2 = st.sel2 && $(st.sel2), r2 = t2 && t2.getBoundingClientRect(), r = r2 && r2.width ? { left: Math.min(r0.left, r2.left), top: Math.min(r0.top, r2.top), right: Math.max(r0.right, r2.right), bottom: Math.max(r0.bottom, r2.bottom), get width() { return this.right - this.left; }, get height() { return this.bottom - this.top; } } : r0, p = 6, x = Math.max(0, r.left - p), y = Math.max(0, r.top - p), bw = Math.min(innerWidth - x, r.width + p * 2), bh = Math.min(innerHeight - y, r.height + p * 2);
    hole.style.cssText = `left:${x}px;top:${y}px;width:${bw}px;height:${bh}px`;
    let cx, cy; const room = { below: innerHeight - (y + bh), above: y, right: innerWidth - (x + bw), left: x };
    if (room.below >= h + 16) { cy = y + bh + 12; cx = x; } else if (room.above >= h + 16) { cy = y - h - 12; cx = x; } else if (room.right >= w + 16) { cx = x + bw + 12; cy = y; } else if (room.left >= w + 16) { cx = x - w - 12; cy = y; } else { cx = (innerWidth - w) / 2; cy = (innerHeight - h) / 2; }
    setCard(cx, cy);
  };
  const go = (d) => { i += d; if (i >= steps.length) return finish(); if (i < 0) i = 0; draw(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); } };
  document.addEventListener('keydown', key, true); addEventListener('resize', draw);
  root.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t === 'next') go(1); else if (b.dataset.t === 'back') go(-1); else finish(); };
  draw(); draw();
}

/* ---------- AutoMod messages in chat (Settings > Moderation > AutoMod in chat) ---------- */
// Why was it held? Version 2 events say; version 1 only gives a category.
function amInfo(ev) {
  const text = (ev.message && ev.message.text) || '', terms = ev.blocked_term && ev.blocked_term.terms_found, bounds = (ev.automod && ev.automod.boundaries) || [];
  const word = (b) => (b && typeof b.start_pos === 'number' ? text.slice(b.start_pos, b.end_pos + 1) : '');
  if (ev.reason === 'blocked_term' || (terms && terms.length)) {
    const list = [...new Set((terms || []).map((t) => word(t.boundary)).filter(Boolean))];
    return { kind: 'terms', label: list.length ? 'Blocked term: ' + list.join(', ') : 'Blocked term', bounds: (terms || []).map((t) => t.boundary).filter(Boolean) };
  }
  const cat = (ev.automod && ev.automod.category) || ev.category || '', lvl = (ev.automod && ev.automod.level) || ev.level;
  return { kind: 'auto', label: cat ? cat.replace(/_/g, ' ') + (lvl ? ' (level ' + lvl + ')' : '') : 'AutoMod', bounds };
}
function amMarked(text, bounds) {
  const rs = (bounds || []).filter((b) => b && typeof b.start_pos === 'number').sort((a, b) => a.start_pos - b.start_pos); let out = '', at = 0;
  for (const b of rs) { if (b.start_pos < at) continue; out += esc(text.slice(at, b.start_pos)) + '<mark>' + esc(text.slice(b.start_pos, b.end_pos + 1)) + '</mark>'; at = b.end_pos + 1; }
  return out + esc(text.slice(at));
}
// Puts the held message into the chat. Returns true if it was shown there.
function amLine(c, item, info, ev) {
  const s = S.settings; if (s.amChat === false || (info.kind === 'terms' ? s.amChatTerms === false : s.amChatAuto === false)) return false;
  const n = el('div', 'am'); n.dataset.id = item.id; n.dataset.user = item.login;
  n.innerHTML = `<div class="amh">${ico('shield', 13)}<span>AutoMod held a message</span><i>${esc(info.label)}</i></div><div class="aml"><b class="name" style="${nameStyle('', item.login)}">${esc(item.name)}</b>: <span class="mt">${amMarked(item.text, info.bounds)}</span></div>${amBtns((k) => `data-am="${k}"`)}`;
  item.node = n; c.amHeld = c.amHeld || new Map(); c.amHeld.set(item.id, item); push(c, n); return true;
}
function amClick(c, n, e) {
  const b = e.target.closest('button[data-am]'), item = c.amHeld && c.amHeld.get(n.dataset.id);
  if (b && item) { if (b.dataset.am === 'allow' || b.dataset.am === 'deny') { b.disabled = true; return automod(item, b.dataset.am === 'allow' ? 'ALLOW' : 'DENY'); } return amAct(item, b.dataset.am, b); }
  if (e.target.closest('.name')) openCard(c, n.dataset.user, e.target.closest('.name'));
}
// Mark the chat line (and tidy the review list) once the message has been dealt with, by you or another moderator
function amRecord(item, result, by) { S.amHist = S.amHist || []; S.amHist.unshift({ ...item, node: undefined, result, by: by || '', at: Date.now() }); if (S.amHist.length > 1000) S.amHist.length = 1000; if (sideShows('automod')) renderSideSoon(); }
function amDone(item, label, good) {
  const n = item.node; if (!n) return; n.classList.add('done', good ? 'ok' : 'no');
  const b = n.querySelector('.ambar'); if (b) b.innerHTML = `<span class="amtag">${ico(good ? 'check' : 'x', 13)} ${esc(label)}</span>`;
  amLinger(n);
}
// A dealt-with AutoMod line stays about 8 seconds, so the other moderators can see who did what, then it goes. It waits while the pointer is on it.
function amLinger(n) {
  if (n._lg) return; let left = 8000, last = Date.now(), over = false; n._lg = true;
  n.addEventListener('mouseenter', () => { over = true; }); n.addEventListener('mouseleave', () => { over = false; last = Date.now(); });
  const tick = () => { if (!n.isConnected) return; const now = Date.now(); if (!over) left -= now - last; last = now; if (left <= 0) { n.classList.add('amgone'); return setTimeout(() => n.remove(), 450); } setTimeout(tick, 250); };
  tick();
}
function amUpdate(login, ev) {
  const c = S.chats.get(login), id = ev.message_id, st = String(ev.status || '').toLowerCase(), by = ev.moderator_user_name || ev.moderator_user_login || '';
  const item = (c && c.amHeld && c.amHeld.get(id)) || S.queue.find((x) => x.id === id);
  if (item) { amDone(item, (st === 'approved' ? 'Allowed' : st === 'denied' ? 'Denied' : 'Expired') + (by ? ' by ' + by : ''), st === 'approved'); if (!(S.amHist || []).some((x) => x.id === id)) { amRecord(item, st === 'approved' ? 'allowed' : st === 'denied' ? 'denied' : 'expired', by); if (by && c) recordMod(login, 'automod', `${st === 'approved' ? 'allowed' : 'denied'} ${item.name}'s message held by AutoMod`, by, item.login, { msg: item.text, src: 'automod' }); } }
  const before = S.queue.length; S.queue = S.queue.filter((x) => x.id !== id); if (S.queue.length !== before) renderSideSoon();
}

/* ---------- Per-channel colour and sound (right-click a channel tab) ---------- */
const CHAN_COLORS = ['#ff5d6c', '#ff8a3d', '#f5c542', '#3ecf8e', '#14b8a6', '#5ad1ff', '#5b8cff', '#8b5cf6', '#c86bff', '#ff7ac8'];
const chanColor = (login) => ((S.settings.chanStyle || {})[login] || {}).color || '';
const chanSound = (login) => ((S.settings.chanStyle || {})[login] || {}).sound || '';
// The colour is a CSS variable (--cc) on the chat, its tab, the channel bar and the stream window, so one value recolours all of them
function applyChanStyle(c) { try { syncPlaceholder(); } catch (e) {} try { applyChatSize(c); } catch (e) {} try { if (c && c.view) c.view.classList.toggle('nomodbtn', !!((S.settings.chanStyle || {})[c.login] || {}).noMod); } catch (e) {} try { if (c && c.login === S.active) tintComposer(c.login); } catch (e) {} if (!c || !c.view) return; const col = chanColor(c.login); if (col) c.view.style.setProperty('--cc', col); else c.view.style.removeProperty('--cc'); }
function setChanStyle(login, patch) {
  const cs = { ...(S.settings.chanStyle || {}) }; cs[login] = { ...(cs[login] || {}), ...patch };
  if (!cs[login].color) delete cs[login].color; if (!cs[login].sound) delete cs[login].sound; if (!cs[login].mute) delete cs[login].mute; if (!cs[login].noMod) delete cs[login].noMod; if (!cs[login].fs) delete cs[login].fs; if (!Object.keys(cs[login]).length) delete cs[login];
  saveSettings({ chanStyle: cs }); const c = S.chats.get(login); applyChanStyle(c); renderTabs(); renderStats(); if (S.pipLogin === login) tintPip(login); renderSide();
}
function tintPip(login) { const p = $('#pip'); if (!p) return; const col = chanColor(login); p.classList.toggle('cc', !!col); if (col) p.style.setProperty('--cc', col); else p.style.removeProperty('--cc'); }
function openChanMenu(login, anchor) {
  const c = S.chats.get(login); if (!c) return;
  const cur = chanColor(login), snd = chanSound(login), tones = [['', 'Default (my sound settings)'], ['none', 'Silent in this channel'], ...Sounds.tones, ...Perks.soundTones()];
  const st = (S.settings.chanStyle || {})[login] || {}, row = (label, ctl, tip) => `<div class="cm-r"${tip ? ` data-tip="${tip}"` : ''}><span>${label}</span>${ctl}</div>`;
  const n = el('div', 'stack chanmenu', `<h3>${esc(c.name)}</h3>
    <div class="swatches">${CHAN_COLORS.map((x) => `<button class="swt${cur === x ? ' on' : ''}" data-col="${x}" style="--c:${x}" aria-label="Colour ${x}"></button>`).join('')}<label class="swt custom" data-tip="Pick any colour"><input type="color" id="cm-c" value="${cur || '#5b8cff'}" aria-label="Pick any colour"></label><button class="swt none" id="cm-none" data-tip="Default colour" aria-label="Default colour">${ico('x', 12)}</button></div>` +
    row('Sound', `<span class="cm-snd"><select id="cm-s" aria-label="Notification sound in this channel">${tones.map(([v, l]) => `<option value="${v}"${v === snd ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="ibtn sm" id="cm-p" data-tip="Play" aria-label="Play">${ico('vol', 14)}</button></span>`, 'Overrides your sound settings for alerts in this channel') +
    row('Text size', `<div class="seg cmsize">${CHAT_SIZES.map(([f, l]) => `<button data-fs="${f}" class="${(st.fs || 1) === f ? 'on' : ''}" aria-label="${l}">${l === 'Normal' ? 'A' : l === 'Smaller' ? 'A−' : 'A+'}</button>`).join('')}</div>`) +
    row('Keep at the front', sw('cm-fav', !!st.fav), 'Favourite: this tab stays first, whichever way the tabs are sorted') +
    row('Mute', sw('cm-mute', !!st.mute), 'No sounds, buzz or tab flashing. Still logged and listed in Activity') +
    (modKnown(c) && isMod(c) ? row('Mod buttons', sw('cm-mod', !st.noMod), 'Delete, timeout, ban and warn beside each message. Off: hidden in this channel only') : ''));
  if (popover(n, anchor, { toggle: true }) === false) return;
  const paint = () => { const v = chanColor(login); n.querySelectorAll('.swt[data-col]').forEach((b) => b.classList.toggle('on', b.dataset.col === v)); };
  n.querySelectorAll('.swt[data-col]').forEach((b) => (b.onclick = () => { setChanStyle(login, { color: b.dataset.col }); paint(); }));
  $('#cm-c', n).oninput = (e) => { setChanStyle(login, { color: e.target.value }); paint(); };
  $('#cm-none', n).onclick = () => { setChanStyle(login, { color: '' }); paint(); };
  $('#cm-mute', n).onchange = (ev) => setChanStyle(login, { mute: ev.target.checked });
  $('#cm-fav', n).onchange = (ev) => { setChanStyle(login, { fav: ev.target.checked }); renderTabs(); };
  n.querySelectorAll('[data-fs]').forEach((b) => (b.onclick = () => { setChanStyle(login, { fs: +b.dataset.fs === 1 ? 0 : +b.dataset.fs }); n.querySelectorAll('[data-fs]').forEach((x) => x.classList.toggle('on', x === b)); }));
  if ($('#cm-mod', n)) $('#cm-mod', n).onchange = (ev) => { setChanStyle(login, { noMod: !ev.target.checked }); c.view.classList.toggle('nomodbtn', !ev.target.checked); };
  $('#cm-s', n).onchange = (e) => { setChanStyle(login, { sound: e.target.value }); const v = e.target.value; if (v && v !== 'none') playSound(v, 'highlight'); };
  $('#cm-p', n).onclick = () => { const v = $('#cm-s', n).value; if (v === 'none') return; playSound(v || (S.settings.soundTone || {}).highlight || 'ping', 'highlight'); };
}
document.addEventListener('contextmenu', (e) => { const t = e.target.closest && e.target.closest('#tabs .tab'); if (!t || !t.dataset.login) return; e.preventDefault(); openChanMenu(t.dataset.login, t); });

/* ---------- What's new (shown once after an update) and the "while you were away" summary ---------- */
const WHATS_NEW = [ // the top 10 changes in this version
  ["Moderate several at once", "Shift+click messages to delete, purge, time out or ban them together, then Undo all if you change your mind. Shift+T asks for a length and a reason."],
  ["Copy-paste spam folds into one line", "The same message again within 20 seconds adds ×2, ×3… to the first line. Click the count to act on everyone who sent it. Switch it off in Settings > Moderation."],
  ["Mod activity", "Every delete, timeout, ban, warning and word change, with who did it, in which channel, and the message behind it. Search, filter and undo, for the last 10 minutes or the whole session."],
  ["AutoMod in one click, with history", "Allow, deny, time out, warn or ban straight from a held message. History shows every decision, who made it and what the person tried to send."],
  ["Build your own rail", "Press + to add any tool to the activity rail, open a few sections at once and drag them into order. Live channels and Suspicious users have their own sections."],
  ["Know more at a glance", "A badge for brand-new accounts, a note when another mod already acted, a quick look when you rest on a name, and the chat around any message."],
  ["Easier to keep up", "A line shows what's new since you left a tab, a button jumps to mentions when you're scrolled up, chat holds still under your mouse, and Ctrl + / Ctrl - change the text size."],
  ["Simpler settings", "Eight groups with tabs along the top to jump around, a search box, Moderator / Streamer / Viewer setup, and mod buttons on the left or right of messages."],
  ["New themes and tidier tabs", "Soft, Ocean blue, Cotton candy and Millennial themes; holiday themes appear around their dates. Sort tabs with live channels first, and open a list of the channels that don't fit."],
  ["Weekly mod summary for streamers", "Your dashboard shows what each mod did this week and when chat is busiest, with a thank-you you can copy."],
];
function showWhatsNew(ver) {
  const n = el('div', 'stack whatsnew', `<h3>${ico('spark', 18)} What's new in YappyChat ${esc(ver || '')}</h3>` + WHATS_NEW.map(([t, b]) => `<div class="wn"><b>${esc(t)}</b><div class="sd">${esc(b)}</div></div>`).join('') + `<div class="btnrow"><button class="btn primary" id="wn-ok">Got it</button></div>`);
  modal(n); $('#wn-ok', n).onclick = closeModal;
}
async function checkWhatsNew() {
  let v = ''; try { v = await cg.version(); } catch (e) { return; } if (!v || S.settings.seenVersion === v) return;
  const first = !S.settings.seenVersion && !S.settings.tourDone; saveSettings({ seenVersion: v }); if (first) return; // brand new users get the tour instead
  setTimeout(() => showWhatsNew(v), 2500);
}
// An announcement from the YappyChat team (admin page > Announcements): shown once per person, at startup
async function checkNotice() {
  try {
    const r = await cg.http({ url: 'https://yappy.chat/api/notice?t=' + Math.floor(Date.now() / 60000) }); const n = r && r.status === 200 && r.json && r.json.notice; if (!n || S.settings.noticeSeen === n.id) return;
    const link = /^https:\/\//i.test(n.link || '') ? n.link : '';
    const w = el('div', 'stack whatsnew', `<h3>${ico('spark', 18)} ${esc(n.title)}</h3><div class="sd" style="white-space:pre-wrap">${esc(n.body)}</div><div class="btnrow">${link ? `<button class="btn primary" id="nt-go">${esc(n.label || 'Learn more')}</button>` : ''}<button class="btn${link ? '' : ' primary'}" id="nt-ok">${link ? 'Not now' : 'Got it'}</button></div>`);
    saveSettings({ noticeSeen: n.id }); modal(w); $('#nt-ok', w).onclick = closeModal; if (link) $('#nt-go', w).onclick = () => { cg.openExternal(link); closeModal(); };
  } catch (e) {}
}
// Away for a while? Count what built up and say so, once, when you come back.
const AWAY_MS = 10 * 60000; let awayAt = 0, awaySnap = null;
addEventListener('blur', () => { if (!awayAt) { awayAt = Date.now(); awaySnap = { ...S.unseen }; } });
addEventListener('focus', () => {
  if (!awayAt) return; const mins = Math.round((Date.now() - awayAt) / 60000), snap = awaySnap || {}; awayAt = 0; if (mins * 60000 < AWAY_MS || !S.me) return;
  const d = (k) => Math.max(0, (S.unseen[k] || 0) - (snap[k] || 0)), parts = [[d('mentions'), 'mention'], [d('automod'), 'AutoMod hold'], [d('unbans'), 'unban request'], [d('whispers'), 'whisper'], [d('links'), 'link to check']].filter(([n]) => n).map(([n, l]) => `${n} ${l}${n === 1 ? '' : 's'}`);
  if (!parts.length) return;
  notifyYappy(`Welcome back! While you were away (${mins >= 60 ? Math.round(mins / 6) / 10 + ' h' : mins + ' min'}): ${parts.join(', ')}.`, [{ label: 'Open Activity', primary: true, fn: () => openSide() }], 'away');
});

function tintComposer(login) { const f = document.querySelector('.composer'); if (!f) return; const col = chanColor(login); f.classList.toggle('hascc', !!col); if (col) f.style.setProperty('--cc', col); else f.style.removeProperty('--cc'); }

/* ===== First launch: how will you use YappyChat? Sets sensible defaults; change it any time in Settings > General ===== */
const USE_AS = {
  mod: ['Moderator', 'shield', 'You moderate other people\'s channels', { notMod: false, modButtons: 'always', yappySuggest: true, sidebar: true, sidePins: ['automod', 'modact'] }],
  streamer: ['Streamer', 'pulse', 'You stream, and moderate your own chat', { notMod: false, modButtons: 'hover', yappySuggest: true, sidebar: true, sidePins: ['modact', 'live'] }],
  viewer: ['Viewer', 'chat', 'You chat and watch; no moderation tools', { notMod: true, modButtons: 'off', yappySuggest: false, sidebar: true, sidePins: ['mentions'] }]
};
function applyUseAs(k, first) {
  const p = USE_AS[k]; if (!p) return; saveSettings({ ...p[3], useAs: k });
  document.body.classList.toggle('nomod', !!p[3].notMod);
  if (k === 'streamer' && first && S.me && !S.chats.has(S.me.login)) { try { addChannel(S.me.login); } catch (e) {} }
  try { settingsEffects(); render(); } catch (e) {}
}
function askUseAs(then) {
  const n = el('div', 'stack useas', `<h3>How will you use YappyChat?</h3><div class="sd">This sets up the buttons and the activity rail to suit you. You can change it any time in Settings &gt; General.</div><div class="useas-g">${Object.entries(USE_AS).map(([k, [l, i, d]]) => `<button class="useas-o" data-u="${k}">${ico(i, 26)}<b>${l}</b><span>${d}</span></button>`).join('')}</div><div class="btnrow"><button class="btn" id="ua-skip">Skip</button></div>`);
  modal(n);
  n.onclick = (e) => { const b = e.target.closest('[data-u]'); if (b) { applyUseAs(b.dataset.u, true); closeModal(); return setTimeout(() => askHlSuggest(then), 300); } if (e.target.closest('#ua-skip')) { saveSettings({ useAs: 'skip' }); closeModal(); then && setTimeout(then, 300); } };
}
