'use strict';
/* ---------- Yappy: mascot and suggestions ---------- */
const STOP = new Set('the and you that this with have just like what your for are but not was they from will can all get out has had who how why now our one his her she him its too out did does let got via yes yep nope lol lmao lmfao omg wtf haha kappa pog'.split(' '));
// Tips Yappy gives when you click him. Each can have a "Show me" button (a = what it opens). They point at things people tend to miss.
const TIPS = [
  { t: 'Press Ctrl+K to jump to any channel, or type a new name to open it.' },
  { t: 'Ctrl+Shift+P opens the command palette: every action in YappyChat, searchable, without hunting through menus.', a: 'palette' },
  { t: 'Ctrl+Shift+F searches every open chat at once. Ctrl+F searches just the one you are in.', a: 'search' },
  { t: 'Type /search @name clip to find everything someone said about "clip". Click a result to jump to that moment in chat.' },
  { t: 'Tab completes emotes and @names. Type ; and the start of a macro name, then Tab, to fill in the macro.' },
  { t: 'Click any name for a user card: account age, follow date, your notes and their recent messages.' },
  { t: 'Hover a message for quick buttons: reply, pin, copy and more. Click a reply bar to open the whole conversation.' },
  { t: 'Right-click a channel tab to give it its own colour and notification sound.' },
  { t: 'Drag a tab to reorder it. A bright line shows where it will land.' },
  { t: 'The grid button splits the window into up to six chats. Drag a pane by its grip to swap places.' },
  { t: 'Alt+Up selects the newest message, then D deletes, T times out, B bans and W warns. Enter opens the card. Moderate without the mouse.', mod: 1 },
  { t: 'Moderators can press the Shield button for slow mode, followers-only and Shield Mode in one place.', mod: 1 },
  { t: 'Highlights light up messages with your words. Add * as a wildcard: Mod* matches mods and moderator. Each can have its own colour and sound.', a: 'highlights', l: 'Open Highlights' },
  { t: 'Ctrl+Shift+S turns on streamer mode: private panels blur, sounds mute and desktop notifications hide before you share your screen.' },
  { t: 'Want it quieter? Settings has a message backgrounds option that hides supporters\' coloured backgrounds, or keeps them still.', a: 'chat', l: 'Open Chat settings' },
  { t: 'Each chat can show its own stream. Use the stream window and snap it beside your chat by dragging it to a screen edge.' },
  { t: 'The bell opens the activity panel: whispers, raids and everything I notice are kept there, so nothing is lost if you look away.', a: 'activity', l: 'Open Activity' },
  { t: 'Settings > Appearance has colour themes, a compact layout and colour-vision modes that make names easier to tell apart.', a: 'appearance', l: 'Open Appearance' },
  { t: 'Save power in the background (Settings > Appearance) pauses animations when YappyChat is hidden or unfocused. It never pauses the stream.', a: 'appearance', l: 'Open Appearance' },
  { t: 'The hand button on a first-time chatter sends them a saved greeting as a reply. Write yours, one per line, in Settings > Saved messages.', mod: 1 },
  { t: 'Perks and the supporter wall live on the website. Click the heart at the top for name effects, plates, titles and message backgrounds.', a: 'shop', l: 'Open the perks page' },
  { t: 'Not sure what a feature does? The guide on the website walks through all of it with pictures.', a: 'guide', l: 'Open the guide' }
];
const TIP_ACT = {
  palette: () => openPalette(), search: () => openGlobalSearch(), activity: () => openSide('yappy'),
  highlights: () => openSettings('Highlights'), chat: () => openSettings('Chat'), appearance: () => openSettings('Appearance'), 
  shop: () => Perks.openShop(), guide: () => Perks.openSite('/guide')
};
let tipAt = -1;
function yappyTip() {
  const pool = TIPS.filter((x) => !(x.mod && S.settings.notMod)); tipAt = tipAt < 0 ? Math.floor(Math.random() * pool.length) : tipAt + 1;
  const tip = pool[tipAt % pool.length], actions = [];
  if (tip.a && TIP_ACT[tip.a]) actions.push({ label: tip.l || 'Show me', primary: true, fn: TIP_ACT[tip.a] });
  actions.push({ label: 'Another tip', fn: () => setTimeout(yappyTip, 60) });
  Yappy.say({ text: tip.t, tip: true, mood: 'happy', actions });
}
function initYappy() {
  setTimeout(() => { const b = document.querySelector('.y-bubble'), st = document.getElementById('toasts'); if (b && st && b.parentNode !== st) st.append(b); }, 0); // Yappy's speech bubble sits in the one place every notice appears
  // That place lines up with the right end of the message box (where Yappy sits), so notices never cover the activity rail
  // Twitch asks apps not to cover or get in the way of its player (and its ads), so when a stream sits in that corner the notices move beside it,
  // over the chat, or just above it when it spans the whole width. They never sit on a video or its control bar.
  const st = document.getElementById('toasts'), f = document.querySelector('footer.composer'), line = () => {
    if (!st || !f) return; const r = f.getBoundingClientRect(); let right = r.width ? Math.max(8, innerWidth - r.right + 4) : 14; st.style.bottom = ''; st.style.maxWidth = ''; st.style.right = right + 'px';
    const vids = [...document.querySelectorAll('#pip:not(.hidden), #chats .vpane:not(.hidden)')].map((v) => v.getBoundingClientRect()).filter((v) => v.width > 0 && v.height > 0);
    const w = Math.min(420, innerWidth - 28), box = () => { const b = st.getBoundingClientRect(), h = Math.max(b.height, 70); return { left: innerWidth - right - w, right: innerWidth - right, top: b.bottom - h, bottom: b.bottom }; };
    for (const v of vids) { const b = box(); if (!(b.left < v.right && b.right > v.left && b.top < v.bottom && b.bottom > v.top)) continue;
      if (v.left - 20 >= Math.min(w, 300)) { right = innerWidth - v.left + 12; st.style.right = right + 'px'; st.style.maxWidth = Math.min(420, v.left - 20) + 'px'; } else st.style.bottom = Math.max(innerHeight - v.top + 10, 60) + 'px'; }
  };
  window.placeToasts = line;
  if (f && window.ResizeObserver && !initYappy.ro) { initYappy.ro = new ResizeObserver(line); initYappy.ro.observe(f); addEventListener('resize', line); new MutationObserver(line).observe(st, { childList: true }); } line();
  Yappy.init({
    onHide: () => { saveSettings({ yappyShow: false }); toast('Yappy is hidden. His notices still appear as pop-ups (change this in Settings > Yappy).'); },
    onDismiss: (s) => { if (s.coolKey) S.yCool[s.coolKey] = Date.now() + 15 * 60000; if (s._log) s._log.result = 'Dismissed'; },
    onSay: () => play('yappy'),
    onMove: (p) => saveSettings({ yappyPos: p }),
    onSqueeze: () => { const s = S.settings; if (s.streamer && s.streamerMute !== false) return; Sounds.squeak(s.volume ?? 0.6); }, // right-click: a stress-ball squeak
    onClick: () => { if (Yappy.busy()) Yappy.close(); if (!kindOn('tips')) return openSide('yappy'); setTimeout(yappyTip, Yappy.busy() ? 700 : 0); } // clicking Yappy gives a tip; the Activity button opens what he has been up to
  });
  applyYappy();
}
function applyYappy() { Yappy.animate = S.settings.yappyAnimate !== false && palette() !== 'minimal'; document.body.classList.toggle('pane-in', !!S.settings.paneInput); document.body.classList.toggle('rev-chat', !!S.settings.reverseChat); document.body.classList.toggle('pane-only', !!(S.settings.paneInput && S.settings.paneOnly)); Yappy.place(S.settings.yappyPos); if (S.me) Yappy.setVisible(!!S.settings.yappyShow); }
// Every suggestion is recorded in the Activity sidebar (with a time), even if Yappy is hidden or you were away
// Kinds of Yappy notice that can be switched on and off in Settings > Yappy
const YAPPY_KINDS = [['live', 'Who is live when you log in', 'A count of your live channels when you log in'], ['whisper', 'Whispers', 'When someone whispers you'], ['raid', 'Raids', 'When a raid arrives in any of your chats'], ['banlist', 'Ban on sight', 'When someone on your Ban on sight list speaks'], ['spam', 'Spam suggestions', 'Repeated messages and copy-paste waves'], ['shield', 'Raid-protection suggestions', 'Many actions at once, or a surge of first-time chatters'], ['words', 'Word-filter suggestions', 'When you keep deleting the same word'], ['away', 'While you were away', 'A short summary when you come back after a while'], ['mods', 'Suggestions from your moderating', 'When the same person keeps getting moderated, or after a ban'], ['tips', 'Tips', 'The little tip when you click Yappy']];
// A switch in Settings > Yappy. The finer switches started as one ("mods", "spam", "shield"): switching that one off earlier still counts.
const KIND_PARENT = { modrepeat: 'mods', banblock: 'mods', repeat: 'spam', firsts: 'shield' };
const kindOn = (k) => { const m = S.settings.yappyKinds || {}; return !k || (m[k] !== false && (!KIND_PARENT[k] || m[k] === true || m[KIND_PARENT[k]] !== false)); };
const offerKind = (t) => (t.startsWith('mod-repeat-') ? 'modrepeat' : t.startsWith('mod-ban-') ? 'banblock' : t.startsWith('word-') ? 'words' : t.startsWith('rep-') ? 'repeat' : t === 'raid' ? 'firsts' : t);
// How big something has to be before Yappy speaks up (Settings > Yappy > Spam, "How busy your chats are").
// Automatic starts from the Medium numbers and raises the spam and first-timer ones in busy chats, so a 1,000-person chat isn't
// told about every meme wave. The sizes are fixed numbers; Custom is whatever you typed into the boxes.
const YL_DEF = { spamN: 20, spamS: 20, repeatN: 4, wordN: 3, firstsN: 6, firstsS: 30, actsN: 8, actsM: 2, modrepN: 3, modrepM: 30, coolM: 5 };
const YL_SIZES = {
  small: { spamN: 8, spamS: 20, repeatN: 3, wordN: 3, firstsN: 4, firstsS: 30, actsN: 6, actsM: 2, modrepN: 3, modrepM: 30, coolM: 5 },
  medium: YL_DEF,
  large: { spamN: 50, spamS: 20, repeatN: 5, wordN: 5, firstsN: 15, firstsS: 30, actsN: 15, actsM: 2, modrepN: 3, modrepM: 30, coolM: 10 },
  huge: { spamN: 120, spamS: 20, repeatN: 6, wordN: 8, firstsN: 40, firstsS: 30, actsN: 25, actsM: 2, modrepN: 4, modrepM: 30, coolM: 15 },
};
const YL_MAX = { spamN: 2000, spamS: 120, repeatN: 50, wordN: 50, firstsN: 1000, firstsS: 300, actsN: 200, actsM: 30, modrepN: 20, modrepM: 240, coolM: 120 };
const ylSize = () => (S.settings.yappySize in YL_SIZES || S.settings.yappySize === 'custom' ? S.settings.yappySize : 'auto');
const ylBase = (z = ylSize()) => (z === 'custom' ? { ...YL_DEF, ...(S.settings.yappyLimits || {}) } : YL_SIZES[z] || YL_DEF);
const yl = (k) => { const v = Math.round(+ylBase()[k]); return v > 0 ? Math.min(v, YL_MAX[k]) : YL_DEF[k]; };
const ylCool = () => yl('coolM') * 60000;
function offer(c, type, cool, s) {
  if (!S.settings.yappySuggest || !kindOn(offerKind(type))) return;
  const k = type + ':' + c.login, now = Date.now(); if ((S.yCool[k] || 0) > now) return; S.yCool[k] = now + cool;
  const entry = { ts: now, text: s.text, c: c.login, result: '' }; S.ylog.unshift(entry); S.ylog.length = Math.min(S.ylog.length, 200); bump('yappy');
  const actions = (s.actions || []).map((a) => ({ ...a, fn: () => { entry.result = 'You chose: ' + a.label; if (sideShows('yappy')) renderSide(); a.fn(); } }));
  if (S.settings.streamer || S.settings.focus) return; // Focus: the suggestion waits in the Yappy section
  if (S.settings.yappyShow) afterToasts(() => Yappy.say({ ...s, actions, coolKey: k, _log: entry }));
  else if (S.settings.yappyNotify) { const a = actions.find((x) => x.primary) || actions[0]; play('yappy'); toast(s.text, { ms: 12000, private: true, action: a ? { label: a.label, fn: a.fn } : undefined }); }
}
// A plain Yappy notice (not a pattern suggestion): shown by Yappy and kept in the Activity log
// Yappy shows notices himself. If he is hidden, notices still appear as a small pop-up unless "Yappy notices" is switched off.
// Everything that notifies you is also kept in the Yappy tab, so nothing is lost if you miss it
function yLog(text, c, chans) { const now = Date.now(), top = S.ylog[0]; if (top && top.text === text && now - top.ts < 4000) return; S.ylog.unshift({ ts: now, text, c: c || '', chans: chans || null, result: '' }); S.ylog.length = Math.min(S.ylog.length, 200); bump('yappy'); if (sideShows('yappy')) renderSide(); }
function notifyYappy(text, actions, kind, chans, noLog) {
  if (!kindOn(kind)) return; if (!noLog) yLog(text, '', chans);
  if (S.settings.streamer || (S.settings.focus && !['banlist', 'raid', 'whisper'].includes(kind)) || !S.settings.yappyNotify) return; // Focus: only ban-list matches, raids and whispers still pop up. Off by default: the notice waits in the Yappy section of the activity rail
  if (S.settings.yappyShow) return Yappy.say({ text, mood: 'excited', actions: actions || [] });
  const a = (actions || []).find((x) => x.primary) || (actions || [])[0]; play('yappy');
  toast(text, { ms: 9000, private: true, action: a ? { label: a.label, fn: a.fn } : undefined });
}
function learn(c, text) {
  if (!text || !isMod(c)) return; const seen = new Set();
  (text.toLowerCase().match(/[a-z0-9']{3,}/g) || []).forEach((w) => {
    if (STOP.has(w) || seen.has(w)) return; seen.add(w); const n = (c.delWords.get(w) || 0) + 1; c.delWords.set(w, n);
    if (n === yl('wordN') || n === yl('wordN') * 3) {
      const acts = [{ label: 'Add to blocked terms', primary: true, fn: () => addBlocked(c, w) }];
      if (!(S.settings.hl || []).some((x) => x.w.toLowerCase() === w)) acts.push({ label: 'Highlight it', fn: () => { addHighlight(w); toast(`"${w}" will now be highlighted`); } });
      offer(c, 'word-' + w, ylCool(), { text: `You've removed ${n} messages containing "${w}" in ${c.name}. Want me to catch it automatically?`, mood: 'surprised', actions: acts });
    }
  });
}
async function addBlocked(c, w) {
  const r = await helix('moderation/blocked_terms', { method: 'POST', query: mq(c), body: { text: w } });
  if (ok(r)) toast(`Added "${w}" to ${c.name}'s blocked terms`); else err(apiErr(r));
}
// Suggestions that come from what you have just done as a moderator
function modSuggest(chan, kind, target, by) {
  const c = S.chats.get(chan); if (!c || !target || !isMod(c) || !S.me) return;
  const t = String(target).toLowerCase(), now = Date.now();
  // Only your own actions. A line with no name yet (chat reports a ban before Twitch says who did it) counts only if you acted on that person in the last few seconds.
  const mine = by ? String(by).toLowerCase() === S.me.login || by === S.me.display_name : !!(c.mine && now - (c.mine.get(t) || 0) < 5000);
  if (!mine) return; c.modHist = c.modHist || new Map();
  if (/^(timeout|delete|warn)$/.test(kind)) {
    const mw = yl('modrepM') * 60000, l = (c.modHist.get(t) || []).filter((x) => now - x < mw); l.push(now); c.modHist.set(t, l);
    if (l.length >= yl('modrepN')) offer(c, 'mod-repeat-' + t, mw, { text: `${dn(c, target)} has been moderated ${l.length} times in ${fmtDurLong(yl('modrepM') * 60)} in ${c.name}. A longer timeout or a ban may be the better answer.`, mood: 'thinking', actions: [{ label: 'Ban', primary: true, fn: async () => { const id = await idOf(t); if (id) ban(c, id, t, 0, 'Repeated rule-breaking'); } }, { label: 'Timeout 1 day', fn: async () => { const id = await idOf(t); if (id) ban(c, id, t, 86400, 'Repeated rule-breaking'); } }] });
  }
  if (kind === 'ban') {
    const u = c.users.get(t), last = u && u.msgs && u.msgs[u.msgs.length - 1], txt = last && String(last.text || '').trim();
    if (txt && txt.length >= 6 && txt.length <= 80 && !/^!/.test(txt)) offer(c, 'mod-ban-' + t, 10 * 60000, { text: `You banned ${dn(c, target)}. Their last message was "${txt.length > 50 ? txt.slice(0, 49) + '…' : txt}". Want me to block that text so AutoMod catches it next time?`, mood: 'thinking', actions: [{ label: 'Block this text', primary: true, fn: () => addBlocked(c, txt) }] });
  }
}
function actionBurst(c) {
  const now = Date.now(), aw = yl('actsM') * 60000; c.acts.push(now); c.acts = c.acts.filter((t) => now - t < aw);
  if (c.acts.length >= yl('actsN') && isMod(c) && !(c.raid && now - c.raid.at < 5 * 60000)) offer(c, 'shield', ylCool(), { text: `You've taken ${c.acts.length} actions in ${fmtDurLong(yl('actsM') * 60)} in ${c.name}. Is this a raid? Shield Mode or followers-only can slow it down.`, mood: 'surprised', actions: [{ label: 'Shield Mode on', primary: true, fn: () => setShield(c, true) }, { label: 'Followers-only 10m', fn: () => setMode(c, { follower_mode: true, follower_mode_duration: 10 }) }] });
}
function watch(c, m) {
  if (m.own || !isMod(c)) return; const now = Date.now(), norm = m.text.toLowerCase().replace(/\s+/g, ' ').trim(); if (!norm) return;
  // The last 20 seconds, kept in arrival order and grouped by text, so a busy chat costs the same per message however many lines are in the window
  const R = c.rw || (c.rw = { q: [], by: new Map() }), e = { t: now, u: m.uid, n: norm };
  R.q.push(e); if (!R.by.has(norm)) R.by.set(norm, []); R.by.get(norm).push(e);
  const win = yl('spamS') * 1000; while (R.q.length && now - R.q[0].t >= win) { const o = R.q.shift(), l = R.by.get(o.n); if (l) { l.shift(); if (!l.length) R.by.delete(o.n); } }
  const same = R.by.get(norm) || [], users = new Set(same.map((x) => x.u));
  const auto = ylSize() === 'auto', spamN = auto ? Math.max(yl('spamN'), Math.ceil(R.q.length * 0.2)) : yl('spamN'); // automatic: a wave must also be a fifth of what's being said
  if (same.length >= spamN) offer(c, 'spam', ylCool(), { text: `The same message was posted ${same.length} times in ${fmtDurLong(yl('spamS'))} in ${c.name}${users.size > 1 ? ', by ' + users.size + ' people' : ''}. Want to slow chat down?`, mood: 'surprised', actions: [{ label: 'Slow mode 10s', primary: true, fn: () => setMode(c, { slow_mode: true, slow_mode_wait_time: 10 }) }, { label: 'Emote-only', fn: () => setMode(c, { emote_mode: true }) }, { label: 'Subs-only', fn: () => setMode(c, { subscriber_mode: true }) }] });
  else if (same.filter((x) => x.u === m.uid).length >= yl('repeatN')) offer(c, 'rep-' + m.login, ylCool(), { text: `${m.name} has sent the same message ${same.filter((x) => x.u === m.uid).length} times in ${c.name}.`, mood: 'thinking', actions: [{ label: 'Timeout 10m', primary: true, fn: () => ban(c, m.uid, m.login, 600, 'Repeated spam') }] });
  if (m.first) { const fw = yl('firstsS') * 1000, fN = ylSize() === 'auto' ? Math.max(yl('firstsN'), Math.ceil(R.q.length * (fw / win) * 0.08)) : yl('firstsN'); c.firstT.push(now); c.firstT = c.firstT.filter((t) => now - t < fw); if (c.firstT.length >= fN && !(c.raid && now - c.raid.at < 5 * 60000)) offer(c, 'raid', ylCool(), /* a raid that Twitch announced already has its own bar with the same buttons */ { text: `Lots of first-time chatters just arrived in ${c.name}. Could be a raid.`, mood: 'surprised', actions: [{ label: 'Followers-only 10m', primary: true, fn: () => setMode(c, { follower_mode: true, follower_mode_duration: 10 }) }, { label: 'Shield Mode on', fn: () => setShield(c, true) }] }); }
}

/* ---------- Live status, stream title/game and "games played" ---------- */
async function pollLive() {
  if (!S.token || !S.me) return; const now = new Map();
  const add = (r) => ((r.json && r.json.data) || []).forEach((x) => now.set(x.user_login, { name: x.user_name, game: x.game_name, gameId: x.game_id, title: x.title, viewers: x.viewer_count, started: x.started_at }));
  if (S.settings.liveFollowed) { const r = await helix('streams/followed', { query: { user_id: S.me.id, first: '100' } }); if (ok(r)) add(r); }
  const tabs = [...new Set([S.me.login, ...S.chats.keys()])].slice(0, 100);
  if (tabs.length) { const r = await helix('streams', { query: tabs.map((l) => 'user_login=' + l).join('&') + '&first=100' }); if (ok(r)) add(r); }
  if (S.liveBase) { const fresh = []; now.forEach((v, l) => { if (!S.live.has(l) && l !== S.me.login) fresh.push([l, v]); }); fresh.length > 1 ? onLiveMany(fresh) : fresh.forEach(([l, v]) => onLive(l, v)); }
  S.live = now; S.liveBase = true; dashSample(now.get(S.me.login)).catch((e) => dbg('dash ' + e));
  S.chats.forEach((c) => { const v = now.get(c.login); if (!v) { c.lastGame = null; return; } if (v.game && v.game !== c.lastGame) { if (c.lastGame) logAct(c, 'mode', `${c.name} changed category to ${v.game}`); c.games.push({ ts: Date.now(), game: v.game }); c.lastGame = v.game; } });
  renderTabs(); renderStats();
}
function onLive(login, v) {
  if (!S.chats.has(login) && !S.settings.liveFollowed) return;
  lvLog({ login, name: v.name, game: v.game, title: v.title }); // always kept in the Live section (not Yappy's)
  if (!S.settings.liveNotify) return;
  flashMe(`${v.name} is live`); play('live', login); liveFloat(`${v.name} is live`, login);
  if (S.settings.liveDesktop && !S.settings.streamer && 'Notification' in window) { try { const n = new Notification(`${v.name} is live`, { body: v.title || v.game || '', tag: 'yappy-live' }); n.onclick = () => addChannel(login); } catch (e) {} }
}
// Several at once (most often after the computer wakes up): one note, one sound and one desktop notification, not a pile
function onLiveMany(list) {
  list = list.filter(([l]) => S.chats.has(l) || S.settings.liveFollowed); if (!list.length) return; if (list.length === 1) return onLive(...list[0]);
  list.forEach(([login, v]) => lvLog({ login, name: v.name, game: v.game, title: v.title }));
  if (!S.settings.liveNotify) return;
  const text = list.length === 2 ? `${list[0][1].name} and ${list[1][1].name} are live` : `${list.slice(0, 2).map(([, v]) => v.name).join(', ')} and ${list.length - 2} more are live`;
  flashMe(text); play('live', list[0][0]); liveFloat(text, '');
  if (S.settings.liveDesktop && !S.settings.streamer && 'Notification' in window) { try { const n = new Notification(text, { body: list.map(([, v]) => v.name).join(', '), tag: 'yappy-live' }); n.onclick = () => openLivePop(); } catch (e) {} }
}
// After sleep: notes and Yappy messages that queued up while the computer was off are folded away, so you don't come back to a stack of them
try { cg.onWake && cg.onWake(() => { S.wokeAt = Date.now(); try { Yappy.flush(); } catch (e) {} document.querySelectorAll('#toasts .toast').forEach((t, i, all) => { if (i < all.length - 1) t.remove(); }); }); } catch (e) {}

// On login: tell the user how many of their channels are live right now
function announceLive() {
  if (!S.chats.size) return; const live = [...S.chats.keys()].filter((l) => S.live.has(l)), n = live.length, tot = S.chats.size;
  const names = live.slice(0, 3).map((l) => S.live.get(l).name || l).join(', ') + (n > 3 ? ` and ${n - 3} more` : '');
  const text = n ? `${n} of your ${tot} channel${tot === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} live right now: ${names}.` : `None of your ${tot} channel${tot === 1 ? ' is' : 's are'} live right now.`;
  lvLog({ summary: true, text, login: n === 1 ? live[0] : '', name: n === 1 ? (S.live.get(live[0]).name || live[0]) : '' });
  notifyYappy(text, n ? [{ label: n === 1 ? 'Open chat' : 'Open first', primary: true, fn: () => setActive(live[0]) }] : [], 'live', live.slice(0, 3).map((l) => ({ login: l, name: S.live.get(l).name || l })), true);
}

// Yappy speaks once the notes in the corner have gone (at most 8 seconds later), so a "Banned … / Undo" note and his suggestion never pile up together
function afterToasts(fn) { const t0 = Date.now(); const wait = () => { const busy = [...document.querySelectorAll('#toasts .toast')].some((x) => !x.classList.contains('out') && !x.classList.contains('rl')); if (busy && Date.now() - t0 < 8000) return setTimeout(wait, 400); fn(); }; wait(); }
// Settings > Yappy: the "How busy your chats are" choice and the number boxes
document.addEventListener('change', (e) => {
  const t = e.target; if (!t || !t.closest) return;
  if (t.matches('select[data-ysize]')) { const z = t.value; if (z === 'custom') saveSettings({ yappySize: 'custom', yappyLimits: { ...ylBase(), ...(S.settings.yappyLimits || {}) } }); else saveSettings({ yappySize: z }); ylPaint(t.closest('.spane, .modal') || document); return; }
  if (t.matches('input.ynum[data-yl]')) {
    const k = t.dataset.yl, v = Math.max(1, Math.min(YL_MAX[k], Math.round(+t.value) || YL_DEF[k])); t.value = v;
    saveSettings({ yappySize: 'custom', yappyLimits: { ...ylBase(), [k]: v } }); const box = t.closest('.spane, .modal') || document, sel = box.querySelector('select[data-ysize]'); if (sel) sel.value = 'custom'; ylPaint(box);
  }
});
function ylPaint(box) { box.querySelectorAll('input.ynum[data-yl]').forEach((i) => { if (document.activeElement !== i) i.value = yl(i.dataset.yl); }); box.querySelectorAll('.yauto').forEach((x) => x.classList.toggle('hidden', ylSize() !== 'auto')); }
