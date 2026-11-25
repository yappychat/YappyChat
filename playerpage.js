// The stream player page, used by the app (http://localhost) and the website (https://yappy.chat/player).
// It shows Twitch's own player through Twitch's documented embed script (Twitch.Player), unmodified and full size.
// The app pauses and resumes it only through that script's own calls (pause, play, setMuted), from this page:
// nothing is ever run inside Twitch's player.
// Two identical copies: playerpage.js (app) and server/playerpage.js (website). server/test.js checks they match.
'use strict';
const ctl = `(function () {
  var box = document.getElementById('p'), ch = box.dataset.ch, parent = box.dataset.parent, muted = box.dataset.muted === '1';
  if (!window.Twitch || !Twitch.Player) { var f = document.createElement('iframe'); f.src = 'https://player.twitch.tv/?channel=' + ch + '&parent=' + parent + '&muted=' + muted; f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'; f.allowFullscreen = true; box.appendChild(f); return; }
  var P = new Twitch.Player('p', { channel: ch, parent: [parent], muted: muted, width: '100%', height: '100%' }), hold = false, wasMuted;
  // In the tray the stream stays paused: Twitch's player can start a live stream again by itself, so while held it is paused again (and muted as a backstop)
  P.addEventListener(Twitch.Player.PLAY, function () { if (hold) P.pause(); });
  window.ycCtl = function (a) {
    try {
      if (a === 'state') return { muted: P.getMuted() || P.getVolume() === 0, paused: P.isPaused() };
      if (a === 'pause') { var was = !P.isPaused(); hold = true; if (wasMuted === undefined) { wasMuted = P.getMuted(); P.setMuted(true); } P.pause(); return was; }
      if (a === 'release' || a === 'play') { hold = false; if (wasMuted === false) P.setMuted(false); wasMuted = undefined; if (a === 'play') P.play(); return true; }
    } catch (e) {}
    return null;
  };
})();`;
const hash = 'sha256-' + require('crypto').createHash('sha256').update(ctl).digest('base64');
// ch: 3-25 word characters, parent: a host name, both checked by the caller
function playerPage(ch, parent, muted) {
  return {
    csp: `default-src 'none'; script-src https://player.twitch.tv '${hash}'; frame-src https://player.twitch.tv; style-src 'unsafe-inline'; base-uri 'none'`,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>YappyChat player</title><style>html,body,#p{margin:0;height:100%;background:#000;overflow:hidden}#p iframe{border:0;width:100%;height:100%;display:block}</style></head><body><div id="p" data-ch="${ch}" data-parent="${parent}" data-muted="${muted ? 1 : 0}"></div><script src="https://player.twitch.tv/js/embed/v1.js"></script><script>${ctl}</script></body></html>`
  };
}
module.exports = { playerPage };
