// A small Markdown parser that returns a TREE (plain objects), never HTML. The page renders the tree with React elements, so raw HTML
// in a page is only ever text. Covers: ATX headings, paragraphs, fenced code, GitHub tables, bullet/ordered/task lists, block quotes,
// horizontal rules, and inline code, bold, italic, strikethrough, links, autolinks and images (shown as a label, never loaded).
// Bounded: line count, line length, nesting depth and inline depth are capped; every scan is linear or memoised (no regex on
// unbounded user text with nested quantifiers), so a hostile page cannot hang the tab.

export const MD_LIMITS = Object.freeze({ maxLines: 20_000, maxLineLength: 10_000, maxDepth: 6, maxInlineDepth: 4, maxCols: 40, maxTableRows: 1000 });

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+.#-]{0,40})/;
const HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const QUOTE = /^ {0,3}> ?/;

function isHr(line) {
  const t = line.trim();
  if (t.length < 3 || !/^[-*_]/.test(t) || /^ {4}/.test(line)) return false;
  const c = t[0]; let n = 0;
  for (const ch of t) { if (ch === c) n++; else if (ch !== ' ' && ch !== '\t') return false; }
  return n >= 3;
}

// Split a table row on | that is not escaped and not inside a code span.
export function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let cur = ''; let tick = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') { let k = 0; while (s[i + k] === '`') k++; tick = tick === k ? 0 : tick || k; cur += '`'.repeat(k); i += k - 1; continue; }
    if (ch === '|' && !tick) { cells.push(cur.trim()); cur = ''; if (cells.length >= MD_LIMITS.maxCols) return cells; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells.slice(0, MD_LIMITS.maxCols);
}
function delimiterRow(line) {
  if (!line || !line.includes('-')) return null;
  const cells = splitRow(line);
  if (!cells.length || !cells.every((c) => /^:?-{1,}:?$/.test(c))) return null; // a cell is short; the line length is capped
  return cells.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
}
const startsTable = (lines, i) => lines[i].includes('|') && !!delimiterRow(lines[i + 1]);

function startsBlock(lines, i) {
  const l = lines[i];
  return FENCE.test(l) || HEADING.test(l) || isHr(l) || QUOTE.test(l) || ITEM.test(l) || startsTable(lines, i);
}

export function slugify(text) {
  const s = text.toLowerCase().replace(/[^a-z0-9 _-]+/g, '').trim().replace(/[ _]+/g, '-').replace(/-+/g, '-').slice(0, 60);
  return s || 'section';
}
export function plainText(inlines) {
  let out = '';
  const stack = [...inlines].reverse();
  while (stack.length) {
    const n = stack.pop();
    if (n.t === 'text' || n.t === 'code') out += n.v;
    else if (n.t === 'image') out += n.alt;
    else if (n.c) for (let k = n.c.length - 1; k >= 0; k--) stack.push(n.c[k]);
  }
  return out;
}

export function parseMarkdown(src) {
  let lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let truncated = false;
  if (lines.length > MD_LIMITS.maxLines) { lines = lines.slice(0, MD_LIMITS.maxLines); truncated = true; }
  lines = lines.map((l) => { const x = l.replace(/\t/g, '    '); if (x.length > MD_LIMITS.maxLineLength) { truncated = true; return x.slice(0, MD_LIMITS.maxLineLength); } return x; });
  const ctx = { headings: [], ids: new Map(), truncated: false };
  const blocks = parseBlocks(lines, 0, ctx);
  return { blocks, headings: ctx.headings, truncated: truncated || ctx.truncated };
}

function headingId(ctx, text) {
  const base = `sec-${slugify(text)}`;
  const n = (ctx.ids.get(base) || 0) + 1;
  ctx.ids.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function parseBlocks(lines, depth, ctx) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = FENCE.exec(line))) {
      const fence = m[1]; const body = []; i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.length >= fence.length && [...t].every((c) => c === fence[0])) { i++; break; }
        body.push(lines[i]); i++;
      }
      blocks.push({ type: 'code', lang: m[2] || '', text: body.join('\n') });
      continue;
    }
    if ((m = HEADING.exec(line))) {
      let text = line.slice(m[0].length).trim();
      while (text.endsWith('#')) text = text.slice(0, -1); // closing hashes
      text = text.trim();
      const inlines = parseInline(text);
      const id = headingId(ctx, plainText(inlines));
      const level = m[1].length;
      ctx.headings.push({ level, id, text: plainText(inlines) });
      blocks.push({ type: 'heading', level, id, inlines });
      i++; continue;
    }
    if (isHr(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (startsTable(lines, i)) {
      const align = delimiterRow(lines[i + 1]);
      const header = splitRow(line).map(parseInline);
      const rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        if (rows.length < MD_LIMITS.maxTableRows) rows.push(splitRow(lines[i]).map(parseInline)); else ctx.truncated = true; // rows past the cap are dropped
        i++;
      }
      blocks.push({ type: 'table', align, header, rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) { inner.push(lines[i].replace(QUOTE, '')); i++; }
      blocks.push(depth + 1 >= MD_LIMITS.maxDepth
        ? { type: 'quote', blocks: [{ type: 'paragraph', inlines: parseInline(inner.join(' ')) }] }
        : { type: 'quote', blocks: parseBlocks(inner, depth + 1, ctx) });
      continue;
    }
    if ((m = ITEM.exec(line))) { i = parseList(lines, i, depth, ctx, blocks); continue; }
    const para = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) { para.push(lines[i].trim()); i++; }
    blocks.push({ type: 'paragraph', inlines: parseInline(para.join('\n')) });
  }
  return blocks;
}

