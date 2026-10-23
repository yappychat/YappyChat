'use strict';
/* ---------- 0.14.1 extras: pins, ad schedule, blocked users, channels you moderate, name colour, shoutout info, chat settings in the Users panel ---------- */

// --- Pin / unpin (Twitch's own pin, through the API) ---
async function pinNow(c, id, dur) {
  const body = { message_id: id }; if (dur) body.duration = dur;
  const r = await helix('chat/pins', { method: 'POST', query: mq(c), body }); if (!ok(r)) return toolErr(r, c, 'pin a message', false);
  toast('Message pinned', { ms: 2500 }); logAct(c, 'mode', 'You pinned a message'); setTimeout(() => pollPins(c), 800);
}
// /pin your message: sends it as you, then pins it (optionally /pin 5m your message; 30s to 30m, otherwise until the stream ends)
async function sendAndPin(c, text, dur) {
  askScope('user:write:chat', async () => {
    const r = await helix('chat/messages', { method: 'POST', body: { broadcaster_id: c.id, sender_id: S.me.id, message: text.slice(0, 500) } });
    const d = r.json && r.json.data && r.json.data[0]; if (!ok(r) || !d || d.is_sent === false) return err((d && d.drop_reason && d.drop_reason.message) || apiErr(r) || 'Twitch did not send the message.');
    pinNow(c, d.message_id, dur);
  });
}
function pinMessage(c, id) {
  if (!id) return err('That message has no id to pin yet.');
  askChoice('Pin this message', 'It shows at the top of the chat for everyone.', [[0, 'Until the stream ends'], [30, '30 seconds'], [300, '5 minutes'], [1800, '30 minutes']], 'Pin', (v) => {
    const body = { message_id: id }; if (+v) body.duration = +v;
    pinNow(c, id, +v);
  });
}
async function unpinMessage(c, id) {
  const r = await helix('chat/pins', { method: 'DELETE', query: mq(c, id ? { message_id: id } : {}) });
  if (!ok(r)) return toolErr(r, c, 'unpin the message', false);
  c.pins = (c.pins || []).filter((x) => x.kind !== 'mod'); markPinned(c, null); renderPins(c); toast('Message unpinned', { ms: 2500 }); logAct(c, 'mode', 'You unpinned the pinned message');
}

// --- Ad schedule and snooze (channel owner) ---
function adScheduleWin(c) {
  askScope('channel:read:ads', async () => {
    const r = await helix('channels/ads', { query: { broadcaster_id: c.id } }); if (!ok(r)) return toolErr(r, c, 'read the ad schedule', true);
    const d = (r.json.data || [])[0] || {}, at = (s) => (s && +s ? new Date(+s * 1000 > 1e12 ? +s : (isNaN(+s) ? Date.parse(s) : +s * 1000)) : null);
    const t = (x) => { const v = x ? (isNaN(+x) ? new Date(x) : new Date(+x * 1000)) : null; return v && !isNaN(v) && +v > 0 ? v.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'; };
    const n = el('div', 'stack', `<h3>${ico('tv', 18)} Ad schedule · ${esc(c.name)}</h3><div class="sd">${d.next_ad_at && +d.next_ad_at ? 'Twitch plans the next ad around <b>' + t(d.next_ad_at) + '</b> for ' + (d.duration || '?') + ' seconds.' : 'No ad is planned right now (the channel may be offline).'} Snoozes left: <b>${d.snooze_count != null ? d.snooze_count : '?'}</b>${d.snooze_refresh_at && +d.snooze_refresh_at ? ' (refills at ' + t(d.snooze_refresh_at) + ')' : ''}. Last ad: ${t(d.last_ad_at)}.</div><div class="row"><button class="btn" id="ad-x">Close</button><button class="btn primary" id="ad-sn" ${d.snooze_count > 0 ? '' : 'disabled'}>Snooze the next ad (5 minutes)</button></div>`);
    modal(n); $('#ad-x', n).onclick = closeModal;
    $('#ad-sn', n).onclick = () => askScope('channel:manage:ads', async () => { const x = await helix('channels/ads/schedule/snooze', { method: 'POST', query: { broadcaster_id: c.id } }); if (!ok(x)) return toolErr(x, c, 'snooze the ad', true); closeModal(); const y = (x.json.data || [])[0] || {}; toast(`Next ad moved to ${t(y.next_ad_at)}. ${y.snooze_count != null ? y.snooze_count + ' snoozes left.' : ''}`, { ms: 5000 }); });
  });
}

// --- Blocked users manager ---
function blockedWin() {
  askScope('user:read:blocked_users', async () => {
    const n = el('div', 'stack', `<h3>${ico('ban', 18)} Blocked users</h3><div class="sd">People you blocked on Twitch. They cannot whisper you. Whispers you receive show in the Whispers tab while YappyChat is open.</div><div class="cmdlist" id="bl-l"><div class="none">Loading…</div></div><div class="row"><button class="btn primary" id="bl-x">Done</button></div>`); modal(n); $('#bl-x', n).onclick = closeModal;
    const load = async () => {
      const r = await pagedGet('users/blocks', { broadcaster_id: S.me.id }); const l = $('#bl-l', n); if (!l) return; if (!ok(r.r)) { l.innerHTML = `<div class="none">${esc(apiErr(r.r))}</div>`; return; }
      l.innerHTML = r.data.map((u) => `<div class="cmdrow" data-id="${esc(u.user_id)}"><code>${esc(u.display_name || u.user_login)}</code><span class="grow"></span><button class="btn sm" data-un="${esc(u.user_id)}">Unblock</button></div>`).join('') || '<div class="none">You have not blocked anyone.</div>';
    };
    n.onclick = async (e) => { const b = e.target.closest('[data-un]'); if (!b) return; askScope('user:manage:blocked_users', async () => { const x = await helix('users/blocks', { method: 'DELETE', query: { target_user_id: b.dataset.un } }); ok(x) ? (b.closest('.cmdrow').remove(), toast('Unblocked', { ms: 1800 })) : err(apiErr(x)); }); };
    load();
  });
}

// --- Channels you moderate, inside the Add channels dialog ---
async function moderatedChannels(listEl, input) {
  askScope('user:read:moderated_channels', async () => {
    listEl.innerHTML = '<div class="faint">Loading…</div>'; const r = await pagedGet('moderation/channels', { user_id: S.me.id }, 5);
    if (!ok(r.r)) { listEl.innerHTML = `<div class="faint">${esc(apiErr(r.r))}</div>`; return; }
    const open = new Set([...S.chats.keys()]), rest = r.data.filter((u) => !open.has(u.broadcaster_login));
    listEl.innerHTML = rest.length ? `<div class="faint">Click to add. You moderate ${r.data.length} channels${r.data.length > rest.length ? ' (' + (r.data.length - rest.length) + ' already open)' : ''}.</div><div class="modchans">${rest.map((u) => `<button class="btn sm" data-l="${esc(u.broadcaster_login)}">${esc(u.broadcaster_name || u.broadcaster_login)}</button>`).join('')}</div>` : '<div class="faint">Every channel you moderate is already open.</div>';
    listEl.onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b) return; const v = input.value.trim(); input.value = v ? v.replace(/[,\s]+$/, '') + ', ' + b.dataset.l : b.dataset.l; b.disabled = true; input.focus(); };
  });
}

