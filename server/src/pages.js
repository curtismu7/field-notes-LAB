// Reads a folder of pages. Only *.md files DIRECTLY in the folder, with a safe name; a symlink is followed only when its target is a
// regular file directly in the same folder (no escape, no subfolder). A file with more than one hard link is refused, since a hard link can
// reach a file outside the folder. Every page is size- and line-capped before it is parsed.
// Read on every request, so a page dropped into the folder shows up without a restart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontMatter, normalizeMeta } from './frontmatter.js';

export const MOCK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../pages');
export const LIMITS = Object.freeze({ maxBytes: 512 * 1024, maxPages: 500, maxLines: 20_000, maxQuery: 200 });

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.md$/;
export const isPageName = (n) => typeof n === 'string' && NAME.test(n) && !n.includes('..');
export const isSlug = (s) => typeof s === 'string' && isPageName(`${s}.md`);

class PageError extends Error { constructor(code, message) { super(message); this.code = code; } }

// The real path of one page file inside root (root already real), or a PageError. Never leaves root.
function resolvePageFile(root, name) {
  if (!isPageName(name)) throw new PageError('bad_name', 'not a page file name');
  const full = path.join(root, name);
  let st;
  try { st = fs.lstatSync(full); } catch { throw new PageError('not_found', 'no such page'); }
  let real = full;
  if (st.isSymbolicLink()) {
    try { real = fs.realpathSync(full); } catch { throw new PageError('bad_link', 'a broken symlink'); }
    if (path.dirname(real) !== root) throw new PageError('bad_link', 'a symlink that points outside the folder');
    st = fs.statSync(real);
  }
  if (!st.isFile()) throw new PageError('not_file', 'not a regular file');
  if (st.nlink > 1) throw new PageError('hard_link', 'a file with more than one hard link (it may live outside the folder)');
  if (st.size > LIMITS.maxBytes) throw new PageError('too_large', `larger than ${LIMITS.maxBytes} bytes`);
  return real;
}

function parsePage(root, name) {
  const file = resolvePageFile(root, name);
  const buf = fs.readFileSync(file);
  if (buf.length > LIMITS.maxBytes) throw new PageError('too_large', `larger than ${LIMITS.maxBytes} bytes`);
  if (buf.includes(0)) throw new PageError('not_text', 'not a text file');
  const text = buf.toString('utf8');
  const lines = text.split('\n').length;
  if (lines > LIMITS.maxLines) throw new PageError('too_many_lines', `more than ${LIMITS.maxLines} lines`);
  const slug = name.slice(0, -3);
  const fm = splitFrontMatter(text);
  const meta = normalizeMeta(fm.data, slug);
  if (fm.error) meta.problems.push(fm.error);
  return { slug, ...meta, bytes: buf.length, lines, body: fm.body, text };
}

const realRoot = (dir) => {
  const root = fs.realpathSync(dir);
  if (!fs.statSync(root).isDirectory()) throw new PageError('not_dir', 'not a folder');
  return root;
};

// All pages of a folder: { pages, skipped: [{ name, reason }] }. Non-.md files are ignored silently; a .md file that is refused is listed.
export function loadAll(dir) {
  const root = realRoot(dir);
  const pages = []; const skipped = [];
  const names = fs.readdirSync(root).filter((n) => n.toLowerCase().endsWith('.md')).sort();
  for (const name of names) {
    if (pages.length >= LIMITS.maxPages) { skipped.push({ name: name.slice(0, 120), reason: `more than ${LIMITS.maxPages} pages` }); continue; }
    try { pages.push(parsePage(root, name)); } catch (e) {
      if (!(e instanceof PageError)) throw e;
      if (e.code !== 'not_file') skipped.push({ name: isPageName(name) ? name : '(unsafe file name)', reason: e.message });
    }
  }
  return { pages, skipped };
}

// One page by slug, or null when it does not exist or is refused. Throws PageError('bad_name') for an unsafe slug.
export function loadOne(dir, slug) {
  if (!isSlug(slug)) throw new PageError('bad_name', 'not a page name');
  try { return parsePage(realRoot(dir), `${slug}.md`); } catch (e) { if (e instanceof PageError && e.code !== 'bad_name') return null; throw e; }
}

export const summaryOf = (p) => ({ slug: p.slug, title: p.title, date: p.date, apps: p.apps, tags: p.tags, summary: p.summary, source: p.source, bytes: p.bytes, problems: p.problems });

const facet = (pages, key) => {
  const counts = new Map();
  for (const p of pages) for (const v of p[key]) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

// Filter: app and tag are exact (case-insensitive) matches; q is a plain substring over title, summary, apps, tags and body (no regex,
// so no ReDoS). Newest first, then by title.
export function search(pages, { q = '', app = '', tag = '' } = {}) {
  const needle = String(q).slice(0, LIMITS.maxQuery).trim().toLowerCase();
  const a = String(app).toLowerCase(); const t = String(tag).toLowerCase();
  const hits = pages.filter((p) => (!a || p.apps.some((x) => x.toLowerCase() === a))
    && (!t || p.tags.some((x) => x.toLowerCase() === t))
    && (!needle || [p.title, p.summary, p.apps.join(' '), p.tags.join(' '), p.body].some((s) => s.toLowerCase().includes(needle))));
  hits.sort((x, y) => (y.date || '').localeCompare(x.date || '') || x.title.localeCompare(y.title));
  return { pages: hits.map(summaryOf), facets: { apps: facet(pages, 'apps'), tags: facet(pages, 'tags') } };
}

export { PageError };
