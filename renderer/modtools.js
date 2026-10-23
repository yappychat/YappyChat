'use strict';
/* Moderator helpers: picking several messages at once, folding copy-paste spam into one line,
   new-account badges, showing who already acted on someone, and the chat around a message. */

/* ---------- Shift+click messages to pick several, then act on them together ---------- */
function bulkClick(c, e) {
  const msg = e.target.closest('.msg'); if (!msg || e.target.closest('button,a,.name,.lk,.xn')) return false;
  if (!msg.dataset.id || msg.dataset.uid === (S.me && S.me.id)) return false;
  if (!modKnown(c) || !isMod(c)) { toast('Picking several messages works in channels you moderate.', { ms: 2500 }); return true; }
  e.preventDefault(); try { window.getSelection().removeAllRanges(); } catch (x) {}
  c.bsel = c.bsel || new Set();
  if (c.bsel.has(msg)) { c.bsel.delete(msg); msg.classList.remove('bsel'); } else { c.bsel.add(msg); msg.classList.add('bsel'); }
  bulkBar(c); return true;
}
function bulkClear(c) { if (!c || !c.bsel) return; c.bsel.forEach((n) => n.classList.remove('bsel')); c.bsel.clear(); bulkBar(c); }
function bulkBar(c) {
  [...(c.bsel || [])].forEach((n) => { if (!n.isConnected || n.classList.contains('gone')) { c.bsel.delete(n); n.classList.remove('bsel'); } });
  const n = (c.bsel || new Set()).size;
  if (!n) { if (c.bbar) { c.bbar.remove(); c.bbar = null; } return; }
  const users = new Set([...c.bsel].map((x) => x.dataset.user)).size;
  if (!c.bbar) {
    c.bbar = el('div', 'bulkbar'); c.list.after(c.bbar);
    c.bbar.onclick = (e) => { const b = e.target.closest('button[data-b]'); if (b) bulkAct(c, b.dataset.b); };
  }
  c.bbar.innerHTML = `<b>${n} message${n === 1 ? '' : 's'}</b><span class="faint">from ${users} ${users === 1 ? 'person' : 'people'}</span><span class="grow"></span>` +
    `<button class="btn sm" data-b="del">${ico('trash', 14)} Delete</button><button class="btn sm" data-b="purge">${ico('eraser', 14)} Purge</button>` +
    `<button class="btn sm" data-b="to">${ico('clock', 14)} Time out ${fmtDur(S.settings.timeoutDefault || 600)}</button><button class="btn sm danger" data-b="ban">${ico('ban', 14)} Ban</button>` +
    `<button class="ibtn" data-b="x" data-tip="Clear the selection (Esc)" aria-label="Clear the selection">${ico('x', 15)}</button>`;
}
// Acts on picked messages (or on everyone behind a folded spam line). One request at a time, so Twitch's rate limits are respected.
async function actOnMany(c, msgs, a) {
  const people = new Map(); msgs.forEach((m) => { if (m.uid && !people.has(m.uid)) people.set(m.uid, m); });
  if (a === 'ban' && !confirm(`Ban ${people.size} ${people.size === 1 ? 'person' : 'people'} in ${c.name}?`)) return false;
  if (a === 'del') { for (const m of msgs) if (m.id) await del(c, m.id, m.text, m.login); toast(`Deleted ${msgs.length} message${msgs.length === 1 ? '' : 's'}`, { ms: 2200 }); return true; }
  const dur = a === 'purge' ? 1 : a === 'to' ? (S.settings.timeoutDefault || 600) : 0;
  const done = []; for (const m of people.values()) { if (await ban(c, m.uid, m.login, dur, a === 'purge' ? 'Purge' : '', m.text, true)) done.push(m); }
  if (done.length) toast(`${a === 'ban' ? 'Banned' : a === 'purge' ? 'Purged' : 'Timed out'} ${done.length} ${done.length === 1 ? 'person' : 'people'}`, { ms: 9000, action: a === 'purge' ? undefined : { label: 'Undo all', fn: async () => { let n = 0; for (const m of done) if (await unban(c, m.uid, m.login, true)) n++; toast(`Lifted ${n} ${a === 'ban' ? 'ban' : 'timeout'}${n === 1 ? '' : 's'}`, { ms: 2500 }); } } });
  return true;
}
async function bulkAct(c, a) {
  if (a === 'x') return bulkClear(c);
  const msgs = [...c.bsel].map((n) => ({ id: n.dataset.id, uid: n.dataset.uid, login: n.dataset.user, text: msgText(n) }));
  if (await actOnMany(c, msgs, a)) bulkClear(c);
}
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const c = cur(); if (c && c.bsel && c.bsel.size) { bulkClear(c); e.stopPropagation(); } }, true);