// --- Name colour ---
const TW_COLORS = [['blue', '#0000ff'], ['blue_violet', '#8a2be2'], ['cadet_blue', '#5f9ea0'], ['chocolate', '#d2691e'], ['coral', '#ff7f50'], ['dodger_blue', '#1e90ff'], ['firebrick', '#b22222'], ['golden_rod', '#daa520'], ['green', '#008000'], ['hot_pink', '#ff69b4'], ['orange_red', '#ff4500'], ['red', '#ff0000'], ['sea_green', '#2e8b57'], ['spring_green', '#00ff7f'], ['yellow_green', '#9acd32']];
function colorPicker() {
  askScope('user:manage:chat_color', () => {
    const n = el('div', 'stack', `<h3>Your name colour</h3><div class="sd">Pick one of Twitch's colours. Custom colours (hex) need Twitch Turbo; type one below if you have it.</div><div class="colgrid">${TW_COLORS.map(([k, h]) => `<button class="colsw" data-c="${k}" style="background:${h}" data-tip="${k.replace('_', ' ')}" aria-label="${k.replace('_', ' ')}"></button>`).join('')}</div><input id="col-hex" placeholder="#ff7a00 (Turbo only)" spellcheck="false"><div class="row"><button class="btn" id="col-x">Close</button><button class="btn primary" id="col-hx">Use hex colour</button></div>`);
    modal(n); const set = async (v) => { const r = await helix('chat/color', { method: 'PUT', query: { user_id: S.me.id, color: v } }); ok(r) ? toast('Name colour changed', { ms: 2500 }) : err(apiErr(r)); };
    $('#col-x', n).onclick = closeModal; n.onclick = (e) => { const b = e.target.closest('.colsw'); if (b) set(b.dataset.c); }; $('#col-hx', n).onclick = () => { const v = $('#col-hex', n).value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) set(v); else err('Type a colour like #ff7a00.'); };
  });
}

// --- Shoutout: say what the other streamer is playing ---
async function shoutInfo(login) {
  try { const r = await helix('streams', { query: { user_login: login } }), s = r.json && r.json.data && r.json.data[0]; return s ? ` They are live: ${s.game_name || 'streaming'}, ${s.viewer_count.toLocaleString()} viewers.` : ' They are offline right now.'; } catch (e) { return ''; }
}
async function shoutToast(c, login) { const info = await shoutInfo(login); toast(`Shoutout sent to ${login}.${info}`, { ms: 6000 }); logAct(c, 'mode', `You shouted out ${login}`); }

