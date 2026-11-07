const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, Tray, Menu, nativeImage, powerMonitor, webContents } = require('electron');
// Keep the stream playing when you switch to another window or something covers YappyChat: Windows marks a covered window as hidden and the video player pauses itself.
// This only stops Chromium from treating the window as hidden. The player is still Twitch's own, unmodified.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const path = require('path');
const http = require('http');
const fs = require('fs');
// Only YappyChat's own page may use the bridge to this process (it holds the Twitch token). Every message is checked against the page that sent it,
// so a page that somehow got into the window (or a frame inside it) can't ask for anything.
const APP_PAGE = path.join(__dirname, 'renderer', 'index.html');
const samePage = (u) => { try { const x = new URL(u); return x.protocol === 'file:' && x.host === '' && path.normalize(decodeURIComponent(x.pathname).replace(/^\/([a-zA-Z]:)/, '$1')).toLowerCase() === path.normalize(APP_PAGE).toLowerCase(); } catch (e) { return false; } };
const fromApp = (e) => { try { if (e && !e.senderFrame) return !!(win && !win.isDestroyed() && e.sender === win.webContents); /* the page is closing: its last chat log still counts */ return !!(e && !e.senderFrame.parent && samePage(e.senderFrame.url)); } catch (x) { return false; } };
{ const h = ipcMain.handle.bind(ipcMain), o = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (ch, fn) => h(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('Not allowed'); return fn(e, ...a); });
  ipcMain.on = (ch, fn) => o(ch, (e, ...a) => { if (!fromApp(e)) return; return fn(e, ...a); }); }
// Settings > General > Graphics acceleration. Chromium must be told before the app is ready, so the saved choice is read here.
// "Off" is the fix for video that stutters or buffers on some graphics drivers; "On" (the default) is the normal, faster path.
try { if (JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).hwAccel === 'off') app.disableHardwareAcceleration(); } catch (e) {}

// twitchClientId is YappyChat's own Twitch application (a public client). People sign in with Twitch's device code flow, and the tokens refresh themselves.
const CONFIG = { githubOwner: 'yappychat', githubRepo: 'YappyChat', siteUrl: 'https://yappy.chat', twitchClientId: '4hdxox7qmaxxphoarccxb6yg79jr7i' };
let win, tray = null, quitting = false;

