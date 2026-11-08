import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installNetguard } from '../src/netguard.js';
import { REPO_ROOT, modeFrom, parseSettings, realConfig } from '../src/config.js';
import { NOENV, get, getJson, page, post, rawHttp, rm, tempDir, withServer } from './helpers.js';

const realDir = () => tempDir({
  'full-notes.md': page({ title: 'Full unsanitized notes', apps: '[secret-app]', tags: '[internal]', summary: 'Only in Real.', body: '## Detail\n\nThe real hostname would be here.' }),
});

test('GET /api/health answers demo-health/1 with the app id and runtime offline in Mock', async () => {
  await withServer(async (url) => {
    const h = await getJson(url, '/api/health');
    assert.equal(h.schema, 'demo-health/1');
    assert.equal(h.state, 'ready');
    assert.equal(h.runtime, 'offline');
    assert.equal(h.demo.id, 'field-notes-lab');
    assert.equal((await post(url, '/api/health', {})).status, 405);
  });
});

test('Mock: info says mock, Real unavailable with a how-to; POST /api/mode real answers 409 and the mode stays mock', async () => {
  await withServer(async (url) => {
    const info = await getJson(url, '/api/info');
    assert.equal(info.source, 'mock');
    assert.equal(info.realAvailable, false);
    assert.match(info.realHint, /FIELD_NOTES_DIR/);
    assert.equal(info.pageCount, 2);
    const r = await post(url, '/api/mode', { source: 'real' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'real_not_configured');
    assert.equal((await getJson(url, '/api/info')).source, 'mock');
  });
});

test('POST /api/mode takes exactly { source: "mock"|"real" }', async () => {
  await withServer(async (url) => {
    for (const bad of [{}, { source: 'live' }, { source: 'mock', extra: 1 }, [], 'null', { source: ['mock'] }]) {
      assert.equal((await post(url, '/api/mode', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await post(url, '/api/mode', { source: 'mock' })).status, 200);
  });
});

test('Real configured: defaults to Real, switches both ways without a restart, and the data reloads with each switch', async () => {
  const dir = realDir();
  try {
    await withServer(async (url) => {
      let info = await getJson(url, '/api/info');
      assert.equal(info.source, 'real');
      assert.equal(info.realAvailable, true);
      assert.equal((await getJson(url, '/api/health')).runtime, 'live');
      let list = await getJson(url, '/api/pages');
      assert.deepEqual(list.pages.map((p) => p.slug), ['full-notes']);
      assert.equal((await post(url, '/api/mode', { source: 'mock' })).status, 200);
      list = await getJson(url, '/api/pages');
      assert.equal(list.source, 'mock');
      assert.ok(list.pages.some((p) => p.slug === 'privilege-mcp-audit-trail'));
      assert.ok(!list.pages.some((p) => p.slug === 'full-notes'));
      assert.equal((await get(url, '/api/pages/full-notes')).status, 404, 'a Real page is not reachable in Mock');
      assert.equal((await post(url, '/api/mode', { source: 'real' })).status, 200);
      info = await getJson(url, '/api/info');
      assert.equal(info.source, 'real');
      assert.equal((await getJson(url, '/api/pages/full-notes')).page.title, 'Full unsanitized notes');
      // a page dropped into the folder appears with no restart
      fs.writeFileSync(path.join(dir, 'dropped.md'), page({ title: 'Dropped in' }));
      assert.ok((await getJson(url, '/api/pages')).pages.some((p) => p.title === 'Dropped in'));
    }, { env: { ...NOENV, FIELD_NOTES_DIR: dir } });
  } finally { rm(dir); }
});

test('MODE=mock starts in Mock even when Real is configured; MODE=real without a folder refuses to start', () => {
  const dir = realDir();
  try {
    assert.equal(modeFrom({ ...NOENV, FIELD_NOTES_DIR: dir, MODE: 'mock' }, { file: false }), 'mock');
    assert.equal(modeFrom({ ...NOENV, FIELD_NOTES_DIR: dir }, { file: false }), 'real');
    assert.throws(() => modeFrom({ ...NOENV, MODE: 'real' }, { file: false }), /FIELD_NOTES_DIR/);
    assert.throws(() => modeFrom({ ...NOENV, MODE: 'hosted' }, { file: false }), /not available/);
  } finally { rm(dir); }
});

test('Real is refused off loopback, inside the repo, for a relative path or a missing folder; the hint never echoes the path', () => {
  const dir = realDir();
  try {
    const off = realConfig({ ...NOENV, FIELD_NOTES_DIR: dir, FIELD_NOTES_BIND: '0.0.0.0' }, { file: false });
    assert.equal(off.ok, false); assert.match(off.problem, /loopback/);
    const repo = realConfig({ ...NOENV, FIELD_NOTES_DIR: path.join(REPO_ROOT, 'pages') }, { file: false });
    assert.equal(repo.ok, false); assert.match(repo.problem, /inside this repo/);
    assert.equal(realConfig({ ...NOENV, FIELD_NOTES_DIR: 'relative/dir' }, { file: false }).ok, false);
    const missing = realConfig({ ...NOENV, FIELD_NOTES_DIR: '/nonexistent/notes-folder' }, { file: false });
    assert.equal(missing.ok, false);
    assert.doesNotMatch(missing.problem, /notes-folder/);
    assert.equal(realConfig({ ...NOENV, FIELD_NOTES_DIR: dir }, { file: false }).ok, true);
  } finally { rm(dir); }
});

test('settings file: FIELD_NOTES_DIR is read from STANDALONE_ENV, the environment wins, other names are ignored', () => {
  assert.deepEqual(parseSettings('OTHER=1\nexport FIELD_NOTES_DIR="/a b"\n'), { FIELD_NOTES_DIR: '/a b' });
  const dir = realDir(); const other = realDir();
  const file = path.join(dir, 'settings.env');
  fs.writeFileSync(file, `FIELD_NOTES_DIR=${dir}\n`);
  try {
    assert.equal(realConfig({ STANDALONE_ENV: file }).dir, fs.realpathSync(dir));
    assert.equal(realConfig({ STANDALONE_ENV: file, FIELD_NOTES_DIR: other }).dir, fs.realpathSync(other));
  } finally { rm(dir); rm(other); }
});

test('pages API: list with filters and search, one page, 404, bad slug 400, query cap', async () => {
  await withServer(async (url) => {
    const all = await getJson(url, '/api/pages');
    assert.equal(all.total, 2);
    assert.ok(all.facets.apps.some((a) => a.name === 'PingOne Privilege'));
    assert.deepEqual((await getJson(url, '/api/pages?tag=siem')).pages.map((p) => p.slug), ['privilege-mcp-audit-trail']);
    assert.deepEqual((await getJson(url, '/api/pages?app=field-notes-LAB')).pages.map((p) => p.slug), ['how-to-add-a-page']);
    assert.deepEqual((await getJson(url, '/api/pages?q=bridge')).pages.map((p) => p.slug), ['privilege-mcp-audit-trail']);
    assert.equal((await getJson(url, '/api/pages?q=zzz-no-such-text')).pages.length, 0);
    assert.equal((await get(url, `/api/pages?q=${'a'.repeat(201)}`)).status, 400);
    const one = await getJson(url, '/api/pages/how-to-add-a-page');
    assert.equal(one.page.title, 'How to add a page');
    assert.doesNotMatch(one.page.markdown, /^---/, 'front matter is not part of the body');
    assert.equal((await get(url, '/api/pages/nope')).status, 404);
    for (const bad of ['..%2F..%2Fpackage', '.env', 'a%00b', '..%5C..%5Cpackage']) assert.equal((await get(url, `/api/pages/${bad}`)).status, 400, bad);
    assert.equal((await get(url, '/api/pages/%2e%2e')).status, 404, 'fetch normalises it to /api/, which is no route');
    assert.equal((await get(url, '/api/pages/..%2Fserver%2Fpackage/raw')).status, 400);
  });
});

test('raw Markdown: the file as on disk, text/markdown, sandboxed, nosniff; ?download=1 is an attachment', async () => {
  await withServer(async (url) => {
    const r = await get(url, '/api/pages/how-to-add-a-page/raw');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/markdown; charset=utf-8/);
    assert.match(r.headers.get('content-security-policy'), /sandbox/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-disposition'), /^inline; filename="how-to-add-a-page\.md"/);
    assert.equal(await r.text(), fs.readFileSync(path.join(REPO_ROOT, 'pages/how-to-add-a-page.md'), 'utf8'));
    assert.match((await get(url, '/api/pages/how-to-add-a-page/raw?download=1')).headers.get('content-disposition'), /^attachment;/);
  });
});

test('hostile page in Real: served as data, never as HTML; an oversized page is listed as refused, not served', async () => {
  const hostile = page({ title: '<script>alert(1)</script>', summary: '"><img src=x onerror=alert(1)>', body: '<script>alert(2)</script>\n[x](javascript:alert(3))\n' + '>'.repeat(5000) + ' deep\n' });
  const dir = tempDir({ 'hostile.md': hostile, 'huge.md': 'x'.repeat(600 * 1024) });
  try {
    await withServer(async (url) => {
      const list = await getJson(url, '/api/pages');
      assert.deepEqual(list.pages.map((p) => p.slug), ['hostile']);
      assert.deepEqual(list.skipped.map((s) => s.name), ['huge.md']);
      const one = await get(url, '/api/pages/hostile');
      assert.match(one.headers.get('content-type'), /^application\/json/);
      assert.equal((await one.json()).page.title, '<script>alert(1)</script>', 'kept as text; the UI renders it inert');
      const raw = await get(url, '/api/pages/hostile/raw');
      assert.match(raw.headers.get('content-type'), /^text\/markdown/);
      assert.match(raw.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
      assert.equal((await get(url, '/api/pages/huge')).status, 404);
    }, { env: { ...NOENV, FIELD_NOTES_DIR: dir } });
  } finally { rm(dir); }
});

test('Host check and same-origin writes', async () => {
  await withServer(async (url) => {
    assert.equal((await rawHttp(`${url}/api/info`, { headers: { host: 'evil.example' } })).status, 403);
    assert.equal((await rawHttp(`${url}/api/info`, { headers: { host: 'localhost' } })).status, 200);
    assert.equal((await post(url, '/api/mode', { source: 'mock' }, { origin: 'http://evil.example' })).status, 403);
    assert.equal((await post(url, '/api/mode', { source: 'mock' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    // X-Forwarded-Host is client-controlled: a spoofed one naming the attacker's site does not make its Origin same-origin.
    assert.equal((await post(url, '/api/mode', { source: 'mock' }, { origin: 'http://evil.example', 'x-forwarded-host': 'evil.example' })).status, 403);
    // A forwarded loopback name is still honoured, so a local proxy keeps working.
    assert.equal((await post(url, '/api/mode', { source: 'mock' }, { origin: 'http://localhost:9999', 'x-forwarded-host': 'localhost:9999' })).status, 200);
    const r = await get(url, '/api/info');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  });
});

test('netguard: a whole session of API calls in both modes makes zero outbound attempts', async () => {
  const g = installNetguard();
  const dir = realDir();
  try {
    await withServer(async (url) => {
      for (const p of ['/api/health', '/api/info', '/api/pages', '/api/pages?q=x', '/api/pages/full-notes', '/api/pages/full-notes/raw', '/api/shelf']) assert.ok((await get(url, p)).status < 500, p);
      await post(url, '/api/mode', { source: 'mock' });
      for (const p of ['/api/pages', '/api/pages/privilege-mcp-audit-trail', '/api/pages/privilege-mcp-audit-trail/raw']) assert.equal((await get(url, p)).status, 200, p);
    }, { env: { ...NOENV, FIELD_NOTES_DIR: dir } });
    assert.deepEqual(g.attempts, []);
  } finally { g.restore(); rm(dir); }
});
