'use strict';
/* The perk catalogue: ids, names, notes, prices and holiday dates, in ONE place.
   The app, the website and the server all read this file (tools/sync-site.js copies it), so a name or price can never differ between them.
   To change a price: edit it here, run  node tools/sync-site.js  and ship both zips. Perks you add from the admin page (Catalogue tab) are separate and need no release. */
(function (root, factory) { const v = factory(); if (typeof module === 'object' && module.exports) module.exports = v; else root.PerkData = v; })(typeof self !== 'undefined' ? self : this, function () {
  // ---- prices (USD) ----
  const P = { fxA: 1, fxB: 1.5, plate: 1, title: 2, skin: 2, enter: 1.5, mbgG: 2.5, mbgA: 3.5, sound: 2.5, pack: 6 };

  // ---- holidays: a holiday's perks are on sale from 30 days before the date until 14 days after it ----
  const BEFORE_DAYS = 30, AFTER_DAYS = 14, DAY = 86400000;
  const easter = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return Date.UTC(y, mo - 1, da); };
  const thanksgiving = (y) => { const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(); return Date.UTC(y, 10, 1 + ((4 - first + 7) % 7) + 21); };
  const HOL = {
    christmas: { name: 'Christmas', colors: ['#e5484d', '#ffffff', '#2fa361'], date: (y) => Date.UTC(y, 11, 25), skin: 'santa', tag: 'Twinkling lights, snowfall and a Santa-hat Yappy' },
    newyear: { name: 'New Year', colors: ['#f5c542', '#ff5d8f', '#5ad1ff'], date: (y) => Date.UTC(y, 0, 1), skin: 'party', tag: 'Midnight confetti, fireworks and a party-hat Yappy' },
    halloween: { name: 'Halloween', colors: ['#ff7a1a', '#9b5de5', '#b6ff4d'], date: (y) => Date.UTC(y, 9, 31), skin: 'vampire', tag: 'A haunted glow, a swarm of bats and a vampire Yappy' },
    thanksgiving: { name: 'Thanksgiving', colors: ['#c2491d', '#e08a2c', '#d9a521'], date: thanksgiving, skin: 'turkey', tag: 'Falling leaves, a dashing turkey and a feathered Yappy' },
    easter: { name: 'Easter', colors: ['#ff9ec9', '#b8a1ff', '#8fe3b5'], date: easter, skin: 'bunny', tag: 'A hopping pastel name, an egg hunt and a bunny Yappy' },
    july4: { name: '4th of July', colors: ['#ff4d5e', '#ffffff', '#4f8cff'], date: (y) => Date.UTC(y, 6, 4), skin: 'patriot', tag: 'A fireworks flag, a jet flyover and a star-spangled Yappy' },
    valentines: { name: "Valentine's", colors: ['#ff5d8f', '#ffd1e1', '#ff2e63'], date: (y) => Date.UTC(y, 1, 14), skin: 'lovestruck', tag: 'A heartbeat name, floating hearts and a heart-eyed Yappy' }
  };
  // What a holiday pack contains, with the names people see
  const SEASON = {
    christmas: { effect: ['Twinkle lights', 'Red, green and white, blinking like a string of lights'], plate: ['Snowy garland', 'Pine green with glowing lights and drifting snow'], title: ["Santa's Helper", '#e5484d'], entrance: ['Snowfall', 'Snow drifts over your first message'], skin: 'Santa hat' },
    newyear: { effect: ['Midnight confetti', 'Gold letters sprinkled with party confetti'], plate: ['Midnight toast', 'A midnight sky with drifting confetti'], title: ['Countdown Crew', '#f5c542'], entrance: ['Fireworks', 'Fireworks burst behind your first message'], skin: 'Party hat and blower' },
    halloween: { effect: ['Haunted glow', 'An orange name with a purple and green ghost-glow'], plate: ['Haunted hollow', 'Purple fog and a glowing pumpkin'], title: ['Pumpkin King', '#ff7a1a'], entrance: ['Bat swarm', 'A swarm of bats sweeps past'], skin: 'Fangs and cape' },
    thanksgiving: { effect: ['Falling leaves', 'Autumn colours with a leaf drifting down'], plate: ['Harvest table', 'Warm wood and falling leaves'], title: ['Gravy Boat', '#d9792b'], entrance: ['Turkey dash', 'A turkey runs across your message'], skin: 'Turkey feathers' },
    easter: { effect: ['Spring hop', 'Pastel colours and a little hop'], plate: ['Spring meadow', 'A meadow of flowers with painted eggs'], title: ['Egg Hunter', '#ff9ec9'], entrance: ['Egg hunt', 'Painted eggs bounce across the line'], skin: 'Bunny ears and tail' },
    july4: { effect: ['Fireworks flag', 'Red, white and blue stripes with a twinkle'], plate: ['Stars and stripes', 'A blue field of stars beside red and white stripes'], title: ['Firework Fan', '#4f8cff'], entrance: ['Jet flyover', 'A jet with red, white and blue trails'], skin: 'Star-spangled hat' },
    valentines: { effect: ['Heartbeat', 'A pink name that beats like a heart'], plate: ['Love letter', 'Rose red with hearts floating up'], title: ['Sweetheart', '#ff5d8f'], entrance: ['Hearts', 'Hearts float up behind your message'], skin: 'Heart eyes' }
  };
  const holDate = (h, y) => HOL[h].date(y);
  // Is this holiday's window open at `now` (ms)? { open, date, start, end } or { open:false, next:<ms start of the next window> }
  function window_(h, now) {
    const y = new Date(now).getUTCFullYear(); let next = Infinity;
    for (const yy of [y - 1, y, y + 1]) { const d = holDate(h, yy), a = d - BEFORE_DAYS * DAY, z = d + (AFTER_DAYS + 1) * DAY; if (now >= a && now < z) return { open: true, date: d, start: a, end: z - DAY }; if (a > now && a < next) next = a; }
    return { open: false, next };
  }
  const seasonIds = (h) => ({ effects: 'sx-' + h, plates: 'sp-' + h, titles: 'st-' + h, entrances: 'se-' + h, skins: HOL[h].skin });

  // ---- single items ----
  const A = (id, name, price, note, x) => ({ id, name, price, note, ...x });
  const effects = [
    A('glow', 'Glow', P.fxA, 'A soft pink glow'), A('pulse', 'Pulse', P.fxA, 'Glow that gently pulses'), A('shimmer', 'Shimmer', P.fxA, 'A rainbow shimmer moves across the name'),
    A('neon', 'Neon', P.fxA, 'Neon sign with a light flicker'), A('aurora', 'Aurora', P.fxA, 'Flowing teal, violet and pink'), A('inferno', 'Inferno', P.fxA, 'Flickering flames'),
    A('holo', 'Holographic', P.fxB, 'Iridescent colours with a moving glint'), A('chrome', 'Liquid chrome', P.fxB, 'Polished metal with a sweeping highlight'), A('gold', 'Gold foil', P.fxB, 'Molten gold with a sweeping shine'),
    A('ocean', 'Deep ocean', P.fxB, 'Rolling blue and teal waves'), A('plasma', 'Plasma', P.fxB, 'Fast flowing magenta, orange and cyan'), A('candy', 'Candy stripe', P.fxB, 'Moving pink and white stripes'),
    A('galaxy', 'Galaxy', P.fxB, 'Twinkling stars over a violet nebula'), A('glitch', 'Glitch', P.fxB, 'RGB split with random digital glitches')
  ];
  // Name plates are backgrounds behind your name (like a banner), each with its own look. Ids 'solid', 'dash', 'rainbow' and 'neon' keep working for people who own them.
  const plates = [
    A('solid', 'Blueprint', P.plate, 'A technical blueprint grid with a white outline'), A('dash', 'Caution tape', P.plate, 'Hazard stripes marching along the top and bottom'),
    A('rainbow', 'Prism ring', P.plate, 'A colour-cycling ring around your name'), A('neon', 'Neon sign', P.plate, 'A glowing neon tube that flickers'),
    A('moonrise', 'Moonrise', P.plate, 'A starry night with a glowing moon'), A('sunset', 'Sunset strip', P.plate, 'Purple to orange, with the sun going down'),
    A('deepsea', 'Deep sea', P.plate, 'Dark water with bubbles rising'), A('circuit', 'Circuit board', P.plate, 'Green traces with a light running along them'),
    A('synthwave', 'Synthwave', P.plate, 'A neon horizon with a retro grid'), A('blossom', 'Cherry blossom', P.plate, 'Pink petals drifting past'),
    A('lava', 'Lava flow', P.plate, 'Molten rock that slowly churns'), A('matrix', 'Digital rain', P.plate, 'Green code falling down'),
    A('gilded', 'Gilded frame', P.plate, 'A gold frame with a passing shine'), A('comic', 'Comic book', P.plate, 'Halftone dots and a bold outline'),
    A('frost', 'Frostbite', P.plate, 'Icy glass with twinkling frost'), A('glass', 'Frosted glass', P.plate, 'A clean, see-through pane'),
    A('glade', 'Firefly glade', P.plate, 'A mossy forest with blinking fireflies'), A('pixel', 'Pixel quest', P.plate, 'An 8-bit window frame')
  ];
  const titles = [
    A('yapper', 'Yapper', P.title, '', { color: '#7bd88f' }), A('chatterbox', 'Chatterbox', P.title, '', { color: '#5b8cff' }), A('hype', 'Hype Master', P.title, '', { color: '#ff7ac8' }),
    A('night', 'Night Owl', P.title, '', { color: '#b08cff' }), A('legend', 'Legend', P.title, '', { color: '#ffc83d' })
  ];
  // Titles that cannot be bought. 'grant' ones are given by hand from the admin page.
  const specialTitles = [
    A('chief', 'Chief Yapper', 0, 'Only the creator has this title', { color: '#6ee7ff', diamond: true }), A('gifter', 'Gifter', 0, 'Earned by gifting a perk to someone', { color: '#ff8fb8' }),
    A('helper', 'Helper', 0, 'Given to people whose suggestions made YappyChat better', { color: '#2dd4bf', shine: true, grant: true }),
    A('tester', 'Tester', 0, 'Given to people who help test new versions', { color: '#ffb86b', dashed: true, grant: true }),
    A('contributor', 'Contributor', 0, 'Given to people who have helped build YappyChat', { color: '#a78bfa', shine: true, grant: true })
  ];
  const skins = [
    A('crown', 'Crown', P.skin, 'A golden crown'), A('headphones', 'Headphones', P.skin, 'Big blue headphones'), A('halo', 'Halo (animated)', P.skin, 'A glowing, pulsing halo'), A('sparkles', 'Sparkles (animated)', P.skin, 'Twinkling stars around Yappy'),
    ...Object.entries(HOL).map(([h, v]) => A(v.skin, SEASON[h].skin + ' (animated)', P.skin, v.tag, { season: h })),
    // not sold any more; people who already own it can still wear it
    A('cupid', "Cupid's bow (animated)", P.skin, 'A golden bow that fires little hearts', { retired: true })
  ];
  const entrances = [
    A('pop', 'Pop in', P.enter, 'Your first message pops in with a glow'), A('slide', 'Slide in', P.enter, 'Slides in from the side and fades its highlight'), A('sparkle', 'Sparkle burst', P.enter, 'Golden flash with a burst of stars'),
    A('spotlight', 'Spotlight', P.enter, 'A beam of light sweeps across your message'), A('confetti', 'Confetti', P.enter, 'A burst of confetti'), A('stamp', 'Stamp', P.enter, 'Slams in with a shake')
  ];
  // Message backgrounds: a soft colour behind every message you send. Gradients are still; animated ones drift slowly. Anyone can switch them off in Settings.
  const messages = [
    A('dusk', 'Dusk', P.mbgG, 'Violet fading to pink', { kind: 'gradient', c: ['#a064ff', '#ff70aa'] }), A('mint', 'Mint breeze', P.mbgG, 'Fresh green to teal', { kind: 'gradient', c: ['#2ee6a6', '#2bb8d6'] }),
    A('ember', 'Ember glow', P.mbgG, 'Warm orange to red', { kind: 'gradient', c: ['#ff8a3d', '#ff4d4d'] }), A('tide', 'Tidewater', P.mbgG, 'Deep blue to cyan', { kind: 'gradient', c: ['#3b7bff', '#35d0e6'] }),
    A('rosewater', 'Rose quartz', P.mbgG, 'Soft pink and blush', { kind: 'gradient', c: ['#ff7aa8', '#ffc2d6'] }), A('citrus', 'Citrus', P.mbgG, 'Sunny yellow to lime', { kind: 'gradient', c: ['#ffd23a', '#9be04a'] }),
    A('orchid', 'Orchid', P.mbgG, 'Magenta to purple', { kind: 'gradient', c: ['#e04cc8', '#8a5cff'] }), A('slate', 'Slate', P.mbgG, 'A quiet grey-blue to teal', { kind: 'gradient', c: ['#7c8aa5', '#3ba7a0'] }),
    A('aurora', 'Aurora drift', P.mbgA, 'Teal, violet and pink drifting slowly', { kind: 'animated', c: ['#2be8c4', '#8a6bff'] }), A('embers', 'Slow embers', P.mbgA, 'A warm glow that moves like embers', { kind: 'animated', c: ['#ff8a3d', '#ff4d4d'] }),
    A('starlight', 'Starlight', P.mbgA, 'A night sky with stars that slowly pass', { kind: 'animated', c: ['#5b7bff', '#a99bff'] }), A('silk', 'Silk sheen', P.mbgA, 'A soft band of light that sweeps across now and then', { kind: 'animated', c: ['#c8d4ea', '#7f93b8'] }),
    A('tidal', 'Tidal', P.mbgA, 'Blue and teal waves rolling gently', { kind: 'animated', c: ['#2a8bff', '#2de0c8'] }), A('cotton', 'Cotton candy', P.mbgA, 'Pink and blue clouds that shift', { kind: 'animated', c: ['#ff8fc4', '#7fc4ff'] })
  ];
  const sounds = [A('arcade', 'Arcade sound pack', P.sound, 'Power up, jump, power down, blast'), A('cozy', 'Cozy sound pack', P.sound, 'Music box, raindrop, lullaby, wind chime'), A('spooky', 'Halloween sound pack', P.sound, 'Creak, bat flutter, ghost, witch cackle. Free in the Halloween pack', { season: 'halloween' })];
  // Sound packs that come free with a holiday pack
  const SEASON_SOUND = { halloween: 'spooky' };
  const packs = Object.entries(HOL).map(([h, v]) => A(h, v.name + ' pack', P.pack, `A ${SEASON[h].effect[0].toLowerCase()} name effect, the ${SEASON[h].plate[0]} plate, the "${SEASON[h].title[0]}" title, the ${SEASON[h].entrance[0].toLowerCase()} entrance and the ${SEASON[h].skin.toLowerCase()} Yappy skin`, { season: h }));

  return { PRICE: P, HOL, SEASON, BEFORE_DAYS, AFTER_DAYS, holDate, window: window_, seasonIds, effects, plates, titles, specialTitles, skins, entrances, messages, sounds, packs, SEASON_SOUND, easter, thanksgiving };
});
