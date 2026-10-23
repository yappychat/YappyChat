'use strict';
/* ---------- Twitch's own slash commands, built in ----------
   Typing / in the message box suggests them. Each one uses the same Twitch API call the buttons use, so a command and a button can never disagree.
   Commands only show for people who can use them (moderator or owner). Ones that need an extra permission ask for it the first time. */
const parseDur = (s) => { // 90 | 90s | 10m | 2h | 1d | 1w | 1h30m  ->  seconds
  s = String(s || '').trim().toLowerCase(); if (!s) return 0; if (/^\d+$/.test(s)) return +s;
  const re = /(\d+)([smhdw])/g, U = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }; let t = 0, m, used = 0;
  while ((m = re.exec(s))) { t += +m[1] * U[m[2]]; used += m[0].length; } return used === s.length ? t : 0;
};
const cmdLogin = (v) => String(v || '').replace(/^@/, '').toLowerCase();
async function cmdTarget(v) { const login = cmdLogin(v); if (!login) return null; const id = await idOf(login); if (!id) { err(`User "${login}" was not found.`); return null; } return { login, id }; }
const modOnly = (c) => isMod(c) || isOwner(c);
function modeCmd(body, said) { return async (c) => { const r = await helix('chat/settings', { method: 'PATCH', query: mq(c), body }); if (!ok(r)) return toolErr(r, c, 'change chat settings', false); logAct(c, 'mode', said); toast(said, { ms: 2500 }); }; }
function announceCmd(color) { return async (c, a, rest) => { const text = rest.join(' ').trim(); if (!text) return err('Add the message: /announce your message'); const r = await helix('chat/announcements', { method: 'POST', query: mq(c), body: { message: text.slice(0, 500), color } }); if (!ok(r)) return toolErr(r, c, 'post an announcement', false); logAct(c, 'mode', 'You posted an announcement: ' + text.slice(0, 80)); }; }
async function cmdWhisper(c, [who, ...rest]) {
  const t = await cmdTarget(who), text = rest.join(' ').trim(); if (!who || !text) return err('Usage: /w username message');
  if (!t) return; if (t.id === S.me.id) return err('You cannot whisper yourself.');
  const r = await helix('whispers', { method: 'POST', query: { from_user_id: S.me.id, to_user_id: t.id }, body: { message: text.slice(0, 500) } });
  if (!ok(r)) return err(`The whisper did not go through: ${apiErr(r)}`);
  S.whispers.has(t.id) || S.whispers.set(t.id, { uid: t.id, login: t.login, name: t.login, msgs: [], last: Date.now() });
  addWhisper(t.id, t.login, S.whispers.get(t.id).name, text, true); openSide('whispers'); // the Whispers panel opens on send, like the Twitch site
}
const COMMANDS = [
  // [name, usage, what it does, who, handler]
  ['user', '/user username', 'Open that person in the Users panel: account details, chat history, notes and actions', 'any', async (c, a) => { if (!a[0]) { openUsers(c); return; } openUsers(c, cmdLogin(a[0])); }],
  ['w', '/w username message', 'Send a whisper (opens the Whispers panel)', 'any', (c, a) => cmdWhisper(c, a)],
  ['whisper', '/whisper username message', 'Same as /w', 'any', (c, a) => cmdWhisper(c, a)],
  ['block', '/block username', 'Block someone (they cannot whisper you)', 'any', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /block username'); askScope('user:manage:blocked_users', async () => { const r = await helix('users/blocks', { method: 'PUT', query: { target_user_id: t.id } }); ok(r) ? toast(`Blocked ${t.login}`, { ms: 2500 }) : err(apiErr(r)); }); }],
  ['unblock', '/unblock username', 'Unblock someone', 'any', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /unblock username'); askScope('user:manage:blocked_users', async () => { const r = await helix('users/blocks', { method: 'DELETE', query: { target_user_id: t.id } }); ok(r) ? toast(`Unblocked ${t.login}`, { ms: 2500 }) : err(apiErr(r)); }); }],
  ['color', '/color name or #hex', 'Change your name colour (hex colours need Twitch Turbo)', 'any', (c, a) => { const v = (a[0] || '').toLowerCase(); if (!v) return err('Usage: /color blue  or  /color #ff7a00'); askScope('user:manage:chat_color', async () => { const r = await helix('chat/color', { method: 'PUT', query: { user_id: S.me.id, color: v } }); ok(r) ? toast('Name colour changed', { ms: 2500 }) : err(apiErr(r)); }); }],
  ['help', '/help', 'Show every command you can use here', 'any', (c) => showCommandHelp(c)],
  ['search', '/search words or @user', 'Search this chat and your saved logs', 'any', (c, a, rest) => slashSearch(c, rest.join(' ').trim())],
  ['poll', '/poll Question | Choice | Choice | seconds', 'Start a poll. Just /poll opens the poll window', 'mod', (c, a, rest) => pollCmd(c, rest.join(' '))],
  ['prediction', '/prediction Question | Outcome | Outcome | seconds', 'Start a prediction. Just /prediction opens the prediction window', 'mod', (c, a, rest) => predCmd(c, rest.join(' '))],
  ['alert', '/alert message', 'Flash a message on the streamer\'s screen (YappyChat only)', 'any', (c, a, rest) => sendAlert(c, rest.join(' ').trim())],
  ['ban', '/ban username [reason]', 'Ban someone', 'mod', async (c, a, rest) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /ban username [reason]'); ban(c, t.id, t.login, 0, rest.slice(1).join(' ')); }],
  ['unban', '/unban username', 'Unban someone (also ends a timeout)', 'mod', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /unban username'); unban(c, t.id, t.login); }],
  ['timeout', '/timeout username [10m] [reason]', 'Time someone out (default 10 minutes; 30s, 10m, 2h, 1d, 1w)', 'mod', async (c, a, rest) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /timeout username [duration] [reason]'); const d = parseDur(a[1]); ban(c, t.id, t.login, Math.min(d > 0 ? d : 600, 1209600), (d > 0 ? rest.slice(2) : rest.slice(1)).join(' ')); }],
  ['untimeout', '/untimeout username', 'End a timeout', 'mod', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /untimeout username'); unban(c, t.id, t.login); }],
  ['warn', '/warn username reason', 'Warn someone (they must accept before chatting again)', 'mod', async (c, a, rest) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /warn username reason'); rest.length > 1 ? warnUser(c, t.id, t.login, rest.slice(1).join(' ')) : err('Add a reason: /warn username reason'); }],
  ['delete', '/delete messageid', 'Delete one message by its id', 'mod', async (c, a) => { if (!a[0]) return err('Usage: /delete messageid (hover a message and use its delete button instead if you do not have the id)'); const r = await helix('moderation/chat', { method: 'DELETE', query: mq(c, { message_id: a[0] }) }); ok(r) ? toast('Message deleted', { ms: 2000 }) : err(apiErr(r)); }],
  ['clear', '/clear', 'Clear the chat for everyone', 'mod', (c) => clearChat(c)],
  ['slow', '/slow [seconds]', 'Slow mode (default 30 seconds)', 'mod', (c, a) => { const d = parseDur(a[0]) || 30; return modeCmd({ slow_mode: true, slow_mode_wait_time: Math.min(120, Math.max(3, d)) }, `Slow mode on (${Math.min(120, Math.max(3, d))} seconds)`)(c); }],
  ['slowoff', '/slowoff', 'Turn slow mode off', 'mod', modeCmd({ slow_mode: false }, 'Slow mode off')],
  ['followers', '/followers [30m]', 'Followers-only chat (optionally for people who followed at least that long)', 'mod', (c, a) => { const m = Math.min(129600, Math.round(parseDur(a[0]) / 60)); return modeCmd({ follower_mode: true, follower_mode_duration: m }, m ? `Followers-only on (${fmtDur(m * 60)})` : 'Followers-only on')(c); }],
  ['followersoff', '/followersoff', 'Turn followers-only off', 'mod', modeCmd({ follower_mode: false }, 'Followers-only off')],
  ['subscribers', '/subscribers', 'Subscribers-only chat', 'mod', modeCmd({ subscriber_mode: true }, 'Subscribers-only on')],
  ['subscribersoff', '/subscribersoff', 'Turn subscribers-only off', 'mod', modeCmd({ subscriber_mode: false }, 'Subscribers-only off')],
  ['emoteonly', '/emoteonly', 'Emote-only chat', 'mod', modeCmd({ emote_mode: true }, 'Emote-only on')],
  ['emoteonlyoff', '/emoteonlyoff', 'Turn emote-only off', 'mod', modeCmd({ emote_mode: false }, 'Emote-only off')],
  ['uniquechat', '/uniquechat', 'Unique chat (no repeated messages)', 'mod', modeCmd({ unique_chat_mode: true }, 'Unique chat on')],
  ['uniquechatoff', '/uniquechatoff', 'Turn unique chat off', 'mod', modeCmd({ unique_chat_mode: false }, 'Unique chat off')],
  ['shield', '/shield', 'Turn Shield Mode on', 'mod', (c) => setShield(c, true)],
  ['shieldoff', '/shieldoff', 'Turn Shield Mode off', 'mod', (c) => setShield(c, false)],
  ['announce', '/announce message', 'Post an announcement', 'mod', announceCmd('primary')],
  ['announceblue', '/announceblue message', 'Announcement in blue', 'mod', announceCmd('blue')],
  ['announcegreen', '/announcegreen message', 'Announcement in green', 'mod', announceCmd('green')],
  ['announceorange', '/announceorange message', 'Announcement in orange', 'mod', announceCmd('orange')],
  ['announcepurple', '/announcepurple message', 'Announcement in purple', 'mod', announceCmd('purple')],
  ['shoutout', '/shoutout username', 'Shout out another streamer', 'mod', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /shoutout username'); askScope('moderator:manage:shoutouts', async () => { const r = await helix('chat/shoutouts', { method: 'POST', query: { from_broadcaster_id: c.id, to_broadcaster_id: t.id, moderator_id: S.me.id } }); if (!ok(r)) return toolErr(r, c, 'send a shoutout', false); shoutToast(c, t.login); }); }],
  ['pin', '/pin your message', 'Send a message and pin it (add a time first for a timed pin: /pin 5m text). On its own, pins the message under your mouse', 'mod', (c, a, rest) => {
    if (a.length && !/^[0-9a-f-]{30,40}$/i.test(a[0])) { const d = /^\d+[smh]?$/i.test(a[0]) && a.length > 1 ? parseDur(a[0]) : 0, text = (d ? a.slice(1) : a).join(' ').trim(); return sendAndPin(c, text, d ? Math.min(1800, Math.max(30, d)) : 0); }
    const id = /^[0-9a-f-]{30,40}$/i.test(a[0] || '') ? a[0] : (S.hoverMsg && S.hoverMsg.isConnected && c.view.contains(S.hoverMsg) && S.hoverMsg.dataset.id) || '';
    if (!id) return err('Type /pin followed by your message to send and pin it, or point at a message and type /pin.');
    pinMessage(c, id);
  }],
  ['unpin', '/unpin', 'Unpin the pinned message', 'mod', (c) => unpinMessage(c)],
  ['ads', '/ads', 'Show your ad schedule and snooze (channel owner)', 'owner', (c) => adScheduleWin(c)],
  ['snooze', '/snooze', 'Snooze the next ad (channel owner)', 'owner', (c) => askScope('channel:manage:ads', async () => { const x = await helix('channels/ads/schedule/snooze', { method: 'POST', query: { broadcaster_id: c.id } }); ok(x) ? toast('Next ad snoozed', { ms: 3000 }) : toolErr(x, c, 'snooze the ad', true); })],
  ['blocked', '/blocked', 'List the people you blocked', 'any', () => blockedWin()],
  ['colorpicker', '/colorpicker', 'Pick your name colour from Twitch\'s colours', 'any', () => colorPicker()],
  ['monitor', '/monitor username', 'Monitor a user: their messages are highlighted for moderators', 'mod', (c, a) => suspicious(c, a[0], 'active_monitoring')],
  ['restrict', '/restrict username', 'Restrict a user: only moderators see their messages', 'mod', (c, a) => suspicious(c, a[0], 'restricted')],
  ['unmonitor', '/unmonitor username', 'Stop monitoring a user', 'mod', (c, a) => suspicious(c, a[0], null)],
  ['unrestrict', '/unrestrict username', 'Stop restricting a user', 'mod', (c, a) => suspicious(c, a[0], null)],
  ['mods', '/mods', 'List this channel\'s moderators', 'mod', async (c) => { const m = await pagedGet('moderation/moderators', { broadcaster_id: c.id }); ok(m.r) ? notice(c, 'Moderators: ' + (m.data.map((u) => u.user_name).join(', ') || 'none'), 'mod') : err(apiErr(m.r)); }],
  ['vips', '/vips', 'List this channel\'s VIPs', 'mod', async (c) => { const m = await pagedGet('channels/vips', { broadcaster_id: c.id }); ok(m.r) ? notice(c, 'VIPs: ' + (m.data.map((u) => u.user_name).join(', ') || 'none'), 'mod') : err(apiErr(m.r)); }],
  ['mod', '/mod username', 'Make someone a moderator (channel owner)', 'owner', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /mod username'); askScope('channel:manage:moderators', async () => { const r = await helix('moderation/moderators', { method: 'POST', query: { broadcaster_id: c.id, user_id: t.id } }); ok(r) ? (toast(`${t.login} is now a moderator`, { ms: 3000 }), logAct(c, 'mode', `You made ${t.login} a moderator`)) : toolErr(r, c, 'add a moderator', true); }); }],
  ['unmod', '/unmod username', 'Remove a moderator (channel owner)', 'owner', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /unmod username'); askScope('channel:manage:moderators', async () => { const r = await helix('moderation/moderators', { method: 'DELETE', query: { broadcaster_id: c.id, user_id: t.id } }); ok(r) ? (toast(`${t.login} is no longer a moderator`, { ms: 3000 }), logAct(c, 'mode', `You removed ${t.login} as a moderator`)) : toolErr(r, c, 'remove a moderator', true); }); }],
  ['vip', '/vip username', 'Make someone a VIP (channel owner)', 'owner', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /vip username'); askScope('channel:manage:vips', async () => { const r = await helix('channels/vips', { method: 'POST', query: { broadcaster_id: c.id, user_id: t.id } }); ok(r) ? (toast(`${t.login} is now a VIP`, { ms: 3000 }), logAct(c, 'mode', `You made ${t.login} a VIP`)) : toolErr(r, c, 'add a VIP', true); }); }],
  ['unvip', '/unvip username', 'Remove a VIP (channel owner)', 'owner', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /unvip username'); askScope('channel:manage:vips', async () => { const r = await helix('channels/vips', { method: 'DELETE', query: { broadcaster_id: c.id, user_id: t.id } }); ok(r) ? (toast(`${t.login} is no longer a VIP`, { ms: 3000 }), logAct(c, 'mode', `You removed ${t.login} as a VIP`)) : toolErr(r, c, 'remove a VIP', true); }); }],
  ['raid', '/raid username', 'Start a raid (channel owner)', 'owner', async (c, a) => { const t = await cmdTarget(a[0]); if (!t) return a[0] ? 0 : err('Usage: /raid username'); askScope('channel:manage:raids', async () => { const r = await helix('raids', { method: 'POST', query: { from_broadcaster_id: c.id, to_broadcaster_id: t.id } }); if (!ok(r)) return toolErr(r, c, 'start a raid', true); toast(`Raid to ${t.login} started. Type /unraid to cancel it.`, { ms: 7000 }); }); }],
  ['unraid', '/unraid', 'Cancel a raid (channel owner)', 'owner', async (c) => askScope('channel:manage:raids', async () => { const r = await helix('raids', { method: 'DELETE', query: { broadcaster_id: c.id } }); ok(r) ? toast('Raid cancelled', { ms: 3000 }) : toolErr(r, c, 'cancel a raid', true); })],
  ['commercial', '/commercial [30|60|90|120|150|180]', 'Run an ad break (the streamer; editors are taken to Stream Manager)', 'any', (c, a) => !isOwner(c) ? viaStreamManager(c) : askScope('channel:edit:commercial', async () => { const len = [30, 60, 90, 120, 150, 180].includes(+a[0]) ? +a[0] : 30; const r = await helix('channels/commercial', { method: 'POST', body: { broadcaster_id: c.id, length: len } }); if (!ok(r)) return toolErr(r, c, 'run an ad', true); const d = (r.json.data || [])[0] || {}; toast(d.message || `Ad started (${len} seconds)`, { ms: 6000 }); })],
  ['marker', '/marker [description]', 'Add a stream marker (channel owner)', 'owner', (c, a, rest) => askScope('channel:manage:broadcast', async () => { const r = await helix('streams/markers', { method: 'POST', body: { user_id: c.id, description: rest.join(' ').slice(0, 140) } }); ok(r) ? toast('Marker added at this point in the stream', { ms: 3000 }) : toolErr(r, c, 'add a marker (the channel needs to be live)', true); })]
];
// /poll and /prediction. Twitch's public API lets only the channel owner create these, so a moderator is taken to Twitch Mod View, where Twitch allows it.
// Ads: Twitch's API only takes them from the streamer. Editors can run one from the channel's Stream Manager on twitch.tv (the Run Ad button), so that opens.
function viaStreamManager(c) { if (!c) return err('Open a channel first.'); toast(`Twitch only lets the streamer start ads through apps. If you are an editor in ${c.name}, use Run Ad in their Stream Manager, which is opening now.`, { ms: 8000 }); openLink(`https://dashboard.twitch.tv/u/${encodeURIComponent(c.login)}/stream-manager`); }
function viaModView(c, what) { toast(`Twitch only lets the channel owner start ${what} through apps. Moderators do it in Mod View, so it opens there.`, { ms: 6000 }); openLink(modViewUrl(c)); }
function pipeParts(s) { return String(s || '').split('|').map((x) => x.trim()).filter(Boolean); }
async function pollCmd(c, text) {
  if (!isOwner(c)) return viaModView(c, 'polls');
  const parts = pipeParts(text); if (!parts.length) return pollWin(c);
  let secs = 60; if (/^\d+$/.test(parts[parts.length - 1])) secs = Math.max(15, Math.min(1800, +parts.pop())); const [title, ...choices] = parts;
  if (!title || choices.length < 2) return err('Usage: /poll Question | Choice | Choice | seconds   (two to five choices; the time is optional)');
  askScope('channel:manage:polls', async () => { const r = await helix('polls', { method: 'POST', body: { broadcaster_id: c.id, title: title.slice(0, 60), choices: choices.slice(0, 5).map((t) => ({ title: t.slice(0, 25) })), duration: secs } }); if (!ok(r)) return toolErr(r, c, 'start a poll', true); toast('Poll started', { ms: 2500 }); });
}
async function predCmd(c, text) {
  if (!isOwner(c)) return viaModView(c, 'predictions');
  const parts = pipeParts(text); if (!parts.length) return predWin(c);
  let secs = 120; if (/^\d+$/.test(parts[parts.length - 1])) secs = Math.max(30, Math.min(1800, +parts.pop())); const [title, ...outs] = parts;
  if (!title || outs.length < 2) return err('Usage: /prediction Question | Outcome | Outcome | seconds   (two to ten outcomes; the time is optional)');
  askScope('channel:manage:predictions', async () => { const r = await helix('predictions', { method: 'POST', body: { broadcaster_id: c.id, title: title.slice(0, 45), outcomes: outs.slice(0, 10).map((t) => ({ title: t.slice(0, 25) })), prediction_window: secs } }); if (!ok(r)) return toolErr(r, c, 'start a prediction', true); toast('Prediction started', { ms: 2500 }); });
}
async function suspicious(c, who, status) {
  const t = await cmdTarget(who); if (!t) return who ? 0 : err('Usage: /monitor username');
  askScope('moderator:manage:suspicious_users', async () => {
    const r = status ? await helix('moderation/suspicious_users', { method: 'POST', query: mq(c), body: { user_id: t.id, status } }) : await helix('moderation/suspicious_users', { method: 'DELETE', query: mq(c, { user_id: t.id }) });
    if (!ok(r)) return toolErr(r, c, 'change that', false); const said = status === 'restricted' ? `Restricted ${t.login}` : status ? `Monitoring ${t.login}` : `${t.login} is no longer monitored or restricted`; toast(said, { ms: 3000 }); logAct(c, 'mode', 'You: ' + said.toLowerCase());
    c.susp = c.susp || new Map(); if (status) c.susp.set(t.login, status); else c.susp.delete(t.login); // the chat badge follows at once; Twitch's own notice follows later
    S.susp.unshift({ c: c.login, uid: t.id, login: t.login, name: t.login, status: status || 'none', update: true, ts: Date.now(), why: [], text: status ? `was ${status === 'restricted' ? 'restricted' : 'put on monitoring'} by you` : 'is no longer monitored or restricted (by you)' }); bump('suspicious');
  });
}
const cmdAllowed = (c, k) => k === 'any' || (k === 'mod' ? !!c && modOnly(c) && !S.settings.notMod : !!c && isOwner(c));
const cmdList = (c) => COMMANDS.filter((x) => cmdAllowed(c, x[3]));
function showCommandHelp(c) {
  const rows = cmdList(c).map(([n, u, d]) => `<div class="cmdrow"><code>${esc(u)}</code><span>${esc(d)}</span></div>`).join('');
  modal(el('div', 'stack cmdhelp', `<h3>${ico('help', 18)} Chat commands</h3><div class="sd">Type / in the message box to see these as you type. Moderator commands only show where you are a moderator.</div><div class="cmdlist">${rows}</div><div class="row"><button class="btn primary" onclick="closeModal()">Done</button></div>`));
}
async function command(c, text) {
  const parts = text.slice(1).trim().split(/\s+/), name = (parts.shift() || '').toLowerCase(), hit = COMMANDS.find((x) => x[0] === name);
  if (!hit) return err(`Unknown command: /${name}. Type /help to see what you can use.`);
  if (!cmdAllowed(c, hit[3])) return err(hit[3] === 'owner' ? `/${name} is only for the channel owner.` : `/${name} is for moderators. You are not a moderator in ${c.name}.`);
  try { await hit[4](c, parts, parts); } catch (e) { err(`/${name} did not work: ${e.message || e}`); }
}
