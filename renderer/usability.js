'use strict';
/* Small things that make chat easier to follow: a "new since you left" line, a jump-to-mention pill,
   text size shortcuts, a quick look at a chatter, friendlier errors, settings backup and highlight suggestions. */

/* ---------- "New since you left": a line where you stopped reading, when you come back to a tab ---------- */
function markLeft(c) { if (!c || !c.list) return; c.leftAt = Date.now(); c.nlPending = true; }
// Called when you come back to a tab, and again once a refreshed chat has loaded its recent messages
function showNewLine(c) {
  if (!c || !c.list || !c.leftAt || !c.nlPending) return;
  if (c.nlNode) { c.nlNode.remove(); c.nlNode = null; }
  if (Date.now() - c.leftAt < 3000) { c.nlPending = false; return; }
  const all = [...c.list.querySelectorAll('.msg[data-ts]')], i = all.findIndex((n) => +n.dataset.ts > c.leftAt);
  if (i < 0) return; // nothing new yet (a refreshed chat may still be loading)
  c.nlPending = false; if (i === 0) return; // everything on screen is new: no line needed
  const line = el('div', 'newline', `<span>${all.length - i} new since you left</span>`); all[i].before(line); c.nlNode = line;
}

/* ---------- Mention pill: someone @'s you while you are scrolled up or the chat is paused ---------- */
function mentionPill(c, node, name) {
  if (c.stick && !c.hover && c.login === S.active) return; // you are at the bottom and will see it
  let p = c.mpill; if (!p) { p = c.mpill = el('button', 'mpill'); p.type = 'button'; c.list.after(p); }
  c.mpQ = (c.mpQ || []).filter((x) => x.isConnected || (c.heldNodes || []).includes(x)); c.mpQ.push(node);
  p.innerHTML = `${ico('down', 14)} ${c.mpQ.length > 1 ? c.mpQ.length + ' mentions' : 'Mention from ' + esc(name)}`;
  p.onclick = () => {
    const t = c.mpQ.shift(); if (!c.mpQ.length) { p.remove(); c.mpill = null; } else p.innerHTML = `${ico('down', 14)} ${c.mpQ.length > 1 ? c.mpQ.length + ' mentions' : '1 mention'}`;
    if (t && !t.isConnected) flushHeld(c);
    if (t && t.isConnected) { c.stick = false; t.scrollIntoView({ block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
  };
}
// The pill goes away once you are back at the bottom
function mentionPillCheck(c) { if (c && c.mpill && c.stick) { c.mpill.remove(); c.mpill = null; c.mpQ = []; } }

/* ---------- Text size: Ctrl + / Ctrl - / Ctrl 0 ---------- */
function textSize(step) {
  const v = step === 0 ? 14 : Math.max(10, Math.min(26, (+S.settings.fontSize || 14) + step));
  saveSettings({ fontSize: v }); applyTheme(); toast(`Text size ${v}px${v === 14 ? ' (default)' : ''}`, { ms: 1200 });
  S.chats.forEach((c) => { if (c.stick) c.list.scrollTop = c.list.scrollHeight; });
}

/* ---------- Quick look: rest the pointer on a name for half a second ---------- */
const peekCache = new Map(); let peekT = 0, peekEl = null, peekFor = null;
function peekHide() { clearTimeout(peekT); peekFor = null; if (peekEl) { peekEl.remove(); peekEl = null; } }
async function peekShow(c, login, anchor) {
  login = login.toLowerCase(); peekFor = anchor;
  const u = c.users.get(login), evs = (typeof userEvents === 'function' ? userEvents(login) : []).filter((x) => !x.c || x.c === c.login), cnt = (k) => evs.filter((x) => x.kind === k).length;
  let info = peekCache.get(c.login + ':' + login);
  if (!info || Date.now() - info.at > 600000) {
    info = { at: Date.now() };
    try { const r = await helix('users', { query: { login } }), d = r.json && r.json.data && r.json.data[0]; if (d) { info.created = d.created_at; info.id = d.id; info.avatar = d.profile_image_url; info.name = d.display_name; } } catch (e) {}
    if (info.id && modKnown(c) && isMod(c)) { try { const f = await helix('channels/followers', { query: { broadcaster_id: c.id, user_id: info.id } }); if (ok(f) && f.json) info.follow = f.json.data && f.json.data[0] ? f.json.data[0].followed_at : ''; } catch (e) {} }
    peekCache.set(c.login + ':' + login, info); if (peekCache.size > 300) peekCache.delete(peekCache.keys().next().value);
  }
  if (peekFor !== anchor || !anchor.isConnected) return;
  const days = info.created ? (Date.now() - Date.parse(info.created)) / 864e5 : null, nm = info.name || (u && u.name) || login;
  const rows = [
    info.created ? `<div><span>Account</span><b${days < 7 ? ' class="warnc"' : ''}>${ago(info.created)} old</b></div>` : '',
    info.follow !== undefined ? `<div><span>Following</span><b>${info.follow ? ago(info.follow) : 'no'}</b></div>` : '',
    `<div><span>Messages</span><b>${u ? u.msgs.length : 0} this session</b></div>`,
    evs.length ? `<div><span>Here before</span><b>${[cnt('timeout') && cnt('timeout') + ' timeout' + (cnt('timeout') > 1 ? 's' : ''), cnt('ban') && cnt('ban') + ' ban' + (cnt('ban') > 1 ? 's' : ''), cnt('warn') && cnt('warn') + ' warning' + (cnt('warn') > 1 ? 's' : ''), cnt('delete') && cnt('delete') + ' deleted'].filter(Boolean).join(', ') || 'no actions'}</b></div>` : ''
  ].join('');
  if (peekEl) peekEl.remove();
  peekEl = el('div', 'peek', `<div class="pk-h">${info.avatar ? `<img src="${esc(info.avatar)}" alt="">` : ''}<b>${esc(nm)}</b></div>${rows}<div class="faint">Click the name for the full card</div>`);
  document.body.append(peekEl);
  const r = anchor.getBoundingClientRect(), w = peekEl.offsetWidth, h = peekEl.offsetHeight;
  peekEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  peekEl.style.top = (r.bottom + 6 + h > innerHeight - 8 ? r.top - h - 6 : r.bottom + 6) + 'px';
}
document.addEventListener('pointerover', (e) => {
  if (S.settings.namePeek === false) return; const n = e.target.closest && e.target.closest('.chat .msg .name'); if (!n) return;
  if (S.pop || $('#modals').firstChild) return; const m = n.closest('.msg'), ch = n.closest('.chat'), c = ch && S.chats.get(ch.dataset.login); if (!c || !m.dataset.user) return;
  clearTimeout(peekT); peekT = setTimeout(() => peekShow(c, m.dataset.user, n), 550);
}, true);
document.addEventListener('pointerout', (e) => { const n = e.target.closest && e.target.closest('.chat .msg .name'); if (n) peekHide(); }, true);
document.addEventListener('pointerdown', peekHide, true);

/* ---------- When Twitch says no: what went wrong, and a button to fix it when there is one ---------- */
function modFail(c, r, verb, retry) {
  const what = /messages$/.test(verb) ? verb : verb + ' people', msg = String((r.json && r.json.message) || ''), base = apiErr(r);
  let text = base, action;
  if (r.status === 401 || /scope|missing.*permission|oauth token/i.test(msg)) { text = `YappyChat needs Twitch's permission to ${what}.`; action = { label: 'Allow', fn: () => regrant(what, null).then((okk) => okk && retry && retry()) }; }
  else if (r.status === 403 || /not a moderator|must be a moderator|moderator.*required/i.test(msg)) text = `You're not a moderator in ${c.name}, so Twitch won't let you ${what} there.`;
  else if (/already banned/i.test(msg)) { text = `They're already banned in ${c.name}.`; }
  else if (/(may not|cannot|can't) be (banned|timed out|warned)|is (a|the) (moderator|broadcaster)|broadcaster/i.test(msg)) text = `Twitch won't let you ${verb} a moderator or the streamer. The streamer can remove their mod first with /unmod.`;
  else if (/not (found|exist)|message.*(deleted|older)/i.test(msg) && /delete/.test(verb)) text = 'That message is already gone, or is too old to delete (Twitch keeps them for 6 hours).';
  else if (/vip/i.test(msg)) text = `Twitch won't let you ${verb} a VIP. Remove their VIP first with /unvip.`;
  if (!action && retry && (r.status === 429 || r.status === 0 || r.status >= 500)) action = { label: 'Try again', fn: () => setTimeout(retry, r.status === 429 ? 3000 : 300) };
  toast(text, { type: 'err', ms: 9000, action });
}

/* ---------- Highlight suggestions: your name's parts, and the words people use to call a mod ---------- */
function hlSuggestions() {
  const have = new Set((S.settings.hl || []).map((h) => String(h.w || '').toLowerCase())), out = [];
  const me = (S.me && S.me.login) || '', parts = me.split(/[_\d]+/).filter((p) => p.length >= 3 && p !== me);
  parts.forEach((p) => out.push([p, 'Part of your name']));
  if (S.me && S.me.name && S.me.name.toLowerCase() !== me) out.push([S.me.name, 'Your display name']);
  if (!S.settings.notMod) { out.push(['mods', 'When someone calls the mods']); out.push(['@mods', 'When someone tags the mods']); out.push(['mod*', 'Any word starting with mod']); }
  return out.filter(([w], i, a) => !have.has(w.toLowerCase()) && a.findIndex((x) => x[0].toLowerCase() === w.toLowerCase()) === i);
}
function addHl(w) { const hl = [...(S.settings.hl || []).filter((h) => h.w), { w, color: '#5b8cff', re: false, snd: true }]; saveSettings({ hl }); compileHl(); }
function askHlSuggest(then) {
  const l = hlSuggestions(); if (!l.length) return then && then();
  const n = el('div', 'stack hlsug', `<h3>${ico('star', 18)} Get told when chat says…</h3><div class="sd">Your name is highlighted already. Tick any of these to highlight them too. You can change them in Settings &gt; Highlights.</div><div class="hlsug-l">${l.map(([w, d], i) => `<label class="row chk"><input type="checkbox" data-w="${esc(w)}" ${i < 3 ? 'checked' : ''}><span><b>${esc(w)}</b> <span class="faint">${esc(d)}</span></span></label>`).join('')}</div><div class="btnrow"><button class="btn" id="hs-skip">Skip</button><button class="btn primary" id="hs-ok">Highlight these</button></div>`);
  modal(n);
  $('#hs-skip', n).onclick = () => { closeModal(); then && setTimeout(then, 250); };
  $('#hs-ok', n).onclick = () => { n.querySelectorAll('input:checked').forEach((i) => addHl(i.dataset.w)); closeModal(); then && setTimeout(then, 250); };
}

/* ---------- Back up and restore settings (to a file you choose) ---------- */
async function backupSettings() { try { const r = await cg.exportSettings(); if (r && r.error) return err(r.error); if (r && r.ok) toast('Settings saved to ' + r.name, { ms: 3500 }); } catch (e) { err('Could not save the backup.'); } }
async function restoreSettings() {
  if (!confirm('Load settings from a backup file? Your current settings are replaced, then YappyChat reloads. Your login and app lock are kept.')) return;
  try { const r = await cg.importSettings(); if (!r) return; if (r.error) return err(r.error); toast('Settings loaded. Reloading…', { ms: 1500 }); setTimeout(() => location.reload(), 800); } catch (e) { err('Could not load that file.'); }
}

/* ---------- Text size for one chat (split view): smaller, normal, larger ---------- */
const CHAT_SIZES = [[0.85, 'Smaller'], [1, 'Normal'], [1.15, 'Larger']];
function applyChatSize(c) { if (!c || !c.view) return; const f = ((S.settings.chanStyle || {})[c.login] || {}).fs; if (f && f !== 1) c.view.style.setProperty('--cfs', f); else c.view.style.removeProperty('--cfs'); }
