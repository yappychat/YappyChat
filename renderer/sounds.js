(function () {
  'use strict';
  // Synthesised tones: [frequency Hz, start s, length s, wave, optional end frequency]
  const T = {
    ping: [[880, 0, .12]], chime: [[660, 0, .14], [990, .14, .26]], pop: [[420, 0, .05], [640, .05, .09]], bell: [[1175, 0, .6, 'triangle']], blip: [[760, 0, .07], [1010, .07, .1]], soft: [[520, 0, .12], [700, .12, .12]],
    coin: [[988, 0, .07, 'square'], [1319, .07, .28, 'square']],
    levelup: [[523, 0, .09, 'triangle'], [659, .09, .09, 'triangle'], [784, .18, .09, 'triangle'], [1047, .27, .3, 'triangle']],
    drop: [[900, 0, .22, 'sine', 220]], laser: [[1400, 0, .18, 'sawtooth', 300]], whistle: [[700, 0, .28, 'sine', 1500]],
    harp: [[392, 0, .35, 'triangle'], [494, .06, .35, 'triangle'], [587, .12, .35, 'triangle'], [784, .18, .45, 'triangle']],
    alert: [[880, 0, .1, 'square'], [660, .14, .1, 'square'], [880, .28, .1, 'square']],
    knock: [[140, 0, .07, 'sine', 70], [140, .13, .07, 'sine', 70]],
    sparkle: [[1568, 0, .06], [2093, .05, .06], [1760, .1, .06], [2637, .15, .12]],
    marimba: [[523, 0, .18, 'triangle'], [659, .12, .18, 'triangle'], [523, .24, .3, 'triangle']],
    hello: [[587, 0, .1], [784, .11, .1], [988, .22, .22]],
    power: [[392, 0, .07, 'square'], [523, .07, .07, 'square'], [659, .14, .07, 'square'], [784, .21, .07, 'square'], [1047, .28, .25, 'square']],
    jump: [[300, 0, .22, 'square', 900]], powerdown: [[900, 0, .35, 'square', 150]], blast: [[200, 0, .25, 'sawtooth', 40], [900, 0, .12, 'square', 120]],
    musicbox: [[1047, 0, .25, 'triangle'], [1319, .15, .25, 'triangle'], [1568, .3, .25, 'triangle'], [1319, .45, .4, 'triangle']],
    raindrop: [[1500, 0, .08, 'sine', 700], [1200, .12, .08, 'sine', 600], [1700, .22, .1, 'sine', 800]],
    lullaby: [[392, 0, .3, 'sine'], [330, .3, .3, 'sine'], [262, .6, .5, 'sine']], windchime: [[1568, 0, .5, 'triangle'], [2093, .1, .5, 'triangle'], [1760, .22, .5, 'triangle'], [2349, .34, .6, 'triangle']],
    creak: [[110, 0, .5, 'sawtooth', 220], [180, .35, .4, 'sawtooth', 90]], flutter: [[1800, 0, .06, 'square', 900], [1700, .07, .06, 'square', 800], [1900, .14, .06, 'square', 950], [1600, .21, .1, 'square', 700]],
    ghost: [[300, 0, .5, 'sine', 520], [520, .3, .6, 'sine', 260]], cackle: [[700, 0, .1, 'sawtooth', 900], [760, .12, .1, 'sawtooth', 960], [820, .24, .1, 'sawtooth', 1020], [880, .36, .15, 'sawtooth', 700]]
  };
  const PACKS = { arcade: [['power', 'Power up'], ['jump', 'Jump'], ['powerdown', 'Power down'], ['blast', 'Blast']], cozy: [['musicbox', 'Music box'], ['raindrop', 'Raindrop'], ['lullaby', 'Lullaby'], ['windchime', 'Wind chime']], spooky: [['creak', 'Creaky door'], ['flutter', 'Bat flutter'], ['ghost', 'Ghost'], ['cackle', 'Witch cackle']] };
  const NAMES = { ping: 'Ping', chime: 'Chime', pop: 'Pop', bell: 'Bell', blip: 'Blip', soft: 'Soft', coin: 'Coin', levelup: 'Level up', drop: 'Water drop', laser: 'Laser', whistle: 'Whistle', harp: 'Harp', alert: 'Alert', knock: 'Knock', sparkle: 'Sparkle', marimba: 'Marimba', hello: 'Hello' };
  let ctx = null, audio = null;
  window.Sounds = {
    tones: Object.keys(NAMES).map((k) => [k, NAMES[k]]), packs: PACKS,
    dur: (tone) => Math.round(1000 * Math.max(...(T[tone] || T.ping).map(([f, st, d]) => st + d))),
    play(tone, vol = 0.6) {
      try {
        ctx = ctx || new AudioContext(); const t0 = ctx.currentTime;
        (T[tone] || T.ping).forEach(([f, s, d, w, f2]) => {
          const o = ctx.createOscillator(), g = ctx.createGain(); o.type = w || 'sine'; o.frequency.setValueAtTime(f, t0 + s); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + s + d);
          g.gain.setValueAtTime(0.0001, t0 + s); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.3), t0 + s + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
          o.connect(g); g.connect(ctx.destination); o.start(t0 + s); o.stop(t0 + s + d + 0.05);
        });
      } catch (e) {}
    },
    // Plays a user-chosen sound file (data: URL)
    playUrl(url, vol = 0.6) { try { if (audio) audio.pause(); audio = new Audio(url); audio.volume = Math.max(0, Math.min(1, vol)); audio.play().catch(() => {}); } catch (e) {} }
  };
})();
