'use strict';
// node tools/test-updatehold.js : the update-hold logic, with a pretend updater
const assert = require('assert'), EventEmitter = require('events'), { wire } = require('../updatehold');
const mk = (hold) => { const u = new EventEmitter(); u.downloads = 0; u.installs = 0; u.downloadUpdate = async () => { u.downloads++; }; u.quitAndInstall = () => { u.installs++; }; const sent = []; let last = null;
  const h = wire({ updater: u, sendUpdate: (s, x) => { last = { state: s, ...x }; sent.push(s); }, getLast: () => last, diag: () => {}, getHold: typeof hold === 'function' ? hold : async () => hold }); return { u, h, sent, setLast: (v) => { last = { state: 'downloaded', version: v }; } }; };
const tick = () => new Promise((r) => setImmediate(r));
(async () => {
  let t = mk(''); assert.equal(t.u.autoDownload, false);
  t.u.emit('update-available', { version: '1.0.2' }); await tick(); assert.deepEqual(t.sent, ['available']); assert.equal(t.u.downloads, 1);       // nothing held: downloads as before
  t = mk('1.0.2'); t.u.emit('update-available', { version: '1.0.2' }); await tick(); assert.deepEqual(t.sent, ['none']); assert.equal(t.u.downloads, 0); // held: nothing downloaded, nothing offered
  t = mk('1.0.2'); t.u.emit('update-available', { version: '1.0.3' }); await tick(); assert.equal(t.u.downloads, 1);                                  // a different version goes ahead
  t = mk(async () => { throw new Error('offline'); }); t.u.emit('update-available', { version: '1.0.2' }); await tick(); assert.equal(t.u.downloads, 1); // site unreachable: fail open
  t = mk(' 1.0.2 '); t.u.emit('update-available', { version: '1.0.2' }); await tick(); assert.equal(t.u.downloads, 0);                                   // stray spaces
  t = mk('1.0.2'); t.setLast('1.0.2'); assert.equal(await t.h.install(), false); assert.equal(t.u.installs, 0); assert.equal(t.sent.pop(), 'none');   // held after it downloaded
  t = mk(''); t.setLast('1.0.2'); assert.equal(await t.h.install(), true); assert.equal(t.u.installs, 1);
  t = mk('1.0.2'); t.u.downloadUpdate = async () => { throw new Error('boom'); }; t.u.emit('update-available', { version: '1.0.9' }); await tick(); await tick(); // a failed download is logged, never thrown
  console.log('update hold: ok');
})().catch((e) => { console.error(e); process.exit(1); });
