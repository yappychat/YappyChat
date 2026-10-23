'use strict';
const dbg = (m) => { try { cg.log('app_debug', `[${new Date().toTimeString().slice(0, 8)}] ${m}`); } catch (e) {} };

/* ---------- Channels ---------- */
function parseChannel(raw) { return String(raw || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/[/?#].*$/, '').replace(/^[@#]/, ''); }
async function addChannel(raw, select = true) {
  const login = parseChannel(raw);
  if (!/^\w{3,25}$/.test(login)) return { error: 'That does not look like a valid channel name.' };
  if (S.chats.has(login)) { setActive(login); return { ok: true }; }
  if (S.chats.size >= MAX_CHANNELS) return { error: `You can have up to ${MAX_CHANNELS} channels open. Close one to add another.` };
  dbg('add channel ' + login);
  const r = await helix('users', { query: { login } }), u = r.json && r.json.data && r.json.data[0];
  if (!u) { dbg('lookup failed ' + login + ' status ' + r.status); return { error: r.status === 200 ? `Channel "${login}" was not found.` : `Could not look up "${login}": ${apiErr(r)}` }; }
  const c = { login, id: u.id, name: u.display_name, avatar: u.profile_image_url, emotes: new Map(), badges: new Map(), msgs: new Map(), users: new Map(), stat: { bans: 0, timeouts: 0, deletes: 0, warns: 0, msgs: 0, emotes: 0, firsts: 0 }, times: [], sess: Date.now(), games: [], lastGame: null, twitch: [], twitchMap: new Map(), delWords: new Map(), recent: [], firstT: [], acts: [], modes: {}, shield: false, stick: true, unread: false, selfTags: {}, hover: false, held: 0, search: '' };
  c.view = el('div', 'chat hidden', `<div class="phead" draggable="true"><span class="pgrab" data-tip="Drag to move this chat: beside, above or below another chat or the stream">${ico('grab', 14)}</span><span class="pn">${esc(c.name)}</span><span class="pbtns">${toolBtns(c)}<button data-pa="layout" data-tip="Arrange chats">${ico('grid', 14)}</button><button data-pa="search" data-tip="Search this chat (Ctrl+F)">${ico('search', 14)}</button><button data-pa="close" data-tip="Remove from split view">${ico('x', 14)}</button></span></div><div class="sbar hidden"><input placeholder="Search this chat" spellcheck="false"><span class="scount"></span><button data-pa="searchx" data-tip="Close search">${ico('x', 14)}</button></div><div class="pgrip" data-tip="Drag to resize. Double-click to reset."></div>`);
  c.view.dataset.login = login; applyChanStyle(c); c.list = el('div', 'list'); c.histEnd = el('div', 'histend hidden', 'Recent messages above · live chat below'); c.list.append(c.histEnd); c.resume = el('button', 'resume hidden', 'Jump to latest'); c.sbar = c.view.querySelector('.sbar');
  // Only YOU scrolling (wheel, touch, keys, dragging the scrollbar, or a click that jumps somewhere) stops the chat following new lines.
  // A scroll event that arrives after new lines grew the list is not you: the chat stays at the bottom. This also keeps one chat's scrolling from ever pausing another.
  const mine = () => { c.uScroll = Date.now(); };
  ['wheel', 'touchmove', 'keydown'].forEach((ev) => c.list.addEventListener(ev, mine, { passive: true }));
  c.list.addEventListener('pointerdown', () => { c.uDrag = true; mine(); }); addEventListener('pointerup', () => { if (c.uDrag) { c.uDrag = false; mine(); } });
  c.list.onscroll = () => {
    const gap = c.list.scrollHeight - c.list.scrollTop - c.list.clientHeight, now = Date.now(), byUser = c.uDrag || now - (c.uScroll || 0) < 500 || now - (S.uiAt || 0) < 700;
    if (c.stick && gap >= 40 && !byUser) { stickScroll(c); return; }
    c.stick = gap < 40; if (c.stick) mentionPillCheck(c); if (c.stick && !c.hover) { c.held = 0; c.resume.classList.add('hidden'); } else if (!c.stick) { c.resume.textContent = c.held ? `Paused · ${c.held} new` : 'Jump to latest'; c.resume.classList.remove('hidden'); } };
  c.list.onmouseenter = () => { c.hover = true; }; c.list.onmouseleave = () => { c.hover = false; flushHeld(c); if (c.stick) { c.list.scrollTop = c.list.scrollHeight; } c.held = 0; if (c.stick) c.resume.classList.add('hidden'); };
  c.resume.onclick = () => { flushHeld(c); c.stick = true; c.held = 0; c.list.scrollTop = c.list.scrollHeight; c.resume.classList.add('hidden'); };
  c.list.onclick = (e) => onListClick(c, e);
  c.sbar.querySelector('input').oninput = (e) => { c.search = e.target.value.trim().toLowerCase(); runSearch(c); };
  c.sbar.querySelector('input').onkeydown = (e) => { if (e.key === 'Escape') toggleSearch(c); };
  c.view.onmousedown = () => { if (S.settings.split && S.active !== c.login) setActive(c.login); };
  c.view.insertBefore(c.list, c.sbar.nextSibling); c.view.append(c.resume); buildPaneInput(c); $('#chats').append(c.view);
  S.chats.set(login, c); saveSettings({ tabs: [...S.chats.keys()] });
  ownRoom(c); loadShared(c).catch(() => {}); pollGuests(c).catch(() => {}); joinChannel(login); loadChannelAssets(c).catch((e) => dbg('assets ' + e)); setTimeout(() => { if (!S.chats.has(login)) return; if (chatLive(c)) loadHistory(c).catch((e) => dbg('history ' + e)); else c.stale = true; }, 400); subscribeES(c);
  if (select) setActive(login); else render();
  return { ok: true };
}
function closeChannel(login) {
  const c = S.chats.get(login); if (!c) return;
  if (S.ws && S.ws.readyState === 1) S.ws.send('PART #' + login);
  try { closeWin('users:' + login); } catch (e) {} S.closed = [login, ...(S.closed || []).filter((x) => x !== login)].slice(0, 10); c.view.remove(); S.chats.delete(login); saveSettings({ tabs: [...S.chats.keys()], splitSet: (S.settings.splitSet || []).filter((x) => x !== login) });
  if (S.active === login) { S.active = null; const n = S.chats.keys().next().value; if (n) return setActive(n); }
  render();
}
function setActive(login) {
  if (S.active && S.active !== login) { try { markLeft(S.chats.get(S.active)); } catch (e) {} }
  const back = S.active !== login; S.active = login; const c = cur(); if (c && back) { try { showNewLine(c); } catch (e) {} } if (c) { c.unread = false; ensureInSplit(login); ensureAssets(c); saveSettings({ lastActive: login }); setTimeout(() => pollPins(c), 1200); }
  if (S.pop && S.pop.node.classList.contains('epick')) { closePop(); openPicker(); }
  applySplit(); render(); if (['unbans', 'automod', 'modact', 'users', 'suspicious'].some(sideShows) || (S.settings.railTools || []).length) renderSide(); if (c) { inp().focus(); if (c.stick) c.list.scrollTop = c.list.scrollHeight; }
  if (S.replyTo && S.replyTo.c !== login) setReply(c, null);
}
// "Send message in <channel>": the name takes the channel's own colour, or the theme colour. Each chat's own box (when switched on) says its own channel.
function syncPlaceholder() {
  const c = cur(), ph = $('#inph'), box = $('#input'); if (!ph) return;
  const put = (node, ch) => { node.innerHTML = ch ? `Send message in <b>${esc(ch.name)}</b>` : 'Enter message'; const col = ch && chanColor(ch.login); if (col) node.style.setProperty('--cc', col); else node.style.removeProperty('--cc'); };
  put(ph, c); box.setAttribute('aria-label', c ? 'Send message in ' + c.name : 'Message'); try { tintComposer(c ? c.login : ''); } catch (e) {}
  if (S.settings.paneInput) S.chats.forEach((x) => { const n = x.pcomp && x.pcomp.querySelector('.inph'); if (n) { put(n, x); x.pin.setAttribute('aria-label', 'Send message in ' + x.name); } });
}
// A message box inside each chat (hidden unless Settings > Chat > "Message box in every chat" is on). Typing in one makes that chat the active one.
function buildPaneInput(c) {
  c.pcomp = el('div', 'pcomp', `<div class="replybar preply hidden"></div><div class="prow"><div class="inwrap"><input class="pin" placeholder=" " maxlength="500" autocomplete="off" spellcheck="true"><span class="inph">Enter message</span><button class="emotebtn pemote" data-tip="Emotes" aria-label="Emotes">${ico('smile', 20)}</button></div><button class="btn primary psend">Chat</button></div>`);
  c.pin = c.pcomp.querySelector('.pin'); c.pbar = c.pcomp.querySelector('.preply'); c.view.append(c.pcomp);
  wireInput(c.pin, () => { if (S.active !== c.login) setActive(c.login); });
  c.pcomp.querySelector('.psend').onclick = () => { if (S.active !== c.login) setActive(c.login); send(); c.pin.focus(); };
  c.pcomp.querySelector('.pemote').onclick = (e) => { if (S.active !== c.login) setActive(c.login); openPicker(e.currentTarget); };
}
// Switch between the one bar at the bottom (where Yappy sits by default) and a box in every chat
function applyPaneInput() {
  const on = !!S.settings.paneInput; document.body.classList.toggle('pane-in', on); lastIn = null;
  setReply(cur(), null); S.ac = null; $('#ac').classList.add('hidden'); syncPlaceholder(); try { tintComposer(S.active); } catch (e) {}
  try { Yappy.place(S.settings.yappyPos); } catch (e) {} const i = inp(); if (i && cur()) i.focus();
}
function render() { try { syncJoins(); } catch (e) {} renderTabs(); renderStats(); renderPip(); const has = !!cur(); $('#dashBtn').classList.toggle('hidden', !(S.me && S.chats.has(S.me.login))); /* the streamer dashboard is about your own channel, so it only shows once your own channel is open */ $('#empty').classList.toggle('hidden', has); $('#input').disabled = !has; syncPlaceholder(); $('#addTab').classList.toggle('full', S.chats.size >= MAX_CHANNELS); }

/* ---------- Stats strip: channel, stream title and game, then the Session Information counters ---------- */
function statVal(c, k) {
  const live = S.live.get(c.login);
  switch (k) {
    case 'chatters': { let n = 0; c.users.forEach((u) => { if (u.live) n++; }); return n; }
    case 'mpm': { const now = Date.now(); while (c.times.length && now - c.times[0] > 60000) c.times.shift(); return c.times.length; }
    case 'viewers': return live && live.viewers != null ? live.viewers.toLocaleString() : '–';
    case 'live': return live && live.started ? fmtClock(Date.now() - new Date(live.started)) : '–';
    case 'games': return c.games.length;
    default: return c.stat[k];
  }
}
const statOn = (k, def) => { const v = (S.settings.statsShow || {})[k]; return v === undefined ? !!def : !!v; };
const gameUrl = (g) => 'https://www.twitch.tv/directory/category/' + encodeURIComponent(g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
function renderStats() {
  S.chats.forEach((x) => refreshTools(x));
  const c = cur(), bar = $('#statsbar'); if (!c) return bar.classList.add('hidden');
  const m = c.modes, chips = [], live = S.live.get(c.login), nm = !!S.settings.notMod, pen = !nm && isOwner(c) ? `<button id="editInfo" class="ibtn sm pen" data-tip="Edit the title and game" aria-label="Edit title and game">${ico('pencil', 13)}</button>` : '';
  if (+m.slow > 0) chips.push('Slow ' + fmtDur(+m.slow));
  if (m['followers-only'] !== undefined && +m['followers-only'] >= 0) chips.push('Followers-only');
  if (m['subs-only'] === '1') chips.push('Subscribers-only');
  if (m['emote-only'] === '1') chips.push('Emote-only');
  if (m.r9k === '1') chips.push('Unique chat');
  if (c.shield) chips.push('Shield Mode');
  const HEAD = ['viewers', 'live'], stat1 = (k, l) => `<span class="stat"${k === 'games' && c.games.length ? ` data-tip="${esc(c.games.map((g) => g.game).join(' → '))}"` : ''}>${esc(l)} <b data-st="${k}">${statVal(c, k)}</b></span>`;
  const hstats = STAT_DEFS.filter(([k, , d]) => HEAD.includes(k) && statOn(k, d)).map(([k, l]) => stat1(k, l)).join('');
  const stats = nm ? '' : STAT_DEFS.filter(([k, , d]) => !HEAD.includes(k) && statOn(k, d)).map(([k, l]) => `<span class="stat"${k === 'games' && c.games.length ? ` data-tip="${esc(c.games.map((g) => g.game).join(' → '))}"` : ''}>${esc(l)} <b data-st="${k}">${statVal(c, k)}</b></span>`).join('');
  bar.classList.remove('hidden'); const cc = chanColor(c.login); if (cc) bar.style.setProperty('--cc', cc); else bar.style.removeProperty('--cc'); bar.classList.toggle('hascc', !!cc);
  bar.innerHTML = `<div class="srow1"><div class="chan"><img${cc ? ' class="ring"' : ''} src="${esc(c.avatar)}" alt=""><span class="conndot"></span><b>${esc(c.name)}</b>${withHtml(c)}${live ? '<span class="livepill" data-tip="Live now">LIVE</span>' : ''}</div>` +
    (live ? `<div class="smeta"><span class="stitle" data-tip="${esc(live.title || '')}">${esc(live.title || '')}</span>${live.game ? ` <i class="dot">·</i> <a href="#" class="gamelink" data-url="${esc(gameUrl(live.game))}" data-tip="Browse ${esc(live.game)} on Twitch">${esc(live.game)}</a>` : ''}${pen}</div>` : `<div class="smeta faint">Offline${pen}</div>`) +
    `<div class="chips">${chips.map((x) => `<span class="chip">${x}</span>`).join('')}</div>${nm ? '' : `<button id="notesBtn" class="ibtn" data-tip="Notes and rules for this channel" aria-label="Notes and rules">${ico('book', 17)}</button><button id="guardBtn" class="btn primary">${ico('shield', 15)} Shield</button>`}</div>` +
    (hstats || stats ? `<div class="srow2">${hstats ? `<div class="hstats">${hstats}</div>` : ''}${stats ? `<span class="lbl">Session Information</span><button id="sessTog" class="ibtn sm sessTog${S.settings.sessHide ? ' closed' : ''}" data-tip="${S.settings.sessHide ? 'Show the session counters' : 'Hide the session counters'}" aria-label="Toggle session counters">${ico('chev', 14)}</button>${S.settings.sessHide ? '' : stats}` : ''}</div>` : '');
  const st = $('#sessTog'); if (st) st.onclick = () => { saveSettings({ sessHide: !S.settings.sessHide }); renderStats(); };
  if ($('#guardBtn')) $('#guardBtn').onclick = (e) => openGuard(c, e.currentTarget); if ($('#notesBtn')) $('#notesBtn').onclick = (e) => openNotes(c, e.currentTarget); if ($('#editInfo')) $('#editInfo').onclick = () => openEditInfo(c);
  try { connPaint(); } catch (e) {}
}
let softT = 0;
function softStats() { if (softT) return; softT = setTimeout(() => { softT = 0; const c = cur(); if (!c) return; document.querySelectorAll('#statsbar [data-st]').forEach((n) => { n.textContent = statVal(c, n.dataset.st); }); }, 900); }
$('#statsbar').addEventListener('click', (e) => { const g = e.target.closest('.gamelink'); if (g) { e.preventDefault(); openLink(g.dataset.url); } });

/* ---------- Tabs ---------- */
// Where a channel streams. Every tab gets a thin coloured line along its top edge in that service's colour; a streamer on two services gets two segments.
const PLATFORMS = { twitch: ['Twitch', '#9146ff'], kick: ['Kick', '#53fc18'], youtube: ['YouTube', '#ff0033'] };
const platsOf = (c) => (c.platforms && c.platforms.length ? c.platforms : ['twitch']).filter((p) => PLATFORMS[p]);
// Tabs in the order you added them, or live channels first (the button with two arrows beside the tabs)
const isFav = (login) => !!(((S.settings.chanStyle || {})[login] || {}).fav);
const tabOrder = () => { const l = [...S.chats.values()]; return l.sort((a, b) => (isFav(b.login) - isFav(a.login)) || (S.settings.tabSort === 'live' ? S.live.has(b.login) - S.live.has(a.login) : 0)); }; // favourites first, then live first if chosen
function syncTabSort() { const b = $('#tabSort'); if (!b) return; const live = S.settings.tabSort === 'live'; b.classList.toggle('on', live); b.dataset.tip = live ? 'Live channels first. Click for the order you added them' : 'In the order you added them. Click to put live channels first'; b.setAttribute('aria-pressed', live); b.classList.toggle('hidden', S.chats.size < 2); }
function renderTabs() {
  const box = $('#tabs'); box.innerHTML = ''; syncTabSort();
  tabOrder().forEach((c) => {
    const col = chanColor(c.login), pl = platsOf(c), t = el('button', 'tab' + (c.login === S.active ? ' on' : '') + (c.unread ? ' unread' : '') + (((S.settings.chanStyle || {})[c.login] || {}).mute ? ' muted' : '') + (col ? ' hascc' : '') + (isFav(c.login) ? ' fav' : ''), `<span class="plat" data-tip="${esc(pl.map((p) => PLATFORMS[p][0]).join(' + '))}">${pl.map((p) => `<i style="background:${PLATFORMS[p][1]}"></i>`).join('')}</span><span class="tn">${esc(c.name)}</span>${S.live.has(c.login) ? '<span class="live" data-tip="Live now"></span>' : ''}<span class="x" data-tip="Close channel">×</span>`);
    if (col) t.style.setProperty('--cc', col); t.draggable = true; t.dataset.login = c.login;
    t.onclick = (e) => (e.target.classList.contains('x') ? closeChannel(c.login) : setActive(c.login));
    t.onmousedown = (e) => { if (e.button === 1) e.preventDefault(); }; t.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); closeChannel(c.login); } }; // middle-click closes a tab
    box.append(t);
  });
  const on = box.querySelector('.tab.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  S.chats.forEach((c) => { const pn = c.view.querySelector('.pn'); if (pn) pn.innerHTML = esc(c.name) + (S.live.has(c.login) ? '<span class="live" data-tip="Live now"></span>' : '') + withHtml(c); }); // live dot in split-view pane headers too
  updateTabArrows();
}
// Arrow buttons appear when there are more tabs than fit
function updateTabArrows() { const b = $('#tabs'), over = b.scrollWidth > b.clientWidth + 2; $('#tabL').classList.toggle('hidden', !over); $('#tabR').classList.toggle('hidden', !over); $('#tabMore').classList.toggle('hidden', !over); $('#tabL').disabled = b.scrollLeft <= 1; $('#tabR').disabled = b.scrollLeft + b.clientWidth >= b.scrollWidth - 1; }
$('#tabL').onclick = () => $('#tabs').scrollBy({ left: -240, behavior: 'smooth' }); $('#tabR').onclick = () => $('#tabs').scrollBy({ left: 240, behavior: 'smooth' });
$('#tabSort').onclick = () => { const live = S.settings.tabSort !== 'live'; saveSettings({ tabSort: live ? 'live' : 'added' }); renderTabs(); toast(live ? 'Live channels first' : 'Tabs in the order you added them', { ms: 1600 }); };
// The list of channels whose tabs are scrolled out of view: click one to go to it
$('#tabMore').onclick = (e) => {
  const box = $('#tabs'), br = box.getBoundingClientRect(), off = [...box.querySelectorAll('.tab')].filter((t) => { const r = t.getBoundingClientRect(); return r.left < br.left - 1 || r.right > br.right + 1; }).map((t) => S.chats.get(t.dataset.login)).filter(Boolean);
  const n = el('div', 'stack tabmore', `<h3>Not in view</h3>${off.length ? off.map((c) => { const col = chanColor(c.login); return `<button class="tm-i" data-l="${esc(c.login)}"${col ? ` style="--cc:${esc(col)}"` : ''}><span class="tm-n">${esc(c.name)}</span>${S.live.has(c.login) ? '<span class="live" aria-label="Live"></span>' : ''}${c.unread ? '<span class="tm-u">new</span>' : ''}</button>`; }).join('') : '<div class="faint">Every channel is in view.</div>'}`);
  n.querySelectorAll('.tm-i').forEach((b) => (b.onclick = () => { closePop(); setActive(b.dataset.l); }));
  popover(n, e.currentTarget, { toggle: true });
};
$('#tabs').addEventListener('scroll', updateTabArrows); addEventListener('resize', updateTabArrows);

/* ---------- Split view: up to 6 panes (5 beside a snapped stream) in a grid that scales with the window ---------- */
// splitKeep: how many chats the saved split view may hold. splitCap: how many fit right now (several streams take panes from the chats, but the saved set is kept so they return when a stream is closed)
const splitKeep = () => (S.settings.pip.open && S.settings.pip.dock && !mvOn() ? 5 : 6);
const splitCap = () => (mvOn() ? 6 - mvList().length : splitKeep());
const fitSet = (set) => { const out = set.slice(); while (out.length > splitCap()) out.splice(Math.max(0, out.findIndex((x) => x !== S.active)), 1); return out; };
// How many columns n panes use: 1-3 sit in a row, 4 make a 2x2, 5-6 use three columns (two when the chat area is narrow). An odd one out stretches across the row.
function splitCols(n) { const w = $('#chats').clientWidth || innerWidth; if (S.settings.splitStack && n >= 2 && n <= 3) return 1; return n <= 3 ? Math.max(1, n) : n === 4 ? 2 : (w >= 900 ? 3 : 2); }
// Split layouts. 'grid' is the automatic one above. The others place the chats exactly: in a row, in a column, or one big chat (the first one) with the rest small beside or below it.
const SPLIT_LAYOUTS = [['grid', 'Automatic grid'], ['cols', 'Side by side'], ['rows', 'Stacked'], ['featL', 'One big on the left'], ['featR', 'One big on the right'], ['featT', 'One big on top'], ['featB', 'One big on the bottom']];
function splitPlan(n) {
  const L = S.settings.splitLayout || 'grid'; if (n < 2 || L === 'grid') return null;
  const cell = (c, r, cs = 1, rs = 1) => ({ c, r, cs, rs });
  if (L === 'cols') return { cols: n, rows: 1, cells: Array.from({ length: n }, (_, i) => cell(i + 1, 1)) };
  if (L === 'rows') return { cols: 1, rows: n, cells: Array.from({ length: n }, (_, i) => cell(1, i + 1)) };
  const m = n - 1, small = (f) => Array.from({ length: m }, (_, i) => f(i + 1));
  if (L === 'featL') return { cols: 2, rows: m, cells: [cell(1, 1, 1, m), ...small((i) => cell(2, i))], tpl: ['1.7fr 1fr', `repeat(${m},minmax(0,1fr))`], key: 'featL' };
  if (L === 'featR') return { cols: 2, rows: m, cells: [cell(2, 1, 1, m), ...small((i) => cell(1, i))], tpl: ['1fr 1.7fr', `repeat(${m},minmax(0,1fr))`], key: 'featR' };
  if (L === 'featT') return { cols: m, rows: 2, cells: [cell(1, 1, m, 1), ...small((i) => cell(i, 2))], tpl: [`repeat(${m},minmax(0,1fr))`, '1.6fr 1fr'], key: 'featT' };
  if (L === 'featB') return { cols: m, rows: 2, cells: [cell(1, 2, m, 1), ...small((i) => cell(i, 1))], tpl: [`repeat(${m},minmax(0,1fr))`, '1fr 1.6fr'], key: 'featB' };
  return null;
}
function ensureInSplit(login) {
  if (!S.settings.split) return; let set = (S.settings.splitSet || []).filter((x) => S.chats.has(x));
  if (!set.includes(login)) { set.push(login); while (set.length > splitKeep()) set.splice(set.findIndex((x) => x !== login), 1); }
  while (set.length > splitKeep()) set.shift();
  saveSettings({ splitSet: set });
}
// Turning split view on fills it with the active channel plus the next ones in tab order
function seedSplit() { const set = (S.settings.splitSet || []).filter((x) => S.chats.has(x)); if (set.length > 1) return; const rest = [...S.chats.keys()].filter((x) => x !== S.active); saveSettings({ splitSet: [S.active, ...rest].filter(Boolean).slice(0, splitKeep()) }); }
function applySplit() {
  const sp = S.settings.split, box = $('#chats'); box.classList.toggle('split', sp);
  let set = sp ? (S.settings.splitSet || []).filter((x) => S.chats.has(x)) : [];
  if (sp) { if (S.active && !set.includes(S.active)) set.push(S.active); if (!set.length && S.chats.size) set = [S.chats.keys().next().value]; while (set.length > splitKeep()) set.splice(Math.max(0, set.findIndex((x) => x !== S.active)), 1); if (!S.loadingTabs && set.join() !== (S.settings.splitSet || []).join()) saveSettings({ splitSet: set }); }
  if (sp) set = fitSet(set); // several streams take panes from the chats; the saved set stays whole
  if (mvOn()) return mvLayout(sp ? set : [S.active].filter((x) => S.chats.has(x)));
  mvClear();
  const n = set.length, plan = sp ? splitPlan(n) : null, cols = plan ? plan.cols : splitCols(n), key = plan && plan.key ? plan.key : (plan ? plan.cols + 'x' : cols), w = (S.settings.colW || {})[key], odd = plan ? 0 : n % cols;
  box.style.setProperty('--cols', cols); box.dataset.lay = plan ? S.settings.splitLayout : 'grid'; box.dataset.key = key;
  if (plan) { // placed exactly: every chat gets a cell, and the columns can still be dragged
    box.style.gridTemplateColumns = plan.tpl && plan.tpl[0] ? (w && w.length === cols ? w.map((x) => x + 'fr').join(' ') : plan.tpl[0]) : (w && w.length === cols ? w.map((x) => x + 'fr').join(' ') : `repeat(${cols},minmax(0,1fr))`);
    box.style.gridTemplateRows = plan.tpl && plan.tpl[1] ? plan.tpl[1] : `repeat(${plan.rows},minmax(0,1fr))`;
  } else { box.style.gridTemplateColumns = sp ? (w && w.length === cols ? w.map((x) => x + 'fr').join(' ') : `repeat(${cols},minmax(0,1fr))`) : ''; box.style.gridTemplateRows = ''; }
  S.chats.forEach((x) => {
    const idx = set.indexOf(x.login), show = sp ? idx >= 0 : x.login === S.active;
    x.shown = show; x.view.classList.toggle('hidden', !show); x.view.classList.toggle('focus', sp && x.login === S.active);
    if (plan && idx >= 0) { const ce = plan.cells[idx]; x.view.style.order = idx; x.view.dataset.col = ce.c - 1; x.view.dataset.last = ce.c + ce.cs - 1 >= cols ? '1' : ''; x.view.style.gridColumn = `${ce.c} / span ${ce.cs}`; x.view.style.gridRow = `${ce.r} / span ${ce.rs}`; x.view.classList.toggle('big', idx === 0 && /^feat/.test(S.settings.splitLayout)); if (show && x.stick) x.list.scrollTop = x.list.scrollHeight; return; }
    x.view.classList.remove('big');
    const tail = idx >= 0 && odd && idx === n - 1 && cols > 1;
    x.view.style.order = idx >= 0 ? idx : 99; x.view.dataset.col = idx >= 0 ? idx % cols : 0; x.view.dataset.last = idx >= 0 && (tail || idx % cols === cols - 1) ? '1' : ''; x.view.style.gridColumn = tail ? 'span ' + (cols - odd + 1) : ''; x.view.style.gridRow = '';
    if (show && x.stick) x.list.scrollTop = x.list.scrollHeight;
  });
  box.dataset.n = n; setTimeout(placePip, 0);
}
function reorderTabs(from, toIndex) {
  const keys = [...S.chats.keys()], i = keys.indexOf(from); if (i < 0 || toIndex < 0 || toIndex >= keys.length || toIndex === i) return;
  keys.splice(i, 1); keys.splice(toIndex, 0, from); S.chats = new Map(keys.map((k) => [k, S.chats.get(k)]));
  saveSettings({ tabs: keys }); renderTabs();
}
function reorderPane(from, to) {
  const set = [...(S.settings.splitSet || [])], i = set.indexOf(from), j = set.indexOf(to); if (i < 0 || j < 0 || i === j) return;
  set.splice(i, 1); set.splice(j, 0, from); saveSettings({ splitSet: set }); applySplit();
}
$('#tabs').addEventListener('dragstart', (e) => { const t = e.target.closest('.tab'); if (t) { S.dragPane = { tab: t.dataset.login }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.dataset.login); } });
// A bright bar shows where the tab will land (before or after the one under the pointer)
const clearDrop = () => document.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
const dropSide = (e, t, vert) => { const r = t.getBoundingClientRect(); return (vert ? e.clientY - r.top > r.height / 2 : e.clientX - r.left > r.width / 2) ? 'after' : 'before'; };
$('#tabs').addEventListener('dragover', (e) => { const t = e.target.closest('.tab'); if (!(S.dragPane && S.dragPane.tab && t)) return; e.preventDefault(); clearDrop(); if (t.dataset.login !== S.dragPane.tab) t.classList.add('drop-' + dropSide(e, t)); });
$('#tabs').addEventListener('drop', (e) => {
  const t = e.target.closest('.tab'); if (!S.dragPane || !S.dragPane.tab || !t) return; e.preventDefault();
  const keys = [...S.chats.keys()], i = keys.indexOf(S.dragPane.tab); let ip = keys.indexOf(t.dataset.login) + (dropSide(e, t) === 'after' ? 1 : 0); if (i < ip) ip--;
  clearDrop(); reorderTabs(S.dragPane.tab, ip); S.dragPane = null;
});
$('#tabs').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('#tabs')) clearDrop(); });
document.addEventListener('dragend', clearDrop);
$('#chats').addEventListener('dragstart', (e) => { const h = e.target.closest && e.target.closest('.phead'); if (h) { S.dragPane = { pane: h.parentElement.dataset.login }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', S.dragPane.pane); } });
/* Dragging a chat (its tab, or the title of a pane) over the chat area shows where it will snap, like the stream window does: the left or right part of a pane puts it
   beside that chat, the top or bottom part puts it above or below, the middle swaps. Beside/above-below also sets how two or three chats are arranged. */
const dragSrc = () => S.dragPane && (S.dragPane.pane || S.dragPane.tab);
function paneZone(e, t) { const r = t.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width, dy = (e.clientY - r.top) / r.height; if (dx < 0.3) return 'left'; if (dx > 0.7) return 'right'; if (dy < 0.35) return 'top'; if (dy > 0.65) return 'bottom'; return 'swap'; }
function showPaneSnap(t, zone) {
  const s = $('#snapPrev'); if (!t) return s.classList.add('hidden'); const r = t.getBoundingClientRect(), g = 4, w2 = r.width / 2, h2 = r.height / 2;
  const b = { left: [r.left, r.top, w2, r.height], right: [r.left + w2, r.top, w2, r.height], top: [r.left, r.top, r.width, h2], bottom: [r.left, r.top + h2, r.width, h2], swap: [r.left, r.top, r.width, r.height] }[zone];
  Object.assign(s.style, { left: b[0] + g + 'px', top: b[1] + g + 'px', width: b[2] - g * 2 + 'px', height: b[3] - g * 2 + 'px' }); s.classList.remove('hidden');
}
function snapChat(src, tgt, zone) {
  if (!S.chats.has(src) || !S.chats.has(tgt) || src === tgt) return;
  let set = S.settings.split ? (S.settings.splitSet || []).filter((x) => S.chats.has(x)) : []; if (!set.includes(tgt)) set.unshift(tgt);
  const had = set.includes(src);
  if (zone === 'swap') { if (had) { const i = set.indexOf(src), j = set.indexOf(tgt); [set[i], set[j]] = [set[j], set[i]]; } else set[set.indexOf(tgt)] = src; }
  else { if (had) set.splice(set.indexOf(src), 1); set.splice(set.indexOf(tgt) + (zone === 'right' || zone === 'bottom' ? 1 : 0), 0, src); }
  while (set.length > splitKeep()) { const k = set.findIndex((x) => x !== src && x !== tgt); set.splice(k < 0 ? 0 : k, 1); }
  const patch = { split: true, splitSet: set }; if (zone === 'top' || zone === 'bottom') patch.splitStack = true; else if (zone === 'left' || zone === 'right') patch.splitStack = false;
  saveSettings(patch); setActive(src);
}
/* A chat dragged near an edge of the chat area goes on that side of the stream (the stream snaps to the opposite side), so a single chat can be moved around the stream too.
   Over the middle of a chat, the zones above place it beside, above or below that chat. With several chats the edge bands are thin, so they do not get in the way. */
const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
function streamZone(e, t) {
  const p = S.settings.pip; if (!p.open || mvOn() || !S.chats.get(pipLogin())) return null;
  const r = $('#chats').getBoundingClientRect(); if (!r.width || !r.height) return null;
  const src = dragSrc(), shown = [...S.chats.values()].filter((x) => x.shown).length, single = shown < 2 || (t && t.dataset.login === src);
  const bx = single ? 0.25 : 0.07, by = single ? 0.25 : 0.1, fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  const d = [['left', fx / bx], ['right', (1 - fx) / bx], ['top', fy / by], ['bottom', (1 - fy) / by]].filter((x) => x[1] >= 0 && x[1] < 1).sort((a, b) => a[1] - b[1]);
  return d.length ? d[0][0] : null;
}
function showStreamSnap(zone) {
  const s = $('#snapPrev'); if (!zone) return s.classList.add('hidden'); const r = $('#ws').getBoundingClientRect(), f = 1 - (S.settings.pip.dockSize || 0.45), g = 6;
  const box = { left: [r.left, r.top, r.width * f, r.height], right: [r.right - r.width * f, r.top, r.width * f, r.height], top: [r.left, r.top, r.width, r.height * f], bottom: [r.left, r.bottom - r.height * f, r.width, r.height * f] }[zone];
  Object.assign(s.style, { left: box[0] + g + 'px', top: box[1] + g + 'px', width: box[2] - g * 2 + 'px', height: box[3] - g * 2 + 'px' }); s.classList.remove('hidden');
}
$('#chats').addEventListener('dragover', (e) => {
  const src = dragSrc(); if (!src) return; const t = e.target.closest && e.target.closest('.chat'), z = streamZone(e, t);
  if (z) { e.preventDefault(); return showStreamSnap(z); }
  if (!t) return; e.preventDefault(); if (t.dataset.login === src) return $('#snapPrev').classList.add('hidden'); showPaneSnap(t, paneZone(e, t));
});
$('#chats').addEventListener('drop', (e) => {
  const src = dragSrc(), t = e.target.closest && e.target.closest('.chat'); if (!src) return; const z = streamZone(e, t);
  if (z) { e.preventDefault(); S.dragPane = null; $('#snapPrev').classList.add('hidden'); clearDrop(); savePip({ dock: OPPOSITE[z], x: null, y: null }); if (S.chats.has(src) && S.active !== src) setActive(src); return; }
  if (!t) return; e.preventDefault(); const zone = paneZone(e, t); S.dragPane = null; $('#snapPrev').classList.add('hidden'); clearDrop(); snapChat(src, t.dataset.login, zone);
});
document.addEventListener('dragend', () => { S.dragPane = null; if (!pipDrag) $('#snapPrev').classList.add('hidden'); });
$('#chats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pa]'); if (!b) return; const c = S.chats.get(b.closest('.chat').dataset.login), a = b.dataset.pa;
  if (a === 'close') { const set = (S.settings.splitSet || []).filter((x) => x !== c.login); if (!set.length) return toast('Split view needs at least one chat.', { ms: 2500 }); saveSettings({ splitSet: set }); if (S.active === c.login) S.active = set[set.length - 1]; applySplit(); render(); }
  else if (a === 'layout') layoutMenu(c, b);
  else if (a === 'search' || a === 'searchx') toggleSearch(c);
  else if (a.startsWith('tool:')) openTool(c, a.slice(5), b);
});
// Drag the right edge of a pane to change how the columns share the width
let paneRz = null;
$('#chats').addEventListener('pointerdown', (e) => {
  const g = e.target.closest('.pgrip'); if (!g) return; const pane = g.parentElement, box = $('#chats'), cols = +box.style.getPropertyValue('--cols') || 1, col = +pane.dataset.col;
  const byCol = []; [...box.querySelectorAll('.chat:not(.hidden)')].filter((x) => x.dataset.col !== undefined).sort((a, b) => a.style.order - b.style.order).forEach((x) => { if (!byCol[+x.dataset.col]) byCol[+x.dataset.col] = x; });
  const els = Array.from({ length: cols }, (_, i) => byCol[i]); if (els.some((x) => !x)) return;
  paneRz = { cols, col, key: box.dataset.key || cols, sx: e.clientX, ws: els.map((x) => x.getBoundingClientRect().width), neu: null }; g.setPointerCapture(e.pointerId); e.preventDefault();
});
$('#chats').addEventListener('pointermove', (e) => {
  if (!paneRz) return; const { cols, col, ws } = paneRz, d = e.clientX - paneRz.sx, a = Math.max(180, ws[col] + d), b = Math.max(180, ws[col + 1] - d);
  const w = ws.slice(); w[col] = a; w[col + 1] = b; paneRz.neu = w.map((x) => +(x / 100).toFixed(2)); $('#chats').style.gridTemplateColumns = paneRz.neu.map((x) => x + 'fr').join(' ');
});
$('#chats').addEventListener('pointerup', () => { if (paneRz && paneRz.neu) saveSettings({ colW: { ...(S.settings.colW || {}), [paneRz.key]: paneRz.neu } }); paneRz = null; });
$('#chats').addEventListener('dblclick', (e) => { if (!e.target.closest('.pgrip')) return; const cw = { ...(S.settings.colW || {}) }; delete cw[$('#chats').dataset.key || +$('#chats').style.getPropertyValue('--cols')]; saveSettings({ colW: cw }); applySplit(); });

// The arrange menu in a pane's header: how the chats sit, and which one is the big one
function layoutMenu(c, anchor) {
  const cur0 = S.settings.splitLayout || 'grid', set = (S.settings.splitSet || []).filter((x) => S.chats.has(x));
  const n = el('div', 'dockmenu layoutmenu', SPLIT_LAYOUTS.map(([k, l]) => `<button class="mi2${cur0 === k ? ' on' : ''}" data-l="${k}">${l}</button>`).join('') + (set.length > 1 ? `<hr><button class="mi2" data-big="1">Make ${esc(c.name)} the big one</button><div class="faint">Drag a chat's grip (⋮⋮) onto another to swap or place it.</div>` : ''));
  popover(n, anchor, { toggle: true });
  n.onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return; closePop();
    if (b.dataset.l) { saveSettings({ splitLayout: b.dataset.l }); applySplit(); }
    else if (b.dataset.big) { const ns = set.filter((x) => x !== c.login); ns.unshift(c.login); const lay = (S.settings.splitLayout || 'grid'); saveSettings({ splitSet: ns, splitLayout: /^feat/.test(lay) ? lay : 'featL' }); applySplit(); }
  };
}

