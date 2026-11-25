'use strict';
// Lets a release be held back from the admin page ("Pause a release"). The updater no longer downloads by itself: when it finds a new version, the app first asks
// yappy.chat whether that version is on hold. If it is, nothing is downloaded or offered. If the site can't be reached, or says nothing, the update goes ahead as it
// always did, so a site outage can never block updates. An update that was already downloaded is checked again when "Update ready" is pressed.
function wire({ updater, getHold, sendUpdate, getLast, diag }) {
  updater.autoDownload = false;
  const held = async (v) => { try { const h = await getHold(); return !!h && String(h).trim() === String(v).trim(); } catch (e) { return false; } };
  updater.on('update-available', async (i) => {
    if (await held(i.version)) { diag && diag('update-held', i.version); sendUpdate('none'); return; }
    sendUpdate('available', { version: i.version });
    try { await updater.downloadUpdate(); } catch (e) { diag && diag('updater', 'download failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200)); }
  });
  return {
    // true when the app is restarting to install; false when the release has been put on hold since it downloaded
    async install() {
      const last = getLast && getLast();
      if (last && last.version && await held(last.version)) { sendUpdate('none'); return false; }
      updater.quitAndInstall(); return true;
    }
  };
}
module.exports = { wire };