// Only one copy runs at a time. Starting it again brings the existing window back (useful when it is hiding in the tray).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit(); else app.on('second-instance', () => showWin());
function showWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); attention(false); }
// ----- Getting your attention: the taskbar button flashes with a coral dot, and the tray icon blinks, until you come back to the window -----
const dotIcon = () => { const w = 16, b = Buffer.alloc(w * w * 4); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 7.5, y - 7.5), a = d <= 6 ? 255 : d <= 7 ? Math.round(255 * (7 - d)) : 0, i = (y * w + x) * 4; b[i] = 0x66; b[i + 1] = 0x7a; b[i + 2] = 0xff; b[i + 3] = a; } return nativeImage.createFromBitmap(b, { width: w, height: w }); };
let flashOn = false, blinkT = 0, blinkState = false, trayBase = null, trayAlt = null;
function attention(on, why) {
  try {
    if (!win || win.isDestroyed()) return;
    if (!on) { if (!flashOn) return; flashOn = false; clearInterval(blinkT); blinkT = 0; win.flashFrame(false); try { win.setOverlayIcon(null, ''); } catch (e) {} if (tray && trayBase) { tray.setImage(trayBase); tray.setToolTip('YappyChat'); } return; }
    if (win.isVisible() && win.isFocused() && !win.isMinimized()) return; // you are looking at it already
    if (flashOn) return; flashOn = true;
    win.flashFrame(true);
    try { win.setOverlayIcon(dotIcon(), why || 'Something needs a look'); } catch (e) {}
    if (tray) { if (!trayAlt) trayAlt = dotIcon().resize({ width: 16, height: 16 }); tray.setToolTip('YappyChat: ' + (why || 'something needs a look')); clearInterval(blinkT); blinkT = setInterval(() => { blinkState = !blinkState; try { tray.setImage(blinkState ? trayAlt : trayBase); } catch (e) {} }, 700); }
  } catch (e) { diag('attention', e); }
}
ipcMain.on('notify:flash', (e, o) => attention(true, o && typeof o.why === 'string' ? o.why.slice(0, 60) : ''));
// Yappy's icon for the window, taskbar and tray. On Windows the .ico holds every size the taskbar and tray use at each display scaling
// (16 to 256 px), so Windows never has to stretch one; the .png is the fallback anywhere the .ico can't be read.
let appIconImg = null, appIconIco = false;
function appIcon() {
  if (appIconImg && !appIconImg.isEmpty()) return appIconImg;
  if (process.platform === 'win32') { try { const ico = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico')); if (!ico.isEmpty()) { appIconIco = true; return (appIconImg = ico); } } catch (e) {} }
  appIconIco = false; return (appIconImg = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')));
}
function ensureTray() {
  if (tray) return;
  const ic = appIcon(), img = trayBase = appIconIco ? ic : ic.resize({ width: 16, height: 16 }); // Windows picks the tray size from the .ico itself
  tray = new Tray(img); tray.setToolTip('YappyChat');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open YappyChat', click: showWin }, { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit(); } }]));
  tray.on('click', showWin);
}
app.on('before-quit', () => { quitting = true; });

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const logsDir = () => path.join(app.getPath('userData'), 'logs'); // %APPDATA%\YappyChat\logs

// ---------- Diagnostics: a small local log of errors and crashes (never tokens, never chat) ----------
// Anything that looks like a secret is cut out before it is written: OAuth tokens, "Bearer x", "oauth:x", client secrets and query-string tokens.
const HOME_RX = (() => { try { const h = require('os').homedir(); return h ? new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\|\//g, '[\\\\/]+'), 'gi') : /$^/; } catch (e) { return /$^/; } })();
const redact = (v) => String(v == null ? '' : v)
  .replace(/(oauth:|bearer\s+|OAuth\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
  .replace(/((?:access_token|refresh_token|token|code|client_secret|device_code)["']?\s*[=:]\s*["']?)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
  .replace(/\b[a-z0-9]{30}\b/g, '[redacted]') // Twitch access tokens are 30 lower-case letters and digits
  .replace(HOME_RX, '~').replace(/([A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+)[^\\/:*?"<>|\r\n]+/gi, '$1[user]') // the Windows user name (often a real name) never leaves the PC in a log or crash report
  .slice(0, 4000);
const diagFile = () => path.join(logsDir(), 'diagnostics.log');
function diag(kind, detail) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const f = diagFile(); try { if (fs.statSync(f).size > 1024 * 1024) fs.renameSync(f, f + '.old'); } catch (e) {}
    fs.appendFileSync(f, JSON.stringify({ t: new Date().toISOString(), v: app.getVersion(), kind, detail: redact(detail && detail.stack ? detail.stack : detail) }) + '\n');
  } catch (e) {}
}
// A crash report waits on disk and is sent at the next start (only when the person allows anonymous reports, see Settings > Account)
const pendingCrash = () => path.join(app.getPath('userData'), 'pending-crash.json');
function queueCrash(kind, err) {
  try { fs.writeFileSync(pendingCrash(), JSON.stringify({ kind, message: redact(err && err.message ? err.message : err).slice(0, 500), stack: redact(err && err.stack ? err.stack : '').slice(0, 3000), version: app.getVersion(), os: process.platform + ' ' + require('os').release(), electron: process.versions.electron, at: new Date().toISOString() })); } catch (e) {}
}
process.on('uncaughtException', (e) => {
  diag('main-uncaught', e); queueCrash('main', e);
  try { dialog.showErrorBox('YappyChat hit a problem', 'Something went wrong and YappyChat needs to close. Details were saved to the diagnostics log in your YappyChat logs folder.\n\nPlease open YappyChat again. If it keeps happening, use Settings > About > Send a report.'); } catch (x) {}
  app.exit(1);
});
process.on('unhandledRejection', (e) => diag('main-rejection', e));
app.on('render-process-gone', (e, wc, d) => { diag('renderer-gone', d && d.reason + ' ' + d.exitCode); if (d && d.reason !== 'clean-exit') queueCrash('renderer', { message: 'Window process ended: ' + d.reason + ' (' + d.exitCode + ')' }); });
app.on('child-process-gone', (e, d) => { if (d && d.reason !== 'clean-exit') diag('child-gone', d.type + ' ' + d.reason + ' ' + d.exitCode); });
async function sendPendingCrash() {
  const f = pendingCrash(); if (!fs.existsSync(f)) return;
  const st = load(); if (st.crashReports === false || !siteOn()) return; // switched off, or no site to send to: it stays on disk only
  try { const body = fs.readFileSync(f, 'utf8'); const r = await fetch(CONFIG.siteUrl + '/api/crash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10000) }); if (r.ok || r.status === 400) fs.rmSync(f, { force: true }); } catch (e) {}
}

// ---------- Settings: kept in memory, written atomically (a crash mid-write can never leave a half-written file) ----------
let settingsCache = null;
const load = () => {
  if (!settingsCache) {
    for (const f of [settingsFile(), settingsFile() + '.bak']) { try { settingsCache = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch (e) { if (e.code !== 'ENOENT') diag('settings-read', f + ': ' + e.message); } }
    if (!settingsCache || typeof settingsCache !== 'object') settingsCache = {};
  }
  return JSON.parse(JSON.stringify(settingsCache));
};
let saveT = 0;
function flushSettings() {
  clearTimeout(saveT); saveT = 0; if (!settingsCache) return;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const f = settingsFile(), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settingsCache)); // compact: the file is rewritten often and can hold a lot of notes
    try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch (e) {}
    fs.renameSync(tmp, f);
  } catch (e) { diag('settings-write', e); }
}
// Settings change often (dragging a divider, typing a note), so writes are gathered for a moment; the token is always written at once
const save = (s, now) => { settingsCache = s; if (now) return flushSettings(); if (!saveT) saveT = setTimeout(flushSettings, 400); };
app.on('will-quit', flushSettings);
// Name history. Twitch accounts keep the same ID when they change name, so the name last seen for each ID is kept in names.json.
// When an ID turns up with a new name, the old one is added to its history. Only IDs seen in chat are kept, and the least recently seen go first past 120,000.
const namesFile = () => path.join(app.getPath('userData'), 'names.json');
let names = null, namesT = 0;
const loadNames = () => { if (names) return names; try { names = JSON.parse(fs.readFileSync(namesFile(), 'utf8')); } catch (e) { names = {}; } if (!names.cur) names = { cur: {}, past: {} }; return names; };
function flushNames() {
  clearTimeout(namesT); namesT = 0; if (!names) return;
  try {
    const ids = Object.keys(names.cur); if (ids.length > 120000) { ids.sort((a, b) => names.cur[a][1] - names.cur[b][1]).slice(0, ids.length - 100000).forEach((id) => { delete names.cur[id]; delete names.past[id]; }); }
    const f = namesFile(), tmp = f + '.tmp'; fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(names)); fs.renameSync(tmp, f);
  } catch (e) { diag('names-write', e); }
}
app.on('will-quit', flushNames);
// Whispers. Twitch gives apps no whisper history, so YappyChat keeps the ones it sees in whispers.json, for the signed-in account only.
const whispersFile = () => path.join(app.getPath('userData'), 'whispers.json');
ipcMain.handle('whispers:load', (e, owner) => { try { const d = JSON.parse(fs.readFileSync(whispersFile(), 'utf8')); return d && d.owner === String(owner) && Array.isArray(d.threads) ? d.threads : []; } catch (x) { return []; } });
ipcMain.handle('whispers:save', (e, owner, threads) => {
  try {
    if (!/^\d{1,20}$/.test(String(owner)) || !Array.isArray(threads)) return false;
    const clean = threads.slice(0, 100).map((t) => ({ uid: String(t.uid).slice(0, 20), login: String(t.login || '').slice(0, 25), name: String(t.name || '').slice(0, 40), last: +t.last || 0,
      msgs: (Array.isArray(t.msgs) ? t.msgs : []).slice(-200).map((m) => ({ text: String(m.text || '').slice(0, 600), me: !!m.me, ts: +m.ts || 0 })) }));
    const f = whispersFile(), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ owner: String(owner), threads: clean })); fs.renameSync(tmp, f); return true;
  } catch (x) { diag('whispers-write', x); return false; }
});
ipcMain.handle('whispers:clear', () => { try { fs.rmSync(whispersFile(), { force: true }); } catch (x) {} return true; });
const DAY = (t) => Math.floor(t / 864e5);
ipcMain.handle('names:seen', (e, list) => {
  const n = loadNames(), now = Date.now(), changed = [];
  (Array.isArray(list) ? list : []).slice(0, 5000).forEach((x) => {
    const id = String((x && x[0]) || ''), login = String((x && x[1]) || '').toLowerCase(); if (!/^\d{1,20}$/.test(id) || !/^[a-z0-9_]{1,25}$/.test(login)) return;
    const cur = n.cur[id];
    if (cur && cur[0] !== login) { const past = n.past[id] || (n.past[id] = []); past.unshift([cur[0], cur[2] || cur[1] * 864e5, now]); past.length = Math.min(past.length, 10); changed.push({ id, from: cur[0], to: login, at: now }); }
    else if (cur && n.past[id] && n.past[id][0] && now - n.past[id][0][2] < 7 * 864e5) changed.push({ id, from: n.past[id][0][0], to: login, at: n.past[id][0][2] }); /* changed name this week: the app tags them again after a restart */
    n.cur[id] = [login, DAY(now), cur && cur[0] === login ? cur[2] || now : now];
  });
  if (!namesT) namesT = setTimeout(flushNames, 60000);
  return changed;
});
// For one account: its earlier names, newest first, with roughly when each was in use
ipcMain.handle('names:past', (e, id) => { const n = loadNames(); return (n.past[String(id)] || []).map(([login, from, until]) => ({ login, from, until })); });

// Windows paints the native title bar in your Windows accent colour (often teal or cyan). YappyChat draws its own bar instead, so it always
// matches the app: the top bar is the title bar and Windows only adds the minimise / maximise / close buttons over it (colours follow the theme).
const TB = { dark: { color: '#14171c', symbolColor: '#e9ecf1' }, light: { color: '#ffffff', symbolColor: '#171a20' } };
const TB_H = 46; /* one pixel short of the 47px top bar, so its bottom line runs under the window buttons too */
const startedHidden = process.argv.includes('--hidden');
function createWindow() {
  const st = load(), mode = st.theme === 'light' || st.theme === 'soft' ? 'light' : 'dark';
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 760, minHeight: 520, show: false,
    backgroundColor: st.theme === 'soft' ? '#b3bacb' : mode === 'light' ? '#f4f5f8' : '#0d0f13', icon: appIcon(), autoHideMenuBar: true, title: 'YappyChat',
    titleBarStyle: 'hidden', titleBarOverlay: { ...TB[mode], height: TB_H },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, spellcheck: true, devTools: !app.isPackaged } // the installed app has no developer tools: they would reach the Twitch token past the app lock
  });
  // The taskbar button: Windows shows the icon of the shortcut that matches YappyChat's app ID. Right after an update its icon cache can still point at
  // the old copy of YappyChat and show a blank icon, so the window also says outright which file holds its icon (YappyChat.exe itself) and sets it again
  // once it's on screen. The installer refreshes Windows' icon cache too (build/installer.nsh).
  if (process.platform === 'win32') { try { if (app.isPackaged) win.setAppDetails({ appId: 'com.yappychat.app', appIconPath: process.execPath, appIconIndex: 0, relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: 'YappyChat' }); } catch (e) { diag('app-details', e); } }
  win.once('show', () => { try { win.setIcon(appIcon()); } catch (e) {} });
  win.once('ready-to-show', () => { if (startedHidden && st.startWin && st.startHidden) { try { ensureTray(); } catch (e) { diag('tray', e); win.show(); } } else win.show(); });
  win.on('focus', () => { attention(false); win.webContents.send('win:focus', true); }); win.on('show', () => { if (win.isFocused()) attention(false); }); win.on('blur', () => win.webContents.send('win:focus', false));
  win.on('minimize', () => win.webContents.send('win:focus', false)); win.on('restore', () => win.webContents.send('win:focus', win.isFocused()));
  if (st.hideFromCapture) { try { win.setContentProtection(true); } catch (e) {} }
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (samePage(url)) return; e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }); // only YappyChat's own page: links go to the browser, and no other file can load in the window
  // The X button: quit, keep running in the tray, or (until you choose "Remember my choice") ask which
  let asking = false;
  const toTray = () => { ensureTray(); win.hide(); sendLock('hidden'); };
  win.on('close', (e) => {
    if (quitting) return; const a = load().closeAction;
    if (a === 'quit') return; e.preventDefault(); if (a === 'tray') return toTray();
    if (asking) return; asking = true;
    dialog.showMessageBox(win, { type: 'question', title: 'YappyChat', message: 'Close YappyChat, or keep it running in the tray?', detail: 'In the tray, chat, alerts and Yappy keep running. Click the tray icon to come back, or right-click it to quit.', buttons: ['Minimise to tray', 'Quit', 'Cancel'], defaultId: 0, cancelId: 2, noLink: true, checkboxLabel: 'Remember my choice (change it in Settings > General)' })
      .then((r) => { asking = false; if (r.response === 2) return; const v = r.response === 0 ? 'tray' : 'quit';
        if (r.checkboxChecked) { save({ ...load(), closeAction: v }, true); try { win.webContents.send('settings:patch', { closeAction: v }); } catch (x) {} }
        if (v === 'tray') toTray(); else { quitting = true; app.quit(); } })
      .catch(() => { asking = false; });
  });
  // Windows locking or sleeping tells the app, which locks itself if you asked it to
  const sendLock = (why) => { try { if (win && !win.isDestroyed()) win.webContents.send('sys:lock', why); } catch (e) {} };
  try { powerMonitor.on('lock-screen', () => sendLock('lock-screen')); powerMonitor.on('suspend', () => sendLock('suspend')); } catch (e) {}
  // Spell check: right-click a word with a red underline for suggestions. Only in text boxes, so YappyChat's own right-click menus are untouched.
  win.webContents.on('context-menu', (e, p) => {
    if (!p.isEditable || !p.misspelledWord) return;
    const items = (p.dictionarySuggestions || []).slice(0, 5).map((w) => ({ label: w, click: () => win.webContents.replaceMisspelling(w) }));
    if (!items.length) items.push({ label: 'No suggestions', enabled: false });
    items.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  // Streams pause while the window is in the tray, and notifications that piled up during sleep are folded into one
  const sendWin = (ch, v) => { try { if (win && !win.isDestroyed()) win.webContents.send(ch, v); } catch (e) {} };
  win.on('hide', () => sendWin('win:shown', false)); win.on('show', () => sendWin('win:shown', true));
  win.on('restore', () => sendWin('win:shown', win.isVisible())); // streams pause only in the tray; minimised to the taskbar they keep playing (you may be listening)
  ipcMain.removeHandler('win:isShown'); ipcMain.handle('win:isShown', () => !!(win && !win.isDestroyed() && win.isVisible()));
  try { powerMonitor.on('resume', () => sendWin('sys:wake', true)); } catch (e) {}
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('settings:get', () => { const s = load(); delete s.tokenEnc; return s; });
ipcMain.handle('settings:set', (e, patch) => {
  if (!patch || typeof patch !== 'object') return false;
  const p = { ...patch }; delete p.tokenEnc; // the page can never overwrite the stored login
  load(); save({ ...settingsCache, ...p }); return true; // a shallow merge: copying the whole file (notes, logs of mod actions…) on every small change would block the app
});

// ---------- The Twitch login, encrypted with Windows' DPAPI (safeStorage) ----------
// Stored as JSON: { a: access token, r: refresh token (device-code logins only), x: expiry ms, c: client id }. Older versions stored the bare access token.
function readTok() {
  const s = load(); if (!s.tokenEnc) return null;
  try { const t = safeStorage.decryptString(Buffer.from(s.tokenEnc, 'base64')); if (t[0] === '{') return JSON.parse(t); return { a: t }; } catch (e) { diag('token-read', 'could not decrypt the saved login'); return null; }
}
function writeTok(o) {
  const s = load();
  if (o && o.a) {
    if (!safeStorage.isEncryptionAvailable()) { diag('token-write', 'encryption unavailable'); return false; } // never fall back to plain text
    s.tokenEnc = safeStorage.encryptString(JSON.stringify(o)).toString('base64');
  } else { delete s.tokenEnc; } // the stream player keeps its own Twitch sign-in; only "Sign out of the stream player" or Start fresh removes it
  save(s, true); return true;
}
let refreshing = null, lastRenew = 'none'; // how the last renewal went: 'new', 'dead' (Twitch rejected the refresh token), 'error' (Twitch could not be reached), 'none' (nothing to renew with)
async function refreshTok(force) {
  const t = readTok(); if (!t || !t.r || !t.c) { lastRenew = t ? 'none' : 'dead'; return t ? t.a : null; }
  if (!force && t.x && t.x - Date.now() > 10 * 60000) return t.a;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: t.c, grant_type: 'refresh_token', refresh_token: t.r }), signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token) { writeTok({ a: j.access_token, r: j.refresh_token || t.r, x: Date.now() + (j.expires_in || 14400) * 1000, c: t.c }); lastRenew = 'new'; return j.access_token; }
      // Only an answer that says the refresh token itself is no good ends the login. Rate limits, a busy Twitch or a hiccup keep it, so the next try can work.
      if ((r.status === 400 || r.status === 401) && /invalid (refresh )?token|refresh token|invalid_grant/i.test(String(j.message || j.error || ''))) { diag('token-refresh', 'refresh token rejected (' + r.status + ')'); writeTok(null); lastRenew = 'dead'; return null; } // expired after 30 days unused, or revoked
      diag('token-refresh', 'Twitch did not renew the login (' + r.status + '), kept for the next try'); lastRenew = 'error'; return t.a;
    } catch (e) { diag('token-refresh', e.message); lastRenew = 'error'; return t.a; } finally { refreshing = null; }
  })();
  return refreshing;
}
ipcMain.handle('token:get', () => refreshTok(false));
ipcMain.handle('token:refresh', () => refreshTok(true));
ipcMain.handle('token:renew', async () => { const t = await refreshTok(true); return { token: t, state: lastRenew }; }); // the renewed login and whether Twitch rejected it or just could not be reached
ipcMain.handle('diag:note', (e, kind, detail) => diag(String(kind).slice(0, 40), String(detail).slice(0, 400)));
ipcMain.handle('token:set', (e, token) => writeTok(token ? { a: String(token) } : null));
ipcMain.handle('auth:mode', () => ({ device: !!CONFIG.twitchClientId, clientId: CONFIG.twitchClientId }));