/* ---------- Add channel and quick switcher ---------- */
function addChannelPrompt() {
  if (S.chats.size >= MAX_CHANNELS) return err(`You can have up to ${MAX_CHANNELS} channels open. Close one to add another.`);
  const n = el('div', 'stack', `<h3>Add channels</h3><div class="sd">Type a channel name or paste its Twitch link. To add several at once, separate them with commas. (${S.chats.size} of ${MAX_CHANNELS} used)</div><input id="ac-in" placeholder="e.g. pixelpete, nova_live, juno" spellcheck="false" autocomplete="off"><div class="addstat" id="ac-st"></div><div><button class="btn sm" id="ac-mod">Channels I moderate</button></div><div id="ac-ml"></div><div class="row"><button class="btn" id="ac-x">Cancel</button><button id="ac-go" class="btn primary">Add</button></div>`);
  modal(n); const i = $('#ac-in', n), st = $('#ac-st', n); setTimeout(() => i.focus(), 30);
  $('#ac-mod', n).onclick = () => moderatedChannels($('#ac-ml', n), i);
  let busy = false;
  const go = async () => {
    if (busy) return; const names = [...new Set(i.value.split(/[,\s]+/).map(parseChannel).filter(Boolean))];
    if (!names.length) { st.textContent = 'Type a channel name first.'; st.className = 'addstat bad'; return; }
    busy = true; const failed = []; let added = 0, first = '';
    try {
      for (let k = 0; k < names.length; k++) {
        st.textContent = names.length > 1 ? `Adding ${k + 1} of ${names.length}…` : 'Looking up the channel…'; st.className = 'addstat';
        const r = await addChannel(names[k], names.length === 1 && true).catch((e) => ({ error: e && e.message ? e.message : String(e) }));
        if (r.ok) { added++; first = first || names[k]; } else { failed.push(`${names[k]}: ${r.error}`); if (/up to \d+ channels/.test(r.error || '')) break; }
      }
      if (names.length > 1 && first) setActive(first);
      if (!failed.length) return closeModal();
      i.value = names.filter((x) => failed.some((f) => f.startsWith(x + ':'))).join(', ');
      st.textContent = (added ? `Added ${added}. ` : '') + failed.join(' · '); st.className = 'addstat bad';
    } catch (e) { dbg('addChannel threw ' + e); st.textContent = 'Something went wrong: ' + (e && e.message ? e.message : e); st.className = 'addstat bad'; }
    busy = false;
  };
  i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }; $('#ac-go', n).onclick = go; $('#ac-x', n).onclick = closeModal;
}
function openSwitcher() {
  if (!S.chats.size) return addChannelPrompt();
  const n = el('div', 'stack switcher', `<input id="sw-q" placeholder="Jump to a channel…" spellcheck="false" autocomplete="off"><div class="swlist" id="sw-l"></div>`); modal(n);
  const q = $('#sw-q', n), l = $('#sw-l', n); let sel = 0, list = [];
  const draw = () => { const v = q.value.trim().toLowerCase(); list = [...S.chats.values()].filter((c) => !v || c.login.includes(v) || c.name.toLowerCase().includes(v)); sel = Math.min(sel, Math.max(0, list.length - 1)); l.innerHTML = list.map((c, i) => `<div class="swi${i === sel ? ' on' : ''}" data-l="${c.login}"><img src="${esc(c.avatar)}" alt=""><span>${esc(c.name)}</span>${S.live.has(c.login) ? '<span class="live"></span>' : ''}${c.unread ? '<span class="dot2"></span>' : ''}</div>`).join('') || '<div class="none">No matching channel</div>'; };
  const pick = (login) => { closeModal(); if (login) setActive(login); };
  q.oninput = () => { sel = 0; draw(); };
  q.onkeydown = (e) => { if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') pick(list[sel] && list[sel].login); };
  l.onclick = (e) => { const r = e.target.closest('.swi'); if (r) pick(r.dataset.l); };
  draw(); q.focus();
}

/* ---------- Stream window: Twitch's own embed, floating or snapped beside / above / below the chat ---------- */
// Embed rules honoured: official player only, parent set, video area at least 400x300, nothing drawn over the video
const PH = 34, PF = 14, GAP = 6;
const playerSrc = (login, muted = !!S.settings.pip.muted) => `${S.playerBase.hosted && !S.hostedFail ? S.playerBase.hosted : S.playerBase.local}/player?channel=${login}&muted=${muted ? 1 : 0}`;
const pipLogin = () => { const p = S.settings.pip, l = p.channel === 'follow' ? S.active : p.channel; return S.chats.has(l) ? l : S.active; };
function pipDims(p) { const w = Math.min(Math.max(p.w || 480, 400), Math.max(400, innerWidth - 16)), vh = Math.max(300, Math.round((w * 9) / 16)); return { w, vh, h: vh + PH + PF }; }
// Twitch needs the video area to be at least 400x300. A snapped window is widened to fit; if the window is too small for that, it floats instead.
function dockInfo() {
  const p = S.settings.pip; if (!p.dock || mvOn()) return null; const r = $('#ws').getBoundingClientRect(), horiz = p.dock === 'left' || p.dock === 'right';
  const min = horiz ? (400 + GAP) / r.width : (300 + PH + PF + GAP) / r.height, cross = horiz ? r.height >= 300 + PH + PF : r.width >= 400;
  if (!cross || min > 0.8) return null; return { side: p.dock, size: Math.max(p.dockSize || 0.45, min) };
}
function applyDock() {
  const p = S.settings.pip, ws = $('#ws'), slot = $('#dockSlot'), di = p.open && S.chats.get(pipLogin()) ? dockInfo() : null, on = !!di;
  ws.dataset.dock = on ? di.side : ''; slot.classList.toggle('hidden', !on);
  if (on) slot.style.flexBasis = Math.round(di.size * 1000) / 10 + '%';
}
function renderPip() {
  const box = $('#pip'), p = S.settings.pip, login = pipLogin(), c = S.chats.get(login);
  $('#pipBtn').classList.toggle('on', !!(p.open && c)); try { cg.keepAlive(!!(p.open && c)); } catch (e) {}
  if (!p.open || !c) { box.classList.add('hidden'); box.innerHTML = ''; S.pipLogin = null; fitModals(null); applyDock(); applySplit(); return; }
  if (mvOn()) { box.classList.add('hidden'); box.innerHTML = ''; S.pipLogin = null; fitModals(null); applyDock(); applySplit(); return; } // several streams live in the chat grid (multistream.js)
  if (document.querySelector('#chats .vpane')) { S.pipLogin = null; applySplit(); } // back to one stream: it returns to its own window
  box.classList.remove('hidden'); applyDock();
  const switched = S.pipLogin && S.pipLogin !== login && p.channel === 'follow';
  if (S.pipLogin !== login) buildPip(login);
  syncPipIcons(); placePip(); checkSubAds(login);
  if (switched && !S.settings.pipHint) pipHint();
}
// First time the stream changes because you switched chat tabs: explain it and point at the fix
function pipHint() {
  saveSettings({ pipHint: true }); const sel = () => $('#pip select[data-p=channel]'), pulse = () => { const s = sel(); if (s) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); setTimeout(() => s.classList.remove('pulse'), 6500); } };
  toast('The stream window follows the chat tab you are on, so switching tabs switches the stream. To keep one stream, pick it in the stream window\'s channel menu instead of "Follow active tab".', { ms: 16000, action: { label: 'Show me', fn: pulse } }); pulse();
}
// Twitch skips ads for subscribers (and Turbo) only when the player knows who is watching. The player keeps its own Twitch sign-in, so for a channel you
// subscribe to and are not signed in for, offer the sign-in once.
async function playerSignIn() {
  const ok2 = await cg.playerSignIn();
  if (ok2) { document.querySelectorAll('#pip webview, #chats webview').forEach((w) => { try { w.reload(); } catch (e) {} }); toast('Signed in. The stream player now knows who you are, so Twitch can skip ads for subscribed channels.', { ms: 6000 }); }
  else toast('The sign-in was not finished. The stream player will keep showing ads.', { ms: 4000 });
  return ok2;
}
async function checkSubAds(login) {
  try {
    const c = S.chats.get(login); if (!c || !c.id || !S.me || c.id === S.me.id || !hasScope('user:read:subscriptions')) return;
    S.adAsk = S.adAsk || new Set(); if (S.adAsk.has(login) || S.settings.adHintOff) return;
    if (await cg.playerStatus()) return; S.adAsk.add(login);
    const r = await helix('subscriptions/user', { query: { broadcaster_id: c.id, user_id: S.me.id } }); if (r.status !== 200) return; // 404 means not subscribed
    toast(`You subscribe to ${c.name}. Sign in to Twitch in the stream window so Twitch can skip ads for you.`, { ms: 20000, action: { label: 'Sign in', fn: playerSignIn } });
  } catch (e) {}
}
function buildPip(login) {
  const p = S.settings.pip; S.pipLogin = login; tintPip(login);
  const opts = [`<option value="follow" ${p.channel === 'follow' ? 'selected' : ''}>Follow active tab</option>`, ...[...S.chats.values()].map((x) => `<option value="${x.login}" ${p.channel === x.login ? 'selected' : ''}>${esc(x.name)}</option>`)].join('');
  const b = (a, i, tip) => `<button data-p="${a}" data-tip="${tip}" aria-label="${tip}">${ico(i, 16)}</button>`;
  $('#pip').innerHTML = `<div class="pip-head"><select data-p="channel" data-tip="Which stream to show">${opts}</select><button data-p="add" class="addst" data-tip="Add another stream (up to 4)" aria-label="Add another stream (up to 4)">${ico('plus', 14)}<span>Add Stream</span></button><span class="grow"></span>${b('size', 'size', 'Change size')}${b('corner', 'corner', 'Move to the next corner')}${b('dock', 'dockR', 'Snap to a side')}${b('close', 'x', 'Close stream')}</div><webview class="pip-view" src="${playerSrc(login)}" partition="persist:player" allowpopups></webview><div class="pip-foot"><div class="pip-grip" data-tip="Drag to resize"></div></div>`;
  const wv = $('#pip webview'); watchPlayerFullscreen(wv);
  // If the hosted player page cannot be reached, fall back to the local page (still Twitch's own unmodified player)
  wv.addEventListener('did-fail-load', (ev) => { if (ev.isMainFrame && ev.errorCode !== -3 && S.playerBase.hosted && !S.hostedFail && wv.src.startsWith(S.playerBase.hosted)) { S.hostedFail = true; dbg('hosted player failed, using local'); wv.src = playerSrc(login); } });
}
function syncPipIcons() {
  const p = S.settings.pip, box = $('#pip'); if (!box.querySelector('[data-p=corner]')) return;
  box.classList.toggle('docked', !!p.dock); box.querySelector('[data-p=corner]').classList.toggle('hidden', !!p.dock);
  box.querySelector('[data-p=dock]').innerHTML = ico(({ left: 'dockL', right: 'dockR', top: 'dockT', bottom: 'dockB' })[p.dock] || 'float', 16);
}
function placePip() {
  if (mvOn()) return mvPlace();
  const box = $('#pip'), p = S.settings.pip; if (box.classList.contains('hidden')) return; let x, y, w, h;
  if (p.dock && dockInfo()) {
    const r = $('#dockSlot').getBoundingClientRect(); x = r.left; y = r.top; w = r.width; h = r.height;
    if (p.dock === 'left') w -= GAP; if (p.dock === 'right') { x += GAP; w -= GAP; } if (p.dock === 'top') h -= GAP; if (p.dock === 'bottom') { y += GAP; h -= GAP; }
  } else {
    const d = pipDims(p); w = d.w; h = d.h; const wr = $('#ws').getBoundingClientRect(), m = 14, top = Math.max(wr.top, 50) + m, bot = Math.min(wr.bottom, innerHeight) - h - m;
    const corners = [[m, top], [innerWidth - w - m, top], [innerWidth - w - m, bot], [m, bot]]; x = p.x; y = p.y; if (x == null || y == null) [x, y] = corners[p.corner ?? 1];
    x = Math.max(0, Math.min(innerWidth - w, x)); y = Math.max(0, Math.min(innerHeight - h, y));
  }
  Object.assign(box.style, { width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px', left: x + 'px', top: y + 'px', display: 'flex' });
  keepClear(x, y, w, h);
}
// Toasts and Yappy move aside so nothing of ours stays over the video. Dialogs, Settings and the emote and name lists open on top while they are in use.
const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function fitModals() { const bd = document.querySelector('#modals .backdrop'); if (bd) { bd.style.padding = ''; bd.style.clipPath = ''; bd.style.removeProperty('--fw'); bd.style.removeProperty('--fh'); const md = bd.firstElementChild; if (md) md.classList.remove('narrow'); } return true; }
function keepClear(x, y, w, h) {
  const pr = { left: x, top: y, right: x + w, bottom: y + h }, box = $('#pip');
  box.classList.toggle('under-modal', !fitModals(pr));
  const yp = $('.yappy'), l = pr.left, r = innerWidth - pr.right;
  [$('#toasts'), $('.y-bubble')].forEach((t) => { if (!t) return; t.style.left = ''; if (!t.classList.contains('hidden') && hit(pr, t.getBoundingClientRect())) t.style.left = (l > r ? l / 2 : pr.right + r / 2) + 'px'; });
  if (yp) { Yappy.place(S.settings.yappyPos); if (!yp.classList.contains('docked') && hit(pr, yp.getBoundingClientRect())) { yp.style.right = Math.max(8, innerWidth - pr.left + 10) + 'px'; yp.classList.add('moved'); } }
}
new MutationObserver(() => placePip()).observe($('#modals'), { childList: true, subtree: true });
new MutationObserver(() => placePip()).observe($('#toasts'), { childList: true });
function savePip(patch, rebuild) { S.settings.pip = { ...S.settings.pip, ...patch }; saveSettings({ pip: S.settings.pip }); if (rebuild) S.pipLogin = null; if (patch.dock !== undefined) { if (S.settings.split) applySplit(); } renderPip(); setTimeout(placePip, 30); }
function snapZone(x, y) {
  const r = $('#ws').getBoundingClientRect(), t = 64;
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  if (x - r.left < t) return 'left'; if (r.right - x < t) return 'right'; if (y - r.top < t) return 'top'; if (r.bottom - y < t) return 'bottom'; return null;
}
function showSnap(zone) {
  const s = $('#snapPrev'); if (!zone) return s.classList.add('hidden'); const r = $('#ws').getBoundingClientRect(), f = S.settings.pip.dockSize || 0.45, g = 6;
  const box = { left: [r.left, r.top, r.width * f, r.height], right: [r.right - r.width * f, r.top, r.width * f, r.height], top: [r.left, r.top, r.width, r.height * f], bottom: [r.left, r.bottom - r.height * f, r.width, r.height * f] }[zone];
  Object.assign(s.style, { left: box[0] + g + 'px', top: box[1] + g + 'px', width: box[2] - g * 2 + 'px', height: box[3] - g * 2 + 'px' }); s.classList.remove('hidden');
}
let pipDrag = null;
$('#pip').addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('.pip-grip'), head = e.target.closest('.pip-head');
  if (e.target.closest('button,select') || (!grip && !head)) return;
  const box = $('#pip'), r = box.getBoundingClientRect();
  pipDrag = { mode: grip ? 'size' : 'move', sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, started: !S.settings.pip.dock, zone: null };
  box.setPointerCapture(e.pointerId); box.classList.add('dragging'); e.preventDefault();
});
$('#pip').addEventListener('pointermove', (e) => {
  if (!pipDrag) return; const dx = e.clientX - pipDrag.sx, dy = e.clientY - pipDrag.sy, p = S.settings.pip;
  if (pipDrag.mode === 'move') {
    if (!pipDrag.started) { if (Math.hypot(dx, dy) < 14) return; pipDrag.started = true; const d = pipDims({ ...p, dock: null }); p.dock = null; p.x = e.clientX - d.w / 2; p.y = e.clientY - 17; pipDrag.sx = e.clientX; pipDrag.sy = e.clientY; pipDrag.x = p.x; pipDrag.y = p.y; applyDock(); if (S.settings.split) applySplit(); syncPipIcons(); }
    else { p.x = pipDrag.x + dx; p.y = pipDrag.y + dy; }
    pipDrag.zone = snapZone(e.clientX, e.clientY); showSnap(pipDrag.zone);
  } else { p.w = Math.max(400, Math.min(innerWidth - 16, pipDrag.w + Math.max(dx, (dy * 16) / 9))); p.x = pipDrag.x; p.y = pipDrag.y; }
  placePip();
});
$('#pip').addEventListener('pointerup', () => {
  if (!pipDrag) return; const z = pipDrag.zone; pipDrag = null; $('#pip').classList.remove('dragging'); showSnap(null);
  if (z) savePip({ dock: z, x: null, y: null }); else saveSettings({ pip: S.settings.pip });
});
// Dragging the thin handle between the snapped stream and the chat changes how much room each gets
let dockRz = null;
$('#dockSlot').addEventListener('pointerdown', (e) => { if (!e.target.closest('.dockgrip')) return; dockRz = true; e.target.setPointerCapture(e.pointerId); e.preventDefault(); });
$('#dockSlot').addEventListener('pointermove', (e) => {
  if (!dockRz) return; const r = $('#ws').getBoundingClientRect(), d = S.settings.pip.dock;
  const f = d === 'left' ? (e.clientX - r.left) / r.width : d === 'right' ? (r.right - e.clientX) / r.width : d === 'top' ? (e.clientY - r.top) / r.height : (r.bottom - e.clientY) / r.height;
  S.settings.pip.dockSize = Math.max(0.2, Math.min(0.75, f)); applyDock(); placePip();
});
$('#dockSlot').addEventListener('pointerup', () => { if (dockRz) { dockRz = null; saveSettings({ pip: S.settings.pip }); } });
$('#pip').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-p]'); if (!b) return; const p = S.settings.pip, a = b.dataset.p;
  if (a === 'close') savePip({ open: false });
  else if (a === 'add') mvAdd();
  else if (a === 'size') { if (p.dock) savePip({ dockSize: p.dockSize < 0.4 ? 0.5 : p.dockSize < 0.58 ? 0.66 : 0.33 }); else savePip({ w: p.w < 560 ? 640 : p.w < 740 ? 820 : 480 }); }
  else if (a === 'corner') savePip({ corner: ((p.corner ?? 1) + 1) % 4, x: null, y: null });
  else if (a === 'dock') {
    const n = el('div', 'dockmenu', ['left', 'right', 'top', 'bottom', null].map((d) => `<button class="ibtn${p.dock === d && p.mvLay !== 'between' ? ' on' : ''}" data-d="${d || ''}" data-tip="${d ? 'Snap ' + d : 'Float'}">${ico(({ left: 'dockL', right: 'dockR', top: 'dockT', bottom: 'dockB' })[d] || 'float', 18)}</button>`).join('') + `<button class="ibtn${mvBetween() ? ' on' : ''}" data-between="1" data-tip="Between two chats: split view with the stream in the middle">${ico('grid', 18)}</button>`);
    popover(n, b); n.onclick = (ev) => {
      const x = ev.target.closest('button'); if (!x) return; closePop();
      if (x.dataset.between) { // split view with at least two chats, stacked around the stream
        if (S.chats.size < 2) return toast('Open a second chat first. The stream sits between two chats.', { ms: 4000 });
        if (!S.settings.split) { saveSettings({ split: true }); seedSplit(); $('#splitBtn').classList.add('on'); }
        const set = (S.settings.splitSet || []).filter((y) => S.chats.has(y)); if (set.length < 2) saveSettings({ splitSet: [...new Set([...set, ...S.chats.keys()])].slice(0, splitKeep()) });
        savePip({ mvLay: 'between', open: true }, false); applySplit(); return toast('The stream is now between your chats. Drag its top bar to swap places, or use the layout button to change it.', { ms: 5000 });
      }
      savePip({ dock: x.dataset.d || null, x: null, y: null, ...(p.mvLay === 'between' ? { mvLay: 'top' } : {}) });
    };
  }
});
$('#pip').addEventListener('change', (e) => { if (e.target.dataset.p === 'channel') savePip({ channel: e.target.value }, true); });
$('#pipBtn').onclick = () => { if (!cur()) return err('Add a channel first.'); if (!S.playerBase || !S.playerBase.local) return err('The stream window is not ready yet. Try again in a moment.'); savePip({ open: !S.settings.pip.open }, true); };
addEventListener('resize', () => { placePip(); if (S.settings.split && !mvOn()) { const n = (S.settings.splitSet || []).filter((x) => S.chats.has(x)).length || 1, pl = splitPlan(n); if (+$('#chats').style.getPropertyValue('--cols') !== (pl ? pl.cols : splitCols(n))) applySplit(); } });
if (window.ResizeObserver) new ResizeObserver(() => placePip()).observe($('#ws'));
// "Keep the stream smooth": while a stream window is showing, idle decorative motion (Yappy, glowing names) is paused so the video has the graphics card to itself
setInterval(() => {
  try { document.body.classList.toggle('streamcalm', S.settings.calmStream !== false && !document.hidden && (!!document.querySelector('#pip:not(.hidden) webview') || !!document.querySelector('#chats .sp-view'))); } catch (e) {}
}, 1500);

