'use strict';
/* ---------- Chat summary: a plain-text recap of a channel to paste into the mod team's Discord or save as a file ----------
   Totals only for moderation (no moderator is named), plus the busiest chatters, what kept being deleted and the words behind bans and timeouts.
   Everything comes from what YappyChat saw while it had the channel open on this computer. */
const SUM_STOP = new Set('the and you for are but not with this that have was what your just like its it\'s dont don\'t can get all out his her they them who why how when there their our from yes yeah lol lmao omg its one too now will would should could about been were had has very really then than into over also some any more most here only did does doing going gonna want got make made'.split(' '));
const sumWords = (t) => [...new Set(String(t || '').toLowerCase().replace(/https?:\/\//g, '').match(/[a-z0-9][a-z0-9.\-']{2,30}/g) || [])].map((w) => w.replace(/[.\-']+$/, '')).filter((w) => w.length > 2 && !SUM_STOP.has(w) && !/^\d+$/.test(w));
const sumGrams = sumWords;
const sumNorm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sumN = (n) => Number(n || 0).toLocaleString();
const sumPl = (n, one, many) => `${sumN(n)} ${n === 1 ? one : many || one + 's'}`;
const sumTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function sumDur(ms) { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; }

function chatSummary(c, period) {
  const now = Date.now(), mins = [...(c.perMin || new Map()).entries()], start0 = mins.length ? mins[0][0] * 60000 : now;
  const from = period === 'hour' ? Math.max(start0, now - 3600000) : start0, inP = (t) => t >= from;
  const L = [], add = (s) => L.push(s);
  add(`YappyChat summary for #${c.login}`);
  add(`${new Date(from).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${sumTime(from)} to ${sumTime(now)} (${sumDur(now - from)})`);

  // Chat
  const pm = mins.filter(([k]) => inP(k * 60000)), msgs = pm.reduce((a, [, n]) => a + n, 0), peak = pm.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
  const users = [...c.users.values()], talkers = users.map((u) => ({ name: u.name, n: period === 'hour' ? (u.msgs || []).filter((m) => !m.am && inP(m.ts)).length : u.n || 0 })).filter((u) => u.n > 0);
  add(''); add('Chat');
  add(`- ${sumPl(msgs, 'message')} from ${sumPl(talkers.length, 'chatter')}${peak[1] && pm.length >= 10 ? `, busiest at ${sumTime(peak[0] * 60000)} with ${sumN(peak[1])} a minute` : ''}`);
  if (period !== 'hour' && c.stat.firsts) add(`- ${sumPl(c.stat.firsts, 'first-time chatter')}`);
  if (c.raid && inP(c.raid.at)) add(`- A raid from ${c.raid.from} with ${sumPl(c.raid.n, 'viewer')} at ${sumTime(c.raid.at)}`);

  // Moderation, as totals for the whole team
  const log = (S.modlog || []).filter((x) => x.c === c.login && inP(x.ts)), k = (kind) => log.filter((x) => x.kind === kind);
  const bans = k('ban'), tos = k('timeout'), dels = k('delete'), am = k('automod');
  const parts = [[tos.length, 'timeout'], [bans.length, 'ban'], [dels.length, 'deleted message'], [k('warn').length, 'warning'], [k('untimeout').length + k('unban').length, 'lifted ban or timeout']].filter(([n]) => n).map(([n, w]) => sumPl(n, w));
  add(''); add('Moderation (the whole team)');
  add(parts.length ? `- ${parts.join(', ')}` : '- No bans, timeouts or deletes');
  const held = period === 'hour' ? 0 : c.stat.held || 0, allowed = am.filter((x) => /allowed/.test(x.text)).length, denied = am.filter((x) => /denied/.test(x.text)).length;
  if (held || allowed || denied) add(`- AutoMod${held ? ` held ${sumPl(held, 'message')}` : ''}${allowed || denied ? `${held ? ':' : ''} ${sumN(allowed)} allowed, ${sumN(denied)} denied` : ''}`);
  const terms = k('term'); if (terms.length) add(`- ${sumPl(terms.length, 'blocked-term change')}`);
  const modes = k('mode').map((x) => x.text).filter((t) => /slow|followers|subscribers|emote|unique|shield/i.test(t)); if (modes.length) add(`- ${sumPl(modes.length, 'chat mode change')} (slow mode, followers-only, Shield Mode and so on)`);
  if (k('clear').length) add(`- Chat was cleared ${k('clear').length === 1 ? 'once' : sumN(k('clear').length) + ' times'}`);

  // Most active chatters
  const top = talkers.filter((u) => u.n > 1).sort((a, b) => b.n - a.n).slice(0, 10);
  if (top.length) { add(''); add('Most active chatters'); top.forEach((u, i) => add(`${i + 1}. ${u.name}: ${sumPl(u.n, 'message')}`)); }

  // Deleted again and again
  const dc = new Map(); dels.forEach((x) => { const t = sumNorm(x.msg); if (t) dc.set(t, (dc.get(t) || 0) + 1); });
  const often = [...dc.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (often.length) { add(''); add('Deleted again and again'); often.forEach(([t, n]) => add(`- "${t.length > 70 ? t.slice(0, 67) + '…' : t}" deleted ${sumN(n)} times`)); }

  // Words behind bans and timeouts: counted once per message, and only if normal chat rarely uses them
  const normal = new Map(); users.forEach((u) => (u.msgs || []).forEach((m) => { if (!m.am) sumGrams(m.text).forEach((w) => normal.set(w, (normal.get(w) || 0) + 1)); }));
  const wc = new Map(); [...bans, ...tos].forEach((x) => sumGrams(x.msg).forEach((w) => wc.set(w, (wc.get(w) || 0) + 1)));
  let words = [...wc.entries()].filter(([w, n]) => n > 1 && (normal.get(w) || 0) <= Math.max(2, n / 3)).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  words = words.slice(0, 8);
  if (words.length) { add(''); add('Words in messages that led to bans and timeouts'); add('- ' + words.map(([w, n]) => `"${w}" (${n})`).join(', ')); }

  // Worth talking about as a team
  const tips = [], strong = words.filter(([w, n]) => n >= 3 && w.length >= 4).slice(0, 3).map(([w]) => `"${w}"`);
  if (strong.length) tips.push(`Consider adding ${strong.length > 1 ? strong.slice(0, -1).join(', ') + ' and ' + strong.at(-1) : strong[0]} to blocked terms or AutoMod: each was in 3 or more messages that led to a ban or timeout.`);
  if (often.some(([, n]) => n >= 5)) tips.push('The same message was deleted 5 or more times: slow mode or unique chat during waves would catch it sooner.');
  if (period !== 'hour' && c.stat.firsts >= 30 && bans.length + tos.length >= 10) tips.push('Lots of first-time chatters and bans together: followers-only for 10 minutes during raids may help.');
  if (tips.length) { add(''); add('Worth talking about'); tips.forEach((t) => add('- ' + t)); }

  add(''); add('From what YappyChat (yappy.chat) saw while the channel was open. Moderator names are left out.');
  return L.join('\n');
}

function summaryWin(c) {
  if (!c) return noChan();
  let period = 'session';
  const n = el('div', 'stack sumwin', `<h3>${ico('note', 18)} Chat summary · ${esc(c.name)}</h3><div class="row gap8"><select id="sum-p" aria-label="How far back"><option value="session">Since YappyChat opened this chat</option><option value="hour">The last hour</option></select></div><textarea id="sum-t" readonly rows="16" spellcheck="false" aria-label="Summary text"></textarea><div class="row gap8"><button class="btn primary" id="sum-copy">Copy</button><button class="btn" id="sum-save">Save as a text file</button></div>`);
  modal(n); const t = $('#sum-t', n), fill = () => { t.value = chatSummary(c, period); }; fill();
  $('#sum-p', n).onchange = (e) => { period = e.target.value; fill(); };
  $('#sum-copy', n).onclick = async () => { try { await navigator.clipboard.writeText(t.value); toast('Summary copied'); } catch (e) { t.select(); document.execCommand('copy'); toast('Summary copied'); } };
  $('#sum-save', n).onclick = async () => { try { const r = await cg.saveReport({ text: t.value, name: `YappyChat-summary-${c.login}-${new Date().toISOString().slice(0, 10)}`, ext: 'txt' }); if (r && r.error) return err(r.error); if (r && r.ok) toast('Saved as ' + r.name); } catch (e) { err('Could not save the summary.'); } };
}