// Device code login (when CONFIG.twitchClientId is set): Twitch's activation page (with the code already filled in) opens, the person presses
// Authorize, and the app receives the tokens.
let deviceRun = 0;
// inApp (the default): Twitch's activation page opens in a YappyChat window (see twitchWindow). You sign in once there and press Authorize,
// which logs YappyChat in and signs the stream player in at the same time. Without it, the page opens in the normal browser and signs in chat only.
let authWin = null;
ipcMain.handle('auth:show', () => { if (authWin && !authWin.isDestroyed()) { authWin.show(); authWin.focus(); return true; } return false; });
ipcMain.handle('auth:device', async (e, scopes, opts = {}) => {
  const cid = CONFIG.twitchClientId; if (!cid) return { error: 'This build has no YappyChat Client ID.' };
  const run = ++deviceRun; let closedEarly = false;
  const closeAuth = () => { const w = authWin; authWin = null; try { if (w && !w.isDestroyed()) w.close(); } catch (x) {} };
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/device', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, scopes: (scopes || []).join(' ') }), signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({})); if (!r.ok || !d.device_code) return { error: 'Twitch did not start the login. Please try again in a moment.' };
    // The link Twitch gives already holds the code, so the person only has to press Authorize on twitch.tv: in a YappyChat window (the default), or their browser.
    let uri = String(d.verification_uri || ''); if (/^https:\/\/(www\.)?twitch\.tv\//.test(uri) && !/device-code=/.test(uri)) uri += (uri.includes('?') ? '&' : '?') + 'device-code=' + encodeURIComponent(d.user_code);
        win && win.webContents.send('auth:code', { code: d.user_code, uri, expires: Date.now() + (d.expires_in || 1800) * 1000, inApp: !!opts.inApp });
    if (/^https:\/\/(www\.)?twitch\.tv\//.test(uri)) {
      if (opts.inApp) { closeAuth(); const w = authWin = twitchWindow(uri, 'log in to YappyChat'); w.on('closed', () => { if (authWin === w) { authWin = null; if (run === deviceRun) { closedEarly = true; deviceRun++; } } }); }
      else shell.openExternal(uri);
    }
    const until = Date.now() + (d.expires_in || 1800) * 1000; let wait = Math.max(5, d.interval || 5) * 1000;
    while (Date.now() < until) {
      await new Promise((ok) => setTimeout(ok, wait)); if (run !== deviceRun) { if (!closedEarly) closeAuth(); return { error: closedEarly ? 'The Twitch window was closed before you pressed Authorize.' : 'Login was cancelled.' }; }
      const t = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, scopes: (scopes || []).join(' '), device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }), signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!t) continue; // network blip: keep waiting
      const j = await t.json().catch(() => ({}));
      if (t.ok && j.access_token) { closeAuth(); if (!writeTok({ a: j.access_token, r: j.refresh_token, x: Date.now() + (j.expires_in || 14400) * 1000, c: cid })) return { error: 'Windows could not protect the login on this computer, so it was not saved.' }; return { token: j.access_token }; }
      const m = String(j.message || j.error || '').toLowerCase();
      if (m.includes('pending')) continue;
      if (m.includes('slow')) { wait += 5000; continue; }
      if (m.includes('denied')) { closeAuth(); return { error: 'Login was cancelled on the Twitch page.' }; }
      closeAuth(); return { error: 'The login code ran out or was already used. Press the button to get a new one.' };
    }
    closeAuth(); return { error: 'The login code ran out. Press the button to get a new one.' };
  } catch (x) { closeAuth(); diag('device-login', x); return { error: 'Could not reach Twitch. Check your internet connection and try again.' }; }
});
ipcMain.handle('auth:cancel', () => { deviceRun++; return true; });

