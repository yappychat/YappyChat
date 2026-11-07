'use strict';
/* ---------- Look & feel: colour mode, seasons, streamer mode ---------- */
const PALETTES = [['default', 'Default'], ['autumn', 'Autumn (Fall)'], ['winter', 'Winter'], ['summer', 'Summer'], ['spring', 'Spring'], ['ocean', 'Ocean blue'], ['cottoncandy', 'Cotton candy'], ['millennial', 'Millennial'], ['contrast', 'High contrast'], ['minimal', 'Minimal (flat and fast)']];
const palette = () => (PALETTES.some((x) => x[0] === S.settings.palette) ? S.settings.palette : 'default');
function applyTheme() {
  const r = document.documentElement, st = r.style, pal = palette(); r.dataset.theme = ['light', 'soft'].includes(S.settings.theme) ? S.settings.theme : 'dark'; r.dataset.palette = pal;
  st.setProperty('--fs', S.settings.fontSize + 'px'); st.setProperty('--gifl', String(Math.min(5, Math.max(2, +S.settings.gifLines || 4)))); st.setProperty('--emh', { sm: '1.45em', md: '1.9em', lg: '2.5em' }[S.settings.emoteSize] || '1.9em');
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
  if (key && !matchMedia('(prefers-reduced-motion: reduce)').matches) logoFx = Holiday.mountFx($('#brandFx'), key); // Windows' "show animations" off: no falling snow, leaves or fireworks
}
function applyStreamer() { document.body.classList.toggle('streamer', !!S.settings.streamer); }
// Focus: one switch for a busy stream. Yappy sits still, go-live and Yappy pop-ups wait in the rail, only urgent sounds play, name effects and message backgrounds stop moving
function applyFocus() { const on = !!S.settings.focus, b = $('#focusBtn'); document.body.classList.toggle('focus', on); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } if (on) { try { liveFloatHide(); } catch (e) {} } }
function toggleFocus(say) { saveSettings({ focus: !S.settings.focus }); applyFocus(); if (say) toast(S.settings.focus ? 'Focus on' : 'Focus off', { ms: 1800 }); }

