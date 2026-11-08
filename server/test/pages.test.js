import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter, normalizeMeta, parseFields } from '../src/frontmatter.js';
import { LIMITS, MOCK_DIR, isSlug, loadAll, loadOne, search } from '../src/pages.js';
import { page, rm, tempDir } from './helpers.js';

test('front matter: plain, quoted, inline-list and block-list values; unknown shapes ignored', () => {
  const { data, body, hasFrontMatter } = splitFrontMatter('---\ntitle: "Quoted: yes"\ndate: 2026-11-08\napps: [one, "two, three"]\ntags:\n  - a\n  - \'b\'\nnot a field\nsummary: plain # comment\n---\n# Body\n');
  assert.equal(hasFrontMatter, true);
  assert.deepEqual(data, { title: 'Quoted: yes', date: '2026-11-08', apps: ['one', 'two, three'], tags: ['a', 'b'], summary: 'plain' });
  assert.equal(body, '# Body\n');
});

test('front matter: none, unclosed, or BOM-prefixed', () => {
  assert.equal(splitFrontMatter('# Just a page').hasFrontMatter, false);
  const open = splitFrontMatter('---\ntitle: x\n# never closed');
  assert.equal(open.hasFrontMatter, false);
  assert.match(open.error, /not closed/);
  assert.equal(splitFrontMatter('﻿---\ntitle: b\n---\nx').data.title, 'b');
  assert.deepEqual(parseFields(['__proto__: x', 'constructor: y']).constructor, 'y'); // a plain key, never a prototype write
  assert.equal(Object.getPrototypeOf(parseFields(['__proto__: x'])), Object.prototype);
});

test('normalizeMeta: same shape always, control/bidi characters removed, caps applied, problems named', () => {
  const m = normalizeMeta({ title: 'a‮b\u0000c', date: '2026-13-45', apps: 'single', tags: [], summary: 'x'.repeat(900) }, 'slug');
  assert.equal(m.title, 'a b c');
  assert.equal(m.date, null);
  assert.deepEqual(m.apps, ['single']);
  assert.equal(m.summary.length, 500);
  assert.deepEqual(m.problems, ['no date (YYYY-MM-DD)', 'no tags']);
  assert.equal(normalizeMeta({}, 'fallback').title, 'fallback');
});

test('slugs: only safe names, no traversal, no separators, no hidden files', () => {
  for (const ok of ['a', 'how-to-add-a-page', 'v1.2_notes']) assert.ok(isSlug(ok), ok);
  for (const bad of ['', '../x', '..', 'a/b', 'a\\b', '.hidden', 'a..b', 'x'.repeat(130), 'a b', '%2e%2e', 'a\u0000']) assert.ok(!isSlug(bad), JSON.stringify(bad));
});

test('the shipped pages load, have complete front matter and the audit-trail page keeps its findings', () => {
  const { pages, skipped } = loadAll(MOCK_DIR);
  assert.deepEqual(skipped, []);
  assert.deepEqual(pages.map((p) => p.slug).sort(), ['how-to-add-a-page', 'privilege-mcp-audit-trail']);
  for (const p of pages) assert.deepEqual(p.problems, [], p.slug);
  const audit = pages.find((p) => p.slug === 'privilege-mcp-audit-trail');
  assert.deepEqual(audit.apps, ['privilege-logging-LAB', 'PingOne Privilege']);
  assert.deepEqual(audit.tags, ['logging', 'siem', 'elasticsearch', 'audit', 'requirement-9']);
  assert.equal(audit.date, '2026-11-08');
  assert.equal(audit.source, 'owner findings, sanitized');
  for (const fact of ['204 runtime events', '37 decision and 531 AI Guard records', '1,397', '1,953 documents', '17 agent keys', 'policy-decision-log', 'ping-siem-events-v2', 'gateway.example.invalid', 'console.example.invalid']) assert.ok(audit.body.includes(fact), fact);
});

