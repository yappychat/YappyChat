/* ---------- Emotes that change while YappyChat is open ----------
   7TV and BetterTTV tell apps the moment a streamer or their editors add, remove or rename a channel emote, over their event sockets.
   Every open tab is watched (one connection to each, however many channels), so a new emote works in the next message, like on Twitch with the extensions.
   FrankerFaceZ has no public feed of changes, so chats you have open re-check every 10 minutes instead. If a socket drops it reconnects by itself,
   and a channel that changed while it was down is fetched again in full. */
const LE = { had: {}, stv: null, bttv: null, stvSubs: new Map(), bttvSubs: new Set(), wait: { stv: 0, bttv: 0 }, timer: null, refresh: new Map() };
const leChat = (pred) => [...S.chats.values()].find(pred);
const leSay = (c, text) => { if (S.settings.emoteNotices !== false) try { notice(c, text, 'emotech'); } catch (e) {} };
// A rename or a removal can uncover an emote with the same name from another source, so the channel is fetched again quietly a moment later
const leRefetch = (c) => { clearTimeout(LE.refresh.get(c.login)); LE.refresh.set(c.login, setTimeout(() => { LE.refresh.delete(c.login); if (S.chats.get(c.login) === c) ensureAssets(c, true); }, 4000)); };
const leDrop = (c, src, id, name) => { for (const [k, v] of c.emotes) if (v.src === src && (v.id === id || (!id && k === name))) { c.emotes.delete(k); return k; } return name || ''; };

/* 7TV: wss://events.7tv.io/v3. Subscribe (op 35) to each channel's emote set, and to the 7TV user so a switch to another set is noticed. */
function stvSend(op, type, id) { try { LE.stv.send(JSON.stringify({ op, d: { type, condition: { object_id: id } } })); } catch (e) {} }
function stvOpen() {
  if (LE.stv || S.settings.emotes7tv === false) return;
  let ws; try { ws = LE.stv = new WebSocket('wss://events.7tv.io/v3'); } catch (e) { LE.stv = null; return; }
  ws.onopen = () => { LE.wait.stv = 0; LE.stvSubs.clear(); leBack('stv'); liveEmSync(); };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.op === 0 && m.d) stvEvent(m.d.type, m.d.body || {});
    else if (m.op === 4 || m.op === 7) try { ws.close(); } catch (e) {} }; // the server asks to reconnect, or ended the session
  ws.onclose = () => { if (LE.stv !== ws) return; LE.stv = null; LE.stvSubs.clear(); leRetry('stv', stvOpen); };
  ws.onerror = () => {};
}
function stvEvent(type, b) {
  if (type === 'user.update') { const c = leChat((x) => x.stvUser && x.stvUser === b.id); if (c) ensureAssets(c, true); return; } // e.g. the streamer switched to another emote set
  if (type !== 'emote_set.update') return;
  const c = leChat((x) => x.stvSet && x.stvSet === b.id); if (!c) return;
  const who = (b.actor && (b.actor.display_name || b.actor.username)) || '';
  const by = (verb, what) => leSay(c, `${who ? who + ' ' + verb : verb.charAt(0).toUpperCase() + verb.slice(1)} the 7TV emote ${what}.`);
  (b.pushed || []).forEach((x) => { if (x.key !== 'emotes' || !x.value) return; c.emotes.set(x.value.name, stvEm(x.value)); by('added', x.value.name); });
  (b.pulled || []).forEach((x) => { if (x.key !== 'emotes' || !x.old_value) return; const n = leDrop(c, '7tv', x.old_value.id, x.old_value.name); by('removed', n); leRefetch(c); });
  (b.updated || []).forEach((x) => { if (x.key !== 'emotes' || !x.value) return; const o = x.old_value || {}; leDrop(c, '7tv', o.id || x.value.id, o.name); c.emotes.set(x.value.name, stvEm(x.value)); if (o.name && o.name !== x.value.name) by('renamed', `${o.name} to ${x.value.name}`); leRefetch(c); });
  if (c.onAssets) c.onAssets();
}

