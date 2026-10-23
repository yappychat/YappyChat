(function () {
  'use strict';
  // Supporter perks. Everything is keyed by Twitch user id (read from the chat message itself, so it cannot be faked
  // by changing a display name). The supporter list comes from a registry file the app owner maintains.
  const TIP_URL = 'https://streamelements.com/vonarc/tip';
  // The supporter server (see /server). Everyone's equipped perks come from here, so other users see what you wear.
  const API_URL = 'https://yappy.chat';
  const REGISTRY_URL = 'https://raw.githubusercontent.com/yappychat/YappyChat/main/registry.json'; // optional fallback if there is no server

  const TIERS = [
    { id: 'gold', min: 100, label: 'Gold', stops: ['#fff3a8', '#f6c21a', '#b87d00'], shine: 1 },
    { id: 'silver', min: 50, label: 'Silver', stops: ['#ffffff', '#c3ccda', '#8794a8'], shine: 1 },
    { id: 'bronze', min: 25, label: 'Bronze', stops: ['#f7c293', '#c97a3a', '#8e4a1c'], shine: 1 },
    { id: 'white', min: 10, label: 'White', stops: ['#e7ebf3', '#c4ccda', '#a7b1c4'], shine: 0 }
  ];
  // Names, prices and holiday dates come from perkdata.js (shared with the website and the server), so they can never disagree
  const PD = window.PerkData;
  const HOL = Object.fromEntries(Object.entries(PD.HOL).map(([h, v]) => [h, [v.name, v.colors, PD.SEASON[h].title[0]]]));
  const EFFECTS = PD.effects.map((x) => ({ ...x }));
  const PLATES = PD.plates.map((x) => ({ ...x }));
  const TITLES = [
    ...PD.titles.map((t) => ({ id: t.id, text: t.name, color: t.color, price: t.price })),
    ...PD.specialTitles.map((t) => ({ id: t.id, text: t.name, color: t.color, special: true, grant: !!t.grant, shine: !!t.shine, dashed: !!t.dashed, diamond: !!t.diamond, note: t.note })),
    ...Object.entries(HOL).map(([h, v]) => ({ id: 'st-' + h, text: v[2], color: v[1][0], pack: h }))
  ];
  const SKINS = PD.skins.map((x) => ({ ...x }));
  const ENTRANCES = PD.entrances.map((x) => ({ ...x }));
  const MESSAGES = PD.messages.map((x) => ({ ...x }));
  const SOUNDS = PD.sounds.map((x) => ({ ...x }));
  const PACKS = PD.packs.map((x) => ({ ...x }));
  const CATS = { effects: EFFECTS, plates: PLATES, titles: TITLES, skins: SKINS, entrances: ENTRANCES, messages: MESSAGES, sounds: SOUNDS };
  const SEASON_ITEMS = (h) => ({ effects: 'sx-' + h, plates: 'sp-' + h, titles: 'st-' + h, entrances: 'se-' + h });
  const CREATOR = { login: 'vonarc', role: 'creator', loadout: { effect: 'aurora', plate: 'moonrise', title: 'chief', entrance: 'sparkle' } };

  const by = (arr, id) => arr.find((x) => x.id === id);
  const e = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n)));
  const map = new Map(); let list = [], loadedAt = 0, loading = null, serverLoadout = false, apiOk = false;
  const tierFor = (total) => TIERS.find((t) => (+total || 0) >= t.min) || null;
  // The server only says which badge someone has (not how much they spent); older servers sent the total
  const tierOf = (en) => (en && en.tier ? TIERS.find((t) => t.id === en.tier) || null : tierFor(en && en.total));
  const tierRank = (en) => { const t = tierOf(en); return t ? TIERS.length - TIERS.indexOf(t) : 0; };

  // ----- badges: Yappy himself, in the tier's metal, with a moving shine on bronze, silver and gold -----
  const badge = (fillId, o = {}) => { const D = Yappy.paths; return `<svg class="pbadge${o.cls ? ' ' + o.cls : ''}" viewBox="440 340 1300 1490" aria-hidden="true"><path d="${D.body}" fill="url(#${fillId})" stroke="rgba(0,0,0,.3)" stroke-width="30" stroke-linejoin="round"/>${o.shine ? '<g clip-path="url(#pg-clip)"><polygon class="pshine" points="400,340 640,340 440,1830 200,1830"/></g>' : ''}<path d="${D.eyeL}" fill="#191d23"/><path d="${D.eyeR}" fill="#191d23"/><path d="${D.mouth}" fill="#191d23"/><path d="${D.tongue}" fill="#ef6048"/>${o.extra || ''}</svg>`; };
  const gradDefs = () => `<svg id="pdefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="pg-clip"><path d="${Yappy.paths.body}"/></clipPath>${TIERS.map((t) => `<linearGradient id="pg-${t.id}" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${t.stops[0]}"/><stop offset=".5" stop-color="${t.stops[1]}"/><stop offset="1" stop-color="${t.stops[2]}"/></linearGradient>`).join('')}<linearGradient id="pg-diamond" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#e6fdff"/><stop offset=".45" stop-color="#6ee7ff"/><stop offset="1" stop-color="#7a7dff"/></linearGradient></defs></svg>`;
  const tierBadge = (t) => badge('pg-' + t.id, { shine: t.shine, cls: 'tier-' + t.id });
  const diamondBadge = () => badge('pg-diamond', { shine: 1, cls: 'diamond', extra: '<path d="M1640 330l40 100 100 40-100 40-40 100-40-100-100-40 100-40z" fill="#fff"/>' });

  // ----- partner streamers: collaboration items (skin, colour theme, badge, title, bundle) the server lists at /api/partners -----
  let partners = []; const pitems = new Map(); // 'slug:id' -> { p: partner, it: item }
  const GLYPH = {
    heart: '<path d="M0 38C-62 -8 -52 -58 -22 -58C-8 -58 0 -46 0 -38C0 -46 8 -58 22 -58C52 -58 62 -8 0 38Z"/>', star: '<path d="M0 -60L17 -20L60 -17L27 12L37 55L0 31L-37 55L-27 12L-60 -17L-17 -20Z"/>',
    bolt: '<path d="M12 -62L-30 6H-2L-14 62L32 -12H4Z"/>', note: '<path d="M-14 -50L36 -62V28A18 14 0 1 1 26 14V-34L-4 -27V40A18 14 0 1 1 -14 26Z"/>',
    paw: '<path d="M0 6C-26 6 -42 28 -34 44C-26 58 -8 50 0 50C8 50 26 58 34 44C42 28 26 6 0 6Z"/><ellipse cx="-44" cy="-6" rx="12" ry="17" transform="rotate(-20 -44 -6)"/><ellipse cx="-16" cy="-32" rx="12" ry="18"/><ellipse cx="16" cy="-32" rx="12" ry="18"/><ellipse cx="44" cy="-6" rx="12" ry="17" transform="rotate(20 44 -6)"/>',
    flame: '<path d="M0 -62C14 -34 38 -22 38 10C38 38 20 56 0 56C-20 56 -38 38 -38 10C-38 -8 -28 -18 -22 -30C-18 -14 -10 -8 -6 -10C-12 -34 -4 -50 0 -62Z"/>', crown: '<path d="M-50 30L-56 -34L-24 -8L0 -48L24 -8L56 -34L50 30Z"/>', moon: '<path d="M20 -56A56 56 0 1 0 56 24A44 44 0 0 1 20 -56Z"/>'
  };
  const glyph = (name, x, y, s, fill, stroke) => (GLYPH[name] ? `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${6 / s}" stroke-linejoin="round"` : ''}>${GLYPH[name]}</g>` : '');
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const okHex = (x) => (/^#[0-9a-f]{6}$/i.test(x || '') ? x : '#8b5cf6');
  function ensureGrad(slug, accent) {
    const id = 'pp-' + slug, d = document.querySelector('#pdefs defs'); if (!d || d.querySelector('#' + id)) return id; const a = okHex(accent);
    d.insertAdjacentHTML('beforeend', `<linearGradient id="${id}" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${shade(a, .55)}"/><stop offset=".5" stop-color="${a}"/><stop offset="1" stop-color="${shade(a, -.35)}"/></linearGradient>`); return id;
  }
  const pitem = (key) => pitems.get(key) || null;
  function partnerBadge(pi) {
    const id = ensureGrad(pi.p.slug, pi.p.accent), g = pi.it.config.glyph;
    return `<span class="pb pp" data-tip="${e(`${pi.p.name} · ${pi.it.name}`)}">${badge(id, { shine: 1, cls: 'partner', extra: glyph(g, 1620, 470, 3.4, '#fff', 'rgba(0,0,0,.45)') })}</span>`;
  }
  // The Yappy accessory for a partner skin: cat ears, or one of the little glyphs above his head, in the partner's colour
  function partnerSkin(key) {
    const pi = key && pitems.get(key); if (!pi) return ''; const a = okHex(pi.p.accent), art = pi.it.config.art || pi.it.config.glyph || 'star';
    if (art === 'ears') return `<g><path d="M690 520 L650 190 L985 395 Z" fill="${a}" stroke="${shade(a, -.4)}" stroke-width="22" stroke-linejoin="round"/><path d="M1195 395 L1530 190 L1490 520 Z" fill="${a}" stroke="${shade(a, -.4)}" stroke-width="22" stroke-linejoin="round"/><path d="M745 440 L730 290 L880 395 Z" fill="${shade(a, .6)}"/><path d="M1300 395 L1450 290 L1435 440 Z" fill="${shade(a, .6)}"/></g>`;
    return glyph(art, 1090, 215, 3.4, a, shade(a, -.45)) || '';
  }
  const partnerTheme = (key) => { const pi = key && pitems.get(key); return pi && pi.it.kind === 'theme' ? okHex(pi.it.config.accent || pi.p.accent) : ''; };
  // Everything of a partner's that this person may wear: what they bought, plus all of it for the creator and for the partner themself
  function partnerOwned(en) {
    const s = new Set(((en.owned || {}).partner) || []), me = String(en.login || '').toLowerCase();
    pitems.forEach((v, k) => { if (v.it.kind !== 'bundle' && me && v.p.twitch_login && String(v.p.twitch_login).toLowerCase() === me && v.p.status !== 'draft') s.add(k); });
    return s;
  }
  // The partner shows only while it is live and inside its dates
  const today = () => new Date().toISOString().slice(0, 10);
  const pState = (p) => (p.status !== 'live' ? 'off' : p.starts && p.starts > today() ? 'soon' : p.ends && p.ends < today() ? 'ended' : 'live');

  // ----- who owns / has equipped what -----
  const every = (arr) => arr.map((x) => x.id);
  function allOwned() { const o = {}; Object.keys(CATS).forEach((k) => (o[k] = new Set(every(CATS[k])))); o.partner = new Set([...pitems].filter(([, v]) => v.it.kind !== 'bundle').map(([k]) => k)); Object.keys(HOL).forEach((h) => { const s = SEASON_ITEMS(h); Object.keys(s).forEach((k) => (o[k] = o[k] || new Set()).add(s[k])); }); return o; }
  function ownedOf(en, creator) {
    if (creator) return allOwned();
    const o = {}; Object.keys(CATS).forEach((k) => (o[k] = new Set(((en.owned || {})[k]) || [])));
    o.entrances = o.entrances || new Set(); o.partner = partnerOwned(en);
    const add = (k, v) => { if (v) o[k].add(typeof v === 'object' ? v.id : v); };
    add('effects', en.effect); add('plates', en.plate); add('titles', en.title); add('skins', en.skin); add('entrances', en.entrance); add('messages', en.message);
    ((en.owned || {}).packs || en.packs || []).forEach((h) => { const s = SEASON_ITEMS(h); Object.keys(s).forEach((k) => o[k].add(s[k])); if (PD.HOL[h]) o.skins.add(PD.HOL[h].skin); if (PD.SEASON_SOUND && PD.SEASON_SOUND[h]) o.sounds.add(PD.SEASON_SOUND[h]); });
    if (en.gifts > 0) o.titles.add('gifter');
    return o;
  }
  const entryFor = (uid) => (uid ? map.get(String(uid)) || null : null);
  function equipped(en, uid, own) {
    const lo = en.loadout || {}, id = (v) => (v && typeof v === 'object' ? v.id : v);
    let q = { effect: id(lo.effect) || id(en.effect), plate: id(lo.plate) || id(en.plate), title: id(lo.title) || id(en.title), skin: id(lo.skin) || id(en.skin), entrance: id(lo.entrance) || id(en.entrance), message: id(lo.message) || id(en.message), pskin: id(lo.pskin) || id(en.pskin), ptheme: id(lo.ptheme) || id(en.ptheme), pbadge: id(lo.pbadge) || id(en.pbadge), ptitle: id(lo.ptitle) || id(en.ptitle) };
    if (S.me && String(uid) === String(S.me.id) && S.settings.myLoadout && !serverLoadout) q = { ...q, ...S.settings.myLoadout }; // only until the server has confirmed a loadout
    const ok2 = (k, v) => (v && own[k] && own[k].has(v) ? v : '');
    const okp = (v, kind) => { const pi = v && pitems.get(v); return pi && pi.it.kind === kind && own.partner && own.partner.has(v) ? v : ''; };
    return { effect: ok2('effects', q.effect), plate: ok2('plates', q.plate), title: ok2('titles', q.title), skin: by(SKINS, q.skin) ? ok2('skins', q.skin) : '', entrance: ok2('entrances', q.entrance), message: ok2('messages', q.message), pskin: okp(q.pskin, 'skin'), ptheme: okp(q.ptheme, 'theme'), pbadge: okp(q.pbadge, 'badge'), ptitle: okp(q.ptitle, 'title') };
  }
  function describe(uid) {
    const en = entryFor(uid); if (!en) return null;
    const creator = en.role === 'creator', own = ownedOf(en, creator), eq = equipped(en, uid, own);
    return { creator, tier: creator ? null : tierOf(en), own, eq, en, skin: eq.skin ? { id: eq.skin } : null, gifter: en.gifts > 0 };
  }
  const season = (id, pre) => (id && id.startsWith(pre) ? id.slice(pre.length) : '');
  // Hovering a name, badge or title only says what it is called
  const nameOf = (list, id) => { const f = by(list, id); return f ? (f.name || f.text) : ''; };
  const sName = (id, pre, word) => { const h = season(id, pre); return h ? HOL[h][0] + ' ' + word : ''; };
  function perkLines(q) {
    const L = [];
    if (q.effect) L.push(sName(q.effect, 'sx-', 'effect') || nameOf(EFFECTS, q.effect));
    if (q.plate) L.push(sName(q.plate, 'sp-', 'plate') || nameOf(PLATES, q.plate));
    return L.filter(Boolean);
  }
  // Pieces to splice into a chat line
  function parts(uid) {
    const d = describe(uid); if (!d) return null; const q = d.eq;
    let bd = d.creator ? `<span class="pb" data-tip="${e('YappyChat creator')}">${diamondBadge()}</span>` : d.tier ? `<span class="pb" data-tip="${e(d.tier.label + ' supporter')}">${tierBadge(d.tier)}</span>` : '';
    const t = q.title ? by(TITLES, q.title) : null, pb = q.pbadge && pitems.get(q.pbadge), pt = q.ptitle && pitems.get(q.ptitle);
    if (pb) bd += partnerBadge(pb);
    const tcls = t ? ['ttl', q.title === 'chief' || t.diamond ? 'diamond' : '', t.shine ? 'shine' : '', t.dashed ? 'dashed' : ''].filter(Boolean).join(' ') : '';
    let title = t ? `<span class="${tcls}" style="--tc:${t.color}" data-tip="${e(t.text)}">${e(t.text)}</span>` : '';
    if (pt) title += `<span class="ttl" style="--tc:${pt.p.accent}" data-tip="${e(pt.it.config.text || pt.it.name)}">${e(pt.it.config.text || pt.it.name)}</span>`;
    const cls = ['nm', q.effect ? 'fx-' + q.effect : '', q.plate ? 'pl-' + q.plate : ''].filter(Boolean).join(' ');
    const m = q.message ? by(MESSAGES, q.message) : null;
    return { badge: bd, title, cls, style: '', creator: d.creator, ent: q.entrance || '', tip: perkLines(q).join(' · '), mbg: m ? 'mbg-' + m.id + (m.kind === 'animated' ? ' mbg-anim' : '') : '' };
  }

  const apiOn = () => !/YOUR_YAPPYCHAT_SITE/.test(API_URL);
  async function load(force) {
    if (loading) return loading; if (!force && Date.now() - loadedAt < 4.5 * 60000) return;
    loading = (async () => {
      let users = [], got = false; apiOk = false;
      if (apiOn()) { try { const r = await cg.http({ url: API_URL + '/api/perks?t=' + Math.floor(Date.now() / 60000) }); if (r.status === 200 && r.json && Array.isArray(r.json.users)) { users = r.json.users; got = true; apiOk = true; } } catch (x) {} }
      if (!got && !/YOUR_GITHUB_USER/.test(REGISTRY_URL)) { try { const r = await cg.http({ url: REGISTRY_URL + '?t=' + Math.floor(Date.now() / 600000) }); if (r.status === 200 && r.json && Array.isArray(r.json.users)) users = r.json.users; } catch (x) {} }
      const reg = users.find((u) => String(u.login || '').toLowerCase() === CREATOR.login);
      users = [{ ...CREATOR, ...(reg || {}), loadout: { ...CREATOR.loadout, ...((reg && reg.loadout) || {}) }, role: 'creator' }, ...users.filter((u) => String(u.login || '').toLowerCase() !== CREATOR.login)];
      const cache = S.settings.perkIds || {}, need = [], next = {};
      users.forEach((u) => { if (u.id) return; const l = String(u.login || '').toLowerCase(); if (!l) return; if (cache[l]) next[l] = cache[l]; else need.push(l); });
      for (let i = 0; i < need.length; i += 100) { const chunk = need.slice(i, i + 100), r = await helix('users', { query: chunk.map((l) => 'login=' + encodeURIComponent(l)).join('&') }); ((r.json && r.json.data) || []).forEach((u) => { next[u.login.toLowerCase()] = u.id; }); }
      if (apiOn()) { try { const r = await cg.http({ url: API_URL + '/api/partners?t=' + Math.floor(Date.now() / 60000) }); if (r.status === 200 && r.json && Array.isArray(r.json.partners)) { partners = r.json.partners; pitems.clear(); partners.forEach((p) => (p.items || []).forEach((it) => pitems.set(it.key, { p, it }))); } } catch (x) {} }
      await loadCatalog();
      map.clear(); list = users;
      users.forEach((u) => { const id = u.id || next[String(u.login || '').toLowerCase()]; if (id) map.set(String(id), u); });
      const me = S.me && map.get(String(S.me.id)); serverLoadout = !!(apiOk && me && me.loadout && Object.keys(me.loadout).length);
      saveSettings({ perkIds: next }); loadedAt = Date.now();
      const ec = S.settings.entCache; if (ec && S.me && ec.uid === S.me.id) applyEnt(ec.data); // your own perks come from your own check, never only from the public list
    })().catch(() => {}).finally(() => { loading = null; });
    return loading;
  }
  // ---- Your own perks, straight from the server (GET /api/entitlements with your Twitch login) ----
  // The server is the only source of truth. The answer is kept for 5 minutes (and on disk, so a restart without internet still shows your perks);
  // after that it is fetched again. If the server cannot be reached the last answer keeps working and the Your Perks page says it is reconnecting.
  const ENT_TTL = 5 * 60000;
  let entState = { at: 0, ok: false, busy: null };
  function applyEnt(d) {
    if (!d || !d.user || !S.me || String(d.user.id) !== String(S.me.id)) return; // a cached answer for someone else (another account on this computer) is ignored
    const cur = map.get(String(S.me.id)) || { id: d.user.id, login: d.user.login };
    const en = { ...cur, id: d.user.id, login: d.user.login, role: d.role || cur.role || '', tier: d.tier || '', gifts: d.gifts || 0, owned: d.perks || {}, loadout: d.equipped || {} };
    delete en.total; map.set(String(S.me.id), en); serverLoadout = !!Object.keys(en.loadout).length;
  }
  async function refreshMine(force) {
    if (!apiOn() || !S.token || !S.me) return null;
    const cache = S.settings.entCache;
    if (!entState.at && cache && cache.uid === S.me.id) { applyEnt(cache.data); entState.at = cache.at; }
    if (!force && Date.now() - entState.at < ENT_TTL && entState.ok) return true;
    if (entState.busy) return entState.busy;
    entState.busy = (async () => {
      const r = await cg.http({ url: API_URL + '/api/entitlements', headers: { Authorization: 'Bearer ' + S.token, ...(cache && cache.uid === S.me.id && cache.etag && !force ? { 'If-None-Match': cache.etag } : {}) } });
      if (r.status === 304 && cache) { entState = { at: Date.now(), ok: true }; saveSettings({ entCache: { ...cache, at: Date.now() } }); return true; }
      if (r.status === 200 && r.json && r.json.user) { applyEnt(r.json); entState = { at: Date.now(), ok: true }; saveSettings({ entCache: { uid: S.me.id, at: Date.now(), etag: (r.headers || {}).etag || '', data: r.json } }); applyHoliday(); return true; }
      if (r.status === 401) { entState.ok = false; return false; } // the login check failed: nothing is granted from this answer
      entState.ok = false; return false; // offline or the server is down: the cached answer stays in use
    })().finally(() => { entState.busy = null; });
    return entState.busy;
  }
  const entStale = () => !!S.me && apiOn() && (!entState.ok || Date.now() - entState.at > ENT_TTL * 2);
  // Forget the cached answer when a different person logs in on this computer
  function forgetMine() { entState = { at: 0, ok: false, busy: null }; saveSettings({ entCache: null }); }
  // Open the website already signed in as you: the app asks the server for a one-time code (valid for 2 minutes, single use) and passes it in the
  // address after the # (which browsers never send to any server or put in a Referer). The site swaps it for a session, then removes it from the address.
  async function openSite(pathAndQuery) {
    if (!apiOn()) { toast('The YappyChat website address is not set in this build.', { ms: 3000 }); return; }
    let frag = '';
    try { if (S.token) { const r = await cg.http({ url: API_URL + '/api/handoff', method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: '{}' }); if (r.status === 200 && r.json && r.json.code) frag = 'handoff=' + encodeURIComponent(r.json.code); } } catch (e) {}
    const [pq, hash] = pathAndQuery.split('#'); cg.openExternal(API_URL + pq + '#' + [frag, hash].filter(Boolean).join('&'));
  }

  // Once a day (unless switched off in Settings > Account): "this person opened YappyChat", with the version and the anonymous usage statistics from usage.js. The server keeps them against a salted hash of the Twitch id.
  async function ping() {
    const today = new Date().toISOString().slice(0, 10);
    if (!apiOn() || !S.token || S.settings.sharePing === false || S.settings.lastPing === today) return;
    try { const v = await cg.version(), r = await cg.http({ url: API_URL + '/api/ping', method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ v, s: window.Usage ? Usage.snapshot() : undefined, u: window.Usage ? Usage.take() : undefined }) }); if (r.status === 200) { saveSettings({ lastPing: today }); if (window.Usage) Usage.clear(); } } catch (x) {}
  }
  // Save what I'm wearing to the supporter server (it checks my Twitch login and that I own each item)
  let pushT = 0;
  function pushLoadout() {
    clearTimeout(pushT); if (!apiOn() || !S.token) return;
    pushT = setTimeout(async () => {
      const r = await cg.http({ url: API_URL + '/api/me/loadout', method: 'PUT', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ loadout: S.settings.myLoadout || {} }) });
      if (r.status === 200) { toast('Saved. Everyone using YappyChat will see this within a few minutes.', { ms: 3000 }); serverLoadout = false; await load(true); applyHoliday(); }
      else toast((r.json && r.json.error) || 'Could not reach the supporter server. Only you can see this change for now.', { type: 'err', ms: 5000 });
    }, 700);
  }
  const mine = () => (S.me ? describe(S.me.id) : null);
  // Extra notification tones unlocked by sound packs
  function soundTones() { const m = mine(), out = []; if (!m) return out; Object.entries(Sounds.packs).forEach(([p, arr]) => { if (m.own.sounds.has(p)) arr.forEach(([k, l]) => out.push([k, ({ arcade: 'Arcade · ', spooky: 'Halloween · ' }[p] || 'Cozy · ') + l])); }); return out; }

  // ----- The shop lives on the website now: the heart goes straight to the perks page (you arrive signed in, no code needed) -----
  function openShop() { return openSite('/support'); }

  // ----- Perks the admin added (and the holiday calendar), fetched from /api/catalog -----
  let extraCss = null, hols = {};
  async function loadCatalog() {
    if (!apiOn()) return;
    try {
      const r = await cg.http({ url: API_URL + '/api/catalog?t=' + Math.floor(Date.now() / 60000) }); const c = r.status === 200 && r.json && r.json.catalog; if (!c) return;
      Object.keys(CATS).forEach((k) => { for (let i = CATS[k].length - 1; i >= 0; i--) if (CATS[k][i].custom) CATS[k].splice(i, 1); });
      Object.keys(CATS).forEach((k) => ((c[k] || {}).items || []).filter((x) => x.custom).forEach((x) => CATS[k].push({ id: x.id, name: x.name, text: x.name, price: x.price, note: x.note || '', color: x.color || '#7bd88f', shine: !!x.shine, dashed: !!x.dashed, custom: true })));
      // every custom perk's styling ships to everyone (so you can see other people's), after being checked again here
      const css = (c.custom || []).map((x) => SafeCss.check(x.css)).join('\n');
      if (!extraCss) { extraCss = document.createElement('style'); extraCss.id = 'perk-extra'; document.head.append(extraCss); }
      extraCss.textContent = css; hols = Object.fromEntries((c.holidays || []).map((h) => [h.id, h]));
    } catch (x) {}
  }
  // Message backgrounds can be turned off or made still in Settings > Chat
  const applyMsgBg = () => { const v = (S.settings && S.settings.msgBg) || 'on'; document.body.classList.toggle('mbg-off', v === 'off'); document.body.classList.toggle('mbg-still', v === 'still'); };
  const holidayOpen = (h) => (hols[h] ? !!hols[h].open : PD.window(h, Date.now()).open);

  // ----- "Your Perks": choose what you wear from what you own -----
  function selectorHtml() {
    const m = mine();
    const stale = entStale() ? `<div class="yp-stale" role="status">${ico('reload', 13)} Reconnecting to the supporter server. Your perks keep working meanwhile.</div>` : '';
    if (!m) return stale + `<div class="none">You are not on the supporter list yet. Supporters get badges, name effects, plates, titles, message backgrounds, entrances, Yappy skins and sound packs.</div><div class="btnrow"><button class="btn primary" id="yp-shop">${ico('heart', 15)} See perks</button><button class="btn" id="yp-refresh">${ico('reload', 14)} I just bought something: check again</button></div>`;
    const eq = m.eq, chip = (cat, id, label, on, own) => `<button class="chipbtn${on ? ' on' : ''}${own ? '' : ' locked'}" data-cat="${cat}" data-id="${id}" ${own ? '' : 'disabled data-tip="Not owned yet"'}>${e(label)}</button>`;
    const sectionName = (id) => { const h = id.slice(3); return HOL[h] ? HOL[h][0] + ' ' : ''; };
    const row = (cat, title, items, cur) => `<div class="yp-row"><div class="yp-t">${title}</div><div class="yp-chips">${chip(cat, '', 'None', !cur, true)}${items.map((x) => chip(cat, x.id, x.label, cur === x.id, m.own[cat] && m.own[cat].has(x.id))).join('')}</div></div>`;
    const seasonal = (pre, word, cat) => Object.keys(HOL).map((h) => ({ id: pre + h, label: HOL[h][0] + ' ' + word })).filter((x) => m.own[cat] && m.own[cat].has(x.id)); // holiday perks only show once you own them
    const pv = parts(S.me.id);
    const nm = pv ? `<span class="${pv.cls}" style="${pv.style}"><span class="name" style="--h:210;--s:80%;--l:65%">${e(S.me.login)}</span></span>` : '';
    return `<div class="yp-prev"><div class="yp-main"><div class="yp-top"><b>Preview</b><button class="yp-reload" id="yp-replay" data-tip="Replay the entrance" aria-label="Replay the entrance">${ico('reload', 15)}</button></div><div class="yp-line${pv && pv.mbg ? ' ' + pv.mbg : ''}" id="yp-line">${pv ? pv.badge + pv.title : ''}${nm}: Hello chat</div></div><div class="yp-box" id="yp-box" data-tip="Yappy, wearing your skin"></div></div>` +
      row('effects', 'Name effect', [...EFFECTS.map((x) => ({ id: x.id, label: x.name })), ...seasonal('sx-', 'effect', 'effects')], eq.effect) +
      row('plates', 'Name plate', [...PLATES.map((x) => ({ id: x.id, label: x.name })), ...seasonal('sp-', 'plate', 'plates')], eq.plate) +
      row('titles', 'Title', TITLES.map((t) => ({ id: t.id, label: t.text })).filter((t) => m.own.titles.has(t.id) || !/^(st-|chief|gifter|helper|tester|contributor)/.test(t.id)), eq.title) +
      row('entrances', 'Entrance', [...ENTRANCES.map((x) => ({ id: x.id, label: x.name })), ...seasonal('se-', 'entrance', 'entrances')], eq.entrance) +
      row('messages', 'Message background', MESSAGES.map((x) => ({ id: x.id, label: x.name })), eq.message) +
      row('skins', 'Yappy skin', SKINS.filter((x) => (!x.retired && !x.season) || m.own.skins.has(x.id)).map((x) => ({ id: x.id, label: x.name.replace(' (animated)', '') })), eq.skin) + partnerSelector(m) +
      `<div class="sd" style="margin-top:12px">Saved to the supporter server. Everyone using YappyChat sees your choices, entrance included, within a few minutes.</div><div class="btnrow" style="margin-top:8px"><button class="btn" id="yp-shop">${ico('heart', 15)} Get more perks</button><button class="btn" id="yp-refresh">${ico('reload', 14)} Check for new perks</button></div>` + stale;
  }
  function partnerSelector(m) {
    const have = [...(m.own.partner || [])].map((k) => ({ k, pi: pitems.get(k) })).filter((x) => x.pi && x.pi.it.kind !== 'bundle'); if (!have.length) return '';
    const slots = [['pskin', 'Partner skin', 'skin'], ['ptheme', 'Partner colours', 'theme'], ['pbadge', 'Partner badge', 'badge'], ['ptitle', 'Partner title', 'title']];
    return slots.map(([slot, title, kind]) => { const its = have.filter((x) => x.pi.it.kind === kind); if (!its.length) return ''; const cur = m.eq[slot];
      return `<div class="yp-row"><div class="yp-t">${title}</div><div class="yp-chips"><button class="chipbtn${cur ? '' : ' on'}" data-cat="${slot}" data-id="">None</button>${its.map((x) => `<button class="chipbtn${cur === x.k ? ' on' : ''}" data-cat="${slot}" data-id="${e(x.k)}">${e(x.pi.p.name)} · ${e(x.pi.it.name)}</button>`).join('')}</div></div>`; }).join('');
  }
  function bindSelector(root, refresh) {
    // Every swap redraws the preview straight away (name, badge, title, Yappy in the box) and plays a newly picked entrance; the scroll position is kept so the sticky preview stays put
    const save = (patch) => {
      const cur = { ...(S.settings.myLoadout || {}), ...(mine() ? mine().eq : {}) }; Object.assign(cur, patch); saveSettings({ myLoadout: cur }); serverLoadout = false; applyHoliday();
      let sc = root.parentElement; while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement; const top = sc ? sc.scrollTop : 0;
      refresh(); if (sc) sc.scrollTop = top;
      const m = mine(), ln = $('#yp-line', root); if (ln && m && m.eq.entrance && 'entrance' in patch) Holiday.playEntrance(ln, m.eq.entrance);
      pushLoadout();
    };
    root.querySelectorAll('.chipbtn').forEach((b) => (b.onclick = () => { const k = { effects: 'effect', plates: 'plate', titles: 'title', entrances: 'entrance', messages: 'message', skins: 'skin', pskin: 'pskin', ptheme: 'ptheme', pbadge: 'pbadge', ptitle: 'ptitle' }[b.dataset.cat]; save({ [k]: b.dataset.id }); }));
    const sh = $('#yp-shop', root); if (sh) sh.onclick = () => openShop();
    const rf = $('#yp-refresh', root); if (rf) rf.onclick = async () => { rf.disabled = true; const had = mine() ? JSON.stringify(mine().en.owned || {}) : ''; const okk = await refreshMine(true); rf.disabled = false; if (!okk) return toast('Could not reach the supporter server. Try again in a minute.', { type: 'err', ms: 4000 }); const now = mine() ? JSON.stringify(mine().en.owned || {}) : ''; toast(now !== had ? 'New perks found. Pick what to wear below.' : 'Nothing new yet. A payment can take a minute to be confirmed.', { ms: 4000 }); refresh(); };
    const rp = $('#yp-replay', root), ln = $('#yp-line', root), bx = $('#yp-box', root); if (bx) Yappy.mount(bx, { follow: true, skin: true });
    if (rp && ln) rp.onclick = () => { const m = mine(), q = m && m.eq.entrance; ln.className = 'yp-line' + ((mine() && parts(S.me.id).mbg) ? ' ' + parts(S.me.id).mbg : ''); ln.querySelectorAll('.entfx').forEach((x) => x.remove()); void ln.offsetWidth; if (q) Holiday.playEntrance(ln, q); else toast('Pick an entrance first', { ms: 1800 }); };
  }

  const gd = document.createElement('div'); gd.innerHTML = gradDefs(); document.body.append(gd.firstChild);
  window.Perks = { applyMsgBg, holidayOpen, loadCatalog, MESSAGES, refreshMine, forgetMine, openSite, entStale, partners: () => partners, partnerSkin, partnerTheme, ping, TIP_URL, API_URL, REGISTRY_URL, TIERS, EFFECTS, PLATES, TITLES, SKINS, HOL, load, parts, describe, mine, openShop, tierFor, tierBadge, diamondBadge, soundTones, selectorHtml, bindSelector };
})();
