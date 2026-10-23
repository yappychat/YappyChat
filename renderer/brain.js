'use strict';
/* ---------- Yappy: mascot and suggestions ---------- */
const STOP = new Set('the and you that this with have just like what your for are but not was they from will can all get out has had who how why now our one his her she him its too out did does let got via yes yep nope lol lmao lmfao omg wtf haha kappa pog'.split(' '));
// Tips Yappy gives when you click him. Each can have a "Show me" button (a = what it opens). They point at things people tend to miss.
const TIPS = [
  { t: 'Press Ctrl+K to jump to any channel. You can also type a few letters of a name.' },
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
  Yappy.init({
    onHide: () => { saveSettings({ yappyShow: false }); toast('Yappy is hidden. His notices still appear as pop-ups (change this in Settings > Yappy).'); },
    onDismiss: (s) => { if (s.coolKey) S.yCool[s.coolKey] = Date.now() + 15 * 60000; if (s._log) s._log.result = 'Dismissed'; },
    onSay: () => play('yappy'),
    onMove: (p) => saveSettings({ yappyPos: p }),
    onClick: () => { if (Yappy.busy()) Yappy.close(); setTimeout(yappyTip, Yappy.busy() ? 700 : 0); } // clicking Yappy gives a tip; the Activity button opens what he has been up to
  });
  applyYappy();
}
function applyYappy() { Yappy.animate = S.settings.yappyAnimate !== false && palette() !== 'minimal'; document.body.classList.toggle('pane-in', !!S.settings.paneInput); Yappy.place(S.settings.yappyPos); if (S.me) Yappy.setVisible(!!S.settings.yappyShow); }
// Every suggestion is recorded in the Activity sidebar (with a time), even if Yappy is hidden or you were away
// Kinds of Yappy notice that can be switched on and off in Settings > Yappy
const YAPPY_KINDS = [['live', 'Who is live when you log in', 'A count of your live channels when you log in'], ['whisper', 'Whispers', 'When someone whispers you'], ['raid', 'Raids', 'When a raid arrives in any of your chats'], ['banlist', 'Ban list matches', 'When someone on your ban list speaks'], ['spam', 'Spam suggestions', 'Repeated messages and copy-paste waves'], ['shield', 'Raid-protection suggestions', 'Many actions at once, or a surge of first-time chatters'], ['words', 'Word-filter suggestions', 'When you keep deleting the same word'], ['away', 'While you were away', 'A short summary when you come back after a while'], ['mods', 'Suggestions from your moderating', 'When the same person keeps getting moderated, or after a ban'], ['tips', 'Tips', 'The little tip when you click Yappy']];
const kindOn = (k) => !k || (S.settings.yappyKinds || {})[k] !== false;
function offer(c, type, cool, s) {
  if (!S.settings.yappySuggest || !kindOn(type.startsWith('mod-') ? 'mods' : type.startsWith('word-') ? 'words' : type === 'spam' || type.startsWith('rep-') ? 'spam' : 'shield')) return;
  const k = type + ':' + c.login, now = Date.now(); if ((S.yCool[k] || 0) > now) return; S.yCool[k] = now + cool;
  const entry = { ts: now, text: s.text, c: c.login, result: '' }; S.ylog.unshift(entry); S.ylog.length = Math.min(S.ylog.length, 200); bump('yappy');
  const actions = (s.actions || []).map((a) => ({ ...a, fn: () => { entry.result = 'You chose: ' + a.label; if (sideShows('yappy')) renderSide(); a.fn(); } }));
  if (S.settings.streamer) return;
  if (S.settings.yappyShow) Yappy.say({ ...s, actions, coolKey: k, _log: entry });
  else if (S.settings.yappyNotify) { const a = actions.find((x) => x.primary) || actions[0]; play('yappy'); toast(s.text, { ms: 12000, private: true, action: a ? { label: a.label, fn: a.fn } : undefined }); }
}
// A plain Yappy notice (not a pattern suggestion): shown by Yappy and kept in the Activity log
// Yappy shows notices himself. If he is hidden, notices still appear as a small pop-up unless "Yappy notices" is switched off.
// Everything that notifies you is also kept in the Yappy tab, so nothing is lost if you miss it
function yLog(text, c, chans) { const now = Date.now(), top = S.ylog[0]; if (top && top.text === text && now - top.ts < 4000) return; S.ylog.unshift({ ts: now, text, c: c || '', chans: chans || null, result: '' }); S.ylog.length = Math.min(S.ylog.length, 200); bump('yappy'); if (sideShows('yappy')) renderSide(); }
function notifyYappy(text, actions, kind, chans, noLog) {
  if (!kindOn(kind)) return; if (!noLog) yLog(text, '', chans);
  if (S.settings.streamer || !S.settings.yappyNotify) return; // off by default: the notice waits in the Yappy section of the activity rail
  if (S.settings.yappyShow) return Yappy.say({ text, mood: 'excited', actions: actions || [] });
  const a = (actions || []).find((x) => x.primary) || (actions || [])[0]; play('yappy');
  toast(text, { ms: 9000, private: true, action: a ? { label: a.label, fn: a.fn } : undefined });
}
function learn(c, text) {
  if (!text || !isMod(c)) return; const seen = new Set();
  (text.toLowerCase().match(/[a-z0-9']{3,}/g) || []).forEach((w) => {
    if (STOP.has(w) || seen.has(w)) return; seen.add(w); const n = (c.delWords.get(w) || 0) + 1; c.delWords.set(w, n);
    if (n === 3 || n === 8) {
      const acts = [{ label: 'Add to blocked terms', primary: true, fn: () => addBlocked(c, w) }];
      if (!(S.settings.hl || []).some((x) => x.w.toLowerCase() === w)) acts.push({ label: 'Highlight it', fn: () => { addHighlight(w); toast(`"${w}" will now be highlighted`); } });
      offer(c, 'word-' + w, 6e5, { text: `You've removed ${n} messages containing "${w}" in #${c.login}. Want me to catch it automatically?`, mood: 'surprised', actions: acts });
    }
  });
}
async function addBlocked(c, w) {
  const r = await helix('moderation/blocked_terms', { method: 'POST', query: mq(c), body: { text: w } });
  if (ok(r)) toast(`Added "${w}" to #${c.login}'s blocked terms`); else err(apiErr(r));
}
// Suggestions that come from what you have just done as a moderator
function modSuggest(chan, kind, target, by) {
  const c = S.chats.get(chan); if (!c || !target || !isMod(c) || !S.me) return;
  if (by && String(by).toLowerCase() !== S.me.login) return; // only your own actions
  const t = String(target).toLowerCase(), now = Date.now(); c.modHist = c.modHist || new Map();
  if (/^(timeout|delete|warn)$/.test(kind)) {
    const l = (c.modHist.get(t) || []).filter((x) => now - x < 30 * 60000); l.push(now); c.modHist.set(t, l);
    if (l.length >= 3) offer(c, 'mod-repeat-' + t, 30 * 60000, { text: `${target} has been moderated ${l.length} times in half an hour in #${c.login}. A longer timeout or a ban may be the better answer.`, mood: 'thinking', actions: [{ label: 'Ban', primary: true, fn: async () => { const id = await idOf(t); if (id) ban(c, id, t, 0, 'Repeated rule-breaking'); } }, { label: 'Timeout 1 day', fn: async () => { const id = await idOf(t); if (id) ban(c, id, t, 86400, 'Repeated rule-breaking'); } }] });
  }
  if (kind === 'ban') {
    const u = c.users.get(t), last = u && u.msgs && u.msgs[u.msgs.length - 1], txt = last && String(last.text || '').trim();
    if (txt && txt.length >= 6 && txt.length <= 80 && !/^!/.test(txt)) offer(c, 'mod-ban-' + t, 10 * 60000, { text: `You banned ${target}. Their last message was "${txt.length > 50 ? txt.slice(0, 49) + '…' : txt}". Want me to block that text so AutoMod catches it next time?`, mood: 'thinking', actions: [{ label: 'Block this text', primary: true, fn: () => addBlocked(c, txt) }] });
  }
}
function actionBurst(c) {
  const now = Date.now(); c.acts.push(now); c.acts = c.acts.filter((t) => now - t < 120000);
  if (c.acts.length >= 8 && isMod(c)) offer(c, 'shield', 6e5, { text: `You've taken ${c.acts.length} actions in 2 minutes in #${c.login}. Is this a raid? Shield Mode or followers-only can slow it down.`, mood: 'surprised', actions: [{ label: 'Shield Mode on', primary: true, fn: () => setShield(c, true) }, { label: 'Followers-only 10m', fn: () => setMode(c, { follower_mode: true, follower_mode_duration: 10 }) }] });
}
function watch(c, m) {
  if (m.own || !isMod(c)) return; const now = Date.now(), norm = m.text.toLowerCase().replace(/\s+/g, ' ').trim(); if (!norm) return;
  c.recent.push({ t: now, u: m.uid, n: norm }); c.recent = c.recent.filter((x) => now - x.t < 20000);
  const same = c.recent.filter((x) => x.n === norm), users = new Set(same.map((x) => x.u));
  if (users.size >= 4 && same.length >= 5) offer(c, 'spam', 3e5, { text: `${users.size} people posted the same message in 20 seconds in #${c.login}. Want to slow chat down?`, mood: 'surprised', actions: [{ label: 'Slow mode 10s', primary: true, fn: () => setMode(c, { slow_mode: true, slow_mode_wait_time: 10 }) }, { label: 'Emote-only', fn: () => setMode(c, { emote_mode: true }) }, { label: 'Subs-only', fn: () => setMode(c, { subscriber_mode: true }) }] });
  else if (same.filter((x) => x.u === m.uid).length >= 4) offer(c, 'rep-' + m.login, 3e5, { text: `${m.name} has sent the same message ${same.filter((x) => x.u === m.uid).length} times in #${c.login}.`, mood: 'thinking', actions: [{ label: 'Timeout 10m', primary: true, fn: () => ban(c, m.uid, m.login, 600, 'Repeated spam') }] });
  if (m.first) { c.firstT.push(now); c.firstT = c.firstT.filter((t) => now - t < 30000); if (c.firstT.length >= 6) offer(c, 'raid', 6e5, { text: `Lots of first-time chatters just arrived in #${c.login}. Could be a raid.`, mood: 'surprised', actions: [{ label: 'Followers-only 10m', primary: true, fn: () => setMode(c, { follower_mode: true, follower_mode_duration: 10 }) }, { label: 'Shield Mode on', fn: () => setShield(c, true) }] }); }
}

/* ---------- Live status, stream title/game and "games played" ---------- */
async function pollLive() {
  if (!S.token || !S.me) return; const now = new Map();
  const add = (r) => ((r.json && r.json.data) || []).forEach((x) => now.set(x.user_login, { name: x.user_name, game: x.game_name, gameId: x.game_id, title: x.title, viewers: x.viewer_count, started: x.started_at }));
  if (S.settings.liveFollowed) { const r = await helix('streams/followed', { query: { user_id: S.me.id, first: '100' } }); if (ok(r)) add(r); }
  const tabs = [...new Set([S.me.login, ...S.chats.keys()])].slice(0, 100);
  if (tabs.length) { const r = await helix('streams', { query: tabs.map((l) => 'user_login=' + l).join('&') + '&first=100' }); if (ok(r)) add(r); }
  if (S.liveBase) now.forEach((v, l) => { if (!S.live.has(l) && l !== S.me.login) onLive(l, v); });
  S.live = now; S.liveBase = true; dashSample(now.get(S.me.login)).catch((e) => dbg('dash ' + e));
  S.chats.forEach((c) => { const v = now.get(c.login); if (!v) { c.lastGame = null; return; } if (v.game && v.game !== c.lastGame) { if (c.lastGame) logAct(c, 'mode', `${c.name} changed category to ${v.game}`); c.games.push({ ts: Date.now(), game: v.game }); c.lastGame = v.game; } });
  renderTabs(); renderStats();
}
function onLive(login, v) {
  if (!S.chats.has(login) && !S.settings.liveFollowed) return;
  lvLog({ login, name: v.name, game: v.game, title: v.title }); // always kept in the Live section (not Yappy's)
  if (!S.settings.liveNotify) return;
  flashMe(`${v.name} is live`); play('live', login); toast(`${v.name} is live${v.game ? ' · ' + v.game : ''}`, { ms: 12000, action: { label: S.chats.has(login) ? 'Open' : 'Add tab', fn: () => addChannel(login) } });
  if (S.settings.liveDesktop && !S.settings.streamer && 'Notification' in window) { try { const n = new Notification(`${v.name} is live`, { body: v.title || v.game || '' }); n.onclick = () => addChannel(login); } catch (e) {} }
}

// On login: tell the user how many of their channels are live right now
function announceLive() {
  if (!S.chats.size) return; const live = [...S.chats.keys()].filter((l) => S.live.has(l)), n = live.length, tot = S.chats.size;
  const names = live.slice(0, 3).map((l) => S.live.get(l).name || l).join(', ') + (n > 3 ? ` and ${n - 3} more` : '');
  const text = n ? `${n} of your ${tot} channel${tot === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} live right now: ${names}.` : `None of your ${tot} channel${tot === 1 ? ' is' : 's are'} live right now.`;
  lvLog({ summary: true, text, login: n === 1 ? live[0] : '', name: n === 1 ? (S.live.get(live[0]).name || live[0]) : '' });
  notifyYappy(text, n ? [{ label: n === 1 ? 'Open chat' : 'Open first', primary: true, fn: () => setActive(live[0]) }] : [], 'live', live.slice(0, 3).map((l) => ({ login: l, name: S.live.get(l).name || l })), true);
}
