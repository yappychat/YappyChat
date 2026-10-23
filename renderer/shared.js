'use strict';
/* ---------- Shared chat and streaming together ----------
   Twitch merges several channels' chats into one shared chat session (Stream Together starts one). Each message carries the channel it came
   from (source-room-id) and the API / EventSub list the participants. We show that channel's picture beside each message and
   "Streamer, streaming together with A, B" in the channel bar. Guest Star guests are added where the login allows it. */
S.rooms = new Map(); // channel id -> { id, login, name, avatar, badges: Map }
const roomPending = new Set();
const roomOf = (id) => S.rooms.get(String(id)) || null;
function ownRoom(c) { if (!S.rooms.has(c.id)) S.rooms.set(c.id, { id: c.id, login: c.login, name: c.name, avatar: c.avatar, badges: c.badges }); return S.rooms.get(c.id); }
async function loadRooms(ids) {
  ids = [...new Set(ids.map(String))].filter((i) => i && !S.rooms.has(i) && !roomPending.has(i)); if (!ids.length) return;
  ids.forEach((i) => roomPending.add(i));
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100), r = await helix('users', { query: chunk.map((x) => 'id=' + encodeURIComponent(x)).join('&') });
    ((r.json && r.json.data) || []).forEach((u) => { S.rooms.set(u.id, { id: u.id, login: u.login, name: u.display_name, avatar: u.profile_image_url, badges: new Map() }); });
    chunk.forEach((x) => roomPending.delete(x));
  }
  ids.forEach(paintRoom);
  // This room's own badges (subscriber and bits badges differ per channel)
  for (const id of ids) { const room = S.rooms.get(id); if (!room) continue; helix('chat/badges', { query: { broadcaster_id: id } }).then((b) => addBadges(room.badges, b.json)).catch(() => {}); }
}
// Fill in the picture and name of every shared-chat avatar already on screen for this channel
function paintRoom(id) {
  const r = roomOf(id); if (!r) return;
  document.querySelectorAll(`img.srcav[data-room="${id}"]`).forEach((i) => { if (r.avatar && i.getAttribute('src') !== r.avatar) i.src = r.avatar; i.dataset.tip = r.name + ' (shared chat)'; i.classList.remove('empty'); });
}
const sharedIds = (c) => (c.shared ? c.shared.ids.filter((i) => i !== c.id) : []);
function roomAv(c, id) {
  id = String(id); const room = id === c.id ? ownRoom(c) : roomOf(id), col = id === c.id ? chanColor(c.login) : chanColor(room ? room.login : '');
  if (!room) loadRooms([id]);
  return `<img class="srcav${room && room.avatar ? '' : ' empty'}" data-room="${esc(id)}" ${room && room.avatar ? `src="${esc(room.avatar)}"` : ''} data-tip="${esc(room ? room.name + (id === c.id ? '' : ' (shared chat)') : 'Shared chat')}" alt=""${col ? ` style="border-color:${col}"` : ''}>`;
}
function setShared(c, ids) {
  const had = c.shared ? c.shared.ids.join() : ''; c.shared = ids && ids.length > 1 ? { ids: [...new Set(ids.map(String))] } : null;
  if ((c.shared ? c.shared.ids.join() : '') === had) return;
  if (c.shared) loadRooms(c.shared.ids).then(() => withChanged(c)); else withChanged(c);
}
async function loadShared(c) {
  if (!c || !c.id) return; const r = await helix('shared_chat/session', { query: { broadcaster_id: c.id } });
  if (r.status === 200 && r.json && r.json.data && r.json.data[0]) setShared(c, [r.json.data[0].host_broadcaster_id, ...(r.json.data[0].participants || []).map((p) => p.broadcaster_id)]); else if (r.status === 404 || r.status === 200) setShared(c, null);
}
function onSharedEvent(type, ev) {
  const c = S.chats.get((ev.broadcaster_user_login || '').toLowerCase()); if (!c) return;
  if (type === 'channel.shared_chat.end') return setShared(c, null);
  setShared(c, [ev.host_broadcaster_user_id, ...(ev.participants || []).map((p) => p.broadcaster_user_id)].filter(Boolean));
}
// Guest Star guests (when your login allows it); shared chat participants are added in withHtml
function togetherOf(c) { return (c.guests || []).map((g) => ({ login: g.login, name: g.name })); }
async function pollGuests(c) {
  if (!c || !c.id || !S.scopes || !S.scopes.includes('moderator:read:guest_star') || (c.gsOff && Date.now() - c.gsOff < 10 * 60000)) return;
  const r = await helix('guest_star/session', { query: { broadcaster_id: c.id, moderator_id: S.me.id } });
  if (r.status === 200 && r.json && r.json.data && r.json.data[0]) { const g = (r.json.data[0].guests || []).filter((x) => x.user_login && x.user_login.toLowerCase() !== c.login).map((x) => ({ login: x.user_login.toLowerCase(), name: x.user_display_name || x.user_login })); c.gsOff = 0; if (JSON.stringify(g) !== JSON.stringify(c.guests || [])) { c.guests = g; withChanged(c); } }
  else if (r.status === 200) { if ((c.guests || []).length) { c.guests = []; withChanged(c); } }
  else c.gsOff = Date.now(); // not allowed or not available for this channel: try again much later
}
const listWords = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const swl = (p) => `<a href="#" class="swl" data-login="${esc(p.login)}" data-tip="${S.chats.has(p.login) ? 'Open ' + esc(p.name) + '\'s chat' : 'Click to add ' + esc(p.name) + ' to your channels'}">${esc(p.name)}</a>`;
// ", streaming together with A and B" (names are clickable). Twitch starts a shared chat session for Stream Together, so that is what we read.
function withHtml(c) {
  const out = new Map(); sharedIds(c).map(roomOf).filter(Boolean).forEach((r) => out.set(r.login, r)); togetherOf(c).forEach((g) => out.has(g.login) || out.set(g.login, g));
  return out.size ? `<span class="with">, streaming together with ${listWords([...out.values()].map(swl))}</span>` : '';
}
function withChanged(c) { if (c.login === S.active) renderStats(); const pn = c.view && c.view.querySelector('.pn'); if (pn) renderTabs(); document.querySelectorAll(`#chats .chat[data-login="${c.login}"] .srcav`).forEach((i) => i.dataset.room && paintRoom(i.dataset.room)); }
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('.swl'); if (!a) return; e.preventDefault(); e.stopPropagation();
  const l = a.dataset.login; if (S.chats.has(l)) { setActive(l); return; }
  addChannel(l).then((r) => { if (r && r.error) err(r.error); else { setActive(l); toast(`Added ${l} to your channels`, { ms: 2500 }); } });
}, true);
// Check the open chats now and then (shared chat is also pushed to us by EventSub; Guest Star has to be asked for)
setInterval(() => { if (!S.me || document.hidden) return; S.chats.forEach((c) => { if (c.shown) pollGuests(c).catch(() => {}); }); }, 120000);