// --- Chat settings block at the top of the Users panel (moderators and the owner) ---
async function chatSettingsBlock(c, host) {
  if (!(isMod(c) || isOwner(c)) || S.settings.notMod) return;
  const d = el('details', 'uset', `<summary>Chat settings</summary><div class="uset-b"><div class="faint">Loading…</div></div>`); host.prepend(d);
  const body = $('.uset-b', d), opt = (arr, val) => arr.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('');
  d.addEventListener('toggle', async () => {
    if (!d.open || d.dataset.done) return; d.dataset.done = '1'; const r = await helix('chat/settings', { query: mq(c) }); const m = (r.json && r.json.data && r.json.data[0]) || null;
    if (!ok(r) || !m) { body.innerHTML = `<div class="faint">${esc(apiErr(r))}</div>`; return; }
    const fo = m.follower_mode ? m.follower_mode_duration || 0 : 'off';
    body.innerHTML = `<label class="srow"><span>Slow mode</span><select data-s="slow">${opt([[0, 'Off'], [3, '3s'], [5, '5s'], [10, '10s'], [30, '30s'], [60, '1 min'], [120, '2 min']], m.slow_mode ? m.slow_mode_wait_time : 0)}</select></label>` +
      `<label class="srow"><span>Followers-only</span><select data-s="fol">${opt([['off', 'Off'], [0, 'All followers'], [10, '10 minutes'], [30, '30 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week'], [43200, '1 month'], [129600, '3 months']], fo)}</select></label>` +
      [['sub', 'Subscribers-only', m.subscriber_mode], ['emo', 'Emote-only', m.emote_mode], ['uni', 'Unique chat', m.unique_chat_mode]].map(([k, l, v]) => `<label class="srow"><span>${l}</span><label class="sw"><input type="checkbox" data-s="${k}" ${v ? 'checked' : ''}><i></i></label></label>`).join('');
    body.onchange = (e) => { const k = e.target.dataset.s, v = e.target.value; if (k === 'slow') setMode(c, { slow_mode: +v > 0, ...(+v > 0 && { slow_mode_wait_time: +v }) }); else if (k === 'fol') setMode(c, v === 'off' ? { follower_mode: false } : { follower_mode: true, follower_mode_duration: +v }); else if (k === 'sub') setMode(c, { subscriber_mode: e.target.checked }); else if (k === 'emo') setMode(c, { emote_mode: e.target.checked }); else if (k === 'uni') setMode(c, { unique_chat_mode: e.target.checked }); };
  });
}

// --- Who is in chat: roles in Twitch's order, and the live list from Twitch ---
const KNOWN_BOTS = new Set(['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'sery_bot', 'commanderroot', 'soundalerts', 'pretzelrocks', 'lurxx', 'streamlabs_bot', 'botrix', 'coebot', 'ankhbot', 'deepbot', 'vivbot', 'stay_hydrated_bot', 'supibot', 'pokemoncommunitygame']);
const ROLE_ORDER = ['Broadcaster', 'Staff', 'Moderators', 'VIPs', 'Chat Bots', 'Users'];
function roleOfUser(c, login, roles) {
  const b = (c.users.get(login) || {}).badges || [];
  if (login === c.login || b.some((x) => /^broadcaster\//.test(x))) return 'Broadcaster';
  if (b.some((x) => /^(staff|admin|global_mod)\//.test(x))) return 'Staff';
  if ((roles && roles.mods.has(login)) || b.some((x) => /^moderator\//.test(x))) return 'Moderators';
  if ((roles && roles.vips.has(login)) || b.some((x) => /^vip\//.test(x))) return 'VIPs';
  return 'Users';
}
// Twitch's own list of everyone in chat (streamer and moderators only). Cached for 20 seconds. Falls back to who YappyChat has seen.
async function liveChatters(c, force) {
  const now = Date.now(); if (c._chatters && !force && now - c._chatters.at < 20000) return c._chatters;
  const seen = new Map(); c.users.forEach((u, l) => seen.set(l, u.name || l)); (c.present || new Set()).forEach((l) => seen.has(l) || seen.set(l, l));
  const out = { at: now, live: false, why: '', total: 0, map: seen }; c._chatters = out;
  if (!hasScope('moderator:read:chatters')) { out.why = 'scope'; return out; }
  if (!(isOwner(c) || isMod(c))) { out.why = 'notmod'; return out; }
  let after = '', got = new Map();
  for (let i = 0; i < 6; i++) {
    const r = await helix('chat/chatters', { query: mq(c, { first: '1000', ...(after ? { after } : {}) }) });
    if (!ok(r)) { out.why = r.status === 401 || r.status === 403 ? 'denied' : 'error'; return out; }
    ((r.json && r.json.data) || []).forEach((u) => got.set(u.user_login, u.user_name || u.user_login)); out.total = (r.json && r.json.total) || got.size;
    after = r.json && r.json.pagination && r.json.pagination.cursor; if (!after) break;
  }
  got.set(c.login, c.name); seen.forEach((n, l) => { if (!got.has(l) && c.users.get(l) && c.users.get(l).live) got.set(l, n); }); // someone who spoke a moment ago and the list has not caught up yet
  out.live = true; out.map = got; return out;
}
