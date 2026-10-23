'use strict';
/* ---------- 0.9.0 tools: floating Poll / Prediction / User list windows, more moderator tools, title and game editor,
   conversations between two chatters, /search, saving macros and greeting first-timers ---------- */
const hasScope = (sc) => (S.scopes || []).includes(sc);
const modViewUrl = (c) => 'https://www.twitch.tv/moderator/' + c.login;
const isOwner = (c) => !!S.me && c.id === S.me.id;
// Asks Twitch for the extra permission a tool needs (login is never blocked without them)
// Only the one extra permission is added to what you already granted (Twitch asks you to approve the new list once)
async function regrant(why, sc, only) {
  const extra = Array.isArray(sc) ? sc : sc ? [sc] : [];
  const want = only ? requiredScopes() : [...new Set([...loginScopes(), ...extra])]; // only: drop every optional permission
  sc = Array.isArray(sc) ? '' : sc;
  const r = await cg.deviceLogin(want); // opens Twitch in the normal browser
  if (!r.token) { err(r.error || 'Login was cancelled.'); return false; }
  const old = S.token; S.token = r.token;
  if (old && old !== r.token && S.clientId) cg.http({ url: 'https://id.twitch.tv/oauth2/revoke', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(S.clientId)}&token=${encodeURIComponent(old)}` }).catch(() => {}); // the old token (with the old permissions) is switched off
  const v = await validate(); if (v !== true) { err('Twitch did not confirm the new permission. Please try again.'); return false; }
  if (sc && !hasScope(sc)) { err('The permission was not granted on the Twitch page.'); return false; }
  try { restartES(); if (S.ws) S.ws.close(); } catch (e) {} // the old token was revoked: chat and live events reconnect with the new one
  toast(why ? `Permission granted: ${why}` : 'Permissions updated', { ms: 3000 }); return true;
}
function askScope(sc, then) {
  if (hasScope(sc)) return then();
  const n = el('div', 'stack', `<h3>${ico('lock', 18)} One more permission</h3><div class="sd">To ${esc(SCOPE_WHY[sc] || 'do this')}, YappyChat needs Twitch's permission. Press the button and approve it in your browser. It asks for everything at once, so this is the last time.</div><div class="row"><button class="btn" id="sc-x">Not now</button><button class="btn primary" id="sc-go">Grant permission</button></div>`);
  modal(n); $('#sc-x', n).onclick = closeModal; $('#sc-go', n).onclick = async () => { closeModal(); if (await regrant(SCOPE_WHY[sc], sc)) then(); };
}
// Friendly explanation when Twitch refuses: most of these tools belong to the channel owner
function toolErr(r, c, what, ownerOnly) {
  const msg = apiErr(r), denied = r.status === 401 || r.status === 403;
  let text = msg;
  if (denied || /broadcaster|must match|not authorized|permission|moderator/i.test(msg)) text = ownerOnly && !isOwner(c) ? `You can't ${what} in ${c.name}'s channel. Twitch only lets the channel owner do this through apps (the message from Twitch: "${msg}").` : `Twitch says you can't ${what} in ${c.name}'s channel: ${msg}`;
  toast(text, { type: 'err', ms: 9000, action: { label: 'Mod View', fn: () => openLink(modViewUrl(c)) } });
}

/* ===== Tool windows =====
   They float over the chat (drag them anywhere), or snap above the activity panel in the right-hand column (the pin button, or drag one over that column).
   The tool is remembered as snapped. Choosing the same tool again, or its X, closes it. The user list is different: it sits inside its own chat and
   takes half of it (side by side when the chat is wide, otherwise on top with the chat pushed down) so chat stays in view. */
const WINS = new Map();
function cmFit(c) { // wide chat panes split left and right, tall ones top and bottom
  const v = c.view, r = v.getBoundingClientRect(), ph = v.querySelector('.phead'); if (!r.width || !r.height) return;
  const h = r.width > r.height * 1.15; v.classList.toggle('cm-h', h); v.classList.toggle('cm-flip', !!S.settings.cmFlip); v.style.setProperty('--ph', (ph ? ph.offsetHeight : 35) + 'px'); v.style.setProperty('--pcH', (S.settings.paneInput && c.pcomp ? c.pcomp.offsetHeight : 0) + 'px');
  if (!c._cmDrag) v.style.setProperty('--cmf', String(Math.max(0.15, Math.min(0.85, +(h ? S.settings.cmFracH : S.settings.cmFracV) || 0.5))));
}
// Drag the edge of the Community pane to make it bigger or smaller (the size is remembered separately for stacked and side-by-side)
function cmGrip(c, node) {
  const g = el('div', 'cm-grip', ''); g.dataset.tip = 'Drag to resize. Double-click for half and half.'; node.append(g);
  const frac = (e) => { const v = c.view, r = v.getBoundingClientRect(), h = v.classList.contains('cm-h'), fl = v.classList.contains('cm-flip'); return Math.max(0.15, Math.min(0.85, h ? (fl ? (r.right - e.clientX) : (e.clientX - r.left)) / r.width : (fl ? (node.getBoundingClientRect().bottom - e.clientY) : (e.clientY - r.top - node.offsetTop)) / r.height)); };
  g.addEventListener('pointerdown', (e) => { c._cmDrag = true; g.setPointerCapture(e.pointerId); document.body.classList.add('resizing-' + (c.view.classList.contains('cm-h') ? 'x' : 'y')); e.preventDefault(); });
  g.addEventListener('pointermove', (e) => { if (c._cmDrag) c.view.style.setProperty('--cmf', String(frac(e))); });
  const end = (e) => { if (!c._cmDrag) return; c._cmDrag = false; document.body.classList.remove('resizing-x', 'resizing-y'); const f = +c.view.style.getPropertyValue('--cmf') || 0.5; saveSettings(c.view.classList.contains('cm-h') ? { cmFracH: f } : { cmFracV: f }); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('dblclick', () => { saveSettings(c.view.classList.contains('cm-h') ? { cmFracH: 0.5 } : { cmFracV: 0.5 }); cmFit(c); });
}
function closeWin(id) {
  const w = WINS.get(id); if (!w) return; clearInterval(w.timer); if (w.ro) w.ro.disconnect();
  if (w.chat) { w.chat.view.classList.remove('cm-open', 'cm-h', 'cm-flip'); w.chat.view.style.removeProperty('--ph'); w.chat.view.style.removeProperty('--pcH'); }
  w.node.remove(); WINS.delete(id); syncDock();
}
const syncDock = () => { const d = $('#sdock'); if (d) d.classList.toggle('hidden', !d.children.length); };
const dockPref = (id) => !!(S.settings.toolDock || {})[id];
function dockWin(w, on) {
  if (w.chat) return; const dock = $('#sdock');
  if (on) { if (!S.settings.sidebar || S.settings.sideCollapsed) { saveSettings({ sidebar: true, sideCollapsed: false }); renderSide(); } dock.append(w.node); w.node.classList.add('docked'); w.node.style.left = w.node.style.top = w.node.style.right = ''; }
  else { document.body.append(w.node); w.node.classList.remove('docked'); const n = Math.max(0, WINS.size - 1); w.node.style.right = 24 + n * 34 + 'px'; w.node.style.top = 168 + n * 38 + 'px'; w.node.style.left = ''; }
  w.docked = !!on; syncDock(); saveSettings({ toolDock: { ...(S.settings.toolDock || {}), [w.id]: !!on } });
  const b = w.node.querySelector('[data-w=dock]'); if (b) { b.classList.toggle('on', !!on); b.dataset.tip = on ? 'Pop out' : 'Snap above the activity panel'; }
}
function openWin(id, title, icon, build, o = {}) {
  if (WINS.has(id)) { closeWin(id); if (!o.reopen) return null; }
  const c = o.chat, node = el('div', 'toolwin' + (c ? ' inchat' : ''), `<div class="tw-head"><b>${ico(icon, 15)} <span class="tw-title">${esc(title)}</span></b><span class="tw-btns"><button class="ibtn sm" data-w="refresh" data-tip="Refresh">${ico('undo', 14)}</button>${c ? `<button class="ibtn sm cm-flipbtn" data-w="flip" data-tip="Move this panel to the other side of the chat" aria-label="Move this panel to the other side of the chat">${ico('chev', 15)}</button>` : `<button class="ibtn sm" data-w="dock" data-tip="Snap above the activity panel">${ico('pin', 14)}</button>`}<button class="ibtn sm" data-w="x" data-tip="Close">${ico('x', 14)}</button></span></div><div class="tw-body"></div>`);
  const w = { node, body: $('.tw-body', node), timer: 0, build, id, chat: c || null, docked: false };
  if (c) { c.view.insertBefore(node, c.list); c.view.classList.add('cm-open'); cmGrip(c, node); w.ro = new ResizeObserver(() => cmFit(c)); w.ro.observe(c.view); if (c.pcomp) w.ro.observe(c.pcomp); cmFit(c); }
  else { const n = WINS.size; node.style.right = 24 + n * 34 + 'px'; node.style.top = 168 + n * 38 + 'px'; document.body.append(node); }
  WINS.set(id, w);
  node.addEventListener('pointerdown', () => { if (!w.docked && !w.chat) node.style.zIndex = 60 + (WINS.zi = (WINS.zi || 0) + 1); });
  node.querySelector('[data-w=x]').onclick = () => closeWin(id);
  const fb = node.querySelector('[data-w=flip]'); if (fb) fb.onclick = () => { saveSettings({ cmFlip: !S.settings.cmFlip }); WINS.forEach((x) => x.chat && cmFit(x.chat)); };
  node.querySelector('[data-w=refresh]').onclick = () => build(w);
  const dk = node.querySelector('[data-w=dock]'); if (dk) dk.onclick = () => dockWin(w, !w.docked);
  const head = $('.tw-head', node), wrap = $('#sideWrap'); let d = null;
  head.addEventListener('pointerdown', (e) => { if (w.docked || w.chat || e.target.closest('button')) return; const r = node.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove', (e) => { if (!d) return; node.style.left = Math.max(0, Math.min(innerWidth - 120, e.clientX - d.x)) + 'px'; node.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - d.y)) + 'px'; node.style.right = 'auto'; const r = wrap.getBoundingClientRect(); wrap.classList.toggle('snap', !wrap.classList.contains('hidden') && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom); });
  head.addEventListener('pointerup', () => { if (!d) return; d = null; if (wrap.classList.contains('snap')) { wrap.classList.remove('snap'); dockWin(w, true); } });
  head.addEventListener('pointercancel', () => { d = null; wrap.classList.remove('snap'); });
  if (!c && (dockPref(id) || S.dockNext)) { S.dockNext = false; dockWin(w, true); }
  build(w); if (o.every) w.timer = setInterval(() => { if (document.hidden || w.busy) return; build(w); }, o.every);
  return w;
}
const noChan = () => { err('Open a channel first.'); return null; };
const chanHead = (c, extra = '') => `<div class="tw-chan"><img src="${esc(c.avatar)}" alt=""><b>${esc(c.name)}</b>${extra}</div>`;
const ownerNote = (c) => (isOwner(c) ? '' : `<div class="tw-note">${ico('warn', 14)} <span>Twitch only lets the channel owner do this through apps, so it may be refused. <a href="#" data-url="${esc(modViewUrl(c))}" class="lnk2">Open Twitch Mod View</a></span></div>`);
document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a.lnk2'); if (a) { e.preventDefault(); openLink(a.dataset.url); } });

/* ----- Poll ----- */
const POLL_LEN = [[30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes'], [900, '15 minutes']];
function pollWin(c) {
  openWin('poll', 'Poll · ' + c.name, 'poll', async (w) => {
    if (w.editing) return; w.busy = true;
    const r = await helix('polls', { query: { broadcaster_id: c.id, first: '5' } }); w.busy = false;
    const list = ok(r) ? r.json.data || [] : [], act = list.find((p) => p.status === 'ACTIVE'), recent = list.filter((p) => p !== act).slice(0, 3);
    const denied = !ok(r), total = (p) => p.choices.reduce((a, x) => a + (x.votes || 0), 0);
    const bars = (p) => { const t = total(p) || 1, top = Math.max(...p.choices.map((x) => x.votes)); return p.choices.map((x) => `<div class="tw-bar${x.votes === top && top ? ' top' : ''}"><i style="width:${Math.round((x.votes / t) * 100)}%"></i><span>${esc(x.title)}</span><b>${x.votes} · ${Math.round((x.votes / t) * 100)}%</b></div>`).join(''); };
    w.body.innerHTML = chanHead(c) + (denied ? `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 401 || r.status === 403 ? ' · ' + (isOwner(c) ? 'Log in again to grant the polls permission.' : "Only the channel owner can run polls through apps.") : ''} <a href="#" class="lnk2" data-url="${esc(modViewUrl(c))}">Twitch Mod View</a></span></div>` : '') +
      (act ? `<div class="tw-sec"><b>${esc(act.title)}</b><span class="faint">Live · ends ${new Date(act.ended_at || Date.now() + act.duration * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>${bars(act)}<div class="btnrow"><button class="btn sm" data-p="end">End now</button><button class="btn sm danger" data-p="cancel">Cancel poll</button></div>` :
        `<div class="tw-form"><input id="pl-t" placeholder="Question" maxlength="60"><div id="pl-c"></div><div class="btnrow"><button class="btn sm" id="pl-add">${ico('plus', 13)} Choice</button><select id="pl-d">${POLL_LEN.map(([v, l]) => `<option value="${v}" ${v === 120 ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary" id="pl-go">Start poll</button></div></div>`) +
      (recent.length ? `<div class="tw-sec"><b>Recent polls</b></div>` + recent.map((p) => `<div class="tw-rec"><b>${esc(p.title)}</b><span class="faint">${p.status.toLowerCase()} · ${total(p)} votes</span>${bars(p)}</div>`).join('') : '');
    if (act) { w.body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = async () => { const rr = await helix('polls', { method: 'PATCH', body: { broadcaster_id: c.id, id: act.id, status: b.dataset.p === 'end' ? 'TERMINATED' : 'ARCHIVED' } }); if (!ok(rr)) toolErr(rr, c, 'end this poll', true); else pollWin.refresh(w); })); return; }
    const box = $('#pl-c', w.body), row = (v = '') => `<div class="tw-ch"><input maxlength="25" placeholder="Choice" value="${esc(v)}"><button class="ibtn sm" data-tip="Remove">${ico('x', 12)}</button></div>`;
    box.innerHTML = row() + row(); const sync = () => { $('#pl-add', w.body).disabled = box.children.length >= 5; };
    $('#pl-add', w.body).onclick = () => { box.insertAdjacentHTML('beforeend', row()); sync(); box.lastChild.querySelector('input').focus(); };
    box.onclick = (e) => { const x = e.target.closest('button'); if (x && box.children.length > 2) { x.parentElement.remove(); sync(); } };
    w.body.addEventListener('focusin', () => (w.editing = true)); w.body.addEventListener('focusout', () => setTimeout(() => { w.editing = w.body.contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName); }, 50));
    $('#pl-go', w.body).onclick = () => askScope('channel:manage:polls', async () => {
      const title = $('#pl-t', w.body).value.trim(), ch = [...box.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
      if (!title) return err('Write the question first.'); if (ch.length < 2) return err('A poll needs at least two choices.');
      const rr = await helix('polls', { method: 'POST', body: { broadcaster_id: c.id, title, choices: ch.map((t) => ({ title: t })), duration: +$('#pl-d', w.body).value } });
      if (!ok(rr)) return toolErr(rr, c, 'run a poll', true); w.editing = false; toast('Poll started', { ms: 2000 }); pollWin.refresh(w);
    });
  }, { every: 8000, reopen: false });
}
pollWin.refresh = (w) => w.build(w);
/* ----- Prediction ----- */
const PRED_LEN = [[60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes'], [1800, '30 minutes']];
function predWin(c) {
  openWin('predict', 'Prediction · ' + c.name, 'predict', async (w) => {
    if (w.editing) return; w.busy = true;
    const r = await helix('predictions', { query: { broadcaster_id: c.id, first: '5' } }); w.busy = false;
    const list = ok(r) ? r.json.data || [] : [], act = list.find((p) => p.status === 'ACTIVE' || p.status === 'LOCKED'), recent = list.filter((p) => p !== act).slice(0, 3);
    const pts = (p) => p.outcomes.reduce((a, x) => a + (x.channel_points || 0), 0) || 1;
    const bars = (p) => p.outcomes.map((x, i) => `<div class="tw-bar o${i % 2}${p.winning_outcome_id === x.id ? ' top' : ''}"><i style="width:${Math.round(((x.channel_points || 0) / pts(p)) * 100)}%"></i><span>${esc(x.title)}</span><b>${(x.channel_points || 0).toLocaleString()} pts · ${x.users || 0} users</b></div>`).join('');
    w.body.innerHTML = chanHead(c) + (!ok(r) ? `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 401 || r.status === 403 ? ' · ' + (isOwner(c) ? 'Log in again to grant the predictions permission.' : 'Only the channel owner (or an affiliate/partner channel) can run predictions through apps.') : ''} <a href="#" class="lnk2" data-url="${esc(modViewUrl(c))}">Twitch Mod View</a></span></div>` : '') +
      (act ? `<div class="tw-sec"><b>${esc(act.title)}</b><span class="faint">${act.status === 'LOCKED' ? 'Locked, waiting for the result' : 'Open for predictions'}</span></div>${bars(act)}<div class="btnrow">${act.status === 'ACTIVE' ? '<button class="btn sm" data-p="lock">Lock now</button>' : ''}<button class="btn sm danger" data-p="cancel">Cancel and refund</button></div>${act.status === 'LOCKED' || act.status === 'ACTIVE' ? `<div class="tw-sec"><b>Pick the winner</b></div><div class="btnrow">${act.outcomes.map((x) => `<button class="btn sm primary" data-win="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</div>` : ''}` :
        `<div class="tw-form"><input id="pr-t" placeholder="Question" maxlength="45"><div id="pr-c"></div><div class="btnrow"><button class="btn sm" id="pr-add">${ico('plus', 13)} Outcome</button><select id="pr-d">${PRED_LEN.map(([v, l]) => `<option value="${v}" ${v === 120 ? 'selected' : ''}>${l} to predict</option>`).join('')}</select><button class="btn primary" id="pr-go">Start prediction</button></div></div>`) +
      (recent.length ? `<div class="tw-sec"><b>Recent predictions</b></div>` + recent.map((p) => `<div class="tw-rec"><b>${esc(p.title)}</b><span class="faint">${p.status.toLowerCase()}</span>${bars(p)}</div>`).join('') : '');
    const patch = async (body) => { const rr = await helix('predictions', { method: 'PATCH', body: { broadcaster_id: c.id, id: act.id, ...body } }); if (!ok(rr)) toolErr(rr, c, 'change this prediction', true); else w.build(w); };
    if (act) { w.body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => patch({ status: b.dataset.p === 'lock' ? 'LOCKED' : 'CANCELED' }))); w.body.querySelectorAll('[data-win]').forEach((b) => (b.onclick = () => { if (confirm(`Resolve with "${b.textContent}" as the winner? Points are paid out straight away.`)) patch({ status: 'RESOLVED', winning_outcome_id: b.dataset.win }); })); return; }
    const box = $('#pr-c', w.body), row = (v = '') => `<div class="tw-ch"><input maxlength="25" placeholder="Outcome" value="${esc(v)}"><button class="ibtn sm" data-tip="Remove">${ico('x', 12)}</button></div>`;
    box.innerHTML = row('Yes') + row('No'); const sync = () => { $('#pr-add', w.body).disabled = box.children.length >= 10; };
    $('#pr-add', w.body).onclick = () => { box.insertAdjacentHTML('beforeend', row()); sync(); box.lastChild.querySelector('input').focus(); };
    box.onclick = (e) => { const x = e.target.closest('button'); if (x && box.children.length > 2) { x.parentElement.remove(); sync(); } };
    w.body.addEventListener('focusin', () => (w.editing = true)); w.body.addEventListener('focusout', () => setTimeout(() => { w.editing = w.body.contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName); }, 50));
    $('#pr-go', w.body).onclick = () => askScope('channel:manage:predictions', async () => {
      const title = $('#pr-t', w.body).value.trim(), oc = [...box.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
      if (!title) return err('Write the question first.'); if (oc.length < 2) return err('A prediction needs at least two outcomes.');
      const rr = await helix('predictions', { method: 'POST', body: { broadcaster_id: c.id, title, outcomes: oc.map((t) => ({ title: t })), prediction_window: +$('#pr-d', w.body).value } });
      if (!ok(rr)) return toolErr(rr, c, 'run a prediction', true); w.editing = false; toast('Prediction started', { ms: 2000 }); w.build(w);
    });
  }, { every: 8000 });
}
/* ----- User list ----- */
// Roles for the Community-style list: who is a moderator or VIP in this channel (cached; only moderators and the streamer may ask Twitch for these)
async function roleSets(c) {
  const now = Date.now(); if (c._roles && now - c._roles.at < 300000) return c._roles;
  const r = { at: now, mods: new Set(), vips: new Set() }; c._roles = r;
  if (isOwner(c) || isMod(c)) {
    const m = await pagedGet('moderation/moderators', { broadcaster_id: c.id }); if (ok(m.r)) m.data.forEach((u) => r.mods.add(u.user_login));
    if (hasScope('channel:read:vips') || hasScope('channel:manage:vips')) { const v = await pagedGet('channels/vips', { broadcaster_id: c.id }); if (ok(v.r)) v.data.forEach((u) => r.vips.add(u.user_login)); }
  }
  return r;
}
// Like Twitch's Community tab: Broadcaster, Moderators, VIPs and Viewers, including people who have not said anything.
// Streamer and moderators get Twitch's own list (checked every 15 seconds). Twitch gives nobody else that list, so for everyone else it is
// built from the chat connection's join and leave notices plus the people seen speaking.
function usersWin(c) {
  openWin('users:' + c.login, 'Community · ' + c.name, 'community', async (w) => {
    if (w.typing) return;
    w.col = w.col || {};
    const draw = () => {
      const q = (w.q || '').toLowerCase().replace(/^@/, ''), all = w.list || [], roles = c._roles || { mods: new Set(), vips: new Set() };
      const role = (u) => { const l = u.user_login, b = (c.users.get(l) || {}).badges || []; return l === c.login || b.some((x) => /^broadcaster\//.test(x)) ? 'Broadcaster' : b.some((x) => /^(staff|admin|global_mod)\//.test(x)) ? 'Staff' : roles.mods.has(l) || b.some((x) => /^moderator\//.test(x)) ? 'Moderators' : roles.vips.has(l) || b.some((x) => /^vip\//.test(x)) ? 'VIPs' : 'Viewers'; };
      const rows = all.filter((u) => !q || u.user_login.includes(q) || u.user_name.toLowerCase().includes(q)), groups = { Broadcaster: [], Staff: [], Moderators: [], VIPs: [], 'Chat Bots': [], Viewers: [] };
      rows.forEach((u) => { groups[role(u)].push(u); if (KNOWN_BOTS.has(u.user_login)) groups['Chat Bots'].push(u); }); Object.values(groups).forEach((g) => g.sort((a, b) => a.user_login.localeCompare(b.user_login)));
      const sub = (u) => ((c.users.get(u.user_login) || {}).badges || []).some((x) => /^subscriber\//.test(x));
      $('.tw-ul', w.body).innerHTML = Object.entries(groups).filter(([k, g]) => g.length || (k === 'Broadcaster' && !q && 0)).map(([k, g]) => `<div class="cm-sec${w.col[k] ? ' shut' : ''}" data-sec="${k}"><span class="cm-ic">${ico(({ Broadcaster: 'stream', Staff: 'spark', Moderators: 'shield', VIPs: 'star', 'Chat Bots': 'bolt', Viewers: 'users' })[k], 15)}</span><b>${k}</b><i class="cm-n">${g.length.toLocaleString()}</i><span class="cm-chev">${ico('chev', 14)}</span></div>${w.col[k] ? '' : g.slice(0, 500).map((u) => `<div class="tw-u" data-u="${esc(u.user_login)}"><b>${esc(u.user_name)}</b>${sub(u) ? '<i class="jtag in">Sub</i>' : ''}</div>`).join('') + (g.length > 500 ? `<div class="faint" style="padding:4px 8px">and ${(g.length - 500).toLocaleString()} more. Use the filter to find someone.</div>` : '')}`).join('') || '<div class="none">Nobody matches.</div>';
      $('.tw-cnt', w.body).textContent = `${all.length.toLocaleString()} ${w.seen ? 'in chat, as far as YappyChat can tell' : 'in chat'}${w.total > all.length ? ` (the first ${all.length.toLocaleString()} of ${w.total.toLocaleString()})` : ''}${q ? ` · ${rows.length} match` : ''}${w.at ? ` · updated ${tmFmt(w.at)}` : ''}`;
    };
    w.draw = draw;
    if (!w.built) {
      w.built = true; w.body.innerHTML = chanHead(c) + `<input class="tw-q" placeholder="Filter" spellcheck="false" autocomplete="off"><div class="tw-cnt faint"></div><div class="tw-ul cm"></div>`;
      const qi = $('.tw-q', w.body); qi.oninput = () => { w.q = qi.value.trim(); draw(); }; qi.onfocus = () => (w.typing = true); qi.onblur = () => (w.typing = false);
      $('.tw-ul', w.body).onclick = (e) => { const sec = e.target.closest('.cm-sec'); if (sec) { w.col[sec.dataset.sec] = !w.col[sec.dataset.sec]; return draw(); } const u = e.target.closest('.tw-u'); if (u) openCard(c, u.dataset.u, u); };
    }
    const note = (h) => { let n = $('.tw-why', w.body); if (!n) { n = el('div', 'tw-note tw-why', ''); $('.tw-cnt', w.body).before(n); } n.innerHTML = h; return n; };
    const unnote = () => { const n = $('.tw-why', w.body); if (n) n.remove(); };
    // Everyone Twitch has told this connection about (join notices) plus everyone seen speaking
    const present = async () => {
      const r = new Map(); (c.present || new Set()).forEach((l) => r.set(l, { user_login: l, user_name: (c.users.get(l) || {}).name || l })); c.users.forEach((u, l) => r.set(l, { user_login: l, user_name: u.name || l }));
      r.delete(S.me.login); r.set(S.me.login, { user_login: S.me.login, user_name: S.me.login }); r.set(c.login, { user_login: c.login, user_name: c.name });
      await roleSets(c); w.list = [...r.values()]; w.total = w.list.length; w.seen = true; w.at = Date.now(); draw();
    };
    if (!isOwner(c) && !isMod(c)) { await present(); note(`${ico('users', 14)} <span>Twitch only hands the complete list to the streamer and moderators. This shows who YappyChat's chat connection has been told is in ${esc(c.name)}'s chat, plus everyone who has spoken, so it can miss quiet viewers${S.settings.trackJoins === false ? ' (join and leave tracking is off in Settings > Chat)' : ''}.</span>`); return; }
    if (!hasScope('moderator:read:chatters')) { await present(); const n = note(`${ico('lock', 14)} <span>This shows who YappyChat has seen so far. For Twitch's full list it needs one more permission. <a href="#" id="us-go" class="lnk2x">Grant permission</a></span>`); $('#us-go', n).onclick = (e) => { e.preventDefault(); askScope('moderator:read:chatters', () => w.build(w)); }; return; }
    unnote(); w.busy = true; let after = '', got = [], total = 0;
    for (let i = 0; i < 4; i++) { const r = await helix('chat/chatters', { query: mq(c, { first: '1000', ...(after ? { after } : {}) }) }); if (!ok(r)) { w.busy = false; $('.tw-ul', w.body).innerHTML = `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 403 || r.status === 401 ? ' · You need to be a moderator of this channel to see who is in chat.' : ''} <a href="#" class="lnk2" data-url="${esc(modViewUrl(c))}">Twitch Mod View</a></span></div>`; return; } got = got.concat(r.json.data || []); total = r.json.total || got.length; after = r.json.pagination && r.json.pagination.cursor; if (!after) break; }
    got = got.filter((u) => u.user_login !== c.login); got.push({ user_login: c.login, user_name: c.name }); await roleSets(c);
    w.busy = false; w.list = got; w.total = total; w.seen = false; w.at = Date.now(); draw();
  }, { every: 15000, chat: c });
}
/* ----- Tool icons beside the chat's search button, and the "more" menu ----- */
const TOOL_BTNS = [['poll', 'poll', 'Run a poll', 'owner'], ['predict', 'predict', 'Run a prediction', 'owner'], ['users', 'community', 'Community', ''], ['more', 'tools', 'More moderator tools', 'mod']];
// Twitch only lets the channel owner start polls and predictions through apps, so everyone else never sees those buttons; the wrench is for moderators
const toolsFor = (c) => TOOL_BTNS.filter((t) => !t[3] || (t[3] === 'owner' ? isOwner(c) : isOwner(c) || isMod(c)));
const toolBtns = (c) => toolsFor(c).map(([k, i, t]) => `<button class="ptool" data-pa="tool:${k}" data-tip="${t}" aria-label="${t}">${ico(i, 14)}</button>`).join('') + '<i class="psep"></i>';
function refreshTools(c) {
  const box = c.view && c.view.querySelector('.pbtns'); if (!box) return; const key = toolsFor(c).map((t) => t[0]).join(); if (c._tk === key) return; c._tk = key;
  box.querySelectorAll('.ptool,.psep').forEach((x) => x.remove()); box.insertAdjacentHTML('afterbegin', toolBtns(c));
}
function openTool(c, k, anchor) {
  if (!c) return noChan();
  if ((k === 'poll' || k === 'predict') && !isOwner(c)) return err('Only the channel owner can start polls and predictions through apps. Moderators can use Twitch Mod View.'); if (k === 'poll') return pollWin(c); if (k === 'predict') return predWin(c); if (k === 'users') return usersWin(c); if (k === 'more') return moreMenu(c, anchor);
}
// Tools that can sit on the activity rail (the + at the bottom of it). A third value of 'owner' means only the channel owner can use it.
const RAIL_TOOLS = [['banned', 'ban', 'Banned and timed-out users'], ['roles', 'users', 'Moderators and VIPs'], ['filters', 'siren', 'Chat filters (AutoMod, blocked terms)'], ['users', 'community', 'Community'], ['poll', 'poll', 'Run a poll', 'owner'], ['predict', 'predict', 'Run a prediction', 'owner'], ['shout', 'mega', 'Shout out a streamer'], ['clip', 'clip', 'Make a clip'], ['marker', 'mark', 'Add a stream marker', 'owner'], ['raid', 'bolt', 'Start a raid', 'owner'], ['ad', 'tv', 'Run an ad', 'owner'], ['adsched', 'tv', 'Ad schedule and snooze', 'owner'], ['modview', 'link', 'Open Twitch Mod View'], ['dash', 'dash', 'Open Twitch Creator Dashboard', 'owner']];
const railToolsFor = (c) => (S.settings.railTools || []).map((k) => RAIL_TOOLS.find((x) => x[0] === k)).filter((x) => x && (!x[3] || (c && isOwner(c))));
function railTool(k) {
  const c = cur(); if (!c) return noChan();
  S.dockNext = true; setTimeout(() => { S.dockNext = false; }, 20000); // a tool window opened from the rail snaps into the column beside it
  if (k === 'users' || k === 'poll' || k === 'predict') openTool(c, k === 'predict' ? 'predict' : k); else moreTool(c, k);
}
function openRailAdd(anchor) {
  const have = new Set(S.settings.railTools || []), c = cur();
  const n = el('div', 'stack moremenu railadd', `<h3>${ico('plus', 16)} Tools on the rail</h3><div class="faint" style="padding:0 2px 4px">Tick a tool to keep its icon on the activity rail. Right-click an icon there to take it off.</div>` + RAIL_TOOLS.filter((x) => !x[3] || (c && isOwner(c))).map(([k, i, t]) => `<button class="btn macroi${have.has(k) ? ' on' : ''}" data-k="${k}"><b>${ico(have.has(k) ? 'check' : i, 14)} ${t}</b></button>`).join(''));
  popover(n, anchor, { toggle: true, sticky: true });
  n.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; const cur2 = [...(S.settings.railTools || [])], k = b.dataset.k, at = cur2.indexOf(k);
    if (at >= 0) cur2.splice(at, 1); else { if (cur2.length >= 6) return toast('Six tools is the most on the rail. Take one off first.', { ms: 2800 }); cur2.push(k); }
    saveSettings({ railTools: cur2 }); b.classList.toggle('on', at < 0); const d = RAIL_TOOLS.find((x) => x[0] === k); b.innerHTML = `<b>${ico(at < 0 ? 'check' : d[1], 14)} ${d[2]}</b>`; renderSide();
  };
}
function moreMenu(c, anchor) {
  const items = [['banned', 'ban', 'Banned and timed-out users'], ['roles', 'users', 'Moderators and VIPs'], ['shout', 'mega', 'Shout out a streamer'], ['raid', 'bolt', 'Start a raid', 1], ['ad', 'tv', 'Run an ad', 1], ['clip', 'clip', 'Make a clip'], ['marker', 'mark', 'Add a stream marker', 1], ['adsched', 'tv', 'Ad schedule and snooze', 1], ['filters', 'siren', 'Chat filters (AutoMod, blocked terms)'], ['modview', 'link', 'Open Twitch Mod View'], ['dash', 'dash', 'Open Twitch Creator Dashboard', 1]].filter((x) => !x[3] || isOwner(c));
  const n = el('div', 'stack moremenu', `<h3>${ico('tools', 16)} Moderator tools · ${esc(c.name)}</h3>` + items.map(([k, i, t]) => `<button class="btn macroi" data-k="${k}"><b>${ico(i, 14)} ${t}</b></button>`).join(''));
  popover(n, anchor, { toggle: true });
  n.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closePop(); moreTool(c, b.dataset.k); };
}
function moreTool(c, k) {
  if (k === 'adsched') return adScheduleWin(c);
  if (k === 'modview') return openLink(modViewUrl(c));
  if (k === 'dash') return openLink('https://dashboard.twitch.tv/u/' + c.login + '/home');
  if (k === 'banned') return askScope('moderation:read', () => bannedWin(c));
  if (k === 'roles') return askScope('moderation:read', () => rolesWin(c));
  if (k === 'filters') return askScope('moderator:manage:automod_settings', () => filtersWin(c));
  if (k === 'shout') return askText('Shout out a streamer', 'Their Twitch name', 'Send shoutout', async (v) => { const login = v.replace(/^@/, '').toLowerCase(), id = await idOf(login); if (!id) return err(`"${login}" was not found.`); askScope('moderator:manage:shoutouts', async () => { const r = await helix('chat/shoutouts', { method: 'POST', query: { from_broadcaster_id: c.id, to_broadcaster_id: id, moderator_id: S.me.id } }); if (!ok(r)) return toolErr(r, c, 'send a shoutout', false); shoutToast(c, login); }); });
  if (k === 'raid') return askText('Start a raid', 'Who to raid (their Twitch name)', 'Start raid', async (v) => { const login = v.replace(/^@/, '').toLowerCase(), id = await idOf(login); if (!id) return err(`"${login}" was not found.`); askScope('channel:manage:raids', async () => { const r = await helix('raids', { method: 'POST', query: { from_broadcaster_id: c.id, to_broadcaster_id: id } }); if (!ok(r)) return toolErr(r, c, 'start a raid', true); toast(`Raid to ${login} started. Twitch counts down before it goes.`, { ms: 7000, action: { label: 'Cancel raid', fn: async () => { const x = await helix('raids', { method: 'DELETE', query: { broadcaster_id: c.id } }); toast(ok(x) ? 'Raid cancelled' : apiErr(x), { ms: 3000 }); } } }); }); });
  if (k === 'ad') return askChoice('Run an ad', 'Ads play for everyone who is watching without Turbo or a subscription. Twitch limits how often you can run them.', [[30, '30 seconds'], [60, '1 minute'], [90, '90 seconds'], [120, '2 minutes'], [180, '3 minutes']], 'Run ad', (v) => askScope('channel:edit:commercial', async () => { const r = await helix('channels/commercial', { method: 'POST', body: { broadcaster_id: c.id, length: +v } }); if (!ok(r)) return toolErr(r, c, 'run an ad', true); const d = (r.json.data || [])[0] || {}; toast(d.message || 'Ad started', { ms: 6000 }); }));
  if (k === 'clip') return askScope('clips:edit', async () => { const r = await helix('clips', { method: 'POST', query: { broadcaster_id: c.id } }); if (!ok(r)) return toolErr(r, c, 'make a clip (the channel needs to be live)', false); const d = (r.json.data || [])[0]; if (!d) return err('Twitch did not return a clip.'); toast('Clip created. It can take a few seconds to appear.', { ms: 12000, action: { label: 'Open clip', fn: () => openLink('https://clips.twitch.tv/' + d.id) } }); });
  if (k === 'marker') return askText('Add a stream marker', 'A short description (optional)', 'Add marker', (v) => askScope('channel:manage:broadcast', async () => { const r = await helix('streams/markers', { method: 'POST', body: { user_id: c.id, description: v.slice(0, 140) } }); if (!ok(r)) return toolErr(r, c, 'add a marker (the channel needs to be live)', true); toast('Marker added at this point in the stream', { ms: 3000 }); }), true);
}
// Small helpers for one-question dialogs
function askText(title, ph, go, fn, optional) {
  const n = el('div', 'stack', `<h3>${esc(title)}</h3><input id="at-v" placeholder="${esc(ph)}" maxlength="140" spellcheck="false" autocomplete="off"><div class="row"><button class="btn" id="at-x">Cancel</button><button class="btn primary" id="at-go">${esc(go)}</button></div>`);
  modal(n); const i = $('#at-v', n); i.focus(); const done = () => { const v = i.value.trim(); if (!v && !optional) return i.focus(); closeModal(); fn(v); };
  $('#at-x', n).onclick = closeModal; $('#at-go', n).onclick = done; i.onkeydown = (e) => { if (e.key === 'Enter') done(); };
}
function askChoice(title, desc, opts, go, fn) {
  const n = el('div', 'stack', `<h3>${esc(title)}</h3><div class="sd">${esc(desc)}</div><select id="ac-v">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><div class="row"><button class="btn" id="ac-x">Cancel</button><button class="btn primary" id="ac-go">${esc(go)}</button></div>`);
  modal(n); $('#ac-x', n).onclick = closeModal; $('#ac-go', n).onclick = () => { const v = $('#ac-v', n).value; closeModal(); fn(v); };
}
/* ----- Lists: banned users, blocked terms, mods/VIPs ----- */
async function pagedGet(path, query, max = 5) { let after = '', out = [], total = 0, r; for (let i = 0; i < max; i++) { r = await helix(path, { query: { ...query, first: '100', ...(after ? { after } : {}) } }); if (!ok(r)) return { r, data: out }; out = out.concat(r.json.data || []); total = r.json.total || out.length; after = r.json.pagination && r.json.pagination.cursor; if (!after) break; } return { r, data: out, total }; }
function bannedWin(c) {
  openWin('banned', 'Banned · ' + c.name, 'ban', async (w) => {
    const { r, data } = await pagedGet('moderation/banned', { broadcaster_id: c.id });
    if (!ok(r)) { w.body.innerHTML = chanHead(c) + `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 403 || r.status === 401 ? ' · You need to be a moderator of this channel.' : ''}</span></div>`; return; }
    w.list = data; const draw = () => { const q = (w.q || '').toLowerCase(); $('.tw-ul', w.body).innerHTML = w.list.filter((u) => !q || u.user_login.includes(q)).slice(0, 300).map((u) => { const to = u.expires_at ? 'timed out until ' + new Date(u.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'banned'; return `<div class="tw-u" data-id="${esc(u.user_id)}" data-l="${esc(u.user_login)}"><b>${esc(u.user_name)}</b><span class="faint">${to}${u.reason ? ' · ' + esc(u.reason.slice(0, 60)) : ''}</span><button class="btn sm" data-un="1">Unban</button></div>`; }).join('') || '<div class="none">Nobody.</div>'; };
    w.body.innerHTML = chanHead(c, `<span class="faint">${data.length} listed</span>`) + `<input class="tw-q" placeholder="Find a name" spellcheck="false"><div class="tw-ul"></div>`;
    $('.tw-q', w.body).oninput = (e) => { w.q = e.target.value.trim(); draw(); };
    $('.tw-ul', w.body).onclick = async (e) => { const b = e.target.closest('[data-un]'), row = e.target.closest('.tw-u'); if (!row) return; if (b) { if (await unban(c, row.dataset.id, row.dataset.l)) { w.list = w.list.filter((u) => u.user_id !== row.dataset.id); draw(); } } else openCard(c, row.dataset.l, row); };
    draw();
  });
}
const termsBuild = (c) => async (w) => {
    const { r, data } = await pagedGet('moderation/blocked_terms', mq(c));
    if (!ok(r)) { w.body.innerHTML = chanHead(c) + `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 403 || r.status === 401 ? ' · You need to be a moderator of this channel.' : ''}</span></div>`; return; }
    w.body.innerHTML = (w.sub ? '' : chanHead(c, `<span class="faint">${data.length} terms</span>`)) + `<div class="btnrow"><input class="tw-q" id="bt-v" placeholder="Add a term or phrase" maxlength="500" spellcheck="false"><button class="btn primary sm" id="bt-add">Add</button></div><div class="tw-ul">${data.map((t) => `<div class="tw-u" data-id="${esc(t.id)}" data-text="${esc(t.text)}"><b>${esc(t.text)}</b><button class="ibtn sm" data-del="1" data-tip="Remove">${ico('trash', 13)}</button></div>`).join('') || '<div class="none">No blocked terms.</div>'}</div>`;
    $('#bt-add', w.body).onclick = async () => { const v = $('#bt-v', w.body).value.trim(); if (!v) return; const x = await helix('moderation/blocked_terms', { method: 'POST', query: mq(c), body: { text: v } }); if (!ok(x)) return err(apiErr(x)); logAct(c, 'term', `You added "${v.slice(0, 40)}" to the blocked words`); w.build(w); };
    $('#bt-v', w.body).onkeydown = (e) => { if (e.key === 'Enter') $('#bt-add', w.body).click(); };
    $('.tw-ul', w.body).onclick = async (e) => { const d = e.target.closest('[data-del]'); if (!d) return; const x = await helix('moderation/blocked_terms', { method: 'DELETE', query: mq(c, { id: d.parentElement.dataset.id }) }); if (!ok(x)) return err(apiErr(x)); logAct(c, 'term', `You removed ${d.parentElement.dataset.text ? '"' + d.parentElement.dataset.text + '"' : 'a word'} from the blocked words`); w.build(w); };
};
function rolesWin(c) {
  openWin('roles', 'Mods and VIPs · ' + c.name, 'users', async (w) => {
    const m = await pagedGet('moderation/moderators', { broadcaster_id: c.id }), v = await pagedGet('channels/vips', { broadcaster_id: c.id });
    const bad = !ok(m.r) ? m.r : null;
    w.body.innerHTML = chanHead(c) + (bad ? `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(bad))}</span></div>` : '') +
      `<div class="tw-sec"><b>Moderators (${m.data.length})</b></div><div class="tw-ul short">${m.data.map((u) => `<div class="tw-u" data-l="${esc(u.user_login)}"><b>${esc(u.user_name)}</b></div>`).join('') || '<div class="none">None, or not visible to you.</div>'}</div>` +
      `<div class="tw-sec"><b>VIPs (${v.data.length})</b></div><div class="tw-ul short">${v.data.map((u) => `<div class="tw-u" data-l="${esc(u.user_login)}" data-id="${esc(u.user_id)}"><b>${esc(u.user_name)}</b>${isOwner(c) ? `<button class="ibtn sm" data-rm="1" data-tip="Remove VIP">${ico('x', 13)}</button>` : ''}</div>`).join('') || '<div class="none">None, or not visible to you.</div>'}</div>` +
      (isOwner(c) ? `<div class="btnrow"><input class="tw-q" id="vp-v" placeholder="Make someone a VIP" spellcheck="false"><button class="btn primary sm" id="vp-add">Add VIP</button></div>` : `<div class="tw-note">${ico('warn', 14)} <span>Only the channel owner can add or remove VIPs through apps.</span></div>`);
    w.body.onclick = async (e) => { const r2 = e.target.closest('[data-rm]'); if (r2) { const x = await helix('channels/vips', { method: 'DELETE', query: { broadcaster_id: c.id, user_id: r2.parentElement.dataset.id } }); return ok(x) ? w.build(w) : toolErr(x, c, 'remove a VIP', true); } const u = e.target.closest('.tw-u'); if (u && !e.target.closest('button')) openCard(c, u.dataset.l, u); };
    const add = $('#vp-add', w.body); if (add) add.onclick = () => askScope('channel:manage:vips', async () => { const login = $('#vp-v', w.body).value.trim().replace(/^@/, '').toLowerCase(); if (!login) return; const id = await idOf(login); if (!id) return err(`"${login}" was not found.`); const x = await helix('channels/vips', { method: 'POST', query: { broadcaster_id: c.id, user_id: id } }); if (!ok(x)) return toolErr(x, c, 'add a VIP', true); logAct(c, 'mode', `You made ${login} a VIP`); w.build(w); });
  });
}
const AM_KEYS = [['aggression', 'Aggression'], ['bullying', 'Bullying'], ['disability', 'Disability'], ['misogyny', 'Misogyny'], ['race_ethnicity_or_religion', 'Race, ethnicity or religion'], ['sex_based_terms', 'Sex-based terms'], ['sexuality_sex_or_gender', 'Sexuality, sex or gender'], ['swearing', 'Swearing']];
const automodBuild = (c) => async (w) => {
    const r = await helix('moderation/automod/settings', { query: mq(c) });
    if (!ok(r)) { w.body.innerHTML = chanHead(c) + `<div class="tw-note err">${ico('warn', 14)} <span>${esc(apiErr(r))}${r.status === 403 || r.status === 401 ? ' · You need to be a moderator of this channel.' : ''}</span></div>`; return; }
    const d = (r.json.data || [])[0] || {}, L = ['Off', 'Low', 'Medium', 'High', 'Strict'], opt = (v) => L.map((l, i) => `<option value="${i}" ${+v === i ? 'selected' : ''}>${l}</option>`).join('');
    w.body.innerHTML = (w.sub ? '' : chanHead(c)) + `<div class="sd">Overall level sets every category together. Change a single category to fine-tune it.</div><div class="srow tw-r"><div class="sl">Overall</div><select id="am-all"><option value="">Custom</option>${L.map((l, i) => `<option value="${i}" ${d.overall_level === i ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` + AM_KEYS.map(([k, l]) => `<div class="srow tw-r"><div class="sl">${l}</div><select data-am="${k}">${opt(d[k])}</select></div>`).join('') + `<div class="btnrow"><button class="btn primary" id="am-save">Save</button></div>`;
    $('#am-save', w.body).onclick = async () => { const all = $('#am-all', w.body).value, body = all !== '' && d.overall_level !== null && +all !== d.overall_level ? { overall_level: +all } : Object.fromEntries([...w.body.querySelectorAll('[data-am]')].map((s) => [s.dataset.am, +s.value])); const x = await helix('moderation/automod/settings', { method: 'PUT', query: mq(c), body }); if (!ok(x)) return err(apiErr(x)); logAct(c, 'mode', 'You changed AutoMod settings'); toast('AutoMod settings saved', { ms: 2500 }); w.build(w); };
};
// One window for the channel's chat filters: AutoMod levels and blocked terms
function filtersWin(c) {
  const parts = [['fl-a', 'AutoMod', automodBuild(c)], ['fl-t', 'Blocked terms', termsBuild(c)]];
  openWin('filters', 'Chat filters · ' + c.name, 'shield', async (w) => {
    if (!w.parts) {
      w.body.innerHTML = chanHead(c) + parts.map(([k, t]) => `<div class="tw-sec"><b>${t}</b></div><div class="${k}"></div>`).join('');
      w.parts = parts.map(([k, , fn]) => { const p = { sub: true, body: $('.' + k, w.body), build: () => fn(p) }; return p; });
    }
    await Promise.all(w.parts.map((p) => p.build()));
  });
}
/* ===== Title and game editor (the pencil) ===== */
async function openEditInfo(c) {
  const live = S.live.get(c.login); let title = live ? live.title : '', game = live ? live.game : '', gameId = live ? live.gameId : '';
  if (!live) { const r = await helix('channels', { query: { broadcaster_id: c.id } }); const d = ok(r) && (r.json.data || [])[0]; if (d) { title = d.title; game = d.game_name; gameId = d.game_id; } }
  const n = el('div', 'stack', `<h3>${ico('pencil', 16)} Stream info · ${esc(c.name)}</h3><label class="sd">Title</label><input id="ei-t" maxlength="140" value="${esc(title || '')}" spellcheck="true"><label class="sd">Category (game)</label><input id="ei-g" value="${esc(game || '')}" placeholder="Search for a category" autocomplete="off" spellcheck="false"><div class="swlist" id="ei-l"></div>${isOwner(c) ? '' : `<div class="tw-note">${ico('warn', 14)} <span>Twitch lets only the channel owner change this through apps. If you are not allowed, you will get an error and can use <a href="#" class="lnk2" data-url="${esc(modViewUrl(c))}">Twitch Mod View</a> instead.</span></div>`}<div class="row"><button class="btn" id="ei-x">Cancel</button><button class="btn primary" id="ei-go">Save</button></div>`);
  modal(n); const gi = $('#ei-g', n), list = $('#ei-l', n); let t = 0;
  gi.oninput = () => { clearTimeout(t); gameId = ''; t = setTimeout(async () => { const q = gi.value.trim(); if (q.length < 2) { list.innerHTML = ''; return; } const r = await helix('search/categories', { query: { query: q, first: '6' } }); list.innerHTML = ok(r) ? (r.json.data || []).map((g) => `<div class="swi" data-id="${esc(g.id)}" data-n="${esc(g.name)}"><img src="${esc(g.box_art_url.replace('{width}', '40').replace('{height}', '54'))}" alt="" style="border-radius:4px;width:24px;height:32px"><span>${esc(g.name)}</span></div>`).join('') : ''; }, 220); };
  list.onclick = (e) => { const i = e.target.closest('.swi'); if (!i) return; gameId = i.dataset.id; gi.value = i.dataset.n; game = i.dataset.n; list.innerHTML = ''; };
  $('#ei-x', n).onclick = closeModal;
  $('#ei-go', n).onclick = () => askScope('channel:manage:broadcast', async () => {
    const body = { title: $('#ei-t', n).value.trim() }; if (!body.title) return err('The title can not be empty.');
    if (gi.value.trim() && gi.value.trim() !== game) return err('Pick a category from the list.'); if (gameId) body.game_id = gameId;
    const r = await helix('channels', { method: 'PATCH', query: { broadcaster_id: c.id }, body });
    if (!ok(r)) return toolErr(r, c, 'change the title or game', true);
    closeModal(); const v = S.live.get(c.login); if (v) { v.title = body.title; if (body.game_id) { v.game = game; v.gameId = gameId; } } logAct(c, 'mode', `You changed the stream info${body.game_id ? ' (' + game + ')' : ''}`); renderStats(); toast('Stream info updated', { ms: 2500 });
  });
}
/* ===== Conversations: the replies between two chatters ===== */
const pairKey = (a, b) => [a, b].sort().join('|');
function noteConvo(c, m) {
  if (!c.chatlog) c.chatlog = []; c.chatlog.push({ ts: m.ts, login: m.login, name: m.name, text: m.text, id: m.id, hist: !!m.hist }); if (c.chatlog.length > 2000) c.chatlog.splice(0, 400);
  const others = []; if (m.reply && m.reply.login && m.reply.login !== m.login) others.push(m.reply.login);
  (m.text.match(/(?:^|\s)@([a-z0-9_]{3,25})/gi) || []).forEach((x) => { const l = x.trim().slice(1).toLowerCase(); if (l !== m.login && !others.includes(l)) others.push(l); });
  if (!others.length) return; if (!c.convo) c.convo = new Map();
  others.slice(0, 3).forEach((o) => { const k = pairKey(m.login, o); let a = c.convo.get(k); if (!a) { if (c.convo.size > 400) c.convo.delete(c.convo.keys().next().value); c.convo.set(k, (a = [])); if (m.reply && m.reply.login === o && m.reply.body) a.push({ ts: m.ts - 1, login: o, name: m.reply.name, text: m.reply.body, id: m.reply.id || '', reply: false }); } a.push({ ts: m.ts, login: m.login, name: m.name, text: m.text, id: m.id, reply: !!(m.reply && m.reply.login === o) }); a.n = (a.n || a.length - 1) + 1; if (a.length > 20) a.shift(); }); // only the 20 most recent are kept; a.n counts them all
}
function convoStats(c, a, b) { const l = (c.convo && c.convo.get(pairKey(a, b))) || [], ca = l.filter((x) => x.login === a).length, cb = l.filter((x) => x.login === b).length; return { l, ca, cb, both: ca > 0 && cb > 0, total: Math.max(l.n || 0, l.length) }; }
// A reply between people who keep going back and forth gets a count you can click to read the whole exchange
function convoBadge(c, d, a, b) {
  const st = convoStats(c, a, b); if (st.l.length < 3 || !st.both) return;
  const x = d.querySelector('.rcount'); if (x) { x.textContent = st.total > 20 ? ' · 20+ messages between them' : ` · ${st.l.length} messages between them`; d.classList.toggle('hotconv', st.l.length >= 8); }
}
function openConvo(c, a, b) {
  const st = convoStats(c, a, b), nm = (l) => ((c.users.get(l) || {}).name || l);
  const n = el('div', 'stack convo', `<h3>${ico('chat', 16)} ${esc(nm(a))} and ${esc(nm(b))}</h3><div class="sd">${st.total > 20 ? `The 20 most recent of ${st.total} messages` : `${st.l.length} message${st.l.length === 1 ? '' : 's'}`} between them in ${esc(c.name)} while YappyChat was open (${st.ca} from ${esc(nm(a))}, ${st.cb} from ${esc(nm(b))} shown). Replies and @mentions of each other are included.</div><div class="cv-list">${st.l.map((x) => `<div class="cv ${x.login === a ? 'a' : 'b'}"><span class="ts">${tmFmt(x.ts)}</span> <b class="cv-n" data-l="${esc(x.login)}" style="${nameStyle((c.users.get(x.login) || {}).color, x.login)}">${esc(x.name)}</b>${x.reply ? ' ' + ico('reply', 11) : ''} ${esc(x.text)}</div>`).join('') || '<div class="none">Nothing recorded yet.</div>'}</div><div class="row"><button class="btn" id="cv-copy">Copy</button><button class="btn primary" id="cv-x">Close</button></div>`);
  modal(n); const lst = $('.cv-list', n); lst.scrollTop = lst.scrollHeight;
  n.onclick = (e) => { const u = e.target.closest('.cv-n'); if (u) openCard(c, u.dataset.l, u); };
  $('#cv-x', n).onclick = closeModal; $('#cv-copy', n).onclick = () => navigator.clipboard.writeText(st.l.map((x) => `[${tmFmt(x.ts)}] ${x.name}: ${x.text}`).join('\n')).then(() => toast('Conversation copied', { ms: 1800 }));
}
/* ===== /search ===== */
function parseQuery(q) {
  const users = [], words = []; const rx = /"([^"]+)"|(\S+)/g; let m;
  while ((m = rx.exec(q))) { const t = m[1] || m[2]; if (m[1]) words.push(t.toLowerCase()); else if (/^@[a-z0-9_]{2,25}$/i.test(t)) users.push(t.slice(1).toLowerCase()); else if (/^from:/i.test(t) && t.length > 5) users.push(t.slice(5).replace(/^@/, '').toLowerCase()); else words.push(t.toLowerCase()); }
  return { users, words };
}
function slashSearch(c, q) { if (!q) return err('Type what to look for: /search words, /search @user, /search @user words'); searchWin(c, q); }
function searchWin(c, q) {
  const w = openWin('search', 'Search · ' + c.name, 'search', (w) => {
    if (w.built) return; w.built = true; w.body.innerHTML = chanHead(c) + `<input class="tw-q" id="sr-q" value="${esc(q)}" spellcheck="false" autocomplete="off" placeholder="words, @user, &quot;exact phrase&quot;"><div class="tw-cnt faint"></div><div class="tw-ul sr"></div><div class="btnrow"><button class="btn sm" id="sr-logs">Also search saved logs</button></div>`;
    const run = () => {
      const p = parseQuery($('#sr-q', w.body).value), pool = (c.chatlog || []).slice().reverse();
      const hit = pool.filter((x) => (!p.users.length || p.users.includes(x.login)) && p.words.every((t) => x.text.toLowerCase().includes(t)) && (p.users.length || p.words.length)).slice(0, 200);
      const hl = (s) => { let o = esc(s); p.words.forEach((t) => { if (t.length > 1) o = o.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;'), 'ig'), (x) => `<mark>${x}</mark>`); }); return o; };
      $('.sr', w.body).innerHTML = hit.map((x) => `<div class="tw-u sr-i" data-id="${esc(x.id || '')}"><span class="ts">${tmFmt(x.ts)}</span><b class="cv-n" data-l="${esc(x.login)}">${esc(x.name)}</b><span class="srt">${hl(x.text)}</span></div>`).join('') || `<div class="none">${p.users.length || p.words.length ? 'No matches in the messages YappyChat has seen since you opened this chat.' : 'Type something to look for.'}</div>`;
      $('.tw-cnt', w.body).textContent = hit.length ? `${hit.length}${hit.length === 200 ? '+' : ''} message${hit.length === 1 ? '' : 's'}` : '';
    };
    w.run = run; $('#sr-q', w.body).oninput = run;
    $('.sr', w.body).onclick = (e) => { const u = e.target.closest('.cv-n'); if (u) return openCard(c, u.dataset.l, u); const i = e.target.closest('.sr-i'); if (!i || !i.dataset.id) return; const node = c.msgs.get(i.dataset.id); if (node && node.isConnected) { setActive(c.login); node.scrollIntoView({ block: 'center' }); node.classList.add('flash'); c.stick = false; setTimeout(() => node.classList.remove('flash'), 2200); } };
    $('#sr-logs', w.body).onclick = async () => { const p = parseQuery($('#sr-q', w.body).value), term = p.words.join(' ') || p.users[0] || ''; if (term.length < 2) return err('Type at least two letters.'); const f = await cg.searchLogs(term); (f || []).slice(0, 200).forEach((x) => $('.sr', w.body).insertAdjacentHTML('beforeend', `<div class="tw-u sr-i"><span class="ts">${esc(x.d || '')}</span><span class="srt">${esc(x.line)}</span></div>`)); if (!(f || []).length) toast('Nothing in the saved logs.', { ms: 2500 }); };
    run();
  }, { reopen: true });
  if (w) { const i = $('#sr-q', w.body); if (i) { i.value = q; w.run && w.run(); i.focus(); } }
}
/* ===== Macros saved from a message ===== */
function saveMacroFrom(text) {
  const n = el('div', 'stack', `<h3>${ico('bolt', 16)} Save as a macro</h3><input id="sm-n" maxlength="30" placeholder="Name" value="${esc(text.replace(/\s+/g, ' ').slice(0, 22))}"><textarea id="sm-t" rows="3" maxlength="500">${esc(text)}</textarea><label class="row chk"><span>Send straight away when used (otherwise it fills the message box)</span>${sw('sm-s', false)}</label><div class="row"><button class="btn" id="sm-x">Cancel</button><button class="btn primary" id="sm-go">Save macro</button></div>`);
  modal(n); $('#sm-n', n).select(); $('#sm-x', n).onclick = closeModal;
  $('#sm-go', n).onclick = () => { const nm = $('#sm-n', n).value.trim(), t = $('#sm-t', n).value.trim(); if (!nm || !t) return err('Give the macro a name and a message.'); saveSettings({ macros: [...macros(), { n: nm, t, s: $('#sm-s', n).checked }] }); closeModal(); toast(`Macro "${nm}" saved. Find it under the lightning bolt.`, { ms: 3500 }); };
}
/* ===== Greeting a first-time chatter (Firsts tab) ===== */
function greetFirst(i, anchor) {
  const f = S.firsts[i], c = f && S.chats.get(f.c); if (!c) return; const g = (S.settings.greetings || []).filter(Boolean);
  if (!g.length) return toast('Add some greetings first in Settings > Saved messages.', { ms: 6000, action: { label: 'Open settings', fn: () => openSettings('Saved messages') } });
  const fill = (t) => t.replace(/\{user\}/gi, f.name).replace(/\{channel\}/gi, c.name);
  const go = (t) => { if (postChat(c, fill(t), { id: f.id, name: f.name, text: f.text, login: f.login })) { f.greeted = true; renderSideSoon(); toast(`Greeted ${f.name}`, { ms: 1800 }); } };
  if (g.length === 1) return go(g[0]);
  const n = el('div', 'stack', `<h3>Greet ${esc(f.name)}</h3>` + g.map((t, k) => `<button class="btn macroi" data-k="${k}"><b>${esc(fill(t).slice(0, 70))}</b></button>`).join('') + `<button class="btn" data-k="r">${ico('spark', 13)} Surprise me</button>`);
  popover(n, anchor, { toggle: true }); n.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closePop(); go(b.dataset.k === 'r' ? g[Math.floor(Math.random() * g.length)] : g[+b.dataset.k]); };
}