/* ---------- Login / session ---------- */
async function boot() {
  S.settings = { ...DEF, ...(await cg.getSettings()) };
  if (!S.settings.animMig) { const m = { animMig: 1 }; if (S.settings.emoteAnim === 'stream') m.emoteAnim = 'on'; if (S.settings.calmStream === true) m.calmStream = false; saveSettings(m); } // 0.20.1: emotes and name effects keep moving while a stream is open (it used to freeze them)
  if (!S.settings.firstStream && (S.settings.tabs || []).length) saveSettings({ firstStream: 1 }); /* only a brand-new user's first chat opens its stream */
  if ((S.settings.railTools || []).some((k) => k === 'banned' || k === 'roles')) saveSettings({ railTools: S.settings.railTools.filter((k) => k !== 'banned' && k !== 'roles') }); /* now in the owner's chat header */
  if (!S.settings.railSplit) { S.settings.sideOrder = []; S.settings.railSplit = 1; saveSettings({ sideOrder: [], railSplit: 1 }); } /* 1.0: the rail starts again in its new order (chat, then moderation); you can still drag tabs within each group */
  ['sidePins', 'railTools', 'sideOrder'].forEach((k) => { const l = S.settings[k]; if (Array.isArray(l) && l.includes('modlog')) S.settings[k] = [...new Set(l.map((x) => (x === 'modlog' ? 'modact' : x)))]; }); // the Mod log is part of Mod activity now
  if (!S.settings.sessMig151) { S.settings.sessHide = true; S.settings.sessMig151 = true; try { cg.setSettings({ sessHide: true, sessMig151: true }); } catch (e) {} } // 0.15.1: the channel bar starts tidy (the session counters fold away; the arrow shows them)
  if (!S.settings.ynOff015) { S.settings.yappyNotify = false; S.settings.ynOff015 = true; try { cg.setSettings({ yappyNotify: false, ynOff015: true }); } catch (e) {} } // 0.15.0: Yappy's notices are off unless you switch them on
  if (Array.isArray(S.settings.highlights) && S.settings.highlights.length && !(S.settings.hl || []).length) saveSettings({ hl: S.settings.highlights.map((w) => ({ w, color: '#5b8cff', re: false, snd: true })) });
  S.settings.pip = { ...DEF.pip, ...S.settings.pip };
  compileHl(); applyTheme(); applyStreamer(); applyFocus(); syncVol(); renderBell(); dashInit(); applySecurity(); if (hasLock()) lockNow();
  Yappy.animate = S.settings.yappyAnimate !== false; Yappy.mount($('#loginYappy'), { follow: true }); dvdStart(); Yappy.mount($('#emptyYappy'), { follow: true }); $('#brandMark').innerHTML = '<img src="assets/yappy.png" alt="" width="24" height="24">'; /* a still logo: the Yappy who helps in chat is the one that moves */
  $('#brandBtn').onclick = (e) => brandMenu(e.currentTarget); $('#brandBtn').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); brandMenu(e.currentTarget); } };
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
  if (r.status === 401) { const rn = await renewLogin('check'); if (rn === 'later') return 'offline'; /* couldn't renew right now: keep the login and try again */ if (rn === 'ok') r = await cg.http({ url: 'https://id.twitch.tv/oauth2/validate', headers: { Authorization: 'OAuth ' + S.token } }); }
  if (r.status === 0 || r.status >= 500) return 'offline';
  if (r.status !== 200 || !r.json || !r.json.user_id) return 'invalid';
  if (requiredScopes().some((x) => !(r.json.scopes || []).includes(x))) return 'scopes';
  S.clientId = r.json.client_id; S.scopes = r.json.scopes || []; if (S.scopes.includes('user:write:chat')) S.noApiSend = false; S.me = { id: r.json.user_id, login: r.json.login };
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
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); try { Perks.hello(); } catch (e) {}
  try { authMode = (cg.authMode && (await cg.authMode())) || { device: false }; } catch (e) { authMode = { device: false }; }
  const st = $('#loginStatus'), btn = $('#twitchLogin'), say = (t) => { st.textContent = t || ''; };
  // Who you are decides what Twitch is asked for and how YappyChat is set up, so it's asked here, once, instead of a checkbox now and a question later
  const pre = USE_AS[S.settings.useAs] ? S.settings.useAs : S.settings.notMod ? 'viewer' : 'mod', rg = $('#loginRoles'); let role = pre;
  rg.innerHTML = Object.entries(USE_AS).map(([k, [l, i]]) => `<button type="button" class="role" role="radio" data-r="${k}">${ico(i, 20)}<span>${l}</span></button>`).join('');
  const pick = (k, focus) => { role = k; rg.querySelectorAll('.role').forEach((b) => { const on = b.dataset.r === k; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    $('#loginLead').textContent = { mod: 'A calmer way to moderate Twitch chat.', streamer: 'Your chat, alerts and stream tools in one calm place.', viewer: 'A calmer way to follow Twitch chat.' }[k] || 'Twitch chat, calmer.';
    $('#loginNote').textContent = `Twitch will ask for ${{ mod: 'chat and moderation', streamer: 'chat, moderation and your channel (ads, raids, polls, title)', viewer: 'chat only' }[k]}. Remove access any time in Twitch's Settings > Connections.`; };
  rg.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) pick(b.dataset.r); };
  rg.onkeydown = (e) => { const ks = Object.keys(USE_AS), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); pick(ks[(ks.indexOf(role) + d + ks.length) % ks.length], true); };
  pick(role);
  const done = async (tok) => {
    S.token = tok; const v = await validate();
    if (v === true) { say(''); const k = S.roleApply; S.roleApply = null; await start(); if (k) applyUseAs(k, true); return; } // a new or changed role sets up the buttons and rail once the app is open
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
    cg.onAuthCode((d) => { $('#dcBox').classList.remove('hidden'); $('#dcBox').classList.toggle('inapp', !!d.inApp); $('#dcCode').textContent = d.code;
      $('#dcLabel').textContent = d.inApp ? "Sign in on Twitch's page, then press Authorize." : 'Twitch opened in your browser. Press Authorize there.'; $('#dcOpen').textContent = d.inApp ? 'Show the Twitch window' : 'Open Twitch again';
      $('#dcOpen').onclick = () => (d.inApp && cg.showLogin ? cg.showLogin() : cg.openExternal(d.uri)); $('#dcCopy').onclick = () => { navigator.clipboard.writeText(d.code).then(() => toast('Code copied', { ms: 1500 })).catch(() => {}); }; say('Waiting for you to press Authorize on the Twitch page…'); });
  }
  $('#dcCancel').onclick = () => { if (cg.cancelLogin) cg.cancelLogin(); $('#dcBox').classList.add('hidden'); say('Login cancelled.'); };
  // Log in with Twitch: Twitch's page in a YappyChat window, which signs chat and the stream player in at once (so channels you subscribe to play
  // without ads). Use my browser instead: the same page in the normal browser, which signs in chat only.
  const go = async (inApp) => {
    if (loginBusy) return; // one login at a time: a double click must not open two Twitch windows
    const changed = role !== pre || !S.settings.useAs; S.roleApply = changed ? role : null; // signing in again with the same role keeps your own setup
    saveSettings({ notMod: role === 'viewer', loginBrowser: !inApp, ...(changed ? { useAs: role } : {}) }); applyTheme();
    loginBusy = true; btn.disabled = true; $('#loginBrowser').disabled = true; say(inApp ? 'Opening Twitch…' : 'Opening Twitch in your browser…');
    try {
      if (!authMode.device) return say('This copy of YappyChat has no Twitch app ID. Please reinstall it from yappy.chat.');
      const r = await cg.deviceLogin(loginScopes(), { inApp: !!inApp && !!cg.showLogin }); $('#dcBox').classList.add('hidden'); if (!r.token) return say(r.error || 'Login did not finish.'); return await done(r.token);
    } finally { loginBusy = false; btn.disabled = false; $('#loginBrowser').disabled = false; }
  };
  btn.onclick = () => go(true); $('#loginBrowser').onclick = () => go(false);
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
  loadGlobals().catch((e) => dbg('globals ' + e)); loadBlocks(); connect(); connectES(); renderSide(); initYappy(); S.statTimer = setInterval(softStats, 15000); S.jpTimer = setInterval(flushJP, 60000); S.feedTimer = setInterval(() => { if (pruneFeeds() && S.settings.sidebar) { if (['firsts', 'joins', 'modact'].some(sideShows)) renderSide(); else renderBell(); } }, 5000); S.annTimer = setInterval(annTick, 30000);
  try { S.playerBase = (await cg.playerBase()) || {}; } catch (e) { S.playerBase = {}; dbg('playerBase ' + e); } // the timers above must never wait on this
  Perks.load().then(() => Perks.refreshMine()).then(() => { applyHoliday(); }); Perks.ping(); S.perkTimer = setInterval(() => Perks.load().then(() => Perks.refreshMine()), 5 * 60000);
  S.loadingTabs = true; // the saved split view must not be cut down to the few chats that have loaded so far
  for (const t of (S.settings.tabs || []).slice(0, MAX_CHANNELS)) await addChannel(t, false);
  S.loadingTabs = false;
  const first = S.chats.has(S.settings.lastActive) ? S.settings.lastActive : S.chats.keys().next().value; if (first) setActive(first); else render();
  if (S.settings.streamsOnly && S.settings.split && S.settings.pip && S.settings.pip.open) { S.streamsOnly = true; applySplit(); } // you left it showing streams only
  loadMine().catch((e) => dbg('mine ' + e));
  // First run: straight to opening a chat (the tour is offered once one is open)
  if (!S.settings.tourDone) { if (S.settings.railText === undefined) saveSettings({ railText: true }); /* a new install shows the rail's names until you hide them */ resetLayout(true); if (S.chats.size) offerTour(); }
  // Twitch asks apps to keep chat only as long as it's useful, so a new install keeps chat logs for 90 days (Settings > Chat can say Always).
  // Only when there are no logs yet: an existing install keeps whatever it had, and nothing anyone saved is ever deleted by this.
  if (S.settings.logKeepDays === undefined && cg.logsSize) Promise.resolve().then(() => cg.logsSize()).then((r) => { if (r && !r.files && S.settings.logKeepDays === undefined) saveSettings({ logKeepDays: 90 }); }).catch(() => {});
  checkWhatsNew(); loadWhispers(); setTimeout(checkNotice, 4000); checkFlags(); setInterval(checkFlags, 15 * 60000);
  pollLive().then(announceLive); S.liveTimer = setInterval(pollLive, 60000); // after the tabs exist, so the first count includes them
}