/* BetterTTV: wss://sockets.betterttv.net/ws. Join "twitch:<channel id>" for each channel. */
function bttvSend(name, id) { try { LE.bttv.send(JSON.stringify({ name, data: { name: 'twitch:' + id } })); } catch (e) {} }
function bttvOpen() {
  if (LE.bttv || S.settings.emotesBttv === false) return;
  let ws; try { ws = LE.bttv = new WebSocket('wss://sockets.betterttv.net/ws'); } catch (e) { LE.bttv = null; return; }
  ws.onopen = () => { LE.wait.bttv = 0; LE.bttvSubs.clear(); leBack('bttv'); liveEmSync(); };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } bttvEvent(m.name, m.data || {}); };
  ws.onclose = () => { if (LE.bttv !== ws) return; LE.bttv = null; LE.bttvSubs.clear(); leRetry('bttv', bttvOpen); };
  ws.onerror = () => {};
}
function bttvEvent(name, d) {
  const id = String(d.channel || '').replace(/^twitch:/, ''), c = id && leChat((x) => String(x.id) === id); if (!c) return;
  if (name === 'emote_create' && d.emote && d.emote.code) { c.emotes.set(d.emote.code, bttvEm(d.emote)); leSay(c, `BetterTTV emote added: ${d.emote.code}.`); }
  else if (name === 'emote_delete') { const n = leDrop(c, 'bttv', d.emoteId); if (n) leSay(c, `BetterTTV emote removed: ${n}.`); leRefetch(c); }
  else if (name === 'emote_update' && d.emote && d.emote.code) { const old = leDrop(c, 'bttv', d.emote.id); c.emotes.set(d.emote.code, bttvEm(d.emote)); if (old && old !== d.emote.code) leSay(c, `BetterTTV emote renamed: ${old} to ${d.emote.code}.`); leRefetch(c); }
  else return;
  if (c.onAssets) c.onAssets();
}

// Wait longer after each failed attempt (5 s, 10 s, 20 s… up to 2 minutes), and only while there is something to watch
function leRetry(k, open) { LE.wait[k] = Math.min(120000, (LE.wait[k] || 2500) * 2); setTimeout(() => { if (S.chats.size) open(); }, LE.wait[k]); }
// Connected again after a drop: anything changed while it was down is fetched in full
const leBack = (k) => { if (LE.had[k]) S.chats.forEach((c) => { if (c.assetsAt && Date.now() - c.assetsAt > 60000) ensureAssets(c, true); }); LE.had[k] = true; };

// Bring the subscriptions in line with the open tabs and the emote settings. Called after a channel's emotes load, and every minute.
function liveEmSync() {
  const chans = [...S.chats.values()].filter((c) => c.id && c.assetsLoaded);
  // 7TV
  if (S.settings.emotes7tv === false || !chans.length) { if (LE.stv) { const w = LE.stv; LE.stv = null; LE.stvSubs.clear(); try { w.close(); } catch (e) {} } }
  else if (!LE.stv) stvOpen();
  else if (LE.stv.readyState === 1) {
    const want = new Map(); chans.forEach((c) => { if (c.stvSet) want.set('emote_set.update:' + c.stvSet, ['emote_set.update', c.stvSet]); if (c.stvUser) want.set('user.update:' + c.stvUser, ['user.update', c.stvUser]); });
    for (const [k, [t, id]] of want) if (!LE.stvSubs.has(k)) { stvSend(35, t, id); LE.stvSubs.set(k, [t, id]); }
    for (const [k, [t, id]] of [...LE.stvSubs]) if (!want.has(k)) { stvSend(36, t, id); LE.stvSubs.delete(k); }
  }
  // BetterTTV
  if (S.settings.emotesBttv === false || !chans.length) { if (LE.bttv) { const w = LE.bttv; LE.bttv = null; LE.bttvSubs.clear(); try { w.close(); } catch (e) {} } }
  else if (!LE.bttv) bttvOpen();
  else if (LE.bttv.readyState === 1) {
    const want = new Set(chans.map((c) => String(c.id)));
    for (const id of want) if (!LE.bttvSubs.has(id)) { bttvSend('join_channel', id); LE.bttvSubs.add(id); }
    for (const id of [...LE.bttvSubs]) if (!want.has(id)) { bttvSend('part_channel', id); LE.bttvSubs.delete(id); }
  }
}
// Every minute: tidy the subscriptions (tabs closed, settings changed). Every 10 minutes: re-check the chats you have open, which picks up FrankerFaceZ changes.
let leTick = 0;
setInterval(() => { try { liveEmSync(); if (++leTick % 10 === 0) S.chats.forEach((c) => { if (chatLive(c) && S.settings.emotesFfz !== false && Date.now() - (c.assetsAt || 0) > 9 * 60000) ensureAssets(c, true); }); } catch (e) {} }, 60000);