/* ---------- Fullscreen from the player's own button fills the screen with the stream, not with YappyChat ----------
   The player lives in a webview. When it asks for fullscreen, Electron makes the window fullscreen, so the webview itself is
   made the fullscreen element (and pinned over everything as a fallback). Esc or the player's button brings it back. */
function watchPlayerFullscreen(wv) {
  if (!wv || wv._fsw) return; wv._fsw = true;
  wv.addEventListener('enter-html-full-screen', () => {
    wv.classList.add('wvfull'); document.body.classList.add('wvfull-on');
    try { if (document.fullscreenElement !== wv && wv.requestFullscreen) wv.requestFullscreen().catch(() => {}); } catch (e) {}
  });
  wv.addEventListener('leave-html-full-screen', () => {
    wv.classList.remove('wvfull'); if (!document.querySelector('webview.wvfull')) document.body.classList.remove('wvfull-on');
    try { if (document.fullscreenElement === wv) document.exitFullscreen().catch(() => {}); } catch (e) {}
  });
}
// Leaving fullscreen from our side (Esc) also takes the player out of it
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) return;
  document.querySelectorAll('webview.wvfull').forEach((w) => { w.classList.remove('wvfull'); try { w.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {}); } catch (e) {} });
  document.body.classList.remove('wvfull-on');
});
