/* ---------- Several streams (up to 4) in the chat grid, within the six-pane limit ----------
   One stream behaves as it always did: a floating or snapped window. The "+" next to its channel menu adds more. From two streams on,
   every stream becomes a pane in the same grid as the chats: streams along the top, chats below. Streams + chats never exceed 6.

   Twitch embed rules, kept for every stream pane:
   - the official player only (Twitch's own page, in a webview, with the parent set), never altered or restyled
   - the video area is never smaller than 400 x 300. If the window is too small for that, the streams are hidden with a note and the
     chats stay; an undersized embed is never shown
   - nothing of ours is drawn over a playing video. Dialogs are centred; a stream a dialog would touch is hidden for as long as it is open,
     and the others stay clear (the dimming leaves a hole over them). Toasts and Yappy move out of the way
   - every extra stream starts muted, so several tabs of sound never start at once */
const MV_MAX = 4, MV_W = 402, MV_H = 300 + 34 + 2, MV_CHAT_H = 150;
const mvExtra = () => ((S.settings && S.settings.pip && S.settings.pip.extra) || []).filter((x) => S.chats.has(x));
// "Between the chats": one stream (or more) sits in the middle of two or more stacked chats, so it is a pane in the grid like the others
const mvBetween = () => !!(S.settings && S.settings.pip && S.settings.pip.mvLay === 'between' && S.settings.split && (S.settings.splitSet || []).filter((x) => S.chats.has(x)).length >= 2);
const mvOn = () => !!(S.settings && S.settings.pip && S.settings.pip.open && (mvExtra().length || mvBetween()) && S.chats.get(pipLogin()));
// The streams on show, in order. A stream that would repeat an earlier one is marked and shows a note instead of a second player.
function mvList() {
  const p = S.settings.pip; if (!p.open || !S.chats.get(pipLogin())) return [];
  const out = [{ id: 'main', login: pipLogin(), follow: p.channel === 'follow' }, ...mvExtra().map((l) => ({ id: 'x:' + l, login: l, follow: false }))], seen = new Set();
  const ord = p.mvOrder || []; out.sort((a, b) => { const x = ord.indexOf(a.id), y = ord.indexOf(b.id); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
  out.forEach((s) => { s.dupe = seen.has(s.login); seen.add(s.login); }); return out;
}
// Where the streams sit relative to the chats: 'top' (default), 'bottom', 'left' or 'right' (the side the chats are on)
const MV_LAYS = ['top', 'left', 'right', 'bottom', 'between'], MV_LAY_NAME = { top: 'Streams above, chats below', bottom: 'Chats above, streams below', left: 'Chats on the left, streams on the right', right: 'Chats on the right, streams on the left', between: 'Streams in the middle, chats above and below' };
const mvLay = () => { const l = S.settings && S.settings.pip && S.settings.pip.mvLay; if (l === 'between') return mvBetween() ? l : 'top'; return MV_LAYS.includes(l) ? l : 'top'; };
const mvCount = () => (mvOn() ? mvList().length : 0);
const chatCols = (n, W) => { let c = Math.max(1, Math.min(n, Math.floor(W / 260))); if (n === 4 && c > 2 && W < 1200) c = 2; if (n >= 5) c = Math.min(c, 3); return c; };
// cells(count, perRow, firstRow): where each pane goes on a 60-column grid. A row with fewer panes shares its width out evenly.
function mvCells(count, perRow, r0) {
  const out = []; for (let i = 0; i < count; i++) { const row = Math.floor(i / perRow), inRow = Math.min(perRow, count - row * perRow), k = i - row * perRow, span = 60 / inRow; out.push({ r: r0 + row + 1, c: 1 + k * span, span, inRow, rspan: 1 }); } return out;
}
// s streams, n chats, in a W x H area. ok:false when each video cannot be at least 400 x 300 and still leave room for the chats.
// lay: 'top' | 'bottom' | 'left' | 'right'. rt = share of the height the streams take (top/bottom), rs = share of the width the chats take (left/right).
function mvPlan(s, n, W, H, lay = 'top', rt, rs) {
  const cc = n ? chatCols(n, W) : 1, cr = n ? Math.ceil(n / cc) : 0, chatMin = cr * MV_CHAT_H;
  if (!s) return { ok: true, rows: cr ? `repeat(${cr},minmax(0,1fr))` : '', streams: [], chats: mvCells(n, cc, 0) };
  if (lay === 'left' || lay === 'right') {
    if (!n) lay = 'top'; else for (let r = Math.min(0.7, Math.max(0.15, rs || 0.3)); r >= 0.149; r -= 0.05) {
      const Ws = W * (1 - r); let sc = Math.min(s, Math.floor(Ws / MV_W)); if (s === 4 && sc === 3) sc = 2; if (sc < 1) continue;
      const sr = Math.ceil(s / sc); if (Math.floor(H / sr) < MV_H) continue;
      const per = 60 / sr, cs = 60 / n, off = lay === 'left' ? 1 : 0, streams = [], chats = [];
      for (let i = 0; i < s; i++) { const row = Math.floor(i / sc), inRow = Math.min(sc, s - row * sc), k = i - row * sc, span = sc / inRow; streams.push({ r: 1 + row * per, rspan: per, c: off + 1 + k * span, span, inRow }); }
      for (let i = 0; i < n; i++) chats.push({ r: 1 + i * cs, rspan: cs, c: lay === 'left' ? 1 : sc + 1, span: 1, inRow: 1 });
      const st = `repeat(${sc},minmax(0,${((1 - r) * 100 / sc).toFixed(3)}fr))`, ch = `minmax(0,${(r * 100).toFixed(3)}fr)`;
      return { ok: true, lay, side: true, cols: lay === 'left' ? ch + ' ' + st : st + ' ' + ch, rows: 'repeat(60,minmax(0,1fr))', streams, chats, grip: { v: true, x: lay === 'left' ? r * W : W - r * W }, ratio: r };
    }
    if (n) return { ok: false };
  }
  let sc = Math.min(s, Math.floor(W / MV_W)); if (s === 4 && sc === 3) sc = 2; if (sc < 1) return { ok: false };
  const sr = Math.ceil(s / sc), min = sr * MV_H;
  if (lay === 'between' && n >= 2) { // the first half of the chats above the streams, the rest below
    const n1 = Math.ceil(n / 2), n2 = n - n1, c1 = chatCols(n1, W), c2 = chatCols(n2, W), r1 = Math.ceil(n1 / c1), r2 = Math.ceil(n2 / c2);
    if (min + (r1 + r2) * MV_CHAT_H > H) return { ok: false };
    const budget = Math.min(H - (r1 + r2) * MV_CHAT_H, Math.max(min, Math.round(H * 0.5))), per = Math.floor(budget / sr), hs = [];
    for (let r = 0; r < sr; r++) hs.push(Math.max(MV_H, per));
    return { ok: true, lay: 'between', rows: `repeat(${r1},minmax(0,1fr)) ${hs.map((h) => h + 'px').join(' ')} repeat(${r2},minmax(0,1fr))`, streams: mvCells(s, sc, r1), chats: [...mvCells(n1, c1, 0), ...mvCells(n2, c2, r1 + sr)], grip: null, ratio: 0.5 };
  }
  if (min + chatMin > H) return { ok: false };
  const budget = rt ? Math.min(H - chatMin, Math.max(min, Math.round(H * Math.min(0.85, Math.max(0.25, rt))))) : Math.min(H - chatMin, Math.max(min, Math.round(H * 0.62))), per = Math.floor(budget / sr), hs = [];
  for (let r = 0; r < sr; r++) { const inRow = Math.min(sc, s - r * sc), natural = Math.round(((W / inRow) * 9) / 16) + 36; hs.push(Math.max(MV_H, rt ? per : Math.min(natural, per))); }
  const sum = hs.reduce((a, x) => a + x, 0), sRows = hs.map((h) => h + 'px').join(' '), cRows = cr ? `repeat(${cr},minmax(0,1fr))` : '', bottom = lay === 'bottom' && cr;
  return { ok: true, lay: bottom ? 'bottom' : 'top', rows: bottom ? cRows + ' ' + sRows : sRows + (cr ? ' ' + cRows : ''), streams: mvCells(s, sc, bottom ? cr : 0), chats: mvCells(n, cc, bottom ? 0 : sr), grip: cr ? { v: false, y: bottom ? H - sum : sum } : null, ratio: sum / H };
}
// Whether the window has room for one more stream (and the chats that remain)
function mvRoomFor(streams) {
  const ws = $('#ws'), W = ws.clientWidth, H = ws.clientHeight, chats = Math.min(S.settings.split ? (S.settings.splitSet || []).filter((x) => S.chats.has(x)).length || 1 : 1, 6 - streams);
  return mvPlan(streams, Math.max(1, chats), W, H, mvLay(), S.settings.pip.mvRt, S.settings.pip.mvRs).ok;
}

function mvPane(st) {
  let pane = document.querySelector(`#chats .vpane[data-sid="${CSS.escape(st.id)}"]`); if (pane) return pane;
  pane = el('div', 'vpane'); pane.dataset.sid = st.id; $('#chats').append(pane); return pane;
}
function mvFill(pane, st) {
  const p = S.settings.pip, key = st.login + '|' + st.dupe, room = mvList().length < MV_MAX;
  if (!pane.querySelector('.sp-head')) {
    pane.innerHTML = `<div class="sp-head"><select data-sp="channel" data-tip="Which stream to show"></select><button data-sp="add" class="addst" aria-label="Add another stream">${ico('plus', 14)}<span>Add Stream</span></button><span class="grow"></span><button data-sp="lay" aria-label="Change layout">${ico('grid', 16)}</button><button data-sp="close" data-tip="Close this stream" aria-label="Close stream">${ico('x', 16)}</button></div><div class="sp-body"></div><div class="sp-note hidden">Hidden while a window is open over it</div>`;
    pane.dataset.opts = ''; pane.dataset.key = '';
  }
  const opts = (st.id === 'main' ? `<option value="follow" ${p.channel === 'follow' ? 'selected' : ''}>Follow active tab</option>` : '') + [...S.chats.values()].map((x) => `<option value="${x.login}" ${(st.id === 'main' ? p.channel === x.login : st.login === x.login) ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  if (pane.dataset.opts !== opts) { pane.dataset.opts = opts; pane.querySelector('select').innerHTML = opts; }
  const head = pane.querySelector('.sp-head'); head.draggable = true; head.dataset.tip = ''; const lb = pane.querySelector('[data-sp=lay]'); lb.dataset.tip = MV_LAY_NAME[mvLay()] + '. Click to change the layout';
  const add = pane.querySelector('[data-sp=add]'); add.disabled = !room; add.dataset.tip = room ? 'Add another stream (up to 4)' : 'Four streams is the most';
  if (pane.dataset.key !== key) { // the player is rebuilt only when the channel changes
    pane.dataset.key = key; const body = pane.querySelector('.sp-body'); body.innerHTML = ''; pane.style.removeProperty('--cc'); const col = chanColor(st.login); if (col) pane.style.setProperty('--cc', col); pane.classList.toggle('cc', !!col);
    if (st.dupe) { body.innerHTML = `<div class="sp-dupe">${esc((S.chats.get(st.login) || {}).name || st.login)} is already shown in another stream. Pick a different channel in the menu above.</div>`; return; }
    checkSubAds(st.login); const muted = st.id === 'main' ? !!p.muted : true, wv = document.createElement('webview'); wv.className = 'sp-view'; wv.setAttribute('partition', 'persist:player'); wv.setAttribute('allowpopups', ''); wv.setAttribute('src', playerSrc(st.login, muted)); body.append(wv); watchPlayerFullscreen(wv);
    wv.addEventListener('did-fail-load', (ev) => { if (ev.isMainFrame && ev.errorCode !== -3 && S.playerBase.hosted && !S.hostedFail && wv.src.startsWith(S.playerBase.hosted)) { S.hostedFail = true; wv.src = playerSrc(st.login, muted); } });
  }
}
function mvClear() { document.querySelectorAll('#chats .vpane, #chats .mvgrip').forEach((x) => x.remove()); $('#chats .mvwarn') && $('#chats .mvwarn').remove(); S.mvKey = ''; $('#chats').classList.remove('mv'); }

// Called from applySplit(): lays the streams and the chats out together. `chats` is the list of chat logins to show.
function mvLayout(chats) {
  const box = $('#chats'), list = mvList(), W = box.clientWidth, H = box.clientHeight; const pp = S.settings.pip; let pl = mvPlan(list.length, chats.length, W, H, mvLay(), pp.mvRt, pp.mvRs), small = !pl.ok;
  if (small) pl = mvPlan(0, chats.length, W, H);
  box.classList.add('mv'); box.style.gridTemplateColumns = pl.cols || 'repeat(60,minmax(0,1fr))';
  mvGrip(small ? null : pl.grip);
  let warn = box.querySelector('.mvwarn');
  if (small) {
    if (!warn) { warn = el('div', 'mvwarn'); box.prepend(warn); }
    warn.innerHTML = `<span>${ico('stream', 16)} This window is too small to show ${list.length} streams. Twitch needs each video to be at least 400 x 300, so the streams are hidden. Make the window bigger or close a stream.</span><button class="btn sm" data-sp="shrink">Close a stream</button>`;
    warn.style.gridColumn = '1 / -1'; warn.style.gridRow = '1'; box.style.gridTemplateRows = `auto ${pl.rows}`;
  } else { if (warn) warn.remove(); box.style.gridTemplateRows = pl.rows; }
  const rowShift = small ? 1 : 0;
  const ids = new Set(list.map((s) => s.id));
  box.querySelectorAll('.vpane').forEach((x) => { if (!ids.has(x.dataset.sid)) x.remove(); });
  list.forEach((st, i) => {
    const pane = mvPane(st); pane.classList.toggle('hidden', small); pane.classList.toggle('small', small);
    if (small) { pane.querySelectorAll('webview').forEach((w) => w.remove()); pane.dataset.key = ''; pane.dataset.opts = ''; return; }
    mvFill(pane, st); const c = pl.streams[i]; pane.style.gridColumn = `${c.c} / span ${c.span}`; pane.style.gridRow = c.rspan > 1 ? `${c.r} / span ${c.rspan}` : String(c.r); pane.style.order = i;
  });
  S.chats.forEach((x) => {
    const idx = chats.indexOf(x.login), show = idx >= 0; x.shown = show; x.view.classList.toggle('hidden', !show); x.view.classList.toggle('focus', !!S.settings.split && x.login === S.active);
    if (show) { const c = pl.chats[idx]; x.view.style.gridColumn = `${c.c} / span ${c.span}`; x.view.style.gridRow = c.rspan > 1 ? `${c.r + rowShift} / span ${c.rspan}` : String(c.r + rowShift); x.view.style.order = 10 + idx; x.view.dataset.col = 0; x.view.dataset.last = '1'; if (x.stick) x.list.scrollTop = x.list.scrollHeight; }
  });
  box.dataset.n = chats.length; S.mvKey = mvKey(); mvAfter();
}
const mvKey = () => { const b = $('#chats'); const p = S.settings.pip; return b.clientWidth + 'x' + b.clientHeight + '|' + mvLay() + '|' + (p.mvRt || 0) + '|' + (p.mvRs || 0) + '|' + mvList().map((s) => s.login + (s.dupe ? '!' : '')).join() + '|' + (S.settings.split ? (S.settings.splitSet || []).join() : S.active); };
// Everything that must stay clear of the videos: toasts, Yappy and dialogs
function mvAfter() {
  const panes = [...document.querySelectorAll('#chats .vpane:not(.hidden)')], bd = document.querySelector('#modals .backdrop');
  const W = innerWidth, H = innerHeight; let holes = [];
  const nat = bd && bd.firstElementChild ? bd.firstElementChild.getBoundingClientRect() : null, m = nat && { left: nat.left - 12, right: nat.right + 12, top: nat.top - 12, bottom: nat.bottom + 12 };
  panes.forEach((p) => { const r = p.getBoundingClientRect(), over = !!m && hit(r, m); p.classList.toggle('paused', over); p.querySelectorAll('webview').forEach((w) => (w.style.visibility = over ? 'hidden' : '')); const nt = p.querySelector('.sp-note'); if (nt) nt.classList.toggle('hidden', !over); if (!over && p.querySelector('webview')) holes.push(r); });
  if (bd) bd.style.clipPath = holes.length ? `path(evenodd, 'M0 0H${W}V${H}H0Z ${holes.map((r) => `M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`).join(' ')}')` : '';
  // toasts and Yappy step aside from any video they would sit on
  const yp = $('.yappy'); [$('#toasts'), $('.y-bubble')].forEach((t) => { if (!t) return; t.style.left = ''; if (t.classList.contains('hidden')) return; const tr = t.getBoundingClientRect(), h = holes.find((r) => hit(r, tr)); if (h) { const l = h.left, rr = innerWidth - h.right; t.style.left = (l > rr ? l / 2 : h.right + rr / 2) + 'px'; } });
  if (yp) { Yappy.place(S.settings.yappyPos); const h = yp.classList.contains('docked') ? null : holes.find((r) => hit(r, yp.getBoundingClientRect())); if (h) { yp.style.right = Math.max(8, innerWidth - h.left + 10) + 'px'; yp.classList.add('moved'); } }
}
// placePip() calls this while several streams are shown: re-lay-out only when the size or the streams changed
function mvPlace() { if (S.mvKey !== mvKey()) applySplit(); else mvAfter(); }
new MutationObserver(() => { if (mvOn()) mvAfter(); }).observe($('#modals'), { childList: true, subtree: true });
new MutationObserver(() => { if (mvOn()) mvAfter(); }).observe($('#toasts'), { childList: true });

// ----- adding, changing and closing streams -----
function mvAdd() {
  const p = S.settings.pip, list = mvList(), used = new Set(list.map((s) => s.login));
  if (list.length >= MV_MAX) return toast('Four streams is the most YappyChat shows at once.', { ms: 3000 });
  const keys = [...S.chats.keys()], last = keys.indexOf(list[list.length - 1].login), pick = [...keys.slice(last + 1), ...keys.slice(0, last + 1)].find((k) => !used.has(k));
  if (!pick) return toast('Every open channel is already shown. Add another channel with the + beside the tabs first.', { ms: 4000 });
  if (!mvRoomFor(list.length + 1)) return toast('There is not enough room for another stream. Twitch needs each video at least 400 x 300, so make the window bigger or close a stream.', { ms: 6000 });
  const room = 6 - (list.length + 1), nSet = (S.settings.splitSet || []).filter((x) => S.chats.has(x)).length;
  savePip({ extra: [...mvExtra(), pick], open: true }, false);
  if (S.settings.split && nSet > room) toast(`Showing ${room} ${room === 1 ? 'chat' : 'chats'} so the ${list.length + 1} streams fit (six panes at most).`, { ms: 5000 });
  else toast(`Added ${(S.chats.get(pick) || {}).name || pick}. Pick another channel in its menu if you like.`, { ms: 3500 });
}
function mvChange(sid, value) {
  if (sid === 'main') return savePip({ channel: value }, true);
  const ex = mvExtra(), i = ex.indexOf(sid.slice(2)); if (i < 0) return; ex[i] = value; savePip({ extra: ex }, false); applySplit();
}
function mvClose(sid) {
  const ex = mvExtra();
  if (sid === 'main') { if (!ex.length) return savePip({ open: false }); const next = ex.shift(); savePip({ channel: next, extra: ex }, true); return; }
  savePip({ extra: ex.filter((x) => x !== sid.slice(2)) }, false);
}
$('#chats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sp]'); if (!b) return; const pane = b.closest('.vpane'), a = b.dataset.sp;
  if (a === 'add') mvAdd(); else if (a === 'close' && pane) mvClose(pane.dataset.sid); else if (a === 'lay') { const opts = MV_LAYS.filter((x) => x !== 'between' || (S.settings.split && (S.settings.splitSet || []).filter((y) => S.chats.has(y)).length >= 2)), l = opts[(opts.indexOf(mvLay()) + 1) % opts.length]; savePip({ mvLay: l }, false); applySplit(); toast(MV_LAY_NAME[l] + '. Drag the divider to resize.', { ms: 2800 }); } else if (a === 'shrink') { const ex = mvExtra(); if (ex.length) savePip({ extra: ex.slice(0, -1) }, false); }
});
$('#chats').addEventListener('change', (e) => { const s = e.target.closest && e.target.closest('select[data-sp=channel]'); if (s) mvChange(s.closest('.vpane').dataset.sid, s.value); });

// ----- the divider between streams and chats (drag to resize, double-click to reset) and dragging a stream to a new place -----
function mvGrip(g) {
  const box = $('#chats'); let h = box.querySelector('.mvgrip');
  if (!g) { if (h) h.remove(); return; }
  if (!h) { h = el('div', 'mvgrip'); h.setAttribute('role', 'separator'); h.dataset.tip = 'Drag to resize. Double-click to reset'; box.append(h); }
  h.classList.toggle('v', g.v); h.style.left = g.v ? Math.round(g.x) - 5 + 'px' : ''; h.style.top = g.v ? '' : Math.round(g.y) - 5 + 'px';
}
let mvRz = null;
$('#chats').addEventListener('pointerdown', (e) => {
  const h = e.target.closest && e.target.closest('.mvgrip'); if (!h) return; e.preventDefault(); h.setPointerCapture(e.pointerId); mvRz = { v: h.classList.contains('v') }; $('#chats').classList.add('mvdragging');
});
$('#chats').addEventListener('pointermove', (e) => {
  if (!mvRz) return; const box = $('#chats'), r = box.getBoundingClientRect(), lay = mvLay(), p = S.settings.pip;
  if (mvRz.v) { const x = (e.clientX - r.left) / r.width; p.mvRs = Math.min(0.7, Math.max(0.15, lay === 'left' ? x : 1 - x)); }
  else { const y = (e.clientY - r.top) / r.height; p.mvRt = Math.min(0.85, Math.max(0.25, lay === 'bottom' ? 1 - y : y)); }
  if (!mvRz.raf) mvRz.raf = requestAnimationFrame(() => { if (mvRz) { mvRz.raf = 0; applySplit(); } });
});
const mvRzEnd = () => { if (!mvRz) return; mvRz = null; $('#chats').classList.remove('mvdragging'); saveSettings({ pip: S.settings.pip }); applySplit(); };
$('#chats').addEventListener('pointerup', mvRzEnd); $('#chats').addEventListener('pointercancel', mvRzEnd);
$('#chats').addEventListener('dblclick', (e) => { if (!(e.target.closest && e.target.closest('.mvgrip'))) return; const p = S.settings.pip; delete p.mvRt; delete p.mvRs; saveSettings({ pip: p }); applySplit(); });
// Streams are moved by dragging their top bar onto another stream. Only their places swap, so nothing reloads.
let mvDrag = null;
$('#chats').addEventListener('dragstart', (e) => { const h = e.target.closest && e.target.closest('.sp-head'); if (!h) return; mvDrag = h.parentElement.dataset.sid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', mvDrag); $('#chats').classList.add('mvdragging'); });
$('#chats').addEventListener('dragover', (e) => { if (!mvDrag) return; const t = e.target.closest && e.target.closest('.vpane'); document.querySelectorAll('#chats .vpane.dropt').forEach((x) => x !== t && x.classList.remove('dropt')); if (t && t.dataset.sid !== mvDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('dropt'); } });
$('#chats').addEventListener('drop', (e) => {
  if (!mvDrag) return; const t = e.target.closest && e.target.closest('.vpane'); if (!t || t.dataset.sid === mvDrag) return; e.preventDefault();
  const ids = mvList().map((x) => x.id), i = ids.indexOf(mvDrag), j = ids.indexOf(t.dataset.sid); if (i < 0 || j < 0) return;
  [ids[i], ids[j]] = [ids[j], ids[i]]; savePip({ mvOrder: ids }, false); applySplit();
});
document.addEventListener('dragend', () => { if (!mvDrag) return; mvDrag = null; $('#chats').classList.remove('mvdragging'); document.querySelectorAll('#chats .vpane.dropt').forEach((x) => x.classList.remove('dropt')); });
