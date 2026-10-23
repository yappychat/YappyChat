'use strict';
/* ---------- GIFs, pinned messages and drops in chat ----------
   GIFs: Twitch sends a `gifs` tag (start-end|id|url) with the message; the placeholder text is swapped for the picture, with an X to hide it.
   Pinned messages: a paid (Hype Chat) message carries its pin tags; for moderators a message pinned by a moderator is read from Twitch every
   45 seconds. Either shows in a strip at the top of the chat with an X, and the message itself is marked in the list.
   Drops: Twitch's gifted-drops notices are shown as their own line with an X. */
function parseGifs(tag) {
  const out = [], rx = /(\d+)-(\d+)\|([^|,]*)\|(\S+?)(?=,\d+-\d+\||$)/g; let m; const t = unesc(String(tag || ''));
  while ((m = rx.exec(t))) if (/^https:\/\//i.test(m[4])) out.push({ s: +m[1], e: +m[2], id: m[3], url: m[4] });
  return out;
}
function gifHtml(t) {
  return `<span class="gif"><img class="gifimg" src="${esc(t.url)}" alt="${esc(t.alt)}" data-tip="${esc(t.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><button class="gifx" data-a="gifx" data-tip="Hide this GIF" aria-label="Hide this GIF">${ico('x', 11)}</button></span>`;
}

/* ----- pinned ----- */
const PAID_MS = { ONE: 30e3, TWO: 150e3, THREE: 300e3, FOUR: 600e3, FIVE: 900e3, SIX: 1800e3, SEVEN: 3600e3, EIGHT: 7200e3, NINE: 10800e3, TEN: 14400e3 };
const paidMs = (lv) => PAID_MS[String(lv || '').toUpperCase()] || 60e3;
function paidAmount(p) {
  const n = p.amount / Math.pow(10, p.exp || 0);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: p.cur || 'USD' }).format(n); } catch (e) { return n.toFixed(p.exp || 0) + ' ' + (p.cur || ''); }
}
const paidLabel = (p) => 'Pinned · ' + paidAmount(p);
function pinBar(c) {
  if (c.pinbar) return c.pinbar; c.pinbar = el('div', 'pinstrip hidden'); c.view.insertBefore(c.pinbar, c.list);
  c.pinbar.onclick = (e) => {
    const x = e.target.closest('[data-a=pinx]'); const cur0 = visiblePins(c)[0]; if (!cur0) return;
    if (x) { (c.pinGone = c.pinGone || new Set()).add(cur0.key); return renderPins(c); }
    if (e.target.closest('[data-a=unpin]')) return unpinMessage(c, cur0.id);
    if (e.target.closest('[data-a=pinjump]')) { const n = cur0.id && c.msgs.get(cur0.id); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); } else toast('That message has scrolled out of this chat.', { ms: 2500 }); return; }
    c.pinOpen = !c.pinOpen; renderPins(c); // click the strip to read the whole message, click again to fold it
  };
  return c.pinbar;
}
const visiblePins = (c) => { const now = Date.now(), gone = c.pinGone || new Set(); c.pins = (c.pins || []).filter((x) => !x.until || x.until > now); return c.pins.filter((x) => !gone.has(x.key)).sort((a, b) => b.at - a.at); };
function renderPins(c) {
  const bar = pinBar(c), list = S.settings.pins === false ? [] : visiblePins(c), p = list[0];
  bar.classList.toggle('hidden', !p); if (!p) return;
  bar.classList.toggle('paid', p.kind === 'paid'); bar.classList.toggle('open', !!c.pinOpen); bar.setAttribute('aria-expanded', c.pinOpen ? 'true' : 'false'); bar.dataset.tip = c.pinOpen ? 'Click to fold' : 'Click to read the whole message';
  const left = p.until ? Math.max(0, Math.round((p.until - Date.now()) / 60000)) : 0;
  bar.innerHTML = `<span class="pi">${ico('pin', 14)}</span><div class="pt">${p.name ? `<b>${esc(p.name)}</b> ` : ''}${esc(p.text || 'A message is pinned')}</div><span class="pgrow"></span>${p.kind === 'paid' && p.paid ? `<span class="pamt">${esc(paidAmount(p.paid))}</span>` : ''}${list.length > 1 ? `<span class="pmore">+${list.length - 1}</span>` : ''}${p.kind === 'mod' ? `<span class="pmore" data-tip="Pinned by a moderator">${p.by ? 'by ' + esc(p.by) : 'mod pin'}</span>` : ''}${left > 1 ? `<span class="pmore">${left} min</span>` : ''}${c.pinOpen ? `<button class="btn sm" data-a="pinjump">Show in chat</button>` : ''}${c.pinOpen && p.kind === 'mod' && (isMod(c) || isOwner(c)) ? `<button class="btn sm danger" data-a="unpin">Unpin</button>` : ''}<button class="ibtn sm" data-a="pinx" data-tip="Dismiss" aria-label="Dismiss the pinned message">${ico('x', 13)}</button>`;
}
function addPin(c, pin) {
  if (S.settings.pins === false) return; c.pins = c.pins || []; pin.at = Date.now();
  const i = c.pins.findIndex((x) => x.key === pin.key); if (i >= 0) c.pins[i] = { ...c.pins[i], ...pin, at: c.pins[i].at }; else c.pins.push(pin);
  if (c.pins.length > 8) c.pins.shift(); renderPins(c);
}
// Marks the pinned message in the list (and clears the mark from one that is no longer pinned)
function markPinned(c, id) {
  c.list.querySelectorAll('.msg.pinned:not(.paid)').forEach((n) => { if (n.dataset.id !== id) { n.classList.remove('pinned'); const t = n.querySelector('.pintag'); if (t) t.remove(); } });
  const n = id && c.msgs.get(id); if (n && !n.classList.contains('pinned')) { n.classList.add('pinned'); n.querySelector('.line').prepend(el('span', 'tag pintag', 'Pinned')); }
}
// A message pinned by a moderator (Twitch's Get Pinned Chat Message). Needs the moderator permission you already granted; viewers who are not moderators can't ask.
async function pollPins(c) {
  if (!c || c.pinBusy || S.settings.pins === false || !chatLive(c) || !c.shown || !(isMod(c) || isOwner(c)) || (c.pinFail || 0) >= 3) return;
  c.pinBusy = true;
  try {
    const r = await helix('chat/pins', { query: mq(c) });
    if (!ok(r)) { c.pinFail = (c.pinFail || 0) + 1; return; } c.pinFail = 0;
    const d = ((r.json && r.json.data) || [])[0];
    if (!d) { c.pins = (c.pins || []).filter((x) => x.kind !== 'mod'); markPinned(c, null); return renderPins(c); }
    const id = d.message_id || d.id || '', node = id && c.msgs.get(id), mm = d.message && typeof d.message === 'object' ? d.message : {};
    const name = d.user_name || d.sender_user_name || mm.user_name || (node && node.dataset.user) || '', text = (typeof d.message === 'string' ? d.message : mm.text) || d.text || (node ? msgText(node) : '');
    const by = d.pinned_by_user_name || d.moderator_user_name || (d.pinned_by && (d.pinned_by.user_name || d.pinned_by)) || '';
    c.pins = (c.pins || []).filter((x) => x.kind !== 'mod' || x.key === 'mod:' + id);
    addPin(c, { key: 'mod:' + id, id, name, text, kind: 'mod', by: typeof by === 'string' ? by : '', until: d.expires_at ? Date.parse(d.expires_at) || 0 : 0 }); markPinned(c, id);
  } catch (e) { c.pinFail = (c.pinFail || 0) + 1; } finally { c.pinBusy = false; }
}
// Only chats you can see are checked, and nothing is checked while YappyChat is minimised or hidden (a pin is picked up as soon as you look again)
setInterval(() => { if (document.hidden) return; S.chats.forEach((c) => { if (c.shown) pollPins(c); }); }, 45000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) S.chats.forEach((c) => { if (c.shown) pollPins(c); }); });
setInterval(() => S.chats.forEach((c) => { if (c.pins && c.pins.length) renderPins(c); }), 20000); // expired pins fall away