// All web requests go through the main process (no CORS issues)
// The renderer may only talk to the services YappyChat uses (so a bug or a hostile chat message can never turn it into a general web proxy)
const HTTP_HOSTS = new Set(['api.twitch.tv', 'id.twitch.tv', 'recent-messages.robotty.de', 'api.betterttv.net', 'cdn.betterttv.net', 'api.frankerfacez.com', '7tv.io', 'cdn.7tv.app', 'raw.githubusercontent.com']);
const httpOk = (u) => { try { const x = new URL(u); if (x.protocol !== 'https:') return false; if (HTTP_HOSTS.has(x.hostname)) return true; const site = new URL(CONFIG.siteUrl); return site.hostname === x.hostname && !/YOUR_YAPPYCHAT_SITE/.test(CONFIG.siteUrl); } catch { return false; } };
const KEEP_HEADERS = ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after', 'etag'];
ipcMain.handle('http', async (e, o) => {
  const { url, method = 'GET', headers = {}, body, timeout } = o || {};
  if (!httpOk(url)) return { status: 0, error: 'blocked' };
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { status: 0, error: 'blocked' };
  try {
    const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(Math.min(Math.max(+timeout || 15000, 2000), 60000)) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    const h = {}; KEEP_HEADERS.forEach((k) => { const v = r.headers.get(k); if (v != null) h[k] = v; });
    return { status: r.status, json: j, headers: h };
  } catch (err) { const to = err && (err.name === 'TimeoutError' || err.name === 'AbortError'); return { status: 0, error: to ? 'timeout' : 'network' }; } // never the raw error: it can contain the address with its query string
});
// Errors from the page are written to the same diagnostics log (redacted)
ipcMain.on('diag:error', (e, o) => { diag('renderer', o && (o.stack || o.message) ? (o.message || '') + '\n' + (o.stack || '') : o); });
ipcMain.handle('diag:open', () => { fs.mkdirSync(logsDir(), { recursive: true }); return shell.showItemInFolder(diagFile()); });

