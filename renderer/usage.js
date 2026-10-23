'use strict';
/* Anonymous usage statistics (Settings > Account > "Share anonymous usage statistics", on by default, can be switched off).
   Once a day YappyChat sends the supporter server a short list of settings and feature counts so the app can be improved.
   Never sent: chat messages, channel names, usernames, notes, tokens. The server stores it against an unreadable code, not a Twitch ID. */
(function () {
  const FEATURES = { toggleSearch: 'chatSearch', openNotes: 'notes', openPalette: 'palette', openGlobalSearch: 'globalSearch', openDash: 'dashboard', snapChat: 'snapChat', mvAdd: 'multiStream', openWhisper: 'whisper', pollWin: 'poll', predWin: 'prediction', usersWin: 'community', moreMenu: 'modMenu', openConvo: 'conversation', greetFirst: 'greet', saveLayout: 'layouts', startTour: 'tour', lockNow: 'lock', openSettings: 'settings', openVolume: 'volume' };
  const count = (f) => { S.settings.usage = S.settings.usage || {}; S.settings.usage[f] = Math.min(9999, (S.settings.usage[f] || 0) + 1); };
  // Count how often each feature is opened (kept on this computer until the next daily send, then cleared)
  Object.entries(FEATURES).forEach(([fn, name]) => { const f = window[fn]; if (typeof f !== 'function') return; window[fn] = function () { try { count(name); } catch (e) {} return f.apply(this, arguments); }; });
  if (window.Perks && Perks.openShop) { const o = Perks.openShop; Perks.openShop = function () { try { count('shop'); } catch (e) {} return o.apply(this, arguments); }; }
  const n = (a) => (Array.isArray(a) ? a.length : a && typeof a === 'object' ? Object.keys(a).length : 0);
  function snapshot() {
    const s = S.settings, p = s.pip || {}, me = S.me ? S.me.login : '', chats = [...S.chats.values()];
    return {
      theme: ['light', 'soft'].includes(s.theme) ? s.theme : 'dark', themePick: String(s.themePick || 'auto').replace(/[^\w-]/g, '').slice(0, 20),
      yappyShow: !!s.yappyShow, yappySuggest: !!s.yappySuggest, yappyNotify: s.yappyNotify !== false, yappyAnimate: s.yappyAnimate !== false,
      channels: chats.length, ownChannel: chats.some((c) => c.login === me), modChannels: chats.filter((c) => c.login !== me && isMod(c)).length, liveNow: chats.filter((c) => S.live.has(c.login)).length,
      split: !!s.split, splitStack: !!s.splitStack, sidebar: !!s.sidebar, pipOpen: !!p.open, pipExtra: n(p.extra), pipDock: String(p.dock || 'none'), compact: s.compact !== false, fontSize: +s.fontSize || 15,
      emoteSize: String(s.emoteSize || 'md'), modButtons: String(s.modButtons || 'always'), hoverKeys: !!s.hoverKeys, flyout: s.flyout !== false, bgChats: String(s.bgChats || 'open'), acEmotes: s.acEmotes !== false,
      streamerMode: !!s.streamer, logging: !!s.logging, history: s.history !== false, trackJoins: s.trackJoins !== false, startWin: !!s.startWin, closeAction: String(s.closeAction || 'quit'),
      notMod: !!s.notMod, cbMode: String(s.cbMode || 'off'), holidayTheme: s.holidayTheme !== false, liveNotify: !!s.liveNotify, lock: !!(window.hasLock && hasLock()),
      emotes7tv: !!s.emotes7tv, emotesBttv: !!s.emotesBttv, emotesFfz: !!s.emotesFfz, soundCooldown: +s.soundCooldown || 0, volume: Math.round((+s.volume || 0) * 10), soundsOn: Object.values(s.soundOn || {}).filter(Boolean).length,
      highlights: n(s.hl), watch: n(s.watch), macros: n(s.macros), announcements: n(s.announcements), layouts: n(s.layouts), notes: n(s.notes), banList: n(s.banList), chanColours: n(s.chanStyle)
    };
  }
  window.Usage = { snapshot, take: () => { const u = S.settings.usage || {}; return { ...u }; }, clear: () => saveSettings({ usage: {} }) };
})();