/* ----- drops ----- */
const isDropNotice = (id, sys) => /drop/i.test(String(id || '')) || /\bdrops?\b/i.test(String(sys || ''));
function dropNotice(c, text, id) {
  c.dropSeen = c.dropSeen || new Set(); if (id) { if (c.dropSeen.has(id)) return; c.dropSeen.add(id); if (c.dropSeen.size > 50) c.dropSeen.delete(c.dropSeen.values().next().value); }
  push(c, el('div', 'notice dropn', `<span class="di">${ico('gift', 15)}</span><span class="dt">${esc(text || 'Drops were gifted')}</span><button class="ibtn sm dropx" data-a="dropx" data-tip="Dismiss" aria-label="Dismiss">${ico('x', 12)}</button>`));
}

/* ----- clicks on any of the above ----- */
function onMediaClick(c, e) {
  const gx = e.target.closest('.gifx');
  if (gx) { const g = gx.closest('.gif'), chip = el('span', 'gifoff', `GIF hidden · <a href="#" class="gifshow">show</a>`); g.classList.add('off'); g.after(chip); return true; }
  const gs = e.target.closest('.gifshow'); if (gs) { e.preventDefault(); const chip = gs.closest('.gifoff'); if (chip.previousElementSibling) chip.previousElementSibling.classList.remove('off'); chip.remove(); return true; }
  const dx = e.target.closest('.dropx'); if (dx) { dx.closest('.notice').remove(); return true; }
  return false;
}