// Chat logs: %APPDATA%\YappyChat\logs\<channel>\YYYY-MM-DD.log
// How much room they take, and (if you chose a limit in Settings > Chat) removing days older than that. Only YYYY-MM-DD.log files in channel folders are ever touched.
async function logFiles() { const out = []; try { for (const ch of await fs.promises.readdir(logsDir(), { withFileTypes: true })) { if (!ch.isDirectory() || !/^\w+$/.test(ch.name)) continue; const d = path.join(logsDir(), ch.name); for (const f of await fs.promises.readdir(d)) if (/^\d{4}-\d{2}-\d{2}\.log$/.test(f)) out.push({ p: path.join(d, f), day: f.slice(0, 10) }); } } catch (e) {} return out; }
ipcMain.handle('logs:size', async () => { let bytes = 0, files = 0; for (const f of await logFiles()) { try { bytes += (await fs.promises.stat(f.p)).size; files++; } catch (e) {} } return { bytes, files }; });
async function pruneLogs() { const keep = +load().logKeepDays || 0; if (!keep) return 0; const cut = new Date(Date.now() - keep * 864e5).toISOString().slice(0, 10); let n = 0; for (const f of await logFiles()) if (f.day < cut) { try { await fs.promises.unlink(f.p); n++; } catch (e) {} } return n; }
ipcMain.handle('logs:prune', () => pruneLogs());
app.whenReady().then(() => { setTimeout(() => pruneLogs().catch(() => {}), 90000); setInterval(() => pruneLogs().catch(() => {}), 12 * 3600 * 1000); });
ipcMain.on('log', (e, { channel, line }) => {
  if (!/^\w+$/.test(channel)) return;
  const d = path.join(logsDir(), channel);
  fs.mkdirSync(d, { recursive: true });
  fs.appendFile(path.join(d, new Date().toISOString().slice(0, 10) + '.log'), line + '\n', () => {});
});
const madeDirs = new Set();
ipcMain.on('log:batch', (e, batch) => {
  if (!Array.isArray(batch)) return; const day = new Date().toISOString().slice(0, 10);
  for (const b of batch.slice(0, 60)) {
    if (!b || !/^\w+$/.test(b.channel) || !Array.isArray(b.lines) || !b.lines.length) continue;
    const d = path.join(logsDir(), b.channel); if (!madeDirs.has(d)) { fs.mkdirSync(d, { recursive: true }); madeDirs.add(d); }
    fs.appendFile(path.join(d, day + '.log'), b.lines.slice(0, 2000).map((x) => String(x).slice(0, 1200)).join('\n') + '\n', () => {});
  }
});
// Search the saved chat logs (newest 30 days per channel), for the cross-channel search
// Everything one person said in one channel, from the saved chat logs (newest first). Used by the user card so /user shows their history like Twitch does.
// One person's lines in a channel's saved logs, newest first (up to 400). One pattern search over each day's file instead of splitting it into lines,
// days that are finished are remembered (they never change), and the search stops after a couple of seconds so a card never waits long.
const logUserCache = new Map();
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
ipcMain.handle('logs:user', async (e, channel, names) => {
  channel = String(channel || '').toLowerCase(); if (!/^\w+$/.test(channel)) return [];
  const want = [...new Set((Array.isArray(names) ? names : []).slice(0, 4).map((x) => String(x || '').toLowerCase()).filter((x) => x.length > 1))]; if (!want.length) return [];
  const re = new RegExp('^\\[(\\d\\d:\\d\\d:\\d\\d)\\] (?:' + want.map(reEsc).join('|') + '): (.*)$', 'gim'), key = want.join('|');
  const dir = path.join(logsDir(), channel), out = [], t0 = Date.now(), today = new Date().toISOString().slice(0, 10); let files = [];
  try { files = (await fs.promises.readdir(dir)).filter((f) => /^\d{4}-\d\d-\d\d\.log$/.test(f)).sort().reverse().slice(0, 90); } catch (x) { return []; }
  for (const f of files) {
    const ck = channel + '/' + f + '|' + key; let day = logUserCache.get(ck);
    if (!day) {
      day = [];
      try { const st = await fs.promises.stat(path.join(dir, f)); if (st.size <= 40 * 1024 * 1024) { const txt = await fs.promises.readFile(path.join(dir, f), 'utf8'); let m; re.lastIndex = 0; while ((m = re.exec(txt))) day.push({ d: f.slice(0, 10), t: m[1], text: m[2].replace(/\r$/, '') }); } } catch (x) {}
      if (f.slice(0, 10) < today) { logUserCache.set(ck, day); if (logUserCache.size > 3000) logUserCache.delete(logUserCache.keys().next().value); }
    }
    for (let i = day.length - 1; i >= 0 && out.length < 400; i--) out.push(day[i]);
    if (out.length >= 400 || Date.now() - t0 > 2500) break;
  }
  return out;
});
ipcMain.handle('logs:search', async (e, q) => {
  q = String(q || '').toLowerCase(); if (q.length < 2) return [];
  const out = []; let chans = []; try { chans = await fs.promises.readdir(logsDir()); } catch (x) { return []; }
  for (const ch of chans) {
    if (!/^\w+$/.test(ch)) continue; const dir = path.join(logsDir(), ch); let files = [];
    try { files = (await fs.promises.readdir(dir)).filter((f) => /^\d{4}-\d\d-\d\d\.log$/.test(f)).sort().reverse().slice(0, 30); } catch (x) { continue; }
    for (const f of files) {
      try { const st = await fs.promises.stat(path.join(dir, f)); if (st.size > 30 * 1024 * 1024) continue;
        const lines = (await fs.promises.readFile(path.join(dir, f), 'utf8')).split('\n');
        for (let i = lines.length - 1; i >= 0 && out.length < 600; i--) if (lines[i].toLowerCase().includes(q)) out.push({ c: ch, d: f.slice(0, 10), line: lines[i].slice(0, 300) });
      } catch (x) {}
    }
  }
  return out.sort((a, b) => (b.d + b.line.slice(0, 10)).localeCompare(a.d + a.line.slice(0, 10))).slice(0, 200);
});
ipcMain.handle('logs:open', () => { fs.mkdirSync(logsDir(), { recursive: true }); return shell.openPath(logsDir()); });

