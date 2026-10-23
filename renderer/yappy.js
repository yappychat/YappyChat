(function () {
  'use strict';
  const D = { body: 'M 458.457031 798.957031 L 458.457031 798.960938 C 348.824219 1108.023438 479.269531 1443.910156 752.730469 1603.039062 L 798.929688 1796.761719 C 802.261719 1810.738281 818.890625 1816.636719 830.28125 1807.886719 L 988.230469 1686.578125 C 1300.839844 1735.34375 1613.789062 1556.738281 1723.421875 1247.671875 C 1847.332031 898.359375 1664.605469 514.738281 1315.296875 390.832031 C 1241.121094 364.519531 1165.398438 352.035156 1090.945312 352.035156 C 814.773438 352.035156 556.054688 523.820312 458.457031 798.957031', mouth: 'M 1361.902344 1416.421875 C 1376.554688 1402.421875 1373.242188 1380.851562 1363.640625 1365.53125 C 1349.046875 1343.699219 1327.445312 1329.671875 1301.570312 1322.554688 C 1243.664062 1306.632812 1181.4375 1318.355469 1131.792969 1353.695312 C 1170.546875 1412.007812 1237.867188 1445.371094 1307.105469 1437.960938 C 1327.03125 1435.828125 1347.089844 1430.582031 1361.902344 1416.421875 M 1058.832031 1265.667969 C 1046.863281 1268.265625 1042.613281 1280.308594 1036.359375 1280.542969 C 1034.347656 1280.621094 1030.902344 1279.226562 1029.691406 1276.132812 C 1025.664062 1265.820312 1029.140625 1254.128906 1037.707031 1246.304688 C 1055.703125 1229.871094 1087.566406 1230.125 1092.105469 1239.289062 C 1093.054688 1241.207031 1092.253906 1244.554688 1088.96875 1248.289062 C 1113.417969 1257.3125 1138.707031 1262.273438 1166.585938 1264.207031 C 1258.308594 1270.566406 1349.28125 1256.96875 1436.03125 1226.78125 C 1466.625 1216.136719 1493.136719 1202.507812 1521.285156 1187.691406 C 1524.789062 1185.847656 1528.792969 1186.578125 1530.90625 1187.683594 C 1533.585938 1189.089844 1535.574219 1193.960938 1534.148438 1197.734375 L 1523.160156 1232.644531 L 1497.421875 1302.488281 C 1461.871094 1388.617188 1389.800781 1460.503906 1293.066406 1461.027344 C 1177.820312 1461.652344 1084.476562 1376.464844 1058.832031 1265.667969', eyeR: 'M 1506.585938 1021.5625 C 1512.578125 1071.050781 1493.945312 1135.320312 1449.183594 1145.179688 C 1406.90625 1154.496094 1371.941406 1113.515625 1354.117188 1072.90625 C 1321.714844 999.082031 1305.453125 877.902344 1352.988281 813.453125 C 1369.09375 791.617188 1395.925781 782.21875 1420.507812 793.691406 C 1455.585938 810.058594 1474.371094 857.160156 1483.085938 896.128906 L 1420.039062 970.007812 L 1492.058594 1007.3125 C 1497.503906 1010.132812 1505.597656 1013.402344 1506.585938 1021.5625', eyeL: 'M 1174.738281 1160.257812 C 1157.984375 1185.863281 1128.136719 1193.875 1101.054688 1182.015625 C 1011.238281 1142.683594 972.773438 926.792969 1032.242188 849.324219 C 1055.8125 818.625 1096.363281 816.886719 1123.886719 843.921875 C 1148.910156 867.632812 1163.273438 899.933594 1172.140625 934.113281 L 1108.972656 1003.078125 L 1197.242188 1039.464844 C 1199.246094 1061.339844 1199.265625 1081.628906 1196.464844 1102.929688 C 1193.015625 1123.320312 1187.710938 1143.066406 1174.738281 1160.257812', tongue: 'M 1361.902344 1416.421875 C 1347.089844 1430.582031 1327.03125 1435.828125 1307.105469 1437.960938 C 1237.867188 1445.371094 1170.546875 1412.007812 1131.792969 1353.695312 C 1181.4375 1318.355469 1243.664062 1306.632812 1301.570312 1322.554688 C 1327.445312 1329.671875 1349.046875 1343.699219 1363.640625 1365.53125 C 1373.242188 1380.851562 1376.554688 1402.421875 1361.902344 1416.421875' };
  let uid = 0, root = null, bub = null, ctl = null, opts = {}, cur = null, queue = [], timer = null, fadeT = null; const all = new Set(); const acc = { holiday: '', skin: '', back: '', love: false, pink: false };
  const WIDE = '410 345 1360 1480', TALL = '410 -140 1360 1965', BACK = '290 -140 1600 1965'; // BACK is wider, for capes and feathers that stick out of the sides
  const accHtml = (withSkin, A) => (withSkin ? A.skin : '') + A.holiday;
  const applyAcc = (c) => { const A = c.over || acc, h = accHtml(c.skin, A), b = c.skin ? A.back : ''; // a mount can wear its own outfit (the shop previews) instead of the app-wide one
    c.acc.innerHTML = h; c.back.innerHTML = b; c.el.setAttribute('viewBox', b ? BACK : h ? TALL : WIDE); c.el.style.setProperty('--yr', b || h ? 1965 / 1480 : 1); c.el.classList.toggle('love', !!A.love); c.el.classList.toggle('pink', !!A.pink && c.skin); };
  const svg = () => { const id = 'yg' + uid++; return `<svg class="yappy-svg" viewBox="410 345 1360 1480" data-mood="happy" aria-hidden="true"><defs><linearGradient id="${id}" x1="0.35" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#eef1f6"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><g class="y-back"></g><path d="${D.body}" fill="url(#${id})"/><g class="y-face"><g class="y-eyes"><path class="y-eye" d="${D.eyeL}" fill="#191d23"/><path class="y-eye" d="${D.eyeR}" fill="#191d23"/><g class="y-love"><g transform="translate(1104 1008)"><g class="y-heart"><path d="M0 38C-62 -8 -52 -58 -22 -58C-8 -58 0 -46 0 -38C0 -46 8 -58 22 -58C52 -58 62 -8 0 38Z" transform="scale(3.1)" fill="#ff3d71"/><ellipse cx="-62" cy="-92" rx="26" ry="16" transform="rotate(-35 -62 -92)" fill="#fff" opacity=".75"/></g></g><g transform="translate(1410 975)"><g class="y-heart d2"><path d="M0 38C-62 -8 -52 -58 -22 -58C-8 -58 0 -46 0 -38C0 -46 8 -58 22 -58C52 -58 62 -8 0 38Z" transform="scale(3.1)" fill="#ff3d71"/><ellipse cx="-62" cy="-92" rx="26" ry="16" transform="rotate(-35 -62 -92)" fill="#fff" opacity=".75"/></g></g></g></g><g class="y-mouth m-happy"><path d="${D.mouth}" fill="#191d23"/><path d="${D.tongue}" fill="#ef6048"/></g><ellipse class="y-mouth m-o" cx="1290" cy="1345" rx="44" ry="58" fill="#191d23"/><path class="y-mouth m-flat" d="M1180 1352 Q1290 1392 1400 1338" fill="none" stroke="#191d23" stroke-width="28" stroke-linecap="round"/></g><g class="y-acc"></g></svg>`; };

  // Mounts an animated Yappy: blinking, wandering eyes, following the cursor, and changing expressions
  function mount(host, o = {}) {
    host.innerHTML = svg(); const el = host.firstElementChild, accEl = el.querySelector('.y-acc'), backEl = el.querySelector('.y-back'); let alive = true, mood = 'happy', held = null, lastMouse = 0;
    const on = () => Y.animate !== false && seen !== false, set = (k, v) => el.style.setProperty(k, v);
    const later = (fn, ms) => setTimeout(() => alive && fn(), ms);
    const look = (x, y) => { set('--ex', x.toFixed(1)); set('--ey', y.toFixed(1)); };
    const setMood = (m) => { mood = m; el.dataset.mood = m; };
    const blink = () => { if (on()) { set('--bl', 0.08); later(() => set('--bl', 1), 130); if (Math.random() < 0.25) later(() => { set('--bl', 0.08); later(() => set('--bl', 1), 120); }, 280); } later(blink, 2400 + Math.random() * 3600); };
    const wander = () => { if (on() && !held && Date.now() - lastMouse > 2500) look((Math.random() * 2 - 1) * 55, (Math.random() * 2 - 1) * 38); later(wander, 1300 + Math.random() * 2200); };
    const idle = () => { if (on() && !held && o.idle !== false) { setMood(['wink', 'excited', 'thinking', 'surprised'][Math.floor(Math.random() * 4)]); later(() => { if (!held) setMood('happy'); }, 1400 + Math.random() * 1200); } later(idle, 7000 + Math.random() * 7000); };
    let mvE = null, mvQ = 0; const onMove = (e) => { if (!on() || !o.follow || held) return; mvE = e; if (!mvQ) mvQ = requestAnimationFrame(() => { mvQ = 0; onMoveNow(mvE); }); }; // at most once per frame
    const onMoveNow = (e) => { if (!on() || !o.follow || held) return; lastMouse = Date.now(); const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260); look((dx / d) * 60 * k, (dy / d) * 45 * k); };
    // Buzz: he vibrates and goes cross-eyed for a moment, for notifications
    let bz = 0; const buzz = (ms = 1700) => { if (!on()) return; const t = ++bz; setMood('buzz'); el.classList.add('buzzing'); later(() => { if (t !== bz) return; el.classList.remove('buzzing'); setMood(held || 'happy'); }, ms); };
    document.addEventListener('mousemove', onMove);
    // A Yappy that is not on screen (the login page behind the app, a closed panel) stops animating: his SVG animations otherwise keep redrawing
    let seen = true; const io = window.IntersectionObserver ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; if (seen) delete el.dataset.off; else el.dataset.off = '1'; try { if (!seen) el.pauseAnimations(); else if (!document.body.classList.contains('bg')) el.unpauseAnimations(); } catch (e) {} }) : null; if (io) io.observe(el);
    later(blink, 1200); later(wander, 900); later(idle, 5000);
    const self = { el, acc: accEl, back: backEl, skin: !!o.skin, over: o.acc ? { holiday: '', skin: '', back: '', love: false, pink: false, ...o.acc } : null, setMood, buzz, look, hold: (m) => { held = m; setMood(m); }, release: () => { held = null; setMood('happy'); }, destroy: () => { alive = false; if (io) io.disconnect(); all.delete(self); document.removeEventListener('mousemove', onMove); } };
    all.add(self); applyAcc(self); return self;
  }

  // The corner assistant: bubble with a suggestion, action buttons, close button
  function init(o) {
    if (root) return; opts = o;
    root = document.createElement('div'); root.id = 'yappy'; root.className = 'yappy hidden';
    root.innerHTML = '<div class="y-wrap"><button class="y-x" title="Hide Yappy" aria-label="Hide Yappy">\u00d7</button><div class="y-host" title="Click me, or drag me somewhere else"></div></div>';
    // The speech bubble is separate from the mascot: Yappy can be moved anywhere, notices always appear bottom-middle
    bub = document.createElement('div'); bub.className = 'y-bubble hidden'; bub.innerHTML = '<button class="y-bx" type="button" aria-label="Dismiss" title="Dismiss">\u00d7</button><div class="y-text"></div><div class="y-actions"></div>';
    document.body.append(root, bub); ctl = mount(root.querySelector('.y-host'), { follow: true, skin: true });
    bub.querySelector('.y-bx').onclick = () => { if (cur && !cur.tip && opts.onDismiss) opts.onDismiss(cur); close(); };
    root.querySelector('.y-x').onclick = () => { close(); queue = []; root.classList.add('hidden'); o.onHide && o.onHide(); };
    let dg = null, justDragged = false; const wrap = root.querySelector('.y-wrap'), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    wrap.addEventListener('pointerdown', (e) => { if (e.button || e.target.closest('.y-x')) return; const r = root.getBoundingClientRect(); dg = { sx: e.clientX, sy: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom, moved: false }; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', (e) => {
      if (!dg) return; const dx = e.clientX - dg.sx, dy = e.clientY - dg.sy; if (!dg.moved && Math.hypot(dx, dy) < 6) return;
      dg.moved = true; root.classList.remove('docked'); root.classList.add('moved', 'dragging'); syncSlot(); dg.pos = { r: Math.round(clamp(dg.r - dx, 4, innerWidth - root.offsetWidth - 4)), b: Math.round(clamp(dg.b - dy, 4, innerHeight - root.offsetHeight - 4)) };
      root.style.right = dg.pos.r + 'px'; root.style.bottom = dg.pos.b + 'px';
      const sl = slotEl(); if (sl) sl.classList.toggle('hint', nearHome());
    });
    // Drop him back beside the Chat button and he snaps into his place there
    const nearHome = () => { const send = document.getElementById('send'), sl = slotEl(); if (!send || !sl || !send.offsetWidth) return false; const s = send.getBoundingClientRect(), r = root.getBoundingClientRect(), tx = s.right + 8 + r.width / 2, ty = s.top + s.height / 2; return Math.hypot(r.left + r.width / 2 - tx, r.top + r.height / 2 - ty) < Math.max(70, r.width * 1.2); };
    const end = () => { if (!dg) return; const sl = slotEl(); if (sl) sl.classList.remove('hint'); if (dg.moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 50); root.classList.remove('dragging'); if (nearHome()) { o.onMove && o.onMove(null); place(null); } else o.onMove && o.onMove(dg.pos); } dg = null; };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.y-x')) return; if (!justDragged) o.onClick && o.onClick(); }); // on the wrapper: the drag captures the pointer, so the click lands here
    addEventListener('resize', () => { if (root.classList.contains('moved')) { const r = parseFloat(root.style.right) || 0, b = parseFloat(root.style.bottom) || 0; root.style.right = clamp(r, 4, Math.max(4, innerWidth - root.offsetWidth - 4)) + 'px'; root.style.bottom = clamp(b, 4, Math.max(4, innerHeight - root.offsetHeight - 4)) + 'px'; } });
  }
  // By default Yappy sits to the right of the Chat button, as tall as the button (the slot #yslot in the bar reserves his place). Dragging him out leaves the bar the full width.
  // When the bar is hidden (a message box in every chat) he stays in the corner instead.
  const slotEl = () => document.getElementById('yslot');
  const dockable = (p) => { const sl = slotEl(); return !!(root && sl && !(p && p.r != null) && !root.classList.contains('hidden') && !root.classList.contains('dragging')); };
  function syncSlot() {
    const sl = slotEl(); if (!root || !sl) return; const on = root.classList.contains('docked');
    sl.classList.toggle('on', on); if (!on) return;
    const send = document.getElementById('send'), bh = send && send.offsetHeight ? send.offsetHeight : 40; document.documentElement.style.setProperty('--bh', bh + 'px');
    const r = sl.getBoundingClientRect(); root.style.right = Math.round(innerWidth - r.right) + 'px'; root.style.bottom = Math.round(innerHeight - r.bottom) + 'px';
  }
  let lastPos;
  const place = (p) => {
    lastPos = p; if (!root) return; const moved = !!(p && p.r != null), dock = dockable(p);
    root.classList.toggle('moved', moved && !dock); root.classList.toggle('docked', dock);
    if (dock) syncSlot(); else { root.style.right = moved ? p.r + 'px' : ''; root.style.bottom = moved ? p.b + 'px' : ''; syncSlot(); }
  };
  const setVisible = (v) => { if (!root) return; root.classList.toggle('hidden', !v); if (!v) { close(); queue = []; } place(lastPos); };
  addEventListener('resize', () => syncSlot());
  if (window.ResizeObserver) { const watch = () => { const m = document.querySelector('.mcol'); if (m) new ResizeObserver(() => syncSlot()).observe(m); else setTimeout(watch, 500); }; watch(); }
  const say = (s) => { if (!root || root.classList.contains('hidden')) return; if (cur) queue.push(s); else show(s); };
  function show(s) {
    cur = s; clearTimeout(fadeT); root.classList.add('busy'); const bb = bub; bb.classList.remove('hidden', 'out'); bub.querySelector('.y-text').textContent = s.text;
    const a = bub.querySelector('.y-actions'); a.innerHTML = '';
    (s.actions || []).forEach((x) => { const b = document.createElement('button'); b.className = 'btn sm' + (x.primary ? ' primary' : ''); b.textContent = x.label; b.onclick = () => { try { x.fn(); } catch (e) {} close(); }; a.append(b); });
    if (!s.tip) { const n = document.createElement('button'); n.className = 'btn sm ghost'; n.textContent = 'Not now'; n.onclick = () => { opts.onDismiss && opts.onDismiss(s); close(); }; a.append(n); }
    ctl.hold(s.mood || 'surprised'); if (!s.tip && opts.onSay) opts.onSay(s);
    clearTimeout(timer); timer = setTimeout(close, s.tip ? 15000 : 41000);
  }
  function close() { clearTimeout(timer); const was = cur; cur = null; if (!root) return; const bb = bub; ctl.release(); const next = () => { if (queue.length) setTimeout(() => { if (!cur && queue.length) show(queue.shift()); }, 300); };
    if (!was || bb.classList.contains('hidden')) { root.classList.remove('busy'); return next(); }
    bb.classList.add('out'); clearTimeout(fadeT); fadeT = setTimeout(() => { if (cur) return; bb.classList.add('hidden'); bb.classList.remove('out'); root.classList.remove('busy'); next(); }, 650); }
  // Corner Yappy buzzes when he is on screen; otherwise the little one in the top bar does
  const buzz = () => { const corner = root && !root.classList.contains('hidden'); if (corner && ctl) ctl.buzz(); else for (const c of all) if (c.el.closest('#brandMark')) c.buzz(); };
  const setAccessories = (o) => { Object.assign(acc, o); [...all].forEach((c) => { if (!c.el.isConnected) return c.destroy(); applyAcc(c); }); }; // mounts that were drawn into a window since closed are dropped here
  const Y = (window.Yappy = { animate: true, mount, init, setVisible, place, say, setAccessories, close, buzz, busy: () => !!cur, paths: D });
})();
