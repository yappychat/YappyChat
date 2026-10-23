'use strict';
/* ---------- Look & feel: colour mode, seasons, streamer mode ---------- */
const PALETTES = [['default', 'Default'], ['autumn', 'Autumn (Fall)'], ['winter', 'Winter'], ['summer', 'Summer'], ['spring', 'Spring'], ['ocean', 'Ocean blue'], ['cottoncandy', 'Cotton candy'], ['millennial', 'Millennial'], ['contrast', 'High contrast'], ['minimal', 'Minimal (flat and fast)']];
const palette = () => (PALETTES.some((x) => x[0] === S.settings.palette) ? S.settings.palette : 'default');
function applyTheme() {
  const r = document.documentElement, st = r.style, pal = palette(); r.dataset.theme = ['light', 'soft'].includes(S.settings.theme) ? S.settings.theme : 'dark'; r.dataset.palette = pal;
  st.setProperty('--fs', S.settings.fontSize + 'px'); st.setProperty('--emh', { sm: '1.45em', md: '1.9em', lg: '2.5em' }[S.settings.emoteSize] || '1.9em');
  r.classList.toggle('no-yappy-anim', S.settings.yappyAnimate === false || pal === 'minimal'); syncFocus(true); document.body.classList.toggle('compact', S.settings.compact !== false); document.body.classList.toggle('altrows', !!S.settings.altRows); document.body.classList.toggle('modright', S.settings.modSide === 'right'); document.body.classList.toggle('hidedel', S.settings.showDeleted === false); document.body.classList.toggle('minimal', pal === 'minimal');
  const cb = CB_MODES.includes(S.settings.cbMode) ? S.settings.cbMode : ''; if (cb) r.dataset.cb = cb; else delete r.dataset.cb; document.body.classList.toggle('cues', !!S.settings.cbCues);
  document.body.classList.toggle('nomod', !!S.settings.notMod);
  // The window's title bar (the Windows buttons) takes the colours of the top bar
  try { const cs = getComputedStyle(r), hex = (v) => { v = (cs.getPropertyValue(v) || '').trim(); if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((x) => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(v) ? v : ''; }; cg.titleBar && cg.titleBar({ mode: r.dataset.theme, color: hex('--panel'), symbol: hex('--text') }); } catch (e) {}
}
// Decorative animations pause while another window has the focus (Settings > Appearance > Save power in the background).
// The window's own focus state comes from the main process when available (it stays "focused" while you click into the stream player).
let winFocus = true, focusNative = false, lastBg = null;
function isBg() { if (document.hidden) return true; if (focusNative) return !winFocus; return !(document.hasFocus() || (document.activeElement && document.activeElement.tagName === 'WEBVIEW')); }
function syncFocus(force) {
  const bg = S.settings.pauseBlur !== false && isBg(); document.body.classList.toggle('bg', bg);
  if (bg === lastBg && !force) return; lastBg = bg;
  document.querySelectorAll('svg').forEach((v) => { try { if (bg) v.pauseAnimations(); else if (!v.dataset.off) v.unpauseAnimations(); } catch (e) {} });
}
addEventListener('blur', () => syncFocus()); addEventListener('focus', () => syncFocus()); document.addEventListener('visibilitychange', () => syncFocus());
try { if (cg.onFocus) { focusNative = true; cg.onFocus((on) => { winFocus = on; syncFocus(); }); } } catch (e) {}
setInterval(() => syncFocus(), 3000); // heals any missed focus event
let logoFx = null, fxKey = '';
function applyHoliday() {
  Perks.applyMsgBg();
  const s = S.settings, pal = palette(), minimal = pal === 'minimal', seasonal = Holiday.seasons.some((x) => x.id === pal), r = document.documentElement;
  const id = minimal ? null : Holiday.resolve(s.season || 'auto'); // minimal removes the flair: no outfits, no logo effects
  if (id && s.holidayTheme !== false && pal === 'default') r.dataset.holiday = id; else delete r.dataset.holiday; // a palette you picked yourself wins over the automatic holiday colours
  const mine = S.me ? Perks.describe(S.me.id) : null;
  const ps = mine && mine.eq.pskin ? Perks.partnerSkin(mine.eq.pskin) : '', pt = mine && mine.eq.ptheme ? Perks.partnerTheme(mine.eq.ptheme) : '';
  const sk = !minimal && mine && mine.skin ? mine.skin.id : '', flags = sk ? Holiday.skinFlags(sk) : {};
  const outfit = s.holidayYappy !== false && !(sk && Holiday.holidaySkin(sk)) ? (id ? Holiday.accessory(id) : seasonal ? Holiday.seasonAcc(pal) : '') : ''; // a holiday skin brings its own outfit
  Yappy.setAccessories({ holiday: outfit, skin: minimal ? '' : (sk ? Holiday.skin(sk) : '') + ps, back: sk ? Holiday.skinBack(sk) : '', love: !!flags.love || (!!id && id === 'valentines' && s.holidayYappy !== false), pink: !!flags.pink });
  if (pt && !minimal) { r.style.setProperty('--accent', pt); r.style.setProperty('--accent-t', pt + '26'); } else { r.style.removeProperty('--accent'); r.style.removeProperty('--accent-t'); }
  const key = minimal || s.holidayLogo === false ? '' : id || (seasonal ? pal : ''); if (key === fxKey) return; fxKey = key;
  if (logoFx) { logoFx.stop(); logoFx = null; } $('#brandFx').innerHTML = '';
  if (key) logoFx = Holiday.mountFx($('#brandFx'), key);
}
function applyStreamer() { document.body.classList.toggle('streamer', !!S.settings.streamer); }

/* ---------- Login / session ---------- */
async function boot() {
  S.settings = { ...DEF, ...(await cg.getSettings()) };
  ['sidePins', 'railTools', 'sideOrder'].forEach((k) => { const l = S.settings[k]; if (Array.isArray(l) && l.includes('modlog')) S.settings[k] = [...new Set(l.map((x) => (x === 'modlog' ? 'modact' : x)))]; }); // the Mod log is part of Mod activity now
  if (!S.settings.ynOff015) { S.settings.yappyNotify = false; S.settings.ynOff015 = true; try { cg.setSettings({ yappyNotify: false, ynOff015: true }); } catch (e) {} } // 0.15.0: Yappy's notices are off unless you switch them on
  if (Array.isArray(S.settings.highlights) && S.settings.highlights.length && !(S.settings.hl || []).length) saveSettings({ hl: S.settings.highlights.map((w) => ({ w, color: '#5b8cff', re: false, snd: true })) });
  S.settings.pip = { ...DEF.pip, ...S.settings.pip };
  compileHl(); applyTheme(); applyStreamer(); syncVol(); renderBell(); dashInit(); applySecurity(); if (hasLock()) lockNow();
  Yappy.animate = S.settings.yappyAnimate !== false; Yappy.mount($('#loginYappy'), { follow: true }); Yappy.mount($('#emptyYappy'), { follow: true }); Yappy.mount($('#brandMark'), { idle: false });
  applyHoliday();
  S.token = await cg.getToken();
  if (!S.token) return showLogin();
  let v = await validate();
  if (v === 'invalid') { await new Promise((ok) => setTimeout(ok, 2500)); v = await validate(); } // a single failed check is not the end of the login
  if (v === true) return start();
  if (v === 'offline') return showLogin('offline'); // no connection: keep the saved login and try again by itself
  if (v === 'scopes') toast('YappyChat needs a few new Twitch permissions. Please log in again.');
  showLogin();
}
// Twitch requires apps to check the login when they start and every hour after that, and to end the session if Twitch says it is no longer valid.
// Returns true, 'invalid' (logged out at Twitch, expired or revoked), 'scopes' (valid but missing a required permission) or 'offline' (could not ask).
async function validate() {
  let r = await cg.http({ url: 'https://id.twitch.tv/oauth2/validate', headers: { Authorization: 'OAuth ' + S.token } });
  if (r.status === 401 && cg.refreshToken) { const t = await cg.refreshToken().catch(() => null); if (t && t !== S.token) { S.token = t; r = await cg.http({ url: 'https://id.twitch.tv/oauth2/validate', headers: { Authorization: 'OAuth ' + S.token } }); } }
  if (r.status === 0 || r.status >= 500) return 'offline';
  if (r.status !== 200 || !r.json || !r.json.user_id) return 'invalid';
  if (requiredScopes().some((x) => !(r.json.scopes || []).includes(x))) return 'scopes';
  S.clientId = r.json.client_id; S.scopes = r.json.scopes || []; S.me = { id: r.json.user_id, login: r.json.login };
  saveSettings({ clientId: S.clientId }); S.validatedAt = Date.now(); return true;
}
// The hourly check while the app is open. A check that fails because of the network just waits for the next one.
setInterval(async () => {
  if (!S.me || !S.token || Date.now() - (S.validatedAt || 0) < 55 * 60000) return;
  let v = await validate();
  if (v === 'invalid') { await new Promise((ok) => setTimeout(ok, 45000)); v = await validate(); } // one more try before ending the session: a blip on Twitch's side must never log you out
  if (v === 'invalid') { err('Twitch says your login is no longer valid (it may have been revoked or changed). Please log in again.'); logout(true); }
}, 5 * 60000);
let authMode = { device: false };
let loginBusy = false;
async function showLogin(why) {
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  try { authMode = (cg.authMode && (await cg.authMode())) || { device: false }; } catch (e) { authMode = { device: false }; }
  const st = $('#loginStatus'), btn = $('#twitchLogin'), say = (t) => { st.textContent = t || ''; };
  $('#loginNotMod').checked = !!S.settings.notMod;
  const done = async (tok) => {
    S.token = tok; const v = await validate();
    if (v === true) { say(''); return start(); }
    say(v === 'offline' ? 'Logged in, but Twitch could not be reached to check it. Check your connection and press the button again.' : 'Twitch did not accept that login. Please try again.');
  };
  if (why === 'offline') {
    say('Could not reach Twitch. Your login is kept, and YappyChat will keep trying…');
    let tries = 0;
    const retry = async () => {
      if ($('#login').classList.contains('hidden')) return; // started some other way (the person logged in again meanwhile)
      const v = await validate(); if (v === true) return start();
      if (v === 'offline') { tries++; return setTimeout(retry, Math.min(60000, 5000 * 2 ** Math.min(tries, 4))); }
      say(v === 'scopes' ? 'YappyChat needs a few new Twitch permissions. Press the button to log in again.' : 'Your saved login has ended. Press the button to log in again.');
    };
    setTimeout(retry, 5000);
  }
  if (cg.onAuthCode && !showLogin.wired) {
    showLogin.wired = true;
    cg.onAuthCode((d) => { $('#dcBox').classList.remove('hidden'); $('#dcCode').textContent = d.code; $('#dcOpen').onclick = () => cg.openExternal(d.uri); $('#dcCopy').onclick = () => { navigator.clipboard.writeText(d.code).then(() => toast('Code copied', { ms: 1500 })).catch(() => {}); }; say('Waiting for you to press Authorize on the Twitch page…'); });
  }
  $('#dcCancel').onclick = () => { if (cg.cancelLogin) cg.cancelLogin(); $('#dcBox').classList.add('hidden'); say('Login cancelled.'); };
  btn.onclick = async () => {
    if (loginBusy) return; // one login at a time: a double click must not open two Twitch windows
    saveSettings({ notMod: $('#loginNotMod').checked }); applyTheme();
    loginBusy = true; btn.disabled = true; say('Opening Twitch…');
    try {
      if (!authMode.device) return say('This copy of YappyChat has no Twitch app ID. Please reinstall it from yappy.chat.');
      const r = await cg.deviceLogin(loginScopes()); $('#dcBox').classList.add('hidden'); if (!r.token) return say(r.error || 'Login did not finish.'); return await done(r.token);
    } finally { loginBusy = false; btn.disabled = false; }
  };
}
async function logout(skipRevoke) {
  const tok = S.token; alertQ.length = 0; const ao = $('#alertOv'); if (ao) ao.remove(); WINS.forEach((w, id) => closeWin(id)); S.dash = null;
  if (S.es) { S.es.onclose = null; S.es.close(); S.es = null; } clearInterval(esDog); S.esId = null; S.queue = []; S.unbans = []; S.mentions = []; S.firsts = []; clearInterval(S.liveTimer); clearInterval(S.statTimer); clearInterval(S.jpTimer); clearInterval(S.feedTimer); clearInterval(S.annTimer); S.links = []; S.annState = {}; clearInterval(S.perkTimer); S.jp = []; S.live = new Map(); S.liveBase = false; Yappy.setVisible(false);
  if (S.ws) { S.ws.onclose = null; S.ws.close(); S.ws = null; } clearInterval(ircPing); clearTimeout(S.retry); ircFails = 0;
  S.chats.forEach((c) => c.view.remove()); S.chats.clear(); S.active = null; S.token = null; S.sent = [];
  if (skipRevoke !== true && tok && S.settings.revokeOnLogout !== false && S.clientId) { try { await cg.http({ url: 'https://id.twitch.tv/oauth2/revoke', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(S.clientId)}&token=${encodeURIComponent(tok)}` }); } catch (e) {} }
  await cg.setToken(null); try { Perks.forgetMine(); } catch (e) {} S.me = null; S.scopes = []; closeLayer(); showLogin();
}
async function start() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  const u = await helix('users'), me = u.json && u.json.data && u.json.data[0];
  if (me) $('#me').innerHTML = `<img src="${esc(me.profile_image_url)}" alt=""><span class="mename">${esc(me.display_name)}</span>`;
  loadGlobals().catch((e) => dbg('globals ' + e)); connect(); connectES(); renderSide(); initYappy(); S.statTimer = setInterval(softStats, 15000); S.jpTimer = setInterval(flushJP, 60000); S.feedTimer = setInterval(() => { if (pruneFeeds() && S.settings.sidebar) { if (['firsts', 'joins', 'modact'].some(sideShows)) renderSide(); else renderBell(); } }, 5000); S.annTimer = setInterval(annTick, 30000);
  try { S.playerBase = (await cg.playerBase()) || {}; } catch (e) { S.playerBase = {}; dbg('playerBase ' + e); } // the timers above must never wait on this
  Perks.load().then(() => Perks.refreshMine()).then(() => { applyHoliday(); }); Perks.ping(); S.perkTimer = setInterval(() => Perks.load().then(() => Perks.refreshMine()), 5 * 60000);
  S.loadingTabs = true; // the saved split view must not be cut down to the few chats that have loaded so far
  for (const t of (S.settings.tabs || []).slice(0, MAX_CHANNELS)) await addChannel(t, false);
  S.loadingTabs = false;
  const first = S.chats.has(S.settings.lastActive) ? S.settings.lastActive : S.chats.keys().next().value; if (first) setActive(first); else render();
  loadMine().catch((e) => dbg('mine ' + e));
  if (!S.settings.tourDone) { resetLayout(true); setTimeout(() => (S.settings.useAs ? startTour() : askUseAs(startTour)), 1200); } checkWhatsNew(); setTimeout(checkNotice, 4000);
  pollLive().then(announceLive); S.liveTimer = setInterval(pollLive, 60000); // after the tabs exist, so the first count includes them
}

/* ---------- Header and shortcuts ---------- */
$('#brandBtn').onclick = () => Perks.openShop();
$('#addTab').onclick = addChannelPrompt; $('#emptyAdd').onclick = addChannelPrompt; $('#emoteBtn').onclick = () => openPicker(); $('#macroBtn').onclick = (e) => openMacroMenu(e.currentTarget);
$('#settingsBtn').onclick = () => openSettings(); $('#volBtn').onclick = (e) => openVolume(e.currentTarget); syncVol();
$('#me').onclick = () => openSettings('Account');
$('#shopBtn').onclick = () => Perks.openShop();
$('#sideBtn').onclick = () => { saveSettings({ sidebar: !S.settings.sidebar, sideCollapsed: false }); renderSide(); };
$('#splitBtn').onclick = () => { saveSettings({ split: !S.settings.split }); if (S.settings.split) seedSplit(); applySplit(); $('#splitBtn').classList.toggle('on', S.settings.split); };
$('#suggestBtn').onclick = openFeedback; $('#logsBtn').onclick = () => cg.openLogs();
$('#cmdBtn').onclick = () => openPalette(); $('#layBtn').onclick = (e) => openLayouts(e.currentTarget); $('#layBtn').oncontextmenu = (e) => { e.preventDefault(); layoutBack(); };
$('#send').onclick = send;
// Narrow window: the less-used header buttons move into a "more" menu instead of squashing the tabs
const HDR_MORE = [['layBtn', 'layout', 'Window layouts'], ['logsBtn', 'file', 'Open chat logs folder'], ['cmdBtn', 'command', 'Command panel'], ['shopBtn', 'heart', 'Supporter perks'], ['suggestBtn', 'bulb', 'Suggest a feature']];
$('#hdrMore').onclick = (e) => {
  const a = e.currentTarget, n = el('div', 'stack moremenu hdrmenu', HDR_MORE.map(([id, i, l]) => `<button class="btn macroi" data-h="${id}">${ico(i, 15)} ${l}</button>`).join(''));
  popover(n, a, { toggle: true });
  n.onclick = (ev) => { const b = ev.target.closest('[data-h]'); if (!b) return; closePop(); if (b.dataset.h === 'layBtn') return openLayouts(a); $('#' + b.dataset.h).click(); };
};
// Any click or key press: a scroll that follows it may be on purpose (a jump to a message), see the chat's onscroll
addEventListener('pointerdown', () => { S.uiAt = Date.now(); }, true); addEventListener('keydown', () => { S.uiAt = Date.now(); }, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (S.pop) return closePop(); if ($('#modals').firstChild) return closeModal(); if (S.replyTo) return setReply(cur(), null); }
  if (!(e.ctrlKey || e.metaKey) || !S.me) return; const k = e.key.toLowerCase();
  if (k === 'k') { e.preventDefault(); openSwitcher(); }
  else if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) { const t = tabOrder()[+e.key - 1]; if (t) { e.preventDefault(); setActive(t.login); } } // Ctrl+1 to Ctrl+9 jump to that tab, in the order the tabs are shown
  else if (e.key === 'Tab' && S.chats.size > 1) { e.preventDefault(); const keys = tabOrder().map((x) => x.login), i = keys.indexOf(S.active), n = keys[(i + (e.shiftKey ? keys.length - 1 : 1)) % keys.length]; setActive(n); } // Ctrl+Tab and Ctrl+Shift+Tab
  else if (k === 't' && e.shiftKey && (S.closed || []).length) { e.preventDefault(); const l = S.closed.shift(); addChannel(l).then((r) => r && r.error && err(r.error)); } // bring back the last tab you closed
  else if (extraKeys(e)) return;
  else if (k === ',') { e.preventDefault(); openSettings(); }
  else if ((k === '=' || k === '+') && !e.altKey) { e.preventDefault(); textSize(1); }
  else if ((k === '-' || k === '_') && !e.altKey) { e.preventDefault(); textSize(-1); }
  else if (k === '0' && !e.shiftKey && !e.altKey) { e.preventDefault(); textSize(0); }
  else if (k === 'a' && e.shiftKey) { e.preventDefault(); $('#sideBtn').click(); }
  else if (k === 'l' && e.shiftKey) { e.preventDefault(); openLayouts($('#layBtn')); }
  else if (k === 'e' && e.shiftKey) { e.preventDefault(); $('#splitBtn').click(); }
  else if (k === 'f' && cur() && !e.shiftKey) { e.preventDefault(); toggleSearch(cur()); }
  else if (k === 's' && e.shiftKey) { e.preventDefault(); saveSettings({ streamer: !S.settings.streamer }); applyStreamer(); toast('Streamer mode ' + (S.settings.streamer ? 'on' : 'off'), { ms: 2000 }); }
});
document.querySelectorAll('[data-ico]').forEach((b) => { b.innerHTML = ico(b.dataset.ico, b.id === 'emoteBtn' ? 22 : 18); });
boot().then(() => $('#splitBtn').classList.toggle('on', !!S.settings.split));

// Text on accent-coloured buttons: white when it is readable on this theme's accent (WCAG 4.5:1), otherwise near-black
(function onAccent() {
  const lum = (hex) => { const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return null; return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
  let last = '';
  const sync = () => { const a = getComputedStyle(document.body).getPropertyValue('--accent').trim(); if (a === last) return; last = a; const L = lum(a); if (L == null) return; document.body.style.setProperty('--on-accent', 1.05 / (L + 0.05) >= 4.5 ? '#fff' : '#10131a'); };
  sync(); new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] }); new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
})();