function nextNonBlank(lines, i) { let j = i; while (j < lines.length && !lines[j].trim()) j++; return j; }

function parseList(lines, start, depth, ctx, out) {
  const first = ITEM.exec(lines[start]);
  const indent = first[1].length; const ordered = /\d/.test(first[2]);
  const list = { type: 'list', ordered, start: ordered ? Math.min(Number.parseInt(first[2], 10), 1e9) : 1, items: [] };
  let i = start;
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    const contentCol = m[0].length;
    const body = [lines[i].slice(contentCol)]; i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        const j = nextNonBlank(lines, i); // one scan per blank run, so a long run of blank lines stays linear
        const next = lines[j];
        if (next !== undefined && next.length - next.trimStart().length > indent) { for (; i < j; i++) body.push(''); continue; }
        break;
      }
      const lead = l.length - l.trimStart().length;
      if (lead > indent) { body.push(l.slice(Math.min(lead, contentCol))); i++; continue; }
      if (ITEM.exec(l) || startsBlock(lines, i)) break;
      body.push(l.trim()); i++; // lazy continuation of the item's paragraph
    }
    let task = null;
    const tm = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
    if (tm) { task = tm[1] !== ' '; body[0] = body[0].slice(tm[0].length); }
    const blocks = depth + 1 >= MD_LIMITS.maxDepth
      ? [{ type: 'paragraph', inlines: parseInline(body.join(' ').trim()) }]
      : parseBlocks(body, depth + 1, ctx);
    list.items.push({ task, blocks });
    if (i < lines.length && !lines[i].trim()) {
      const j = nextNonBlank(lines, i);
      const nm = j < lines.length && ITEM.exec(lines[j]);
      if (nm && nm[1].length === indent) i = j;
    }
  }
  out.push(list);
  return i;
}

// ---- inline ----

