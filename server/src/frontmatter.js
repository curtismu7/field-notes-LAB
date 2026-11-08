// Front matter: a first line '---', then simple fields, then a closing '---'. A tiny YAML subset, no dependency, no eval:
//   title: Some title            (plain, "double" or 'single' quoted)
//   apps: [one, "two, three"]    (inline list)
//   tags:                        (block list)
//     - logging
// Unknown keys are kept out of the result. Values are cleaned (control and bidi characters removed) and capped.
import { cleanText } from './safety.js';

export const MAX_FM_LINES = 60;
const KEY = /^([A-Za-z][A-Za-z0-9_-]{0,40}):(?:\s+(.*))?$/;

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) return s.slice(1, -1);
  return s.replace(/\s+#.*$/, '');
}

// Split "a, 'b, c', d" on commas outside quotes. Linear scan, no regex backtracking.
function splitList(inner) {
  const out = []; let cur = ''; let q = null;
  for (const ch of inner) {
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

export function parseFields(lines) {
  const data = {};
  let listKey = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) { data[listKey].push(unquote(item[1])); continue; }
    const m = KEY.exec(line);
    if (!m) { listKey = null; continue; }
    const value = (m[2] ?? '').trim();
    if (value === '') { data[m[1]] = []; listKey = m[1]; continue; }
    listKey = null;
    data[m[1]] = value.startsWith('[') && value.endsWith(']') ? splitList(value.slice(1, -1)) : unquote(value);
  }
  return data;
}

export function splitFrontMatter(text) {
  const t = String(text).replace(/^﻿/, '');
  if (!/^---\r?\n/.test(t)) return { data: {}, body: t, hasFrontMatter: false };
  const lines = t.split('\n');
  const stop = Math.min(lines.length, MAX_FM_LINES + 2);
  for (let i = 1; i < stop; i++) {
    if (lines[i].replace(/\r$/, '').trim() === '---') return { data: parseFields(lines.slice(1, i)), body: lines.slice(i + 1).join('\n'), hasFrontMatter: true };
  }
  return { data: {}, body: t, hasFrontMatter: false, error: 'front matter is not closed with --- within the first lines' };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v, maxItems = 20, maxLen = 80) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])
  .map((x) => cleanText(x, maxLen)).filter(Boolean).slice(0, maxItems);

// The page's metadata: always the same shape, whatever the file holds. `problems` names what a good page should have but lacks.
export function normalizeMeta(data, slug) {
  const problems = [];
  const title = cleanText(typeof data.title === 'string' ? data.title : '', 200);
  if (!title) problems.push('no title');
  const date = typeof data.date === 'string' && DATE.test(data.date) && !Number.isNaN(Date.parse(data.date)) ? data.date : null;
  if (!date) problems.push('no date (YYYY-MM-DD)');
  const summary = cleanText(typeof data.summary === 'string' ? data.summary : '', 500);
  if (!summary) problems.push('no summary');
  const apps = list(data.apps); const tags = list(data.tags, 30, 40);
  if (!apps.length) problems.push('no apps');
  if (!tags.length) problems.push('no tags');
  return { title: title || slug, date, apps, tags, summary, source: cleanText(typeof data.source === 'string' ? data.source : '', 200), problems };
}
