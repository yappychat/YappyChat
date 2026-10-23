'use strict';
/* Makes CSS written in the admin page safe to ship to every user.
   Input is the text an admin writes for one perk, for example:
       color: #7df9ff; text-shadow: 0 0 8px currentColor; animation: pop 2s infinite;
       &::after { content: '*'; }
       @keyframes pop { 50% { opacity: .6 } }
   Plain lines apply to the perk itself. "&" stands for the perk's class. @keyframes names are made unique.
   Anything that can load or run something is dropped: url(), @import, expression(), javascript:, behavior, -moz-binding, and every at-rule except @keyframes.
   The same file runs in the server (to save the cleaned CSS) and in the app and website (to check it again before use). */
(function (root, factory) { const v = factory(); if (typeof module === 'object' && module.exports) module.exports = v; else root.SafeCss = v; })(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 4000;
  const BAD = /url\s*\(|@import|expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding|image-set\s*\(|\bsrc\s*:|\\|<|>|\/\*|\*\//i;
  const PROP = /^-{0,2}[a-z][a-z0-9-]*$/i;
  // properties that could cover the screen or break layout are not allowed
  const DENY_PROP = /^(position|top|left|right|bottom|inset|z-index|width|height|min-width|min-height|max-width|max-height|margin|padding|display|float|pointer-events|cursor|content-visibility|transform-origin|resize|overflow)$/i;
  const ALLOW_CONTENT = /^(['"])[^'"\\]{0,12}\1$/;

  function decls(text) {
    const out = [];
    for (const part of text.split(';')) {
      const i = part.indexOf(':'); if (i < 1) continue;
      const p = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim();
      if (!PROP.test(p) || !v || BAD.test(v)) continue;
      if (DENY_PROP.test(p) && !(p === 'display' && false)) continue;
      if (p === 'content' && !ALLOW_CONTENT.test(v) && v !== 'none') continue;
      if (/[{}]/.test(v)) continue;
      out.push(p + ':' + v);
    }
    return out.join(';');
  }

  // returns { css, warnings:[...] }  `cls` names keyframes; `root` is the selector the perk's CSS belongs to (default "." + cls)
  function clean(text, cls, root) {
    root = root || '.' + cls;
    const warnings = []; text = String(text || '');
    if (text.length > MAX) { text = text.slice(0, MAX); warnings.push('Trimmed to ' + MAX + ' characters'); }
    if (BAD.test(text)) warnings.push('Removed anything that loads files or runs code (url(), @import, javascript:, comments, backslashes)');
    if (!/^[a-z0-9_-]{1,40}$/i.test(cls)) return { css: '', warnings: ['Bad class name'] };
    const kf = new Map(), blocks = []; let top = '', i = 0, n = text.length;
    while (i < n) {
      const open = text.indexOf('{', i), semi = text.indexOf(';', i);
      if (open < 0 || (semi >= 0 && semi < open)) { const e = semi < 0 ? n : semi + 1; top += text.slice(i, e); i = e; continue; }
      const head = text.slice(i, open).trim(); let d = 1, j = open + 1;
      while (j < n && d) { if (text[j] === '{') d++; else if (text[j] === '}') d--; j++; }
      blocks.push([head, text.slice(open + 1, d ? n : j - 1)]); i = j;
    }
    let css = '';
    const base = decls(top); if (base) css += root + '{' + base + '}';
    for (const [head, body] of blocks) {
      const km = /^@keyframes\s+([a-z][a-z0-9_-]*)$/i.exec(head);
      if (km) { kf.set(km[1], 'k-' + cls + '-' + km[1]); continue; }
      if (head[0] === '@') { warnings.push('Ignored ' + head.split(/\s/)[0]); continue; }
      const sels = head.split(',').map((s) => s.trim()).filter((s) => /^&(?:[:.][a-z0-9_:()-]+|\s[a-z.>*][a-z0-9_.:()>*\s-]*)?$/i.test(s) && !/[;{}]/.test(s));
      const d = decls(body); if (!sels.length || !d) { warnings.push('Ignored a rule: ' + head.slice(0, 30)); continue; }
      css += sels.map((s) => root + s.slice(1)).join(',') + '{' + d + '}';
    }
    // keyframes blocks (second pass so names are known before use)
    for (const [head, body] of blocks) {
      const km = /^@keyframes\s+([a-z][a-z0-9_-]*)$/i.exec(head); if (!km) continue;
      let steps = ''; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
      while ((m = re.exec(body))) { const sel = m[1].trim(); if (!/^((\d{1,3}(\.\d+)?%|from|to)\s*,?\s*)+$/i.test(sel)) continue; const d = decls(m[2]); if (d) steps += sel + '{' + d + '}'; }
      if (steps) css += '@keyframes ' + kf.get(km[1]) + '{' + steps + '}';
    }
    // point animation names at the renamed keyframes
    for (const [from, to] of kf) css = css.replace(new RegExp('(animation(?:-name)?:[^;}]*?)\\b' + from + '\\b', 'g'), '$1' + to);
    if (!css) warnings.push('Nothing usable was found in that CSS');
    return { css, warnings };
  }
  // Re-checks CSS the server already cleaned, before the app or website uses it (the server is trusted, but this costs nothing): only rules for custom perks and their keyframes pass.
  const OK_SEL = /^(\.nm\.fx-c-[a-z0-9-]+ \.name|\.nm\.pl-c-[a-z0-9-]+|:where\(body:not\(\.mbg-off\)\) :is\(\.msg,\.yp-line\)\.mbg-c-[a-z0-9-]+)([:.][a-z0-9_:()-]+|\s[a-z.>*][a-z0-9_.:()>*\s-]*)?$/i;
  function check(css) {
    css = String(css || ''); if (css.length > 20000 || BAD.test(css)) return '';
    let out = '', i = 0; const n = css.length;
    while (i < n) {
      const open = css.indexOf('{', i); if (open < 0) break; const head = css.slice(i, open).trim(); let d = 1, j = open + 1;
      while (j < n && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
      const body = css.slice(open + 1, j - 1);
      if (/^@keyframes k-[a-z0-9_-]+$/i.test(head)) { if (!/[;{}]\s*(position|top|left|right|bottom|inset|width|height|display)\s*:/i.test('{' + body)) out += head + '{' + body + '}'; }
      else if (head.split(',').every((x) => OK_SEL.test(x.trim())) && !/[{}]/.test(body)) out += head + '{' + body + '}';
      i = j;
    }
    return out;
  }
  return { clean, check, MAX };
});