// Links from chat always open in the default browser (http/https only)
ipcMain.handle('open:external', (e, url) => (/^https?:\/\//i.test(String(url)) ? shell.openExternal(String(url)) : false));

// Custom notification sounds (kept small, stored in settings as a data URL)
ipcMain.handle('sound:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a sound', properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0], st = fs.statSync(f); if (st.size > 500 * 1024) return { error: 'That file is over 500 KB. Pick a shorter sound.' };
  const ext = path.extname(f).slice(1).toLowerCase(), mime = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' }[ext] || 'audio/mpeg';
  return { name: path.basename(f), dataUrl: `data:${mime};base64,` + fs.readFileSync(f).toString('base64') };
});

// Mod activity report (Settings-free: the Save report button in Mod activity). The renderer builds the CSV; this only asks where to save it.
ipcMain.handle('report:save', async (_e, o) => {
  const text = o && typeof o.text === 'string' ? o.text : '', name = String((o && o.name) || 'YappyChat-mod-report').replace(/[^\w.-]+/g, '-').slice(0, 80);
  if (!text || text.length > 5 * 1024 * 1024) return { error: 'There is nothing to save.' };
  const txt = o && o.ext === 'txt', r = await dialog.showSaveDialog(win, txt ? { title: 'Save the chat summary', defaultPath: name + '.txt', filters: [{ name: 'Text file', extensions: ['txt'] }] } : { title: 'Save the mod activity report', defaultPath: name + '.csv', filters: [{ name: 'Spreadsheet (CSV)', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  try { fs.writeFileSync(r.filePath, (txt ? '' : '\ufeff') + text); return { ok: true, name: path.basename(r.filePath) }; } catch (e) { return { error: 'Could not write that file.' }; }
});

// Back up and restore settings (Settings > Account). The login, the app lock and the window position are never in the file.
const NO_BACKUP = ['tokenEnc', 'lockHash', 'lockSalt', 'winBounds', 'bounds'];
ipcMain.handle('settings:export', async () => {
  const r = await dialog.showSaveDialog(win, { title: 'Save a backup of your YappyChat settings', defaultPath: `YappyChat-settings-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'YappyChat settings', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  const s = load(); NO_BACKUP.forEach((k) => delete s[k]);
  try { fs.writeFileSync(r.filePath, JSON.stringify({ yappychat: 1, saved: new Date().toISOString(), settings: s }, null, 1)); return { ok: true, name: path.basename(r.filePath) }; } catch (e) { return { error: 'Could not write that file.' }; }
});
ipcMain.handle('settings:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Load a YappyChat settings backup', properties: ['openFile'], filters: [{ name: 'YappyChat settings', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const f = r.filePaths[0]; if (fs.statSync(f).size > 20 * 1024 * 1024) return { error: 'That file is too big to be a YappyChat backup.' };
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (!j || j.yappychat !== 1 || !j.settings || typeof j.settings !== 'object' || Array.isArray(j.settings)) return { error: 'That is not a YappyChat settings backup.' };
    const cur = load(), keep = {}; NO_BACKUP.forEach((k) => { if (k in cur) keep[k] = cur[k]; });
    const inc = { ...j.settings }; NO_BACKUP.forEach((k) => delete inc[k]);
    save({ ...inc, ...keep }, true); return { ok: true };
  } catch (e) { return { error: 'Could not read that file.' }; }
});

ipcMain.handle('app:version', () => app.getVersion());
// What Chromium decided about video decoding on this PC (Settings > General > Check video decoding). Nothing here is sent anywhere.
ipcMain.handle('app:video', async () => {
  const out = { chromium: process.versions.chrome, electron: process.versions.electron, status: {}, devices: [] };
  try { const st = app.getGPUFeatureStatus(); out.status = { video_decode: st.video_decode, gpu_compositing: st.gpu_compositing, rasterization: st.rasterization }; } catch (e) {}
  try { const gi = await app.getGPUInfo('basic'); out.devices = (gi.gpuDevice || []).map((d) => ({ vendor: d.vendorId, device: d.deviceId, driver: d.driverVersion, active: !!d.active })); } catch (e) {}
  return out;
});
// Start fresh: erases the saved settings and login, clears the stream player's storage, then restarts as if newly installed (chat logs are kept)
ipcMain.handle('app:fresh', async () => {
  clearTimeout(saveT); saveT = 0; settingsCache = {}; for (const f of [settingsFile(), settingsFile() + '.bak', settingsFile() + '.tmp']) { try { fs.rmSync(f, { force: true }); } catch (e) {} }
  settingsCache = null; // flushSettings() does nothing without a cache, so the old settings cannot be written back on the way out
  try { const { session } = require('electron'); await Promise.all([session.defaultSession.clearStorageData(), session.fromPartition('persist:player').clearStorageData()]); } catch (e) {}
  quitting = true; app.relaunch(); app.exit(0); return true;
});
// Title bar colours follow the theme (light / dark)
ipcMain.on('titlebar:set', (e, o) => { try { const mode = o && o.mode === 'light' ? 'light' : 'dark'; const c = o && /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : TB[mode].color, sc = o && /^#[0-9a-f]{6}$/i.test(o.symbol || '') ? o.symbol : TB[mode].symbolColor; if (win && !win.isDestroyed() && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: c, symbolColor: sc, height: TB_H }); } catch (x) {} });
// Start with Windows (optionally straight into the tray)
ipcMain.handle('startup:get', () => { try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; } });
ipcMain.handle('startup:set', (e, o) => { try { app.setLoginItemSettings({ openAtLogin: !!(o && o.on), path: process.execPath, args: o && o.on && o.hidden ? ['--hidden'] : [] }); return true; } catch (x) { return false; } });
// Hide YappyChat's window from screen capture and screen sharing (so notes, whispers and mod tools never show on stream)
ipcMain.on('capture:hide', (e, on) => { try { if (win && !win.isDestroyed()) win.setContentProtection(!!on); } catch (x) {} });
// A mod's /alert: bring the window forward and flash the taskbar button until it is looked at
// The stream player is Twitch's own page in a frame inside our player webview, so only this side can reach it. Three fixed actions, nothing else:
// read whether it is muted or paused (so a channel switch keeps your sound), and pause or play it (the tray)
const PLAYER_JS = {
  state: '(() => { const v = document.querySelector("video"); return v ? { muted: v.muted || v.volume === 0, paused: v.paused } : null; })()',
  // Pausing for the tray holds: Twitch's player tends to start a live stream again by itself, so while held any attempt to play is stopped, and the sound is muted as a backstop.
  pause: '(() => { const v = document.querySelector("video"); if (!v) return false; window.__ycHold = true; if (!window.__ycHoldOn) { window.__ycHoldOn = 1; document.addEventListener("play", (e) => { if (window.__ycHold && e.target && e.target.pause) { e.target.pause(); } }, true); document.addEventListener("playing", (e) => { if (window.__ycHold && e.target && e.target.pause) e.target.pause(); }, true); } if (!v.muted && window.__ycMuted === undefined) { window.__ycMuted = false; v.muted = true; } else if (window.__ycMuted === undefined) window.__ycMuted = true; if (v.paused) return false; v.pause(); return true; })()',
  release: '(() => { window.__ycHold = false; const v = document.querySelector("video"); if (v && window.__ycMuted === false) v.muted = false; window.__ycMuted = undefined; return true; })()',
  play: '(() => { window.__ycHold = false; const v = document.querySelector("video"); if (v && window.__ycMuted === false) v.muted = false; window.__ycMuted = undefined; if (v) v.play().catch(() => {}); return true; })()'
};
ipcMain.handle('player:ctl', async (e, id, act) => {
  try { const wc = webContents.fromId(+id), code = PLAYER_JS[act]; if (!wc || !code || !win || wc.hostWebContents !== win.webContents) return null;
    const f = wc.mainFrame.framesInSubtree.find((fr) => /^https:\/\/player\.twitch\.tv\//.test(fr.url)); return f ? await f.executeJavaScript(code) : null; } catch (x) { return null; }
});
ipcMain.on('alert:flash', () => { try { if (!win || win.isDestroyed()) return; if (!win.isVisible()) showWin(); win.flashFrame(true); if (win.isMinimized()) win.restore(); } catch (x) {} });
ipcMain.on('alert:stop', () => { try { if (win && !win.isDestroyed()) win.flashFrame(false); } catch (x) {} });
// While a stream window is open the app must not slow itself down in the background (it would pause the video); otherwise it may
ipcMain.on('power:stream', (e, on) => { try { if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(!on); } catch (x) {} });

// Live updates: the installed app checks GitHub Releases, downloads in the background, then offers a restart
let updater = null, lastUpdate = null;
const sendUpdate = (state, extra = {}) => { lastUpdate = { state, at: Date.now(), ...extra }; if (win && !win.isDestroyed()) win.webContents.send('update', lastUpdate); };
// Asked by the window once it has loaded (an answer sent while the window was still starting would be lost), on launch, every few hours and when you come back to the app.
ipcMain.handle('update:check', () => { if (!updater) return sendUpdate('error', { message: 'Updates only work in the installed app.' }); if (lastUpdate && lastUpdate.state === 'downloaded') return sendUpdate('downloaded', { version: lastUpdate.version }); if (lastUpdate && lastUpdate.state === 'checking' && Date.now() - lastUpdate.at < 60000) return sendUpdate('checking'); /* the launch check is still running: the window was not ready to hear it start */ if (lastUpdate && (lastUpdate.state === 'none' || lastUpdate.state === 'available') && Date.now() - lastUpdate.at < 120000) return sendUpdate(lastUpdate.state, { version: lastUpdate.version }); /* the check that ran as the app started already answered */ return updater.checkForUpdates().catch(() => {}); });
ipcMain.handle('update:install', () => updater && updater.quitAndInstall());
function setupUpdater() {
  if (!app.isPackaged) return;
  updater = require('electron-updater').autoUpdater;
  updater.allowPrerelease = false; // only full releases: a GitHub pre-release never reaches people
  updater.autoInstallOnAppQuit = false; // an update downloads in the background and waits in the top bar; it installs only when you press Update ready · restart
  updater.on('checking-for-update', () => { if (!lastUpdate || !['available', 'downloaded'].includes(lastUpdate.state)) sendUpdate('checking'); });
  updater.on('update-available', (i) => sendUpdate('available', { version: i.version }));
  updater.on('update-not-available', () => sendUpdate('none'));
  updater.on('update-downloaded', (i) => sendUpdate('downloaded', { version: i.version }));
  updater.on('error', (e) => { diag('updater', String((e && e.message) || e).split('\nHeaders:')[0].slice(0, 400)); /* the server's response headers (cookies and the like) are left out */ sendUpdate('error', { message: 'The update could not be downloaded. YappyChat will try again later; you can keep using this version.' }); });
  const check = () => updater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 3 * 3600 * 1000);
}

// Stream window: a tiny local page (http://localhost) hosts Twitch's own, unmodified embed iframe with parent=localhost
let playerPort = 0;
function ensurePlayerServer() {
  return new Promise((resolve) => {
    if (playerPort) return resolve(playerPort);
    const srv = http.createServer((req, rsp) => {
      const u = new URL(req.url, 'http://localhost'), ch = u.searchParams.get('channel') || '', mu = u.searchParams.get('muted') === '1';
      if (u.pathname !== '/player' || !/^\w{3,25}$/.test(ch)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      rsp.end(`<!doctype html><html><body style="margin:0;background:#000;overflow:hidden"><iframe src="https://player.twitch.tv/?channel=${ch}&parent=localhost&muted=${mu}" style="border:0;position:fixed;inset:0;width:100%;height:100%" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>`);
    });
    srv.listen(0, 'localhost', () => { playerPort = srv.address().port; resolve(playerPort); });
  });
}

// ----- The stream player and Twitch sign-in -----
// Twitch skips ads for subscribers and Turbo users only when the player knows who is watching. The player lives in its own storage area (persist:player),
// so it needs its own Twitch sign-in, and the sign-in cookie must be allowed through to the embedded player (an embed is a "third party" to the page that holds it).
function setupPlayerSession() {
  const { session } = require('electron'), ps = session.fromPartition('persist:player');
  ps.webRequest.onHeadersReceived({ urls: ['https://*.twitch.tv/*', 'https://*.ttvnw.net/*', 'https://*.jtvnw.net/*'] }, (d, cb) => {
    const h = d.responseHeaders || {}, key = Object.keys(h).find((k) => k.toLowerCase() === 'set-cookie');
    // Twitch's own sign-in cookie must reach the embedded player (SameSite=None), and it must last: a cookie with no expiry date would be forgotten at every restart, which is why you were asked to sign in again
    if (key) h[key] = h[key].map((c) => { let x = c.replace(/;\s*SameSite=[^;]*/gi, ''); if (!/;\s*Secure/i.test(x)) x += '; Secure'; if (/^\s*(auth-token|persistent|login|name|unique_id|twilight-user|api_token|server_session_id)=/i.test(x) && !/;\s*(expires|max-age)=/i.test(x)) x += '; Max-Age=2592000'; return x + '; SameSite=None'; });
    cb({ responseHeaders: h });
  });
  // The player is plain Chromium as far as Twitch is concerned: the same browser identity as any other Chrome, so its ads and its own checks behave as they do in a normal browser
  try { ps.setUserAgent(ps.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ yappychat\/\S+/i, '')); } catch (e) {}
  return ps;
}
const playerSignedIn = async () => { try { const c = await require('electron').session.fromPartition('persist:player').cookies.get({ name: 'auth-token' }); return c.some((x) => /twitch\.tv$/i.test(x.domain)); } catch (e) { return false; } };
ipcMain.handle('player:status', () => playerSignedIn());
ipcMain.handle('player:signout', async () => { try { const ps = require('electron').session.fromPartition('persist:player'); await ps.clearStorageData({ origins: ['https://www.twitch.tv', 'https://player.twitch.tv', 'https://id.twitch.tv', 'https://passport.twitch.tv'] }); const cs = await ps.cookies.get({}); await Promise.all(cs.filter((c) => /twitch\.tv$/i.test(c.domain)).map((c) => ps.cookies.remove('https://' + c.domain.replace(/^\./, '') + (c.path || '/'), c.name))); } catch (e) {} return true; });
// Twitch's own pages in a YappyChat window, using the stream player's storage, so signing in here also signs the player in (Twitch skips ads for your subscriptions).
// No YappyChat code runs in it (no preload, sandboxed), it can only show https twitch.tv addresses, and its title bar always shows the address, like an address bar.
function twitchWindow(url, what) {
  const w = new BrowserWindow({ width: 520, height: 780, parent: win || undefined, title: `Twitch (www.twitch.tv): ${what}`, autoHideMenuBar: true, webPreferences: { partition: 'persist:player', nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const okHost = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)twitch\.tv$/i.test(x.hostname); } catch (e) { return false; } };
  w.webContents.setWindowOpenHandler(({ url: u }) => { if (okHost(u)) w.loadURL(u); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (ev, u) => { if (!okHost(u)) ev.preventDefault(); });
  w.on('page-title-updated', (e) => e.preventDefault());
  const showHost = (u) => { try { if (!w.isDestroyed()) w.setTitle(`Twitch (${new URL(u).hostname}): ${what}`); } catch (e) {} };
  w.webContents.on('did-navigate', (e, u) => showHost(u)); w.webContents.on('did-navigate-in-page', (e, u) => showHost(u));
  w.loadURL(url); return w;
}
let plWin = null;
ipcMain.handle('player:signin', () => new Promise((resolve) => {
  if (plWin && !plWin.isDestroyed()) { plWin.focus(); return resolve(false); }
  plWin = twitchWindow('https://www.twitch.tv/login', 'sign in for the stream player');
  // Once Twitch shows the signed-in site the job is done: close the window so the player can reload with the new sign-in
  let done = false; const finish = async () => { if (done) return; done = true; const okk = await playerSignedIn(); try { if (!plWin.isDestroyed()) plWin.close(); } catch (e) {} resolve(okk); };
  plWin.webContents.on('did-navigate', async (e, u) => { if (/^https:\/\/www\.twitch\.tv\/(?!login)/i.test(u) && await playerSignedIn()) setTimeout(finish, 600); });
  plWin.on('closed', async () => { plWin = null; if (!done) { done = true; resolve(await playerSignedIn()); } });
}));
const siteOn = () => /^https:\/\/[\w.-]+(:\d+)?$/.test(CONFIG.siteUrl) && !/YOUR_YAPPYCHAT_SITE/.test(CONFIG.siteUrl);
// Preferred: the HTTPS player page on the YappyChat site (parent = the site's domain, as Twitch requires). Fallback: the local page (parent=localhost).
ipcMain.handle('player:base', async () => ({ local: 'http://localhost:' + (await ensurePlayerServer()), hosted: siteOn() ? CONFIG.siteUrl : '' }));

// The stream window may only ever load that local player page
app.on('web-contents-created', (e, contents) => {
  contents.on('will-attach-webview', (ev, prefs, params) => {
    delete prefs.preload; delete prefs.preloadURL; prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true; prefs.webSecurity = true; prefs.autoplayPolicy = 'no-user-gesture-required'; prefs.backgroundThrottling = false;
    const src = String(params.src), okLocal = playerPort && src.startsWith('http://localhost:' + playerPort + '/player?'), okHost = siteOn() && src.startsWith(CONFIG.siteUrl + '/player?');
    if (!okLocal && !okHost) ev.preventDefault();
  });
  // Twitch's own player opens a window for its Clip button (and a few other things). Nothing opens inside YappyChat; pages on twitch.tv go to the normal browser, where Twitch's clip editor works
  if (contents.getType() === 'webview') contents.setWindowOpenHandler(({ url }) => { try { const u = new URL(url); if (u.protocol === 'https:' && /(^|\.)twitch\.tv$/i.test(u.hostname)) shell.openExternal(u.href); } catch (e) {} return { action: 'deny' }; });
});

app.setAppUserModelId('com.yappychat.app');
// Nothing in YappyChat or the stream player needs the camera, microphone, location or the like, so those requests are always refused.
function lockPermissions() {
  const { session } = require('electron'), ok = new Set(['fullscreen', 'notifications', 'clipboard-sanitized-write']);
  // The stream window also allows the few permissions Twitch's own player uses for video and its saved settings (never camera, microphone, location, screen or clipboard reading).
  const playerOk = new Set([...ok, 'mediaKeySystem', 'storage-access', 'top-level-storage-access', 'speaker-selection', 'pointerLock']), seen = new Set();
  const note = (kind, perm, wc) => { const k = kind + perm; if (seen.has(k)) return; seen.add(k); let h = ''; try { h = new URL(wc && wc.getURL ? wc.getURL() : '').host; } catch (e) {} diag('permission-' + kind, perm + (h ? ' (' + h + ')' : '')); };
  const pairs = [[session.defaultSession, ok], [session.fromPartition('persist:player'), playerOk]];
  for (const [ses, allow] of pairs) {
    ses.setPermissionRequestHandler((wc, perm, cb) => { const r = allow.has(perm); if (!r) note('refused', perm, wc); cb(r); });
    ses.setPermissionCheckHandler((wc, perm) => allow.has(perm));
  }
}
// Start with Windows: the choice is re-applied at every launch, so a moved or updated install never leaves a stale entry behind
function applyStartup() {
  if (!app.isPackaged) return;
  try { const s = load(); app.setLoginItemSettings({ openAtLogin: !!s.startWin, path: process.execPath, args: s.startWin && s.startHidden ? ['--hidden'] : [] }); } catch (e) { diag('startup', e); }
}
app.whenReady().then(() => { if (!gotLock) return; applyStartup(); lockPermissions(); setupPlayerSession(); createWindow(); setupUpdater(); setTimeout(sendPendingCrash, 20000); });
app.on('window-all-closed', () => app.quit());