/* ---------- Header and shortcuts ---------- */
$('#addTab').onclick = addChannelPrompt; $('#emptyAdd').onclick = addChannelPrompt; $('#emoteBtn').onclick = () => openPicker(); $('#macroBtn').onclick = (e) => openMacroMenu(e.currentTarget);
$('#settingsBtn').onclick = () => openSettings(); $('#volBtn').onclick = (e) => openVolume(e.currentTarget); syncVol();
$('#me').onclick = () => openSettings('Account');
$('#shopBtn').onclick = () => Perks.openShop();
$('#liveBtn').onclick = () => openLivePop(); renderLiveBtn();
$('#focusBtn').onclick = () => toggleFocus(); applyFocus();
$('#sideBtn').onclick = () => { saveSettings({ sidebar: !S.settings.sidebar, sideCollapsed: false }); renderSide(); };
$('#splitBtn').onclick = () => { saveSettings({ split: !S.settings.split }); if (S.settings.split) seedSplit(); applySplit(); $('#splitBtn').classList.toggle('on', S.settings.split); };
$('#suggestBtn').onclick = openFeedback; $('#logsBtn').onclick = () => cg.openLogs();
$('#cmdBtn').onclick = () => openPalette(); $('#layBtn').onclick = (e) => openLayouts(e.currentTarget); $('#layBtn').oncontextmenu = (e) => { e.preventDefault(); layoutBack(); };
$('#send').onclick = send;
// Narrow window: the less-used header buttons move into a "more" menu instead of squashing the tabs
const HDR_MORE = [['layBtn', 'layout', 'Window layouts'], ['logsBtn', 'file', 'Open chat logs folder'], ['cmdBtn', 'command', 'Command panel'], ['shopBtn', 'heart', 'Support Yappy'], ['suggestBtn', 'bulb', 'Suggest a feature']];
$('#hdrMore').onclick = (e) => {
  const a = e.currentTarget, n = el('div', 'stack moremenu hdrmenu', HDR_MORE.filter(([id]) => { const b = document.getElementById(id); return b && !b.offsetParent; }).map(([id, i, l]) => `<button class="btn macroi" data-h="${id}">${ico(i, 15)} ${l}</button>`).join(''));
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
  else if (e.code === 'Backquote' && !e.altKey) { // Ctrl+` and Ctrl+Shift+`: like Ctrl+Tab, but only through the chats on screen (the panes in split view)
    e.preventDefault(); const keys = tabOrder().filter((x) => x.shown).map((x) => x.login); if (keys.length < 2) return toast('Only one chat is on screen. Ctrl+Tab goes through every channel.', { ms: 2500 });
    const i = keys.indexOf(S.active), n = keys[(Math.max(i, 0) + (e.shiftKey ? keys.length - 1 : 1)) % keys.length]; setActive(n); }
  else if (k === 't' && e.shiftKey && (S.closed || []).length) { e.preventDefault(); const l = S.closed.shift(); addChannel(l).then((r) => r && r.error && err(r.error)); } // bring back the last tab you closed
  else if (extraKeys(e)) return;
  else if (k === ',') { e.preventDefault(); openSettings(); }
  else if ((k === '=' || k === '+') && !e.altKey) { e.preventDefault(); textSize(1); }
  else if ((k === '-' || k === '_') && !e.altKey) { e.preventDefault(); textSize(-1); }
  else if (k === '0' && !e.shiftKey && !e.altKey) { e.preventDefault(); textSize(0); }
  else if (k === 'a' && e.shiftKey) { e.preventDefault(); $('#sideBtn').click(); }
  else if (k === 'l' && e.shiftKey) { e.preventDefault(); openLayouts($('#layBtn')); }
  else if (k === 'e' && e.shiftKey) { e.preventDefault(); $('#splitBtn').click(); }
  else if (k === 'd' && e.shiftKey) { e.preventDefault(); toggleFocus(true); }
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

// Login screen: Yappy drifts around the background and bounces off the edges, like an old DVD player's screensaver, changing colour on each bounce.
// When he hits a corner (or as near as makes no difference) another Yappy joins, heading the other way, up to six of them.
// They only move while the login screen is showing and YappyChat is the focused window, and stay put when Windows asks for less motion.
const DVD_COLS = ['#ffc93c', '#ff6fa8', '#5ad1ff', '#3ee0b0', '#b983ff', '#ff8a3d'], DVD_MAX = 6, DVD_CORNER = 36;
let dvdRaf = 0, dvds = [];
function dvdAdd(x, y, vx, vy, ci) {
  const host = $('#lbDvds'); if (!host || dvds.length >= DVD_MAX) return;
  const box = el('div', 'lb-dvd' + (dvds.length ? ' new' : '')), y0 = el('div', 'lb-dvd-y'); box.append(y0); host.append(box);
  try { Yappy.mount(y0, { idle: false }); } catch (e) {}
  const d = { box, x, y, vx, vy, ci, calm: performance.now() + 1500 }; // calm: no new Yappy from this one for a moment
  box.style.setProperty('--dvdc', DVD_COLS[ci]); dvds.push(d);
  requestAnimationFrame(() => box.classList.remove('new')); return d;
}
function dvdStart() {
  const login = $('#login'); if (!login || dvdRaf) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches; let last = performance.now();
  if (!dvds.length) dvdAdd(120, 80, 1, 1, 0);
  const step = (now) => {
    if (login.classList.contains('hidden')) { dvdRaf = 0; return; } // signed in: the loop stops (it starts again if the login screen comes back)
    dvdRaf = requestAnimationFrame(step); const dt = Math.min(64, now - last); last = now;
    if (document.body.classList.contains('bg') || still) return;
    const sp = 0.07 * dt, born = [];
    dvds.forEach((d) => {
      const W = login.clientWidth - d.box.offsetWidth, H = login.clientHeight - d.box.offsetHeight; if (W <= 0 || H <= 0) return;
      d.x += d.vx * sp; d.y += d.vy * sp; let hx = false, hy = false;
      if (d.x <= 0 || d.x >= W) { d.vx = -d.vx; d.x = Math.max(0, Math.min(W, d.x)); hx = true; }
      if (d.y <= 0 || d.y >= H) { d.vy = -d.vy; d.y = Math.max(0, Math.min(H, d.y)); hy = true; }
      const nearX = d.x < DVD_CORNER || d.x > W - DVD_CORNER, nearY = d.y < DVD_CORNER || d.y > H - DVD_CORNER;
      if (((hx && nearY) || (hy && nearX)) && now > d.calm) { d.calm = now + 1500; born.push(d); } // a corner
      if (hx || hy) { d.ci = (d.ci + 1) % DVD_COLS.length; d.box.style.setProperty('--dvdc', DVD_COLS[d.ci]); }
      d.box.style.transform = `translate(${d.x}px,${d.y}px)`;
    });
    born.forEach((d) => { const a = (25 + Math.random() * 40) * Math.PI / 180, r = Math.SQRT2; dvdAdd(d.x, d.y, Math.sign(d.vx) * Math.cos(a) * r, Math.sign(d.vy) * Math.sin(a) * r, (d.ci + 3) % DVD_COLS.length); }); // the new one leaves the same corner at its own angle and the same speed, so they spread out
  };
  dvdRaf = requestAnimationFrame(step);
}
new MutationObserver(() => { const l = $('#login'); if (l && !l.classList.contains('hidden') && !dvdRaf) dvdStart(); }).observe($('#login'), { attributes: true, attributeFilter: ['class'] });

// The main process changed a setting (e.g. "Remember my choice" when closing the window): keep this window's copy the same
if (cg.onSettingsPatch) cg.onSettingsPatch((p) => { if (p && typeof p === 'object') Object.assign(S.settings, p); });