const PUNCT = /[!-/:-@[-`{-~]/;
const isWord = (ch) => !!ch && /[A-Za-z0-9]/.test(ch);

// Finds the next closer of `delim` at or after `from` that passes `ok(pos)`. A failed search from p means none exists at >= p, so it is
// remembered per delimiter and later searches past p return at once: the whole scan stays linear in the text length.
function finder(s) {
  const noneFrom = new Map();
  return (delim, from, ok = () => true) => {
    const known = noneFrom.get(delim);
    if (known !== undefined && from >= known) return -1;
    let j = s.indexOf(delim, from);
    while (j !== -1 && !ok(j)) j = s.indexOf(delim, j + 1);
    if (j === -1) noneFrom.set(delim, known === undefined ? from : Math.min(known, from));
    return j;
  };
}

export function parseInline(text, depth = 0) {
  const s = String(text);
  const out = []; let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  const find = finder(s);
  let parens = null; // lazily: for each '(' the index of its balanced ')', one linear pass with a stack
  const matchParen = (p) => {
    if (!parens) {
      parens = new Map(); const stack = [];
      for (let k = 0; k < s.length; k++) {
        if (s[k] === '\\') { k++; continue; }
        if (s[k] === '(') stack.push(k); else if (s[k] === ')' && stack.length) parens.set(stack.pop(), k);
      }
    }
    return parens.has(p) ? parens.get(p) : -1;
  };
  const nest = (inner) => (depth + 1 >= MD_LIMITS.maxInlineDepth ? [{ t: 'text', v: inner }] : parseInline(inner, depth + 1));
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '\n') { buf += ' '; i++; continue; }
    if (ch === '`') {
      let k = 0; while (s[i + k] === '`') k++;
      const run = '`'.repeat(k);
      const j = find(run, i + k, (p) => s[p - 1] !== '`' && s[p + k] !== '`');
      if (j !== -1) { flush(); let v = s.slice(i + k, j).replace(/\n/g, ' '); if (/^ .* $/.test(v) && v.trim()) v = v.slice(1, -1); out.push({ t: 'code', v }); i = j + k; continue; }
      buf += run; i += k; continue;
    }
    if ((ch === '*' || ch === '_' || ch === '~') && !(ch === '~' && s[i + 1] !== '~')) {
      const dbl = s[i + 1] === ch;
      const d = dbl ? ch + ch : ch;
      const after = s[i + d.length];
      const openOk = after && after !== ' ' && after !== '\n' && !(ch === '_' && isWord(s[i - 1]));
      if (openOk) {
        const j = find(d, i + d.length + 1, (p) => s[p - 1] !== ' ' && (ch !== '_' || !isWord(s[p + d.length])) && (dbl || s[p + 1] !== ch));
        if (j !== -1) {
          flush();
          out.push({ t: ch === '~' ? 'del' : dbl ? 'strong' : 'em', c: nest(s.slice(i + d.length, j)) });
          i = j + d.length; continue;
        }
      }
      buf += d; i += d.length; continue;
    }
    if (ch === '[' || (ch === '!' && s[i + 1] === '[')) {
      const img = ch === '!'; const open = img ? i + 1 : i;
      const close = find(']', open + 1);
      if (close !== -1 && s[close + 1] === '(') {
        // A destination may hold balanced parentheses (wiki-style URLs); with no balanced closer, the first ')' ends it.
        const balanced = matchParen(close + 1);
        const end = balanced !== -1 ? balanced : find(')', close + 2);
        if (end !== -1) {
          const label = s.slice(open + 1, close);
          const href = s.slice(close + 2, end).trim().split(/[ \t]/)[0].replace(/^<|>$/g, '');
          flush();
          out.push(img ? { t: 'image', alt: label, src: href } : { t: 'link', href, c: nest(label) });
          i = end + 1; continue;
        }
      }
      buf += ch; i++; continue;
    }
    if (ch === '<') {
      const close = find('>', i + 1);
      const inner = close === -1 ? '' : s.slice(i + 1, close);
      if (close !== -1 && close - i < 2048 && /^https?:\/\/[^\s<>]+$/i.test(inner)) { flush(); out.push({ t: 'link', href: inner, c: [{ t: 'text', v: inner }] }); i = close + 1; continue; }
      buf += ch; i++; continue;
    }
    if ((ch === 'h' || ch === 'H') && (i === 0 || /[\s(*_~]/.test(s[i - 1])) && /^https?:\/\//i.test(s.slice(i, i + 8))) {
      let j = i; while (j < s.length && j - i < 2048 && !/[\s<>`]/.test(s[j])) j++;
      while (j > i && /[.,;:!?)'"*_]/.test(s[j - 1])) j--;
      const url = s.slice(i, j);
      if (url.length > 8) { flush(); out.push({ t: 'link', href: url, c: [{ t: 'text', v: url }] }); i = j; continue; }
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

// What a link may become. External: http(s) only. Page: another page by file name (./slug.md, optional #anchor). Anchor: a heading on
// this page. Relative: another same-origin path. Anything else (javascript:, data:, vbscript:, //host, control characters) is null and
// renders as plain text. A relative path that a browser would resolve off-site (a backslash variant of //host) is refused too.
export function linkTarget(raw) {
  const h = String(raw ?? '').trim();
  if (!h || h.length > 2048 || /[\u0000- \u007f-\u009f]/.test(h)) return null;
  if (/^https?:\/\//i.test(h)) {
    try { const u = new URL(h); return u.protocol === 'http:' || u.protocol === 'https:' ? { kind: 'external', href: u.href } : null; } catch { return null; }
  }
  // Browsers read a backslash as a slash, so '\\host', '/\\host' and '\\/host' are all protocol-relative: off-site, refused.
  if (h.startsWith('\\') || h.replace(/\\/g, '/').startsWith('//')) return null;
  // The app's own route form (#/page/<slug>, optional #anchor), as seen in the address bar, is a page link too.
  const route = /^#\/page\/([A-Za-z0-9][A-Za-z0-9._-]{0,119})(?:#([A-Za-z0-9_-]{0,80}))?$/.exec(h);
  if (route && !route[1].includes('..')) return { kind: 'page', slug: route[1], anchor: route[2] || '' };
  if (h.startsWith('#/')) return { kind: 'relative', href: h };
  if (h.startsWith('#')) return { kind: 'anchor', id: h.slice(1) };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(h)) return null;
  const m = /^(?:\.\/)?([A-Za-z0-9][A-Za-z0-9._-]{0,119})\.md(?:#([A-Za-z0-9_-]{0,80}))?$/.exec(h);
  if (m && !m[1].includes('..')) return { kind: 'page', slug: m[1], anchor: m[2] || '' };
  return { kind: 'relative', href: h };
}