/* ---------- Copy-paste spam: the same text again within 20 seconds adds "×2, ×3…" to the first line instead of a new line ---------- */
const FOLD_MS = 20000;
const spamKey = (t) => String(t || '').replace(/[͏​-‍⁠﻿]|\u{E0000}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
function spamFold(c, m, special) {
  if (S.settings.foldSpam === false || special || m.own || m.first || m.paid || m.reply || m.foreign) return false;
  const k = spamKey(m.text); if (!k) return false;
  const now = Date.now(), live = (n) => n.isConnected || (c.heldNodes || []).includes(n);
  c.foldR = (c.foldR || []).filter((r) => now - r.ts < FOLD_MS && live(r.node) && !r.node.classList.contains('gone'));
  const r = c.foldR.find((x) => x.k === k); if (!r) return false;
  r.ts = now; r.dups.push({ id: m.id, uid: m.uid, login: m.login, name: m.name, text: m.text });
  const people = new Set(r.dups.map((d) => d.login)).size, n = r.dups.length;
  let x = r.node.querySelector('.xn'); if (!x) { x = el('button', 'xn'); r.node.querySelector('.line').append(x); }
  x.textContent = '×' + n; x.dataset.tip = `Sent ${n} times by ${people} ${people === 1 ? 'person' : 'people'} in the last few seconds. Click to see who, or act on all of them`;
  x.classList.remove('bump'); void x.offsetWidth; x.classList.add('bump');
  logLine(c, `${m.name}: ${m.text}`); try { watch(c, m); } catch (e) {} // Yappy still counts the copies for his spam suggestions
  return true;
}
function spamNote(c, m, node) {
  if (S.settings.foldSpam === false || m.own || m.foreign) return; const k = spamKey(m.text); if (!k) return;
  const r = { k, ts: Date.now(), node, dups: [{ id: m.id, uid: m.uid, login: m.login, name: m.name, text: m.text }] }; node._dups = r.dups;
  c.foldR = c.foldR || []; c.foldR.push(r); if (c.foldR.length > 8) c.foldR.shift();
}
function openFold(c, node, anchor) {
  const d = node._dups || [], names = [...new Map(d.map((x) => [x.login, x.name || x.login])).values()], mod = modKnown(c) && isMod(c);
  const n = el('div', 'stack foldpop', `<h3>${d.length} copies</h3><div class="sd">From ${names.length} ${names.length === 1 ? 'person' : 'people'}: ${names.slice(0, 30).map((x) => `<b class="lk" data-u="${esc(x.toLowerCase())}">${esc(x)}</b>`).join(', ')}${names.length > 30 ? ` and ${names.length - 30} more` : ''}</div>` +
    (mod ? `<div class="btnrow"><button class="btn sm" data-f="del">${ico('trash', 14)} Delete all ${d.length}</button><button class="btn sm" data-f="purge">${ico('eraser', 14)} Purge all</button><button class="btn sm" data-f="to">${ico('clock', 14)} Time out all</button><button class="btn sm danger" data-f="ban">${ico('ban', 14)} Ban all</button></div>` : ''));
  popover(n, anchor);
  n.onclick = async (e) => {
    const u = e.target.closest('.lk'); if (u) { closePop(); return openCard(c, u.dataset.u, anchor); }
    const b = e.target.closest('[data-f]'); if (!b) return; closePop();
    if (await actOnMany(c, d, b.dataset.f) && b.dataset.f === 'del') markGone(node, 'deleted');
  };
}

/* ---------- New-account badge: accounts younger than a week get a badge beside their messages ---------- */
const NEW_ACCT_DAYS = 7, acctQ = new Set(); let acctT = 0;
S.acct = new Map(); // user id -> account creation time (ms), 0 when unknown
function acctBadge(c, m, node) {
  if (!m.uid || m.own || m.foreign || S.settings.newAcctBadge === false || !modKnown(c) || !isMod(c)) return;
  const v = S.acct.get(m.uid);
  if (v === undefined) { acctQ.add(m.uid); S.acct.set(m.uid, -1); if (!acctT) acctT = setTimeout(acctFetch, 1500); return; }
  if (v > 0) addAcctTag(node, v);
}
function addAcctTag(node, created) {
  const days = (Date.now() - created) / 864e5; if (days >= NEW_ACCT_DAYS || node.querySelector('.tag.newacct')) return;
  const d = Math.floor(days), label = d < 1 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago';
  const line = node.querySelector('.line'); if (line) line.prepend(el('span', 'tag newacct', `New account`)); const t = node.querySelector('.tag.newacct'); if (t) t.dataset.tip = 'Account created ' + label;
}
async function acctFetch() {
  acctT = 0; const ids = [...acctQ].slice(0, 100); ids.forEach((i) => acctQ.delete(i)); if (!ids.length) return;
  const r = await helix('users', { query: ids.map((i) => 'id=' + encodeURIComponent(i)).join('&') });
  const got = new Set();
  if (ok(r) && r.json && r.json.data) r.json.data.forEach((u) => { const t = Date.parse(u.created_at) || 0; S.acct.set(u.id, t); got.add(u.id); if (t && Date.now() - t < NEW_ACCT_DAYS * 864e5) S.chats.forEach((c) => c.list.querySelectorAll(`.msg[data-uid="${u.id}"]`).forEach((n) => addAcctTag(n, t))); });
  ids.forEach((i) => { if (!got.has(i)) S.acct.set(i, 0); });
  if (S.acct.size > 20000) S.acct = new Map([...S.acct].slice(-10000));
  if (acctQ.size) acctT = setTimeout(acctFetch, 1500);
}

/* ---------- Someone else already acted: their name goes on the line, and the mod buttons fade ---------- */
function actedBy(c, kind, ev) {
  const by = ev.moderator_user_name || ev.moderator_user_login || ''; if (!by || (ev.moderator_user_login || '').toLowerCase() === (S.me && S.me.login)) return;
  const tgt = String(((ev[kind] || {}).user_login) || '').toLowerCase();
  if (kind === 'delete') { const id = (ev.delete || {}).message_id, n = id && c.msgs.get(id); if (n) byTag(n, 'deleted', by); return; }
  if (!tgt) return;
  (c.actBy = c.actBy || new Map()).set(tgt, { by, kind, ts: Date.now() });
  const nodes = [...c.list.querySelectorAll(`.msg[data-user="${tgt.replace(/\W/g, '')}"]`)];
  if (kind === 'warn') { nodes.forEach((n) => { n.classList.add('acted'); n.dataset.actedBy = `Warned by ${by}`; }); const last = nodes[nodes.length - 1]; if (last && !last.querySelector('.tag.byt')) last.querySelector('.line').prepend(el('span', 'tag byt', esc('warned by ' + by))); return; }
  nodes.forEach((n) => byTag(n, null, by));
}
function byTag(n, label, by) {
  n.classList.add('acted'); n.dataset.actedBy = by;
  const t = n.querySelector('.line>.tag.red, .line>.tag'); if (t && !/ by /.test(t.textContent) && (n.classList.contains('gone') || label)) t.textContent += ' by ' + by;
  else if (label && !n.classList.contains('gone')) markGone(n, label + ' by ' + by);
}
// Used when the chat's own "timed out / banned" line arrives: adds who did it, if Twitch told us already
function byWho(c, login) { const x = c.actBy && c.actBy.get(String(login).toLowerCase()); return x && Date.now() - x.ts < 15000 ? ' by ' + x.by : ''; }
document.addEventListener('pointerover', (e) => { const b = e.target.closest && e.target.closest('.msg.acted .mi'); if (b && !b.dataset.tipOrig) { b.dataset.tipOrig = b.dataset.tip; const m = b.closest('.msg'); b.dataset.tip = (m.dataset.actedBy && !/^Warned/.test(m.dataset.actedBy) ? 'Already handled by ' + m.dataset.actedBy : m.dataset.actedBy || 'Already handled') + '. ' + b.dataset.tipOrig; } }, true);

/* ---------- The chat around a message: 5 lines before and after ---------- */
function showContext(c, q, anchor) {
  if (!c) return toast('That channel is not open any more.', { ms: 2500 });
  const all = [...c.list.querySelectorAll('.msg')]; let t = q.id ? c.msgs.get(q.id) : null;
  if (!t && q.login) { const mine = all.filter((n) => n.dataset.user === q.login.toLowerCase()); t = q.ts ? mine.reduce((best, n) => (!best || Math.abs((+n.dataset.ts || 0) - q.ts) < Math.abs((+best.dataset.ts || 0) - q.ts) ? n : best), null) : mine[mine.length - 1]; }
  if (!t && q.ts) t = all.reduce((best, n) => (!best || Math.abs((+n.dataset.ts || 0) - q.ts) < Math.abs((+best.dataset.ts || 0) - q.ts) ? n : best), null);
  if (!t || !t.isConnected) return toast('That part of the chat is no longer in the window.', { ms: 2500 });
  const i = all.indexOf(t), part = all.slice(Math.max(0, i - 5), i + 6);
  const n = el('div', 'stack ctxpop', `<h3>${ico('list', 16)} Around this message in ${esc(c.name)}</h3><div class="ctxlist"></div><div class="btnrow"><button class="btn sm" data-x="jump">Show it in the chat</button></div>`);
  const box = $('.ctxlist', n);
  part.forEach((m) => { const k = m.cloneNode(true); k.querySelectorAll('.tools,.mod,.xn').forEach((x) => x.remove()); k.removeAttribute('data-tl'); k.classList.remove('bsel', 'kbsel'); if (m === t) k.classList.add('ctxme'); box.append(k); });
  popover(n, anchor);
  n.onclick = (e) => { if (e.target.closest('[data-x=jump]')) { closePop(); if (c.login !== S.active) setActive(c.login); setTimeout(() => { c.stick = false; t.scrollIntoView({ block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }, 60); } };
  setTimeout(() => { const me = $('.ctxme', box); if (me) me.scrollIntoView({ block: 'center' }); }, 0);
}
const ctxBtn = (x) => `<button class="ibtn sm ctxb" data-a="ctx" data-c="${esc(x.c || '')}" data-u="${esc(x.login || x.target || '')}" data-id="${esc(x.id || '')}" data-ts="${x.ts || 0}" data-tip="See the chat around it" aria-label="See the chat around it">${ico('list', 13)}</button>`;
