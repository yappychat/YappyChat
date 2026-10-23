'use strict';
/* ---------- For streamers: /alert from your mods, and the streamer dashboard ---------- */
const ALERT_PREFIX = '[YappyChat alert] ';
let lastAlertSent = 0;
// A moderator types /alert message in your channel's chat: it goes to the streamer as a whisper that YappyChat turns into a full-screen message
async function sendAlert(c, msg) {
  if (!msg) return err('Type the message after the command: /alert chat is asking you to check the game audio');
  if (isOwner(c)) return err('/alert sends a message to the streamer. You are the streamer in this channel.');
  if (Date.now() - lastAlertSent < 8000) return err('Wait a few seconds before sending another alert.');
  const text = ALERT_PREFIX + msg.slice(0, 400);
  const r = await helix('whispers', { method: 'POST', query: { from_user_id: S.me.id, to_user_id: c.id }, body: { message: text } });
  if (!ok(r)) return toast(`The alert did not go through: ${apiErr(r)}. Twitch only delivers whispers between accounts that allow them.${r.status === 401 || r.status === 403 ? ' The streamer may need to allow whispers, and your account needs a verified phone number.' : ''}`, { type: 'err', ms: 10000 });
  lastAlertSent = Date.now(); toast(`Alert sent to ${c.name}`, { ms: 2500 });
  logAct(c, 'mode', `You sent an alert to the streamer: ${msg.slice(0, 80)}`);
}
async function senderIsMod(uid, login) {
  const mine = S.chats.get(S.me.login), u = mine && mine.users.get(login);
  if (u && (u.badges || []).some((b) => /^(moderator|broadcaster)\//.test(b))) return true;
  if (hasScope('moderation:read')) { const r = await helix('moderation/moderators', { query: { broadcaster_id: S.me.id, user_id: uid } }); return ok(r) && (r.json.data || []).length > 0; }
  return false;
}
const alertQ = [];
async function incomingAlert(uid, login, name, msg, original) {
  if (!(await senderIsMod(uid, login))) return addWhisper(uid, login, name, original, false, true); // anyone can whisper the prefix, so only your moderators get the big screen
  alertQ.push({ uid, login, name, msg, ts: Date.now() }); S.ylog.unshift({ ts: Date.now(), text: `${name} sent you an alert: ${msg.slice(0, 80)}`, c: '', result: '' }); bump('yappy');
  if (S.dash) { S.dash.alerts.unshift({ ts: Date.now(), from: name, msg: msg.slice(0, 200) }); S.dash.alerts.length = Math.min(S.dash.alerts.length, 20); }
  showAlert();
}
function showAlert() {
  let ov = $('#alertOv'); const a = alertQ[0]; if (!a) return;
  if (!ov) { ov = el('div', 'alertov', ''); ov.id = 'alertOv'; ov.setAttribute('role', 'alertdialog'); document.body.append(ov); }
  ov.innerHTML = `<div class="al-card"><div class="al-from">${ico('siren', 22)} Alert from <b>${esc(a.name)}</b> <span class="faint">${tmFmt(a.ts)}</span>${alertQ.length > 1 ? `<span class="al-more">+${alertQ.length - 1} more</span>` : ''}</div><div class="al-msg">${esc(a.msg)}</div><div class="row"><button class="btn" id="al-w">Whisper back</button><button class="btn primary" id="al-ok">Got it</button></div></div>`;
  $('#al-ok', ov).focus(); $('#al-ok', ov).onclick = dismissAlert;
  $('#al-w', ov).onclick = () => { const x = alertQ[0]; dismissAlert(); if (x) { saveSettings({ sidebar: true, sideCollapsed: false }); S.sideTab = 'whispers'; if (!S.whispers.has(x.uid)) S.whispers.set(x.uid, { uid: x.uid, login: x.login, name: x.name, msgs: [], last: Date.now() }); renderSide(); } };
  play('alert'); try { cg.alertFlash(); } catch (e) {} if (window.Yappy) Yappy.buzz(3000);
}
function dismissAlert() { alertQ.shift(); if (alertQ.length) return showAlert(); const ov = $('#alertOv'); if (ov) ov.remove(); try { cg.alertStop(); } catch (e) {} }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#alertOv')) { e.stopPropagation(); dismissAlert(); } }, true);

/* ===== Streamer dashboard ===== */
const MOD_LABEL = { ban: 'Bans', timeout: 'Timeouts', delete: 'Deleted messages', warn: 'Warnings', unban: 'Unbans', clear: 'Chat clears', mode: 'Chat setting changes' };
const newDash = (key, start) => ({ v: 1, key, start, msgs: 0, chatters: {}, firsts: 0, mods: {}, modBy: {}, viewers: [], buckets: {}, f0: null, f1: null, subs: null, alerts: [], live: true });
function dashInit() { const d = S.settings.dash; S.dash = d && d.v === 1 ? d : null; if (S.dash) S.dash.live = false; }
function dashMsg(c, m) {
  if (!m.hist && S.me && c.login === S.me.login) ownHour('m', m.ts);
  const d = S.dash; if (!d || !d.live || m.hist || !S.me || c.login !== S.me.login) return;
  d.msgs++; if (Object.keys(d.chatters).length < 3000 || d.chatters[m.login]) d.chatters[m.login] = (d.chatters[m.login] || 0) + 1; if (m.first) d.firsts++;
  const b = Math.floor(m.ts / 300000); d.buckets[b] = (d.buckets[b] || 0) + 1;
}
function dashMod(chan, kind, by) { if (S.me && chan === S.me.login && /^(ban|timeout|delete|warn)$/.test(kind)) ownHour('a'); const d = S.dash; if (!d || !d.live || !S.me || chan !== S.me.login) return; d.mods[kind] = (d.mods[kind] || 0) + 1; const k = by || 'You'; d.modBy[k] = (d.modBy[k] || 0) + 1; }
async function dashSample(v) {
  if (!S.me) return;
  if (v) {
    if (!S.dash || S.dash.key !== v.started) S.dash = newDash(v.started, Date.parse(v.started) || Date.now());
    const d = S.dash; d.live = true; d.viewers.push([Date.now(), v.viewers]); if (d.viewers.length > 1500) d.viewers.shift();
    const f = await helix('channels/followers', { query: { broadcaster_id: S.me.id, first: '1' } }); if (ok(f) && typeof f.json.total === 'number') { if (d.f0 === null) d.f0 = f.json.total; d.f1 = f.json.total; }
    if (hasScope('channel:read:subscriptions')) { const s = await helix('subscriptions', { query: { broadcaster_id: S.me.id, first: '1' } }); if (ok(s) && typeof s.json.total === 'number') d.subs = s.json.total; }
  } else if (S.dash) S.dash.live = false;
  if (S.dash) saveSettings({ dash: { ...S.dash } });
  if ($('#modals .dash')) drawDash();
}
const fmtN = (n) => (n == null ? '–' : Math.round(n).toLocaleString());
const fmtHM = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; };
const dashEnd = (d) => (d.live ? Date.now() : d.viewers.length ? d.viewers[d.viewers.length - 1][0] : Date.now());
function viewerChart(vs) {
  if (vs.length < 2) return `<div class="none">The graph starts once you have been live for a couple of minutes (YappyChat checks every minute while it is open).</div>`;
  const W = 900, H = 210, pl = 38, pr = 10, pt = 10, pb = 22, t0 = vs[0][0], t1 = vs[vs.length - 1][0], mx = Math.max(5, ...vs.map((x) => x[1])), top = Math.ceil((mx * 1.15) / 5) * 5;
  const X = (t) => pl + ((t - t0) / Math.max(1, t1 - t0)) * (W - pl - pr), Y = (v) => pt + (1 - v / top) * (H - pt - pb);
  const pts = vs.map((x) => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`), grid = [0, 0.5, 1].map((f) => { const v = Math.round(top * f), y = Y(v); return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="dg"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" class="dl">${v}</text>`; }).join('');
  const lab = [0, 0.5, 1].map((f) => { const t = t0 + (t1 - t0) * f; return `<text x="${X(t)}" y="${H - 5}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" class="dl">${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>`; }).join('');
  return `<div class="dwrap"><svg class="dchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Live viewers over time" data-t0="${t0}" data-t1="${t1}" data-top="${top}">${grid}${lab}<polygon points="${X(t0)},${Y(0)} ${pts.join(' ')} ${X(t1)},${Y(0)}" class="da"/><polyline points="${pts.join(' ')}" class="dline"/><g class="dhov hidden"><line class="dx" y1="${pt}" y2="${H - pb}"/><circle r="4.5" class="dd"/></g></svg><div class="dtip hidden"></div></div>`;
}
function chatBars(d) {
  const now = Math.floor(Date.now() / 300000), n = 24, vals = []; for (let i = n - 1; i >= 0; i--) vals.push([now - i, d.buckets[now - i] || 0]);
  const mx = Math.max(5, ...vals.map((x) => x[1])); return `<div class="dbars" role="img" aria-label="Chat messages per five minutes">${vals.map(([b, v]) => `<i style="height:${Math.max(2, (v / mx) * 100)}%" data-tip="${v} messages · ${new Date(b * 300000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"></i>`).join('')}</div><div class="dlab"><span>2 hours ago</span><span>now</span></div>`;
}
function dashDemo() {
  const t = Date.now(), v = []; for (let i = 0; i < 90; i++) v.push([t - (90 - i) * 60000, Math.round(140 + 70 * Math.sin(i / 9) + i * 1.4)]);
  const d = newDash('demo', t - 90 * 60000); d.live = true; d.viewers = v; d.msgs = 1840; d.firsts = 17; d.f0 = 1200; d.f1 = 1262; d.subs = 341;
  d.chatters = { bob: 120, alice: 96, kit: 71, zed: 55, mira: 41, dana: 30, oldie: 22, cat: 14 }; for (let i = 0; i < 24; i++) d.buckets[Math.floor(t / 300000) - i] = 25 + ((i * 17) % 70);
  d.mods = { delete: 31, timeout: 12, ban: 4, warn: 3, unban: 1 }; d.modBy = { You: 22, Kato: 19, Mina: 10 }; d.alerts = [{ ts: t - 600000, from: 'Kato', msg: 'Chat wants you to check the game audio' }]; return d;
}
// The weekly mod summary is the streamer's only: it is in the dashboard (your own channel), never shown to moderators of other channels
function ownHour(k, ts = Date.now()) {
  const oh = S.settings.ownHours || (S.settings.ownHours = {}), w = weekOf(ts), wk = oh[w] || (oh[w] = { m: Array(24).fill(0), a: Array(24).fill(0) });
  wk[k][new Date(ts).getHours()]++; const ks = Object.keys(oh).sort(); while (ks.length > 8) delete oh[ks.shift()];
  slow('ownHours', () => saveSettings({ ownHours: S.settings.ownHours }), 15000);
}
function weekCard() {
  if (!S.me) return ''; const weeks = [...new Set([...Object.keys((S.settings.shiftsC || {})), ...Object.keys(S.settings.ownHours || {})])].filter((w) => ((S.settings.shiftsC || {})[w] || {})[S.me.login] || (S.settings.ownHours || {})[w]).sort().reverse();
  const w = weeks.includes(S.dashWeek) ? S.dashWeek : weeks[0] || weekOf(), rows = weekRows(w, S.me.login).filter((r) => r.total), oh = (S.settings.ownHours || {})[w], max = oh ? Math.max(1, ...oh.m) : 1;
  const busiest = oh ? oh.m.map((v, h) => [h, v]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => hourName(h)) : [];
  return `<section class="dcard wide wkcard"><h4>Your mod team <span class="faint">week of</span> <select id="db-week">${(weeks.length ? weeks : [w]).map((x) => `<option value="${x}" ${x === w ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="grow"></span><button class="btn sm" id="db-thanks">Copy a thank-you</button></h4>` +
    `<div class="wkgrid"><div>${rows.length ? `<table class="shift"><tr><th>Moderator</th>${SHIFT_COLS.map(([k, l]) => `<th data-tip="${l}" aria-label="${l}">${ico(SHIFT_ICON[k], 15)}</th>`).join('')}<th data-tip="Total actions" aria-label="Total">&Sigma;</th></tr>${rows.map((r) => `<tr><td>${esc(r.mod)}</td>${SHIFT_COLS.map(([k]) => `<td>${r[k] || 0}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table>` : '<div class="none">No mod actions recorded in your channel this week. They are counted while YappyChat has your channel open.</div>'}</div>` +
    `<div><div class="faint">Chat by hour of day${busiest.length ? ` · busiest ${busiest.join(', ')}` : ''}</div><div class="hrbars" role="img" aria-label="Chat messages by hour">${Array.from({ length: 24 }, (_, h) => { const v = oh ? oh.m[h] : 0, a = oh ? oh.a[h] : 0; return `<i data-tip="${hourName(h)}: ${v.toLocaleString()} chats, ${a} mod actions"><u style="height:${Math.round((v / max) * 100)}%"></u></i>`; }).join('')}</div><div class="hrax"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div></div></div>` +
    `<div class="faint">Only you see this, in your own dashboard. Moderators of your channel do not get a weekly summary.</div></section>`;
}
const hourName = (h) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
function thanksText() {
  const w = S.dashWeek || weekOf(), rows = weekRows(w, S.me.login).filter((r) => r.total && r.mod !== S.me.login);
  if (!rows.length) return '';
  return `Big thanks to my mods this week: ${rows.map((r) => `@${r.mod} (${r.total} action${r.total === 1 ? '' : 's'})`).join(', ')}. You keep this chat a good place to hang out <3`;
}
function dashHtml() {
  const d = S.dashDemo || S.dash, own = S.dashDemo ? true : S.chats.has(S.me.login);
  if (!d) return weekCard() + `<div class="none">Nothing to show yet. It fills in as soon as you go live.${own ? '' : ' Add your own channel as a tab so chat can be counted too.'}</div><div class="row gap8">${own ? '' : `<button class="btn primary" id="db-add">Add my channel</button>`}<button class="btn" id="db-demo">${ico('eye', 14)} Preview with sample numbers</button></div>`;
  const vs = d.viewers, cur = vs.length ? vs[vs.length - 1][1] : 0, peak = vs.length ? Math.max(...vs.map((x) => x[1])) : 0, avg = vs.length ? vs.reduce((a, x) => a + x[1], 0) / vs.length : 0;
  const mins = Math.max(1, (dashEnd(d) - d.start) / 60000), chatters = Object.entries(d.chatters).sort((a, b) => b[1] - a[1]), modTotal = Object.values(d.mods).reduce((a, b) => a + b, 0);
  const tile = (l, v, s = '') => `<div class="dtile"><span>${l}</span><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
  const mk = Object.entries(d.mods).sort((a, b) => b[1] - a[1]), mmax = Math.max(1, ...mk.map((x) => x[1]));
  return (own ? '' : `<div class="tw-note">${ico('warn', 14)} <span>Your own channel is not open as a tab, so chat messages and mod actions are not being counted. <a href="#" id="db-add" class="lnk2x">Add it now</a></span></div>`) +
    `<div class="dtiles">${tile('Viewers now', fmtN(cur), d.live ? 'live' : 'offline')}${tile('Peak viewers', fmtN(peak))}${tile('Average viewers', fmtN(avg))}${tile('Chats this session', fmtN(d.msgs), (d.msgs / mins).toFixed(1) + ' per minute')}${tile('Different chatters', fmtN(chatters.length), d.firsts + ' first-timers')}${tile('New followers', d.f0 == null ? '–' : (d.f1 - d.f0 >= 0 ? '+' : '') + (d.f1 - d.f0), d.f1 == null ? '' : fmtN(d.f1) + ' total')}${tile('Mod actions', fmtN(modTotal), 'this session')}${d.subs != null ? tile('Subscribers', fmtN(d.subs)) : tile('Time live', fmtHM(dashEnd(d) - d.start))}</div>` +
    `<div class="dgrid"><section class="dcard wide"><h4>Live viewers</h4>${viewerChart(vs)}</section><section class="dcard"><h4>Chat activity <span class="faint">per 5 minutes</span></h4>${chatBars(d)}</section>` +
    `<section class="dcard"><h4>Mod actions</h4>${mk.length ? mk.map(([k, v]) => `<div class="dm"><span>${esc(MOD_LABEL[k] || k)}</span><i><u style="width:${Math.round((v / mmax) * 100)}%"></u></i><b>${v}</b></div>`).join('') : '<div class="none">No moderation actions yet.</div>'}${Object.keys(d.modBy).length ? `<div class="faint dby">By ${Object.entries(d.modBy).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</div>` : ''}</section>` +
    `<section class="dcard"><h4>Top chatters</h4>${chatters.slice(0, 8).map(([k, v], i) => `<div class="dm"><span>${i + 1}. ${esc(k)}</span><b>${v}</b></div>`).join('') || '<div class="none">Nobody has chatted yet.</div>'}</section>` +
    `<section class="dcard"><h4>Alerts from your mods</h4>${d.alerts.length ? d.alerts.slice(0, 5).map((a) => `<div class="dal"><b>${esc(a.from)}</b> <span class="faint">${tmFmt(a.ts)}</span><div>${esc(a.msg)}</div></div>`).join('') : '<div class="none">Mods can type /alert and a message in your chat to flash your screen.</div>'}</section>${S.dashDemo ? '' : weekCard()}</div>`;
}
function dashText() { const d = S.dashDemo ? null : S.dash; if (!d) return ''; const vs = d.viewers, peak = vs.length ? Math.max(...vs.map((x) => x[1])) : 0, avg = vs.length ? Math.round(vs.reduce((a, x) => a + x[1], 0) / vs.length) : 0; return `Stream recap: ${fmtHM(dashEnd(d) - d.start)} live · peak ${peak} viewers · average ${avg} · ${d.msgs} chats from ${Object.keys(d.chatters).length} people · ${d.f1 != null && d.f0 != null ? (d.f1 - d.f0) + ' new followers · ' : ''}${Object.values(d.mods).reduce((a, b) => a + b, 0)} mod actions`; }
function drawDash() {
  const n = $('#modals .dash'); if (!n) return; const body = $('.db-body', n); body.innerHTML = dashHtml();
  const d = S.dashDemo || S.dash; $('.db-foot', n).classList.toggle('hidden', !d); $('.db-state', n).innerHTML = S.dashDemo ? '<span class="livepill demo">SAMPLE</span> <span class="faint">not your real numbers</span> <button class="btn sm" id="db-undemo">Close preview</button>' : d && d.live ? '<span class="livepill">LIVE</span> ' + fmtHM(Date.now() - d.start) : '<span class="faint">Offline</span>';
  const dm = $('#db-demo', n); if (dm) dm.onclick = () => { S.dashDemo = dashDemo(); drawDash(); }; const ud = $('#db-undemo', n); if (ud) ud.onclick = () => { S.dashDemo = null; drawDash(); };
  const wsel = $('#db-week', n); if (wsel) wsel.onchange = () => { S.dashWeek = wsel.value; drawDash(); };
  const th = $('#db-thanks', n); if (th) th.onclick = () => { const t = thanksText(); if (!t) return toast('No mod actions from your moderators that week yet.', { ms: 2500 }); navigator.clipboard.writeText(t).then(() => toast('Thank-you copied. Paste it in your chat or Discord.', { ms: 2500 })); };
  const add = $('#db-add', n); if (add) add.onclick = (e) => { e.preventDefault(); closeModal(); addChannel(S.me.login); };
  const svg = $('.dchart', n), tip = $('.dtip', n); if (!svg || !d) return;
  const vs = d.viewers, t0 = +svg.dataset.t0, t1 = +svg.dataset.t1, top = +svg.dataset.top, hov = $('.dhov', svg), W = 900, H = 210, pl = 38, pr = 10, pt = 10, pb = 22;
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, t = t0 + ((x - pl) / (W - pl - pr)) * (t1 - t0); let best = vs[0]; vs.forEach((p) => { if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; });
    const cx = pl + ((best[0] - t0) / Math.max(1, t1 - t0)) * (W - pl - pr), cy = pt + (1 - best[1] / top) * (H - pt - pb); hov.classList.remove('hidden');
    $('.dx', hov).setAttribute('x1', cx); $('.dx', hov).setAttribute('x2', cx); $('.dd', hov).setAttribute('cx', cx); $('.dd', hov).setAttribute('cy', cy);
    tip.classList.remove('hidden'); tip.textContent = `${best[1]} viewers · ${new Date(best[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; tip.style.left = Math.min(r.width - 150, Math.max(0, (cx / W) * r.width - 60)) + 'px';
  };
  svg.onmouseleave = () => { hov.classList.add('hidden'); tip.classList.add('hidden'); };
}
function openDash() {
  const n = el('div', 'stack dash', `<div class="db-head"><h3>${ico('pulse', 18)} Streamer dashboard</h3><span class="db-state"></span><span class="grow"></span><button class="btn sm" id="db-copy">Copy recap</button><button class="btn sm danger" id="db-reset">Reset session</button><button class="ibtn" id="db-x" data-tip="Close">${ico('x', 15)}</button></div><div class="db-body"></div><div class="sd db-foot">Numbers are collected while YappyChat is open and you are live. Viewer counts come from Twitch once a minute.</div>`);
  S.dashDemo = null; modal(n); drawDash(); $('#db-x', n).onclick = () => { S.dashDemo = null; closeModal(); };
  $('#db-copy', n).onclick = () => { const t = dashText(); if (!t) return toast('Nothing to copy yet.', { ms: 2000 }); navigator.clipboard.writeText(t).then(() => toast('Recap copied', { ms: 2000 })); };
  $('#db-reset', n).onclick = () => { if (!confirm("Clear this session's numbers? The next check starts them again.")) return; S.dash = null; saveSettings({ dash: null }); drawDash(); };
  const t = setInterval(() => { if (!$('#modals .dash')) return clearInterval(t); drawDash(); }, 15000);
}
$('#dashBtn').onclick = openDash;
