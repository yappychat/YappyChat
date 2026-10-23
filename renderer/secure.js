'use strict';
/* ---------- Security: passcode lock, auto-lock, hide from screen capture, revoke on logout, permission list ---------- */
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
async function hashPass(pass, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 210000, hash: 'SHA-256' }, key, 256));
}
const hasLock = () => !!(S.settings.lockHash && S.settings.lockSalt);
let locked = false, idleT = 0, lastMove = Date.now(), fails = 0, lockedUntil = 0;
function securityPane(s) {
  return `<div class="sd">Your Twitch login is encrypted by Windows for your user account. These settings add further protection.</div>` +
    srow('App lock (passcode)', hasLock() ? 'YappyChat asks for your passcode when it starts and after the idle time below. The passcode is never stored, only a salted hash of it.' : 'Ask for a passcode when YappyChat starts or has been idle, so nobody can read your chats, notes and whispers or moderate as you if you walk away.', `<div class="row gap8">${hasLock() ? '<button class="btn" id="sec-lock">Lock now</button><button class="btn" id="sec-chg">Change</button><button class="btn danger" id="sec-off">Remove</button>' : '<button class="btn primary" id="sec-set">Set a passcode</button>'}</div>`) +
    (hasLock() ? srow('Lock after being idle for', 'No mouse or keyboard use in YappyChat for this long.', sel('lockMin', [[0, 'Never (only at start)'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']], s.lockMin || 0, true)) : '') +
    (hasLock() ? srow('Lock when Windows locks or sleeps', 'So it is never left open behind a locked computer.', sk('lockOnSleep', s.lockOnSleep !== false)) + srow('Lock when I send it to the tray', 'Closing the window to the tray locks it.', sk('lockOnHide', s.lockOnHide !== false)) : '') +
    srow('Hide YappyChat from screen sharing and recording', 'Your window appears black in OBS window captures, Discord screen share and screenshots, so notes, whispers and mod tools can not leak on stream. (You still see everything.)', sk('hideFromCapture', !!s.hideFromCapture)) +
    srow('Revoke my Twitch login when I log out', 'Logging out also tells Twitch to cancel the login token, instead of only forgetting it on this computer.', sk('revokeOnLogout', s.revokeOnLogout !== false)) +
    srow('Accept /alert messages from my moderators', 'A full-screen message from verified moderators of your channel. Only moderators can trigger it. Turn off if you do not stream.', sk('alertsOn', s.alertsOn !== false));
}
// The list of what YappyChat may do on your Twitch account (shown in Settings > About)
function permissionsPane() {
  const granted = S.scopes || [], row = (sc) => `<div class="srow"><div><div class="sl">${esc(SCOPE_WHY[sc] ? SCOPE_WHY[sc][0].toUpperCase() + SCOPE_WHY[sc].slice(1) : sc)}</div><div class="sd"><code>${esc(sc)}</code></div></div><span class="${granted.includes(sc) ? 'jtag in' : 'jtag out'}">${granted.includes(sc) ? 'Granted' : 'Not granted'}</span></div>`;
  return `<div class="sl" style="margin-top:18px">What YappyChat can do on your Twitch account</div><div class="sd">Everyday permissions are granted at login. Everything is asked for in one sign-in, so no tool has to ask again. Each permission is only used when you use that tool.</div>` +
    `<div class="srow"><div><div class="sl">Everyday permissions</div><div class="sd">${S.settings.notMod ? 'Read and send chat, the channels you follow, your emotes and whispers. (You told YappyChat you do not moderate, so no moderator permissions were asked for.)' : 'Read and send chat, moderate (bans, timeouts, deletes, warnings, AutoMod, Shield Mode, announcements), follower age, the channels you follow, your emotes and whispers.'}</div></div><span class="jtag in">Granted</span></div>` +
    OPTIONAL_SCOPES.filter((x) => SCOPE_WHY[x]).map(row).join('') +
    `<div class="btnrow" style="margin-top:12px"><button class="btn" id="sec-regrant">Grant all optional permissions</button><button class="btn" id="sec-minimal">Keep only the everyday permissions</button><button class="btn" id="sec-twitch">Review apps connected to my Twitch</button></div>` +
    `<div class="sd" style="margin-top:12px">You can disconnect YappyChat in your Twitch connections at any time. Local data (settings, notes, logs) is in %APPDATA%\YappyChat.</div>`;
}
function bindSecurity(n, section) {
  const on = (id, fn) => { const b = $(id, n); if (b) b.onclick = fn; };
  on('#sec-set', () => passDialog('Set a passcode', false)); on('#sec-chg', () => passDialog('Change the passcode', true)); on('#sec-off', () => passDialog('Remove the passcode', true, true)); on('#sec-lock', () => { closeModal(); lockNow(); });
  on('#sec-regrant', async () => { if (await regrant('all optional tools', OPTIONAL_SCOPES)) openSettings(section || 'About'); }); on('#sec-minimal', async () => { if (await regrant('only the everyday permissions', null, true)) openSettings(section || 'About'); }); on('#sec-twitch', () => openLink('https://www.twitch.tv/settings/connections'));
}
function passDialog(title, needOld, remove) {
  const n = el('div', 'stack', `<h3>${ico('lock', 18)} ${esc(title)}</h3>${needOld ? '<input id="pd-o" type="password" placeholder="Current passcode" autocomplete="off">' : ''}${remove ? '' : '<input id="pd-n" type="password" placeholder="New passcode (at least 6 characters)" autocomplete="off"><input id="pd-n2" type="password" placeholder="Repeat it" autocomplete="off">'}<div class="sd" id="pd-e"></div><div class="row"><button class="btn" id="pd-x">Cancel</button><button class="btn primary" id="pd-go">${remove ? 'Remove' : 'Save'}</button></div>`);
  modal(n); const msg = (t) => { $('#pd-e', n).textContent = t; }; (needOld ? $('#pd-o', n) : $('#pd-n', n)).focus(); $('#pd-x', n).onclick = () => openSettings('Security');
  const go = async () => {
    if (needOld && (await hashPass($('#pd-o', n).value, S.settings.lockSalt)) !== S.settings.lockHash) return msg('That is not the current passcode.');
    if (remove) { saveSettings({ lockHash: '', lockSalt: '', lockMin: 0 }); toast('Passcode removed', { ms: 2000 }); return openSettings('Security'); }
    const a = $('#pd-n', n).value, b = $('#pd-n2', n).value; if (a.length < 6) return msg('Use at least 6 characters.'); if (a !== b) return msg('The two passcodes do not match.');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))); saveSettings({ lockSalt: salt, lockHash: await hashPass(a, salt) }); toast('Passcode saved', { ms: 2000 }); openSettings('Security');
  };
  $('#pd-go', n).onclick = go; n.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
/* ----- The lock screen ----- */
function lockNow() {
  if (!hasLock() || locked) return; locked = true; closePop(); closeModal(); document.body.classList.add('locked');
  const ov = el('div', 'lockov', `<div class="lk-card"><div class="lk-y">${ico('yappy', 56)}</div><h2>YappyChat is locked</h2><input id="lk-p" type="password" placeholder="Passcode" autocomplete="off"><div class="sd" id="lk-e"></div><button class="btn primary" id="lk-go">Unlock</button><button class="btn ghost sm" id="lk-out">Forgot it? Log out</button></div>`); ov.id = 'lockOv'; document.body.append(ov);
  const p = $('#lk-p', ov), e = $('#lk-e', ov); p.focus();
  const go = async () => {
    const wait = lockedUntil - Date.now(); if (wait > 0) { e.textContent = `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds.`; return; }
    if ((await hashPass(p.value, S.settings.lockSalt)) === S.settings.lockHash) { fails = 0; locked = false; document.body.classList.remove('locked'); ov.remove(); lastMove = Date.now(); return; }
    fails++; p.value = ''; p.focus(); if (fails >= 5) { lockedUntil = Date.now() + Math.min(300, 15 * 2 ** (fails - 5)) * 1000; e.textContent = 'Too many tries. Wait a moment before the next one.'; } else e.textContent = 'That is not the passcode.';
  };
  $('#lk-go', ov).onclick = go; p.onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
  $('#lk-out', ov).onclick = async () => { if (!confirm('Log out of Twitch? You will need to log in again, and the lock is removed.')) return; saveSettings({ lockHash: '', lockSalt: '', lockMin: 0 }); locked = false; document.body.classList.remove('locked'); ov.remove(); logout(); };
}
['mousemove', 'keydown', 'pointerdown', 'wheel'].forEach((ev) => document.addEventListener(ev, () => { lastMove = Date.now(); }, { passive: true, capture: true }));
setInterval(() => { const m = +S.settings.lockMin || 0; if (m && hasLock() && !locked && S.me && Date.now() - lastMove > m * 60000) lockNow(); }, 15000);
// Windows locking or sleeping, or the window going to the tray, locks the app when asked to
try { cg.onLockEvent((why) => { if (!hasLock()) return; if (why === 'hidden' ? S.settings.lockOnHide !== false : S.settings.lockOnSleep !== false) lockNow(); }); } catch (e) {}
// The window-capture protection and the lock are applied as soon as settings are loaded
function applySecurity() { try { cg.hideFromCapture(!!S.settings.hideFromCapture); } catch (e) {} }