test('a folder: only *.md directly in it; subfolders, other files, bad names, too large, too many lines and NUL bytes are refused', () => {
  const dir = tempDir({ 'good.md': page(), 'notes.txt': 'x', 'bad name.md': page(), 'big.md': 'x'.repeat(LIMITS.maxBytes + 1), 'lines.md': '\n'.repeat(LIMITS.maxLines + 1), 'bin.md': 'a\u0000b' });
  fs.mkdirSync(path.join(dir, 'sub')); fs.writeFileSync(path.join(dir, 'sub', 'deep.md'), page());
  fs.mkdirSync(path.join(dir, 'folder.md'));
  try {
    const { pages, skipped } = loadAll(dir);
    assert.deepEqual(pages.map((p) => p.slug), ['good']);
    assert.deepEqual(skipped.map((s) => [s.name, s.reason]).sort(), [
      ['(unsafe file name)', 'not a page file name'], ['big.md', `larger than ${LIMITS.maxBytes} bytes`], ['bin.md', 'not a text file'], ['lines.md', `more than ${LIMITS.maxLines} lines`],
    ]);
    assert.equal(loadOne(dir, 'deep'), null);
    assert.equal(loadOne(dir, 'big'), null);
    assert.throws(() => loadOne(dir, '../good'), /not a page name/);
  } finally { rm(dir); }
});

test('symlinks: one to a page in the same folder is followed; one escaping the folder or into a subfolder is refused', () => {
  const outside = tempDir({ 'secret.md': page({ title: 'outside' }) });
  const dir = tempDir({ 'real.md': page({ title: 'real' }) });
  fs.mkdirSync(path.join(dir, 'sub')); fs.writeFileSync(path.join(dir, 'sub', 'inner.md'), page());
  fs.symlinkSync(path.join(dir, 'real.md'), path.join(dir, 'alias.md'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(dir, 'escape.md'));
  fs.symlinkSync(path.join(dir, 'sub', 'inner.md'), path.join(dir, 'down.md'));
  fs.symlinkSync('/nonexistent/x.md', path.join(dir, 'broken.md'));
  try {
    const { pages, skipped } = loadAll(dir);
    assert.deepEqual(pages.map((p) => p.slug), ['alias', 'real']);
    assert.deepEqual(skipped.map((s) => s.name).sort(), ['broken.md', 'down.md', 'escape.md']);
    assert.equal(loadOne(dir, 'escape'), null);
    assert.ok(!JSON.stringify(pages).includes('outside'));
  } finally { rm(dir); rm(outside); }
});

test('hard links: a page with a second hard link (for example to a file outside the folder) is refused, in the list and by slug', () => {
  const outside = tempDir({ 'secret.md': page({ title: 'outside secret' }) });
  const dir = tempDir({ 'plain.md': page({ title: 'plain' }) });
  fs.linkSync(path.join(outside, 'secret.md'), path.join(dir, 'hardlink.md'));
  try {
    const { pages, skipped } = loadAll(dir);
    assert.deepEqual(pages.map((p) => p.slug), ['plain']);
    assert.deepEqual(skipped.map((s) => s.name), ['hardlink.md']);
    assert.match(skipped[0].reason, /hard link/);
    assert.equal(loadOne(dir, 'hardlink'), null);
    assert.ok(!JSON.stringify(pages).includes('outside secret'));
  } finally { rm(dir); rm(outside); }
});

test('search: plain substring (regex characters are literal), exact app/tag filters, newest first, facets over all pages', () => {
  const pages = [
    { slug: 'a', title: 'Alpha', date: '2026-01-01', apps: ['App1'], tags: ['x'], summary: '', source: '', bytes: 1, problems: [], body: 'needle (.*)+ here' },
    { slug: 'b', title: 'Beta', date: '2026-02-01', apps: ['App2'], tags: ['x', 'y'], summary: 'needle', source: '', bytes: 1, problems: [], body: '' },
    { slug: 'c', title: 'Gamma', date: null, apps: ['App1'], tags: ['y'], summary: '', source: '', bytes: 1, problems: [], body: '' },
  ];
  assert.deepEqual(search(pages, { q: 'NEEDLE' }).pages.map((p) => p.slug), ['b', 'a']);
  assert.deepEqual(search(pages, { q: '(.*)+' }).pages.map((p) => p.slug), ['a']);
  assert.deepEqual(search(pages, { app: 'app1' }).pages.map((p) => p.slug), ['a', 'c']);
  assert.deepEqual(search(pages, { tag: 'y', app: 'App1' }).pages.map((p) => p.slug), ['c']);
  assert.deepEqual(search(pages, { app: 'App' }).pages, []);
  const { facets } = search(pages, { q: 'nothing matches' });
  assert.deepEqual(facets.apps, [{ name: 'App1', count: 2 }, { name: 'App2', count: 1 }]);
  assert.equal(search(pages).pages[0].body, undefined, 'summaries carry no body');
});
